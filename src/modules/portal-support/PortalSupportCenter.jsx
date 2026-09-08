import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./portal-support.css";

function vehicleName(item){
  return [item?.vehicle_year||item?.model_year,item?.vehicle_make||item?.make,item?.vehicle_model||item?.model,item?.vehicle_trim||item?.trim]
    .filter(Boolean).join(" ") || item?.reference_code || item?.case_code || "Vehículo";
}

async function portalInvoke(body){
  const {data:s}=await supabase.auth.getSession();
  const token=s?.session?.access_token||"";
  const {data,error}=await supabase.functions.invoke("operation-file-manager",{
    body,
    headers: token ? {"x-portal-access-token":token} : undefined
  });
  if(error) throw error;
  if(!data?.success) throw new Error(data?.error||"No fue posible cargar archivos.");
  return data;
}

function AiMessageText({text}){
  const value=String(text||"");
  const parts=value.split(/(\\*\\*[^*]+\\*\\*)/g);
  return <>{parts.map((part,i)=>part.startsWith("**")&&part.endsWith("**")?<strong key={i}>{part.slice(2,-2)}</strong>:<span key={i}>{part}</span>)}</>;
}

function SelectedVehicle({item}){
  const [photo,setPhoto]=useState("");
  useEffect(()=>{
    let alive=true;
    (async()=>{
      setPhoto("");
      if(!item?.id)return;
      try{
        const list=await portalInvoke({action:"list",source_type:"CUSTOMS_CASE",source_id:item.id});
        const row=(list?.files||[]).find(x=>x.category==="PHOTO"&&x.visible_to_client!==false);
        if(!row)return;
        const view=await portalInvoke({action:"view_url",file_id:row.id});
        if(alive)setPhoto(view?.url||"");
      }catch{}
    })();
    return()=>{alive=false};
  },[item?.id]);
  if(!item)return null;
  return <div className="psf-vehicle">
    <div className="psf-vehicle-photo">{photo?<img src={photo} alt={vehicleName(item)}/>:<span>🚙</span>}</div>
    <div><small>IMPORTACIÓN SELECCIONADA</small><strong>{vehicleName(item)}</strong><span>{item.vin||"VIN pendiente"} · {item.reference_code||item.case_code||""}</span></div>
  </div>;
}

