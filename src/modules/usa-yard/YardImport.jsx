import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { stages, noticeText } from './yardNotices';
import './yard-import.css';

const fields = [
  ['sender_name','Nombre del remitente'],['sender_phone','WhatsApp del remitente con código de país'],
  ['receiver_name','Nombre de quien recibe en Guatemala'],['receiver_phone','WhatsApp en Guatemala con código de país'],
  ['receiver_nit','NIT'],['receiver_address','Dirección fiscal, municipio y departamento']
];
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Guatemala'}).format(new Date());
export default function YardImport({vehicle,onCustoms,onSaved}) {
  const [open,setOpen]=useState(false),[data,setData]=useState(null);
  const [form,setForm]=useState({}),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[info,setInfo]=useState(''),[date,setDate]=useState(today);
  const [recipient,setRecipient]=useState('sender'),[openedFor,setOpenedFor]=useState('');
  async function request(action,input={}) {
    setBusy(true);setError('');setInfo('');
    try {
      const result=await supabase.rpc('eyr_yard_import',{p_id:vehicle.id,p_action:action,p_input:{...input,revision:data?.contact?.revision || 0}});
      if(result.error)throw result.error;
      const next=result.data;
      setData(next);setForm(next.contact || {});setDirty(false);setOpenedFor('');
      if(action==='contacts'){setInfo('Contactos guardados.');onSaved();}
      if(action==='advance')setInfo('Estado actualizado.');
      if(action==='handoff') await onCustoms(next.case_id);
    } catch(e){setError(e.message || 'No se pudo completar la operación.');}
    finally {setBusy(false);}
  }
  useEffect(()=>{request('read');},[vehicle.id]);
  const next=stages[stages.findIndex(([code])=>code===data?.stage)+1];
  const vaciado=data?.stage==='EMPTIED';
  const contact=data?.contact || {};
  const who=vaciado?recipient:'sender';
  const phone=contact[who+'_phone']?.replace(/[^0-9]/g,'') || '';
  const stageLabel=stages.find(([code])=>code===data?.stage)?.[1];
  const message=data && noticeText(data.stage,contact[who+'_name'],vehicle);
  const canNotify=!dirty && !busy && contact.revision && /^[1-9]\d{7,14}$/.test(phone);
  async function openExisting(){
    try {setBusy(true);await onCustoms(data.case_id);}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <section className="yard-import">

    {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={()=>request('read')}>Actualizar ficha</button></p>}
    {info && <p role="status">{info}</p>}
    {!data && busy && <p role="status">Cargando avisos…</p>}
        {vaciado && <label>Enviar solicitud de depósito a<select value={recipient} onChange={e=>{setRecipient(e.target.value);setOpenedFor('');}}><option value="sender">Remitente de USA</option><option value="receiver" disabled={!contact.receiver_phone}>Destinatario en Guatemala</option></select></label>}
    {stageLabel && <div className="yard-notice-buttons">
      {canNotify ? <a href={'https://wa.me/'+phone+'?text='+encodeURIComponent(message)} target="_blank" rel="noopener noreferrer"
        onClick={()=>{if(vaciado){setOpenedFor(who);setOpen(true);}}}>WhatsApp · {stageLabel}</a>
        : <button type="button" disabled={busy} onClick={()=>{setOpen(true);setInfo('Guardá el contacto con código de país para abrir este aviso.');}}>WhatsApp · {stageLabel}<small>Guardar contacto</small></button>}
    </div>}
    <button type="button" aria-expanded={open} disabled={busy} onClick={()=>{setOpen(!open);if(!open && !data)request('read');}}>Gestión de importación</button>
    {open && <div className="yard-import-body">
      {data && <>
        <h3>{data.management || 'Nueva gestión'} · {vehicle.vin}</h3>
        <form onSubmit={e=>{e.preventDefault();request('contacts',{...form,sender_phone:(form.sender_phone||'').replace(/[^0-9]/g,''),receiver_phone:(form.receiver_phone||'').replace(/[^0-9]/g,'')});}}>
          <fieldset disabled={busy}><legend>Remitente USA y destinatario Guatemala</legend>
            {fields.map(([key,label])=><label key={key}>{label}<input type={key.endsWith('phone')?'tel':'text'} maxLength={key==='receiver_address'?350:120} required={key.startsWith('sender')} value={form[key]||''} onChange={e=>{setForm({...form,[key]:e.target.value});setDirty(true);setOpenedFor('');}}/></label>)}
            <button>Guardar contactos</button>
          </fieldset>
        </form>
        <h3>Estado del vehículo · {stageLabel}</h3>
        {next && <div className="yard-import-actions"><label>Fecha del avance<input type="date" value={date} min={data.dates[data.stage]} max={today()} onChange={e=>setDate(e.target.value)}/></label>
          <button disabled={busy || dirty || !contact.revision || !date} onClick={()=>request('advance',{stage:next[0],date})}>Registrar {next[1]}</button></div>}
        <details><summary>Ver mensaje de WhatsApp</summary><p className="yard-import-text">{message}</p></details>
        <div className="yard-import-actions">
          {vaciado && (contact.confirmed_at && data.case_id ? <button onClick={openExisting} disabled={busy}>Abrir expediente aduanal</button> : <button disabled={!canNotify || openedFor!==who} onClick={()=>request('handoff',{recipient:who})}>Confirmar envío y continuar a Control Aduanal</button>)}
        </div>
      </>}
    </div>}
  </section>;
}
