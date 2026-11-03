CREATE OR REPLACE FUNCTION public.finance_period_summary(p_from date, p_to date)
 RETURNS TABLE(billed_gtq numeric, collected_gtq numeric, receivable_gtq numeric, direct_costs_gtq numeric, gross_profit_gtq numeric, general_expenses_gtq numeric, net_result_gtq numeric, supplier_payments_gtq numeric, duca_accrued_cost_gtq numeric, cash_direct_outflows_gtq numeric, cash_result_gtq numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid:=null;
  v_role text:='';
  v_active boolean:=false;
  v_case_billed numeric:=0;
  v_case_direct numeric:=0;
  v_dec_billed numeric:=0;
  v_dec_direct numeric:=0;
  v_collected numeric:=0;
  v_expenses numeric:=0;
  v_supplier_payments numeric:=0;
  v_duca_accrued numeric:=0;
  v_dispatch_accrued numeric:=0;
  v_direct_total numeric:=0;
  v_cash_direct numeric:=0;
begin
  select p.organization_id, upper(coalesce(p.role::text,'')), coalesce(p.active,false)
  into v_org,v_role,v_active
  from public.profiles p
  where p.id=auth.uid();

  if not coalesce(v_active,false) or v_role <> 'ADMIN' then
    v_org:=public.current_organization_id_v3821();

    if v_org is null
       or not public.is_tenant_admin_v3821()
       or not public.can_full_office_v3821() then
      raise exception 'Finanzas no autorizadas para este usuario.'
        using errcode='42501';
    end if;
  end if;

  select
    coalesce(sum(coalesce(f.client_charge_gtq,0)),0),
    coalesce(sum(
      coalesce(f.corroboration_cost_gtq,0)
      + case when coalesce(f.includes_duca,false) then coalesce(f.duca_cost_gtq,0) else 0 end
      + coalesce(f.document_collection_cost_gtq,0)
      + coalesce(f.dispatch_management_cost_gtq,0)
      + coalesce(f.other_direct_cost_gtq,0)
    ),0)
  into v_case_billed,v_case_direct
  from public.customs_case_finance f
  join public.customs_cases c on c.id=f.customs_case_id
  where f.organization_id=v_org
    and c.organization_id=v_org
    and c.notice_date between p_from and p_to;

  select
    coalesce(sum(coalesce(d.charge_gtq,0)),0),
    coalesce(sum(coalesce(b.unit_cost_gtq,0)),0)
  into v_dec_billed,v_dec_direct
  from public.declaration_services d
  left join public.duca_correlatives dc on dc.id=d.duca_correlative_id
  left join public.duca_correlative_batches b on b.id=dc.batch_id
  where d.organization_id=v_org
    and d.declaration_date between p_from and p_to
    and coalesce(d.status,'') <> 'ANULADA';

  select
    coalesce((
      select sum(coalesce(p.amount_gtq,0))
      from public.finance_case_payments p
      where p.organization_id=v_org
        and p.payment_date between p_from and p_to
    ),0)
    +
    coalesce((
      select sum(coalesce(p.amount_gtq,0))
      from public.declaration_service_payments p
      where p.organization_id=v_org
        and p.payment_date between p_from and p_to
    ),0)
  into v_collected;

  select coalesce(sum(coalesce(e.amount_gtq,0)),0)
  into v_expenses
  from public.finance_expenses e
  where e.organization_id=v_org
    and e.expense_date between p_from and p_to;

  select coalesce(sum(pp.amount_gtq),0)
  into v_supplier_payments
  from public.finance_accounts_payable_payments pp
  join public.finance_accounts_payable ap on ap.id=pp.payable_id
  where pp.payment_date between p_from and p_to
    and (ap.organization_id=v_org or ap.organization_id is null);

  select coalesce(sum(
    case when coalesce(f.includes_duca,false)
      then coalesce(f.duca_cost_gtq,0)
      else 0 end
  ),0)
  into v_duca_accrued
  from public.customs_case_finance f
  join public.customs_cases c on c.id=f.customs_case_id
  where f.organization_id=v_org
    and c.organization_id=v_org
    and c.notice_date between p_from and p_to;

  select v_duca_accrued + coalesce(sum(coalesce(b.unit_cost_gtq,0)),0)
  into v_duca_accrued
  from public.declaration_services d
  left join public.duca_correlatives dc on dc.id=d.duca_correlative_id
  left join public.duca_correlative_batches b on b.id=dc.batch_id
  where d.organization_id=v_org
    and d.declaration_date between p_from and p_to
    and coalesce(d.status,'') <> 'ANULADA';

  select coalesce(sum(coalesce(f.dispatch_management_cost_gtq,0)),0)
  into v_dispatch_accrued
  from public.customs_case_finance f
  join public.customs_cases c on c.id=f.customs_case_id
  where f.organization_id=v_org
    and c.organization_id=v_org
    and c.notice_date between p_from and p_to;

  v_direct_total:=v_case_direct+v_dec_direct;

  v_cash_direct:=
    greatest(0, v_direct_total-v_duca_accrued-v_dispatch_accrued)
    + v_supplier_payments;

  return query
  select
    v_case_billed+v_dec_billed,
    v_collected,
    greatest((v_case_billed+v_dec_billed)-v_collected,0),
    v_direct_total,
    (v_case_billed+v_dec_billed)-v_direct_total,
    v_expenses,
    (v_case_billed+v_dec_billed)-v_direct_total-v_expenses,
    v_supplier_payments,
    v_duca_accrued,
    v_cash_direct,
    v_collected-v_cash_direct-v_expenses;
end;
$function$
