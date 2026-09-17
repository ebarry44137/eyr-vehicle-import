import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import CustomerAutocomplete from "../customers/CustomerAutocomplete";
import "./historical-portfolio-import.css";

const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const money = (v) => `Q ${Number(v || 0).toLocaleString("es-GT", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
function excelDate(v){
  if(!v) return null;
  if(v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0,10);
  if(typeof v === "number") { const d=XLSX.SSF.parse_date_code(v); if(d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`; }
  const s=clean(v); const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/); if(m){let y=Number(m[3]); if(y<100)y+=2000; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
  const d=new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}
function pick(row, names){ const keys=Object.keys(row); for(const n of names){const k=keys.find(x=>norm(x)===norm(n)); if(k) return row[k];} return null; }

export default function HistoricalPortfolioImport({supabase,onImported}){
  const inputRef=useRef(null);
  const [open,setOpen]=useState(false), [rows,setRows]=useState([]), [links,setLinks]=useState({});
  const [expanded,setExpanded]=useState({});
  const [fileName,setFileName]=useState(""), [busy,setBusy]=useState(false), [error,setError]=useState(""), [message,setMessage]=useState("");

  const groups=useMemo(()=>{
    const m=new Map();
    rows.forEach(r=>{
      const k=r.client_name;
      if(!m.has(k))m.set(k,{name:k,count:0,total:0,rows:[]});
      const g=m.get(k); g.count++; g.total+=r.amount_gtq; g.rows.push(r);
    });
    return [...m.values()];
  },[rows]);
  const total=useMemo(()=>rows.reduce((a,r)=>a+r.amount_gtq,0),[rows]);
  const linked=groups.filter(g=>links[g.name]?.id).length;

  async function readFile(file){
    setError("");setMessage("");setRows([]);setLinks({});setExpanded({});setFileName(file?.name||""); if(!file)return;
    try{
      const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
      const sheet=wb.Sheets["Recepción Documentos"] || wb.Sheets["Recepcion Documentos"] || wb.Sheets[wb.SheetNames[0]];
      if(!sheet) throw new Error("No se encontró una hoja válida.");
      const raw=XLSX.utils.sheet_to_json(sheet,{defval:null,raw:true});
      const parsed=raw.map((r,i)=>({
        row_number:i+2,
        correlative:clean(pick(r,["Correlativo","Correlativo DUCA"])),
        work_date:excelDate(pick(r,["Fecha"])),
        consignee:clean(pick(r,["Consignatario"])),
        port:clean(pick(r,["Puerto"])),
        regime:clean(pick(r,["Régimen","Regimen"])),
        merchandise:clean(pick(r,["Tipo de Mercancía","Tipo de Mercancia"])),
        client_name:clean(pick(r,["Cliente"])),
        amount_gtq:Number(pick(r,["Costo","Monto","Cobro"])||0),
        status:clean(pick(r,["Estado"])),
        type:clean(pick(r,["Tipo"]))
      })).filter(r=>r.client_name && r.amount_gtq>0 && norm(r.status)==="pendiente" && norm(r.type)==="ingreso");
      if(!parsed.length) throw new Error("No encontré filas con Estado = Pendiente y Tipo = Ingreso.");
      setRows(parsed);setOpen(true);
    }catch(e){setError(e?.message||"No fue posible leer el Excel.");}
  }

  function selectClient(excelName, c){
    setLinks(p=>({...p,[excelName]:c?.id ? c : {id:null,name:c?.name||""}}));
  }

  async function confirm(){
    const missing=groups.filter(g=>!links[g.name]?.id);
    if(missing.length) return setError(`Falta vincular ${missing.length} cliente(s) antes de importar.`);
    setBusy(true);setError("");setMessage("");
    try{
      const payload=rows.map(r=>({...r,client_id:links[r.client_name].id,matched_client_name:links[r.client_name].name}));
      const {data,error:e}=await supabase.rpc("import_historical_receivables_v397995",{p_file_name:fileName,p_rows:payload});
      if(e)throw e;
      const result=Array.isArray(data)?data[0]:data;
      setMessage(`Importación lista: ${result?.inserted_count||0} movimientos · ${money(result?.inserted_total_gtq||0)}. Duplicados omitidos: ${result?.duplicate_count||0}.`);
      setRows([]);setLinks({});setExpanded({}); if(inputRef.current)inputRef.current.value=""; await onImported?.();
    }catch(e){setError(e?.message||"No fue posible importar la cartera histórica.");}finally{setBusy(false);}
  }

  return <>
    <button type="button" className="historical-import-trigger" onClick={()=>setOpen(true)}>📥 Importar cartera histórica</button>
    {open&&<div className="historical-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!busy&&setOpen(false)}>
      <section className="historical-modal">
        <header><div><small>MIGRACIÓN SEGURA</small><h3>Cartera histórica</h3><p>Importá deudas anteriores al inicio de E&R Platform sin duplicarlas.</p></div><button type="button" onClick={()=>setOpen(false)} disabled={busy}>×</button></header>
        <div className="historical-upload"><input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={e=>readFile(e.target.files?.[0])}/><div><strong>{fileName||"Seleccioná el Excel anterior"}</strong><span>Se tomarán únicamente Pendiente + Ingreso.</span></div></div>
        {error&&<div className="finance-message error">{error}</div>}{message&&<div className="finance-message success">{message}</div>}
        {!!rows.length&&<>
          <div className="historical-kpis"><article><span>Movimientos</span><strong>{rows.length}</strong></article><article><span>Clientes</span><strong>{groups.length}</strong></article><article><span>Vinculados</span><strong>{linked}/{groups.length}</strong></article><article><span>Total a migrar</span><strong>{money(total)}</strong></article></div>
          <div className="historical-map">
            <div className="historical-map-head"><strong>Vincular clientes del Excel</strong><span>Solo cuentan clientes existentes seleccionados de E&R.</span></div>
            {groups.map(g=><div className="historical-client-block" key={g.name}>
              <div className="historical-map-row">
                <div className="historical-source-client">
                  <strong>{g.name}</strong><span>{g.count} movimientos · {money(g.total)}</span>
                  <button type="button" className="historical-detail-toggle" onClick={()=>setExpanded(p=>({...p,[g.name]:!p[g.name]}))}>
                    {expanded[g.name]?"▾ Ocultar movimientos":`▸ Revisar ${g.count} movimientos`}
                  </button>
                </div>
                <div className="historical-link-control">
                  <label>Cliente real en E&R</label>
                  <CustomerAutocomplete supabase={supabase} value={links[g.name]?.name||g.name} clientId={links[g.name]?.id||null} onSelect={c=>selectClient(g.name,c)} placeholder="Buscar y seleccionar cliente..." allowCreate={false}/>
                  {links[g.name]?.id?<small className="historical-linked-ok">✓ Vinculado por ID · {links[g.name].name}</small>:<small className="historical-linked-pending">Seleccioná un resultado de E&R para vincularlo.</small>}
                </div>
              </div>
              {expanded[g.name]&&<div className="historical-detail-wrap">
                <div className="historical-detail-title"><strong>Auditoría previa · {g.name}</strong><span>{g.count} registros · {money(g.total)}</span></div>
                <div className="historical-detail-table-wrap"><table className="historical-detail-table"><thead><tr><th>#</th><th>Fecha</th><th>Correlativo</th><th>Consignatario</th><th>Mercancía</th><th>Régimen</th><th className="amount">Monto</th></tr></thead>
                <tbody>{g.rows.map((r,i)=><tr key={`${g.name}-${r.row_number}-${i}`}><td>{i+1}</td><td>{r.work_date||"—"}</td><td>{r.correlative||"—"}</td><td>{r.consignee||"—"}</td><td>{r.merchandise||"—"}</td><td>{r.regime||"—"}</td><td className="amount"><strong>{money(r.amount_gtq)}</strong></td></tr>)}</tbody></table></div>
              </div>}
            </div>)}
          </div>
          <div className="historical-confirm-note">🛡️ Nada se guardará hasta que los {groups.length} clientes estén vinculados por ID y presionés Confirmar.</div>
          <footer><button type="button" className="secondary" onClick={()=>setOpen(false)} disabled={busy}>Cancelar</button><button type="button" onClick={confirm} disabled={busy||linked!==groups.length}>{busy?"Importando...":`Confirmar ${rows.length} movimientos →`}</button></footer>
        </>}
      </section>
    </div>}
  </>;
}
