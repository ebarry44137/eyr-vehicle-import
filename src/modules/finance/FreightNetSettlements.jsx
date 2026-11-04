import { useEffect, useRef, useState } from 'react';
import './freight-net-settlements.css';

const money=value=>`Q ${Number(value||0).toLocaleString('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
function monthLabel(value){const [year,month]=String(value).split('-').map(Number);return new Intl.DateTimeFormat('es-GT',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));}

export default function FreightNetSettlements({supabase,from,to,refreshKey}){
 const [data,setData]=useState(null),[error,setError]=useState('');const generation=useRef(0);
 useEffect(()=>{
  let alive=true;const request=++generation.current;setError('');setData(null);
  if(!from||!to||from>to)return()=>{alive=false;};
  supabase.rpc('finance_freight_settlements_v1',{p_from:from,p_to:to}).then(({data,error})=>{
   if(!alive||generation.current!==request)return;
   if(error)setError('No se pudieron cargar las liquidaciones de fletes. Actualizá Finanzas para revisar el resultado completo.');else setData(data);
  }).catch(()=>{if(alive&&generation.current===request)setError('No se pudieron cargar las liquidaciones de fletes.');});
  return()=>{alive=false;};
 },[supabase,from,to,refreshKey]);
 return <section className="freight-net-settlements" aria-label="Ganancias netas de fletes">
  <header><div><span>RESULTADO DE FLETES</span><h2>Ganancias de fletes liquidadas</h2></div><div className="fns-total"><small>Utilidad en el rango seleccionado</small><strong>{data?money(data.period_total_gtq):'—'}</strong></div></header>
  <p>Ganancia final después de los costos del envío. Se incorpora a la utilidad neta del período, con imputación al cierre de mes. La utilidad se registra una sola vez. El banco solo suma las recepciones confirmadas con su fecha correspondiente.</p>
  {error&&<p className="fns-error" role="alert">{error}</p>}
  {!data&&!error&&<p role="status">Cargando liquidaciones…</p>}
  {data&&<p>Ingresos bancarios de fletes en el rango: <strong>{money(data.bank_effect_gtq)}</strong></p>}
  {data?.entries?.length?<div className="fns-entries">{data.entries.map(entry=><article key={entry.id}><div><strong>{entry.concept}</strong><span>{monthLabel(entry.period_month)}{!entry.in_selected_period?' · Fuera del rango seleccionado':''}</span>{entry.bank_received_on?<span>Recibido en banco el {entry.bank_received_on.split("-").reverse().join("/")}</span>:<span>Sin recepción bancaria registrada</span>}</div><b>{money(entry.amount_gtq)}</b></article>)}</div>:data&&<p>Todavía no hay liquidaciones de fletes registradas.</p>}
 </section>;
}
