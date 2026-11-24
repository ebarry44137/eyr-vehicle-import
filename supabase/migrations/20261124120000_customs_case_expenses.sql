-- Case-scoped recoverable disbursements. Finance expenses remain the cash ledger.
create table eyr_finance_private.case_disbursements (
 id uuid primary key,
 case_id uuid not null references public.customs_cases(id),
 org_id uuid not null references public.organizations(id),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 spent_on date not null,
 concept text not null check(length(trim(concept)) between 1 and 160),
 beneficiary text not null check(length(trim(beneficiary)) between 1 and 160),
 amount numeric(14,2) not null check(amount>0),
 source text not null check(source in ('BANK','CASH','DIRECT')),
 expense_id uuid unique references public.finance_expenses(id) deferrable initially deferred,
 receipt text check(length(receipt)<=2800000),
 check ((source='DIRECT')=(expense_id is null))
);
create index case_disbursements_case on eyr_finance_private.case_disbursements(case_id);
alter table eyr_finance_private.case_disbursements enable row level security;
revoke all on eyr_finance_private.case_disbursements from public,anon,authenticated;

alter table public.customs_case_finance add column reimbursable_gtq numeric(14,2) not null default 0;
alter table public.finance_case_payments add column statement_line text;

create function eyr_finance_private.expense_case_org(p_case uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
 select c.organization_id into org from public.customs_cases c
 join public.profiles p on p.id=auth.uid() and p.active and p.organization_id=c.organization_id
 where c.id=p_case and c.organization_id=public.current_organization_id_v3821()
 and public.can_full_office_v3821() and (
 upper(p.role) in ('ADMIN','OPERADOR') or exists(select 1 from public.organization_members m
 where m.user_id=p.id and m.organization_id=c.organization_id and m.active));
 if org is null then raise exception 'Sin acceso a esta gestión.'; end if;
 return org;
end $$;
revoke all on function eyr_finance_private.expense_case_org(uuid) from public,anon,authenticated;

-- Preserve the existing closing-date rules. Permit a staff insert only while
-- the matching, server-created disbursement exists inside the same transaction.
create or replace function eyr_finance_private.guard_expense_closing_date() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_date date;v_changed boolean;v_rec_date date;
begin
 -- Existing rows retain their previous rule unless explicitly assigned or financially edited.
 if tg_op='UPDATE' then
  if new.created_at is distinct from old.created_at then raise exception 'La fecha real de registro del gasto es inmutable.';end if;
  v_changed:=(new.organization_id,new.expense_date,new.amount_gtq,new.money_account,new.bank_closing_date)
    is distinct from (old.organization_id,old.expense_date,old.amount_gtq,old.money_account,old.bank_closing_date);
  if not v_changed then new.bank_closing_recorded_at:=old.bank_closing_recorded_at;return new;end if;
 else v_changed:=true;end if;
 if auth.uid() is null then raise exception 'Sesión financiera requerida' using errcode='42501';end if;
 if not (tg_op='INSERT' and exists (
   select 1 from eyr_finance_private.case_disbursements d
   where d.expense_id=new.id and d.org_id=new.organization_id and d.created_by=auth.uid()
     and d.amount=new.amount_gtq and d.spent_on=new.expense_date and d.source=new.money_account
 )) then perform public.assert_finance_admin(); end if;
 select p.organization_id into v_org from public.profiles p join public.organizations o on o.id=p.organization_id and o.active where p.id=auth.uid() and p.active;
 if v_org is null or new.organization_id is distinct from v_org then raise exception 'Organización financiera no autorizada' using errcode='42501';end if;
 if tg_op='UPDATE' and old.organization_id is distinct from v_org then raise exception 'No se permite trasladar gastos entre organizaciones' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_closing:'||v_org::text,0));
 if tg_op='UPDATE' and old.money_account='BANK' and exists(select 1 from public.finance_closings c where c.organization_id=v_org and c.status='ACTIVE' and c.bank_cutoff_to is not null
  and ((old.bank_closing_date is null and old.created_at<=c.bank_cutoff_to)
   or (old.bank_closing_date is not null and (old.bank_closing_date<=c.period_end or old.bank_closing_date<(c.bank_cutoff_to at time zone 'America/Guatemala')::date)))) then
  raise exception 'El gasto ya afecta un cierre activo. Se requiere revisión del cierre antes de modificarlo.';
 end if;
 if new.money_account is distinct from 'BANK' then new.bank_closing_date:=null;new.bank_closing_recorded_at:=null;return new;end if;
 v_date:=new.expense_date;
 if v_date is null or v_date>(clock_timestamp() at time zone 'America/Guatemala')::date then raise exception 'Elegí una fecha de gasto válida, sin fechas futuras.';end if;
 select (r.effective_at at time zone 'America/Guatemala')::date into v_rec_date from public.finance_bank_reconciliations r where r.organization_id=v_org and r.status='ACTIVE' order by r.effective_at desc,r.created_at desc limit 1;
 if v_rec_date is null or v_date<=v_rec_date then raise exception 'La fecha del gasto coincide con o precede a la conciliación activa; se requiere revisión.';end if;
 if exists(select 1 from public.finance_closings c where c.organization_id=v_org and c.status='ACTIVE' and c.bank_cutoff_to is not null
   and (v_date<=c.period_end or v_date<(c.bank_cutoff_to at time zone 'America/Guatemala')::date
     or (v_date=(c.bank_cutoff_to at time zone 'America/Guatemala')::date and not(c.bank_cutoff_exclusive and (c.bank_cutoff_to at time zone 'America/Guatemala')::time=time '00:00')))) then
  raise exception 'La fecha elegida afectaría un cierre activo. Se requiere revisión del cierre.';
 end if;
 new.bank_closing_date:=v_date;new.bank_closing_recorded_at:=clock_timestamp();
 return new;
end $$;

create function public.customs_expense_matches(p_case uuid,p_date date,p_amount numeric,p_source text)
returns table(id uuid,label text) language plpgsql stable security definer set search_path='' as $$
declare org uuid:=eyr_finance_private.expense_case_org(p_case);
begin
 return query select e.id,concat_ws(' · ',e.description,e.payee) from public.finance_expenses e
 where e.organization_id=org and e.expense_date=p_date and e.amount_gtq=p_amount and e.money_account=p_source
 and not exists(select 1 from eyr_finance_private.case_disbursements d where d.expense_id=e.id)
 order by e.created_at desc;
end $$;

create function public.customs_register_expense(p_case uuid,p_request uuid,p_date date,p_concept text,
 p_payee text,p_amount numeric,p_source text,p_existing uuid default null,p_receipt text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=eyr_finance_private.expense_case_org(p_case);
 ledger_id uuid; existing eyr_finance_private.case_disbursements%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into existing from eyr_finance_private.case_disbursements where id=p_request;
 if found then
  if (existing.case_id,existing.created_by,existing.spent_on,existing.concept,existing.beneficiary,existing.amount,existing.source)
   is distinct from (p_case,auth.uid(),p_date,trim(p_concept),trim(p_payee),p_amount,p_source)
   then raise exception 'El registro cambió. Actualizá antes de volver a guardar.'; end if;
  return existing.id;
 end if;
 if p_date>(now() at time zone 'America/Guatemala')::date or round(p_amount,2)<>p_amount then raise exception 'Revisá la fecha y el monto.'; end if;
 if p_receipt is not null and (length(p_receipt)>2800000 or p_receipt !~ '^data:image/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$') then raise exception 'Comprobante inválido.'; end if;
 if p_existing is not null then
  select e.id into ledger_id from public.finance_expenses e where e.id=p_existing and e.organization_id=org
    and e.amount_gtq=p_amount and e.money_account=p_source and e.expense_date=p_date for update;
  if ledger_id is null then raise exception 'El movimiento ya no coincide con el gasto.'; end if;
 elsif p_source<>'DIRECT' then ledger_id:=gen_random_uuid();
 end if;
 insert into eyr_finance_private.case_disbursements(id,case_id,org_id,created_by,spent_on,concept,beneficiary,amount,source,expense_id,receipt)
 values(p_request,p_case,org,auth.uid(),p_date,trim(p_concept),trim(p_payee),p_amount,p_source,ledger_id,p_receipt);
 if p_source<>'DIRECT' then
  if p_existing is null then
   insert into public.finance_expenses(id,organization_id,created_by,expense_date,category,description,payee,amount_gtq,payment_method,money_account)
   select ledger_id,org,auth.uid(),p_date,'OTROS',concat(c.case_code,' · ',trim(p_concept)),trim(p_payee),p_amount,
    case p_source when 'BANK' then 'Transferencia' else 'Efectivo' end,p_source from public.customs_cases c where c.id=p_case;
  end if;
  update public.customs_case_finance set client_charge_gtq=coalesce(client_charge_gtq,0)+p_amount,
    reimbursable_gtq=reimbursable_gtq+p_amount where customs_case_id=p_case and organization_id=org;
  if not found then raise exception 'Falta la ficha financiera del expediente.'; end if;
 end if;
 return p_request;
end $$;

create function public.customs_statement(p_case uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid:=eyr_finance_private.expense_case_org(p_case); result jsonb;
begin
 select jsonb_build_object('billed',coalesce(f.client_charge_gtq,0),'extras',coalesce(f.reimbursable_gtq,0),
 'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'concept',d.concept,'amount',d.amount,
 'source',d.source,'date',d.spent_on,'beneficiary',d.beneficiary,'hasReceipt',d.receipt is not null) order by d.spent_on,d.created_at)
 from eyr_finance_private.case_disbursements d where d.case_id=p_case),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount_gtq,'date',p.payment_date,
 'line',p.statement_line) order by p.payment_date,p.created_at) from public.finance_case_payments p
 where p.customs_case_id=p_case and p.organization_id=org),'[]'::jsonb))
 into result from public.customs_case_finance f where f.customs_case_id=p_case and f.organization_id=org;
 if result is null then raise exception 'Falta la ficha financiera del expediente.'; end if;
 return result;
