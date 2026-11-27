import React, { useEffect, useState, useRef } from "react";
const StatementPages = React.lazy(() => import("./StatementPages"));
import { caseStatement, currency } from "./caseStatement";
import "./caseExpenses.css";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala" }).format(new Date());
const emptyForm = () => ({ date: today(), type: "Almacenaje", detail: "", amount: "", payee: "", source: "BANK" });
const vehicle = c => [c.model_year, c.make, c.model || c.vehicle_model, c.vin].filter(Boolean).join(" · ");
const day = date => String(date || "").split("-").reverse().join("/");
async function rpc(db, name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}
function readImage(file) {
  if (!file) return null;
  if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 2*1024*1024)
    throw new Error("Elegí una imagen JPG, PNG o WebP de hasta 2 MB.");
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer el comprobante."));
    reader.readAsDataURL(file);
  });
}

export function CaseExpenses({ db, onStatement }) {
  const [search,setSearch] = useState(""), [cases,setCases] = useState([]), [record,setRecord] = useState(null);
  const [form,setForm] = useState(emptyForm), [file,setFile] = useState(null), [sequence,setSequence] = useState(0);
  const [history,setHistory] = useState([]), [matches,setMatches] = useState([]), [existing,setExisting] = useState("");
  const [message,setMessage] = useState(""), [error,setError] = useState(""), [saving,setSaving] = useState(false);
  const [checking,setChecking] = useState(false), [receipt,setReceipt] = useState(null);
  const request = useRef(crypto.randomUUID()), locked = useRef(false);
  useEffect(() => {
    if (record) return;
    let active = true;
    const timer = setTimeout(async () => {
      let query = db.from("customs_cases").select("id,case_code,client_name,vin,model_year,make,model,vehicle_model,document_collection_gtq,port_expenses_gtq,professional_fees_gtq,other_charges_gtq,other_charges_note,crane_usd").order("created_at",{ascending:false}).limit(15);
      const term = search.trim().replace(/[^\p{L}\p{N} &-]/gu," ");
      if (term) query = query.or(["case_code","client_name","vin"].map(k => k+".ilike.%"+term+"%").join(","));
      const {data,error} = await query;
      if (active) {setCases(data || []); if(error) setError(error.message);}
    },200);
    return () => {active=false; clearTimeout(timer);};
  },[db,record,search]);
  useEffect(() => {
    let active=true;
    setHistory([]); setReceipt(null);
    if(record) rpc(db,"customs_statement",{p_case:record.id}).then(data=>{if(active)setHistory(data.expenses);}).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[db,record,sequence]);
  useEffect(() => {
    let active=true;
    setMatches([]); setExisting("");
    const check=Boolean(record && Number(form.amount)>0 && form.date && form.source!=="DIRECT");
    setChecking(check);
    const timer=setTimeout(async()=>{
      if(!check)return;
      try {
        const rows=await rpc(db,"customs_expense_matches",{p_case:record.id,p_date:form.date,p_amount:Number(form.amount),p_source:form.source});
        if(active){setMatches(rows);setChecking(false);}
      } catch(e){if(active)setError(e.message);}
    },200);
    return ()=>{active=false;clearTimeout(timer);};
  },[db,record,form.amount,form.date,form.source,sequence]);
  const field = name => ({value:form[name],onChange:e=>setForm({...form,[name]:e.target.value})});
  async function save(e) {
    e.preventDefault();
    if(locked.current || !record || checking)return;
    locked.current=true;setSaving(true);setError("");setMessage("");
    try {
      const concept=form.type==="Otros" ? form.detail.trim() : [form.type,form.detail.trim()].filter(Boolean).join(" · ");
      await rpc(db,"customs_register_expense",{p_case:record.id,p_request:request.current,p_date:form.date,p_concept:concept,
        p_payee:form.payee.trim(),p_amount:Number(form.amount),p_source:form.source,p_existing:existing && existing!=="new"?existing:null,p_receipt:await readImage(file)});
      setMessage("Gasto registrado en "+record.case_code+".");setForm(emptyForm());setFile(null);setSequence(x=>x+1);
      request.current=crypto.randomUUID();
    } catch(e){setError(e.message);} finally{locked.current=false;setSaving(false);}
  }
  return <section className="ce-card"><h2>Registrar gasto por cobrar</h2>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <fieldset disabled={saving}><label>Gestión<input type="search" placeholder="Buscar expediente, cliente o VIN" value={record ? record.case_code+" · "+record.client_name : search}
      onChange={e=>{setRecord(null);setSearch(e.target.value);setMessage("");setError("");}} /></label>
    {record ? <p>{vehicle(record)} <button type="button" onClick={()=>{setRecord(null);setSearch("");setMessage("");}}>Cambiar gestión</button></p> :
    <div className="ce-results">{cases.map(c=><button key={c.id} onClick={()=>{setRecord(c);setError("");setMessage("");request.current=crypto.randomUUID();}}>
      <strong>{c.case_code} · {c.client_name}</strong><small>{vehicle(c)}</small></button>)}{!cases.length && "Sin coincidencias"}</div>}
    {record && <form onSubmit={save}><div className="ce-grid">
      <label>Concepto<select {...field("type")}>{["Almacenaje","Grúa en puerto","Otros"].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Monto (Q)<input type="number" min=".01" step=".01" required {...field("amount")}/></label>
      <label>Detalle<input required={form.type==="Otros"} maxLength="120" placeholder="Ej. 2 días en puerto" {...field("detail")}/></label>
      <label>Fecha del gasto<input type="date" max={today()} required {...field("date")}/></label>
      <label>Beneficiario<input required maxLength="160" {...field("payee")}/></label>
      <label>Origen del pago<select {...field("source")}><option value="BANK">Banco EyR</option><option value="CASH">Caja EyR</option><option value="DIRECT">Cliente pagó al proveedor</option></select></label>
      <label>Comprobante opcional<input key={sequence} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files[0])}/><small>JPG, PNG o WebP · hasta 2 MB</small></label>
      {matches.length>0 && <label>Salida de Finanzas con igual fecha y monto<select required value={existing} onChange={e=>setExisting(e.target.value)}>
        <option value="">Seleccioná el movimiento</option>{matches.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}<option value="new">Es un pago distinto · registrar nueva salida</option></select></label>}
    </div><button className="primary-button" disabled={saving||checking}>{saving?"Guardando…":"Guardar gasto"}</button></form>}</fieldset>
    {record && <><header><h3>Gastos de esta gestión</h3><button onClick={()=>onStatement(record)}>Estado de cuenta</button></header>
      {history.length===0 && <p>Sin gastos adicionales registrados.</p>}{history.slice().reverse().map(item=><p key={item.id}>{day(item.date)} · {item.concept} · {item.beneficiary} · <b>{currency(item.amount)}</b> {item.hasReceipt && <button onClick={async()=>{try{setReceipt(await rpc(db,"customs_expense_receipt",{p_case:record.id,p_id:item.id}));}catch(e){setError(e.message);}}}>Ver comprobante</button>}</p>)}
      {receipt && <div><button onClick={()=>setReceipt(null)}>Cerrar comprobante</button><img className="ce-receipt" src={receipt} alt="Comprobante del gasto"/></div>}</>}
    </section>;
}

