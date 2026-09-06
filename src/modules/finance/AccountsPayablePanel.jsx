import { useEffect, useMemo, useState } from "react";

function q(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? `Q ${n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Q 0.00";
}

function typeLabel(type) {
  return ({ DUCA_BATCH: "Correlativos DUCA", DISPATCH_CASE: "Despacho vehículo", OTRO: "Otro proveedor" })[String(type || "").toUpperCase()] || type || "Proveedor";
}

export default function AccountsPayablePanel({ supabase, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount_gtq:"", payment_date:new Date().toISOString().slice(0,10), payment_method:"Transferencia", note:"" });

  async function load(){
    setLoading(true); setError("");
    try{
      const {data,error:e}=await supabase.from("finance_accounts_payable_overview").select("*").order("purchase_date",{ascending:false});
      if(e) throw e; setRows(Array.isArray(data)?data:[]);
    }catch(err){setError(err?.message||"No fue posible cargar cuentas por pagar.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);

  const pendingRows=useMemo(()=>rows.filter(r=>Number(r.pending_gtq||0)>0),[rows]);
  const totals=useMemo(()=>pendingRows.reduce((a,r)=>{const v=Number(r.pending_gtq||0);a.total+=v;if(r.source_type==="DUCA_BATCH")a.duca+=v;if(r.source_type==="DISPATCH_CASE")a.dispatch+=v;return a;},{duca:0,dispatch:0,total:0}),[pendingRows]);

  function openPayment(row){setSelected(row);setMessage("");setError("");setForm({amount_gtq:String(row.pending_gtq||""),payment_date:new Date().toISOString().slice(0,10),payment_method:"Transferencia",note:""});}

  async function savePayment(e){
    e.preventDefault(); if(!selected?.id)return;
    const amount=Number(form.amount_gtq||0), pending=Number(selected.pending_gtq||0);
    if(amount<=0||amount>pending){setError("Monto de pago inválido.");return;}
    setSaving(true);setError("");
    try{
      const {error:e2}=await supabase.rpc("register_accounts_payable_payment",{p_payable_id:selected.id,p_amount_gtq:amount,p_payment_date:form.payment_date,p_payment_method:form.payment_method||null,p_note:form.note||null});
      if(e2)throw e2;
      setMessage(amount===pending?"Pago registrado. Obligación saldada.":"Pago parcial registrado.");setSelected(null);await load();await onChanged?.();
    }catch(err){setError(err?.message||"No fue posible registrar el pago.");}
    finally{setSaving(false);}
  }

  return <section className="finance-panel finance-ap-v39622">
    <div className="finance-panel-head"><div><span>CUENTAS POR PAGAR</span><h2>Obligaciones operativas pendientes</h2><p>El costo ya está reconocido en utilidad; aquí controlás cuándo sale realmente el dinero.</p></div><button type="button" onClick={load} disabled={loading}>{loading?"...":"↻"}</button></div>
    <div className="finance-ap-kpis"><article><span>Correlativos</span><strong>{q(totals.duca)}</strong></article><article><span>Despachos</span><strong>{q(totals.dispatch)}</strong></article><article className="total"><span>Total apartado</span><strong>{q(totals.total)}</strong></article></div>
    {message&&<div className="finance-message success">{message}</div>}{error&&<div className="finance-message error">{error}</div>}
    <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Tipo</th><th>Fecha</th><th>Proveedor</th><th>Concepto</th><th>Total</th><th>Pagado</th><th>Pendiente</th><th>Estado</th><th></th></tr></thead><tbody>
      {pendingRows.map(row=><tr key={row.id}><td><span className={`ap-type ${String(row.source_type||"").toLowerCase()}`}>{typeLabel(row.source_type)}</span></td><td>{row.purchase_date}</td><td><strong>{row.creditor_name}</strong>{row.case_code&&<small>{row.case_code}</small>}</td><td>{row.concept}</td><td>{q(row.original_amount_gtq)}</td><td>{q(row.paid_gtq)}</td><td className="pending"><strong>{q(row.pending_gtq)}</strong></td><td>{row.status}</td><td><button type="button" className="ap-pay-button" onClick={()=>openPayment(row)}>Registrar pago</button></td></tr>)}
      {!loading&&pendingRows.length===0&&<tr><td colSpan="9" className="finance-empty">No hay obligaciones pendientes. ✅</td></tr>}
    </tbody></table></div>
    {selected&&<div className="ap-payment-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setSelected(null)}}><form className="ap-payment-modal" onSubmit={savePayment}><header><div><small>REGISTRAR SALIDA REAL DE CAJA</small><h3>{typeLabel(selected.source_type)}</h3><p>{selected.concept}</p></div><button type="button" onClick={()=>setSelected(null)}>×</button></header><div className="ap-payment-summary"><div><span>Total</span><strong>{q(selected.original_amount_gtq)}</strong></div><div><span>Ya pagado</span><strong>{q(selected.paid_gtq)}</strong></div><div><span>Pendiente</span><strong>{q(selected.pending_gtq)}</strong></div></div><div className="ap-payment-fields"><label><span>Monto a pagar (Q)</span><input type="number" min="0.01" step="0.01" value={form.amount_gtq} onChange={e=>setForm(p=>({...p,amount_gtq:e.target.value}))} required/></label><label><span>Fecha</span><input type="date" value={form.payment_date} onChange={e=>setForm(p=>({...p,payment_date:e.target.value}))} required/></label><label><span>Forma de pago</span><select value={form.payment_method} onChange={e=>setForm(p=>({...p,payment_method:e.target.value}))}><option>Transferencia</option><option>Efectivo</option><option>Cheque</option><option>Otro</option></select></label><label className="span-2"><span>Nota</span><input value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))}/></label></div><footer><button type="button" className="secondary" onClick={()=>setSelected(null)}>Cancelar</button><button type="submit" disabled={saving}>{saving?"Guardando...":"Registrar pago →"}</button></footer></form></div>}
  </section>;
}
