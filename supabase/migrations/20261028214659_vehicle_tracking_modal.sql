-- BORRADOR: no aplicado a producción. Solo añade almacenamiento privado y RPCs acotadas.
begin;
create schema if not exists eyr_tracking_private;
revoke all on schema eyr_tracking_private from public,anon,authenticated;
grant usage on schema eyr_tracking_private to authenticated,service_role;

-- Exact normalized VIN lookups remain indexed within each organization.
create index eyr_tracking_management_vin_idx on public.import_managements(organization_id,upper(btrim(vin)));
create index eyr_tracking_customs_vin_idx on public.customs_cases(organization_id,upper(btrim(vin)));
create index eyr_tracking_reception_vin_idx on public.usa_yard_receptions(organization_id,upper(btrim(vin)));

create table eyr_tracking_private.events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 source_type text not null check(source_type in ('MANAGEMENT','CUSTOMS')), source_id uuid not null,
 code text not null check(code in ('LOADED_IN_CONTAINER','DEPARTED_USA','ARRIVED_GUATEMALA','IN_DELIVERY','DELIVERED')),
 occurred_on date not null, active boolean not null default true, revision integer not null default 1,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
 unique(organization_id,source_type,source_id,code)
);
create table eyr_tracking_private.photo_publications (
 photo_id uuid primary key references public.usa_yard_photos(id) on delete cascade,
 organization_id uuid not null references public.organizations(id), is_public boolean not null default false,
 revision integer not null default 1, updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
create table eyr_tracking_private.audit (
 id bigint generated always as identity primary key, entity text not null,
 old_value jsonb, new_value jsonb, actor uuid, recorded_at timestamptz not null default now()
);
create table eyr_tracking_private.rate_limits (
 key text primary key, bucket timestamptz not null, used integer not null
);
create index tracking_events_source_idx on eyr_tracking_private.events(organization_id,source_type,source_id) where active;
create index tracking_rate_bucket_idx on eyr_tracking_private.rate_limits(bucket);
alter table eyr_tracking_private.events enable row level security;
alter table eyr_tracking_private.photo_publications enable row level security;
alter table eyr_tracking_private.audit enable row level security;
alter table eyr_tracking_private.rate_limits enable row level security;
revoke all on all tables in schema eyr_tracking_private from public,anon,authenticated;
grant all on all tables in schema eyr_tracking_private to service_role;
grant usage,select on all sequences in schema eyr_tracking_private to service_role;

create function eyr_tracking_private.audit_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into eyr_tracking_private.audit(entity,old_value,new_value,actor)
 values(tg_table_name,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),auth.uid());
 return new;
end $$;
create trigger tracking_event_audit after insert or update on eyr_tracking_private.events for each row execute function eyr_tracking_private.audit_change();
create trigger tracking_photo_audit after insert or update on eyr_tracking_private.photo_publications for each row execute function eyr_tracking_private.audit_change();

