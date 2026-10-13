import {useEffect,useState} from 'react';
import {supabase} from '../../supabaseClient';

export default function UsaYardAdminPanel(){
 const [yards,setYards]=useState([]),[people,setPeople]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [newYard,setNewYard]=useState({name:'',city:'',state:'',address:''});
 const [person,setPerson]=useState({full_name:'',email:'',phone:'',password:'',yard_ids:[]});
 const [edits,setEdits]=useState({});
 async function api(body){const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error('Sesión no disponible');const {data,error}=await supabase.functions.invoke('usa-yard-admin',{body,headers:{'x-portal-access-token':session.access_token}});if(error){let msg=error.message;try{msg=(await error.context?.clone()?.json())?.error||msg}catch{}throw Error(msg)}if(!data?.success)throw Error(data?.error||'Operación rechazada');return data}
 async function load(){try{const d=await api({action:'list'});setYards(d.yards);setPeople(d.collaborators);setEdits(Object.fromEntries(d.collaborators.map(c=>[c.user_id,c.yard_ids])))}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 async function run(body,success){setBusy(true);setError('');setNotice('');try{await api(body);setNotice(success);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function createYard(e){e.preventDefault();await run({action:'create_yard',...newYard},'Yarda registrada');setNewYard({name:'',city:'',state:'',address:''})}
 async function createPerson(e){e.preventDefault();if(!person.yard_ids.length){setError('Seleccioná al menos una yarda');return;}await run({action:'create_collaborator',...person},'Colaborador USA creado');setPerson({full_name:'',email:'',phone:'',password:'',yard_ids:[]})}
 const toggle=(ids,id)=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];
 const card={border:'1px solid #dbe4ef',borderRadius:14,padding:18,margin:'18px 0',background:'#fff'};
 const field={display:'block',width:'100%',padding:10,margin:'6px 0 12px',border:'1px solid #cad6e4',borderRadius:8};
 const btn={background:'#133b67',color:'#fff',padding:'10px 16px',border:0,borderRadius:8,cursor:'pointer'};
 return <section style={{marginTop:28}}>
 <h2 style={{fontSize:23}}>🇺🇸 Yardas y Colaboradores USA</h2><p>Usuarios con acceso únicamente a las yardas asignadas. No se les concede el perfil de Operador ni Administrador.</p>
 {error&&<p role="alert" style={{color:'#ad2424'}}>{error}</p>}{notice&&<p role="status" style={{color:'#167146'}}>{notice}</p>}
 <div style={card}><h3>🏭 Registrar nueva yarda</h3><form onSubmit={createYard} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
 <label>Nombre<input required style={field} value={newYard.name} onChange={e=>setNewYard({...newYard,name:e.target.value})}/></label>
 <label>Ciudad<input style={field} value={newYard.city} onChange={e=>setNewYard({...newYard,city:e.target.value})}/></label>
 <label>Estado<input style={field} value={newYard.state} onChange={e=>setNewYard({...newYard,state:e.target.value})}/></label>
 <label>Dirección<input style={field} value={newYard.address} onChange={e=>setNewYard({...newYard,address:e.target.value})}/></label>
 <div><button disabled={busy} style={btn}>+ Crear yarda</button></div></form>
 <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12}}>{yards.map(y=><span key={y.id} style={{padding:'8px 12px',borderRadius:8,background:'#edf4fa'}}>{y.name} · {y.city||'Sin ciudad'} {y.active?'':'(Inactiva)'} <button disabled={busy} onClick={()=>run({action:'set_yard_active',yard_id:y.id,active:!y.active},'Yarda actualizada')}>{y.active?'Desactivar':'Activar'}</button></span>)}</div>
 </div>
 <div style={card}><h3>👤 Crear Colaborador USA</h3><form onSubmit={createPerson} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
 <label>Nombre completo<input required style={field} value={person.full_name} onChange={e=>setPerson({...person,full_name:e.target.value})}/></label>
 <label>Correo<input required type="email" style={field} value={person.email} onChange={e=>setPerson({...person,email:e.target.value})}/></label>
 <label>Teléfono<input style={field} value={person.phone} onChange={e=>setPerson({...person,phone:e.target.value})}/></label>
 <label>Contraseña inicial<input required type="password" minLength={10} style={field} value={person.password} onChange={e=>setPerson({...person,password:e.target.value})}/></label>
 <fieldset style={{gridColumn:'1/-1',border:'1px solid #dbe4ef',borderRadius:8}}><legend>Yardas autorizadas</legend>{yards.filter(y=>y.active).map(y=><label key={y.id} style={{display:'inline-flex',gap:6,margin:8}}><input type="checkbox" checked={person.yard_ids.includes(y.id)} onChange={()=>setPerson({...person,yard_ids:toggle(person.yard_ids,y.id)})}/>{y.name}</label>)}</fieldset>
 <div><button disabled={busy||!yards.some(y=>y.active)} style={btn}>Crear colaborador</button></div></form></div>
 <div style={card}><h3>📋 Colaboradores registrados ({people.length})</h3>{people.map(c=><div key={c.user_id} style={{borderTop:'1px solid #e2e8f0',padding:'12px 0'}}>
 <strong>{c.display_name||c.email}</strong> <small>{c.email}</small> <span>{c.active?' · Activo':' · Desactivado'}</span>
 <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'10px 0'}}>{yards.filter(y=>y.active).map(y=><label key={y.id}><input type="checkbox" checked={(edits[c.user_id]||[]).includes(y.id)} onChange={()=>setEdits({...edits,[c.user_id]:toggle(edits[c.user_id]||[],y.id)})}/>{y.name}</label>)}</div>
 <button disabled={busy} onClick={()=>run({action:'set_assignments',user_id:c.user_id,yard_ids:edits[c.user_id]||[]},'Asignaciones actualizadas')}>Guardar yardas</button>{' '}<button disabled={busy} onClick={()=>run({action:'set_collaborator_active',user_id:c.user_id,active:!c.active},'Acceso actualizado')}>{c.active?'Desactivar acceso USA':'Activar acceso USA'}</button>
 </div>)}{!people.length&&<p>Aún no hay colaboradores USA.</p>}</div>
 </section>
}
