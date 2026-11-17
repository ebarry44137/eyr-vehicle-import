begin;
create function eyr_finance_private.monthly_report(p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  org uuid;
  next_month date := (p_month + interval '1 month')::date;
  result jsonb;
begin
  perform public.assert_finance_admin();
  select organization_id into org from public.profiles where id=auth.uid();
  org := coalesce(org, public.current_organization_id_v3821());
  if org is null or p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Organización o mes inválido.';
  end if;

  with receipts as (
    select 'Gestiones aduanales' as label, coalesce(sum(amount_gtq),0) as amount
    from public.finance_case_payments
    where organization_id=org and payment_date >= p_month and payment_date < next_month
    union all
    select 'Declaraciones', coalesce(sum(amount_gtq),0) from public.declaration_service_payments
    where organization_id=org and payment_date >= p_month and payment_date < next_month
    union all
    select 'Fletes · neto recibido', coalesce(sum(amount_gtq),0) from eyr_finance_private.freight_net_settlements
    where organization_id=org and voided_at is null and bank_received_on >= p_month and bank_received_on < next_month
  ), payments as (
    select e.id::text as id, coalesce(e.bank_closing_date,e.expense_date) as day,
      initcap(e.category) as category, e.description as concept, e.payee as beneficiary, e.amount_gtq as amount
    from public.finance_expenses e
    where e.organization_id=org and coalesce(e.bank_closing_date,e.expense_date) >= p_month
      and coalesce(e.bank_closing_date,e.expense_date) < next_month
    union all
    select p.id::text,p.payment_date,
      case a.source_type when 'DISPATCH_CASE' then 'Despachos' when 'DUCA_BATCH' then 'Correlativos DUCA' else 'Proveedores' end,
      a.concept,a.creditor_name,p.amount_gtq
    from public.finance_accounts_payable_payments p join public.finance_accounts_payable a on a.id=p.payable_id
    where coalesce(p.organization_id,a.organization_id)=org and (a.organization_id=org or a.organization_id is null)
      and p.payment_date >= p_month and p.payment_date < next_month
    union all
    select x.id::text,(x.created_at at time zone 'America/Guatemala')::date,
      'Salidas aduanales',x.concept,null,x.amount_gtq
    from public.finance_customs_bank_outflows_v3991814 x
    where x.organization_id=org and x.created_at >= (p_month::timestamp at time zone 'America/Guatemala')
      and x.created_at < (next_month::timestamp at time zone 'America/Guatemala')
  )
  select jsonb_build_object(
    'receipts',(select jsonb_agg(to_jsonb(r) order by case r.label when 'Gestiones aduanales' then 1 when 'Declaraciones' then 2 else 3 end) from receipts r),
    'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.day,p.category,p.id) from payments p),'[]'::jsonb),
    'closing',(select c.closing_cash_gtq from public.finance_closings c
      where c.organization_id=org and c.status='ACTIVE' and c.closing_type='MENSUAL'
      and c.period_end=next_month-1 and c.bank_cutoff_to is not null
      order by c.closed_at desc nulls last,c.id limit 1)
  ) into result;
  return result;
end $$;
revoke all on function eyr_finance_private.monthly_report(date) from public,anon;
grant execute on function eyr_finance_private.monthly_report(date) to authenticated;

create function public.finance_monthly_report(p_month date) returns jsonb
language sql stable security invoker set search_path='' as $$
  select eyr_finance_private.monthly_report(p_month);
$$;
revoke all on function public.finance_monthly_report(date) from public,anon;
grant execute on function public.finance_monthly_report(date) to authenticated;
commit;
