import { useCallback, useEffect, useMemo, useState } from "react";
import "./crm-commercial.css";

const OPEN = new Set(["PENDING", "IN_PROGRESS"]);
const ACTION_LABELS = {CONTACT_LEAD:"Contactar lead",GET_VIN:"Obtener VIN",REVIEW_VIN:"Revisar VIN",COMPLETE_LOGISTICS:"Completar logística",PREPARE_QUOTE:"Preparar cotización",FOLLOW_UP_PROPOSAL:"Dar seguimiento a propuesta",RESOLVE_OBJECTION:"Resolver objeción",FORMALIZE_SERVICE:"Formalizar servicio",HANDOFF_OPERATIONS:"Entregar a Operaciones",COLLECT_FREIGHT:"Cobrar flete"};
function vehicle(l){return [l.vehicle_year,l.vehicle_make,l.vehicle_model,l.vehicle_trim].filter(Boolean).join(" ")||l.vehicle_label||"Vehículo por definir"}
function dueLabel(v){if(!v)return"Sin vencimiento";const d=new Date(v);if(Number.isNaN(d.getTime()))return"Sin vencimiento";const x=d-Date.now();if(x<0)return"Vencida";if(x<86400000)return"Hoy";return new Intl.DateTimeFormat("es-GT",{day:"2-digit",month:"short"}).format(d)}
function taskTitle(t){return ACTION_LABELS[t?.task_type]||t?.title||"Sin tarea pendiente"}
const emptyEdit={full_name:"",phone:"",email:"",vin:"",vehicle_year:"",vehicle_make:"",vehicle_model:"",vehicle_trim:"",vehicle_label:"",priority:"NORMAL",vehicle_validated:false,vehicle_location:"",delivery_location:"",auction_name:"",requires_tow:false,tow_details:"",logistics_complete:false,service_requested:"",client_confirmed:false,special_agreements:""};
function CrmCommercialPage({supabase,userId,userName="Usuario E&R",onOpenQuote,onOpenLinkedQuote,onSendLinkedQuoteWhatsApp,refreshSignal=0}){
 const [tab,setTab]=useState("pipeline"),[stages,setStages]=useState([]),[leads,setLeads]=useState([]),[tasks,setTasks]=useState([]),[contacts,setContacts]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[showNew,setShowNew]=useState(false),[saving,setSaving]=useState(false),[form,setForm]=useState({full_name:"",phone:"",email:"",vin:"",vehicle_label:"",priority:"NORMAL"});
 const [selected,setSelected]=useState(null),[edit,setEdit]=useState(emptyEdit),[activities,setActivities]=useState([]),[detailTasks,setDetailTasks]=useState([]),[detailLoading,setDetailLoading]=useState(false),[vinLoading,setVinLoading]=useState(false),[leadQuotes,setLeadQuotes]=useState([]);
 // V39.9.13 COMMERCIAL INTELLIGENCE
 const [advisors,setAdvisors]=useState([]),[quoteTotals,setQuoteTotals]=useState([]),[period,setPeriod]=useState("30"),[advisorFilter,setAdvisorFilter]=useState("ALL"),[workFilter,setWorkFilter]=useState("ALL");
 const [waConversations,setWaConversations]=useState([]),[waMessages,setWaMessages]=useState([]),[waSelected,setWaSelected]=useState(null),[waDraft,setWaDraft]=useState(""),[waLoading,setWaLoading]=useState(false);
 // V39.9.8 FOLLOW-UP INTELLIGENCE
 // V39.9.8.2 AUTO CADENCE
 const [followUp,setFollowUp]=useState({outcome:"",note:""});
 // V39.9.9 OBJECTION MANAGEMENT
 const [objectionReply,setObjectionReply]=useState("");
 // V39.9.10 OPERATIONS HANDOFF
 const [opsUsers,setOpsUsers]=useState([]);
 const [handoff,setHandoff]=useState({payment_status:"PENDING",balance_gtq:"",documents_confirmed:false,agreements:"Sin acuerdos especiales",operations_assigned_to:""});
 const [freightPayment,setFreightPayment]=useState({status:"PENDING",amount_usd:null,requested_at:null,paid_at:new Date().toISOString().slice(0,10),receipt_reference:"",notes:""});
 const addDaysAtNine=(days)=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(9,0,0,0);return d.toISOString()};
 const followUpActivities=useMemo(()=>activities.filter(a=>a.activity_type==="PROPOSAL_FOLLOW_UP"),[activities]);
 const noResponseCount=useMemo(()=>followUpActivities.filter(a=>a.metadata?.outcome==="NO_RESPONSE").length,[followUpActivities]);
 const nextNoResponsePlan=useMemo(()=>{
  const schedule=[1,3,7,14],index=Math.min(noResponseCount,schedule.length-1);
  return {day:schedule[index],exhausted:noResponseCount>=schedule.length};
 },[noResponseCount]);
 const automaticFollowUpText=nextNoResponsePlan.exhausted
  ?"Cadencia Día 1 / 3 / 7 / 14 completada. Requiere decisión de nutrición o cierre."
  :"Si no responde: próximo recordatorio automático Día "+nextNoResponsePlan.day+". Si está interesado: seguimiento automático en 2 días.";
 const load=useCallback(async()=>{setLoading(true);setError("");try{
  const {data:orgId,error:orgError}=await supabase.rpc("current_organization_id_v3821");if(orgError)throw orgError;
  const [s,l,t,c,a,q,w]=await Promise.all([
   supabase.from("crm_pipeline_stages").select("*").eq("active",true).order("position"),
   supabase.from("crm_leads").select("*").order("created_at",{ascending:false}),
   supabase.from("crm_tasks").select("*").order("due_at",{ascending:true,nullsFirst:false}),
   supabase.from("crm_contacts").select("*").order("created_at",{ascending:false}),
   supabase.from("profiles").select("id,full_name,email,role,job_title,active,organization_id").eq("organization_id",orgId).in("role",["ADMIN","OPERADOR"]).eq("active",true).order("full_name",{ascending:true}),
   supabase.from("commercial_quotes").select("id,status,totals,created_at,finalized_at"),
    supabase.from("crm_whatsapp_conversations").select("*").order("last_message_at",{ascending:false,nullsFirst:false})
  ]);
  const e=[s.error,l.error,t.error,c.error,a.error,q.error,w.error].find(Boolean);if(e)throw e;
  setStages(s.data||[]);setLeads(l.data||[]);setTasks(t.data||[]);setContacts(c.data||[]);setAdvisors(a.data||[]);setQuoteTotals(q.data||[]);setWaConversations(w.data||[]);
 }catch(e){setError(e?.message||"No fue posible cargar CRM Comercial.")}finally{setLoading(false)}},[supabase]);
 useEffect(()=>{load()},[load]);
 // V39.9.7.5 CRM REFRESH SIGNAL
 useEffect(()=>{if(refreshSignal>0)load()},[refreshSignal,load]);
 const contactsById=useMemo(()=>Object.fromEntries(contacts.map(c=>[c.id,c])),[contacts]);
 const openTaskByLead=useMemo(()=>{const m={};tasks.forEach(t=>{if(t.is_primary&&OPEN.has(t.status)&&!m[t.lead_id])m[t.lead_id]=t});return m},[tasks]);
 const advisorById=useMemo(()=>Object.fromEntries(advisors.map(a=>[a.id,a])),[advisors]);
 const periodStart=useMemo(()=>{if(period==="ALL")return null;const d=new Date();d.setDate(d.getDate()-Number(period||30));d.setHours(0,0,0,0);return d},[period]);
 const filteredLeads=useMemo(()=>leads.filter(l=>(advisorFilter==="ALL"||l.assigned_to===advisorFilter)&&(!periodStart||new Date(l.created_at)>=periodStart)),[leads,advisorFilter,periodStart]);
 const filteredLeadIds=useMemo(()=>new Set(filteredLeads.map(l=>l.id)),[filteredLeads]);
 const filteredTasks=useMemo(()=>tasks.filter(t=>filteredLeadIds.has(t.lead_id)),[tasks,filteredLeadIds]);
 const quoteById=useMemo(()=>Object.fromEntries(quoteTotals.map(q=>[q.id,q])),[quoteTotals]);
 const quoteAmount=(q)=>{const t=q?.totals||{};const keys=["total_gtq","grand_total_gtq","grand_total","total","total_guatemala_gtq","guatemala_total"];for(const k of keys){const n=Number(t?.[k]);if(Number.isFinite(n)&&n>0)return n}return 0};
 const metrics=useMemo(()=>{const open=filteredLeads.filter(x=>!["WON","LOST"].includes(x.stage_code)).length,won=filteredLeads.filter(x=>x.stage_code==="WON").length,lost=filteredLeads.filter(x=>x.stage_code==="LOST").length,closed=won+lost;return {newLeads:filteredLeads.length,open,quoting:filteredLeads.filter(x=>["QUOTING","PROPOSAL_SENT","NEGOTIATION"].includes(x.stage_code)).length,proposals:filteredLeads.filter(x=>["PROPOSAL_SENT","NEGOTIATION","ACCEPTED","IN_OPERATION","FREIGHT_PENDING","WON"].includes(x.stage_code)).length,won,lost,conversion:closed?Math.round((won/closed)*100):0,potential:filteredLeads.filter(x=>!["WON","LOST"].includes(x.stage_code)).reduce((sum,l)=>sum+quoteAmount(quoteById[l.quote_id]),0),overdue:filteredTasks.filter(x=>OPEN.has(x.status)&&x.due_at&&new Date(x.due_at)<new Date()).length}},[filteredLeads,filteredTasks,quoteById]);
 const workBuckets=useMemo(()=>{const now=new Date(),end=new Date();end.setHours(23,59,59,999);const tomorrow=new Date(end);tomorrow.setDate(tomorrow.getDate()+1);const inSeven=new Date(end);inSeven.setDate(inSeven.getDate()+7);const open=filteredTasks.filter(t=>OPEN.has(t.status));const stale=filteredLeads.filter(l=>{if(["WON","LOST"].includes(l.stage_code))return false;const age=(Date.now()-new Date(l.updated_at||l.created_at).getTime())/86400000;const limit={NEW_LEAD:1,WAITING_VIN:3,VIN_REVIEW:2,LOGISTICS:3,QUOTING:3,PROPOSAL_SENT:5,NEGOTIATION:3,ACCEPTED:2,IN_OPERATION:7,FREIGHT_PENDING:3}[l.stage_code]||5;return age>=limit});return {overdue:open.filter(t=>t.due_at&&new Date(t.due_at)<now),today:open.filter(t=>t.due_at&&new Date(t.due_at)>=now&&new Date(t.due_at)<=end),upcoming:open.filter(t=>t.due_at&&new Date(t.due_at)>end&&new Date(t.due_at)<=inSeven),stale}},[filteredTasks,filteredLeads]);
 const stageDistribution=useMemo(()=>stages.map(s=>({...s,count:filteredLeads.filter(l=>l.stage_code===s.code).length})).filter(s=>s.count>0),[stages,filteredLeads]);
 async function assignAdvisor(leadId,advisorId){setError("");setNotice("");setSaving(true);try{const value=advisorId||null;const {data,error:e}=await supabase.rpc("crm_assign_advisor_v39914",{p_lead_id:leadId,p_advisor_id:value});if(e)throw e;if(data?.ok===false)throw new Error(data?.message||"No fue posible asignar el asesor.");setNotice("Responsable comercial actualizado.");await load();if(selected?.id===leadId)setSelected(x=>x?{...x,assigned_to:value}:x)}catch(e){setError(e?.message||"No fue posible asignar el asesor.")}finally{setSaving(false)}}
 async function createLead(e){e.preventDefault();setSaving(true);setError("");setNotice("");try{const {data:orgId,error:oe}=await supabase.rpc("current_organization_id_v3821");if(oe)throw oe;if(!orgId)throw new Error("No se pudo determinar la organización activa.");const {data:c,error:ce}=await supabase.from("crm_contacts").insert({organization_id:orgId,full_name:String(form.full_name ?? "").trim(),phone:String(form.phone ?? "").trim()||null,whatsapp_phone:String(form.phone ?? "").trim()||null,email:String(form.email ?? "").trim()||null,source:"CRM",created_by:userId||null,updated_by:userId||null}).select().single();if(ce)throw ce;const {data:l,error:le}=await supabase.from("crm_leads").insert({organization_id:orgId,contact_id:c.id,assigned_to:userId||null,vin:String(form.vin ?? "").trim()||null,vehicle_label:String(form.vehicle_label ?? "").trim()||null,priority:form.priority,created_by:userId||null,updated_by:userId||null}).select().single();if(le)throw le;const {error:me}=await supabase.rpc("crm_move_lead_stage_v3990",{p_lead_id:l.id,p_stage_code:"NEW_LEAD",p_note:"Lead creado desde CRM Comercial"});if(me)throw me;setForm({full_name:"",phone:"",email:"",vin:"",vehicle_label:"",priority:"NORMAL"});setShowNew(false);setNotice("Lead creado y tarea inicial generada correctamente.");await load()}catch(e){setError(e?.message||"No fue posible crear el lead.")}finally{setSaving(false)}}
 async function moveLead(lead,stageCode){if(!stageCode||stageCode===lead.stage_code)return;setError("");setNotice("");const {data,error:e}=await supabase.rpc("crm_move_lead_stage_v3990",{p_lead_id:lead.id,p_stage_code:stageCode,p_note:`Movimiento desde Pipeline por ${userName}`});if(e){setError(e.message);return}if(data?.ok===false){setError(`No se puede avanzar. Falta: ${(data.missing_fields||[]).join(", ")}.`);return}setNotice(`${lead.lead_code||"Lead"} movido correctamente.`);await load();if(selected?.id===lead.id)await openLead({...lead,stage_code:stageCode})}
 async function openLead(lead){const c=contactsById[lead.contact_id]||{};setFollowUp({outcome:"",note:""});setObjectionReply("");setHandoff({payment_status:"PENDING",balance_gtq:"",documents_confirmed:false,agreements:"Sin acuerdos especiales",operations_assigned_to:""});setFreightPayment({status:"PENDING",amount_usd:null,requested_at:null,paid_at:new Date().toISOString().slice(0,10),receipt_reference:"",notes:""});setSelected(lead);
 if(lead.stage_code==="FREIGHT_PENDING"){
  supabase.rpc("crm_get_freight_payment_v399121",{p_lead_id:lead.id}).then(({data,error})=>{
   if(error){setError(error.message||"No fue posible cargar el cobro de flete.");return}
   if(data)setFreightPayment({status:data.status||"PENDING",amount_usd:data.amount_usd??null,requested_at:data.requested_at||null,paid_at:data.paid_at||new Date().toISOString().slice(0,10),receipt_reference:data.receipt_reference||"",notes:data.notes||""});
  });
 }
 if(Number(stages.find(x=>x.code===lead.stage_code)?.position)===8){
  // V39.9.10.1 INTERNAL OPS USERS
  // Mismo criterio oficial de Usuarios Internos: misma organización + ADMIN/OPERADOR + activos.
  supabase.from("profiles")
   .select("id,full_name,email,role,job_title,active,organization_id")
   .eq("organization_id",lead.organization_id)
   .in("role",["ADMIN","OPERADOR"])
   .eq("active",true)
   .order("full_name",{ascending:true})
   .then(({data,error})=>{
    if(!error)setOpsUsers(data||[]);
    else setOpsUsers([]);
   });
 }setEdit({...emptyEdit,...lead,full_name:c.full_name||"",phone:c.phone||c.whatsapp_phone||"",email:c.email||""});setDetailLoading(true);setError("");const qs=lead.vin?supabase.from("commercial_quotes").select("id,quote_code,status,client_name,vin,vehicle_label,created_at,finalized_at").eq("vin",lead.vin).order("created_at",{ascending:false}).limit(10):Promise.resolve({data:[],error:null});const [a,t,q]=await Promise.all([supabase.from("crm_activities").select("*").eq("lead_id",lead.id).order("created_at",{ascending:false}),supabase.from("crm_tasks").select("*").eq("lead_id",lead.id).order("created_at",{ascending:false}),qs]);if(a.error)setError(a.error.message);if(t.error)setError(t.error.message);if(q.error)setError(q.error.message);setActivities(a.data||[]);setDetailTasks(t.data||[]);setLeadQuotes(q.data||[]);setDetailLoading(false)}
 async function identifyVin(){const vin=String(edit.vin||"").trim().toUpperCase().replace(/\s+/g,"");if(vin.length!==17){setError("El VIN debe contener 17 caracteres.");return}setVinLoading(true);setError("");try{const {data,error:e}=await supabase.functions.invoke("identify-vin",{body:{vin}});if(e)throw e;if(!data?.success)throw new Error(data?.error||"No fue posible identificar el vehículo.");const v=data.vehicle||{};setEdit(x=>({...x,vin,vehicle_year:v.model_year||x.vehicle_year,vehicle_make:v.make||x.vehicle_make,vehicle_model:v.model||x.vehicle_model,vehicle_trim:v.trim||v.series||x.vehicle_trim,vehicle_label:[v.model_year,v.make,v.model,v.trim||v.series].filter(Boolean).join(" ")||x.vehicle_label}));setNotice("VIN identificado. Revisá los datos y guardá la ficha.")}catch(e){setError(e?.message||"No fue posible identificar el VIN.")}finally{setVinLoading(false)}}
 // V39.9.8 FOLLOW-UP INTELLIGENCE
 async function registerProposalFollowUp(outcome){
  if(!selected||selected.stage_code!=="PROPOSAL_SENT")return;
  const note=String(followUp.note||"").trim();
  if((outcome==="OBJECTION"||outcome==="LOST")&&!note){
   setError(outcome==="OBJECTION"?"Escribí cuál es la objeción del cliente.":"Indicá el motivo por el que se perdió la oportunidad.");
   return;
  }
  setSaving(true);setError("");setNotice("");
  try{
   const labels={NO_RESPONSE:"Sin respuesta",INTERESTED:"Interesado",OBJECTION:"Tiene objeción",CONTINUE:"Desea continuar",LOST:"No interesado"};
   let nextDate=null, cadenceLabel=null;
   if(outcome==="NO_RESPONSE"){
    const previousNoResponse=activities.filter(a=>a.activity_type==="PROPOSAL_FOLLOW_UP"&&a.metadata?.outcome==="NO_RESPONSE").length;
    const schedule=[1,3,7,14];
    if(previousNoResponse>=schedule.length)throw new Error("Ya se completó la cadencia Día 1, Día 3, Día 7 y Día 14. Corresponde decidir nutrición/inactivo o cierre.");
    const day=schedule[previousNoResponse];
    nextDate=addDaysAtNine(day);
    cadenceLabel="Día "+day;
   }else if(outcome==="INTERESTED"){
    nextDate=addDaysAtNine(2);
    cadenceLabel="Interesado · +2 días";
   }
   const activityPayload={
    organization_id:selected.organization_id,
    lead_id:selected.id,
    contact_id:selected.contact_id,
    activity_type:"PROPOSAL_FOLLOW_UP",
    title:"Seguimiento de propuesta · "+labels[outcome],
    description:note||("Resultado registrado por "+userName),
    metadata:{outcome,next_contact_at:nextDate,cadence:cadenceLabel,quote_code:selected.quote_code||null},
    created_by:userId||null
   };
   const {error:ae}=await supabase.from("crm_activities").insert(activityPayload);
   if(ae)throw ae;

   if(outcome==="NO_RESPONSE"||outcome==="INTERESTED"){

    const currentTask=detailTasks.find(t=>t.is_primary&&OPEN.has(t.status)&&t.task_type==="FOLLOW_UP_PROPOSAL");
    if(currentTask){
     const {error:te}=await supabase.from("crm_tasks").update({due_at:nextDate}).eq("id",currentTask.id);
     if(te)throw te;
    }
    setNotice(labels[outcome]+" registrado. Próximo seguimiento automático: "+cadenceLabel+".");
   }else{
    let target=null;
    if(outcome==="OBJECTION") target=stages.find(s=>s.code==="NEGOTIATION")?.code||stages.find(s=>Number(s.position)===7)?.code;
    if(outcome==="CONTINUE"){
     const {error:ce}=await supabase.from("crm_leads").update({client_confirmed:true,updated_by:userId||null}).eq("id",selected.id);
     if(ce)throw ce;
     target=stages.find(s=>Number(s.position)===8)?.code;
    }
    if(outcome==="LOST") target=stages.find(s=>s.code==="LOST")?.code||stages.find(s=>Number(s.position)===12)?.code;
    if(!target)throw new Error("No pude identificar la etapa destino del pipeline.");

    // V39.9.8.3 OBJECTION EVIDENCE
    // El validador exige OBJECION_MOTIVO antes de permitir entrar a Objeción / negociación.
    if(outcome==="OBJECTION"){
     const {error:oe}=await supabase.from("crm_objections").insert({
      organization_id:selected.organization_id,
      lead_id:selected.id,
      objection_type:"COMMERCIAL",
      reason:note,
      response:null,
      resolved:false,
      created_by:userId||null
     });
     if(oe)throw oe;
    }

    const {data:moved,error:me}=await supabase.rpc("crm_move_lead_stage_v3990",{
     p_lead_id:selected.id,p_stage_code:target,p_note:"Seguimiento: "+labels[outcome]+(note?" · "+note:"")
    });
    if(me)throw me;
    if(moved?.ok===false)throw new Error("No se puede avanzar. Falta: "+(moved.missing_fields||[]).join(", "));
    setNotice(outcome==="OBJECTION"
     ?"Objeción registrada y lead movido a Objeción / negociación."
     :"Seguimiento registrado y lead movido correctamente.");
   }
   await load();
   const {data:fresh,error:fe}=await supabase.from("crm_leads").select("*").eq("id",selected.id).single();
   if(fe)throw fe;
   if(fresh)await openLead(fresh);
  }catch(e){setError(e?.message||"No fue posible registrar el seguimiento.");}
  finally{setSaving(false)}
 }
 // V39.9.9 OBJECTION MANAGEMENT
 async function resolveCurrentObjection(continues){
  if(!selected||selected.stage_code!=="NEGOTIATION")return;
  const response=String(objectionReply||"").trim();
  if(!response){setError("Escribí la respuesta o acuerdo alcanzado con el cliente.");return}
  setSaving(true);setError("");setNotice("");
  try{
   const {data:objections,error:oe}=await supabase.from("crm_objections").select("*").eq("lead_id",selected.id).eq("resolved",false).order("created_at",{ascending:false}).limit(1);
   if(oe)throw oe;
   const objection=objections?.[0];
   if(!objection)throw new Error("No encontré una objeción pendiente para este lead.");

   const {error:ue}=await supabase.from("crm_objections").update({
    response,
    resolved:true,
    resolved_at:new Date().toISOString(),
    resolved_by:userId||null
   }).eq("id",objection.id);
   if(ue)throw ue;

   await supabase.from("crm_activities").insert({
    organization_id:selected.organization_id,lead_id:selected.id,contact_id:selected.contact_id,
    activity_type:"OBJECTION_RESOLVED",
    title:continues?"Objeción resuelta · cliente continúa":"Objeción cerrada · cliente no continúa",
    description:response,
    metadata:{objection_id:objection.id,continues},
    created_by:userId||null
   });

   let target;
   if(continues){
    // La etapa 8 exige confirmación del cliente según crm_validate_stage_v3990.
    const {error:ce}=await supabase.from("crm_leads").update({client_confirmed:true,updated_by:userId||null}).eq("id",selected.id);
    if(ce)throw ce;
    target=stages.find(x=>Number(x.position)===8)?.code;
   }else{
    target=stages.find(x=>Number(x.position)===12)?.code;
   }
   if(!target)throw new Error("No pude identificar la etapa destino del pipeline.");

   const {data:moved,error:me}=await supabase.rpc("crm_move_lead_stage_v3990",{
    p_lead_id:selected.id,p_stage_code:target,
    p_note:(continues?"Objeción resuelta; cliente desea continuar. ":"Objeción no resuelta; oportunidad cerrada. ")+response
   });
   if(me)throw me;
   if(moved?.ok===false)throw new Error("No se puede avanzar. Falta: "+(moved.missing_fields||[]).join(", "));

   setNotice(continues?"Objeción resuelta. Lead movido a Aceptado / coordinar.":"Objeción cerrada. Lead movido a Venta perdida.");
   await load();
   const {data:fresh,error:fe}=await supabase.from("crm_leads").select("*").eq("id",selected.id).single();
   if(fe)throw fe;
   if(fresh)await openLead(fresh);
  }catch(e){setError(e?.message||"No fue posible resolver la objeción.");}
  finally{setSaving(false)}
 }
 // V39.9.10 OPERATIONS HANDOFF
  // V39.9.11 CRM ↔ OPERATIONS BRIDGE
  async function deliverToOperations(){
   if(!selected||Number(stages.find(x=>x.code===selected.stage_code)?.position)!==8)return;
   const agreements=String(handoff.agreements||"").trim();
   if(!handoff.operations_assigned_to){setError("Seleccioná el responsable operativo.");return}
   if(!handoff.documents_confirmed){setError("Confirmá que los documentos disponibles fueron revisados para el expediente.");return}
   if(!agreements){setError("Registrá los acuerdos especiales o indicá “Sin acuerdos especiales”.");return}
   setSaving(true);setError("");setNotice("");
   try{
    const balance=handoff.balance_gtq===""?null:Number(handoff.balance_gtq);
    if(balance!==null&&!Number.isFinite(balance))throw new Error("El saldo pendiente no es válido.");
    const {data,error:he}=await supabase.rpc("crm_deliver_to_operations_v39911",{
     p_lead_id:selected.id,
     p_payment_status:handoff.payment_status,
     p_balance_gtq:balance,
     p_documents_confirmed:!!handoff.documents_confirmed,
     p_agreements:agreements,
     p_operations_assigned_to:handoff.operations_assigned_to
    });
    if(he)throw he;
    if(data?.ok===false)throw new Error("No fue posible completar el handoff.");
    setNotice("Expediente entregado · Gestión "+(data?.management_code||"creada")+" · esperando embarque.");
    await load();
    const {data:fresh,error:fe}=await supabase.from("crm_leads").select("*").eq("id",selected.id).single();
    if(fe)throw fe;if(fresh)await openLead(fresh);
   }catch(e){setError(e?.message||"No fue posible entregar el expediente a Operaciones.");}
   finally{setSaving(false)}
  }

