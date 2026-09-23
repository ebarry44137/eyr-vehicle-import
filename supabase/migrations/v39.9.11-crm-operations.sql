-- E&R CRM PRO V39.9.11 · CRM ↔ Operaciones
-- 1) Vincula handoff con Gestión de Importación.
-- 2) IN_OPERATION queda como espera operativa (sin tarea comercial residual).
-- 3) EMBARCADO dispara FREIGHT_PENDING + tarea COLLECT_FREIGHT.

begin;

alter table public.crm_handoffs
  add column if not exists import_management_id uuid null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_handoffs_import_management_id_fkey'
      and conrelid = 'public.crm_handoffs'::regclass
  ) then
    alter table public.crm_handoffs
      add constraint crm_handoffs_import_management_id_fkey
      foreign key (import_management_id)
      references public.import_managements(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_crm_handoffs_import_management_id
  on public.crm_handoffs(import_management_id)
  where import_management_id is not null;

-- La etapa 9 ya recibió el handoff. Aquí CRM espera a Operaciones.
update public.crm_pipeline_stages
set default_task_type = null
where code = 'IN_OPERATION';

-- Limpia la tarea residual ya creada en leads que están actualmente en etapa 9.
update public.crm_tasks t
set status = 'COMPLETED',
    completed_at = coalesce(t.completed_at, now()),
    completed_by = coalesce(t.completed_by, auth.uid())
from public.crm_leads l
where l.id = t.lead_id
  and l.stage_code = 'IN_OPERATION'
  and t.is_primary = true
  and t.task_type = 'HANDOFF_OPERATIONS'
  and t.status in ('PENDING','IN_PROGRESS');

create or replace function public.crm_deliver_to_operations_v39911(
  p_lead_id uuid,
  p_payment_status text,
  p_balance_gtq numeric,
  p_documents_confirmed boolean,
  p_agreements text,
  p_operations_assigned_to uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid;
  v_contact_id uuid;
  v_contact record;
  v_lead public.crm_leads%rowtype;
  v_quote public.commercial_quotes%rowtype;
  v_handoff public.crm_handoffs%rowtype;
  v_existing_management public.import_managements%rowtype;
  v_management_id uuid;
  v_management_code text;
  v_target_stage text;
  v_move jsonb;
  v_responsible text;
  v_freight_usd numeric;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida';
  end if;

  select * into v_lead
  from public.crm_leads
  where id = p_lead_id
    and (
      organization_id = public.current_organization_id_v3821()
      or public.is_platform_admin_v381()
    )
  for update;

  if not found then
    raise exception 'Lead no encontrado o no autorizado';
  end if;

  if v_lead.stage_code <> 'ACCEPTED' then
    raise exception 'El lead debe estar en Aceptado / coordinar antes del handoff.';
  end if;

  if p_operations_assigned_to is null then
    raise exception 'Seleccioná el responsable operativo.';
  end if;
  if not coalesce(p_documents_confirmed,false) then
    raise exception 'Confirmá que los documentos disponibles fueron revisados.';
  end if;
  if nullif(trim(coalesce(p_agreements,'')),'') is null then
    raise exception 'Registrá los acuerdos especiales o indicá Sin acuerdos especiales.';
  end if;
  if not coalesce(v_lead.logistics_complete,false) then
    raise exception 'La logística del lead todavía no está completa.';
  end if;
  if not coalesce(v_lead.client_confirmed,false) then
    raise exception 'El cliente todavía no confirmó el servicio.';
  end if;
  if v_lead.quote_id is null and nullif(trim(coalesce(v_lead.quote_code,'')),'') is null then
    raise exception 'El lead todavía no tiene una cotización vinculada.';
  end if;
  if nullif(trim(coalesce(v_lead.vin,'')),'') is null then
    raise exception 'El VIN es obligatorio para crear la Gestión de Importación.';
  end if;

  v_org := v_lead.organization_id;
  v_contact_id := v_lead.contact_id;

  select * into v_contact
  from public.crm_contacts
  where id = v_contact_id
    and organization_id = v_org;

  if v_lead.quote_id is not null then
    select * into v_quote
    from public.commercial_quotes
    where id = v_lead.quote_id
      and (organization_id = v_org or organization_id is null)
    limit 1;
  end if;

  -- Reutiliza una Gestión ya vinculada al handoff si el botón se reintentara.
  select im.* into v_existing_management
  from public.crm_handoffs h
  join public.import_managements im on im.id = h.import_management_id
  where h.lead_id = p_lead_id
  order by h.created_at desc
  limit 1;

  if v_existing_management.id is not null then
    v_management_id := v_existing_management.id;
    v_management_code := v_existing_management.management_code;
  else
    -- Evita duplicar una Gestión existente del mismo caso cuando quote_code+VIN coinciden.
    select * into v_existing_management
    from public.import_managements im
    where im.organization_id = v_org
      and upper(trim(im.vin)) = upper(trim(v_lead.vin))
      and nullif(trim(coalesce(v_lead.quote_code,'')),'') is not null
      and im.quote_code = v_lead.quote_code
    order by im.created_at desc
    limit 1;

    if v_existing_management.id is not null then
      v_management_id := v_existing_management.id;
      v_management_code := v_existing_management.management_code;
    else
      v_management_id := gen_random_uuid();
      v_management_code := public.next_import_management_code();

      select coalesce(full_name,email,id::text) into v_responsible
      from public.profiles
      where id = p_operations_assigned_to
        and organization_id = v_org
        and active = true
      limit 1;

      if v_responsible is null then
        raise exception 'El responsable operativo seleccionado no es válido para esta organización.';
      end if;

      -- commercial_quotes guarda snapshots JSON; tomamos flete solo si existe en una ruta conocida.
      v_freight_usd := coalesce(
        nullif(v_quote.totals->>'freight_usd','')::numeric,
        nullif(v_quote.public_costs->>'freight_usd','')::numeric,
        nullif(v_quote.calculation_snapshot->>'freight_usd','')::numeric
      );

      insert into public.import_managements (
        id, management_code, source_query_id, contact_key, quote_code,
        client_name, phone, email, vin,
        model_year, make, model, vehicle_trim,
        freight_usd, status, responsible,
        pickup_location, destination_port, notes,
        organization_id, created_by, updated_by
      ) values (
        v_management_id,
        v_management_code,
        null,
        coalesce(v_quote.contact_key, v_contact_id::text),
        coalesce(v_lead.quote_code, v_quote.quote_code),
        coalesce(nullif(trim(v_contact.full_name),''), nullif(trim(v_quote.client_name),''), 'Cliente'),
        coalesce(nullif(trim(v_contact.phone),''), nullif(trim(v_contact.whatsapp_phone),'')),
        nullif(trim(v_contact.email),''),
        upper(trim(v_lead.vin)),
        v_lead.vehicle_year,
        v_lead.vehicle_make,
        v_lead.vehicle_model,
        v_lead.vehicle_trim,
        v_freight_usd,
        'CLIENTE_CONFIRMÓ',
        v_responsible,
        v_lead.vehicle_location,
        v_lead.delivery_location,
        trim(p_agreements),
        v_org,
        auth.uid(),
        auth.uid()
      );
    end if;
  end if;

  insert into public.crm_handoffs (
    organization_id, lead_id,
    customer_confirmed, vehicle_confirmed, logistics_confirmed,
    service_confirmed, quote_confirmed, payment_confirmed,
    documents_confirmed, agreements_confirmed,
    payment_status, balance_gtq, operational_notes,
    operations_assigned_to, import_management_id,
    status, delivered_at, created_by, updated_by
  ) values (
    v_org, p_lead_id,
    v_contact_id is not null, true, true,
    true, true, upper(coalesce(p_payment_status,'PENDING')) = 'PAID',
    true, true,
    upper(coalesce(p_payment_status,'PENDING')), p_balance_gtq, trim(p_agreements),
    p_operations_assigned_to, v_management_id,
    'READY', now(), auth.uid(), auth.uid()
  ) returning * into v_handoff;

  insert into public.crm_activities (
    organization_id, lead_id, contact_id, activity_type,
    title, description, metadata, created_by
  ) values (
    v_org, p_lead_id, v_contact_id, 'OPERATIONS_HANDOFF',
    'Expediente entregado a Operaciones', trim(p_agreements),
    jsonb_build_object(
      'handoff_id', v_handoff.id,
      'import_management_id', v_management_id,
      'management_code', v_management_code,
      'payment_status', upper(coalesce(p_payment_status,'PENDING')),
      'balance_gtq', p_balance_gtq
    ),
    auth.uid()
  );

  select code into v_target_stage
  from public.crm_pipeline_stages
  where position = 9 and active = true
  order by created_at nulls last
  limit 1;

  if v_target_stage is null then
    raise exception 'No se encontró la etapa En operación / esperando embarque.';
  end if;

  v_move := public.crm_move_lead_stage_v3990(
    p_lead_id,
    v_target_stage,
    'Expediente READY entregado a Operaciones · Gestión ' || v_management_code
  );

  if coalesce((v_move->>'ok')::boolean,false) is not true then
    raise exception 'No se pudo mover el lead a Operaciones: %', coalesce(v_move->'missing_fields','[]'::jsonb)::text;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead_id', p_lead_id,
    'handoff_id', v_handoff.id,
    'import_management_id', v_management_id,
    'management_code', v_management_code,
    'stage', v_target_stage
  );
end;
$function$;

grant execute on function public.crm_deliver_to_operations_v39911(uuid,text,numeric,boolean,text,uuid) to authenticated;

create or replace function public.crm_sync_import_management_status_v39911()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead public.crm_leads%rowtype;
  v_handoff public.crm_handoffs%rowtype;
  v_target_stage text;
  v_stage_name text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if upper(trim(coalesce(new.status,''))) <> 'EMBARCADO' then
    return new;
  end if;

  select h.* into v_handoff
  from public.crm_handoffs h
  where h.import_management_id = new.id
    and h.status in ('READY','DELIVERED','ACCEPTED')
  order by h.created_at desc
  limit 1;

  if v_handoff.id is null then
    return new;
  end if;

  select * into v_lead
  from public.crm_leads
  where id = v_handoff.lead_id
  for update;

  if v_lead.id is null or v_lead.stage_code <> 'IN_OPERATION' then
    return new;
  end if;

  select code,name into v_target_stage,v_stage_name
  from public.crm_pipeline_stages
  where position = 10 and active = true
  limit 1;

  if v_target_stage is null then
    raise exception 'No se encontró la etapa Flete pendiente.';
  end if;

  update public.crm_tasks
  set status='COMPLETED',
      completed_at=now(),
      completed_by=auth.uid()
  where lead_id=v_lead.id
    and is_primary=true
    and status in ('PENDING','IN_PROGRESS');

  update public.crm_leads
  set stage_code=v_target_stage,
      updated_by=auth.uid()
  where id=v_lead.id;

  insert into public.crm_activities (
    organization_id,lead_id,contact_id,activity_type,title,description,metadata,created_by
  ) values (
    v_lead.organization_id,v_lead.id,v_lead.contact_id,
    'STAGE_CHANGED','Cambio de etapa',
    'Operaciones marcó la Gestión '||new.management_code||' como EMBARCADO.',
    jsonb_build_object('from','IN_OPERATION','to',v_target_stage,'source','IMPORT_MANAGEMENT','import_management_id',new.id,'management_code',new.management_code),
    auth.uid()
  );

  insert into public.crm_tasks (
    organization_id,lead_id,assigned_to,task_type,title,status,priority,due_at,is_primary,auto_generated,created_by
  ) values (
    v_lead.organization_id,v_lead.id,v_lead.assigned_to,
    'COLLECT_FREIGHT',coalesce(v_stage_name,'Flete pendiente'),
    'PENDING',v_lead.priority,now()+interval '1 day',true,true,auth.uid()
  );

  return new;
end;
$function$;

drop trigger if exists trg_crm_import_management_status_v39911 on public.import_managements;
create trigger trg_crm_import_management_status_v39911
after update of status on public.import_managements
for each row
execute function public.crm_sync_import_management_status_v39911();

-- Backfill seguro: vincula handoffs existentes a una Gestión ya existente cuando VIN + quote_code coinciden.
update public.crm_handoffs h
set import_management_id = im.id,
    updated_at = now()
from public.crm_leads l,
     lateral (
       select x.id
       from public.import_managements x
       where x.organization_id = l.organization_id
         and upper(trim(x.vin)) = upper(trim(l.vin))
         and nullif(trim(coalesce(l.quote_code,'')),'') is not null
         and x.quote_code = l.quote_code
       order by x.created_at desc
       limit 1
     ) im
where h.lead_id = l.id
  and h.import_management_id is null;

commit;
