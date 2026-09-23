-- E&R Solutions CRM PRO · V39.9.12
-- Cobro de flete + evidencia independiente + cierre automático WON

begin;

create table if not exists public.crm_freight_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  handoff_id uuid references public.crm_handoffs(id) on delete set null,
  import_management_id uuid references public.import_managements(id) on delete set null,
  amount_usd numeric,
  status text not null default 'PENDING' check (status in ('PENDING','REQUESTED','CONFIRMED')),
  requested_at timestamptz,
  paid_at date,
  receipt_reference text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_freight_payments_lead_unique unique (lead_id)
);

create index if not exists crm_freight_payments_org_idx on public.crm_freight_payments(organization_id);
create index if not exists crm_freight_payments_management_idx on public.crm_freight_payments(import_management_id);

alter table public.crm_freight_payments enable row level security;

drop policy if exists crm_freight_payments_select_org on public.crm_freight_payments;
create policy crm_freight_payments_select_org on public.crm_freight_payments
for select to authenticated
using (organization_id = public.current_organization_id_v3821() or public.is_platform_admin_v381());

drop policy if exists crm_freight_payments_write_org on public.crm_freight_payments;
create policy crm_freight_payments_write_org on public.crm_freight_payments
for all to authenticated
using (organization_id = public.current_organization_id_v3821() or public.is_platform_admin_v381())
with check (organization_id = public.current_organization_id_v3821() or public.is_platform_admin_v381());

