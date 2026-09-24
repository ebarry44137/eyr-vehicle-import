-- E&R CRM PRO · V39.9.14 · SECURITY HARDENING
-- Compatible con V39.9.13.1. Ejecutar una sola vez en Supabase SQL Editor.

begin;

-- 1) Las tablas CRM privadas no deben ser accesibles por anon.
revoke all privileges on table
  public.crm_contacts,
  public.crm_leads,
  public.crm_tasks,
  public.crm_activities,
  public.crm_objections,
  public.crm_handoffs,
  public.crm_freight_payments
from anon;

-- Pipeline: solo lectura para usuarios autenticados; anon no necesita acceso.
revoke all privileges on table public.crm_pipeline_stages from anon;

-- 2) Quitar privilegios de DDL/administración que el frontend no necesita.
revoke truncate, references, trigger on table
  public.crm_contacts,
  public.crm_leads,
  public.crm_tasks,
  public.crm_activities,
  public.crm_objections,
  public.crm_handoffs,
  public.crm_freight_payments,
  public.crm_pipeline_stages
from authenticated;

-- Mantener únicamente los permisos operativos requeridos por la versión actual.
grant select, insert, update, delete on table
  public.crm_contacts,
  public.crm_leads,
  public.crm_tasks,
  public.crm_activities,
  public.crm_objections,
  public.crm_handoffs,
  public.crm_freight_payments
  to authenticated;
grant select on table public.crm_pipeline_stages to authenticated;

-- 3) Reasignación comercial oficial y atómica.
create or replace function public.crm_assign_advisor_v39914(
  p_lead_id uuid,
  p_advisor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid := public.current_organization_id_v3821();
  v_lead public.crm_leads%rowtype;
  v_advisor_name text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_lead
  from public.crm_leads
  where id = p_lead_id
    and (organization_id = v_org or public.is_platform_admin_v381())
  for update;

  if not found then
    raise exception 'LEAD_NOT_FOUND_OR_FORBIDDEN';
  end if;

  if p_advisor_id is not null then
    select coalesce(nullif(trim(full_name),''), email)
      into v_advisor_name
    from public.profiles
    where id = p_advisor_id
      and active = true
      and role in ('ADMIN','OPERADOR')
      and (organization_id = v_lead.organization_id or public.is_platform_admin_v381());

    if not found then
      raise exception 'INVALID_ADVISOR';
    end if;
  end if;

  update public.crm_leads
     set assigned_to = p_advisor_id,
         updated_by = v_uid,
         updated_at = now()
   where id = v_lead.id;

  insert into public.crm_activities(
    organization_id, lead_id, contact_id, activity_type,
    title, description, metadata, created_by
  ) values (
    v_lead.organization_id, v_lead.id, v_lead.contact_id, 'ADVISOR_ASSIGNED',
    'Responsable comercial actualizado',
    case when p_advisor_id is null then 'Lead sin asesor asignado'
         else 'Asignado a ' || coalesce(v_advisor_name,'asesor') end,
    jsonb_build_object('assigned_to',p_advisor_id),
    v_uid
  );

  return jsonb_build_object('ok',true,'lead_id',v_lead.id,'assigned_to',p_advisor_id);
end;
$$;

revoke all on function public.crm_assign_advisor_v39914(uuid,uuid) from public, anon;
grant execute on function public.crm_assign_advisor_v39914(uuid,uuid) to authenticated;

-- 4) Evitar que un UPDATE directo salte el motor oficial de etapas.
-- Las RPC SECURITY DEFINER del motor se ejecutan como postgres y sí pueden cambiar stage_code.
create or replace function public.crm_guard_stage_change_v39914()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stage_code is distinct from old.stage_code
     and current_user not in ('postgres','service_role') then
    raise exception 'CRM_STAGE_CHANGE_REQUIRES_OFFICIAL_MOTOR';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_guard_stage_change_v39914 on public.crm_leads;
create trigger trg_crm_guard_stage_change_v39914
before update of stage_code on public.crm_leads
for each row execute function public.crm_guard_stage_change_v39914();

-- 5) SECURITY DEFINER críticos: nunca ejecutables por anon/PUBLIC.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'crm_validate_stage_v3990',
        'crm_move_lead_stage_v3990',
        'crm_complete_quote_task_v3995',
        'crm_deliver_to_operations_v39911',
        'crm_request_freight_payment_v39912',
        'crm_confirm_freight_payment_v39912',
        'crm_get_freight_payment_v399121'
      )
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

commit;

-- Verificación rápida
select routine_name, security_type
from information_schema.routines
where routine_schema='public'
  and routine_name in ('crm_assign_advisor_v39914','crm_move_lead_stage_v3990','crm_validate_stage_v3990')
order by routine_name;
