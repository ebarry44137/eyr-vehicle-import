import { useEffect, useMemo, useState } from "react";
import "./customs-performance-assignment.css";

export default function CustomsPerformanceAssignment({ supabase, value, onChange }) {
  const [employees,setEmployees]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    let alive=true;
    (async()=>{
      setLoading(true);
      setError("");
      const {data,error}=await supabase.rpc("performance_case_assignees_v39861");
      if(!alive)return;
      if(error){ setError(error.message || "No se pudieron cargar responsables."); setEmployees([]); }
      else setEmployees(data || []);
      setLoading(false);
    })();
    return()=>{alive=false};
  },[supabase]);

  const digitizers=useMemo(
    ()=>employees.filter(e=>String(e.evaluation_profile||"").toUpperCase()==="DIGITACION"),
    [employees]
  );
  const portManagers=useMemo(
    ()=>employees.filter(e=>String(e.evaluation_profile||"").toUpperCase()==="GESTION_PUERTO"),
    [employees]
  );

  useEffect(()=>{
    if(loading)return;
    const patch={};
    if(!value?.digitizer_user_id && digitizers.length===1) patch.digitizer_user_id=digitizers[0].user_id;
    if(!value?.port_manager_user_id && portManagers.length===1) patch.port_manager_user_id=portManagers[0].user_id;
    if(Object.keys(patch).length) onChange(patch);
  },[loading,digitizers,portManagers,value?.digitizer_user_id,value?.port_manager_user_id]);

  return (
    <section className="cpa-box">
      <div className="cpa-head">
        <div>
          <small>RENDIMIENTO · ASIGNACIÓN REAL</small>
          <strong>Responsables del expediente</strong>
          <span>Cada etapa se mide por separado dentro del mismo expediente.</span>
        </div>
        <b>📊</b>
      </div>

      <div className="cpa-grid">
        <label>
          <span>Digitación de declaración</span>
          <select
            value={value?.digitizer_user_id || ""}
            disabled={loading}
            onChange={e=>onChange({digitizer_user_id:e.target.value || null})}
          >
            <option value="">{loading ? "Cargando..." : "Sin asignar"}</option>
            {digitizers.map(e=><option key={e.user_id} value={e.user_id}>{e.full_name}</option>)}
          </select>
          <small>Inicio de digitación → firma de declaración.</small>
        </label>

        <label>
          <span>Despacho / retiro de puerto</span>
          <select
            value={value?.port_manager_user_id || ""}
            disabled={loading}
            onChange={e=>onChange({port_manager_user_id:e.target.value || null})}
          >
            <option value="">{loading ? "Cargando..." : "Sin asignar"}</option>
            {portManagers.map(e=><option key={e.user_id} value={e.user_id}>{e.full_name}</option>)}
          </select>
          <small>Selectivo → salida del vehículo del puerto.</small>
        </label>
      </div>

      {error && <div className="cpa-error">⚠️ {error}</div>}
    </section>
  );
}
