function positiveNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function wenmarVehicle(data) {
  if (data?.year_conclusive !== true) return null;
  const attributes = data.attributes || {};
  const attribute = (name) => attributes[name]?.value || null;
  return {
    VIN: data.vin,
    Make: data.make,
    Model: data.model,
    ModelYear: positiveNumber(data.year),
    Trim: data.trim || attribute("Trim"),
    Trim2: attribute("Trim2"),
    Series: attribute("Series"),
    Series2: data.series2 || attribute("Series2"),
    VehicleType: data.manufacturer?.vehicle_type || attribute("VehicleType"),
    BodyClass: data.body || attribute("BodyClass"),
    DisplacementL: positiveNumber(data.engine?.displacement_l),
    DisplacementCC: positiveNumber(data.engine?.displacement_cc),
    EngineCylinders: positiveNumber(data.engine?.cylinders),
    FuelTypePrimary: data.engine?.fuel || attribute("FuelTypePrimary"),
    FuelTypeSecondary: attribute("FuelTypeSecondary"),
    DriveType: attribute("DriveType") || data.drivetrain || data.drive,
    TransmissionStyle: data.transmission || attribute("TransmissionStyle"),
    TransmissionSpeeds: positiveNumber(attribute("TransmissionSpeeds")),
    Doors: positiveNumber(data.doors),
    Manufacturer: data.manufacturer?.name,
    PlantCountry: data.plant?.country,
    ErrorCode: null,
    ErrorText: Array.isArray(data.warnings) ? data.warnings.join(" · ") : null,
  };
}

export function autoDevVehicle(data) {
  if (data?.yearAmbiguous === true) return null;
  const engine = typeof data?.engine === "string" ? data.engine : "";
  const liters = engine.match(/\b(\d+(?:\.\d+)?)\s*L\b/i);
  const cylinders = engine.match(/\b(?:V|I|H|W)(\d{1,2})\b/i) ||
    engine.match(/\b(\d{1,2})-Cyl\b/i);
  return {
    VIN: data?.vin,
    Make: data?.make || data?.vehicle?.make,
    Model: data?.model || data?.vehicle?.model,
    ModelYear: positiveNumber(data?.vehicle?.year ?? data?.year),
    Trim: data?.ambiguous === true ? null : data?.trim,
    Series: null,
    VehicleType: null,
    BodyClass: data?.body,
    DisplacementL: liters ? positiveNumber(liters[1]) : null,
    DisplacementCC: null,
    EngineCylinders: cylinders ? positiveNumber(cylinders[1]) : null,
    FuelTypePrimary: data?.fuel,
    DriveType: data?.drive,
    TransmissionStyle: data?.transmission,
    Doors: positiveNumber(data?.doors),
    Manufacturer: data?.vehicle?.manufacturer,
    PlantCountry: null,
    ErrorCode: null,
    ErrorText: data?.ambiguous === true ? "Versión pendiente de confirmar." : null,
  };
}
