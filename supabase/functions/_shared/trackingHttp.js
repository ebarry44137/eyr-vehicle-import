import { normalizeVin, VIN_PATTERN, publicTrackingResult } from './vehicleTrackingDomain.js';

async function smallJson(req) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('CONTENT_TYPE');
  const reader=req.body?.getReader(); if(!reader)throw new Error('BODY');
  const chunks=[];let size=0;
  try { while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();throw new Error('BODY');}chunks.push(value);} }
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createTrackingHandler({ config, lookup, consumeLimit, signPhoto, now=()=>new Date() }) {
  return async function handle(req) {
    const origin=req.headers.get('origin');
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
    const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
    if(!config.enabled || !config.organizationId || !config.salt || config.salt.length<32 || !config.allowedOrigins.length) return reply({result:'UNAVAILABLE'},503);
    if(origin && !config.allowedOrigins.includes(origin))return reply({result:'FORBIDDEN'},403);
    if(origin)headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Allow-Methods']='POST, OPTIONS';
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method!=='POST')return reply({result:'METHOD_NOT_ALLOWED'},405,{Allow:'POST, OPTIONS'});
    const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${config.salt}|${value}`)))).map(v=>v.toString(16).padStart(2,'0')).join('');
    try {
      // Network headers are an abuse signal, not an authorization mechanism. A global budget also applies.
      const ip=(req.headers.get('x-forwarded-for')?.split(',')[0]||req.headers.get('x-real-ip')||'unknown').trim().slice(0,128);
      if(!await consumeLimit('tracking:global',300)||!await consumeLimit(await hash(`ip:${ip}`),20)) return reply({result:'RATE_LIMITED'},429,{'Retry-After':'60'});
      let body;try{body=await smallJson(req);}catch{return reply({result:'INVALID_REQUEST'},400);}
      const vin=normalizeVin(body?.vin);
      if(!VIN_PATTERN.test(vin))return reply({result:'INVALID_VIN'},400);
      if(!await consumeLimit(await hash(`vin:${vin}`),10))return reply({result:'RATE_LIMITED'},429,{'Retry-After':'60'});
      const snapshot=await lookup(config.organizationId,vin);
      const photos=[];
      if(snapshot?.result==='FOUND'){
        for(const photo of (snapshot.photos||[]).slice(0,30)){
          try{const url=await signPhoto(photo);if(url)photos.push({id:photo.id,url,expiresAt:new Date(now().getTime()+120000).toISOString()});else snapshot.photos_unavailable=true;}
          catch{snapshot.photos_unavailable=true;}
        }
      }
      return reply(publicTrackingResult(snapshot,photos,now()));
    } catch {return reply({result:'UNAVAILABLE'},503);}
  };
}
