begin;
-- Yard advances stay attached to their reception, including before management linkage.
alter table eyr_tracking_private.events drop constraint events_source_type_check;
alter table eyr_tracking_private.events add constraint events_source_type_check check(source_type in ('MANAGEMENT','CUSTOMS','RECEPTION'));
alter table eyr_tracking_private.events add constraint events_reception_code_check check(source_type<>'RECEPTION' or code in ('LOADED_IN_CONTAINER','DEPARTED_USA'));

create function eyr_tracking_private.yard_action(
 p_reception_id uuid,p_action text,p_code text,p_date date,p_expected_revision integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid();v_profile public.profiles%rowtype;v_r public.usa_yard_receptions%rowtype;
 v_admin boolean;v_revision integer;v_other_date date;v_result jsonb;
begin
 if v_uid is null then raise exception 'Sesión requerida' using errcode='42501';end if;
 select * into v_profile from public.profiles p where p.id=v_uid and p.active;
 if not found then raise exception 'Acceso USA no autorizado' using errcode='42501';end if;
 select * into v_r from public.usa_yard_receptions r where r.id=p_reception_id and r.status<>'CANCELLED' for update;
 if not found then raise exception 'Recepción no autorizada' using errcode='42501';end if;
 if not exists(select 1 from public.organizations o where o.id=v_r.organization_id and o.active) then
  raise exception 'Recepción no autorizada' using errcode='42501';end if;
 v_admin:=upper(v_profile.role)='ADMIN' and v_profile.organization_id=v_r.organization_id and coalesce(public.can_full_office_v3821(),false);
 if not coalesce(v_admin,false) and not exists(
  select 1 from public.usa_yard_collaborators c
  join public.usa_yard_assignments a on a.organization_id=c.organization_id and a.user_id=c.user_id and a.active
  join public.usa_yards y on y.id=a.yard_id and y.organization_id=a.organization_id and y.active
  where c.user_id=v_uid and c.organization_id=v_r.organization_id and c.active and a.yard_id=v_r.yard_id
 ) then raise exception 'Recepción no autorizada' using errcode='42501';end if;
 if v_r.import_management_id is not null and not exists(
  select 1 from public.import_managements m where m.id=v_r.import_management_id and m.organization_id=v_r.organization_id
   and upper(trim(m.vin))=upper(trim(v_r.vin)) and m.status<>'CANCELADO' and coalesce(m.service_mode,'FULL_IMPORT')<>'CUSTOMS_ONLY'
 ) then raise exception 'La recepción no tiene una gestión de transporte válida';end if;
 if p_action is null or p_action not in ('read','save_event','retract_event') then raise exception 'Acción no autorizada' using errcode='42501';end if;
 if p_action<>'read' then
  if p_code is null or p_code not in ('LOADED_IN_CONTAINER','DEPARTED_USA') then
   raise exception 'Solo se pueden registrar carga en contenedor y despacho desde USA' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(concat('tracking:event:',v_r.organization_id,':RECEPTION:',v_r.id,':',p_code),0));
  select e.revision into v_revision from eyr_tracking_private.events e
   where e.organization_id=v_r.organization_id and e.source_type='RECEPTION' and e.source_id=v_r.id and e.code=p_code for update;
  if coalesce(v_revision,0)<>coalesce(p_expected_revision,-1) then
   raise exception 'El avance cambió. Actualizá la información.' using errcode='40001';end if;
  if p_action='save_event' then
   if p_date is null or p_date<'1970-01-01'::date or p_date>(now() at time zone 'America/Guatemala')::date then
    raise exception 'Seleccioná la fecha real del avance, sin fechas futuras';end if;
   if v_r.received_at is not null and p_date<(v_r.received_at at time zone 'America/Guatemala')::date then
    raise exception 'El avance no puede ser anterior a la recepción';end if;
   select e.occurred_on into v_other_date from eyr_tracking_private.events e where e.organization_id=v_r.organization_id
    and e.source_type='RECEPTION' and e.source_id=v_r.id and e.active and e.code=case when p_code='LOADED_IN_CONTAINER' then 'DEPARTED_USA' else 'LOADED_IN_CONTAINER' end;
   if (p_code='LOADED_IN_CONTAINER' and p_date>v_other_date) or (p_code='DEPARTED_USA' and p_date<v_other_date) then
    raise exception 'La carga no puede ser posterior al despacho desde USA';end if;
   insert into eyr_tracking_private.events(organization_id,source_type,source_id,code,occurred_on,updated_by)
   values(v_r.organization_id,'RECEPTION',v_r.id,p_code,p_date,v_uid)
   on conflict(organization_id,source_type,source_id,code) do update set occurred_on=excluded.occurred_on,active=true,
    revision=eyr_tracking_private.events.revision+1,updated_at=clock_timestamp(),updated_by=v_uid;
  else
   if v_revision is null then raise exception 'El avance no existe';end if;
   update eyr_tracking_private.events set active=false,revision=revision+1,updated_at=clock_timestamp(),updated_by=v_uid
    where organization_id=v_r.organization_id and source_type='RECEPTION' and source_id=v_r.id and code=p_code;
  end if;
  update public.usa_yard_receptions set updated_at=clock_timestamp() where id=v_r.id and organization_id=v_r.organization_id;
 end if;
 select jsonb_build_object('can_record',true,'can_publish_photos',false,'mode','USA_YARD',
  'events',coalesce((select jsonb_agg(jsonb_build_object('code',e.code,'date',e.occurred_on,'active',e.active,'revision',e.revision) order by e.occurred_on)
   from eyr_tracking_private.events e where e.organization_id=v_r.organization_id and e.source_type='RECEPTION' and e.source_id=v_r.id),'[]'::jsonb),
  'photos','[]'::jsonb) into v_result;
 return v_result;
end $$;
revoke all on function eyr_tracking_private.yard_action(uuid,text,text,date,integer) from public,anon,authenticated;
grant execute on function eyr_tracking_private.yard_action(uuid,text,text,date,integer) to authenticated;
create function public.eyr_tracking_yard_v1(p_reception_id uuid,p_action text default 'read',p_code text default null,p_date date default null,p_expected_revision integer default null)
returns jsonb language sql security invoker set search_path='' as $$
 select eyr_tracking_private.yard_action(p_reception_id,p_action,p_code,p_date,p_expected_revision);
$$;
revoke all on function public.eyr_tracking_yard_v1(uuid,text,text,date,integer) from public,anon,authenticated;
grant execute on function public.eyr_tracking_yard_v1(uuid,text,text,date,integer) to authenticated;

-- Include assigned-yard records in the same public projection, before and after linkage.
create or replace function eyr_tracking_private.snapshot(p_org uuid,p_vin text) returns jsonb
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
 select v_events||coalesce(jsonb_agg(jsonb_build_object('code',e.code,'date',e.occurred_on,'manual',e.source_type<>'RECEPTION') order by e.updated_at desc,e.id),'[]'),greatest(v_updated,max(e.updated_at)) into v_events,v_updated
 from eyr_tracking_private.events e where e.organization_id=p_org and e.active and ((e.source_type='MANAGEMENT' and e.source_id=v_m.id) or (e.source_type='CUSTOMS' and e.source_id=v_c.id) or (e.source_type='RECEPTION' and e.source_id=any(v_rids)));
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
commit;
