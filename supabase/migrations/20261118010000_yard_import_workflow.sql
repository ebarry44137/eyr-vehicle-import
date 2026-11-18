begin;
-- Office-only contacts. No contact or notification data enters the public VIN projection.
create table eyr_tracking_private.yard_contacts (
  reception_id uuid primary key references public.usa_yard_receptions(id) on delete cascade,
  sender_name text not null, sender_phone text not null, receiver_name text,
  receiver_phone text, receiver_nit text, receiver_address text,
  revision integer not null default 1,
  confirmed_at timestamptz, confirmed_by uuid, notified_contact text
);
alter table eyr_tracking_private.yard_contacts enable row level security;
revoke all on eyr_tracking_private.yard_contacts from public,anon,authenticated;

alter table eyr_tracking_private.events drop constraint events_code_check;
alter table eyr_tracking_private.events add constraint events_code_check check
 (code in ('LOADED_IN_CONTAINER','DEPARTED_USA','ARRIVED_GUATEMALA','IN_DELIVERY','DELIVERED','EMPTIED'));
alter table eyr_tracking_private.events drop constraint events_reception_code_check;
alter table eyr_tracking_private.events add constraint events_reception_code_check check
 (source_type <> 'RECEPTION' or code in ('LOADED_IN_CONTAINER','DEPARTED_USA','ARRIVED_GUATEMALA','EMPTIED'));

