import {useEffect,useMemo,useState} from "react";
import { createRoot } from "react-dom/client";
import {supabase} from "../../supabaseClient";
import "./customer-support.css";
export default function CustomerSupportPage(){
 const[open,setOpen]=useState(false),[rows,setRows]=useState([]),[sid,setSid]=useState(null),[msgs,setMsgs]=useState([]),[text,setText]=useState(""),[busy,setBusy]=useState(false);
 const sel=useMemo(()=>rows.find(x=>x.id===sid),[rows,sid]);
 async function load(){const{data,error}=await supabase.from("portal_support_conversations").select("*,office_portal_clients(contact_name,preferred_name,company_name,email),customs_cases(case_code,vin,model_year,make,model,vehicle_trim)").order("last_message_at",{ascending:false});if(error)throw error;setRows(data||[]);if(!sid&&data?.[0]?.id)setSid(data[0].id)}
 async function lm(id){if(!id){setMsgs([]);return}const{data,error}=await supabase.from("portal_support_messages").select("*").eq("conversation_id",id).order("created_at");if(error)throw error;setMsgs(data||[])}
 useEffect(()=>{if(open)load().catch(console.error)},[open]);useEffect(()=>{if(open)lm(sid).catch(console.error)},[open,sid]);
 async function send(){if(!sid||!text.trim())return;setBusy(true);try{const{error}=await supabase.rpc("portal_support_send_message_v3977",{p_conversation_id:sid,p_message:text.trim()});if(error)throw error;setText("");await lm(sid);await load()}finally{setBusy(false)}}
 const pending=rows.filter(x=>x.status==="WAITING_OFFICE").length;
 return <div className="csf-root">
  {open&&<section className="csf-panel">
   <header><div className="csf-icon">💬</div><div><strong>Atención al Cliente</strong><small>{pending?`${pending} consulta${pending===1?"":"s"} por responder`:"Sin consultas pendientes"}</small></div><button onClick={()=>setOpen(false)}>×</button></header>
   <div className="csf-body">
    <aside>{rows.length?rows.map(x=>{const c=x.office_portal_clients||{},v=x.customs_cases||{};return <button className={x.id===sid?"active":""} key={x.id} onClick={()=>setSid(x.id)}><strong>{c.preferred_name||c.contact_name||c.company_name||"Cliente"}</strong><span>{[v.model_year,v.make,v.model].filter(Boolean).join(" ")||x.subject}</span><small>{x.status==="WAITING_OFFICE"?"🔴 Esperando respuesta":"🟢 Respondido"}</small></button>}):<div className="csf-empty">Aún no hay conversaciones.</div>}</aside>
    <main>{sel?<><div className="csf-title"><small>{sel.office_portal_clients?.company_name||"CLIENTE"}</small><strong>{sel.subject}</strong></div><div className="csf-thread">{msgs.map(m=><p className={m.sender_type==="CLIENT"?"client":"office"} key={m.id}><small>{m.sender_type==="CLIENT"?"Cliente":"Oficina"}</small>{m.message}</p>)}</div><div className="csf-send"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Responder al cliente…"/><button disabled={busy} onClick={send}>➤</button></div></>:<div className="csf-empty big">Seleccioná una conversación.</div>}</main>
   </div>
  </section>}
  <button className="csf-launcher" onClick={()=>setOpen(v=>!v)} aria-label="Abrir Atención al Cliente"><span>{open?"×":"💬"}</span>{pending>0&&<b>{pending>9?"9+":pending}</b>}</button>
 </div>
}

// V39.7.7.4 · AUTO-MOUNT CHAT INTERNO
// Lo montamos fuera del árbol de vistas para que siempre esté disponible
// en el sistema interno y no dependa de activeView.
if (typeof window !== "undefined" && !window.location.pathname.startsWith("/portal")) {
  const mountId = "eyr-customer-support-floating-root";
  let host = document.getElementById(mountId);

  if (!host) {
    host = document.createElement("div");
    host.id = mountId;
    document.body.appendChild(host);
    createRoot(host).render(<CustomerSupportPage />);
  }
}
