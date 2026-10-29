// Local Postgres fixture; no connection to live Supabase. Install @electric-sql/pglite separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.TRACKING_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const org='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const admin='10000000-0000-0000-0000-000000000001',operator='10000000-0000-0000-0000-000000000002';
const management='20000000-0000-0000-0000-000000000001',reception='30000000-0000-0000-0000-000000000001',photo='40000000-0000-0000-0000-000000000001';
const vin='1HGCM82633A004352';
await db.exec(`
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,service_role;
create table public.organizations(id uuid primary key,active boolean);
create table public.profiles(id uuid,organization_id uuid,role text,active boolean);
create function public.can_full_office_v3821() returns boolean language sql as $$select true$$;
create table public.import_managements(id uuid primary key,organization_id uuid,vin text,status text,service_mode text,make text,model text,model_year integer,updated_at timestamptz,estimated_arrival_date date);
create table public.customs_cases(id uuid primary key,organization_id uuid,import_management_id uuid,vin text,current_status text,make text,model text,model_year integer,updated_at timestamptz,
 docs_collected_at date,emptied_at date,da_at date,corroboration_at date,digitization_started_at date,review_started_at date,declaration_signed_at date,iva_form_sent_at date,iva_paid_at date,selective_at date,port_exit_at date,docs_set_built_at date,envelope_ready_at date,delivered_at date);
create table public.usa_yard_receptions(id uuid primary key,organization_id uuid,import_management_id uuid,vin text,status text,received_at timestamptz,updated_at timestamptz,vehicle_make text,vehicle_model text,model_year integer);
create table public.usa_yard_photos(id uuid primary key,organization_id uuid,reception_id uuid,storage_path text,mime_type text,created_at timestamptz);
grant select on all tables in schema public to service_role;
insert into public.organizations values('${org}',true),('${other}',true);
insert into auth.users values('${admin}'),('${operator}');
insert into public.profiles values('${admin}','${org}','ADMIN',true),('${operator}','${org}','OPERADOR',true);
insert into public.import_managements values('${management}','${org}','${vin}','EMBARCADO','FULL_IMPORT','Honda','Accord',2003,now(),'2026-12-01');
insert into public.usa_yard_receptions values('${reception}','${org}','${management}','${vin}','LINKED','2026-01-10T15:00:00Z',now(),'Honda','Accord',2003);
insert into public.usa_yard_photos values('${photo}','${org}','${reception}','${org}/usa-yard/${reception}/photo/test.jpg','image/jpeg',now());
`);
try {await db.exec(await readFile(new URL('../supabase/migrations/20261029040604_vehicle_tracking_modal.sql',import.meta.url),'utf8'));}catch(error){console.error('Migration:',error.message,'position:',error.position);process.exit(1);}
async function as(role,user,sql,params=[]){await db.exec(`set role ${role};select set_config('request.jwt.claim.sub','${user||''}',false);`);try{return (await db.query(sql,params)).rows;}finally{await db.exec('reset role');}}
const snapshot=async()=> (await as('service_role',null,'select public.eyr_tracking_snapshot_v1($1,$2) data',[org,vin]))[0].data;
const action=async(user,payload)=> (await as('authenticated',user,`select public.eyr_tracking_admin_v1(p_source_type=>$1,p_source_id=>$2,p_action=>$3,p_code=>$4,p_date=>$5,p_photo_id=>$6,p_publish=>$7,p_expected_revision=>$8) data`,[payload.type||'MANAGEMENT',payload.id||management,payload.action||'read',payload.code||null,payload.date||null,payload.photo||null,payload.publish??null,payload.revision??null]))[0].data;
test('migration applies; real receipt date only; photos are private by default',async()=>{const s=await snapshot();assert.equal(s.result,'FOUND');assert.deepEqual(s.photos,[]);assert.deepEqual(s.milestones,[{code:'RECEIVED_USA',date:'2026-01-10',manual:false}]);assert.equal(s.eta,'2026-12-01');});
test('anonymous and authenticated users cannot call server projections or access private tables',async()=>{for(const role of ['anon','authenticated']){await assert.rejects(as(role,admin,'select public.eyr_tracking_snapshot_v1($1,$2)',[org,vin]),/permission denied/);await assert.rejects(as(role,admin,'select * from eyr_tracking_private.events'),/permission denied/);await assert.rejects(as(role,admin,"select public.eyr_tracking_limit_v1('x',2)"),/permission denied/);}});
test('admin entry requires real authorized user and same tenant',async()=>{await assert.rejects(action(null,{}),/Sesión requerida/);await assert.rejects(action('10000000-0000-0000-0000-000000000099',{}),/no autorizado/);await db.exec(`insert into public.import_managements(id,organization_id,vin,status,service_mode) values('20000000-0000-0000-0000-000000000002','${other}','${vin}','EMBARCADO','FULL_IMPORT')`);await assert.rejects(action(admin,{id:'20000000-0000-0000-0000-000000000002'}),/no autorizada/);assert.equal((await snapshot()).result,'FOUND');});
test('operators record actual milestones with optimistic revisions; corrections retain audit',async()=>{await action(operator,{action:'save_event',code:'LOADED_IN_CONTAINER',date:'2026-01-12',revision:0});assert((await snapshot()).milestones.some(e=>e.code==='LOADED_IN_CONTAINER'));await assert.rejects(action(operator,{action:'save_event',code:'LOADED_IN_CONTAINER',date:'2026-01-13',revision:0}),/cambió/);await assert.rejects(action(operator,{action:'save_event',code:'DEPARTED_USA',date:'2999-01-01',revision:0}),/futuras/);await action(operator,{action:'retract_event',code:'LOADED_IN_CONTAINER',revision:1});assert(!(await snapshot()).milestones.some(e=>e.code==='LOADED_IN_CONTAINER'));assert.equal((await db.query("select count(*)::int n from eyr_tracking_private.audit where entity='events'")).rows[0].n,2);});
test('only admin can publish specific reception photos; revocation removes projection',async()=>{const payload={type:'RECEPTION',id:reception,action:'publish_photo',photo,publish:true,revision:0};await assert.rejects(action(operator,payload),/Solo administración/);await assert.rejects(action(admin,{...payload,photo:'40000000-0000-0000-0000-000000000099'}),/no autorizada/);await action(admin,payload);assert.equal((await snapshot()).photos.length,1);await action(admin,{...payload,publish:false,revision:1});assert.equal((await snapshot()).photos.length,0);});
test('duplicate unrelated open roots are ambiguous, never joined by VIN alone',async()=>{await db.exec(`insert into public.usa_yard_receptions(id,organization_id,vin,status,received_at) values('30000000-0000-0000-0000-000000000002','${org}','${vin}','PENDING_REVIEW',now())`);assert.equal((await snapshot()).result,'AMBIGUOUS');await db.exec("delete from public.usa_yard_receptions where id='30000000-0000-0000-0000-000000000002'");});
test('customs dates retain their meaning; documents do not prove vehicle delivery',async()=>{
await db.exec(`insert into public.customs_cases(id,organization_id,import_management_id,vin,current_status,delivered_at,iva_paid_at,port_exit_at,updated_at) values('50000000-0000-0000-0000-000000000001','${org}','${management}','${vin}','FINALIZADO','2026-01-20','2026-01-18','2999-01-01',now())`);
const s=await snapshot();assert(s.milestones.some(e=>e.code==='CUSTOMS_HANDOVER'));assert(s.milestones.some(e=>e.code==='RECEIVED_USA'));assert(!s.milestones.some(e=>e.code==='DELIVERED'||e.code==='PORT_EXIT'));
await db.exec(`update public.import_managements set service_mode='CUSTOMS_ONLY' where id='${management}'`);
assert(!(await snapshot()).milestones.some(e=>e.code==='RECEIVED_USA'));await assert.rejects(action(operator,{action:'save_event',code:'DEPARTED_USA',date:'2026-01-12',revision:0}),/solo aduanal/);
await db.exec(`update public.import_managements set service_mode='FULL_IMPORT' where id='${management}'`);
});
test('rate limits enforce atomic server budget',async()=>{assert.equal((await as('service_role',null,"select public.eyr_tracking_limit_v1('test',1) ok"))[0].ok,true);assert.equal((await as('service_role',null,"select public.eyr_tracking_limit_v1('test',1) ok"))[0].ok,false);});
test.after(async()=>await db.close());