-- The authenticated facade has no table grants. The private function checks the real user and organization.
create function eyr_tracking_private.admin_action(
 p_source_type text,p_source_id uuid,p_action text,p_code text,p_date date,p_photo_id uuid,p_publish boolean,p_expected_revision integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid(); v_org uuid; v_role text; v_row_org uuid; v_mid uuid; v_cid uuid;
 v_kind text; v_id uuid; v_mode text:='FULL_IMPORT'; v_revision integer; v_result jsonb;
begin
 if v_uid is null then raise exception 'Sesión requerida' using errcode='42501'; end if;
 select p.organization_id,upper(p.role) into v_org,v_role from public.profiles p
 join public.organizations o on o.id=p.organization_id and o.active
 where p.id=v_uid and p.active and upper(p.role) in ('ADMIN','OPERADOR');
 if v_org is null or not coalesce(public.can_full_office_v3821(),false) then
  raise exception 'Acceso operativo no autorizado' using errcode='42501';
 end if;
 if p_source_type='RECEPTION' then
  select r.organization_id,r.import_management_id into v_row_org,v_mid from public.usa_yard_receptions r where r.id=p_source_id and r.status<>'CANCELLED';
  v_kind:='MANAGEMENT';v_id:=v_mid;
  if v_mid is not null then
   select m.service_mode into v_mode from public.import_managements m where m.id=v_mid and m.organization_id=v_org and m.status<>'CANCELADO'
    and exists(select 1 from public.usa_yard_receptions r where r.id=p_source_id and upper(trim(r.vin))=upper(trim(m.vin)));
   if not found then raise exception 'Recepción y gestión no coinciden' using errcode='42501'; end if;
  end if;
 elsif p_source_type='MANAGEMENT' then
  select m.organization_id,m.service_mode into v_row_org,v_mode from public.import_managements m where m.id=p_source_id and m.status<>'CANCELADO';
  v_kind:='MANAGEMENT';v_id:=p_source_id;
 elsif p_source_type='CUSTOMS' then
  select c.organization_id,c.import_management_id into v_row_org,v_mid from public.customs_cases c where c.id=p_source_id and coalesce(upper(trim(c.current_status)),'') not in ('CANCELADO','CANCELADA','CANCELLED');
  if v_mid is null then v_kind:='CUSTOMS';v_id:=p_source_id;v_mode:='CUSTOMS_ONLY';
  else
   select m.service_mode into v_mode from public.import_managements m where m.id=v_mid and m.organization_id=v_org and m.status<>'CANCELADO'
    and exists(select 1 from public.customs_cases c where c.id=p_source_id and upper(trim(c.vin))=upper(trim(m.vin)));
   if not found then raise exception 'Expediente y gestión no coinciden' using errcode='42501'; end if;
   v_kind:='MANAGEMENT';v_id:=v_mid;
  end if;
 else raise exception 'Origen inválido'; end if;
 if v_row_org is distinct from v_org then raise exception 'Operación no autorizada' using errcode='42501';end if;

 if p_action in ('save_event','retract_event') then
  if v_id is null then raise exception 'Vinculá la recepción a una gestión antes de registrar avances';end if;
  if p_code is null or p_code not in ('LOADED_IN_CONTAINER','DEPARTED_USA','ARRIVED_GUATEMALA','IN_DELIVERY','DELIVERED') then raise exception 'Avance inválido';end if;
  if v_mode='CUSTOMS_ONLY' and p_code in ('LOADED_IN_CONTAINER','DEPARTED_USA') then raise exception 'La operación es solo aduanal';end if;
  perform pg_advisory_xact_lock(hashtextextended(concat('tracking:event:',v_org,':',v_kind,':',v_id,':',p_code),0));
  select e.revision into v_revision from eyr_tracking_private.events e where e.organization_id=v_org and e.source_type=v_kind and e.source_id=v_id and e.code=p_code for update;
  if coalesce(v_revision,0)<>coalesce(p_expected_revision,-1) then raise exception 'El avance cambió. Actualizá la información.' using errcode='40001';end if;
  if p_action='save_event' then
   if p_date is null or p_date<'1970-01-01'::date or p_date>(now() at time zone 'America/Guatemala')::date then raise exception 'Seleccioná la fecha real del avance, sin fechas futuras';end if;
   insert into eyr_tracking_private.events(organization_id,source_type,source_id,code,occurred_on,updated_by)
   values(v_org,v_kind,v_id,p_code,p_date,v_uid)
   on conflict(organization_id,source_type,source_id,code) do update set occurred_on=excluded.occurred_on,active=true,revision=eyr_tracking_private.events.revision+1,updated_at=now(),updated_by=v_uid;
  else
   if v_revision is null then raise exception 'El avance no existe';end if;
   update eyr_tracking_private.events set active=false,revision=revision+1,updated_at=now(),updated_by=v_uid
   where organization_id=v_org and source_type=v_kind and source_id=v_id and code=p_code;
  end if;
 elsif p_action='publish_photo' then
  if v_role<>'ADMIN' or p_source_type<>'RECEPTION' or p_publish is null then raise exception 'Solo administración puede seleccionar fotos públicas' using errcode='42501';end if;
  perform 1 from public.usa_yard_photos f where f.id=p_photo_id and f.reception_id=p_source_id and f.organization_id=v_org;
  if not found then raise exception 'Fotografía no autorizada' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(concat('tracking:photo:',p_photo_id),0));
  select f.revision into v_revision from eyr_tracking_private.photo_publications f where f.photo_id=p_photo_id for update;
  if coalesce(v_revision,0)<>coalesce(p_expected_revision,-1) then raise exception 'La selección cambió. Actualizá la información.' using errcode='40001';end if;
  insert into eyr_tracking_private.photo_publications(photo_id,organization_id,is_public,updated_by)
  values(p_photo_id,v_org,p_publish,v_uid)
  on conflict(photo_id) do update set organization_id=v_org,is_public=p_publish,revision=eyr_tracking_private.photo_publications.revision+1,updated_at=now(),updated_by=v_uid;
 elsif p_action<>'read' then raise exception 'Acción inválida';end if;

 select jsonb_build_object('can_record',v_id is not null,'can_publish_photos',v_role='ADMIN' and p_source_type='RECEPTION','mode',v_mode,
  'events',coalesce((select jsonb_agg(jsonb_build_object('code',e.code,'date',e.occurred_on,'active',e.active,'revision',e.revision) order by e.occurred_on) from eyr_tracking_private.events e where e.organization_id=v_org and e.source_type=v_kind and e.source_id=v_id),'[]'::jsonb),
  'photos',case when p_source_type='RECEPTION' then coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'published',coalesce(a.is_public,false),'revision',coalesce(a.revision,0)) order by f.created_at) from public.usa_yard_photos f left join eyr_tracking_private.photo_publications a on a.photo_id=f.id and a.organization_id=v_org where f.reception_id=p_source_id and f.organization_id=v_org),'[]'::jsonb) else '[]'::jsonb end
 ) into v_result;
 return v_result;
