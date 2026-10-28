import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient.js';
import { MANUAL_MILESTONES, MILESTONE_LABELS } from '../../../supabase/functions/_shared/vehicleTrackingDomain.js';
import './tracking-admin.css';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function errorText(error){
  if(error?.code==='42501')return 'Tu usuario no tiene permiso para administrar este seguimiento.';
  if(error?.code==='40001'||error?.code==='23505')return 'La información cambió. Actualizá el panel antes de guardar.';
  if(error?.code==='P0001')return error.message;
  return 'El seguimiento no está disponible en este momento. Podés continuar usando los módulos operativos habituales.';
}

export default function TrackingAdminPanel({sourceType,sourceId,photos=[]}) {
  const [state,setState]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [code,setCode]=useState('LOADED_IN_CONTAINER'),[date,setDate]=useState(today);
  const generation=useRef(0);
  const codes=state?.mode==='CUSTOMS_ONLY'?MANUAL_MILESTONES.filter(value=>!['LOADED_IN_CONTAINER','DEPARTED_USA'].includes(value)):MANUAL_MILESTONES;
  const selected=state?.events?.find(event=>event.code===code);
  const photoNames=Object.fromEntries(photos.map(photo=>[photo.id,photo.original_name]));

  async function read() {
    const current=++generation.current;setLoading(true);setBusy(false);setError('');
    let data,rpcError;
    try{({data,error:rpcError}=await supabase.rpc('eyr_tracking_admin_v1',{p_source_type:sourceType,p_source_id:sourceId,p_action:'read'}));}catch(error){rpcError=error;}
    if(generation.current!==current)return;
    if(rpcError){setState(null);setError(errorText(rpcError));}else setState(data);
    setLoading(false);
  }
  useEffect(()=>{setState(null);setNotice('');read();return()=>{generation.current++;};},[sourceType,sourceId]);
  useEffect(()=>{if(state?.mode==='CUSTOMS_ONLY'&&['LOADED_IN_CONTAINER','DEPARTED_USA'].includes(code))setCode('ARRIVED_GUATEMALA');},[state?.mode,code]);
  useEffect(()=>{setDate(selected?.date||today());},[code,selected?.date]);

  async function act(payload,message) {
    const current=++generation.current;setBusy(true);setError('');setNotice('');
    let data,rpcError;
    try{({data,error:rpcError}=await supabase.rpc('eyr_tracking_admin_v1',{p_source_type:sourceType,p_source_id:sourceId,...payload}));}catch(error){rpcError=error;}
    if(generation.current!==current)return;
    if(rpcError)setError(errorText(rpcError));else{setState(data);setNotice(message);}
    setBusy(false);
  }
  return <section className="eyr-tracking-admin" aria-label="Administrar seguimiento por VIN">
    <header><div><span>SEGUIMIENTO POR VIN</span><h3>Avances y fotos para el cliente</h3></div><button type="button" onClick={read} disabled={busy||loading}>Actualizar</button></header>
    {loading&&<p role="status">Cargando seguimiento…</p>}
    {error&&<p className="eta-error" role="alert">{error}</p>}{notice&&<p className="eta-notice" role="status">{notice}</p>}
    {state&&<>
      <p>Los avances de recepción y aduanas se consultan desde sus registros habituales. Aquí podés completar las fechas reales de transporte y entrega.</p>
      {state.can_record?<div className="eta-milestone-form"><label>Avance<select value={code} onChange={event=>setCode(event.target.value)} disabled={busy}>{codes.map(value=><option key={value} value={value}>{MILESTONE_LABELS[value]}</option>)}</select></label><label>Fecha real · Guatemala<input type="date" value={date} max={today()} min="1970-01-01" onChange={event=>setDate(event.target.value)} disabled={busy} /></label><button type="button" disabled={busy||!date} onClick={()=>act({p_action:'save_event',p_code:code,p_date:date,p_expected_revision:selected?.revision||0},'Avance guardado para el seguimiento.')}>Guardar avance</button>{selected?.active&&<button type="button" className="eta-secondary" disabled={busy} onClick={()=>act({p_action:'retract_event',p_code:code,p_expected_revision:selected.revision},'Avance retirado del seguimiento. La corrección queda registrada.')}>Retirar avance</button>}</div>:<p className="eta-hint">Vinculá esta recepción a su gestión de importación para registrar carga y salida.</p>}
      {state.events?.some(event=>event.active)&&<ul className="eta-events">{state.events.filter(event=>event.active).map(event=><li key={event.code}><strong>{MILESTONE_LABELS[event.code]}</strong><span>{event.date}</span></li>)}</ul>}
      {state.can_publish_photos&&<fieldset disabled={busy}><legend>Fotos visibles en la consulta pública por VIN</legend><p>Revisá las imágenes en la galería antes de seleccionarlas. Marcá solo fotos del vehículo que se puedan compartir, sin documentos ni datos personales visibles. No se comparte ninguna foto automáticamente.</p>{state.photos?.length?<div className="eta-photo-options">{state.photos.map(photo=><label key={photo.id}><input type="checkbox" checked={photo.published} onChange={event=>act({p_action:'publish_photo',p_photo_id:photo.id,p_publish:event.target.checked,p_expected_revision:photo.revision},event.target.checked?'Fotografía seleccionada para compartir.':'Fotografía retirada. Los accesos ya emitidos vencen en un máximo de dos minutos.')} /><span>{photoNames[photo.id]||'Fotografía de recepción'}<small>{photo.published?'Visible en seguimiento':'Privada'}</small></span></label>)}</div>:<p>Todavía no hay fotografías en esta recepción. Guardá las fotos y actualizá este panel.</p>}</fieldset>}
    </>}
  </section>;
}