export function StatementDialog({db,record,onClose,canClassify}) {
  const dialog=useRef(null);
  const [documentOutput,setDocumentOutput]=useState(null);
  const [data,setData]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{dialog.current.showModal();},[]);
  useEffect(()=>{
    let active=true;
    rpc(db,"customs_statement",{p_case:record.id}).then(x=>{if(active)setData(x);}).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[db,record.id]);
  const [reversing,setReversing]=useState(null);
  const [reason,setReason]=useState("");
  const [notice,setNotice]=useState("");
  async function reversePayment(event){
    event.preventDefault();
    if(!reversing || busy || !reason.trim())return;
    setBusy(true);setError("");setNotice("");
    try{
      const updated=await rpc(db,"reverse_customs_client_payment",{
        p_case:record.id,p_payment:reversing.id,p_amount:reversing.amount,p_reason:reason.trim()
      });
      setDocumentOutput(null);setData(updated);setReversing(null);setReason("");
      setNotice("Abono revertido. El estado de cuenta está actualizado.");
    }catch(err){setError(err.message);}finally{setBusy(false);}
  }
  const summary=data && caseStatement(record,data);
  async function output(download){
    if(!documentOutput)return;
    if(download){documentOutput.pdf.save("Estado-de-cuenta-"+record.case_code+".pdf");return;}
    setBusy(true);setError("");
    const frame=document.createElement("iframe");
    frame.title="Impresión del estado de cuenta";
    frame.style.cssText="position:fixed;left:-12000px;top:0;width:816px;height:1056px;border:0";
    document.body.appendChild(frame);
    try{
      const doc=frame.contentDocument;
      doc.title="Estado de cuenta "+record.case_code;
      const style=doc.createElement("style");
      style.textContent="@page{size:letter;margin:0}html,body{margin:0}img{display:block;width:8.5in;height:11in;break-after:page}img:last-child{break-after:auto}";
      doc.head.append(style);
      await Promise.all(documentOutput.images.map(async src=>{
        const img=doc.createElement("img");img.src=src;doc.body.append(img);await img.decode();
      }));
      frame.contentWindow.addEventListener("afterprint",()=>frame.remove(),{once:true});
      frame.contentWindow.focus();frame.contentWindow.print();
      setTimeout(()=>frame.remove(),120000);
    }catch(e){frame.remove();setError(e.message);}finally{setBusy(false);}
  }
  return <dialog className="ce-dialog" ref={dialog} onCancel={onClose} aria-label="Estado de cuenta">
    <header><strong>Estado de cuenta</strong><button onClick={onClose} aria-label="Cerrar estado de cuenta">✕</button></header>
    {error && <p role="alert">{error}</p>}{!data && !error && <p>Cargando movimientos…</p>}
    {summary && <><React.Suspense fallback={<p>Preparando documento…</p>}><StatementPages record={record} data={data} date={today()} onReady={setDocumentOutput}/></React.Suspense>
    {canClassify && data.payments.length>0 && <details><summary>Administrar abonos del cliente</summary>
      {data.payments.map(p=><div key={p.id}><span>{day(p.date)} · {currency(p.amount)} </span>
        <button type="button" disabled={busy} onClick={()=>{setReversing(p);setReason("");setNotice("");}}>Revertir abono</button></div>)}
      {reversing && <form onSubmit={reversePayment}><h3>Revertir {currency(reversing.amount)} del {day(reversing.date)}</h3>
        <p>Se descontará este importe de los pagos recibidos de {record.client_name}. Los cargos de la gestión se conservan.</p>
        <label>Motivo<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button type="button" disabled={busy} onClick={()=>setReversing(null)}>Cancelar</button>
        <button disabled={busy||!reason.trim()}>Confirmar reversión</button></form>}
      </details>}{notice && <p role="status">{notice}</p>}
    <footer><button disabled={busy||!documentOutput} onClick={()=>output(false)}>Imprimir</button><button className="primary-button" disabled={busy||!documentOutput} onClick={()=>output(true)}>{busy?"Preparando…":"Descargar PDF"}</button></footer></>}
  </dialog>;
}
