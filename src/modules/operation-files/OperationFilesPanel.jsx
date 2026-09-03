import { useEffect, useRef, useState } from "react";
import "./operation-files.css";

const LABELS={PHOTO:"Foto",DUCA:"DUCA",BL:"BL",TITLE:"Título",INVOICE:"Factura",OTHER:"Otro"};
const ICONS={PHOTO:"📸",DUCA:"🛃",BL:"📄",TITLE:"📑",INVOICE:"🧾",OTHER:"📎"};

export default function OperationFilesPanel({
  supabase, sourceType, sourceId, readOnly=false, title="Fotos y documentos"
}) {
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [category,setCategory]=useState("PHOTO");
  const [visible,setVisible]=useState(true);
  const [message,setMessage]=useState("");
  const [bulkProgress,setBulkProgress]=useState({current:0,total:0,success:0,failed:0});
  const [bulkResults,setBulkResults]=useState([]);

  const inputRef=useRef(null);

  async function invoke(body){
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    const accessToken =
      sessionData?.session?.access_token || "";

    if (!accessToken) {
      throw new Error("Sesión del Portal no disponible.");
    }

    const {data,error}=await supabase.functions.invoke(
      "operation-file-manager",
      {
        body,
        headers: {
          "x-portal-access-token": accessToken,
        },
      }
    );

    if(error) {
      let message = error?.message || "Error en archivos.";

      // Intentar recuperar el body real de la Edge Function.
      try {
        const response = error?.context;
        if (response?.clone) {
          const payload = await response.clone().json();
          if (payload?.error) message = payload.error;
        }
      } catch {}

      throw new Error(message);
    }

    if(!data?.success) throw new Error(data?.error||"Error en archivos.");
    return data;
  }

  async function load(){
    if(!sourceId)return;
    setLoading(true);
    try{
      const data=await invoke({action:"list",source_type:sourceType,source_id:sourceId});
      setRows(Array.isArray(data.files)?data.files:[]);
    }catch(e){setMessage(e?.message||"No fue posible cargar archivos.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{load()},[sourceId,sourceType]);

  async function uploadOneFile(file,{silent=false}={}) {
    if(!file||!sourceId)return {ok:false,name:file?.name||"Archivo",error:"Archivo inválido"};

    try{
      const prep=await invoke({
        action:"upload_url",
        source_type:sourceType,
        source_id:sourceId,
        category,
        original_name:file.name,
        mime_type:file.type,
        size_bytes:file.size
      });

      const response=await fetch(prep.upload_url,{
        method:"PUT",
        headers:{"Content-Type":file.type},
        body:file
      });

      if(!response.ok) throw new Error(`R2 rechazó la carga (${response.status}).`);

      await invoke({
        action:"register",
        source_type:sourceType,
        source_id:sourceId,
        category,
        original_name:file.name,
        storage_path:prep.storage_path,
        mime_type:file.type,
        size_bytes:file.size,
        visible_to_client:visible
      });

      if(!silent) setMessage(`${file.name} guardado en Cloudflare R2.`);
      return {ok:true,name:file.name};
    }catch(e){
      const error=e?.message||"No fue posible subir el archivo.";
      if(!silent) setMessage(error);
      return {ok:false,name:file.name,error};
    }
  }

  async function uploadFile(file){
    if(!file||!sourceId)return;
    setUploading(true);
    setMessage("");
    setBulkResults([]);
    setBulkProgress({current:0,total:1,success:0,failed:0});

    const result=await uploadOneFile(file);

    setBulkProgress({
      current:1,
      total:1,
      success:result.ok?1:0,
      failed:result.ok?0:1
    });

    if(result.ok) await load();

    setUploading(false);
    if(inputRef.current)inputRef.current.value="";
  }

  async function uploadFiles(fileList){
    const files=Array.from(fileList||[]);
    if(!files.length||!sourceId)return;

    // Para documentos seguimos permitiendo uno; la carga masiva está enfocada en fotos.
    if(category!=="PHOTO" && files.length>1){
      setMessage("La carga múltiple está habilitada para fotografías. Para documentos, subí uno por uno.");
      return;
    }

    setUploading(true);
    setMessage("");
    setBulkResults([]);
    setBulkProgress({current:0,total:files.length,success:0,failed:0});

    const results=[];
    let success=0;
    let failed=0;

    // Secuencial: más estable para lotes grandes y evita saturar Edge/R2.
    for(let i=0;i<files.length;i++){
      const file=files[i];
      const result=await uploadOneFile(file,{silent:true});
      results.push(result);

      if(result.ok) success++;
      else failed++;

      setBulkResults([...results]);
      setBulkProgress({
        current:i+1,
        total:files.length,
        success,
        failed
      });
    }

    if(success>0) await load();

    setMessage(
      failed===0
        ? `✅ ${success} fotografía(s) subida(s) correctamente a R2.`
        : `Carga finalizada: ${success} correcta(s) y ${failed} con error.`
    );

    setUploading(false);
    if(inputRef.current) inputRef.current.value="";
  }

  async function openFile(row){
    try{
      const data=await invoke({action:"view_url",file_id:row.id});
      window.open(data.url,"_blank","noopener,noreferrer");
    }catch(e){setMessage(e?.message||"No fue posible abrir el archivo.");}
  }

  async function removeFile(row){
    if(!window.confirm(`¿Eliminar ${row.original_name}?`))return;
    try{
      await invoke({action:"delete",file_id:row.id});
      setMessage("Archivo eliminado.");
      await load();
    }catch(e){setMessage(e?.message||"No fue posible eliminar.");}
  }

  const photos=rows.filter(x=>x.category==="PHOTO");
  const docs=rows.filter(x=>x.category!=="PHOTO");

  return <section className="ofp">
    <div className="ofp-head">
      <div><span>V39.5 · CLOUDFLARE R2</span><h3>{title}</h3>
      <p>{readOnly?"Archivos publicados por tu oficina.":"Fotos y documentos privados almacenados en R2."}</p></div>
      <b>{rows.length} archivo(s)</b>
    </div>

    {!readOnly&&<div className="ofp-upload">
      <select value={category} onChange={e=>setCategory(e.target.value)}>
        <option value="PHOTO">📸 Foto del vehículo</option>
        <option value="DUCA">🛃 DUCA</option>
        <option value="BL">📄 BL</option>
        <option value="TITLE">📑 Título</option>
        <option value="INVOICE">🧾 Factura</option>
        <option value="OTHER">📎 Otro</option>
      </select>
      <label className="ofp-visible"><input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)}/> Visible para el cliente</label>
      <input
        ref={inputRef}
        type="file"
        accept={category==="PHOTO" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
        multiple={category==="PHOTO"}
        onChange={e=>uploadFiles(e.target.files)}
      />
      <button type="button" disabled={uploading} onClick={()=>inputRef.current?.click()}>{uploading
          ? bulkProgress.total>1
            ? `Subiendo ${bulkProgress.current}/${bulkProgress.total}...`
            : "Subiendo a R2..."
          : category==="PHOTO"
          ? "＋ Subir fotografías"
          : "＋ Subir archivo"}</button>
    </div>}

    {(uploading || bulkProgress.total>1) && (
      <div className="ofp-bulk-progress">
        <div className="ofp-bulk-progress-head">
          <strong>
            {uploading ? "Subiendo fotografías..." : "Carga finalizada"}
          </strong>
          <span>
            {bulkProgress.current}/{bulkProgress.total}
          </span>
        </div>
        <div className="ofp-bulk-bar">
          <i
            style={{
              width: `${bulkProgress.total
                ? Math.round((bulkProgress.current / bulkProgress.total) * 100)
                : 0}%`,
            }}
          />
        </div>
        <small>
          ✅ {bulkProgress.success} correcta(s)
          {bulkProgress.failed>0 ? ` · ❌ ${bulkProgress.failed} con error` : ""}
        </small>
      </div>
    )}

    {bulkResults.some((item)=>!item.ok) && (
      <div className="ofp-bulk-errors">
        {bulkResults.filter((item)=>!item.ok).map((item,index)=>(
          <div key={`${item.name}-${index}`}>
            <strong>{item.name}</strong>
            <span>{item.error}</span>
          </div>
        ))}
      </div>
    )}

    {message&&<div className="ofp-message">{message}</div>}
    {loading?<div className="ofp-empty">Cargando archivos...</div>:rows.length===0?<div className="ofp-empty">Todavía no hay fotos o documentos publicados.</div>:<>
      {photos.length>0&&<div className="ofp-block"><h4>📸 Fotos del vehículo <small>{photos.length}</small></h4><div className="ofp-gallery">
        {photos.map(x=><button type="button" key={x.id} className="ofp-photo" onClick={()=>openFile(x)}>
          <span>📸</span><strong>{x.original_name}</strong>{!readOnly&&<em>{x.visible_to_client?"CLIENTE":"INTERNO"}</em>}
        </button>)}
      </div></div>}
      {docs.length>0&&<div className="ofp-block"><h4>📄 Documentos <small>{docs.length}</small></h4><div className="ofp-docs">
        {docs.map(x=><div key={x.id} className="ofp-doc"><span>{ICONS[x.category]||"📎"}</span><div><strong>{LABELS[x.category]||x.category}</strong><small>{x.original_name}</small></div>
          {!readOnly&&<b className={x.visible_to_client?"client":""}>{x.visible_to_client?"VISIBLE":"INTERNO"}</b>}
          <button type="button" onClick={()=>openFile(x)}>Ver</button>{!readOnly&&<button type="button" className="danger" onClick={()=>removeFile(x)}>×</button>}
        </div>)}
      </div></div>}
    </>}
  </section>
}
