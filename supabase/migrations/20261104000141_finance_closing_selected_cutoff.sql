begin;
alter table public.finance_closings add column bank_cutoff_exclusive boolean not null default false;
comment on column public.finance_closings.bank_cutoff_exclusive is 'Cierres por fecha seleccionada: el límite superior es exclusivo. Los cierres anteriores conservan límite inclusivo.';

CREATE OR REPLACE FUNCTION public.finance_bank_movement_between(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(case_collections_gtq numeric, declaration_collections_gtq numeric, total_collections_gtq numeric, general_expenses_gtq numeric, supplier_payments_gtq numeric, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_org uuid; v_case numeric:=0; v_declarations numeric:=0; v_expenses numeric:=0; v_suppliers numeric:=0; v_customs numeric:=0; v_lower_inclusive boolean:=false;
BEGIN
 PERFORM public.assert_finance_admin();
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=auth.uid();
 IF v_org IS NULL THEN v_org:=public.current_organization_id_v3821(); END IF;
 IF v_org IS NULL THEN RAISE EXCEPTION 'No fue posible determinar la organización financiera.'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from THEN RAISE EXCEPTION 'Rango técnico bancario inválido.'; END IF;
 SELECT coalesce(bool_or(c.bank_cutoff_exclusive),false) INTO v_lower_inclusive FROM public.finance_closings c WHERE c.organization_id=v_org AND c.status='ACTIVE' AND c.bank_cutoff_to=p_from;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_case FROM public.finance_case_payments x WHERE x.organization_id=v_org AND x.money_account='BANK' AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_declarations FROM public.declaration_service_payments x WHERE x.organization_id=v_org AND x.money_account='BANK' AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_expenses FROM public.finance_expenses x WHERE x.organization_id=v_org AND x.money_account='BANK' AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 SELECT COALESCE(SUM(pp.amount_gtq),0) INTO v_suppliers FROM public.finance_accounts_payable_payments pp JOIN public.finance_accounts_payable ap ON ap.id=pp.payable_id WHERE (ap.organization_id=v_org OR ap.organization_id IS NULL) AND pp.money_account='BANK' AND (pp.created_at>p_from OR (v_lower_inclusive AND pp.created_at=p_from)) AND pp.created_at<p_to;
 SELECT COALESCE(SUM(x.amount_gtq),0) INTO v_customs FROM public.finance_customs_bank_outflows_v3991814 x WHERE x.organization_id=v_org AND (x.created_at>p_from OR (v_lower_inclusive AND x.created_at=p_from)) AND x.created_at<p_to;
 RETURN QUERY SELECT v_case,v_declarations,v_case+v_declarations,v_expenses,v_suppliers,v_expenses+v_suppliers+v_customs,(v_case+v_declarations)-(v_expenses+v_suppliers+v_customs);
END;
$function$;

CREATE OR REPLACE FUNCTION eyr_finance_private.preview_closing_at(p_from date,p_to date)
 RETURNS TABLE(checkpoint_mode text, reconciliation_id uuid, cutoff_from timestamp with time zone, cutoff_to timestamp with time zone, opening_bank_gtq numeric, case_collections_count bigint, case_collections_gtq numeric, declaration_collections_count bigint, declaration_collections_gtq numeric, total_collections_count bigint, total_collections_gtq numeric, general_expenses_count bigint, general_expenses_gtq numeric, supplier_payments_count bigint, supplier_payments_gtq numeric, total_bank_outflows_count bigint, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric, projected_bank_balance_gtq numeric, pending_commitments_gtq numeric, projected_available_bank_gtq numeric, calculated_at timestamp with time zone, selected_from date, selected_to date, customs_outflows_count bigint, customs_outflows_gtq numeric, cutoff_is_day_end boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_org uuid;

    v_reconciliation record;
    v_previous_checkpoint record;
    v_bank_move record;

    v_mode text;

    v_from timestamptz;
    v_to timestamptz;
    v_recorded_at timestamptz := clock_timestamp();
    v_selected_from date;
    v_lower_inclusive boolean := false;
    v_customs_count bigint := 0;

    v_opening numeric := 0;
    v_projected numeric := 0;

    v_pending numeric := 0;

    v_case_count bigint := 0;
    v_declaration_count bigint := 0;
    v_expense_count bigint := 0;
    v_supplier_count bigint := 0;

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


    if auth.uid() is null or not exists(select 1 from public.organizations o where o.id=v_org and o.active) then
      raise exception 'Organización financiera no autorizada' using errcode='42501';
    end if;
    if p_to is null or p_to>(v_recorded_at at time zone 'America/Guatemala')::date or (p_from is not null and p_from>p_to) then
      raise exception 'Seleccioná un período válido, sin fechas finales futuras.';
    end if;
    v_to:=least(v_recorded_at,((p_to+1)::timestamp at time zone 'America/Guatemala'));

    -- ========================================================
    -- CONCILIACIÓN ACTIVA
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


    -- ========================================================
    -- ÚLTIMO CHECKPOINT REAL
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
    -- DETERMINAR PUNTO DE PARTIDA
    -- Misma regla que create_finance_closing()
    -- ========================================================

    if v_previous_checkpoint.id is not null
       and v_previous_checkpoint.bank_cutoff_to
           >= v_reconciliation.effective_at
    then

        v_mode := 'PREVIOUS_CLOSING';

        v_from :=
            v_previous_checkpoint.bank_cutoff_to;

        v_opening :=
            coalesce(
                v_previous_checkpoint.closing_cash_gtq,
                0
            );

    else

        v_mode := 'RECONCILIATION';

        v_from :=
            v_reconciliation.effective_at;

        v_opening :=
            coalesce(
                v_reconciliation.balance_gtq,
                0
            );

    end if;


    v_selected_from:=coalesce(p_from,case when v_mode='PREVIOUS_CLOSING' then v_previous_checkpoint.period_end+1 else (v_reconciliation.effective_at at time zone 'America/Guatemala')::date end);
    if v_selected_from>p_to then raise exception 'No hay un período abierto para las fechas seleccionadas.';end if;
    if exists(select 1 from public.finance_closings c where c.organization_id=v_org and c.status='ACTIVE' and c.bank_cutoff_to is not null
      and daterange(c.period_start,c.period_end,'[]') && daterange(v_selected_from,p_to,'[]')) then
      raise exception 'El período seleccionado se superpone con un cierre activo.';
    end if;
    v_lower_inclusive:=v_mode='PREVIOUS_CLOSING' and coalesce(v_previous_checkpoint.bank_cutoff_exclusive,false);

    if v_to <= v_from then
        raise exception
            'No existe una ventana bancaria válida para previsualizar.';
    end if;


    -- ========================================================
    -- MISMO MOTOR MONETARIO DEL CIERRE REAL
    -- ========================================================

    select *
      into v_bank_move
    from public.finance_bank_movement_between(
        v_from,
        v_to
    );


    -- ========================================================
    -- CONTADORES
    -- Únicamente BANK y dentro de la misma ventana.
    -- ========================================================

    select count(*)
      into v_case_count
    from public.finance_case_payments x
    where x.organization_id = v_org
      and x.money_account = 'BANK'
      and (x.created_at > v_from or (v_lower_inclusive and x.created_at=v_from))
      and x.created_at < v_to;


    select count(*)
      into v_declaration_count
    from public.declaration_service_payments x
    where x.organization_id = v_org
      and x.money_account = 'BANK'
      and (x.created_at > v_from or (v_lower_inclusive and x.created_at=v_from))
      and x.created_at < v_to;


    select count(*)
      into v_expense_count
    from public.finance_expenses x
    where x.organization_id = v_org
      and x.money_account = 'BANK'
      and (x.created_at > v_from or (v_lower_inclusive and x.created_at=v_from))
      and x.created_at < v_to;


    select count(*)
      into v_supplier_count
    from public.finance_accounts_payable_payments pp
    join public.finance_accounts_payable ap
      on ap.id = pp.payable_id
    where (
            ap.organization_id = v_org
            or ap.organization_id is null
          )
      and pp.money_account = 'BANK'
      and (pp.created_at > v_from or (v_lower_inclusive and pp.created_at=v_from))
      and pp.created_at < v_to;


    -- ========================================================
    -- SALDO PROYECTADO
    -- ========================================================

    select count(*) into v_customs_count from public.finance_customs_bank_outflows_v3991814 x where x.organization_id=v_org
      and (x.created_at>v_from or (v_lower_inclusive and x.created_at=v_from)) and x.created_at<v_to;

    v_projected :=
        v_opening
        + coalesce(
            v_bank_move.net_bank_movement_gtq,
            0
        );


    -- ========================================================
    -- COMPROMISOS PENDIENTES AL MOMENTO DEL PREVIEW
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
                          and pp.created_at < v_to
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
      and ap.created_at < v_to;


    -- ========================================================
    -- RESULTADO
    -- ========================================================

    return query
    select
        v_mode,

        v_reconciliation.id,

        v_from,
        v_to,

        v_opening,

        v_case_count,
        coalesce(
            v_bank_move.case_collections_gtq,
            0
        ),

        v_declaration_count,
        coalesce(
            v_bank_move.declaration_collections_gtq,
            0
        ),

        v_case_count + v_declaration_count,
        coalesce(
            v_bank_move.total_collections_gtq,
            0
        ),

        v_expense_count,
        coalesce(
            v_bank_move.general_expenses_gtq,
            0
        ),

        v_supplier_count,
        coalesce(
            v_bank_move.supplier_payments_gtq,
            0
        ),

        v_expense_count + v_supplier_count + v_customs_count,
        coalesce(
            v_bank_move.total_bank_outflows_gtq,
            0
        ),

        coalesce(
            v_bank_move.net_bank_movement_gtq,
            0
        ),

        v_projected,

        v_pending,

        v_projected - v_pending,
        v_recorded_at,v_selected_from,p_to,v_customs_count,
        coalesce(v_bank_move.total_bank_outflows_gtq,0)-coalesce(v_bank_move.general_expenses_gtq,0)-coalesce(v_bank_move.supplier_payments_gtq,0),
        v_to<v_recorded_at;

end;
$function$;

revoke all on function eyr_finance_private.preview_closing_at(date,date) from public,anon,authenticated;grant execute on function eyr_finance_private.preview_closing_at(date,date) to authenticated;

CREATE FUNCTION public.finance_next_closing_preview(p_from date,p_to date) RETURNS TABLE(checkpoint_mode text, reconciliation_id uuid, cutoff_from timestamp with time zone, cutoff_to timestamp with time zone, opening_bank_gtq numeric, case_collections_count bigint, case_collections_gtq numeric, declaration_collections_count bigint, declaration_collections_gtq numeric, total_collections_count bigint, total_collections_gtq numeric, general_expenses_count bigint, general_expenses_gtq numeric, supplier_payments_count bigint, supplier_payments_gtq numeric, total_bank_outflows_count bigint, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric, projected_bank_balance_gtq numeric, pending_commitments_gtq numeric, projected_available_bank_gtq numeric, calculated_at timestamp with time zone, selected_from date, selected_to date, customs_outflows_count bigint, customs_outflows_gtq numeric, cutoff_is_day_end boolean) LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$select * from eyr_finance_private.preview_closing_at(p_from,p_to);$$;

CREATE OR REPLACE FUNCTION public.finance_next_closing_preview() RETURNS TABLE(checkpoint_mode text, reconciliation_id uuid, cutoff_from timestamp with time zone, cutoff_to timestamp with time zone, opening_bank_gtq numeric, case_collections_count bigint, case_collections_gtq numeric, declaration_collections_count bigint, declaration_collections_gtq numeric, total_collections_count bigint, total_collections_gtq numeric, general_expenses_count bigint, general_expenses_gtq numeric, supplier_payments_count bigint, supplier_payments_gtq numeric, total_bank_outflows_count bigint, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric, projected_bank_balance_gtq numeric, pending_commitments_gtq numeric, projected_available_bank_gtq numeric) LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$select p.checkpoint_mode,p.reconciliation_id,p.cutoff_from,p.cutoff_to,p.opening_bank_gtq,p.case_collections_count,p.case_collections_gtq,p.declaration_collections_count,p.declaration_collections_gtq,p.total_collections_count,p.total_collections_gtq,p.general_expenses_count,p.general_expenses_gtq,p.supplier_payments_count,p.supplier_payments_gtq,p.total_bank_outflows_count,p.total_bank_outflows_gtq,p.net_bank_movement_gtq,p.projected_bank_balance_gtq,p.pending_commitments_gtq,p.projected_available_bank_gtq from eyr_finance_private.preview_closing_at(null,(now() at time zone 'America/Guatemala')::date) p;$$;

revoke all on function public.finance_next_closing_preview(date,date),public.finance_next_closing_preview() from public,anon;grant execute on function public.finance_next_closing_preview(date,date),public.finance_next_closing_preview() to authenticated;

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
    v_recorded_at timestamptz;

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

    v_recorded_at:=clock_timestamp();
    if p_to>(v_recorded_at at time zone 'America/Guatemala')::date then
      raise exception 'La fecha final del cierre no puede ser futura.';
    end if;
    v_cutoff_to:=least(v_recorded_at,((p_to+1)::timestamp at time zone 'America/Guatemala'));

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
                          and pp.created_at < v_cutoff_to
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
      and ap.created_at < v_cutoff_to;


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
        bank_cutoff_exclusive,
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
        v_recorded_at,

        v_checkpoint_mode,
        v_cutoff_from,
        v_cutoff_to,
        true,
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
$function$;

commit;
