import { normalizeVin, VIN_PATTERN } from '../../../supabase/functions/_shared/vehicleTrackingDomain.js';

export async function lookupVehicleTracking(vin, signal) {
  const normalized=normalizeVin(vin);
  if(!VIN_PATTERN.test(normalized))throw new Error('Ingresá un VIN completo de 17 caracteres, sin I, O ni Q.');
  const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-vehicle-tracking`,{
    method:'POST',signal,headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_ANON_KEY},body:JSON.stringify({vin:normalized}),
  });
  if(response.status===429)throw new Error('Se alcanzó el límite de consultas. Esperá un minuto y volvé a intentar.');
  if(!response.ok)throw new Error('El seguimiento está temporalmente no disponible. Contactá a E&R para consultar tu vehículo.');
  const result=await response.json();
  if(!['FOUND','NOT_FOUND','AMBIGUOUS'].includes(result?.result))throw new Error('No pudimos obtener el seguimiento. Volvé a intentar.');
  return result;
}

export function trackingDate(value) {
  if(!value)return 'Fecha no registrada';
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const [year,month,day]=value.split('-');return `${day}/${month}/${year}`;}
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Fecha no registrada':new Intl.DateTimeFormat('es-GT',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Guatemala'}).format(date);
}
