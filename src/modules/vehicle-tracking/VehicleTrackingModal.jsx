import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeVin, VIN_PATTERN } from '../../../supabase/functions/_shared/vehicleTrackingDomain.js';
import { lookupVehicleTracking, trackingDate } from './trackingClient.js';
import './vehicle-tracking.css';

export default function VehicleTrackingModal({onClose,contactHref='#contacto'}) {
  const dialog=useRef(null),input=useRef(null),request=useRef(null);
  const [vin,setVin]=useState(''),[searchedVin,setSearchedVin]=useState(''),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [activePhoto,setActivePhoto]=useState(-1),[failedPhotos,setFailedPhotos]=useState({});
  const photoButton=useRef(null),previousBodyOverflow=useRef(''),restorePhotoFocus=useRef(false);
  const photos=(data?.photos||[]).filter(photo=>{try{return new URL(photo.url).protocol==='https:';}catch{return false;}});

  useEffect(()=>{
    const focused=document.activeElement;
    previousBodyOverflow.current=document.body.style.overflow;document.body.style.overflow='hidden';
    dialog.current.showModal();input.current?.focus();
    return()=>{request.current?.abort();dialog.current?.close();document.body.style.overflow=previousBodyOverflow.current;if(focused instanceof HTMLElement&&focused.isConnected)focused.focus();};
  },[]);
  useEffect(()=>{
    if(activePhoto<0)return;
    const move=event=>{
      if(event.key==='ArrowLeft'){event.preventDefault();setActivePhoto(index=>(index+photos.length-1)%photos.length);}
      if(event.key==='ArrowRight'){event.preventDefault();setActivePhoto(index=>(index+1)%photos.length);}
    };
    dialog.current?.addEventListener('keydown',move);return()=>dialog.current?.removeEventListener('keydown',move);
  },[activePhoto,photos.length]);
  useEffect(()=>{if(activePhoto>=0)photoButton.current?.focus();else if(restorePhotoFocus.current){restorePhotoFocus.current=false;dialog.current?.querySelector('[data-tracking-photo]')?.focus();}},[activePhoto]);
  function closePhoto(){restorePhotoFocus.current=true;setActivePhoto(-1);}
  async function search(value=vin){
    const code=normalizeVin(value);
    if(!VIN_PATTERN.test(code)){setError('Ingresá los 17 caracteres del VIN. Las letras I, O y Q no forman parte de un VIN estándar.');return;}
    request.current?.abort();const abort=new AbortController();request.current=abort;
    setBusy(true);setError('');setData(null);setActivePhoto(-1);setFailedPhotos({});
    try{const result=await lookupVehicleTracking(code,abort.signal);if(!abort.signal.aborted){setData(result);setSearchedVin(code);}}
    catch(err){if(!abort.signal.aborted)setError(err.message);}
    finally{if(!abort.signal.aborted)setBusy(false);}
  }
  const contact=()=>{onClose();};
  return createPortal(<dialog ref={dialog} className="eyr-tracking" aria-labelledby="tracking-title" aria-describedby="tracking-intro" onCancel={event=>{event.preventDefault();if(activePhoto>=0)closePhoto();else onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="et-dialog-inner"><div inert={activePhoto>=0 ? true : undefined}>
      <header className="et-header"><div><span>E&R SOLUTIONS · SEGUIMIENTO</span><h2 id="tracking-title">Tu vehículo.<br /><em>Cada etapa, más cerca.</em></h2></div><button type="button" className="et-close" aria-label="Cerrar seguimiento" onClick={onClose}>×</button></header>
      <p id="tracking-intro" className="et-intro">Consultá los avances registrados y las fotos de recepción compartidas por E&R.</p>
      <form className="et-search" onSubmit={event=>{event.preventDefault();search();}}>
        <label htmlFor="tracking-vin">VIN DEL VEHÍCULO<input ref={input} id="tracking-vin" value={vin} onChange={event=>setVin(normalizeVin(event.target.value))} maxLength={17} minLength={17} pattern="[A-HJ-NPR-Z0-9]{17}" autoComplete="off" autoCapitalize="characters" spellCheck={false} required placeholder="Ingresá los 17 caracteres" /></label>
        <button type="submit" disabled={busy}>{busy?'Consultando…':'Consultar VIN →'}</button>
      </form>
      {error&&<p className="et-message et-error" role="alert">{error} <a href={contactHref} onClick={contact}>Contactar a E&R</a></p>}
      {busy&&<div className="et-loading" role="status">Buscando los avances de tu vehículo…</div>}
      {data?.result==='NOT_FOUND'&&<div className="et-message" role="status"><h3>No encontramos un seguimiento disponible.</h3><p>Verificá el VIN completo o consultá con nuestro equipo. Una consulta sin resultados no confirma que el vehículo no haya sido recibido.</p><a href={contactHref} onClick={contact}>Consultar con E&R →</a></div>}
      {data?.result==='AMBIGUOUS'&&<div className="et-message" role="status"><h3>Necesitamos revisar tu operación.</h3><p>Hay más de un registro asociado a este VIN. Nuestro equipo puede confirmar cuál corresponde a tu envío.</p><a href={contactHref} onClick={contact}>Contactar a E&R →</a></div>}
      {data?.result==='FOUND'&&<div className="et-result" aria-live="polite">
        <section className="et-vehicle"><div><span>VIN · {searchedVin}</span><h3>{[data.vehicle?.year,data.vehicle?.make,data.vehicle?.model].filter(Boolean).join(' ')||'Tu vehículo'}</h3>{data.mode==='CUSTOMS_ONLY'&&<small>Seguimiento de gestión aduanal</small>}</div><button type="button" onClick={()=>search(searchedVin)} disabled={busy}>Actualizar ↻</button></section>
        <section className="et-current"><span>ESTADO INFORMADO</span><strong>{data.stageLabel}</strong><small>Última actualización: {trackingDate(data.updatedAt)} · Hora de Guatemala</small>{data.estimatedArrival&&<p>Llegada estimada: {trackingDate(data.estimatedArrival)}. Sujeta a cambios.</p>}</section>
        <div className="et-columns"><section className="et-timeline-section"><h3>Avances confirmados</h3><p className="et-section-note">Solo aparecen las fechas que ya están registradas.</p>{data.milestones?.length?<ol className="et-timeline">{data.milestones.map((event,index)=><li key={`${event.code}-${index}`}><span className="et-timeline-dot" /><div><strong>{event.label}</strong><time dateTime={event.date}>{trackingDate(event.date)}</time></div></li>)}</ol>:<p className="et-message">El estado está disponible; todavía no hay fechas de avances para mostrar.</p>}</section>
          <section className="et-photo-section"><h3>Así recibimos tu vehículo</h3><p className="et-section-note">Fotos de recepción en yarda compartidas por el equipo.</p>{photos.length?<><div className="et-photos">{photos.slice(0,6).map((photo,index)=><button type="button" data-tracking-photo key={photo.id} onClick={()=>setActivePhoto(index)} aria-label={`Ampliar fotografía ${index+1}`}><div>{failedPhotos[photo.id]?<span>Imagen no disponible</span>:<img src={photo.url} alt={photo.caption} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailedPhotos(old=>({...old,[photo.id]:true}))} />}</div><small>Foto {index+1} ↗</small></button>)}</div><button className="et-gallery-button" type="button" onClick={()=>setActivePhoto(0)}>Ver galería · {photos.length} {photos.length===1?'foto':'fotos'}</button><p className="et-photo-note">Si una foto deja de cargar, actualizá la consulta para renovar su acceso.</p></>:<p className="et-message">Todavía no hay fotografías compartidas para esta operación.</p>}{data.photosUnavailable&&<p className="et-photo-note">Algunas fotografías no están disponibles en este momento. Podés actualizar la consulta.</p>}</section>
        </div>
      </div>}
      </div>
      {activePhoto>=0&&photos[activePhoto]&&<section className="et-lightbox" aria-label="Fotografía ampliada"><div className="et-lightbox-head"><strong>Recepción en yarda · {activePhoto+1} de {photos.length}</strong><button ref={photoButton} type="button" onClick={closePhoto}>Cerrar foto ×</button></div><div className="et-lightbox-stage"><button type="button" aria-label="Fotografía anterior" onClick={()=>setActivePhoto(index=>(index+photos.length-1)%photos.length)}>‹</button>{failedPhotos[photos[activePhoto].id]?<p>No pudimos cargar esta fotografía. Cerrá la foto y actualizá la consulta.</p>:<img src={photos[activePhoto].url} alt={photos[activePhoto].caption} referrerPolicy="no-referrer" onError={()=>setFailedPhotos(old=>({...old,[photos[activePhoto].id]:true}))} />}<button type="button" aria-label="Fotografía siguiente" onClick={()=>setActivePhoto(index=>(index+1)%photos.length)}>›</button></div><p>Usá las flechas para navegar. Escape cierra la fotografía.</p></section>}
      <footer className="et-footer" inert={activePhoto>=0 ? true : undefined}>El seguimiento refleja los avances registrados por E&R. Para documentos y detalles de tu operación, ingresá al <a href="/portal">portal de clientes</a>.</footer>
    </div>
  </dialog>,document.body);
}