create or replace function public.crm_request_freight_payment_v39912(
  p_lead_id uuid,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_handoff public.crm_handoffs%rowtype;
  v_management public.import_managements%rowtype;
  v_payment public.crm_freight_payments%rowtype;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;

  select * into v_lead from public.crm_leads
  where id=p_lead_id and (organization_id=public.current_organization_id_v3821() or public.is_platform_admin_v381())
  for update;
  if not found then raise exception 'Lead no encontrado o no autorizado'; end if;
  if v_lead.stage_code <> 'FREIGHT_PENDING' then raise exception 'El lead debe estar en Flete pendiente.'; end if;

  select * into v_handoff from public.crm_handoffs
  where lead_id=p_lead_id and status in ('READY','DELIVERED','ACCEPTED')
  order by created_at desc limit 1;
  if v_handoff.id is null or v_handoff.import_management_id is null then
    raise exception 'No existe una Gestión de Importación vinculada al handoff.';
  end if;

  select * into v_management from public.import_managements where id=v_handoff.import_management_id;
  if not found then raise exception 'No se encontró la Gestión de Importación vinculada.'; end if;

  insert into public.crm_freight_payments(
    organization_id,lead_id,handoff_id,import_management_id,amount_usd,status,requested_at,notes,created_by,updated_by
  ) values (
    v_lead.organization_id,v_lead.id,v_handoff.id,v_management.id,v_management.freight_usd,'REQUESTED',now(),nullif(trim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()
  )
  on conflict (lead_id) do update set
    handoff_id=excluded.handoff_id,
    import_management_id=excluded.import_management_id,
    amount_usd=excluded.amount_usd,
    status=case when public.crm_freight_payments.status='CONFIRMED' then 'CONFIRMED' else 'REQUESTED' end,
    requested_at=coalesce(public.crm_freight_payments.requested_at,now()),
    notes=coalesce(excluded.notes,public.crm_freight_payments.notes),
    updated_by=auth.uid(),updated_at=now()
  returning * into v_payment;

  insert into public.crm_activities(organization_id,lead_id,contact_id,activity_type,title,description,metadata,created_by)
  values(v_lead.organization_id,v_lead.id,v_lead.contact_id,'FREIGHT_PAYMENT_REQUESTED','Cobro de flete solicitado',
    coalesce(nullif(trim(coalesce(p_notes,'')),''),'Solicitud de cobro registrada'),
    jsonb_build_object('freight_payment_id',v_payment.id,'amount_usd',v_payment.amount_usd,'requested_at',v_payment.requested_at),auth.uid());

  return jsonb_build_object('ok',true,'status',v_payment.status,'amount_usd',v_payment.amount_usd,'requested_at',v_payment.requested_at);
end;$$;

-- Validador V39.9.12: conserva las reglas V39.9.0 y separa el pago de flete del pago de formalización.
create or replace function public.crm_validate_stage_v3990(p_lead_id uuid, p_stage_code text)
returns table(allowed boolean, missing_fields text[])
language plpgsql security definer set search_path='public'
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_stage public.crm_pipeline_stages%rowtype;
  v_missing text[] := array[]::text[];
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  select * into v_lead from public.crm_leads
  where id=p_lead_id and (organization_id=public.current_organization_id_v3821() or public.is_platform_admin_v381());
  if not found then raise exception 'Lead no encontrado o no autorizado'; end if;

  select * into v_stage from public.crm_pipeline_stages where code=p_stage_code and active=true;
  if not found then raise exception 'Etapa no encontrada o inactiva'; end if;

  if coalesce(v_stage.requires_vin,false) and nullif(trim(coalesce(v_lead.vin,'')),'') is null then v_missing:=array_append(v_missing,'VIN'); end if;
  if coalesce(v_stage.requires_vehicle_validation,false) and not coalesce(v_lead.vehicle_validated,false) then v_missing:=array_append(v_missing,'VEHICULO_VALIDADO'); end if;
  if coalesce(v_stage.requires_logistics,false) and not coalesce(v_lead.logistics_complete,false) then v_missing:=array_append(v_missing,'LOGISTICA'); end if;
  if coalesce(v_stage.requires_quote,false) and v_lead.quote_id is null and nullif(trim(coalesce(v_lead.quote_code,'')),'') is null then v_missing:=array_append(v_missing,'COTIZACION'); end if;
  if coalesce(v_stage.requires_client_confirmation,false) and not coalesce(v_lead.client_confirmed,false) then v_missing:=array_append(v_missing,'CONFIRMACION_CLIENTE'); end if;
  if coalesce(v_stage.requires_objection_reason,false) and not exists(select 1 from public.crm_objections o where o.lead_id=p_lead_id) then v_missing:=array_append(v_missing,'OBJECION_MOTIVO'); end if;
  if coalesce(v_stage.requires_handoff,false) and not exists(select 1 from public.crm_handoffs h where h.lead_id=p_lead_id and h.status in ('READY','DELIVERED','ACCEPTED')) then v_missing:=array_append(v_missing,'HANDOFF_OPERACIONES'); end if;
  if coalesce(v_stage.requires_freight_payment,false) and not exists(
    select 1 from public.crm_freight_payments fp
    where fp.lead_id=p_lead_id and fp.organization_id=v_lead.organization_id
      and fp.status='CONFIRMED' and fp.paid_at is not null
      and nullif(trim(coalesce(fp.receipt_reference,'')),'') is not null
  ) then v_missing:=array_append(v_missing,'PAGO_FLETE'); end if;

  return query select cardinality(v_missing)=0, v_missing;
end;$$;

create or replace function public.crm_confirm_freight_payment_v39912(
  p_lead_id uuid,
  p_paid_at date,
  p_receipt_reference text,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_handoff public.crm_handoffs%rowtype;
  v_management public.import_managements%rowtype;
  v_payment public.crm_freight_payments%rowtype;
  v_target_stage text;
  v_move jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  if p_paid_at is null then raise exception 'La fecha de pago es obligatoria.'; end if;
  if nullif(trim(coalesce(p_receipt_reference,'')),'') is null then raise exception 'La referencia o comprobante del pago es obligatorio.'; end if;

  select * into v_lead from public.crm_leads
  where id=p_lead_id and (organization_id=public.current_organization_id_v3821() or public.is_platform_admin_v381())
  for update;
  if not found then raise exception 'Lead no encontrado o no autorizado'; end if;
  if v_lead.stage_code <> 'FREIGHT_PENDING' then raise exception 'El lead debe estar en Flete pendiente.'; end if;

  select * into v_handoff from public.crm_handoffs
  where lead_id=p_lead_id and status in ('READY','DELIVERED','ACCEPTED') order by created_at desc limit 1;
  if v_handoff.id is null or v_handoff.import_management_id is null then raise exception 'No existe una Gestión de Importación vinculada al handoff.'; end if;
  select * into v_management from public.import_managements where id=v_handoff.import_management_id;
  if not found then raise exception 'No se encontró la Gestión de Importación vinculada.'; end if;

  insert into public.crm_freight_payments(
    organization_id,lead_id,handoff_id,import_management_id,amount_usd,status,requested_at,paid_at,receipt_reference,notes,created_by,updated_by
  ) values (
    v_lead.organization_id,v_lead.id,v_handoff.id,v_management.id,v_management.freight_usd,'CONFIRMED',now(),p_paid_at,trim(p_receipt_reference),nullif(trim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()
  )
  on conflict (lead_id) do update set
    handoff_id=excluded.handoff_id,import_management_id=excluded.import_management_id,amount_usd=excluded.amount_usd,
    status='CONFIRMED',requested_at=coalesce(public.crm_freight_payments.requested_at,now()),paid_at=excluded.paid_at,
    receipt_reference=excluded.receipt_reference,notes=coalesce(excluded.notes,public.crm_freight_payments.notes),updated_by=auth.uid(),updated_at=now()
  returning * into v_payment;

  insert into public.crm_activities(organization_id,lead_id,contact_id,activity_type,title,description,metadata,created_by)
  values(v_lead.organization_id,v_lead.id,v_lead.contact_id,'FREIGHT_PAYMENT_CONFIRMED','Pago de flete confirmado',
    coalesce(nullif(trim(coalesce(p_notes,'')),''),'Pago de flete confirmado'),
    jsonb_build_object('freight_payment_id',v_payment.id,'amount_usd',v_payment.amount_usd,'paid_at',v_payment.paid_at,'receipt_reference',v_payment.receipt_reference),auth.uid());

  select code into v_target_stage from public.crm_pipeline_stages where position=11 and active=true order by created_at nulls last limit 1;
  if v_target_stage is null then raise exception 'No se encontró la etapa Logrado con éxito.'; end if;

  v_move:=public.crm_move_lead_stage_v3990(p_lead_id,v_target_stage,'Pago de flete confirmado · '||trim(p_receipt_reference));
  if coalesce((v_move->>'ok')::boolean,false) is not true then
    raise exception 'No se pudo cerrar el lead: %',coalesce(v_move->'missing_fields','[]'::jsonb)::text;
  end if;

  return jsonb_build_object('ok',true,'status','CONFIRMED','amount_usd',v_payment.amount_usd,'paid_at',v_payment.paid_at,'stage',v_target_stage);
end;$$;

commit;
