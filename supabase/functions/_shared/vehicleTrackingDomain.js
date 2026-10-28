// Contrato público compartido. No contiene credenciales ni datos de clientes.
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
export const normalizeVin = value => String(value || "").trim().toUpperCase().replace(/\s/g, "");
export const TRACKING_STAGES = [
  ["REGISTERED", "Operación registrada"], ["RECEIVED_USA", "Recibido en yarda USA"],
  ["LOADED_IN_CONTAINER", "Cargado en contenedor"], ["SHIPPED", "Embarcado"], ["DEPARTED_USA", "Despachado desde USA"],
  ["IN_TRANSIT", "En tránsito a Guatemala"], ["ARRIVED_GUATEMALA", "Llegó a Guatemala"],
  ["DOCUMENTS", "Documentación aduanal"], ["CUSTOMS", "Gestión aduanal en proceso"],
  ["RELEASED", "Liberado en aduana"], ["PORT_EXIT", "Vehículo fuera de puerto"], ["IN_DELIVERY", "En proceso de entrega"],
  ["DELIVERED", "Entregado al cliente"],
];
export const MANUAL_MILESTONES = ["LOADED_IN_CONTAINER", "DEPARTED_USA", "ARRIVED_GUATEMALA", "IN_DELIVERY", "DELIVERED"];
const labels = Object.fromEntries(TRACKING_STAGES);
export const MILESTONE_LABELS = {
  ...labels, DOCS_COLLECTED:"Documentos recogidos", EMPTIED:"Contenedor vaciado",
  ADMISSION_FILED:"Gestión de admisión registrada", DATA_VERIFIED:"Documentación corroborada",
  DIGITIZATION_STARTED:"Digitación iniciada", REVIEW_STARTED:"Revisión iniciada",
  DECLARATION_SIGNED:"Declaración firmada", TAX_FORM_SENT:"Formulario de IVA enviado",
  IVA_PAID:"Pago de IVA registrado", SELECTIVE_RECORDED:"Selectivo registrado",
  PORT_EXIT:"Vehículo fuera de puerto", DOCS_SET_BUILT:"Juego de documentos armado",
  ENVELOPE_READY:"Documentación preparada para entrega",
  CUSTOMS_HANDOVER:"Entrega de vehículo/documentos registrada en aduanas",
};
const stageForEvent = {
  ...Object.fromEntries(TRACKING_STAGES.map(([code])=>[code,code])),
  DOCS_COLLECTED:"DOCUMENTS",EMPTIED:"ARRIVED_GUATEMALA",ADMISSION_FILED:"DOCUMENTS",DATA_VERIFIED:"DOCUMENTS",
  DIGITIZATION_STARTED:"CUSTOMS",REVIEW_STARTED:"CUSTOMS",DECLARATION_SIGNED:"CUSTOMS",TAX_FORM_SENT:"CUSTOMS",
  IVA_PAID:"CUSTOMS",SELECTIVE_RECORDED:"CUSTOMS",PORT_EXIT:"PORT_EXIT",DOCS_SET_BUILT:"CUSTOMS",ENVELOPE_READY:"CUSTOMS",CUSTOMS_HANDOVER:"CUSTOMS",
};
const managementStages = {
  COTIZADO:"REGISTERED","CLIENTE_CONFIRMÓ":"REGISTERED",PAGO_INICIAL:"REGISTERED",POR_RECOGER:"REGISTERED",
  "TRÁNSITO_A_PUERTO":"REGISTERED",EMBARCADO:"SHIPPED","TRÁNSITO_MARÍTIMO":"IN_TRANSIT",
  "ARRIBÓ_GUATEMALA":"ARRIVED_GUATEMALA",CONTROL_ADUANAL:"CUSTOMS",LIBERADO:"RELEASED",ENTREGADO:"DELIVERED",
};

export function publicTrackingResult(snapshot, photos = [], now = new Date()) {
  if (!snapshot || snapshot.result !== "FOUND") return { result: snapshot?.result === "AMBIGUOUS" ? "AMBIGUOUS" : "NOT_FOUND" };
  // EMBARCADO does not prove loading or departure: keep its own public label.
  const managementCode = String(snapshot.management_status || "").toUpperCase();
  const rows = (snapshot.milestones || []).filter(row => MILESTONE_LABELS[row.code] && /^\d{4}-\d{2}-\d{2}$/.test(row.date || ""));
  const merged = new Map();
  for (const row of rows) {
    const old = merged.get(row.code);
    // Existing operational dates take precedence over an extra manual entry.
    if (!old || (old.manual && !row.manual)) merged.set(row.code,{code:row.code,label:MILESTONE_LABELS[row.code],date:row.date,manual:!!row.manual});
  }
  const milestones = [...merged.values()].map(({manual: _manual,...row})=>row).sort((a,b)=>a.date.localeCompare(b.date)||Object.keys(MILESTONE_LABELS).indexOf(a.code)-Object.keys(MILESTONE_LABELS).indexOf(b.code));
  let stage = managementStages[managementCode] || "REGISTERED";
  let rank = TRACKING_STAGES.findIndex(([code])=>code===stage);
  for (const row of milestones) {
    const code=stageForEvent[row.code],next=TRACKING_STAGES.findIndex(([key])=>key===code);
    if(next>rank){rank=next;stage=code;}
  }
  let stageLabel=labels[stage];
  if(stage==='CUSTOMS'&&milestones.some(row=>row.code==='CUSTOMS_HANDOVER'))stageLabel='Gestión aduanal · entrega registrada';
  if(managementCode==='EMBARCADO' && stage==='SHIPPED') stageLabel=milestones.some(row=>row.code==='LOADED_IN_CONTAINER')?'Embarcado · salida pendiente de confirmación':'Embarcado · carga y salida pendientes de confirmación';
  const vehicle = snapshot.vehicle || {};
  return {
    result:"FOUND",mode:snapshot.mode,stage,stageLabel,
    vehicle:{make:String(vehicle.make||"").slice(0,80),model:String(vehicle.model||"").slice(0,100),year:vehicle.year?String(vehicle.year).slice(0,4):null},
    updatedAt:snapshot.updated_at||null,estimatedArrival:snapshot.eta||null,milestones,
    photos:photos.filter(p=>typeof p.url==='string'&&p.url.startsWith('https://')).map((p,i)=>({id:p.id,url:p.url,expiresAt:p.expiresAt,caption:`Recepción en yarda · fotografía ${i+1}`})),
    photosUnavailable:!!snapshot.photos_unavailable,checkedAt:now.toISOString(),
  };
}
