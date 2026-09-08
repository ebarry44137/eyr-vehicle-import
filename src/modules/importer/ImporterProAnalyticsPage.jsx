import { useEffect, useMemo, useState } from "react";
import "./importer-pro.css";

function money(value, currency) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "es-GT", { style:"currency", currency, minimumFractionDigits:2 }).format(Number(value || 0));
}

export default function ImporterProAnalyticsPage({ supabase, organizationId }) {
  const [records, setRecords] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    if (!organizationId) return;
    setLoading(true); setError("");
    try {
      const [{data:r,error:re},{data:e,error:ee}] = await Promise.all([
        supabase.from("importer_customs_records").select("*").eq("organization_id",organizationId),
        supabase.from("importer_customs_expenses").select("*").eq("organization_id",organizationId),
      ]);
      if (re) throw re; if (ee) throw ee;
      setRecords(Array.isArray(r)?r:[]); setExpenses(Array.isArray(e)?e:[]);
    } catch(err) { console.error("V39.7.5 PRO ANALYTICS ERROR:",err); setError(err?.message || "No fue posible cargar las estadísticas."); }
    finally { setLoading(false); }
  }
  useEffect(()=>{loadData();},[organizationId]);

  const data=useMemo(()=>{
    const finalized=records.filter(r=>r.status==="FINALIZADO").length;
    const active=records.filter(r=>!["FINALIZADO","CANCELADO"].includes(r.status)).length;
    const offices={}; records.forEach(r=>{const k=r.office_name||"Sin oficina"; offices[k]=(offices[k]||0)+1;});
    const topOffices=Object.entries(offices).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const categories={}; expenses.forEach(e=>{const k=e.category||"OTRO"; categories[k]=(categories[k]||0)+Number(e.amount||0);});
    const topCategories=Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const usd=records.reduce((s,r)=>s+Number(r.invoice_value_usd||0),0)+expenses.filter(e=>e.currency==="USD").reduce((s,e)=>s+Number(e.amount||0),0);
    const gtq=records.reduce((s,r)=>s+Number(r.estimated_taxes_gtq||0)+Number(r.manager_fees_gtq||0),0)+expenses.filter(e=>e.currency==="GTQ").reduce((s,e)=>s+Number(e.amount||0),0);
    const completedDurations=records.filter(r=>r.status==="FINALIZADO" && r.opened_at && r.updated_at).map(r=>Math.max(0,Math.round((new Date(r.updated_at)-new Date(r.opened_at))/86400000)));
    const avgDays=completedDurations.length ? Math.round(completedDurations.reduce((a,b)=>a+b,0)/completedDurations.length) : 0;
    return {finalized,active,topOffices,topCategories,usd,gtq,avgDays};
  },[records,expenses]);

  const maxOffice=Math.max(1,...data.topOffices.map(([,v])=>v));
  const maxCategory=Math.max(1,...data.topCategories.map(([,v])=>v));

  return <section className="importer-pro-page">
    <header className="importer-pro-hero"><div><span>IMPORTADOR PRO · ANALÍTICA</span><h1>Estadísticas</h1><p>Medí tu operación: trámites, oficinas utilizadas, costos y tiempos de gestión.</p></div><button className="pro-primary" onClick={loadData}>↻ Actualizar</button></header>
    {error && <div className="pro-message error">{error}</div>}
    <section className="importer-pro-kpis four">
      <article><small>GESTIONES</small><strong>{records.length}</strong><span>{data.active} activas</span></article>
      <article><small>FINALIZADAS</small><strong>{data.finalized}</strong><span>{records.length ? Math.round((data.finalized/records.length)*100) : 0}% del historial</span></article>
      <article><small>TIEMPO PROMEDIO</small><strong>{data.avgDays || "—"}</strong><span>{data.avgDays ? "días por gestión finalizada" : "Sin datos suficientes"}</span></article>
      <article className="highlight"><small>INVERSIÓN CONTROLADA</small><strong>{money(data.gtq,"GTQ")}</strong><span>+ {money(data.usd,"USD")}</span></article>
    </section>
    {loading ? <div className="pro-empty">Analizando tus datos...</div> : <section className="pro-analytics-grid">
      <article className="importer-pro-card"><div className="pro-card-head"><div><small>OFICINAS / GESTORES</small><h2>Con quién has trabajado</h2></div></div><div className="pro-bars">{data.topOffices.length===0?<div className="pro-empty small">Sin datos todavía.</div>:data.topOffices.map(([name,value])=><div className="pro-bar-row" key={name}><div><strong>{name}</strong><span>{value} gestión{value===1?"":"es"}</span></div><div className="pro-bar"><i style={{width:`${Math.max(8,(value/maxOffice)*100)}%`}}/></div></div>)}</div></article>
      <article className="importer-pro-card"><div className="pro-card-head"><div><small>DISTRIBUCIÓN</small><h2>Gastos por categoría</h2></div></div><div className="pro-bars">{data.topCategories.length===0?<div className="pro-empty small">Registrá costos para ver la distribución.</div>:data.topCategories.map(([name,value])=><div className="pro-bar-row" key={name}><div><strong>{name.replaceAll("_"," ")}</strong><span>{value.toLocaleString("es-GT",{maximumFractionDigits:2})}</span></div><div className="pro-bar"><i style={{width:`${Math.max(8,(value/maxCategory)*100)}%`}}/></div></div>)}</div></article>
    </section>}
  </section>;
}
