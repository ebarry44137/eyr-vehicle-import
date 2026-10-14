import {useCallback,useEffect,useState} from 'react';

/** Vista de evidencia R2: usa URLs firmadas obtenidas del backend autenticado. */
export default function UsaYardGallery({files=[],vin='',getViewUrl}){
 const [urls,setUrls]=useState({}),[active,setActive]=useState(-1),[error,setError]=useState('');
 useEffect(()=>{
  let alive=true;setUrls({});setActive(-1);setError('');
  if(!files.length)return()=>{alive=false};
  Promise.all(files.map(async f=>{try{return [f.id,await getViewUrl(f)]}catch{return [f.id,null]}})).then(items=>{
   if(!alive)return;
   setUrls(Object.fromEntries(items.filter(([,url])=>Boolean(url))));
   if(items.some(([,url])=>!url))setError('Algunas fotografías no pudieron cargarse. Volvé a seleccionar la recepción para reintentar.');
  });
  return()=>{alive=false};
 },[files]);
 const close=useCallback(()=>setActive(-1),[]);
 const move=useCallback(delta=>setActive(i=>i<0?i:(i+delta+files.length)%files.length),[files.length]);
 useEffect(()=>{if(active<0)return;const handler=e=>{if(e.key==='Escape')close();if(e.key==='ArrowLeft')move(-1);if(e.key==='ArrowRight')move(1)};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[active,close,move]);
 return <>
  {error&&<p role="alert" className="eyr-usa-gallery-error">{error}</p>}
  {files.length===0?<p>Sin fotografías todavía.</p>:<div className="eyr-usa-gallery-grid">{files.map((file,i)=><button type="button" className="eyr-usa-gallery-tile" key={file.id} onClick={()=>setActive(i)} aria-label={`Ver fotografía ${i+1}: ${file.original_name}`}>
   <div className="eyr-usa-gallery-thumb">{urls[file.id]?<img src={urls[file.id]} alt={file.original_name||`Foto ${i+1}`} loading="lazy" referrerPolicy="no-referrer"/>:<span>📷 Preparando imagen…</span>}</div>
   <strong title={file.original_name}>{file.original_name}</strong><small>{Number(file.size_bytes)>0?(Number(file.size_bytes)/1048576).toFixed(2)+' MB · ':''}Ver en galería</small>
  </button>)}</div>}
  {active>=0&&files[active]&&<div className="eyr-usa-gallery-overlay" role="dialog" aria-modal="true" aria-label="Galería de fotografías USA" onClick={close}>
   <div className="eyr-usa-gallery-dialog" onClick={e=>e.stopPropagation()}>
    <div className="eyr-usa-gallery-top"><strong>📸 {vin} · {active+1} de {files.length}</strong><button type="button" autoFocus onClick={close}>✕ Cerrar</button></div>
    <div className="eyr-usa-gallery-stage"><button type="button" onClick={()=>move(-1)} aria-label="Foto anterior">‹</button><div className="eyr-usa-gallery-large">{urls[files[active].id]?<img src={urls[files[active].id]} alt={files[active].original_name||'Evidencia USA'} referrerPolicy="no-referrer"/>:<span>Preparando fotografía…</span>}</div><button type="button" onClick={()=>move(1)} aria-label="Foto siguiente">›</button></div>
    <div className="eyr-usa-gallery-caption">{files[active].original_name} · Usá ← → para navegar y Esc para cerrar</div>
   </div>
  </div>}
 </>;
}