end $$;

-- Only the server calls this projection. It returns paths to the Edge function, never to the browser.
create function eyr_tracking_private.snapshot(p_org uuid,p_vin text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 v_vin text:=upper(trim(p_vin)); v_candidates jsonb; v_open jsonb; v_root jsonb; v_kind text; v_id uuid;
 v_m public.import_managements%rowtype; v_c public.customs_cases%rowtype; v_r public.usa_yard_receptions%rowtype;
 v_rids uuid[]:='{}'; v_count integer; v_mode text; v_events jsonb:='[]'; v_photos jsonb:='[]'; v_updated timestamptz;
begin
 if v_vin !~ '^[A-HJ-NPR-Z0-9]{17}$' then raise exception 'VIN inválido';end if;
 if not exists(select 1 from public.organizations o where o.id=p_org and o.active) then return jsonb_build_object('result','NOT_FOUND');end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_candidates from (
  select 'MANAGEMENT'::text kind,m.id,(m.status='ENTREGADO') closed from public.import_managements m
  where m.organization_id=p_org and upper(trim(m.vin))=v_vin and m.status<>'CANCELADO'
  union all
  select 'CUSTOMS',c.id,(c.delivered_at is not null or upper(trim(c.current_status)) in ('FINALIZADO / ENTREGADO','FINALIZADO','ENTREGADO')) from public.customs_cases c
  where c.organization_id=p_org and upper(trim(c.vin))=v_vin and c.import_management_id is null and coalesce(upper(trim(c.current_status)),'') not in ('CANCELADO','CANCELADA','CANCELLED')
  union all
  select 'RECEPTION',r.id,false from public.usa_yard_receptions r
  where r.organization_id=p_org and upper(trim(r.vin))=v_vin and r.import_management_id is null and r.status<>'CANCELLED'
 ) x;
 select coalesce(jsonb_agg(x),'[]') into v_open from jsonb_array_elements(v_candidates) x where not (x->>'closed')::boolean;
 if jsonb_array_length(v_open)=1 then v_root:=v_open->0;
 elsif jsonb_array_length(v_open)>1 then return jsonb_build_object('result','AMBIGUOUS');
 elsif jsonb_array_length(v_candidates)=1 then v_root:=v_candidates->0;
 elsif jsonb_array_length(v_candidates)>1 then return jsonb_build_object('result','AMBIGUOUS');
 else return jsonb_build_object('result','NOT_FOUND');end if;
 v_kind:=v_root->>'kind';v_id:=(v_root->>'id')::uuid;
 if v_kind='MANAGEMENT' then
  select * into v_m from public.import_managements where id=v_id and organization_id=p_org;
  select count(*) into v_count from public.customs_cases c where c.organization_id=p_org and c.import_management_id=v_m.id and upper(trim(c.vin))=v_vin and coalesce(upper(trim(c.current_status)),'') not in ('CANCELADO','CANCELADA','CANCELLED');
  if v_count>1 then return jsonb_build_object('result','AMBIGUOUS');end if;
  select * into v_c from public.customs_cases c where c.organization_id=p_org and c.import_management_id=v_m.id and upper(trim(c.vin))=v_vin and coalesce(upper(trim(c.current_status)),'') not in ('CANCELADO','CANCELADA','CANCELLED');
  select coalesce(array_agg(r.id),'{}') into v_rids from public.usa_yard_receptions r where r.organization_id=p_org and r.import_management_id=v_m.id and upper(trim(r.vin))=v_vin and r.status<>'CANCELLED';
 elsif v_kind='CUSTOMS' then select * into v_c from public.customs_cases where id=v_id and organization_id=p_org;
 else v_rids:=array[v_id];end if;
 select * into v_r from public.usa_yard_receptions r where r.id=any(v_rids) and r.organization_id=p_org order by r.received_at limit 1;
 v_mode:=coalesce(v_m.service_mode,case when v_kind='CUSTOMS' then 'CUSTOMS_ONLY' when v_kind='RECEPTION' then 'RECEPTION_ONLY' else 'FULL_IMPORT' end);
 if v_mode='CUSTOMS_ONLY' then v_rids:='{}';end if;
 v_updated:=greatest(v_m.updated_at,v_c.updated_at,v_r.updated_at);
 if v_r.id is not null and v_mode<>'CUSTOMS_ONLY' and v_r.received_at<=now() then
  v_events:=v_events||jsonb_build_array(jsonb_build_object('code','RECEIVED_USA','date',(v_r.received_at at time zone 'America/Guatemala')::date,'manual',false));
 end if;
 if v_c.id is not null then
  select coalesce(jsonb_agg(jsonb_build_object('code',x.code,'date',x.actual_date,'manual',false)),'[]') into v_events from (
   select null::text code,null::date actual_date where false
   union all select 'DOCS_COLLECTED',v_c.docs_collected_at union all select 'EMPTIED',v_c.emptied_at
   union all select 'ADMISSION_FILED',v_c.da_at union all select 'DATA_VERIFIED',v_c.corroboration_at
   union all select 'DIGITIZATION_STARTED',v_c.digitization_started_at union all select 'REVIEW_STARTED',v_c.review_started_at
   union all select 'DECLARATION_SIGNED',v_c.declaration_signed_at union all select 'TAX_FORM_SENT',v_c.iva_form_sent_at
   union all select 'IVA_PAID',v_c.iva_paid_at union all select 'SELECTIVE_RECORDED',v_c.selective_at
   union all select 'PORT_EXIT',v_c.port_exit_at union all select 'DOCS_SET_BUILT',v_c.docs_set_built_at
   union all select 'ENVELOPE_READY',v_c.envelope_ready_at union all select 'CUSTOMS_HANDOVER',v_c.delivered_at
  ) x where x.actual_date is not null and x.actual_date<=(now() at time zone 'America/Guatemala')::date;
  if v_r.id is not null and v_mode<>'CUSTOMS_ONLY' and v_r.received_at<=now() then v_events:=v_events||jsonb_build_array(jsonb_build_object('code','RECEIVED_USA','date',(v_r.received_at at time zone 'America/Guatemala')::date,'manual',false));end if;
 end if;
 select v_events||coalesce(jsonb_agg(jsonb_build_object('code',e.code,'date',e.occurred_on,'manual',true)),'[]'),greatest(v_updated,max(e.updated_at)) into v_events,v_updated
 from eyr_tracking_private.events e where e.organization_id=p_org and e.active and ((e.source_type='MANAGEMENT' and e.source_id=v_m.id) or (e.source_type='CUSTOMS' and e.source_id=v_c.id));
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_photos from (
  select f.id,f.storage_path,f.mime_type from public.usa_yard_photos f
  join eyr_tracking_private.photo_publications a on a.photo_id=f.id and a.organization_id=p_org and a.is_public
  join public.usa_yard_receptions r on r.id=f.reception_id and r.organization_id=p_org and r.status<>'CANCELLED'
  where f.organization_id=p_org and r.id=any(v_rids) and upper(trim(r.vin))=v_vin
   and f.mime_type in ('image/jpeg','image/png','image/webp') order by f.created_at limit 30
 ) x;
 return jsonb_build_object('result','FOUND','mode',v_mode,'management_status',v_m.status,
  'vehicle',jsonb_build_object('make',coalesce(v_m.make,v_c.make,v_r.vehicle_make),'model',coalesce(nullif(v_m.model,''),v_c.model,v_r.vehicle_model),'year',coalesce(v_m.model_year,v_c.model_year,v_r.model_year)),
  'milestones',v_events,'photos',v_photos,'updated_at',v_updated,'eta',v_m.estimated_arrival_date);
end $$;

create function eyr_tracking_private.consume_limit(p_key text,p_limit integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_used integer;v_bucket timestamptz:=date_trunc('minute',clock_timestamp());
begin
 if length(p_key)>130 or p_limit<1 or p_limit>1000 then raise exception 'Límite inválido';end if;
 delete from eyr_tracking_private.rate_limits where key in (select r.key from eyr_tracking_private.rate_limits r where r.bucket<v_bucket-interval '1 day' limit 20);
 insert into eyr_tracking_private.rate_limits(key,bucket,used) values(p_key,v_bucket,1)
 on conflict(key) do update set bucket=excluded.bucket,used=case when eyr_tracking_private.rate_limits.bucket=excluded.bucket then least(1000000,eyr_tracking_private.rate_limits.used+1) else 1 end
 returning used into v_used;
 return v_used<=p_limit;
end $$;

revoke all on all functions in schema eyr_tracking_private from public,anon,authenticated;
grant execute on function eyr_tracking_private.admin_action(text,uuid,text,text,date,uuid,boolean,integer) to authenticated;
grant execute on function eyr_tracking_private.snapshot(uuid,text),eyr_tracking_private.consume_limit(text,integer) to service_role;
create function public.eyr_tracking_admin_v1(p_source_type text,p_source_id uuid,p_action text default 'read',p_code text default null,p_date date default null,p_photo_id uuid default null,p_publish boolean default null,p_expected_revision integer default null)
returns jsonb language sql security invoker set search_path='' as $$ select eyr_tracking_private.admin_action(p_source_type,p_source_id,p_action,p_code,p_date,p_photo_id,p_publish,p_expected_revision); $$;
create function public.eyr_tracking_snapshot_v1(p_organization_id uuid,p_vin text) returns jsonb language sql security invoker set search_path='' as $$ select eyr_tracking_private.snapshot(p_organization_id,p_vin); $$;
create function public.eyr_tracking_limit_v1(p_key text,p_limit integer) returns boolean language sql security invoker set search_path='' as $$ select eyr_tracking_private.consume_limit(p_key,p_limit); $$;
revoke all on function public.eyr_tracking_admin_v1(text,uuid,text,text,date,uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.eyr_tracking_admin_v1(text,uuid,text,text,date,uuid,boolean,integer) to authenticated;
revoke all on function public.eyr_tracking_snapshot_v1(uuid,text),public.eyr_tracking_limit_v1(text,integer) from public,anon,authenticated;
grant execute on function public.eyr_tracking_snapshot_v1(uuid,text),public.eyr_tracking_limit_v1(text,integer) to service_role;
commit;
