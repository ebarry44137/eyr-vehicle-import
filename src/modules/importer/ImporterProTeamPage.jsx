import { useEffect, useState } from "react";
import "./importer-pro-team.css";

export default function ImporterProTeamPage({ supabase }) {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({full_name:"",email:"",phone:"",password:""});

  async function invoke(body){
    const {data,error}=await supabase.functions.invoke("importer-pro-team-manager",{body});
    if(error) throw error;
    if(!data?.success) throw new Error(data?.error||"No fue posible administrar el equipo.");
    return data;
  }

  async function load(){
    setLoading(true);setError("");
    try{setData(await invoke({action:"list"}));}
    catch(err){setError(err?.message||"No fue posible cargar el equipo.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{load();},[]);

  async function createManager(e){
    e.preventDefault();setSaving(true);setError("");setMessage("");
    try{
      const next=await invoke({action:"create",...form});
      setData(next);setShowForm(false);
      setForm({full_name:"",email:"",phone:"",password:""});
      setMessage("Gestor agregado correctamente.");
    }catch(err){setError(err?.message||"No fue posible agregar el gestor.");}
    finally{setSaving(false);}
  }

  async function toggle(member){
    setSaving(true);setError("");setMessage("");
    try{
      const next=await invoke({action:member.active?"deactivate":"activate",user_id:member.user_id});
      setData(next);
      setMessage(member.active?"Gestor desactivado.":"Gestor reactivado.");
    }catch(err){setError(err?.message||"No fue posible actualizar el gestor.");}
    finally{setSaving(false);}
  }

  const seats=data?.seats||{included:2,extra:0,total:2,used:0,available:2};
  const members=data?.members||[];

  return (
    <section className="importer-pro-team-v39753">
      <header className="importer-pro-team-hero">
        <div>
          <span>IMPORTADOR PRO · COLABORACIÓN</span>
          <h1>Mi Equipo</h1>
          <p>Trabajá con tu gestor con accesos separados y permisos controlados.</p>
        </div>
        <button onClick={()=>setShowForm(true)} disabled={seats.available<=0||saving}>＋ Agregar Gestor</button>
      </header>

      <section className="importer-pro-seat-grid">
        <article><small>INCLUIDOS</small><strong>{seats.included}</strong><span>usuarios</span></article>
        <article><small>UTILIZADOS</small><strong>{seats.used}</strong><span>activos</span></article>
        <article><small>DISPONIBLES</small><strong>{seats.available}</strong><span>espacios</span></article>
        <article><small>EXTRAS</small><strong>{seats.extra}</strong><span>adicionales</span></article>
      </section>

      {seats.available<=0 && <div className="importer-pro-team-upsell">💡 <div><strong>Ya utilizaste los usuarios incluidos.</strong><p>Podés contratar usuarios adicionales.</p></div></div>}
      {message && <div className="importer-pro-team-message success">{message}</div>}
      {error && <div className="importer-pro-team-message error">{error}</div>}

      <div className="importer-pro-team-grid">
        <section className="importer-pro-team-panel">
          <div className="importer-pro-team-head"><div><small>EQUIPO ACTUAL</small><h2>Usuarios</h2></div><button onClick={load}>↻</button></div>
          {loading ? <div className="importer-pro-team-empty">Cargando...</div> : members.map(m=>(
            <article className="importer-pro-member-card" key={m.user_id}>
              <div className="importer-pro-member-avatar">{String(m.full_name||"U").slice(0,1).toUpperCase()}</div>
              <div className="importer-pro-member-copy"><strong>{m.full_name}</strong><span>{m.email}</span><small>{m.role==="OWNER"?"👑 Propietario":m.role==="ADMIN"?"🛡️ Administrador":"🧑‍💼 Gestor"}</small></div>
              <span className={`importer-pro-member-status ${m.active?"active":"inactive"}`}>{m.active?"ACTIVO":"INACTIVO"}</span>
              {m.role==="GESTOR" && <button onClick={()=>toggle(m)} disabled={saving}>{m.active?"Desactivar":"Reactivar"}</button>}
            </article>
          ))}
        </section>

        <aside className="importer-pro-team-activity">
          <div className="importer-pro-team-head"><div><small>BITÁCORA</small><h2>Actividad reciente</h2></div></div>
          {(data?.activity||[]).length===0 ? <div className="importer-pro-team-empty">Sin actividad todavía.</div> : (data.activity||[]).map(a=>(
            <div className="importer-pro-activity-row" key={a.id}><span>•</span><div><strong>{a.description}</strong><small>{new Date(a.created_at).toLocaleString("es-GT")}</small></div></div>
          ))}
        </aside>
      </div>

      {showForm && <div className="importer-pro-team-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setShowForm(false)}}>
        <form className="importer-pro-team-modal" onSubmit={createManager}>
          <div className="importer-pro-team-modal-head"><div><small>NUEVO USUARIO</small><h2>Agregar Gestor</h2><p>Solo verá las gestiones que le asignés.</p></div><button type="button" onClick={()=>setShowForm(false)}>×</button></div>
          <label><span>Nombre completo *</span><input required value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))}/></label>
          <label><span>Correo *</span><input required type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></label>
          <label><span>Teléfono</span><input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/></label>
          <label><span>Contraseña temporal *</span><input required minLength="8" type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}/><small>Mínimo 8 caracteres.</small></label>
          <div className="importer-pro-team-role-note">🧑‍💼 Gestor: puede actualizar estado/observaciones y subir fotos/documentos de gestiones asignadas.</div>
          <div className="importer-pro-team-actions"><button type="button" onClick={()=>setShowForm(false)}>Cancelar</button><button className="primary" disabled={saving}>{saving?"Creando...":"Crear acceso"}</button></div>
        </form>
      </div>}
    </section>
  );
}
