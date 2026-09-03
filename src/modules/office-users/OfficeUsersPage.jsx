import { useEffect, useMemo, useState } from "react";
import "./office-users.css";

const ROLE_LABELS = { ADMIN: "Administrador", DIGITADOR: "Digitador", FINANZAS: "Finanzas", OWNER: "Propietario" };

export default function OfficeUsersPage({ invokeFunction, currentUserId, officeName }) {
  const [users,setUsers]=useState([]), [loading,setLoading]=useState(false), [saving,setSaving]=useState(false);
  const [actionUserId,setActionUserId]=useState(null), [error,setError]=useState(""), [message,setMessage]=useState(""), [showCreate,setShowCreate]=useState(false);
  const [form,setForm]=useState({full_name:"",email:"",phone:"",password:"",user_type:"DIGITADOR"});
  const active=useMemo(()=>users.filter(x=>x.active && x.membership_active!==false).length,[users]);
  const admins=useMemo(()=>users.filter(x=>["OWNER","ADMIN"].includes(String(x.member_role||"").toUpperCase())).length,[users]);
  const finance=useMemo(()=>users.filter(x=>String(x.job_title||"").toUpperCase()==="FINANZAS").length,[users]);

  async function call(body){
    const {data,error:e}=await invokeFunction("admin-user-manager",{body:{scope:"tenant",...body}});
    if(e){
      let detail="";
      try{
        if(e?.context && typeof e.context.json === "function"){
          const payload=await e.context.json();
          detail=payload?.error || payload?.message || "";
        }
      }catch(_err){}
      throw new Error(detail || e?.message || "No fue posible completar la operación.");
    }
    if(!data?.success) throw new Error(data?.error||"No fue posible completar la operación.");
    return data;
  }
  async function loadUsers(){setLoading(true);setError("");try{const d=await call({action:"list"});setUsers(d.users||[]);}catch(e){setError(e?.message||"No fue posible cargar usuarios.");}finally{setLoading(false)}}
  useEffect(()=>{loadUsers()},[]);
  async function createUser(e){e.preventDefault();setSaving(true);setError("");setMessage("");try{const d=await call({action:"create",...form,full_name:form.full_name.trim(),email:form.email.trim().toLowerCase(),phone:form.phone.trim()});setMessage(`${d.user?.full_name||"Usuario"} creado correctamente.`);setForm({full_name:"",email:"",phone:"",password:"",user_type:"DIGITADOR"});setShowCreate(false);await loadUsers();}catch(err){setError(err?.message||"No fue posible crear el usuario.");}finally{setSaving(false)}}
  async function runAction(id,action,extra={}){setActionUserId(id);setError("");setMessage("");try{const d=await call({action,user_id:id,...extra});setMessage(d.message||"Usuario actualizado.");await loadUsers();}catch(e){setError(e?.message||"No fue posible actualizar el usuario.");}finally{setActionUserId(null)}}
  async function resetPassword(u){const p=window.prompt(`Nueva contraseña temporal para ${u.full_name||u.email}:`);if(!p)return;if(p.length<8){setError("La contraseña debe tener al menos 8 caracteres.");return}await runAction(u.id,"reset_password",{password:p})}
  return <section className="office-users-module">
    <header className="office-users-header"><div><span className="section-label">ADMINISTRACIÓN DE OFICINA</span><h1>Usuarios de {officeName||"la oficina"}</h1><p>Creá tu equipo y controlá quién puede operar o ver finanzas.</p></div><button className="office-user-create" onClick={()=>setShowCreate(true)}>＋ Crear usuario</button></header>
    <div className="office-user-kpis"><article><span>Usuarios</span><strong>{users.length}</strong></article><article><span>Activos</span><strong>{active}</strong></article><article><span>Administradores</span><strong>{admins}</strong></article><article><span>Finanzas</span><strong>{finance}</strong></article></div>
    {message&&<div className="office-users-msg success">{message}</div>}{error&&<div className="office-users-msg error">{error}</div>}
    <section className="office-users-card"><div className="office-users-card-head"><div><span className="section-label">EQUIPO AUTORIZADO</span><h2>{loading?"Cargando...":`${users.length} usuario${users.length===1?"":"s"}`}</h2></div><button className="secondary-button" onClick={loadUsers}>↻ Actualizar</button></div>
      <div className="office-users-table-wrap"><table><thead><tr><th>Usuario</th><th>Perfil</th><th>Acceso</th><th>Último ingreso</th><th>Acciones</th></tr></thead><tbody>{users.map(u=>{const mr=String(u.member_role||"").toUpperCase(), jt=String(u.job_title||"").toUpperCase(), label=mr==="OWNER"?"OWNER":jt||mr; const protectedOwner=mr==="OWNER"; return <tr key={u.id}><td><div className="office-user-id"><span>{(u.full_name||u.email||"U").slice(0,1).toUpperCase()}</span><div><strong>{u.full_name||"Sin nombre"}</strong><small>{u.email}</small></div></div></td><td><b className={`office-role ${label.toLowerCase()}`}>{ROLE_LABELS[label]||label}</b></td><td><b className={`office-access ${u.active&&u.membership_active!==false?"active":"inactive"}`}>{u.active&&u.membership_active!==false?"ACTIVO":"INACTIVO"}</b></td><td>{u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleString("es-GT"):"—"}</td><td><div className="office-user-actions"><button onClick={()=>resetPassword(u)} disabled={actionUserId===u.id}>Contraseña</button>{!protectedOwner&&u.id!==currentUserId&&<button onClick={()=>runAction(u.id,u.active&&u.membership_active!==false?"deactivate":"activate")} disabled={actionUserId===u.id}>{u.active&&u.membership_active!==false?"Desactivar":"Activar"}</button>}</div></td></tr>})}{!loading&&!users.length&&<tr><td colSpan="5" className="office-users-empty">Todavía no hay usuarios adicionales en esta oficina.</td></tr>}</tbody></table></div>
    </section>
    {showCreate&&<div className="office-user-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}><div className="office-user-modal"><div className="office-user-modal-head"><div><span className="section-label">NUEVO ACCESO</span><h2>Crear usuario</h2></div><button onClick={()=>setShowCreate(false)}>×</button></div><form onSubmit={createUser}><label><span>Nombre completo</span><input required value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))}/></label><label><span>Correo</span><input required type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></label><label><span>Teléfono</span><input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/></label><label><span>Contraseña inicial</span><input required minLength="8" type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}/><small>Mínimo 8 caracteres.</small></label><label><span>Perfil</span><select value={form.user_type} onChange={e=>setForm(p=>({...p,user_type:e.target.value}))}><option value="DIGITADOR">Digitador · operación sin finanzas</option><option value="FINANZAS">Finanzas · operación + finanzas</option><option value="ADMIN">Administrador · control de oficina</option></select></label><div className="office-user-role-help"><strong>🔐 Permisos</strong><span>Administrador: usuarios, DUCA y finanzas.</span><span>Digitador: operación diaria, sin dinero ni administración.</span><span>Finanzas: operación y módulo financiero, sin administrar usuarios ni DUCA.</span></div><div className="office-user-modal-actions"><button type="button" onClick={()=>setShowCreate(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?"Creando...":"Crear usuario →"}</button></div></form></div></div>}
  </section>
}