create function eyr_tracking_private.yard_import(p_id uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r public.usa_yard_receptions%rowtype;
 m public.import_managements%rowtype;
 c public.customs_cases%rowtype;
 f eyr_tracking_private.yard_contacts%rowtype;
 today_gt date := (now() at time zone 'America/Guatemala')::date;
 steps text[] := array['RECEIVED_USA','LOADED_IN_CONTAINER','DEPARTED_USA','ARRIVED_GUATEMALA','EMPTIED'];
 dates jsonb; stage text; target text:=p_input->>'stage'; event_date date; ids uuid[];
begin
 select y.* into r from public.usa_yard_receptions y join public.profiles p on p.organization_id=y.organization_id
 join public.organizations o on o.id=y.organization_id and o.active
 where y.id=p_id and y.status<>'CANCELLED' and p.id=auth.uid() and p.active and upper(p.role)='ADMIN'
 and public.can_full_office_v3821() for update of y;
 if not found then raise exception 'Recepción no autorizada' using errcode='42501'; end if;
 select * into f from eyr_tracking_private.yard_contacts where reception_id=r.id;
 if p_action in ('contacts','advance','handoff') and coalesce(f.revision,0) is distinct from (p_input->>'revision')::int then
   raise exception 'La ficha cambió. Volvé a abrirla antes de guardar.'; end if;
 if r.import_management_id is not null then
   select * into m from public.import_managements where id=r.import_management_id and organization_id=r.organization_id
     and upper(trim(vin))=upper(trim(r.vin)) and status<>'CANCELADO' and service_mode is distinct from 'CUSTOMS_ONLY' for update;
   if not found then raise exception 'Revisá la gestión vinculada a esta recepción.'; end if;
 end if;
 if p_action='contacts' then
   if nullif(trim(p_input->>'sender_name'),'') is null or coalesce(p_input->>'sender_phone','') !~ '^[1-9][0-9]{7,14}$' then
     raise exception 'Ingresá el nombre y WhatsApp del remitente con código de país.'; end if;
   if nullif(p_input->>'receiver_phone','') is not null and p_input->>'receiver_phone' !~ '^[1-9][0-9]{7,14}$' then
     raise exception 'Revisá el WhatsApp del destinatario.'; end if;
   if m.id is null then
     perform pg_advisory_xact_lock(hashtextextended(r.organization_id::text||upper(trim(r.vin)),0));
     select array_agg(id) into ids from public.import_managements where organization_id=r.organization_id
       and upper(trim(vin))=upper(trim(r.vin)) and status not in ('ENTREGADO','CANCELADO') and service_mode is distinct from 'CUSTOMS_ONLY';
     if cardinality(ids)>1 then raise exception 'Hay varias gestiones para este VIN. Vinculá primero la correcta.'; end if;
     if ids[1] is null then
       insert into public.import_managements(organization_id,management_code,client_name,phone,vin,make,model,model_year,service_mode,status,created_by)
       values(r.organization_id,public.next_import_management_code(),trim(p_input->>'sender_name'),p_input->>'sender_phone',r.vin,r.vehicle_make,r.vehicle_model,r.model_year,'FULL_IMPORT','CLIENTE_CONFIRMÓ',auth.uid()) returning * into m;
     else
       select * into strict m from public.import_managements where id=ids[1] for update;
     end if;
     update public.usa_yard_receptions set import_management_id=m.id,status='LINKED',linked_by=auth.uid(),linked_at=now(),updated_at=now() where id=r.id;
   end if;
   insert into eyr_tracking_private.yard_contacts(reception_id,sender_name,sender_phone,receiver_name,receiver_phone,receiver_nit,receiver_address)
   values(r.id,trim(p_input->>'sender_name'),p_input->>'sender_phone',nullif(trim(p_input->>'receiver_name'),''),nullif(p_input->>'receiver_phone',''),nullif(trim(p_input->>'receiver_nit'),''),nullif(trim(p_input->>'receiver_address'),''))
   on conflict(reception_id) do update set sender_name=excluded.sender_name,sender_phone=excluded.sender_phone,
   receiver_name=excluded.receiver_name,receiver_phone=excluded.receiver_phone,receiver_nit=excluded.receiver_nit,receiver_address=excluded.receiver_address,
   revision=yard_contacts.revision+1 returning * into f;
 end if;
 select array_agg(id) into ids from public.customs_cases where organization_id=r.organization_id and import_management_id=m.id;
 if cardinality(ids)>1 then raise exception 'Revisá los expedientes duplicados de esta gestión.'; end if;
 select * into c from public.customs_cases where id=ids[1] for update;
 select coalesce(jsonb_object_agg(code,occurred_on),'{}') into dates from (
   select code,min(occurred_on) occurred_on from eyr_tracking_private.events where organization_id=r.organization_id and active and
   ((source_type='RECEPTION' and source_id=r.id) or (source_type='MANAGEMENT' and source_id=m.id) or (source_type='CUSTOMS' and source_id=c.id)) group by code
 ) e;
 dates:=dates || jsonb_build_object('RECEIVED_USA',(r.received_at at time zone 'America/Guatemala')::date);
 if c.emptied_at is not null then dates:=dates||jsonb_build_object('EMPTIED',c.emptied_at); end if;
 select s into stage from unnest(steps) with ordinality as v(s,n) where dates ? s order by n desc limit 1;
 if p_action='advance' then
   if f.reception_id is null then raise exception 'Guardá el remitente antes de actualizar el estado.'; end if;
   if target is distinct from steps[array_position(steps,stage)+1] or target is null then raise exception 'Actualizá la ficha y seleccioná el siguiente estado.'; end if;
   event_date:=(p_input->>'date')::date;
   if event_date is null or event_date>today_gt or event_date<(dates->>stage)::date then raise exception 'Revisá la fecha del avance.'; end if;
   insert into eyr_tracking_private.events(organization_id,source_type,source_id,code,occurred_on,updated_by)
   values(r.organization_id,'RECEPTION',r.id,target,event_date,auth.uid())
   on conflict(organization_id,source_type,source_id,code) do update set active=true,occurred_on=excluded.occurred_on,
   revision=events.revision+1,updated_by=auth.uid(),updated_at=now();
   stage:=target; dates:=dates||jsonb_build_object(target,event_date);
   update eyr_tracking_private.yard_contacts set revision=revision+1 where reception_id=r.id returning * into f;
 elsif p_action='handoff' then
   if stage<>'EMPTIED' or f.reception_id is null or m.id is null then raise exception 'Registrá primero el vaciado y los contactos.'; end if;
   if f.confirmed_at is null then
     if (p_input->>'recipient') is null or p_input->>'recipient' not in ('sender','receiver') or
       (p_input->>'recipient'='receiver' and f.receiver_phone is null) then raise exception 'Seleccioná el contacto notificado.'; end if;
     if c.id is null then
       if f.receiver_name is null then raise exception 'Completá el nombre de quien recibe en Guatemala.'; end if;
       if exists(select 1 from public.customs_cases where organization_id=r.organization_id and upper(trim(vin))=upper(trim(r.vin)) and import_management_id is distinct from m.id and delivered_at is null and upper(current_status) not in ('CANCELADO','CANCELADA','FINALIZADO','ENTREGADO','FINALIZADO / ENTREGADO')) then
         raise exception 'Ya existe otro expediente abierto para este VIN. Revisá su vínculo antes de continuar.';end if;
       insert into public.customs_cases(organization_id,import_management_id,source_type,notice_date,emptied_at,client_name,phone,vin,make,model,model_year,vehicle_trim,bl,container_number,shipping_line,responsible,source_query_id,quote_code,office_portal_client_id,importer_id,created_by)
       values(r.organization_id,m.id,'EYR_IMPORT',today_gt,(dates->>'EMPTIED')::date,f.receiver_name,f.receiver_phone,r.vin,coalesce(m.make,r.vehicle_make),coalesce(m.model,r.vehicle_model),coalesce(m.model_year,r.model_year),m.vehicle_trim,m.bl,m.container_number,m.shipping_line,m.responsible,m.source_query_id,m.quote_code,m.office_portal_client_id,m.importer_id,auth.uid()) returning * into c;
     elsif c.emptied_at is null then
       update public.customs_cases set emptied_at=(dates->>'EMPTIED')::date where id=c.id returning * into c;
     end if;
     update public.import_managements set status='CONTROL_ADUANAL',updated_by=auth.uid(),updated_at=now() where id=m.id and status not in ('LIBERADO','ENTREGADO','CONTROL_ADUANAL');
     update eyr_tracking_private.yard_contacts set confirmed_at=now(),confirmed_by=auth.uid(),notified_contact=p_input->>'recipient',revision=revision+1 where reception_id=r.id returning * into f;
   end if;
 elsif p_action not in ('read','contacts') then raise exception 'Acción desconocida'; end if;
 return jsonb_build_object('contact',case when f.reception_id is not null then to_jsonb(f) else jsonb_build_object('sender_name',m.client_name,'sender_phone',m.phone) end,
 'stage',stage,'dates',dates,'management',m.management_code,'case_id',c.id);
end $$;
revoke all on function eyr_tracking_private.yard_import(uuid,text,jsonb) from public,anon;
grant execute on function eyr_tracking_private.yard_import(uuid,text,jsonb) to authenticated;
create function public.eyr_yard_import(p_id uuid,p_action text,p_input jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select eyr_tracking_private.yard_import(p_id,p_action,p_input)$$;
revoke all on function public.eyr_yard_import(uuid,text,jsonb) from public,anon;
grant execute on function public.eyr_yard_import(uuid,text,jsonb) to authenticated;
commit;
