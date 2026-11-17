const VIN_SERVICE_ERROR =
  "NHTSA está temporalmente fuera de servicio. No tenemos datos guardados para este VIN. Intentá nuevamente más tarde o usá Cálculo Manual con el valor imponible verificado.";

function completeVehicle(vehicle, vin) {
  return vehicle && String(vehicle.VIN || "").toUpperCase() === vin &&
    String(vehicle.Make || "").trim() && String(vehicle.Model || "").trim() &&
    Number(vehicle.ModelYear) > 1900;
}

export async function loadNhtsaVin(supabase, vin, request = fetch) {
  const endpoints = ["DecodeVinValues", "DecodeVinValuesExtended"];
  for (const endpoint of endpoints) {
    try {
      const response = await request(
        `https://vpic.nhtsa.dot.gov/api/vehicles/${endpoint}/${encodeURIComponent(vin)}?format=json`,
        { signal: AbortSignal.timeout(6500) },
      );
      if (response.ok) {
        const payload = await response.json();
        const vehicle = payload?.Results?.[0];
        if (completeVehicle(vehicle, vin)) return { vehicle, cachedDecode: null };
      }
    } catch {
      // El respaldo también cubre tiempo de espera y respuestas JSON inválidas.
    }

    if (endpoint === endpoints[0]) {
      const { data, error } = await supabase.from("vin_decodes")
        .select("*").eq("vin", vin).maybeSingle();
      if (!error && data?.source === "NHTSA_VPIC" && completeVehicle(data.raw_response, vin) &&
          data.vin === vin && data.make === data.raw_response.Make &&
          data.model === data.raw_response.Model && Number(data.model_year) === Number(data.raw_response.ModelYear)) {
        return { vehicle: data.raw_response, cachedDecode: data };
      }
    }
  }

  const error = new Error(VIN_SERVICE_ERROR);
  error.name = "VinServiceUnavailable";
  throw error;
}
