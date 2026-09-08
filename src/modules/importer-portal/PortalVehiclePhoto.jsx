import {useEffect,useState} from "react";
import {supabase} from "../../supabaseClient";
import "./portal-vehicle-photo.css";
export default function PortalVehiclePhoto({item}){
 const [url,setUrl]=useState("");
 useEffect(()=>{let alive=true;(async()=>{setUrl("");if(!item?.id)return;try{
  const{data:s}=await supabase.auth.getSession();const token=s?.session?.access_token||"";
  const call=async body=>{const{data,error}=await supabase.functions.invoke("operation-file-manager",{body,headers:token?{"x-portal-access-token":token}:undefined});if(error||!data?.success)throw error||new Error(data?.error);return data};
  const list=await call({action:"list",source_type:"CUSTOMS_CASE",source_id:item.id});
  const photo=(list.files||[]).find(x=>x.category==="PHOTO"&&x.visible_to_client!==false);
  if(!photo)return;const view=await call({action:"view_url",file_id:photo.id});if(alive)setUrl(view?.url||"");
 }catch{}})();return()=>{alive=false}},[item?.id]);
 const make=String(item?.vehicle_make||item?.make||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-");
 return <div className="ipv-photo">{url?<img src={url} alt="Vehículo"/>:make?<img className="brand" src={`/vehicle-logos/${make}.svg`} onError={e=>{e.currentTarget.style.display="none";e.currentTarget.nextSibling.style.display="grid"}} alt="Marca"/>:null}<span style={{display:make?"none":"grid"}}>🚙</span></div>
}