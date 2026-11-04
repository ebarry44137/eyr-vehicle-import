CREATE OR REPLACE FUNCTION public.finance_bank_dashboard()
 RETURNS TABLE(reconciliation_id uuid, reconciliation_type text, reconciliation_effective_at timestamp with time zone, reconciliation_balance_gtq numeric, case_collections_gtq numeric, declaration_collections_gtq numeric, total_collections_gtq numeric, general_expenses_gtq numeric, supplier_payments_gtq numeric, total_bank_outflows_gtq numeric, net_bank_movement_gtq numeric, calculated_bank_balance_gtq numeric, pending_commitments_gtq numeric, available_bank_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_org uuid;
    v_rec record;

    v_case_collections numeric := 0;
    v_declaration_collections numeric := 0;

    v_expenses numeric := 0;
    v_supplier_payments numeric := 0;
    v_customs_outflows numeric := 0;

    v_collections numeric := 0;
    v_outflows numeric := 0;

    v_net numeric := 0;
    v_bank numeric := 0;

    v_commitments numeric := 0;
begin
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


    -- Última conciliación bancaria activa.
    select
        r.id,
        r.reconciliation_type,
        r.effective_at,
        r.balance_gtq
    into v_rec
    from public.finance_bank_reconciliations r
    where r.organization_id = v_org
      and r.status = 'ACTIVE'
    order by
        r.effective_at desc,
        r.created_at desc
    limit 1;

    if v_rec.id is null then
        raise exception
            'No existe una conciliación bancaria activa.';
    end if;


    -- ========================================================
    -- ENTRADAS BANCARIAS
    -- Únicamente money_account = BANK
    -- ========================================================

    select coalesce(sum(p.amount_gtq), 0)
    into v_case_collections
    from public.finance_case_payments p
    where p.organization_id = v_org
      and p.created_at > v_rec.effective_at
      and p.money_account = 'BANK';


    select coalesce(sum(p.amount_gtq), 0)
    into v_declaration_collections
    from public.declaration_service_payments p
    where p.organization_id = v_org
      and p.created_at > v_rec.effective_at
      and p.money_account = 'BANK';


    -- ========================================================
    -- SALIDAS BANCARIAS
    -- Únicamente money_account = BANK
    -- ========================================================

    select coalesce(sum(e.amount_gtq), 0)
    into v_expenses
    from public.finance_expenses e
    where e.organization_id = v_org
      and e.created_at > v_rec.effective_at
      and e.money_account = 'BANK';


    select coalesce(sum(pp.amount_gtq), 0)
    into v_supplier_payments
    from public.finance_accounts_payable_payments pp
    join public.finance_accounts_payable ap
      on ap.id = pp.payable_id
    where (
            ap.organization_id = v_org
            or ap.organization_id is null
          )
      and pp.created_at > v_rec.effective_at
      and pp.money_account = 'BANK';


    select coalesce(sum(x.amount_gtq),0)
    into v_customs_outflows
    from public.finance_customs_bank_outflows_v3991814 x
    where x.organization_id = v_org
      and x.created_at > v_rec.effective_at;

    v_collections :=
          v_case_collections
        + v_declaration_collections;

    v_outflows :=
          v_expenses
        + v_supplier_payments
        + v_customs_outflows;

    v_net :=
          v_collections
        - v_outflows;

    v_bank :=
          coalesce(v_rec.balance_gtq, 0)
        + v_net;


    -- ========================================================
    -- COMPROMISOS
    --
    -- La deuda pendiente NO reduce el saldo bancario.
    -- Solo reduce el dinero disponible/no comprometido.
    -- ========================================================

    select coalesce(
        sum(
            greatest(
                coalesce(ap.original_amount_gtq, 0)
                -
                coalesce((
                    select sum(pp.amount_gtq)
                    from public.finance_accounts_payable_payments pp
                    where pp.payable_id = ap.id
                ), 0),
                0
            )
        ),
        0
    )
    into v_commitments
    from public.finance_accounts_payable ap
    where ap.organization_id = v_org
       or ap.organization_id is null;


    return query
    select
        v_rec.id,
        v_rec.reconciliation_type,
        v_rec.effective_at,
        coalesce(v_rec.balance_gtq, 0),

        v_case_collections,
        v_declaration_collections,
        v_collections,

        v_expenses,
        v_supplier_payments,
        v_outflows,

        v_net,
        v_bank,

        v_commitments,
        v_bank - v_commitments;
end;
$function$
