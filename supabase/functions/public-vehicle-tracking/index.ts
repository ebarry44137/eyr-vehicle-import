import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.883.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.883.0';
import { createTrackingHandler } from '../_shared/trackingHttp.js';

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const account=Deno.env.get('R2_ACCOUNT_ID');
const key=Deno.env.get('R2_ACCESS_KEY_ID'),secret=Deno.env.get('R2_SECRET_ACCESS_KEY');
const s3=account&&/^[a-z0-9]{32}$/.test(account)&&key&&secret?new S3Client({region:'auto',endpoint:`https://${account}.r2.cloudflarestorage.com`,credentials:{accessKeyId:key,secretAccessKey:secret}}):null;
const organizationId=Deno.env.get('TRACKING_ORGANIZATION_ID')||'';
const origins=(Deno.env.get('TRACKING_ALLOWED_ORIGINS')||'').split(',').map(value=>value.trim()).filter(value=>{
  try{const url=new URL(value);return url.origin===value&&(url.protocol==='https:'||(Deno.env.get('TRACKING_ALLOW_LOCALHOST')==='true'&&['localhost','127.0.0.1'].includes(url.hostname)));}catch{return false;}
});
const handler=createTrackingHandler({
  config:{enabled:Deno.env.get('TRACKING_PUBLIC_ENABLED')==='true',organizationId:/^[a-f0-9-]{36}$/i.test(organizationId)?organizationId:'',salt:Deno.env.get('TRACKING_RATE_LIMIT_SALT')||'',allowedOrigins:origins},
  lookup:async(org:string,vin:string)=>{const {data,error}=await db.rpc('eyr_tracking_snapshot_v1',{p_organization_id:org,p_vin:vin});if(error)throw error;return data;},
  consumeLimit:async(key:string,limit:number)=>{const {data,error}=await db.rpc('eyr_tracking_limit_v1',{p_key:key,p_limit:limit});if(error)throw error;return data===true;},
  signPhoto:async(photo:{storage_path:string;mime_type:string})=>{
    if(!s3)return null;
    if(!photo.storage_path.startsWith(`${organizationId}/usa-yard/`)||!['image/jpeg','image/png','image/webp'].includes(photo.mime_type))return null;
    return getSignedUrl(s3,new GetObjectCommand({Bucket:Deno.env.get('R2_BUCKET_NAME')||'eyr-operation-files',Key:photo.storage_path,ResponseContentType:photo.mime_type,ResponseContentDisposition:'inline'}),{expiresIn:120});
  },
});
Deno.serve(handler);