// V39.9.12 FREIGHT PAYMENT
 async function requestFreightPayment(){
  if(!selected||selected.stage_code!=="FREIGHT_PENDING")return;setSaving(true);setError("");setNotice("");
  try{const {data,error:e}=await supabase.rpc("crm_request_freight_payment_v39912",{p_lead_id:selected.id,p_notes:String(freightPayment.notes||"").trim()||null});if(e)throw e;if(data?.ok===false)throw new Error("No fue posible registrar la solicitud de cobro.");setFreightPayment(x=>({...x,status:"REQUESTED",amount_usd:data?.amount_usd??x.amount_usd,requested_at:data?.requested_at||new Date().toISOString()}));setNotice("Cobro de flete solicitado y registrado.");await load();}
  catch(e){setError(e?.message||"No fue posible registrar la solicitud de cobro.");}finally{setSaving(false)}
 }
 async function confirmFreightPayment(){
  if(!selected||selected.stage_code!=="FREIGHT_PENDING")return;const receipt=String(freightPayment.receipt_reference||"").trim();if(!freightPayment.paid_at){setError("Indicá la fecha de pago del flete.");return}if(!receipt){setError("Ingresá la referencia o comprobante del pago.");return}setSaving(true);setError("");setNotice("");
  try{const {data,error:e}=await supabase.rpc("crm_confirm_freight_payment_v39912",{p_lead_id:selected.id,p_paid_at:freightPayment.paid_at,p_receipt_reference:receipt,p_notes:String(freightPayment.notes||"").trim()||null});if(e)throw e;if(data?.ok===false)throw new Error("No fue posible confirmar el pago del flete.");setNotice("Pago de flete confirmado. Lead cerrado como Logrado con éxito.");await load();const {data:fresh,error:fe}=await supabase.from("crm_leads").select("*").eq("id",selected.id).single();if(fe)throw fe;if(fresh)await openLead(fresh);}
  catch(e){setError(e?.message||"No fue posible confirmar el pago del flete.");}finally{setSaving(false)}
 }

 // V39.9.15 WHATSAPP INBOX FOUNDATION
 async function openWhatsAppConversation(conv){setWaSelected(conv);setWaLoading(true);setError("");try{const {data,error:e}=await supabase.from("crm_whatsapp_messages").select("*").eq("conversation_id",conv.id).order("message_at",{ascending:true});if(e)throw e;setWaMessages(data||[]);if(Number(conv.unread_count||0)>0){await supabase.rpc("crm_whatsapp_mark_read_v39915",{p_conversation_id:conv.id});setWaConversations(x=>x.map(c=>c.id===conv.id?{...c,unread_count:0}:c))}}catch(e){setError(e?.message||"No fue posible abrir la conversación.")}finally{setWaLoading(false)}}
 async function sendFoundationMessage(){if(!waSelected)return;const body=String(waDraft||"").trim();if(!body)return;setSaving(true);setError("");try{const {data,error:e}=await supabase.functions.invoke("whatsapp-send",{body:{conversation_id:waSelected.id,body}});if(e)throw e;if(data?.error)throw new Error(data.error);setWaDraft("");await openWhatsAppConversation({...waSelected,last_message_at:data?.message?.message_at||new Date().toISOString()});await load();setNotice("Mensaje enviado por WhatsApp Cloud API.")}catch(e){setError(e?.message||"No fue posible enviar el mensaje por WhatsApp.")}finally{setSaving(false)}}
 async function saveLead(){if(!selected)return;setSaving(true);setError("");setNotice("");try{const {error:ce}=await supabase.from("crm_contacts").update({full_name:String(edit.full_name ?? "").trim(),phone:String(edit.phone ?? "").trim()||null,whatsapp_phone:String(edit.phone ?? "").trim()||null,email:String(edit.email ?? "").trim()||null,updated_by:userId||null}).eq("id",selected.contact_id);if(ce)throw ce;const vehicle_location=String(edit.vehicle_location ?? "").trim(),delivery_location=String(edit.delivery_location ?? "").trim(),auction_name=String(edit.auction_name ?? "").trim(),service_requested=String(edit.service_requested ?? "").trim(),tow_details=String(edit.tow_details ?? "").trim();const logistics_complete=!!(vehicle_location&&delivery_location&&auction_name&&service_requested&&(!edit.requires_tow||tow_details));const payload={vin:String(edit.vin ?? "").trim().toUpperCase()||null,vehicle_year:edit.vehicle_year?Number(edit.vehicle_year):null,vehicle_make:String(edit.vehicle_make ?? "").trim()||null,vehicle_model:String(edit.vehicle_model ?? "").trim()||null,vehicle_trim:String(edit.vehicle_trim ?? "").trim()||null,vehicle_label:String(edit.vehicle_label ?? "").trim()||null,priority:edit.priority,vehicle_validated:!!edit.vehicle_validated,vehicle_location:vehicle_location||null,delivery_location:delivery_location||null,auction_name:auction_name||null,requires_tow:!!edit.requires_tow,tow_details:tow_details||null,logistics_complete,service_requested:service_requested||null,client_confirmed:!!edit.client_confirmed,special_agreements:String(edit.special_agreements ?? "").trim()||null,updated_by:userId||null};const {error:le}=await supabase.from("crm_leads").update(payload).eq("id",selected.id);if(le)throw le;await supabase.from("crm_activities").insert({organization_id:selected.organization_id,lead_id:selected.id,contact_id:selected.contact_id,activity_type:"LEAD_UPDATED",title:"Ficha comercial actualizada",description:`Actualizada por ${userName}`,metadata:{vin:payload.vin,vehicle_validated:payload.vehicle_validated,logistics_complete:payload.logistics_complete},created_by:userId||null});setNotice("Ficha comercial guardada correctamente.");await load();const {data:fresh}=await supabase.from("crm_leads").select("*").eq("id",selected.id).single();if(fresh)await openLead(fresh)}catch(e){setError(e?.message||"No fue posible guardar la ficha.")}finally{setSaving(false)}}
 return <section className="crm-pro-shell"><header className="crm-pro-hero"><div><span className="crm-eyebrow">E&R CRM PRO · V39.9.16.1</span><h1>CRM Comercial</h1><p>Inteligencia comercial, seguimiento y cierre conectados con la operación real.</p></div><div className="crm-hero-actions"><button className="crm-secondary" onClick={load}>↻ Actualizar</button><button className="crm-primary" onClick={()=>setShowNew(true)}>＋ Nuevo lead</button></div></header>
 <div className="crm-intel-toolbar"><div><strong>Vista comercial</strong><span>Filtrá el tablero sin alterar el pipeline.</span></div><label>Período<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="ALL">Todo</option></select></label><label>Asesor<select value={advisorFilter} onChange={e=>setAdvisorFilter(e.target.value)}><option value="ALL">Todos los asesores</option>{advisors.map(a=><option key={a.id} value={a.id}>{a.full_name||a.email}</option>)}</select></label></div>
 <div className="crm-kpis crm-kpis-intel"><article><span>Oportunidades activas</span><strong>{metrics.open}</strong><small>Pipeline filtrado</small></article><article><span>Propuestas</span><strong>{metrics.proposals}</strong><small>Enviadas o avanzadas</small></article><article><span>Ganadas</span><strong>{metrics.won}</strong><small>{metrics.conversion}% conversión sobre cierres</small></article><article className={metrics.overdue?"crm-alert":""}><span>Tareas vencidas</span><strong>{metrics.overdue}</strong><small>Requieren atención</small></article></div>
 <nav className="crm-tabs crm-tabs-five"><button className={tab==="dashboard"?"active":""} onClick={()=>setTab("dashboard")}>📊 Dashboard</button><button className={tab==="pipeline"?"active":""} onClick={()=>setTab("pipeline")}>🧲 Pipeline</button><button className={tab==="today"?"active":""} onClick={()=>setTab("today")}>✅ Mi trabajo hoy</button><button className={tab==="contacts"?"active":""} onClick={()=>setTab("contacts")}>👥 Contactos</button><button className={tab==="whatsapp"?"active":""} onClick={()=>setTab("whatsapp")}>📲 Conversaciones</button></nav>{error&&<div className="crm-message error">⚠ {error}</div>}{notice&&<div className="crm-message ok">✓ {notice}</div>}
 {loading?<div className="crm-empty">Cargando CRM…</div>:tab==="dashboard"?<div className="crm-intelligence-dashboard">
  <div className="crm-intel-grid">
   <section className="crm-intel-panel"><header><div><span className="crm-panel-kicker">RENDIMIENTO</span><h3>Resumen comercial</h3></div><span>{period==="ALL"?"Histórico":`Últimos ${period} días`}</span></header><div className="crm-metric-grid"><article><span>Nuevos leads</span><strong>{metrics.newLeads}</strong></article><article><span>En negociación</span><strong>{metrics.quoting}</strong></article><article><span>Perdidas</span><strong>{metrics.lost}</strong></article><article><span>Valor potencial</span><strong>Q{metrics.potential.toLocaleString("es-GT",{maximumFractionDigits:0})}</strong></article></div></section>
   <section className="crm-intel-panel"><header><div><span className="crm-panel-kicker">PIPELINE</span><h3>Distribución por etapa</h3></div><span>{filteredLeads.length} oportunidades</span></header><div className="crm-stage-bars">{stageDistribution.map(s=>{const pct=filteredLeads.length?Math.max(6,Math.round(s.count/filteredLeads.length*100)):0;return <div key={s.code}><div><span>{s.name}</span><strong>{s.count}</strong></div><i><b style={{width:`${pct}%`}}/></i></div>})}{!stageDistribution.length&&<div className="crm-empty compact">Sin oportunidades para estos filtros.</div>}</div></section>
  </div>
  <section className="crm-intel-panel crm-advisor-panel"><header><div><span className="crm-panel-kicker">EQUIPO</span><h3>Carga por asesor</h3></div><span>Asignación comercial</span></header><div className="crm-advisor-grid">{advisors.map(a=>{const mine=filteredLeads.filter(l=>l.assigned_to===a.id),active=mine.filter(l=>!["WON","LOST"].includes(l.stage_code)).length,won=mine.filter(l=>l.stage_code==="WON").length;return <article key={a.id}><div className="crm-avatar">{(a.full_name||a.email||"A").charAt(0).toUpperCase()}</div><div><strong>{a.full_name||a.email}</strong><small>{a.job_title||a.role}</small></div><span><b>{active}</b> activas · <b>{won}</b> ganadas</span></article>})}{!advisors.length&&<div className="crm-empty compact">No hay asesores internos disponibles.</div>}</div></section>
 </div>:tab==="pipeline"?<div className="crm-board">{stages.map(stage=>{const sl=filteredLeads.filter(l=>l.stage_code===stage.code);return <section className="crm-column" key={stage.code}><header><div><span className={`crm-stage-dot ${stage.category.toLowerCase()}`}></span><strong>{stage.name}</strong></div><b>{sl.length}</b></header><div className="crm-card-list">{!sl.length&&<div className="crm-column-empty">Sin oportunidades</div>}{sl.map(lead=>{const c=contactsById[lead.contact_id]||{},task=openTaskByLead[lead.id],advisor=advisorById[lead.assigned_to];return <article className="crm-lead-card crm-clickable" key={lead.id} onClick={()=>openLead(lead)}><div className="crm-card-top"><span className={`crm-priority ${lead.priority.toLowerCase()}`}>{lead.priority}</span><button className="crm-code-link" onClick={e=>{e.stopPropagation();openLead(lead)}}>{lead.lead_code}</button></div><h3>{c.full_name||"Contacto"}</h3><p>{lead.vehicle_label||vehicle(lead)}</p>{lead.vin&&<code>{lead.vin}</code>}<div className="crm-advisor-chip">👤 {advisor?.full_name||advisor?.email||"Sin asesor"}</div><div className="crm-task-line"><span>✓</span><div><strong>{taskTitle(task)}</strong><small>{task?dueLabel(task.due_at):"—"}</small></div></div><select value={lead.stage_code} onClick={e=>e.stopPropagation()} onChange={e=>moveLead(lead,e.target.value)}>{stages.map(s=><option value={s.code} key={s.code}>{s.name}</option>)}</select></article>})}</div></section>})}</div>:tab==="today"?<div className="crm-work-pro"><div className="crm-work-summary"><button className={workFilter==="OVERDUE"?"active danger":""} onClick={()=>setWorkFilter(workFilter==="OVERDUE"?"ALL":"OVERDUE")}><span>🔴 Vencidas</span><strong>{workBuckets.overdue.length}</strong></button><button className={workFilter==="TODAY"?"active":""} onClick={()=>setWorkFilter(workFilter==="TODAY"?"ALL":"TODAY")}><span>🟠 Para hoy</span><strong>{workBuckets.today.length}</strong></button><button className={workFilter==="UPCOMING"?"active":""} onClick={()=>setWorkFilter(workFilter==="UPCOMING"?"ALL":"UPCOMING")}><span>🔵 Próximas</span><strong>{workBuckets.upcoming.length}</strong></button><button className={workFilter==="STALE"?"active warning":""} onClick={()=>setWorkFilter(workFilter==="STALE"?"ALL":"STALE")}><span>⚠ Sin movimiento</span><strong>{workBuckets.stale.length}</strong></button></div><div className="crm-work-list">{(workFilter==="STALE"?workBuckets.stale.map(l=>({id:`stale-${l.id}`,lead_id:l.id,_stale:true,title:"Oportunidad sin movimiento",due_at:null})):filteredTasks.filter(t=>OPEN.has(t.status)&&(workFilter==="ALL"||workBuckets[workFilter.toLowerCase()]?.some(x=>x.id===t.id)))).map(task=>{const l=filteredLeads.find(x=>x.id===task.lead_id),c=contactsById[l?.contact_id]||{},advisor=advisorById[l?.assigned_to];return <article key={task.id} onClick={()=>l&&openLead(l)} className="crm-clickable"><div><span className="crm-task-icon">{task._stale?"⚠":"✓"}</span><div><h3>{task._stale?task.title:taskTitle(task)}</h3><p>{c.full_name||l?.lead_code||"Lead"} · {l?vehicle(l):""}</p><small>{stages.find(s=>s.code===l?.stage_code)?.name||l?.stage_code||""} · 👤 {advisor?.full_name||advisor?.email||"Sin asesor"}</small></div></div><strong className={task.due_at&&new Date(task.due_at)<new Date()?"late":""}>{task._stale?"Revisar":dueLabel(task.due_at)}</strong></article>})}{!(workFilter==="STALE"?workBuckets.stale.length:filteredTasks.some(t=>OPEN.has(t.status)&&(workFilter==="ALL"||workBuckets[workFilter.toLowerCase()]?.some(x=>x.id===t.id))))&&<div className="crm-empty">No hay trabajo pendiente en esta categoría. 🎉</div>}</div></div>:tab==="whatsapp"?<div className="crm-wa-shell"><aside className="crm-wa-list"><header><div><span className="crm-panel-kicker">WHATSAPP</span><h3>Conversaciones</h3></div><b>{waConversations.length}</b></header><div className="crm-wa-list-body">{waConversations.map(conv=>{const ct=contactsById[conv.contact_id]||{},ld=leads.find(x=>x.id===conv.lead_id);return <button key={conv.id} className={waSelected?.id===conv.id?"active":""} onClick={()=>openWhatsAppConversation(conv)}><span className="crm-avatar">{(ct.full_name||conv.phone||"W").charAt(0).toUpperCase()}</span><span><strong>{ct.full_name||conv.phone||"Contacto WhatsApp"}</strong><small>{conv.last_message_preview||"Sin mensajes todavía"}</small><em>{ld?vehicle(ld):"Sin lead vinculado"}</em></span>{Number(conv.unread_count||0)>0&&<b>{conv.unread_count}</b>}</button>})}{!waConversations.length&&<div className="crm-empty compact">Todavía no hay conversaciones.</div>}</div></aside><section className="crm-wa-chat">{!waSelected?<div className="crm-wa-welcome"><div>📲</div><h2>WhatsApp Inbox</h2><p>Seleccioná una conversación. Esta Foundation queda lista para conectar WhatsApp Cloud API.</p></div>:<><header className="crm-wa-chat-head"><div><strong>{contactsById[waSelected.contact_id]?.full_name||waSelected.phone}</strong><span>{waSelected.phone}</span></div></header><div className="crm-wa-messages">{waLoading?<div className="crm-empty compact">Cargando…</div>:waMessages.map(m=><div key={m.id} className={"crm-wa-message "+(m.direction==="OUT"?"out":"in")}><p>{m.body||"[Mensaje sin texto]"}</p><small>{m.message_at?new Date(m.message_at).toLocaleString("es-GT"):""} · {m.status}</small></div>)}{!waLoading&&!waMessages.length&&<div className="crm-empty compact">Sin mensajes todavía.</div>}</div><footer className="crm-wa-composer"><textarea value={waDraft} onChange={e=>setWaDraft(e.target.value)} placeholder="Escribí un mensaje…"/><button className="crm-primary" disabled={saving||!String(waDraft||"").trim()} onClick={sendFoundationMessage}>Enviar</button></footer></>}</section><aside className="crm-wa-side">{waSelected?(()=>{const ct=contactsById[waSelected.contact_id]||{},ld=leads.find(x=>x.id===waSelected.lead_id),st=stages.find(s=>s.code===ld?.stage_code),tk=openTaskByLead[ld?.id];return <><span className="crm-panel-kicker">CONTEXTO CRM</span><h3>{ct.full_name||"Contacto"}</h3><p>{ct.phone||ct.whatsapp_phone||waSelected.phone}</p><div className="crm-wa-side-card"><small>Oportunidad</small><strong>{ld?.lead_code||"Sin lead"}</strong><span>{st?.name||"—"}</span></div><div className="crm-wa-side-card"><small>Vehículo</small><strong>{ld?vehicle(ld):"Sin vehículo"}</strong>{ld?.vin&&<code>{ld.vin}</code>}</div><div className="crm-wa-side-card"><small>Tarea</small><strong>{taskTitle(tk)}</strong><span>{tk?dueLabel(tk.due_at):"—"}</span></div>{ld&&<button className="crm-secondary" onClick={()=>openLead(ld)}>Abrir ficha comercial</button>}</>})():null}</aside></div>:<div className="crm-contact-grid">{contacts.map(c=><article key={c.id}><div className="crm-avatar">{(c.full_name||"C").charAt(0).toUpperCase()}</div><div><h3>{c.full_name}</h3><p>{c.phone||"Sin teléfono"}</p><small>{c.email||"Sin correo"}</small></div><b>{leads.filter(l=>l.contact_id===c.id).length} lead(s)</b></article>)}</div>}
 {selected&&<div className="crm-drawer-backdrop" onMouseDown={()=>!saving&&setSelected(null)}><aside className="crm-drawer" onMouseDown={e=>e.stopPropagation()}><header className="crm-drawer-head"><div><span className="crm-eyebrow">FICHA COMERCIAL</span><h2>{edit.full_name||selected.lead_code}</h2><p>{selected.lead_code} · {stages.find(s=>s.code===selected.stage_code)?.name||selected.stage_code}</p></div><button onClick={()=>setSelected(null)}>×</button></header>{detailLoading?<div className="crm-empty">Cargando ficha…</div>:<div className="crm-drawer-body"><section className="crm-detail-section"><h3>👤 Contacto</h3><div className="crm-form-grid"><label>Nombre<input value={edit.full_name} onChange={e=>setEdit({...edit,full_name:e.target.value})}/></label><label>WhatsApp / teléfono<input value={edit.phone} onChange={e=>setEdit({...edit,phone:e.target.value})}/></label><label>Correo<input type="email" value={edit.email} onChange={e=>setEdit({...edit,email:e.target.value})}/></label><label>Prioridad<select value={edit.priority} onChange={e=>setEdit({...edit,priority:e.target.value})}><option value="LOW">Baja</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></label></div></section>
 <section className="crm-detail-section crm-owner-section"><h3>👤 Responsable comercial</h3><p className="crm-section-help">Asigná quién es responsable de dar seguimiento a esta oportunidad.</p><select value={selected.assigned_to||""} onChange={e=>assignAdvisor(selected.id,e.target.value)} disabled={saving}><option value="">Sin asesor asignado</option>{advisors.map(a=><option key={a.id} value={a.id}>{(a.full_name||a.email)+(a.job_title?" · "+a.job_title:"")}</option>)}</select></section>
 <section className="crm-detail-section"><h3>🚙 Vehículo y VIN</h3><div className="crm-vin-row"><label>VIN<input value={edit.vin} maxLength={17} onChange={e=>setEdit({...edit,vin:e.target.value.toUpperCase()})}/></label><button className="crm-secondary" type="button" onClick={identifyVin} disabled={vinLoading}>{vinLoading?"Identificando…":"🔎 Identificar VIN"}</button></div><div className="crm-form-grid four"><label>Año<input value={edit.vehicle_year||""} onChange={e=>setEdit({...edit,vehicle_year:e.target.value})}/></label><label>Marca<input value={edit.vehicle_make||""} onChange={e=>setEdit({...edit,vehicle_make:e.target.value})}/></label><label>Modelo<input value={edit.vehicle_model||""} onChange={e=>setEdit({...edit,vehicle_model:e.target.value})}/></label><label>Versión<input value={edit.vehicle_trim||""} onChange={e=>setEdit({...edit,vehicle_trim:e.target.value})}/></label></div><label className="crm-check"><input type="checkbox" checked={!!edit.vehicle_validated} onChange={e=>setEdit({...edit,vehicle_validated:e.target.checked})}/> Vehículo revisado y validado por E&R</label></section>
 <section className="crm-detail-section"><h3>📍 Logística</h3><div className="crm-form-grid"><label>Ubicación del vehículo<input value={edit.vehicle_location||""} onChange={e=>setEdit({...edit,vehicle_location:e.target.value})}/></label><label>Lugar de entrega<input value={edit.delivery_location||""} onChange={e=>setEdit({...edit,delivery_location:e.target.value})}/></label><label>Subasta / proveedor<input value={edit.auction_name||""} onChange={e=>setEdit({...edit,auction_name:e.target.value})}/></label><label>Servicio solicitado<input value={edit.service_requested||""} onChange={e=>setEdit({...edit,service_requested:e.target.value})}/></label></div><label className="crm-check"><input type="checkbox" checked={!!edit.requires_tow} onChange={e=>setEdit({...edit,requires_tow:e.target.checked})}/> Requiere grúa / tow</label>{edit.requires_tow&&<label>Detalle de grúa<textarea value={edit.tow_details||""} onChange={e=>setEdit({...edit,tow_details:e.target.value})}/></label>}<div className={`crm-logistics-status ${String(edit.vehicle_location||"").trim()&&String(edit.delivery_location||"").trim()&&String(edit.auction_name||"").trim()&&String(edit.service_requested||"").trim()&&(!edit.requires_tow||String(edit.tow_details||"").trim())?"ready":"pending"}`}><strong>{String(edit.vehicle_location||"").trim()&&String(edit.delivery_location||"").trim()&&String(edit.auction_name||"").trim()&&String(edit.service_requested||"").trim()&&(!edit.requires_tow||String(edit.tow_details||"").trim())?"✓ Logística completa":"⚠ Logística pendiente"}</strong><small>Se valida automáticamente al guardar según ubicación, entrega, proveedor, servicio y grúa cuando aplique.</small></div></section>
 {selected.stage_code==="PROPOSAL_SENT"&&<section className="crm-detail-section crm-followup-pro"><div className="crm-followup-head"><div><h3>📞 Seguimiento de propuesta</h3><p>Registrá qué respondió el cliente; el CRM programará automáticamente el siguiente paso.</p></div><span>FOLLOW-UP</span></div><div className="crm-auto-followup"><strong>🧠 Programación automática</strong><span>{automaticFollowUpText}</span><small>Cadencia sin respuesta según Especificación CRM EyR V1: Día 1 · Día 3 · Día 7 · Día 14.</small></div><label>Nota del seguimiento<textarea placeholder="Ej. Cliente revisará la propuesta con su esposa / solicita ajuste / llamar mañana..." value={followUp.note} onChange={e=>setFollowUp({...followUp,note:e.target.value})}/></label><div className="crm-followup-actions"><button type="button" disabled={saving} onClick={()=>registerProposalFollowUp("NO_RESPONSE")}>📵 Sin respuesta</button><button type="button" disabled={saving} onClick={()=>registerProposalFollowUp("INTERESTED")}>👀 Interesado</button><button type="button" disabled={saving} onClick={()=>registerProposalFollowUp("OBJECTION")}>💬 Tiene objeción</button><button type="button" disabled={saving} onClick={()=>registerProposalFollowUp("CONTINUE")} className="positive">🤝 Desea continuar</button><button type="button" disabled={saving} onClick={()=>registerProposalFollowUp("LOST")} className="negative">✕ No interesado</button></div><small className="crm-followup-hint">Sin respuesta e Interesado mantienen la propuesta activa. Objeción, Continuar y No interesado avanzan el pipeline automáticamente.</small></section>}
 {selected.stage_code==="NEGOTIATION"&&<section className="crm-detail-section crm-objection-manager"><div className="crm-followup-head"><div><h3>💬 Gestión de objeción</h3><p>Registrá cómo se atendió la objeción. El CRM cerrará la tarea y moverá el pipeline según el resultado.</p></div><span>NEGOCIACIÓN</span></div><label>Respuesta / acuerdo con el cliente<textarea placeholder="Ej. Se explicó el detalle del flete y el cliente aceptó continuar..." value={objectionReply} onChange={e=>setObjectionReply(e.target.value)}/></label><div className="crm-objection-actions"><button type="button" disabled={saving} onClick={()=>resolveCurrentObjection(true)} className="positive">🤝 Objeción resuelta · continúa</button><button type="button" disabled={saving} onClick={()=>resolveCurrentObjection(false)} className="negative">✕ No se logró resolver</button></div><small className="crm-followup-hint">Si continúa, el sistema registra la confirmación del cliente y pasa a Aceptado / coordinar. Si no continúa, cierra la oportunidad como Venta perdida.</small></section>}
{Number(stages.find(x=>x.code===selected.stage_code)?.position)===8&&<section className="crm-detail-section crm-handoff-pro"><div className="crm-followup-head"><div><h3>📦 Expediente para Operaciones</h3><p>El CRM valida la evidencia ya disponible y prepara el handoff operativo.</p></div><span>HANDOFF</span></div><div className="crm-handoff-checks"><span className={selected.contact_id?"ok":""}>✓ Cliente</span><span className={(selected.vin||selected.vehicle_label)?"ok":""}>✓ Vehículo</span><span className={selected.logistics_complete?"ok":""}>✓ Logística</span><span className={(selected.quote_id||selected.quote_code)?"ok":""}>✓ Cotización</span><span className={selected.client_confirmed?"ok":""}>✓ Servicio aceptado</span></div><div className="crm-handoff-grid"><label>Estado de pago<select value={handoff.payment_status} onChange={e=>setHandoff({...handoff,payment_status:e.target.value})}><option value="PENDING">Pendiente</option><option value="PARTIAL">Pago parcial</option><option value="PAID">Pagado</option></select></label><label>Saldo pendiente (Q)<input type="number" min="0" step="0.01" value={handoff.balance_gtq} onChange={e=>setHandoff({...handoff,balance_gtq:e.target.value})} placeholder="0.00"/></label><label className="wide">Responsable operativo<select value={handoff.operations_assigned_to} onChange={e=>setHandoff({...handoff,operations_assigned_to:e.target.value})}><option value="">Seleccionar responsable…</option>{opsUsers.map(p=><option key={p.id} value={p.id}>{(p.full_name||p.email||p.id)+(p.job_title?" · "+p.job_title:"")}</option>)}</select></label></div><label className="crm-doc-confirm"><input type="checkbox" checked={handoff.documents_confirmed} onChange={e=>setHandoff({...handoff,documents_confirmed:e.target.checked})}/><span><strong>📄 Documentos revisados</strong><small>Confirmo que los documentos disponibles fueron revisados antes de entregar el expediente.</small></span></label><label>Acuerdos / instrucciones para Operaciones<textarea value={handoff.agreements} onChange={e=>setHandoff({...handoff,agreements:e.target.value})} placeholder="Sin acuerdos especiales / instrucciones específicas del cliente..."/></label><button type="button" className="crm-handoff-submit" disabled={saving} onClick={deliverToOperations}>🚀 Entregar expediente a Operaciones</button><small className="crm-followup-hint">Al entregar, se crea la Gestión de Importación y el CRM queda esperando a Operaciones. Cuando la gestión pase a EMBARCADO, el CRM abrirá automáticamente Flete pendiente.</small></section>}
{selected.stage_code==="FREIGHT_PENDING"&&<section className="crm-detail-section crm-freight-payment"><div className="crm-followup-head"><div><h3>💰 Cobro de flete</h3><p>Registrá la solicitud y la evidencia real del pago antes de cerrar la venta.</p></div><span>FLETE</span></div><div className="crm-freight-summary"><strong>{freightPayment.amount_usd!=null?"$"+Number(freightPayment.amount_usd).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"Monto según Gestión"}</strong><span className={freightPayment.status==="CONFIRMED"?"ok":""}>{freightPayment.status==="CONFIRMED"?"Pago confirmado":freightPayment.status==="REQUESTED"?"Cobro solicitado":"Pendiente de cobro"}</span></div>{freightPayment.requested_at&&<small className="crm-freight-date">Solicitud: {new Date(freightPayment.requested_at).toLocaleString("es-GT")}</small>}<div className="crm-form-grid"><label>Fecha de pago<input type="date" value={freightPayment.paid_at||""} onChange={e=>setFreightPayment({...freightPayment,paid_at:e.target.value})}/></label><label>Referencia / comprobante<input value={freightPayment.receipt_reference||""} onChange={e=>setFreightPayment({...freightPayment,receipt_reference:e.target.value})} placeholder="Transferencia, depósito, recibo..."/></label></div><label>Observaciones<textarea value={freightPayment.notes||""} onChange={e=>setFreightPayment({...freightPayment,notes:e.target.value})} placeholder="Detalle del cobro o pago..."/></label><div className="crm-objection-actions"><button type="button" disabled={saving||freightPayment.status==="CONFIRMED"} onClick={requestFreightPayment}>📨 Registrar cobro solicitado</button><button type="button" className="positive" disabled={saving||freightPayment.status==="CONFIRMED"} onClick={confirmFreightPayment}>✅ Confirmar pago del flete</button></div><small className="crm-followup-hint">Confirmar el pago guarda fecha + comprobante, cierra Cobrar flete y mueve automáticamente el lead a Logrado con éxito.</small></section>}
<section className="crm-detail-section"><h3>🧾 Cotización</h3>{selected.quote_id?<div className="crm-quote-linked">
<strong>✓ Cotización vinculada</strong>
<span>{selected.quote_code||"Cotización comercial"}</span>
<div className="crm-linked-quote-actions">
<button type="button" className="crm-secondary" onClick={()=>{const lead={...selected,...edit};setSelected(null);onOpenLinkedQuote?.(lead)}}>👁 Ver cotización</button>
<button type="button" className="crm-primary" onClick={()=>{const lead={...selected,...edit};setSelected(null);onSendLinkedQuoteWhatsApp?.(lead)}}>💬 Enviar por WhatsApp</button>
</div>
</div>:<><p className="crm-section-help">Prepará la cotización con el motor actual de E&R o vinculá una cotización existente del mismo VIN.</p><button type="button" className="crm-primary crm-full-action" onClick={()=>{const lead={...selected,...edit};setSelected(null);onOpenQuote?.(lead)}}>＋ Abrir cotizador con este VIN</button>{leadQuotes.length>0&&<div className="crm-quote-options">{leadQuotes.map(q=><button type="button" key={q.id} onClick={async()=>{setSaving(true);setError("");try{const {error:e}=await supabase.from("crm_leads").update({quote_id:q.id,quote_code:q.quote_code,updated_by:userId||null}).eq("id",selected.id);if(e)throw e;setNotice(`Cotización ${q.quote_code} vinculada al lead.`);const fresh={...selected,quote_id:q.id,quote_code:q.quote_code};setSelected(fresh);await load()}catch(e){setError(e?.message||"No fue posible vincular la cotización.")}finally{setSaving(false)}}}><span>{q.quote_code}</span><small>{q.status||"DRAFT"} · {q.vehicle_label||q.vin}</small></button>)}</div>}</>}</section>
 <section className="crm-detail-section"><h3>🤝 Acuerdos comerciales</h3><label className="crm-check"><input type="checkbox" checked={!!edit.client_confirmed} onChange={e=>setEdit({...edit,client_confirmed:e.target.checked})}/> Cliente confirmó que desea continuar</label><label>Acuerdos / observaciones<textarea value={edit.special_agreements||""} onChange={e=>setEdit({...edit,special_agreements:e.target.value})} placeholder="Condiciones especiales, compromisos, observaciones…"/></label></section>
 <section className="crm-detail-section"><h3>✅ Tareas</h3><div className="crm-mini-list">{detailTasks.map(t=><div key={t.id}><span>{OPEN.has(t.status)?"●":"✓"}</span><div><strong>{taskTitle(t)}</strong><small>{t.status} · {dueLabel(t.due_at)}</small></div></div>)}{!detailTasks.length&&<small>Sin tareas registradas.</small>}</div></section>
 <section className="crm-detail-section"><h3>🕘 Historial</h3><div className="crm-mini-list">{activities.map(a=><div key={a.id}><span>•</span><div><strong>{a.title||a.activity_type}</strong><small>{a.description||""} {a.created_at?`· ${new Date(a.created_at).toLocaleString("es-GT")}`:""}</small></div></div>)}{!activities.length&&<small>Sin actividad registrada.</small>}</div></section></div>}<footer className="crm-drawer-footer"><button className="crm-secondary" onClick={()=>setSelected(null)}>Cerrar</button><button className="crm-primary" onClick={saveLead} disabled={saving}>{saving?"Guardando…":"Guardar ficha"}</button></footer></aside></div>}
 {showNew&&<div className="crm-modal-backdrop" onMouseDown={()=>!saving&&setShowNew(false)}><form className="crm-modal" onSubmit={createLead} onMouseDown={e=>e.stopPropagation()}><header><div><span className="crm-eyebrow">NUEVA OPORTUNIDAD</span><h2>Crear lead</h2></div><button type="button" onClick={()=>setShowNew(false)}>×</button></header><label>Nombre del contacto *<input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} placeholder="Nombre completo"/></label><div className="crm-form-grid"><label>WhatsApp / teléfono<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+502 ..."/></label><label>Correo<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>VIN<input value={form.vin} onChange={e=>setForm({...form,vin:e.target.value.toUpperCase()})} maxLength={17}/></label><label>Vehículo<input value={form.vehicle_label} onChange={e=>setForm({...form,vehicle_label:e.target.value})} placeholder="2020 Toyota Tacoma"/></label></div><label>Prioridad<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option><option value="LOW">Baja</option></select></label><footer><button type="button" className="crm-secondary" onClick={()=>setShowNew(false)}>Cancelar</button><button className="crm-primary" disabled={saving}>{saving?"Creando…":"Crear lead"}</button></footer></form></div>}
 </section>
}
export default CrmCommercialPage;