end $$;
create function public.customs_expense_receipt(p_case uuid,p_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select d.receipt from eyr_finance_private.case_disbursements d where d.id=p_id and d.case_id=p_case
 and d.org_id=eyr_finance_private.expense_case_org(p_case);
$$;

-- A linked expense is the evidence for an exact client debit.
create function eyr_finance_private.keep_linked_expense() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (old.organization_id,old.expense_date,old.amount_gtq,old.money_account,old.payee) is distinct from
 (new.organization_id,new.expense_date,new.amount_gtq,new.money_account,new.payee)
 and exists(select 1 from eyr_finance_private.case_disbursements d where d.expense_id=old.id)
 then raise exception 'La salida está vinculada a una gestión. Requiere conciliación.'; end if;
 return new;
end $$;
create trigger zz_keep_linked_expense before update on public.finance_expenses for each row execute function eyr_finance_private.keep_linked_expense();

revoke all on function public.customs_statement(uuid), public.customs_expense_receipt(uuid,uuid),
 public.customs_expense_matches(uuid,date,numeric,text),public.customs_register_expense(uuid,uuid,date,text,text,numeric,text,uuid,text) from public,anon;
grant execute on function public.customs_statement(uuid), public.customs_expense_receipt(uuid,uuid),
 public.customs_expense_matches(uuid,date,numeric,text),public.customs_register_expense(uuid,uuid,date,text,text,numeric,text,uuid,text) to authenticated;

create function public.customs_classify_payment(p_case uuid,p_payment uuid,p_line text) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=eyr_finance_private.expense_case_org(p_case);
begin
 perform public.assert_finance_admin();
 if p_line is not null and p_line not in ('collection','port','fees','other','agreement')
 and not exists(select 1 from eyr_finance_private.case_disbursements d where d.case_id=p_case and d.id::text=p_line and d.source<>'DIRECT')
 then raise exception 'Concepto inválido para esta gestión.'; end if;
 update public.finance_case_payments set statement_line=p_line where id=p_payment and customs_case_id=p_case and organization_id=org;
 if not found then raise exception 'Abono no encontrado en esta gestión.'; end if;
end $$;
revoke all on function public.customs_classify_payment(uuid,uuid,text) from public,anon;
grant execute on function public.customs_classify_payment(uuid,uuid,text) to authenticated;