export default function PortalSupportCenter({imports=[] ,branding={}}){
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState("assistant");
  const [rows,setRows]=useState([]);
  const [sid,setSid]=useState(null);
  const [msgs,setMsgs]=useState([]);
  const [text,setText]=useState("");
  const [subject,setSubject]=useState("Consulta general");
  const [caseId,setCaseId]=useState(()=>{ try{return localStorage.getItem("eyr_portal_assistant_case")||""}catch{return ""} });
  const [busy,setBusy]=useState(false);
  const [aiText,setAiText]=useState("");
  const [aiBusy,setAiBusy]=useState(false);
  const AI_GREETING="¡Hola! 👋 Soy tu Asistente Aduanal. Puedo orientarte sobre el estado de tu importación, proceso aduanal, selectivo, IVA y documentos. Si tu caso necesita revisión, te comunico con un asesor.";
  const [ai,setAi]=useState([{r:"a",t:AI_GREETING}]);
  const sel=useMemo(()=>rows.find(x=>x.id===sid),[rows,sid]);
  const selectedImport=useMemo(()=>imports.find(x=>String(x.id)===String(caseId))||null,[imports,caseId]);
  const brandName=branding?.office_name||branding?.organization_name||"tu oficina";

  async function load(){
    const{data,error}=await supabase.from("portal_support_conversations").select("*").order("last_message_at",{ascending:false});
    if(error)throw error; setRows(data||[]);
    if(!sid&&data?.[0]?.id)setSid(data[0].id);
  }
  async function lm(id){
    if(!id){setMsgs([]);return}
    const{data,error}=await supabase.from("portal_support_messages").select("*").eq("conversation_id",id).order("created_at");
    if(error)throw error; setMsgs(data||[]);
  }
  useEffect(()=>{if(open)load().catch(console.error)},[open]);
  useEffect(()=>{if(open&&mode==="office")lm(sid).catch(console.error)},[open,mode,sid]);

  async function loadAiHistory(){
    try{
      let query=supabase
        .from("portal_assistant_messages")
        .select("id,sender_type,message,created_at")
        .order("created_at",{ascending:true})
        .limit(120);

      query=caseId
        ? query.eq("customs_case_id",caseId)
        : query.is("customs_case_id",null);

      const{data,error}=await query;
      if(error)throw error;

      if(data?.length){
        setAi(data.map(m=>({
          r:m.sender_type==="CLIENT"?"u":"a",
          t:m.message
        })));
      }else{
        setAi([{r:"a",t:AI_GREETING}]);
      }
    }catch(error){
      console.warn("No fue posible cargar historial del asistente:",error);
      setAi(v=>v?.length?v:[{r:"a",t:AI_GREETING}]);
    }
  }

  useEffect(()=>{
    try{
      if(caseId)localStorage.setItem("eyr_portal_assistant_case",caseId);
      else localStorage.removeItem("eyr_portal_assistant_case");
    }catch{}
  },[caseId]);

  useEffect(()=>{
    if(open&&mode==="assistant")loadAiHistory();
  },[open,mode,caseId]);

  async function human(){
    if(!text.trim())return;
    setBusy(true);
    try{
      if(sid){
        const{error}=await supabase.rpc("portal_support_send_message_v3977",{p_conversation_id:sid,p_message:text.trim()});
        if(error)throw error; setText(""); await lm(sid); await load();
      }else{
        const{data,error}=await supabase.rpc("portal_support_new_conversation_v3977",{p_subject:subject,p_message:text.trim(),p_customs_case_id:caseId||null});
        if(error)throw error; setText(""); await load(); setSid(data); await lm(data);
      }
    }finally{setBusy(false)}
  }
  async function ask(){
    const q=aiText.trim(); if(!q)return;
    setAi(v=>[...v,{r:"u",t:q}]); setAiText(""); setAiBusy(true);
    try{
      const{data,error}=await supabase.functions.invoke("portal-support-assistant",{body:{message:q,customs_case_id:caseId||null}});
      if(error)throw error;
      setAi(v=>[...v,{r:"a",t:data?.answer||"No pude responder esa consulta."}]);
    }catch{
      setAi(v=>[...v,{r:"a",t:`No pude consultar el asistente en este momento. Podés hablar directamente con ${brandName}.`}]);
    }finally{setAiBusy(false)}
  }
  function advisor(){
    setMode("office"); setSid(null); setSubject("Necesito hablar con un asesor");
    setText("Hola, necesito apoyo de un asesor con mi consulta.");
  }

  return <div className={`psf-root ${open?"open":""}`}>
    {open&&<section className="psf-panel">
      <header className="psf-header">
        <div className="psf-bot">🤖</div>
        <div><strong>{mode==="assistant"?"Asistente Aduanal":"Atención con tu oficina"}</strong><small>{brandName}</small></div>
        <button onClick={()=>setOpen(false)}>×</button>
      </header>

      <div className="psf-mode">
        <button className={mode==="assistant"?"active":""} onClick={()=>setMode("assistant")}>🤖 Asistente</button>
        <button className={mode==="office"?"active":""} onClick={()=>setMode("office")}>💬 Mi oficina</button>
      </div>

      <div className="psf-case">
        <select value={caseId} onChange={e=>setCaseId(e.target.value)}>
          <option value="">Consulta general</option>
          {imports.map(x=><option key={x.id} value={x.id}>{vehicleName(x)}</option>)}
        </select>
      </div>
      <SelectedVehicle item={selectedImport}/>

      {mode==="assistant"?<>
        <div className="psf-thread">
          {ai.map((m,i)=><p key={i} className={m.r==="u"?"me":"them"}><AiMessageText text={m.t}/></p>)}
          {aiBusy&&<p className="them">Consultando…</p>}
        </div>
        <div className="psf-quick">
          <button onClick={()=>setAiText("¿Cuál es el estado de mi importación?")}>Estado de mi importación</button>
          <button onClick={()=>setAiText("¿Qué significa selectivo rojo?")}>Selectivo rojo</button>
          <button onClick={()=>setAiText("¿Cuándo debo pagar el IVA?")}>Pago de IVA</button>
          <button onClick={()=>setAiText("¿Qué documentos necesito?")}>Documentos</button>
        </div>
        <div className="psf-send"><input value={aiText} onChange={e=>setAiText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&ask()} placeholder="Escribí tu consulta…"/><button onClick={ask}>➤</button></div>
        <button className="psf-advisor" onClick={advisor}>👤 Hablar con un asesor</button>
      </>:<>
        <div className="psf-convs">
          {rows.length>0&&<select value={sid||""} onChange={e=>setSid(e.target.value||null)}>
            <option value="">Nueva consulta</option>
            {rows.map(x=><option key={x.id} value={x.id}>{x.subject}</option>)}
          </select>}
        </div>
        <div className="psf-thread office">
          {sel?msgs.map(m=><p key={m.id} className={m.sender_type==="CLIENT"?"me":"them"}><small>{m.sender_type==="CLIENT"?"Vos":"Tu oficina"}</small>{m.message}</p>)
          :<div className="psf-empty">Escribí tu consulta y llegará directamente al equipo que gestiona tu importación.</div>}
        </div>
        {!sid&&<input className="psf-subject" value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Asunto"/>}
        <div className="psf-send"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&human()} placeholder="Escribí tu consulta…"/><button disabled={busy} onClick={human}>➤</button></div>
      </>}
      <footer>{brandName} · Tu aliado en cada importación</footer>
    </section>}

    <button className="psf-launcher" onClick={()=>setOpen(v=>!v)} aria-label="Abrir Centro de Ayuda">
      <span>{open?"×":"🤖"}</span><i/>
    </button>
  </div>;
}