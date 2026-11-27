-- Keep the original entries together so every reversal can be audited.
create table eyr_finance_private.reversed_case_payments (
 payment_id uuid primary key, case_id uuid not null, organization_id uuid not null,
 reversed_by uuid not null, reversed_at timestamptz not null default now(),
 reason text not null, original_payment jsonb not null,
 original_receipt jsonb, original_allocation jsonb
);
alter table eyr_finance_private.reversed_case_payments enable row level security;
revoke all on eyr_finance_private.reversed_case_payments from public, anon, authenticated;

create function public.reverse_customs_client_payment(p_case uuid,p_payment uuid,p_reason text,p_amount numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 org uuid:=eyr_finance_private.expense_case_org(p_case);
 pay public.finance_case_payments%rowtype;
 receipt public.customer_payments%rowtype;
 allocation public.customer_payment_allocations%rowtype;
 receipt_key uuid;
begin
 perform public.assert_finance_admin();
 if nullif(trim(p_reason),'') is null or length(p_reason)>500 then raise exception 'Indicá el motivo de la reversión (hasta 500 caracteres).'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_closing:'||org::text,0));
 select * into pay from public.finance_case_payments where id=p_payment and customs_case_id=p_case and organization_id=org for update;
 if not found then
  if exists(select 1 from eyr_finance_private.reversed_case_payments where payment_id=p_payment and case_id=p_case and organization_id=org)
  then return public.customs_statement(p_case); end if;
  raise exception 'Abono no encontrado en esta gestión.';
 end if;
 if pay.amount_gtq is distinct from p_amount then raise exception 'El monto cambió. Volvé a abrir el estado de cuenta.'; end if;
 if exists(select 1 from public.finance_closings c where c.organization_id=org and c.status='ACTIVE'
   and (pay.payment_date between c.period_start and c.period_end or (pay.money_account='BANK' and pay.created_at<=c.bank_cutoff_to)))
 or (pay.money_account='BANK' and exists(select 1 from public.finance_bank_reconciliations r where r.organization_id=org and r.status='ACTIVE' and pay.created_at<=r.effective_at))
 then raise exception 'El abono afecta un cierre o conciliación vigente. Revisalo en Finanzas.'; end if;
 if pay.note like 'Abono general cliente · %' then
  receipt_key:=substring(pay.note from 'Abono general cliente · ([0-9a-fA-F-]{36})')::uuid;
  select r.* into strict receipt from public.customer_payments r
   join public.customs_cases c on c.id=p_case and c.client_id=r.client_id
   join public.customers u on u.id=r.client_id and u.organization_id=org
   where r.id=receipt_key and (r.organization_id=org or r.organization_id is null) for update of r;
  select * into strict allocation from public.customer_payment_allocations where customer_payment_id=receipt_key
   and work_type='CUSTOMS_CASE' and work_id=p_case and amount_gtq=pay.amount_gtq and (organization_id=org or organization_id is null) for update;
  if receipt.amount_gtq<>(select sum(amount_gtq) from public.customer_payment_allocations where customer_payment_id=receipt_key)
  then raise exception 'La distribución del recibo requiere revisión en Finanzas.'; end if;
 end if;
 insert into eyr_finance_private.reversed_case_payments(payment_id,case_id,organization_id,reversed_by,reason,original_payment,original_receipt,original_allocation)
 values(pay.id,p_case,org,auth.uid(),trim(p_reason),to_jsonb(pay),to_jsonb(receipt),to_jsonb(allocation));
 delete from public.finance_case_payments where id=pay.id;
 if receipt_key is not null then
  delete from public.customer_payment_allocations where id=allocation.id;
  if receipt.amount_gtq=pay.amount_gtq then delete from public.customer_payments where id=receipt_key;
  else update public.customer_payments set amount_gtq=amount_gtq-pay.amount_gtq where id=receipt_key; end if;
 end if;
 return public.customs_statement(p_case);
end $$;
revoke all on function public.reverse_customs_client_payment(uuid,uuid,text,numeric) from public,anon;
grant execute on function public.reverse_customs_client_payment(uuid,uuid,text,numeric) to authenticated;
