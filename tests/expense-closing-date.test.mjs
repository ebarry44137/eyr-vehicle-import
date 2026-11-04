import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.FINANCE_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const org='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const admin='10000000-0000-0000-0000-000000000001',otherAdmin='10000000-0000-0000-0000-000000000002',operator='10000000-0000-0000-0000-000000000003';
const fixture=async name=>readFile(new URL('./fixtures/'+name,import.meta.url),'utf8');
const closingDefinition=await fixture('create_finance_closing-baseline.sql');
const closingColumns=closingDefinition.match(/insert into public\.finance_closings \(([\s\S]*?)\)\s*values/i)[1].split(',').map(x=>x.trim());
const columnType=name=>name.endsWith('_id')?'uuid':name.endsWith('_at')||name.startsWith('bank_cutoff_')?'timestamptz':['period_start','period_end'].includes(name)?'date':name.endsWith('_gtq')?'numeric': 'text';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
create table public.organizations(id uuid primary key,active boolean);
create table public.profiles(id uuid primary key,organization_id uuid,role text,active boolean);
create function public.current_organization_id_v3821() returns uuid language sql as $$select organization_id from public.profiles where id=auth.uid()$$;
create function public.is_tenant_admin_v3821() returns boolean language sql as $$select coalesce((select role='ADMIN' and active from public.profiles where id=auth.uid()),false)$$;
create function public.can_full_office_v3821() returns boolean language sql as $$select public.is_tenant_admin_v3821()$$;
create function public.assert_finance_admin() returns void language plpgsql security definer as $$begin if auth.uid() is null or not public.is_tenant_admin_v3821() then raise exception 'Finanzas no autorizadas' using errcode='42501';end if;end$$;
create table public.customs_cases(id uuid primary key,organization_id uuid,notice_date date);
create table public.customs_case_finance(organization_id uuid,customs_case_id uuid,client_charge_gtq numeric,corroboration_cost_gtq numeric,includes_duca boolean,duca_cost_gtq numeric,document_collection_cost_gtq numeric,dispatch_management_cost_gtq numeric,other_direct_cost_gtq numeric);
create table public.declaration_services(organization_id uuid,charge_gtq numeric,duca_correlative_id uuid,declaration_date date,status text);
create table public.duca_correlatives(id uuid,batch_id uuid);
create table public.duca_correlative_batches(id uuid,unit_cost_gtq numeric);
create table public.finance_case_payments(organization_id uuid,amount_gtq numeric,payment_date date);
create table public.declaration_service_payments(organization_id uuid,amount_gtq numeric,payment_date date);
create table public.finance_expenses(organization_id uuid,amount_gtq numeric,expense_date date);
create table public.finance_accounts_payable(id uuid,organization_id uuid,original_amount_gtq numeric,created_at timestamptz);
create table public.finance_accounts_payable_payments(payable_id uuid,amount_gtq numeric,payment_date date,created_at timestamptz);
create table public.finance_bank_reconciliations(id uuid primary key,organization_id uuid,status text,effective_at timestamptz,created_at timestamptz,balance_gtq numeric);
create table public.finance_closings(id uuid primary key default gen_random_uuid(),created_at timestamptz default now(),${closingColumns.map(name=>name+' '+columnType(name)).join(',')});
create function public.finance_bank_movement_between(p_from timestamptz,p_to timestamptz) returns table(net_bank_movement_gtq numeric,total_bank_outflows_gtq numeric,total_collections_gtq numeric) language sql as $$select 50::numeric,20::numeric,70::numeric$$;
insert into public.organizations values('${org}',true),('${other}',true);
insert into auth.users values('${admin}'),('${otherAdmin}'),('${operator}');
insert into public.profiles values('${admin}','${org}','ADMIN',true),('${otherAdmin}','${other}','ADMIN',true),('${operator}','${org}','OPERADOR',true);
insert into public.customs_cases values('20000000-0000-0000-0000-000000000001','${org}','2026-10-15');
insert into public.customs_case_finance values('${org}','20000000-0000-0000-0000-000000000001',10000,1000,true,80,300,100,520);
insert into public.duca_correlative_batches values('30000000-0000-0000-0000-000000000001',100);
insert into public.duca_correlatives values('30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001');
insert into public.declaration_services values('${org}',1000,'30000000-0000-0000-0000-000000000002','2026-10-15','ACTIVA');
insert into public.finance_case_payments values('${org}',4000,'2026-10-15');insert into public.declaration_service_payments values('${org}',500,'2026-10-15');
insert into public.finance_expenses values('${org}',1000,'2026-10-15');
insert into public.finance_accounts_payable values('40000000-0000-0000-0000-000000000001','${org}',300,'2026-10-10');
insert into public.finance_accounts_payable_payments values('40000000-0000-0000-0000-000000000001',200,'2026-10-15','2026-10-15');
insert into public.finance_bank_reconciliations values('50000000-0000-0000-0000-000000000001','${org}','ACTIVE','2026-10-01','2026-10-01',10000);
insert into public.finance_closings(organization_id,closing_code,period_start,period_end,status,bank_cutoff_to,closing_cash_gtq,closed_at) values('${org}','FIN-2026-0003','2026-10-01','2026-10-04','ACTIVE','2026-10-04',10000,'2026-10-04');
`);
await db.exec(await fixture('finance_period_summary-baseline.sql'));await db.exec(closingDefinition);
async function call(user,sql,params=[],role='authenticated'){await db.exec(`set role ${role};select set_config('request.jwt.claim.sub','${user||''}',false);`);try{return (await db.query(sql,params)).rows;}finally{await db.exec('reset role');}}
const summary=async(user=admin,from='2026-10-01',to='2026-10-31')=>(await call(user,'select * from public.finance_period_summary($1,$2)',[from,to]))[0];
await db.exec(await readFile(new URL('../supabase/migrations/20261103233952_freight_net_settlements.sql',import.meta.url),'utf8'));
await db.exec(`
alter table public.finance_case_payments add column created_at timestamptz;alter table public.finance_case_payments add column money_account text default 'BANK';
alter table public.declaration_service_payments add column created_at timestamptz;alter table public.declaration_service_payments add column money_account text default 'BANK';
alter table public.finance_expenses add column created_at timestamptz;alter table public.finance_expenses add column money_account text default 'BANK';
alter table public.finance_accounts_payable_payments add column money_account text default 'BANK';
create table public.finance_customs_bank_outflows_v3991814(id bigint generated always as identity,organization_id uuid,amount_gtq numeric,money_account text,created_at timestamptz);
update public.finance_case_payments set created_at='2026-10-15T12:00:00Z';update public.declaration_service_payments set created_at='2026-10-15T12:00:00Z';update public.finance_expenses set created_at='2026-10-15T12:00:00Z';
update public.finance_closings set bank_cutoff_to='2026-10-04T16:58:48Z';
insert into public.finance_case_payments values('${org}',999,'2026-10-04','2026-10-04T16:58:48Z','BANK'),('${org}',1000,'2026-10-04','2026-10-04T16:58:48.000001Z','BANK'),('${org}',77,'2026-10-31','2026-11-01T05:59:59.999999Z','BANK'),('${org}',333,'2026-11-01','2026-11-01T06:00:00Z','BANK'),('${other}',9000,'2026-10-30','2026-10-30T18:00:00Z','BANK'),('${org}',5000,'2026-10-30','2026-10-30T18:00:00Z','CASH');
insert into public.finance_customs_bank_outflows_v3991814(organization_id,amount_gtq,money_account,created_at) values('${org}',80,'BANK','2026-10-30T12:00:00Z');
insert into public.finance_accounts_payable values('40000000-0000-0000-0000-000000000002','${org}',800,'2026-11-02T12:00:00Z');
`);
await db.exec('drop function public.finance_bank_movement_between(timestamptz,timestamptz)');
await db.exec(await fixture('finance_bank_movement_between-before-cutoff.sql'));
await db.exec(await fixture('finance_next_closing_preview-before-cutoff.sql'));
try{await db.exec(await readFile(new URL('../supabase/migrations/20261104000141_finance_closing_selected_cutoff.sql',import.meta.url),'utf8'));}catch(error){console.error('Date migration:',error.message,error.position);process.exit(1);}

await db.exec("alter table public.finance_bank_reconciliations add column reconciliation_type text default 'MANUAL'");
await db.exec(await fixture('finance_bank_dashboard-before-bank-receipt.sql'));
await db.exec(`insert into eyr_finance_private.freight_net_settlements(organization_id,period_month,amount_gtq,concept,source_reference,note,recorded_via) values('${org}','2026-10-01',1375.25,'Liquidación ficticia','BANK-TEST','Prueba sin datos reales','TEST'),('${other}','2026-10-01',9000,'Otra organización','BANK-OTHER','Prueba','TEST')`);
const dashboard=async()=>(await call(admin,'select * from public.finance_bank_dashboard()'))[0];
const preview=async(from='2026-10-05',to='2026-10-31')=>(await call(admin,'select * from public.finance_next_closing_preview($1,$2)',[from,to]))[0];
const read=async(from='2026-10-01',to='2026-10-31',user=admin)=>(await call(user,'select public.finance_freight_settlements_v1($1,$2) result',[from,to]))[0].result;
const bankBefore=await dashboard(),previewBefore=await preview(),profitBefore=await summary();
await db.exec(await readFile(new URL('../supabase/migrations/20261104002757_freight_bank_receipt.sql',import.meta.url),'utf8'));


await db.exec("alter table public.finance_expenses add column id uuid default gen_random_uuid();alter table public.finance_expenses add column note text");
await db.exec(`insert into public.finance_expenses(organization_id,amount_gtq,expense_date,created_at,money_account,note) values('${org}',600,'2026-10-31',clock_timestamp(),'BANK','Fixture A'),('${org}',800,'2026-10-31',clock_timestamp(),'BANK','Fixture B')`);
const lateRows=(await db.query("select id,created_at from public.finance_expenses where note in ('Fixture A','Fixture B') order by note")).rows;
const beforeBank=await dashboard(),beforePreview=await preview(),beforeProfit=await summary();
await db.exec(await readFile(new URL('../supabase/migrations/20261104165207_expense_closing_dates.sql',import.meta.url),'utf8'));
async function write(sql,params=[],user=admin){await db.exec(`select set_config('request.jwt.claim.sub','${user}',false)`);return db.query(sql,params);}

test('install preserves legacy expenses, bank, preview, and profit before explicit assignment',async()=>{assert.deepEqual(await dashboard(),beforeBank);assert.deepEqual({...await preview(),calculated_at:null},{...beforePreview,calculated_at:null});assert.deepEqual(await summary(),beforeProfit);assert.equal((await db.query('select count(*)::int n from public.finance_expenses where bank_closing_date is not null')).rows[0].n,0);});
test('late recorded expenses use selected October date once, preserving current bank, profit, row count and creation audit',async()=>{
 await write("update public.finance_expenses set bank_closing_date=expense_date where note in ('Fixture A','Fixture B')");
 const p=await preview();assert.equal(Number(p.general_expenses_gtq)-Number(beforePreview.general_expenses_gtq),1400);assert.equal(Number(p.projected_bank_balance_gtq)-Number(beforePreview.projected_bank_balance_gtq),-1400);assert.equal(Number(p.general_expenses_count)-Number(beforePreview.general_expenses_count),2);assert.deepEqual(await dashboard(),beforeBank);assert.deepEqual(await summary(),beforeProfit);
 const rows=(await db.query("select id,created_at,bank_closing_date,bank_closing_recorded_at from public.finance_expenses where note in ('Fixture A','Fixture B') order by note")).rows;assert.equal(rows.length,2);for(let i=0;i<2;i++){assert.equal(rows[i].created_at.getTime(),lateRows[i].created_at.getTime());assert.equal(rows[i].bank_closing_date.toISOString().slice(0,10),'2026-10-31');assert(rows[i].bank_closing_recorded_at>new Date('2026-11-01T06:00:00Z'));}
});
test('new bank expenses automatically use selected date and cash does not affect bank',async()=>{
 await write(`insert into public.finance_expenses(organization_id,amount_gtq,expense_date,created_at,money_account,note) values('${org}',45,'2026-10-30',clock_timestamp(),'BANK','New selected date'),('${org}',50,'2026-10-30',clock_timestamp(),'CASH','Cash expense')`);
 const p=await preview();assert.equal(Number(p.general_expenses_gtq)-Number(beforePreview.general_expenses_gtq),1445);assert.equal(Number((await dashboard()).calculated_bank_balance_gtq)-Number(beforeBank.calculated_bank_balance_gtq),-45);const row=(await db.query("select bank_closing_date from public.finance_expenses where note='New selected date'")).rows[0];assert.equal(row.bank_closing_date.toISOString().slice(0,10),'2026-10-30');assert.equal((await db.query("select bank_closing_date from public.finance_expenses where note='Cash expense'")).rows[0].bank_closing_date,null);
});
test('creation timestamp, reconciled/closed dates, future dates, tenants and permissions are protected',async()=>{
 await assert.rejects(write("update public.finance_expenses set created_at=created_at-interval '1 day' where note='Fixture A'"),/inmutable/);
 await assert.rejects(write("update public.finance_expenses set expense_date='2026-10-01' where note='Fixture A'"),/conciliación|cierre activo/);
 await assert.rejects(write("update public.finance_expenses set expense_date='2999-01-01' where note='Fixture A'"),/futuras/);
 await assert.rejects(write("update public.finance_expenses set expense_date='2026-10-29' where note='Fixture A'",[],otherAdmin),/Organización/);
 await assert.rejects(write("update public.finance_expenses set expense_date='2026-10-29' where note='Fixture A'",[],operator),/no autorizadas/);
 await assert.rejects(call(admin,"select * from eyr_finance_private.dated_expenses_between($1,'2026-10-05','2026-11-01')",[org]),/permission denied/);
});
test('October close matches preview; November does not deduct October expenses again and closed expenses cannot be reassigned',async()=>{
 const p=await preview();const result=(await call(admin,"select * from public.create_finance_closing('MENSUAL','2026-10-05','2026-10-31',0)"))[0];const row=(await db.query('select * from public.finance_closings where id=$1',[result.id])).rows[0];assert.equal(Number(row.closing_cash_gtq),Number(p.projected_bank_balance_gtq));assert.equal(Number(row.bank_outflows_gtq),Number(p.total_bank_outflows_gtq));const next=await preview('2026-11-01',(new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Guatemala'})).format(new Date()));assert.equal(Number(next.general_expenses_gtq),0);assert.equal(Number(next.opening_bank_gtq),Number(row.closing_cash_gtq));assert.equal(Number(next.total_collections_gtq),333);
 await assert.rejects(write("update public.finance_expenses set amount_gtq=601 where note='Fixture A'"),/cierre activo/);
});
test.after(async()=>await db.close());
