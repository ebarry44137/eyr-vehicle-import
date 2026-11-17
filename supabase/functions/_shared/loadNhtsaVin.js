import { autoDevVehicle, wenmarVehicle } from "./vinProviderAdapters.js";

const VIN_SERVICE_ERROR =
  "No pudimos obtener datos suficientes de este VIN en los servicios de consulta ni en el respaldo guardado. Intentá nuevamente más tarde o usá Cálculo Manual con el valor imponible verificado.";
const SOURCES = ["NHTSA_VPIC", "WENMAR_OPEN", "AUTO_DEV"];

function completeVehicle(vehicle, vin) {
  return vehicle && String(vehicle.VIN || "").toUpperCase() === vin &&
    typeof vehicle.Make === "string" && vehicle.Make.trim() &&
    typeof vehicle.Model === "string" && vehicle.Model.trim() &&
    Number.isInteger(Number(vehicle.ModelYear)) && Number(vehicle.ModelYear) > 1900 &&
    Number(vehicle.ModelYear) <= new Date().getUTCFullYear() + 2;
}

async function requestJson(request, url, headers) {
  try {
    const response = await request(url, {
      signal: AbortSignal.timeout(6500),
      redirect: "error",
      headers,
    });
    if (response.status !== 200) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function loadNhtsaVin(supabase, vin, request = fetch, autoDevKey = "") {
  const encodedVin = encodeURIComponent(vin);
  const nhtsaUrl = "https://vpic.nhtsa.dot.gov/api/vehicles";
  const primary = await requestJson(request, `${nhtsaUrl}/DecodeVinValues/${encodedVin}?format=json`);
  if (completeVehicle(primary?.Results?.[0], vin)) {
    return { vehicle: primary.Results[0], cachedDecode: null, source: "NHTSA_VPIC" };
  }

  const { data: cache, error } = await supabase.from("vin_decodes")
    .select("*").eq("vin", vin).maybeSingle();
  if (!error && SOURCES.includes(cache?.source) && completeVehicle(cache.raw_response, vin) &&
      cache.vin === vin && cache.make === cache.raw_response.Make &&
      cache.model === cache.raw_response.Model && Number(cache.model_year) === Number(cache.raw_response.ModelYear)) {
    return { vehicle: cache.raw_response, cachedDecode: cache, source: cache.source };
  }

  const wenmar = await requestJson(request, `https://open.wenmarpro.com/v1/vin/${encodedVin}`);
  const wenmarResult = wenmarVehicle(wenmar);
  if (completeVehicle(wenmarResult, vin)) {
    return { vehicle: wenmarResult, cachedDecode: null, source: "WENMAR_OPEN" };
  }

  if (autoDevKey) {
    const autoDev = await requestJson(request, `https://api.auto.dev/vin/${encodedVin}`, {
      Authorization: `Bearer ${autoDevKey}`,
    });
    const autoDevResult = autoDevVehicle(autoDev);
    if (completeVehicle(autoDevResult, vin)) {
      return { vehicle: autoDevResult, cachedDecode: null, source: "AUTO_DEV" };
    }
  }

  const alternate = await requestJson(request, `${nhtsaUrl}/DecodeVinValuesExtended/${encodedVin}?format=json`);
  if (completeVehicle(alternate?.Results?.[0], vin)) {
    return { vehicle: alternate.Results[0], cachedDecode: null, source: "NHTSA_VPIC" };
  }

  const unavailable = new Error(VIN_SERVICE_ERROR);
  unavailable.name = "VinServiceUnavailable";
  throw unavailable;
}
