import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from 'npm:@aws-sdk/client-s3@3.883.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.883.0';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type,x-portal-access-token','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const uuid=(v:any)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''));
const vin=(v:any)=>String(v||'').trim().toUpperCase();
const clean=(v:any,max=300)=>String(v||'').trim().slice(0,max);
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({success:false,error:'Método inválido'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const token=clean(req.headers.get('x-portal-access-token')||req.headers.get('authorization')?.replace(/^Bearer\s+/i,''),4096);
  if(!token)return reply({success:false,error:'Sesión requerida'},401);
  const auth=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${token}`}});
  const user=await auth.json().catch(()=>null);
  if(!auth.ok||!uuid(user?.id))return reply({success:false,error:'Sesión inválida'},401);
  const db=createClient(url,service,{auth:{persistSession:false}});
  const {data:profile,error:pe}=await db.from('profiles').select('role,active,organization_id').eq('id',user.id).maybeSingle();
  if(pe||!profile?.active)return reply({success:false,error:'Perfil no autorizado'},403);
  const admin=String(profile.role||'').toUpperCase()==='ADMIN';
  const {data:assignments,error:ae}=await db.from('usa_yard_collaborators').select('organization_id,active').eq('user_id',user.id).eq('active',true);
  if(ae)throw ae;
  const orgs=(assignments||[]).map((a:any)=>a.organization_id);
  const body=await req.json();const action=clean(body.action,60);
  // Administración únicamente en la organización asignada al perfil del administrador.
  // No se admiten administradores sin organization_id: fail closed.
  const adminOrg=admin&&uuid(profile.organization_id)?profile.organization_id:null;
  const selected=clean(body.organization_id,80);
  const org=adminOrg || (orgs.length===1?orgs[0]:null);
  if(!org || (selected&&selected!==org))return reply({success:false,error:'Organización no autorizada'},403);
  const collaborator=orgs.includes(org);
  const {data:assignedYards,error:asErr}=collaborator?await db.from('usa_yard_assignments').select('yard_id').eq('organization_id',org).eq('user_id',user.id).eq('active',true):{data:[],error:null};
  if(asErr)throw asErr;
  const {data:activeYards,error:ayErr}=await db.from('usa_yards').select('id').eq('organization_id',org).eq('active',true);
  if(ayErr)throw ayErr;
  const activeSet=new Set((activeYards||[]).map((y:any)=>y.id));
  const yardIds=(assignedYards||[]).map((x:any)=>x.yard_id).filter((id:string)=>activeSet.has(id));
  if(!admin&&!collaborator)return reply({success:false,error:'Acceso USA no autorizado'},403);
  const r2id=Deno.env.get('R2_ACCOUNT_ID'),r2key=Deno.env.get('R2_ACCESS_KEY_ID'),r2secret=Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucket=Deno.env.get('R2_BUCKET_NAME')||'eyr-operation-files';
  const s3=r2id&&r2key&&r2secret?new S3Client({region:'auto',endpoint:`https://${r2id}.r2.cloudflarestorage.com`,credentials:{accessKeyId:r2key,secretAccessKey:r2secret}}):null;
  async function receipt(id:any){if(!uuid(id))throw Error('ID inválido');const {data,error}=await db.from('usa_yard_receptions').select('*').eq('id',id).eq('organization_id',org).maybeSingle();if(error)throw error;if(!data||(!adminOrg&&!yardIds.includes(data.yard_id)))throw Error('Recepción no autorizada');return data;}
  if(action==='access'){
   const {data:yards,error}=await db.from('usa_yards').select('id,name,city,state').eq('organization_id',org).eq('active',true).order('name');
   if(error)throw error;
   return reply({success:true,admin:!!adminOrg,collaborator,organization_id:org,yards:adminOrg?(yards||[]):(yards||[]).filter((y:any)=>yardIds.includes(y.id))});
  }
  if(action==='list'){
   let query=db.from('usa_yard_receptions').select('*').eq('organization_id',org).order('created_at',{ascending:false}).limit(250);
   if(!adminOrg){if(!yardIds.length)return reply({success:true,rows:[],admin:false});query=query.in('yard_id',yardIds);}
   const {data,error}=await query;
   if(error)throw error;return reply({success:true,rows:data||[],admin:!!adminOrg});
  }
  if(action==='search_vin'){
   const code=vin(body.vin);if(code.length<5)throw Error('VIN inválido');
   if(!adminOrg&&!yardIds.length)throw Error('No tenés yardas asignadas');
   const {data,error}=await db.from('import_managements').select('id,management_code,vin,client_name,make,model,model_year,organization_id').eq('organization_id',org).ilike('vin',code).limit(10);
   if(error)throw error;
   // El colaborador no recibe datos de clientes, únicamente identificación de vehículo.
   return reply({success:true,matches:(data||[]).map((x:any)=>adminOrg?x:{id:x.id,management_code:x.management_code,vin:x.vin,make:x.make,model:x.model,model_year:x.model_year})});
  }
  if(action==='create'){
   const code=vin(body.vin),yardId=body.yard_id;
   if(!/^[A-HJ-NPR-Z0-9]{5,17}$/.test(code))throw Error('VIN inválido');
   if(!uuid(yardId))throw Error('Seleccioná una yarda');
   const {data:yardRow,error:yardErr}=await db.from('usa_yards').select('id,name').eq('organization_id',org).eq('id',yardId).eq('active',true).maybeSingle();
   if(yardErr)throw yardErr;
   if(!yardRow||(!adminOrg&&!yardIds.includes(yardId)))throw Error('Yarda no autorizada');
   const yard=yardRow.name;
   const managementId=adminOrg&&uuid(body.import_management_id)?body.import_management_id:null;
   if(managementId){const {data:m,error}=await db.from('import_managements').select('id,vin').eq('id',managementId).eq('organization_id',org).maybeSingle();if(error)throw error;if(!m||vin(m.vin)!==code)throw Error('Gestión y VIN no coinciden');}
   const {data,error}=await db.from('usa_yard_receptions').insert({organization_id:org,vin:code,yard_id:yardId,yard_name:yard,vehicle_make:clean(body.vehicle_make,90)||null,vehicle_model:clean(body.vehicle_model,90)||null,model_year:body.model_year?Number(body.model_year):null,vehicle_condition:clean(body.vehicle_condition,200)||null,notes:clean(body.notes,4000)||null,import_management_id:managementId,status:managementId?'LINKED':'PENDING_REVIEW',created_by:user.id,linked_by:managementId?user.id:null,linked_at:managementId?new Date().toISOString():null}).select('*').single();
   if(error){if(error.code==='23505')throw Error('Ya existe una recepción activa con ese VIN');throw error;}
   return reply({success:true,row:data});
  }
  if(action==='link'){
   if(!adminOrg)throw Error('Solo administración puede vincular');
   const r=await receipt(body.reception_id),mid=body.import_management_id;
   if(!uuid(mid))throw Error('Gestión inválida');
   const {data:m,error:me}=await db.from('import_managements').select('id,vin').eq('id',mid).eq('organization_id',org).maybeSingle();
   if(me)throw me;if(!m||vin(m.vin)!==vin(r.vin))throw Error('El VIN de la gestión no coincide');
   const {data,error}=await db.from('usa_yard_receptions').update({import_management_id:mid,status:'LINKED',linked_by:user.id,linked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',r.id).eq('organization_id',org).select('*').single();if(error)throw error;
   return reply({success:true,row:data});
  }
  if(action==='photos'){
   const r=await receipt(body.reception_id);
   const {data,error}=await db.from('usa_yard_photos').select('id,original_name,mime_type,size_bytes,created_at').eq('reception_id',r.id).eq('organization_id',org).order('created_at',{ascending:false});if(error)throw error;
   return reply({success:true,files:data||[]});
  }
  if(['upload_url','register','view_url'].includes(action)&&!s3)throw Error('Secretos R2 no configurados');
  if(action==='upload_url'){
   const r=await receipt(body.reception_id);if(r.status==='CANCELLED')throw Error('Recepción cancelada');
   const mime=clean(body.mime_type,80),size=Number(body.size_bytes),hash=clean(body.content_sha256,64).toLowerCase();
   if(!['image/jpeg','image/png','image/webp'].includes(mime)||!Number.isSafeInteger(size)||size<1||size>25*1024*1024||!/^[a-f0-9]{64}$/.test(hash))throw Error('Archivo no permitido');
   const name=clean(body.original_name,180).replace(/[^a-zA-Z0-9._-]/g,'-')||'foto';
   const path=`${org}/usa-yard/${r.id}/photo/${crypto.randomUUID()}-${name}`;
   const {data:ticket,error}=await db.from('usa_yard_upload_tickets').insert({organization_id:org,reception_id:r.id,user_id:user.id,storage_path:path,original_name:name,mime_type:mime,size_bytes:size,content_sha256:hash}).select('id').single();if(error)throw error;
   const upload_url=await getSignedUrl(s3!,new PutObjectCommand({Bucket:bucket,Key:path,ContentType:mime}),{expiresIn:300});
   return reply({success:true,upload_url,ticket_id:ticket.id});
  }
  if(action==='register'){
   const r=await receipt(body.reception_id);
   const {data:t,error:te}=await db.from('usa_yard_upload_tickets').select('*').eq('id',body.ticket_id).eq('reception_id',r.id).eq('user_id',user.id).eq('organization_id',org).is('used_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();if(te)throw te;if(!t)throw Error('Ticket expirado o inválido');
   const head=await s3!.send(new HeadObjectCommand({Bucket:bucket,Key:t.storage_path}));
   if(Number(head.ContentLength)!==Number(t.size_bytes)||head.ContentType!==t.mime_type)throw Error('Archivo subido no coincide con el ticket');
   const {data,error}=await db.from('usa_yard_photos').insert({organization_id:org,reception_id:r.id,storage_path:t.storage_path,original_name:t.original_name,mime_type:t.mime_type,size_bytes:t.size_bytes,content_sha256:t.content_sha256,created_by:user.id}).select('id').single();
   if(error){if(error.code==='23505')throw Error('Fotografía duplicada');throw error;}
   await db.from('usa_yard_upload_tickets').update({used_at:new Date().toISOString()}).eq('id',t.id);
   return reply({success:true,file:data});
  }
  if(action==='view_url'){
   const {data:f,error}=await db.from('usa_yard_photos').select('storage_path,reception_id').eq('id',body.file_id).eq('organization_id',org).maybeSingle();if(error)throw error;if(!f)throw Error('Fotografía no encontrada');await receipt(f.reception_id);
   const signed=await getSignedUrl(s3!,new GetObjectCommand({Bucket:bucket,Key:f.storage_path}),{expiresIn:300});return reply({success:true,url:signed});
  }
  throw Error('Acción no soportada');
 }catch(e:any){console.error('usa-yard-manager:',e);return reply({success:false,error:e?.message||'Error interno'},400);}
});
