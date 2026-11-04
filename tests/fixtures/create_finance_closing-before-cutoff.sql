CREATE OR REPLACE FUNCTION public.create_finance_closing(p_type text, p_from date, p_to date, p_opening_cash numeric DEFAULT 0)
 RETURNS TABLE(id uuid, closing_code text, closing_cash_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_org uuid;

    v_reconciliation record;
    v_previous_checkpoint record;
    v_previous_active record;
    v_bank_move record;
    v_summary record;

    v_cutoff_from timestamptz;
    v_cutoff_to timestamptz;

    v_opening numeric := 0;
    v_closing numeric := 0;
    v_pending numeric := 0;
    v_available numeric := 0;

    v_checkpoint_mode text;
    v_next_number integer := 1;
    v_code text;

    v_new_id uuid;

begin

    -- ========================================================
    -- SEGURIDAD
    -- ========================================================

    perform public.assert_finance_admin();

    select p.organization_id
      into v_org
    from public.profiles p
    where p.id = auth.uid();

    if v_org is null then
        v_org := public.current_organization_id_v3821();
    end if;

    if v_org is null then
        raise exception
            'No fue posible determinar la organización financiera.';
    end if;


    -- ========================================================
    -- V39.9.18.10F.5
    -- BLOQUEO ANTI-DOBLE-CIERRE
    --
    -- Dos solicitudes de cierre de la misma organización
    -- no pueden calcular el checkpoint simultáneamente.
    -- ========================================================

    perform pg_advisory_xact_lock(
        hashtextextended(
            'finance_closing:' || v_org::text,
            0
        )
    );


    -- ========================================================
    -- VALIDACIONES
    -- ========================================================

    if p_type not in ('QUINCENAL', 'MENSUAL') then
        raise exception
            'Tipo de cierre no válido: %',
            p_type;
    end if;

    if p_from is null or p_to is null then
        raise exception
            'El período del cierre es obligatorio.';
    end if;

    if p_from > p_to then
        raise exception
            'La fecha inicial no puede ser posterior a la fecha final.';
    end if;


    -- ========================================================
    -- CONCILIACIÓN BANCARIA ACTIVA
    -- ========================================================

    select r.*
      into v_reconciliation
    from public.finance_bank_reconciliations r
    where r.organization_id = v_org
      and r.status = 'ACTIVE'
    order by
        r.effective_at desc,
        r.created_at desc
    limit 1;

    if v_reconciliation.id is null then
        raise exception
            'No existe una conciliación bancaria activa.';
    end if;


    -- No permitimos un período completamente anterior
    -- al inicio del nuevo control bancario.

    if p_to <
       (v_reconciliation.effective_at at time zone 'America/Guatemala')::date
    then
        raise exception
            'El período seleccionado termina antes de la conciliación bancaria activa.';
    end if;


    -- ========================================================
    -- ÚLTIMO CIERRE ACTIVO
    -- Incluye cierres históricos únicamente para auditoría /
    -- previous_closing_id. NO lo usamos como apertura bancaria
    -- si no tiene bank_cutoff_to.
    -- ========================================================

    select c.*
      into v_previous_active
    from public.finance_closings c
    where c.organization_id = v_org
      and c.status = 'ACTIVE'
    order by
        c.closed_at desc nulls last,
        c.created_at desc
    limit 1;


    -- ========================================================
    -- ÚLTIMO CHECKPOINT DEL MOTOR NUEVO
    -- ========================================================

    select c.*
      into v_previous_checkpoint
    from public.finance_closings c
    where c.organization_id = v_org
      and c.status = 'ACTIVE'
      and c.bank_cutoff_to is not null
    order by
        c.bank_cutoff_to desc,
        c.created_at desc
    limit 1;


    -- ========================================================
    -- EVITAR SOLAPAMIENTO CONTABLE ENTRE CIERRES NUEVOS
    -- Los cierres históricos no bloquean el nuevo motor.
    -- ========================================================

    if exists (
        select 1
        from public.finance_closings c
        where c.organization_id = v_org
          and c.status = 'ACTIVE'
          and c.bank_cutoff_to is not null
          and daterange(
                c.period_start,
                c.period_end,
                '[]'
              )
              &&
              daterange(
                p_from,
                p_to,
                '[]'
              )
    ) then
        raise exception
            'El período seleccionado se superpone con un cierre activo del nuevo control financiero.';
    end if;


    -- ========================================================
    -- PUNTO DE PARTIDA BANCARIO
    -- ========================================================

    if v_previous_checkpoint.id is not null
       and v_previous_checkpoint.bank_cutoff_to
           >= v_reconciliation.effective_at
    then

        v_checkpoint_mode := 'PREVIOUS_CLOSING';

        v_cutoff_from :=
            v_previous_checkpoint.bank_cutoff_to;

        v_opening :=
            coalesce(
                v_previous_checkpoint.closing_cash_gtq,
                0
            );

    else

        v_checkpoint_mode := 'RECONCILIATION';

        v_cutoff_from :=
            v_reconciliation.effective_at;

        v_opening :=
            coalesce(
                v_reconciliation.balance_gtq,
                0
            );

    end if;


    -- El parámetro p_opening_cash se conserva por compatibilidad
    -- con el frontend antiguo, pero NO gobierna el cálculo.

    v_cutoff_to := clock_timestamp();

    if v_cutoff_to <= v_cutoff_from then
        raise exception
            'No existe una ventana bancaria válida para generar el cierre.';
    end if;


    -- ========================================================
    -- MOVIMIENTOS BANK
    -- ========================================================

    select *
      into v_bank_move
    from public.finance_bank_movement_between(
        v_cutoff_from,
        v_cutoff_to
    );


    v_closing :=
        v_opening
        + coalesce(
            v_bank_move.net_bank_movement_gtq,
            0
        );


    -- ========================================================
    -- COMPROMISOS PENDIENTES AL CORTE
    -- No reducen el saldo bancario.
    -- Sí reducen el disponible no comprometido.
    -- ========================================================

    select coalesce(
        sum(
            greatest(
                coalesce(ap.original_amount_gtq, 0)
                -
                coalesce(
                    (
                        select sum(pp.amount_gtq)
                        from public.finance_accounts_payable_payments pp
                        where pp.payable_id = ap.id
                          and pp.created_at <= v_cutoff_to
                    ),
                    0
                ),
                0
            )
        ),
        0
    )
      into v_pending
    from public.finance_accounts_payable ap
    where (
            ap.organization_id = v_org
            or ap.organization_id is null
          )
      and ap.created_at <= v_cutoff_to;


    v_available :=
        v_closing - v_pending;


    -- ========================================================
    -- SNAPSHOT CONTABLE DEL PERÍODO
    -- Se mantiene separado del flujo BANK.
    -- ========================================================

    select *
      into v_summary
    from public.finance_period_summary(
        p_from,
        p_to
    );


    -- ========================================================
    -- V39.9.18.10F.5
    -- CORRELATIVO SEGURO
    --
    -- FIN-2026-0001 -> 1
    -- FIN-2026-0002 -> 2
    -- próximo       -> FIN-2026-0003
    --
    -- IMPORTANTE:
    -- Ya no extraemos "20260001".
    -- Solo tomamos los dígitos posteriores al último guion.
    -- ========================================================

    select
        coalesce(
            max(
                case
                    when c.closing_code ~
                         ('^FIN-' ||
                          extract(year from p_to)::integer ||
                          '-[0-9]+$')
                    then
                        substring(
                            c.closing_code
                            from '([0-9]+)$'
                        )::integer
                    else null
                end
            ),
            0
        ) + 1
      into v_next_number
    from public.finance_closings c
    where c.organization_id = v_org;


    v_code :=
        'FIN-' ||
        extract(year from p_to)::integer ||
        '-' ||
        lpad(v_next_number::text, 4, '0');


    -- Defensa adicional ante cualquier correlativo existente.

    if exists (
        select 1
        from public.finance_closings c
        where c.organization_id = v_org
          and c.closing_code = v_code
    ) then
        raise exception
            'El correlativo de cierre % ya existe. No se generó ningún cierre.',
            v_code;
    end if;


    -- ========================================================
    -- INSERT DEL CHECKPOINT
    -- ========================================================

    insert into public.finance_closings (
        organization_id,
        closing_code,
        closing_type,
        period_start,
        period_end,

        opening_cash_gtq,
        closing_cash_gtq,

        billed_gtq,
        collected_gtq,
        receivable_gtq,
        direct_costs_gtq,
        gross_profit_gtq,
        general_expenses_gtq,
        net_result_gtq,
        freight_net_profit_gtq,

        supplier_payments_gtq,
        duca_accrued_cost_gtq,
        cash_direct_outflows_gtq,

        status,
        previous_closing_id,
        closed_at,

        bank_checkpoint_mode,
        bank_cutoff_from,
        bank_cutoff_to,
        bank_reconciliation_id,

        bank_collections_gtq,
        bank_outflows_gtq,
        pending_commitments_gtq,
        available_bank_gtq
    )
    values (
        v_org,
        v_code,
        p_type,
        p_from,
        p_to,

        v_opening,
        v_closing,

        coalesce(v_summary.billed_gtq, 0),
        coalesce(v_summary.collected_gtq, 0),
        coalesce(v_summary.receivable_gtq, 0),
        coalesce(v_summary.direct_costs_gtq, 0),
        coalesce(v_summary.gross_profit_gtq, 0),
        coalesce(v_summary.general_expenses_gtq, 0),
        coalesce(v_summary.net_result_gtq, 0),
        coalesce(v_summary.net_result_gtq,0)-coalesce(v_summary.gross_profit_gtq,0)+coalesce(v_summary.general_expenses_gtq,0),

        coalesce(v_summary.supplier_payments_gtq, 0),
        coalesce(v_summary.duca_accrued_cost_gtq, 0),

        -- Campo legacy.
        -- Para cierres nuevos guarda salidas BANK reales
        -- y NO costos devengados.
        coalesce(v_bank_move.total_bank_outflows_gtq, 0),

        'ACTIVE',
        v_previous_active.id,
        v_cutoff_to,

        v_checkpoint_mode,
        v_cutoff_from,
        v_cutoff_to,
        v_reconciliation.id,

        coalesce(v_bank_move.total_collections_gtq, 0),
        coalesce(v_bank_move.total_bank_outflows_gtq, 0),
        v_pending,
        v_available
    )
    returning finance_closings.id
      into v_new_id;


    -- ========================================================
    -- RESPUESTA COMPATIBLE CON EL FRONTEND
    -- ========================================================

    return query
    select
        v_new_id,
        v_code,
        v_closing;

end;
$function$
