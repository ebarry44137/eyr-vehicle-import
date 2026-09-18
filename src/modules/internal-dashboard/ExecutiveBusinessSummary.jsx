import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./executive-business-summary.css";

const q=(v)=>`Q ${Number(v||0).toLocaleString("es-GT",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const n=(v)=>Number(v||0);
const row1=(d)=>(Array.isArray(d)?d[0]||{}:d||{});
const yOf=(v)=>{if(!v)return 0;const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?0:d.getFullYear();};
const mOf=(v)=>{if(!v)return -1;const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?-1:d.getMonth();};
const MONTHS=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

function account(r){return{
 id:r?.client_id||r?.id||r?.customer_id||r?.client_name,
 name:r?.client_name||r?.customer_name||r?.name||"Cliente",
 billed:n(r?.billed_gtq??r?.worked_gtq??r?.total_worked_gtq),
 paid:n(r?.paid_gtq??r?.collected_gtq??r?.total_paid_gtq),
 pending:n(r?.pending_gtq??r?.balance_gtq??r?.total_pending_gtq),
 count:n(r?.work_count??r?.works_count??r?.movements_count)
};}

export default function ExecutiveBusinessSummary({onNavigate,isAdmin=false}){
 const currentYear=new Date().getFullYear();
 const [year,setYear]=useState(currentYear);
 const [summary,setSummary]=useState({});
 const [reserves,setReserves]=useState({});
 const [expenses,setExpenses]=useState([]);
 const [declarations,setDeclarations]=useState([]);
 const [customs,setCustoms]=useState([]);
 const [accounts,setAccounts]=useState([]);
 const [historical,setHistorical]=useState([]);
 const [loading,setLoading]=useState(false);
 const [notice,setNotice]=useState("");

 useEffect(()=>{if(!isAdmin)return;let alive=true;
  async function load(){
   setLoading(true);setNotice("");
   const from=`${year}-01-01`,to=`${year}-12-31`;
   const calls=await Promise.allSettled([
    supabase.rpc("finance_period_summary",{p_from:from,p_to:to}),
    supabase.rpc("finance_operational_reserves_v39622",{p_from:from,p_to:to}),
    supabase.from("finance_expenses").select("*").gte("expense_date",from).lte("expense_date",to),
    supabase.rpc("list_declaration_services_secure",{p_search:null}),
    supabase.from("customs_cases").select("*").order("updated_at",{ascending:false}).limit(300),
    supabase.rpc("list_customer_accounts_admin_v36"),
    supabase.rpc("list_historical_customer_accounts_v397995")
   ]);
   if(!alive)return;
   const val=(r)=>r.status==="fulfilled"&&!r.value?.error?r.value?.data||[]:[];
   setSummary(row1(val(calls[0])));setReserves(row1(val(calls[1])));setExpenses(val(calls[2]));
   setDeclarations(val(calls[3]).filter(r=>String(r?.status||"").toUpperCase()!=="ANULADA"&&yOf(r?.declaration_date||r?.created_at)===year));
   setCustoms(val(calls[4]).filter(r=>yOf(r?.notice_date||r?.created_at)===year));
   setAccounts(val(calls[5]));setHistorical(val(calls[6]));
   const labels=["resumen financiero","apartados","egresos","declaraciones","control aduanal","cuentas","cartera histórica"];
   const failed=calls.map((r,i)=>(r.status!=="fulfilled"||r.value?.error)?labels[i]:null).filter(Boolean);
   if(failed.length)setNotice(`Datos parcialmente disponibles: ${failed.join(", ")}.`);
   setLoading(false);
  } load();return()=>{alive=false;};
 },[year,isAdmin]);

 const merged=useMemo(()=>{const map=new Map();[...accounts,...historical].map(account).forEach(r=>{const k=String(r.id||r.name).toUpperCase();const p=map.get(k)||{...r,billed:0,paid:0,pending:0,count:0};p.billed+=r.billed;p.paid+=r.paid;p.pending+=r.pending;p.count+=r.count;map.set(k,p);});return[...map.values()];},[accounts,historical]);
 const top=useMemo(()=>[...merged].filter(r=>r.count>0||r.billed>0).sort((a,b)=>(b.count-a.count)||(b.billed-a.billed)).slice(0,7),[merged]);
 const monthly=useMemo(()=>{const rows=MONTHS.map((label,month)=>({label,month,declarations:0,customs:0,expenses:0}));declarations.forEach(r=>{const m=mOf(r?.declaration_date||r?.created_at);if(m>=0)rows[m].declarations++;});customs.forEach(r=>{const m=mOf(r?.notice_date||r?.created_at);if(m>=0)rows[m].customs++;});expenses.forEach(r=>{const m=mOf(r?.expense_date||r?.created_at);if(m>=0)rows[m].expenses+=n(r?.amount_gtq);});return rows;},[declarations,customs,expenses]);
 const groups=useMemo(()=>{const map=new Map();expenses.forEach(r=>{const k=String(r?.category||"OTROS").toUpperCase();map.set(k,(map.get(k)||0)+n(r?.amount_gtq));});return[...map.entries()].map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount).slice(0,6);},[expenses]);

 if(!isAdmin)return null;
 const total=declarations.length+customs.length,billed=n(summary?.billed_gtq),collected=n(summary?.collected_gtq),receivable=n(summary?.receivable_gtq),direct=n(summary?.direct_costs_gtq),general=n(summary?.general_expenses_gtq),profit=n(summary?.net_result_gtq),cash=n(summary?.cash_result_gtq),reserved=n(reserves?.total_pending_gtq),available=cash-reserved,maxOps=Math.max(...monthly.map(m=>m.declarations+m.customs),1);

 return <section className="eyr-exec">
  <div className="eyr-exec-head"><div><small>RESUMEN EJECUTIVO · SOLO ADMINISTRADORES</small><h2>Radiografía del negocio</h2><p>Rentabilidad, caja disponible y producción consolidada de E&R Solutions.</p></div><div className="eyr-exec-year"><span>AÑO</span><select value={year} onChange={e=>setYear(Number(e.target.value))}>{[0,1,2,3].map(b=><option key={currentYear-b} value={currentYear-b}>{currentYear-b}</option>)}</select></div></div>
  {notice&&<div className="eyr-exec-notice">⚠️ {notice}</div>}
  <div className="eyr-exec-kpis eyr-exec-kpis-admin">
   <article><span>📦</span><small>GESTIONES DEL AÑO</small><strong>{loading?"…":total}</strong><p>{declarations.length} declaraciones · {customs.length} control aduanal</p></article>
   <article><span>💰</span><small>FACTURADO</small><strong>{loading?"…":q(billed)}</strong><p>Declaraciones + Control Aduanal</p></article>
   <article><span>💵</span><small>COBRADO</small><strong>{loading?"…":q(collected)}</strong><p>Dinero recibido</p></article>
   <article className="warn"><span>⏳</span><small>POR COBRAR</small><strong>{loading?"…":q(receivable)}</strong><p>Cartera pendiente</p></article>
   <article><span>🧾</span><small>COSTOS DIRECTOS</small><strong>{loading?"…":q(direct)}</strong><p>Gestiones / terceros</p></article>
   <article><span>🏢</span><small>GASTOS GENERALES</small><strong>{loading?"…":q(general)}</strong><p>Sueldos, renta, servicios...</p></article>
   <article className={profit>=0?"positive":"danger"}><span>📈</span><small>UTILIDAD DEL PERÍODO</small><strong>{loading?"…":q(profit)}</strong><p>Facturado − costos − gastos</p></article>
   <article className={available>=0?"available":"danger"}><span>🏦</span><small>DISPONIBLE NO COMPROMETIDO</small><strong>{loading?"…":q(available)}</strong><p>Flujo {q(cash)} − apartados {q(reserved)}</p></article>
  </div>
  <div className="eyr-exec-grid eyr-exec-grid-admin">
   <article className="eyr-exec-panel eyr-exec-monthly"><div className="eyr-exec-panel-head"><div><small>PRODUCCIÓN MENSUAL</small><h3>Declaraciones + Control Aduanal</h3></div><button type="button" onClick={()=>onNavigate?.("finance")}>Ver Finanzas →</button></div><div className="eyr-exec-month-bars">{monthly.map(m=>{const t=m.declarations+m.customs;return <div className="eyr-exec-month" key={m.label}><div className="eyr-exec-bar-area" title={`${m.label}: ${t} gestiones`}><span style={{height:`${Math.max(4,(t/maxOps)*100)}%`}}/></div><strong>{m.label}</strong><small>{t}</small><em>D {m.declarations} · C {m.customs}</em></div>;})}</div><div className="eyr-exec-legend"><span><i/> Altura = total de gestiones</span><span>D = Declaraciones · C = Control Aduanal</span></div></article>
   <article className="eyr-exec-panel"><div className="eyr-exec-panel-head"><div><small>PRODUCCIÓN</small><h3>Clientes principales</h3></div></div><div className="eyr-exec-list">{top.map((c,i)=><div key={`${c.id}-${i}`}><span className="rank">{i+1}</span><p><strong>{c.name}</strong><small>{c.count} gestiones · Pend. {q(c.pending)}</small></p><b>{q(c.billed)}</b></div>)}{!top.length&&<p className="eyr-exec-empty">Sin datos disponibles.</p>}</div></article>
   <article className="eyr-exec-panel"><div className="eyr-exec-panel-head"><div><small>DISTRIBUCIÓN DE EGRESOS</small><h3>¿En qué se está gastando?</h3></div></div><div className="eyr-exec-list eyr-exec-expenses">{groups.map(g=><div key={g.name}><p><strong>{g.name}</strong></p><b>{q(g.amount)}</b></div>)}{!groups.length&&<p className="eyr-exec-empty">Sin egresos registrados.</p>}</div></article>
  </div>
  <div className="eyr-exec-footnote"><span>🔐</span><p><strong>Vista administrativa.</strong> La utilidad usa el mismo resumen de Finanzas. El disponible no comprometido parte del flujo de caja y descuenta los apartados operativos vigentes calculados por Finanzas.</p></div>
 </section>;
}
