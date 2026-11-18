import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./paper.css?inline";
import port from "./port.webp";
import "./controls.css";

const currency = new Intl.NumberFormat("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = cents => "Q " + currency.format(cents / 100);
const cents = amount => Math.round(Number(amount) * 100);
const dateLabel = (date, options) => date.toLocaleDateString("es-GT", { ...options, timeZone: "UTC" });

export function ReportPaper({ month, data }) {
  const [year, number] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, number, 0));
  const cutoff = dateLabel(end, {day:"numeric", month:"long", year:"numeric"});
  const period = dateLabel(end, {month:"long", year:"numeric"});
  const receipts = data.receipts.reduce((total, row) => total + cents(row.amount), 0);
  const groups = new Map();
  let paid = 0;
  for (const row of data.payments) {
    const category = row.category || "Otros";
    const value = cents(row.amount);
    groups.set(category, (groups.get(category) || 0) + value);
    paid += value;
  }
  const ranked = [...groups].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  const leaders = ranked.filter(([,amount]) => amount === ranked[0][1]);
  return <main>
    <header><img src="/branding/eyr-logo-horizontal.png" alt="EyR Solutions · Agencia Aduanal"/><time>{cutoff}</time></header>
    <hgroup><h1>Reporte financiero mensual</h1><p>{period}</p></hgroup>
    <section className="summary" style={{backgroundImage:'url("'+port+'")'}}>
      {[["Ingresos cobrados",receipts],["Salidas pagadas",paid],["Diferencia",receipts-paid]].map(([label,value])=><div key={label}><b>{label}</b><strong>{money(value)}</strong></div>)}
    </section>
    <div className="columns">
      <section><h2>Origen de los ingresos</h2>{data.receipts.map(row=><div className="line" key={row.label}><span>{row.label}</span><span>{money(cents(row.amount))}</span></div>)}</section>
      <section><h2>Distribución de gastos</h2>{ranked.map(([label,value])=>{
        const percent = paid ? value / paid * 100 : 0;
        return <div className="distribution" key={label}><span>{label}</span><progress max="100" value={percent}/><span>{percent.toLocaleString("es-GT",{maximumFractionDigits:1})}%</span></div>;
      })}{!ranked.length && <p>Sin salidas registradas</p>}</section>
    </div>
    <aside><b>Mayor gasto del mes</b><strong>{leaders.length ? leaders.map(([name,value])=>name+" · "+money(value)).join(" / ") : "Sin salidas registradas"}</strong></aside>
    <h2>Pagos por beneficiario</h2>
    <table><thead><tr>{["Fecha","Concepto","Beneficiario","Monto"].map(title=><th key={title}>{title}</th>)}</tr></thead>
      <tbody>{data.payments.map((p,index)=><tr key={index}><td>{dateLabel(new Date(p.day+"T12:00:00Z"),{day:"numeric",month:"short"})}</td><td>{p.concept || p.category}</td><td>{p.beneficiary?.trim() || "Sin beneficiario registrado"}</td><td>{money(cents(p.amount))}</td></tr>)}
      <tr className="total"><td colSpan="3">Total pagado</td><td>{money(paid)}</td></tr></tbody>
    </table>
    <section className="closing"><div><b>Saldo bancario al cierre</b><small>Al {cutoff}</small></div><strong>{data.closing == null ? "Pendiente de cierre" : money(cents(data.closing))}</strong></section>
    <footer>Finanzas · EyR Solutions</footer>
  </main>;
}

export default function MonthlyReport({supabase, initialMonth}) {
  const dialog = useRef(null);
  const frame = useRef(null);
  const [open,setOpen] = useState(false);
  const [month,setMonth] = useState(initialMonth);
  const [paper,setPaper] = useState(null);
  const [data,setData] = useState(null);
  const [error,setError] = useState("");
  useEffect(()=>{
    if (!open || !month) return;
    let active = true;
    async function load() {
      try {
        const response = await supabase.rpc("finance_monthly_report",{p_month:month+"-01"});
        if (response.error) throw response.error;
        if (active) setData(response.data);
      } catch { if (active) setError("No se pudo cargar el reporte financiero del mes."); }
    }
    load();
    return ()=>{active=false;};
  },[supabase,open,month]);
  function reset() {setData(null);setError("");setPaper(null);}
  return <div className="eyr-report-control">
    <button type="button" onClick={()=>{reset();setMonth(initialMonth);setOpen(true);dialog.current.showModal();}}>Reporte mensual</button>
    <dialog ref={dialog} onClose={()=>{setOpen(false);reset();}}>
      <div className="eyr-report-toolbar"><label>Mes del reporte <input aria-label="Mes del reporte" type="month" value={month} onChange={e=>{reset();setMonth(e.target.value);}}/></label>
        <button type="button" disabled={!data || !paper} onClick={async()=>{const win=frame.current?.contentWindow;if(!win)return;await Promise.all([...win.document.images].map(img=>img.decode().catch(()=>{})));if(frame.current?.contentWindow===win)win.print();}}>Imprimir / Guardar PDF</button>
        <button type="button" onClick={()=>dialog.current.close()}>Cerrar</button></div>
      {open && (data ? <iframe title="Vista previa del reporte mensual" ref={frame} srcDoc={'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte financiero '+month+'</title><style>'+styles+'</style></head><body></body></html>'} onLoad={e=>setPaper(e.currentTarget.contentDocument.body)}/> : <p role="status">{error || (month ? "Cargando reporte…" : "Seleccioná un mes.")}</p>)}
      {paper && data && createPortal(<ReportPaper month={month} data={data}/>,paper)}
    </dialog>
  </div>;
}
