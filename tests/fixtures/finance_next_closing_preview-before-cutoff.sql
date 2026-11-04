CREATE OR REPLACE FUNCTION public.finance_next_closing_preview()
 RETURNS TABLE(checkpoint_mode text, reconciliation_id uuid, cutoff_from timestamp with time zone, cutoff_to timestamp with time zone, opening_bank_gtq numeric, case_collections_count bigint, case_collections_gtq numeric, declaration_collections_count bigint, declaration_collections_gtq numeric, total_collections_count bigint, total_collections_gtq numeric, general_expenses_count bigint, general_expenses_gtq numeric, supplier_payments_count bigint, supplier_payments_gtq numeric, total_bank_outflows_count bigint, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric, projected_bank_balance_gtq numeric, pending_commitments_gtq numeric, projected_available_bank_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_org uuid;

    v_reconciliation record;
    v_previous_checkpoint record;
    v_bank_move record;

    v_mode text;

    v_from timestamptz;
    v_to timestamptz := clock_timestamp();

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
      and x.created_at > v_from
      and x.created_at <= v_to;


    select count(*)
      into v_declaration_count
    from public.declaration_service_payments x
    where x.organization_id = v_org
      and x.money_account = 'BANK'
      and x.created_at > v_from
      and x.created_at <= v_to;


    select count(*)
      into v_expense_count
    from public.finance_expenses x
    where x.organization_id = v_org
      and x.money_account = 'BANK'
      and x.created_at > v_from
      and x.created_at <= v_to;


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
      and pp.created_at > v_from
      and pp.created_at <= v_to;


    -- ========================================================
    -- SALDO PROYECTADO
    -- ========================================================

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
                          and pp.created_at <= v_to
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
      and ap.created_at <= v_to;


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

        v_expense_count + v_supplier_count,
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

        v_projected - v_pending;

end;
$function$
