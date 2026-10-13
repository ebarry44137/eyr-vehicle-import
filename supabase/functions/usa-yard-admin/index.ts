import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type,x-portal-access-token','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(v:any,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors,'Content-Type':'application/json'}});
const validUUID=(v:any)=>/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(String(v||''));
const txt=(v:any,n=200)=>String(v||'').trim().slice(0,n);
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({success:false,error:'Método inválido'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const token=txt(req.headers.get('x-portal-access-token')||req.headers.get('authorization')?.replace(/^Bearer\s+/i,''),4096);
  if(!token)return json({success:false,error:'Sesión requerida'},401);
  const a=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${token}`}});
  const user=await a.json().catch(()=>null);
  if(!a.ok||!validUUID(user?.id))return json({success:false,error:'Sesión inválida'},401);
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data:profile,error:pe}=await db.from('profiles').select('role,active,organization_id').eq('id',user.id).maybeSingle();
  if(pe||!profile?.active||String(profile.role).toUpperCase()!=='ADMIN'||!validUUID(profile.organization_id))return json({success:false,error:'Solo administradores E&R autorizados'},403);
  const org=profile.organization_id;
  const body=await req.json(),action=txt(body?.action,40);
  if(action==='list'){
   const [{data:yards,error:ye},{data:collabs,error:ce},{data:assign,error:ae}]=await Promise.all([
    db.from('usa_yards').select('*').eq('organization_id',org).order('name'),
    db.from('usa_yard_collaborators').select('user_id,display_name,active,created_at').eq('organization_id',org).order('created_at',{ascending:false}),
    db.from('usa_yard_assignments').select('yard_id,user_id,active').eq('organization_id',org)
   ]);
   if(ye||ce||ae)throw ye||ce||ae;
   const people=[];
   for(const c of collabs||[]){
    const {data:u,error:ue}=await db.auth.admin.getUserById(c.user_id);
    people.push({...c,email:ue?null:u?.user?.email||'',yard_ids:(assign||[]).filter((x:any)=>x.user_id===c.user_id&&x.active).map((x:any)=>x.yard_id)});
   }
   return json({success:true,yards:yards||[],collaborators:people});
  }
  if(action==='create_yard'){
   const name=txt(body.name,160),city=txt(body.city,120),state=txt(body.state,120),address=txt(body.address,250);
   if(name.length<2)throw Error('Nombre de yarda requerido');
   const {data,error}=await db.from('usa_yards').insert({organization_id:org,name,city:city||null,state:state||null,address:address||null}).select('*').single();
   if(error)throw error;return json({success:true,yard:data});
  }
  if(action==='set_yard_active'){
   if(!validUUID(body.yard_id))throw Error('Yarda inválida');
   const {data,error}=await db.from('usa_yards').update({active:body.active===true}).eq('organization_id',org).eq('id',body.yard_id).select('id').maybeSingle();
   if(error)throw error;if(!data)throw Error('Yarda no encontrada');return json({success:true});
  }
  if(action==='create_collaborator'){
   const name=txt(body.full_name,160),email=txt(body.email,250).toLowerCase(),password=String(body.password||''),phone=txt(body.phone,50);
   const ids=Array.isArray(body.yard_ids)?[...new Set(body.yard_ids.filter(validUUID))]:[];
   if(!name||!/^\S+@\S+\.\S+$/.test(email)||password.length<10||ids.length===0)throw Error('Nombre, correo, contraseña (mínimo 10) y yarda son obligatorios');
   const {data:yards,error:ye}=await db.from('usa_yards').select('id').eq('organization_id',org).eq('active',true).in('id',ids);
   if(ye)throw ye;if((yards||[]).length!==ids.length)throw Error('Alguna yarda no está autorizada');
   const {data:created,error:authErr}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name}});
   if(authErr)throw authErr;
   const id=created.user?.id;if(!id)throw Error('Auth no devolvió ID');
   try{
    // Compatible with existing CUSTOMER role check. No OPERADOR/ADMIN privileges.
    const {error:pr}=await db.from('profiles').upsert({id,role:'CUSTOMER',active:true,full_name:name,phone:phone||null,organization_id:org},{onConflict:'id'});
    if(pr)throw pr;
    const {error:cr}=await db.from('usa_yard_collaborators').insert({organization_id:org,user_id:id,display_name:name,active:true});
    if(cr)throw cr;
    const {error:ar}=await db.from('usa_yard_assignments').insert(ids.map((yard_id:string)=>({organization_id:org,user_id:id,yard_id,active:true})));
    if(ar)throw ar;
   }catch(e){
    // Fail closed: revoke access and attempt cleanup if provisioning fails.
    await db.from('usa_yard_assignments').delete().eq('organization_id',org).eq('user_id',id);
    await db.from('usa_yard_collaborators').delete().eq('organization_id',org).eq('user_id',id);
    await db.auth.admin.deleteUser(id);
    throw e;
   }
   return json({success:true,user_id:id});
  }
  if(action==='set_collaborator_active'){
   if(!validUUID(body.user_id)||body.user_id===user.id)throw Error('Colaborador inválido');
   const {data,error}=await db.from('usa_yard_collaborators').update({active:body.active===true}).eq('organization_id',org).eq('user_id',body.user_id).select('user_id').maybeSingle();
   if(error)throw error;if(!data)throw Error('Colaborador no encontrado');return json({success:true});
  }
  if(action==='set_assignments'){
   if(!validUUID(body.user_id))throw Error('Usuario inválido');
   const ids=Array.isArray(body.yard_ids)?[...new Set(body.yard_ids.filter(validUUID))]:[];
   const {data:c}=await db.from('usa_yard_collaborators').select('user_id').eq('organization_id',org).eq('user_id',body.user_id).maybeSingle();
   if(!c)throw Error('Colaborador no encontrado');
   if(ids.length){const {data:ys,error:ye}=await db.from('usa_yards').select('id').eq('organization_id',org).eq('active',true).in('id',ids);if(ye)throw ye;if((ys||[]).length!==ids.length)throw Error('Yarda inválida');}
   // Add/reactivate new assignments first; never leave user unassigned if insert fails.
   if(ids.length){const {error:ie}=await db.from('usa_yard_assignments').upsert(ids.map((yard_id:string)=>({organization_id:org,user_id:body.user_id,yard_id,active:true})),{onConflict:'yard_id,user_id'});if(ie)throw ie;}
   const {data:existing,error:ee}=await db.from('usa_yard_assignments').select('yard_id').eq('organization_id',org).eq('user_id',body.user_id);
   if(ee)throw ee;
   const disable=(existing||[]).map((x:any)=>x.yard_id).filter((id:string)=>!ids.includes(id));
   if(disable.length){const {error:de}=await db.from('usa_yard_assignments').update({active:false}).eq('organization_id',org).eq('user_id',body.user_id).in('yard_id',disable);if(de)throw de;}
   return json({success:true});
  }
  throw Error('Acción no soportada');
 }catch(e:any){console.error('usa-yard-admin:',e);return json({success:false,error:e?.message||'Error interno'},400);}
});
