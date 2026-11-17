import { loadNhtsaVin } from "../_shared/loadNhtsaVin.js";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function specsArrayToObject(specs: any[]) {
  const obj: Record<string, string> = {};

  for (const item of specs || []) {
    if (item?.Name) {
      obj[item.Name] = item.Value ?? "";
    }
  }

  return obj;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function hasToken(value: string, token: string) {
  const normalizedValue = ` ${normalizeText(value)} `;
  const normalizedToken = ` ${normalizeText(token)} `;

  return normalizedValue.includes(normalizedToken);
}

function parseCandidateEngineLiters(value: string) {
  // V13: usar el texto ORIGINAL. normalizeText() elimina el punto decimal
  // y convertiría "2.3L" en "2 3L", haciendo imposible detectarlo.
  const raw = String(value || "").toUpperCase();

  const match = raw.match(/\b(\d+(?:\.\d+)?)\s*L\b/);

  if (!match) return null;

  const liters = Number(match[1]);
  return Number.isFinite(liters) ? liters : null;
}

function parseCandidateDoors(value: string) {
  // V13: acepta "4DR", "4 DR", "2DR", etc.
  const raw = String(value || "").toUpperCase();

  const match = raw.match(/\b(2|3|4|5)\s*DR\b/);

  if (!match) return null;

  return Number(match[1]);
}

// =========================================================
// V39.7.9.9.4 · SMART FUEL + CONFIGURABLE MOTORCYCLE FREIGHT
// =========================================================
function normalizeFuelForReview(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized) return null;

  if (
    normalized.includes("FLEX FUEL") ||
    normalized.includes("FLEXIBLE FUEL") ||
    normalized.includes("FFV") ||
    normalized.includes("E85") ||
    normalized.includes("ETHANOL")
  ) {
    return "FLEX_FUEL";
  }

  if (
    normalized === "GA" ||
    normalized === "GAS" ||
    normalized.includes("GASOLINE") ||
    normalized.includes("GASOLINA")
  ) {
    return "GASOLINE";
  }

  if (
    normalized === "DI" ||
    normalized.includes("DIESEL") ||
    normalized.includes("DISEL")
  ) {
    return "DIESEL";
  }

  if (
    normalized === "HI" ||
    normalized.includes("HYBRID") ||
    normalized.includes("HIBRID")
  ) {
    return "HYBRID";
  }

  if (
    normalized.includes("ELECTRIC") ||
    normalized.includes("ELECTRICO")
  ) {
    return "ELECTRIC";
  }

  return normalized;
}

function fuelsCompatibleForReview(
  vinFuelValue: string | null | undefined,
  satFuelValue: string | null | undefined
) {
  const vinFuel = normalizeFuelForReview(vinFuelValue);
  const satFuel = normalizeFuelForReview(satFuelValue);

  if (!vinFuel || !satFuel) {
    return true;
  }

  if (vinFuel === satFuel) {
    return true;
  }

  if (
    (vinFuel === "FLEX_FUEL" && satFuel === "GASOLINE") ||
    (vinFuel === "GASOLINE" && satFuel === "FLEX_FUEL")
  ) {
    return true;
  }

  return false;
}

function splitTrimOptions(value: string | null | undefined) {
  return String(value || "")
    .split(/[,/]/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function expandTrimAliases(value: string | null | undefined) {
  const aliases = new Set<string>();

  for (const option of splitTrimOptions(value)) {
    aliases.add(option);

    // Algunos fabricantes codifican niveles como 1LS, 2LS, 1LT, 2LT, etc.
    // El catálogo SAT suele registrar únicamente LS/LT. Conservamos ambos
    // formatos y sólo retiramos el prefijo numérico cuando el sufijo tiene
    // al menos dos caracteres, evitando convertir nombres como 300S en "S".
    const compact = option.replace(/\s+/g, "");
    const prefixed = compact.match(/^\d+([A-Z][A-Z0-9-]{1,})$/);

    if (prefixed?.[1]) {
      aliases.add(normalizeText(prefixed[1]));
    }
  }

  return Array.from(aliases).filter(Boolean);
}

function isGenericVariantLabel(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized) return true;

  const genericExact = new Set([
    "WAGON BODY STYLE",
    "WAGON",
    "SEDAN",
    "HATCHBACK",
    "HATCH",
    "COUPE",
    "CONVERTIBLE",
    "SUV",
    "SPORT UTILITY VEHICLE",
    "SPORT UTILITY VEHICLE SUV",
    "MULTIPURPOSE VEHICLE",
    "MPV",
    "CROSSOVER",
    "PICKUP",
    "PICK UP",
    "TRUCK",
    "VAN",
    "MINIVAN",
    "4 DOOR",
    "4DR",
    "5 DOOR",
    "5DR",
    "2 DOOR",
    "2DR",
  ]);

  if (genericExact.has(normalized)) return true;

  if (
    normalized.includes("BODY STYLE") ||
    normalized.includes("BODY TYPE") ||
    normalized === "NOT APPLICABLE" ||
    normalized === "N A"
  ) {
    return true;
  }

  return false;
}

function nativeVehicleVariantAliases(vehicle: any) {
  const aliases = new Set<string>();

  const sources = [
    vehicle?.trim,
    vehicle?.trim2,
    vehicle?.series,
    vehicle?.series2,
  ];

  for (const source of sources) {
    for (const alias of expandTrimAliases(source)) {
      if (!isGenericVariantLabel(alias)) {
        aliases.add(alias);
      }
    }
  }

  return Array.from(aliases).filter(Boolean);
}

function dimensionVehicleVariantAliases(vehicle: any) {
  const aliases = new Set<string>();

  for (const alias of expandTrimAliases(vehicle?.dimension_variant)) {
    if (!isGenericVariantLabel(alias)) {
      aliases.add(alias);
    }
  }

  return Array.from(aliases).filter(Boolean);
}

function vehicleVariantAliases(vehicle: any) {
  return Array.from(
    new Set([
      ...nativeVehicleVariantAliases(vehicle),
      ...dimensionVehicleVariantAliases(vehicle),
    ])
  ).filter(Boolean);
}

function primaryVehicleVariant(vehicle: any) {
  const nativeAliases = nativeVehicleVariantAliases(vehicle);

  if (nativeAliases.length > 0) {
    return nativeAliases[0];
  }

  const dimensionAliases = dimensionVehicleVariantAliases(vehicle);

  return dimensionAliases[0] || null;
}

function extractDimensionVariant(
  dimensionModel: string | null | undefined,
  baseModel: string | null | undefined
) {
  const rawDimension = String(dimensionModel || "").toUpperCase();
  const normalizedDimension = normalizeText(dimensionModel);
  const normalizedModel = normalizeText(baseModel);

  if (!normalizedDimension || !normalizedModel) {
    return null;
  }

  if (!containsExactNormalizedPhrase(normalizedDimension, normalizedModel)) {
    return null;
  }

  const modelTokens = new Set(
    normalizedModel.split(/\s+/).filter(Boolean)
  );

  const ignoredTokens = new Set([
    "2DR", "3DR", "4DR", "5DR",
    "2", "3", "4", "5", "DOOR", "DOORS",
    "SUV", "SEDAN", "HATCH", "HATCHBACK", "WAGON",
    "COUPE", "CONVERTIBLE", "MPV", "CROSSOVER",
    "PICKUP", "TRUCK", "VAN", "MINIVAN",
    "CAB", "CREW", "REG", "REGULAR", "EXT", "EXTENDED", "DOUBLE",
    "KING", "QUAD", "SHORT", "LONG", "BED",
    "AWD", "FWD", "RWD", "4WD", "2WD", "4X4", "4X2",
    "AUTO", "AUTOMATIC", "MANUAL", "CVT", "AT", "MT",
    "V6", "V8", "V10", "I3", "I4", "I5", "I6",
    "L4", "L6", "L8", "GAS", "GASOLINE", "DIESEL",
  ]);

  // V39.7.9.9 · Antes de normalizar "/" detectamos grupos de variantes.
  // Ejemplo real: "FRONTIER CREW CAB XE/SE 4x2" debe conservar XE/SE,
  // no degradarse al último token "SE".
  const slashGroups = Array.from(
    rawDimension.matchAll(
      /\b([A-Z][A-Z0-9-]{0,19}(?:\s*\/\s*[A-Z][A-Z0-9-]{0,19})+)\b/g
    )
  );

  for (const group of slashGroups) {
    const aliases = String(group?.[1] || "")
      .split("/")
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .filter((token) => !modelTokens.has(token))
      .filter((token) => !ignoredTokens.has(token))
      .filter((token) => !isGenericVariantLabel(token));

    const uniqueAliases = Array.from(new Set(aliases));

    if (uniqueAliases.length >= 2) {
      return uniqueAliases.join("/");
    }
  }

  const tokens = normalizedDimension
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !modelTokens.has(token))
    .filter((token) => !ignoredTokens.has(token))
    .filter((token) => !/^\d+(?:\.\d+)?L$/.test(token))
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token));

  if (tokens.length === 0) {
    return null;
  }

  // Para una sola variante seguimos usando el comportamiento histórico:
  // el nivel de equipamiento suele estar al final de la ficha.
  const candidate =
    tokens.length >= 2
      ? `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`
      : tokens[tokens.length - 1];

  const lastToken = tokens[tokens.length - 1];

  const preferred =
    lastToken.length >= 2 && lastToken.length <= 20
      ? lastToken
      : candidate;

  return isGenericVariantLabel(preferred)
    ? null
    : normalizeText(preferred);
}

function containsExactNormalizedPhrase(
  haystack: string | null | undefined,
  phrase: string | null | undefined
) {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedPhrase = normalizeText(phrase);

  if (!normalizedHaystack || !normalizedPhrase) {
    return false;
  }

  return ` ${normalizedHaystack} `.includes(
    ` ${normalizedPhrase} `
  );
}

function satLineHasExactTrim(
  line: string | null | undefined,
  trim: string | null | undefined
) {
  const trimOptions = expandTrimAliases(trim);

  if (trimOptions.length === 0) {
    return false;
  }

  return trimOptions.some((trimOption) =>
    containsExactNormalizedPhrase(line, trimOption)
  );
}

function isMechanicallyCompatibleSatCandidate(
  candidate: any,
  vehicle: {
    vin?: string | null;
    model_year: number | null;
    model: string | null;
    engine_cc: number | null;
    cylinders: number | null;
    doors: number | null;
    fuel_type: string | null;
  }
) {
  if (!candidate || candidate.has_conflict) return false;

  if (
    vehicle.model_year !== null &&
    candidate.model_year !== null &&
    Number(candidate.model_year) !== Number(vehicle.model_year) &&
    !Boolean(candidate.is_rest_of_years)
  ) {
    return false;
  }

  if (
    vehicle.model &&
    !containsExactNormalizedPhrase(candidate.line, vehicle.model)
  ) {
    return false;
  }

  if (
    vehicle.engine_cc !== null &&
    candidate.engine_cc !== null &&
    Math.abs(Number(candidate.engine_cc) - Number(vehicle.engine_cc)) > 100
  ) {
    return false;
  }

  if (
    vehicle.cylinders !== null &&
    candidate.cylinders !== null &&
    Number(candidate.cylinders) !== Number(vehicle.cylinders)
  ) {
    return false;
  }

  if (
    vehicle.doors !== null &&
    candidate.doors !== null &&
    Number(candidate.doors) !== Number(vehicle.doors)
  ) {
    // En SUV/hatchback NHTSA puede contar el portón trasero como 5ta puerta
    // mientras SAT/CVS registra 4DR. 4 vs 5 no es conflicto mecánico.
    const doorPair = new Set([
      Number(vehicle.doors),
      Number(candidate.doors),
    ]);

    const isFourFiveDoorSemanticDifference =
      doorPair.has(4) &&
      doorPair.has(5) &&
      doorPair.size === 2;

    if (!isFourFiveDoorSemanticDifference) {
      return false;
    }
  }

  if (
    !fuelsCompatibleForReview(
      vehicle.fuel_type,
      candidate.fuel_type
    )
  ) {
    return false;
  }

  return true;
}

function resolveSatVariantByTrim(
  vehicle: {
    vin?: string | null;
    model_year: number | null;
    model: string | null;
    trim: string | null;
    trim2?: string | null;
    series?: string | null;
    series2?: string | null;
    engine_cc: number | null;
    cylinders: number | null;
    doors: number | null;
    fuel_type: string | null;
  },
  candidates: any[]
) {
  // V39.7.9.8+ · Sólo evidencia nativa VIN/NHTSA puede resolver
  // automáticamente una línea SAT. Dimensiones siguen como evidencia secundaria.
  const aliases = nativeVehicleVariantAliases(vehicle);
  if (aliases.length === 0) return null;

  const compatible = (candidates || []).filter((candidate: any) =>
    isMechanicallyCompatibleSatCandidate(candidate, vehicle)
  );

  const trimMatches = compatible.filter((candidate: any) =>
    aliases.some((alias) =>
      containsExactNormalizedPhrase(candidate.line, alias)
    )
  );

  if (trimMatches.length !== 1) return null;

  return trimMatches[0];
}

function isStrongDeterministicSatMatch(
  bestMatch: any,
  vehicle: {
    model_year: number | null;
    model: string | null;
    trim: string | null;
    trim2?: string | null;
    series?: string | null;
    series2?: string | null;
    engine_cc: number | null;
    cylinders: number | null;
    doors: number | null;
    fuel_type: string | null;
  },
  candidates: any[]
) {
  if (!bestMatch || bestMatch.has_conflict) {
    return false;
  }

  if (
    vehicle.model_year === null ||
    bestMatch.model_year === null ||
    Number(bestMatch.model_year) !== Number(vehicle.model_year)
  ) {
    return false;
  }

  if (
    !vehicle.model ||
    !containsExactNormalizedPhrase(
      bestMatch.line,
      vehicle.model
    )
  ) {
    return false;
  }

  // Si NHTSA conoce la versión en Trim/Trim2/Series/Series2,
  // exigimos coincidencia exacta por palabra/frase.
  // La variante dimensional no se considera confirmación VIN.
  const strongVariantAliases = nativeVehicleVariantAliases(vehicle);

  if (
    strongVariantAliases.length > 0 &&
    !strongVariantAliases.some((alias) =>
      containsExactNormalizedPhrase(bestMatch.line, alias)
    )
  ) {
    return false;
  }

  if (
    vehicle.engine_cc !== null &&
    bestMatch.engine_cc !== null &&
    Math.abs(
      Number(bestMatch.engine_cc) - Number(vehicle.engine_cc)
    ) > 100
  ) {
    return false;
  }

  if (
    vehicle.cylinders !== null &&
    bestMatch.cylinders !== null &&
    Number(bestMatch.cylinders) !== Number(vehicle.cylinders)
  ) {
    return false;
  }

  if (
    vehicle.doors !== null &&
    bestMatch.doors !== null &&
    Number(bestMatch.doors) !== Number(vehicle.doors)
  ) {
    return false;
  }

  if (
    !fuelsCompatibleForReview(
      vehicle.fuel_type,
      bestMatch.fuel_type
    )
  ) {
    return false;
  }

  // V19.9 · REGLA DE AUTO MATCH
  // Sólo automatizamos cuando la mejor opción tiene confianza >= 90%
  // y supera por al menos 15 puntos a la segunda opción compatible.
  const bestScore = Number(bestMatch.match_score || 0);

  const nextCompatible = (candidates || [])
    .filter((item: any) =>
      Number(item.sat_vehicle_id) !==
        Number(bestMatch.sat_vehicle_id) &&
      !item.has_conflict
    )
    .sort(
      (a: any, b: any) =>
        Number(b.match_score || 0) -
        Number(a.match_score || 0)
    )[0];

  const secondScore =
    nextCompatible
      ? Number(nextCompatible.match_score || 0)
      : null;

  const margin =
    secondScore !== null
      ? bestScore - secondScore
      : 100;

  if (bestScore < 90) {
    return false;
  }

  if (margin < 15) {
    return false;
  }

  return true;
}

function scoreDimensionCandidate(
  candidateModel: string,
  model: string,
  trim: string | null,
  series: string | null,
  bodyClass: string | null,
  bodyCabType: string | null,
  driveType: string | null,
  fuelType: string | null,
  engineLiters: number | null,
  doors: number | null
) {
  const candidate = normalizeText(candidateModel);
  const normalizedModel = normalizeText(model);
  const normalizedSeries = normalizeText(series);
  const normalizedBody = normalizeText(bodyClass);
  const normalizedCab = normalizeText(bodyCabType);
  const normalizedDrive = normalizeText(driveType);
  const normalizedFuel = normalizeText(fuelType);

  let score = 0;

  // Modelo base.
  if (
    normalizedModel &&
    candidate.includes(normalizedModel)
  ) {
    score += 30;
  }

  // V12: si la ficha dimensional agrega "SPORT" inmediatamente al
  // modelo base pero el modelo VIN no contiene SPORT, la tratamos como
  // una familia distinta y la penalizamos. Ej.: BRONCO vs BRONCO SPORT.
  if (
    normalizedModel &&
    !normalizedModel.includes("SPORT") &&
    candidate.includes(`${normalizedModel} SPORT`)
  ) {
    score -= 45;
  }

  // Serie (1500 / 2500 / etc.).
  if (
    normalizedSeries &&
    (
      hasToken(candidate, normalizedSeries) ||
      candidate.includes(`${normalizedSeries}HD`)
    )
  ) {
    score += 30;
  }

  const truckSeries = ["1500", "2500", "3500"];

  if (normalizedSeries) {
    for (const seriesOption of truckSeries) {
      if (
        seriesOption !== normalizedSeries &&
        hasToken(candidate, seriesOption)
      ) {
        score -= 35;
      }
    }
  }

  // NHTSA a veces devuelve varios trims separados por coma.
  // Premia cualquiera que aparezca realmente en la ficha dimensional.
  const trimOptions = String(trim || "")
    .split(/[,/]/)
    .map((item) => normalizeText(item))
    .filter(Boolean);

  if (
    trimOptions.some((trimOption) =>
      candidate.includes(trimOption)
    )
  ) {
    score += 15;
  }

  if (
    normalizedBody.includes("SEDAN") &&
    candidate.includes("SEDAN")
  ) {
    score += 10;
  }

  if (
    normalizedBody.includes("HATCH") &&
    candidate.includes("HATCH")
  ) {
    score += 10;
  }

  if (
    normalizedBody.includes("PICKUP") ||
    normalizedBody.includes("PICK UP")
  ) {
    score += 5;
  }

  if (
    normalizedBody.includes("SPORT UTILITY") &&
    candidate.includes("SUV")
  ) {
    score += 5;
  }

  if (
    normalizedCab.includes("CREW") &&
    candidate.includes("CREW")
  ) {
    score += 20;
  }

  if (
    normalizedCab.includes("REGULAR") &&
    (
      candidate.includes("REG CAB") ||
      candidate.includes("REGULAR CAB")
    )
  ) {
    score += 20;
  }

  if (
    normalizedCab.includes("EXTENDED") &&
    (
      candidate.includes("EXT CAB") ||
      candidate.includes("EXTENDED CAB")
    )
  ) {
    score += 20;
  }

  if (
    normalizedCab.includes("DOUBLE") &&
    candidate.includes("DOUBLE CAB")
  ) {
    score += 20;
  }

  const vinIs4wd =
    normalizedDrive.includes("4WD") ||
    normalizedDrive.includes("4X4") ||
    normalizedDrive.includes("4 WHEEL") ||
    normalizedDrive.includes("AWD");

  const vinIs2wd =
    normalizedDrive.includes("2WD") ||
    normalizedDrive.includes("4X2") ||
    normalizedDrive.includes("FWD") ||
    normalizedDrive.includes("RWD");

  const candidateIs4wd =
    candidate.includes("4WD") ||
    candidate.includes("4X4") ||
    candidate.includes("AWD");

  const candidateIs2wd =
    candidate.includes("2WD") ||
    candidate.includes("4X2") ||
    candidate.includes("FWD") ||
    candidate.includes("RWD");

  if (vinIs4wd && candidateIs4wd) {
    score += 20;
  }

  if (vinIs2wd && candidateIs2wd) {
    score += 20;
  }

  if (vinIs4wd && candidateIs2wd) {
    score -= 40;
  }

  if (vinIs2wd && candidateIs4wd) {
    score -= 40;
  }

  if (
    candidate.includes("HYBRID") &&
    !normalizedFuel.includes("HYBRID")
  ) {
    score -= 40;
  }

  // =========================================================
  // V12: MOTOR
  // La ficha CVS suele incluir 2.3L / 2.7L / 1.5L en Model.
  // Un motor contradictorio no puede quedar empatado.
  // =========================================================

  const candidateEngineLiters =
    parseCandidateEngineLiters(candidateModel);

  if (
    engineLiters !== null &&
    candidateEngineLiters !== null
  ) {
    const engineDifference = Math.abs(
      candidateEngineLiters - engineLiters
    );

    if (engineDifference <= 0.15) {
      score += 35;
    } else if (engineDifference >= 0.25) {
      score -= 65;
    }
  }

  // =========================================================
  // V12: PUERTAS
  // 4 puertas VIN contra 2DR es una contradicción objetiva.
  // =========================================================

  const candidateDoors =
    parseCandidateDoors(candidateModel);

  if (
    doors !== null &&
    candidateDoors !== null
  ) {
    if (candidateDoors === doors) {
      score += 35;
    } else {
      score -= 70;
    }
  }

  return score;
}


function normalizeDriveForSat(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized) return null;

  if (
    normalized.includes("AWD") ||
    normalized.includes("ALL WHEEL") ||
    normalized.includes("4WD") ||
    normalized.includes("4X4") ||
    normalized.includes("4 WHEEL")
  ) {
    return "4WD";
  }

  if (
    normalized.includes("FWD") ||
    normalized.includes("FRONT WHEEL") ||
    normalized.includes("2WD") ||
    normalized.includes("4X2") ||
    normalized.includes("RWD") ||
    normalized.includes("REAR WHEEL")
  ) {
    return "2WD";
  }

  return null;
}

function satLineDriveType(line: string | null | undefined) {
  const normalized = normalizeText(line);

  if (
    normalized.includes("AWD") ||
    normalized.includes("4WD") ||
    normalized.includes("4X4")
  ) {
    return "4WD";
  }

  if (
    normalized.includes("FWD") ||
    normalized.includes("2WD") ||
    normalized.includes("4X2") ||
    normalized.includes("RWD")
  ) {
    return "2WD";
  }

  return null;
}


function getControlledVinVariantHints(vin: string | null | undefined) {
  const cleanVin = String(vin || "").toUpperCase();

  // V19.3 · Reglas VDS controladas.
  // Estas reglas NO reemplazan NHTSA: aportan evidencia adicional cuando
  // el descriptor VIN identifica una familia de versión que NHTSA deja genérica.
  //
  // 5TDBKRFH = Toyota Highlander V6 AWD de familia LE / LE Plus
  // (documentación Toyota/ISO de identificación de modelo).
  const rules = [
    {
      prefix: "5TDBKRFH",
      make: "TOYOTA",
      model: "HIGHLANDER",
      variant_aliases: ["LE", "LE PLUS"],
      drive: "4WD",
      engine_cc: 3500,
      source: "CONTROLLED_VDS_RULE",
      source_note: "Toyota Highlander LE/LE Plus AWD V6 family",
    },
  ];

  const match = rules.find((rule) =>
    cleanVin.startsWith(rule.prefix)
  );

  return match || null;
}

function satLineMatchesAnyVariant(
  line: string | null | undefined,
  aliases: string[]
) {
  return (aliases || []).some((alias) =>
    containsExactNormalizedPhrase(line, alias)
  );
}

function calculateSatConfidence(
  candidate: any,
  vehicle: {
    vin?: string | null;
    model_year: number | null;
    model: string | null;
    trim: string | null;
    trim2?: string | null;
    series?: string | null;
    series2?: string | null;
    dimension_variant?: string | null;
    engine_cc: number | null;
    cylinders: number | null;
    doors: number | null;
    fuel_type: string | null;
    drive_type?: string | null;
  }
) {
  let score = 0;
  const breakdown: string[] = [];
  const warnings: string[] = [];
  let criticalConflict = false;

  const line = String(candidate?.line || "");
  const normalizedLine = normalizeText(line);
  const normalizedModel = normalizeText(vehicle.model);
  const nativeTrimAliases = nativeVehicleVariantAliases(vehicle);
  const dimensionTrimAliases = dimensionVehicleVariantAliases(vehicle);
  const trimAliases = vehicleVariantAliases(vehicle);

  // Año: 15 puntos
  if (
    vehicle.model_year !== null &&
    candidate?.model_year !== null &&
    Number(candidate.model_year) === Number(vehicle.model_year)
  ) {
    score += 15;
    breakdown.push("Año exacto +15");
  } else if (candidate?.is_rest_of_years) {
    score += 5;
    breakdown.push("Resto de años +5");
    warnings.push("La línea SAT corresponde a Resto de Años");
  } else if (
    vehicle.model_year !== null &&
    candidate?.model_year !== null
  ) {
    score -= 20;
    criticalConflict = true;
    warnings.push(
      `Año VIN ${vehicle.model_year} vs SAT ${candidate.model_year}`
    );
  }

  // Modelo: 20 puntos
  if (
    normalizedModel &&
    containsExactNormalizedPhrase(normalizedLine, normalizedModel)
  ) {
    score += 20;
    breakdown.push("Modelo exacto +20");
  } else if (normalizedModel) {
    score -= 30;
    criticalConflict = true;
    warnings.push("El modelo VIN no aparece en la línea SAT");
  }

  // =========================================================
  // V19.9 · VARIANT EVIDENCE PRIORITY
  // NHTSA Trim/Series válido = evidencia fuerte.
  // Variante inferida desde dimensiones = evidencia secundaria.
  // =========================================================
  if (nativeTrimAliases.length > 0) {
    const exactNativeTrim = nativeTrimAliases.some((alias) =>
      containsExactNormalizedPhrase(line, alias)
    );

    if (exactNativeTrim) {
      score += 45;
      breakdown.push("Versión/trim exacto confirmado por VIN +45");
    } else {
      score -= 30;
      warnings.push(
        `La versión SAT no coincide con la variante VIN ${nativeTrimAliases[0]}`
      );
    }
  } else if (dimensionTrimAliases.length > 0) {
    const exactDimensionTrim =
      dimensionTrimAliases.some((alias) =>
        containsExactNormalizedPhrase(line, alias)
      );

    if (exactDimensionTrim) {
      score += 32;
      breakdown.push("Versión respaldada por ficha dimensional +32");
    } else {
      score -= 16;
      warnings.push(
        `La ficha dimensional apunta a ${dimensionTrimAliases[0]} y esta línea SAT pertenece a otra variante`
      );
    }
  } else {
    warnings.push(
      "NHTSA no confirmó la versión/trim; requiere distinguir variantes SAT"
    );

    if (containsExactNormalizedPhrase(normalizedLine, "BASE")) {
      score -= 8;
      warnings.push(
        "BASE es una variante genérica y no fue confirmada por el VIN"
      );
    }
  }

  // V19.3 · Evidencia del descriptor VIN (VDS) controlado.
  // Si el VIN identifica una familia LE/LE Plus AWD y SAT sólo tiene una
  // línea "LE AWD", esa línea recibe una ventaja fuerte pero transparente.
  const vinHint = getControlledVinVariantHints(vehicle.vin);

  if (vinHint) {
    const sameMake =
      !candidate?.make ||
      normalizeText(candidate.make) === normalizeText(vinHint.make);

    const sameModel =
      containsExactNormalizedPhrase(candidate?.line, vinHint.model);

    if (sameMake && sameModel) {
      const candidateMatchesHint =
        satLineMatchesAnyVariant(
          candidate?.line,
          vinHint.variant_aliases
        );

      if (candidateMatchesHint) {
        score += 28;
        breakdown.push("Familia de versión confirmada por VDS +28");
      } else {
        score -= 18;
        warnings.push(
          `El descriptor VIN apunta a ${vinHint.variant_aliases.join("/")} y esta línea SAT pertenece a otra variante`
        );
      }

      const hintDrive = vinHint.drive;
      const candidateDrive = satLineDriveType(candidate?.line);

      if (
        hintDrive &&
        candidateDrive &&
        hintDrive === candidateDrive
      ) {
        score += 5;
        breakdown.push("Tracción confirmada por VDS +5");
      }

      if (
        vinHint.engine_cc &&
        candidate?.engine_cc !== null &&
        Math.abs(
          Number(candidate.engine_cc) -
          Number(vinHint.engine_cc)
        ) <= 100
      ) {
        score += 4;
        breakdown.push("Motor confirmado por VDS +4");
      }
    }
  }

  // Cilindraje: 15 puntos
  if (
    vehicle.engine_cc !== null &&
    candidate?.engine_cc !== null
  ) {
    const diff = Math.abs(
      Number(candidate.engine_cc) - Number(vehicle.engine_cc)
    );

    if (diff <= 100) {
      score += 15;
      breakdown.push("Cilindraje compatible +15");
    } else {
      score -= 35;
      criticalConflict = true;
      warnings.push(
        `Cilindraje VIN ${vehicle.engine_cc} cc vs SAT ${candidate.engine_cc} cc`
      );
    }
  }

  // Cilindros: 8 puntos
  if (
    vehicle.cylinders !== null &&
    candidate?.cylinders !== null
  ) {
    if (
      Number(candidate.cylinders) === Number(vehicle.cylinders)
    ) {
      score += 8;
      breakdown.push("Cilindros exactos +8");
    } else {
      score -= 25;
      criticalConflict = true;
      warnings.push(
        `Cilindros VIN ${vehicle.cylinders} vs SAT ${candidate.cylinders}`
      );
    }
  }

  // V39.7.9.9.3 · Combustible inteligente: 7 puntos
  const vinFuel = normalizeFuelForReview(vehicle.fuel_type);
  const satFuel = normalizeFuelForReview(candidate?.fuel_type);

  if (vinFuel && satFuel) {
    if (vinFuel === satFuel) {
      score += 7;
      breakdown.push("Combustible exacto +7");
    } else if (
      fuelsCompatibleForReview(
        vehicle.fuel_type,
        candidate?.fuel_type
      )
    ) {
      score += 5;
      breakdown.push("Combustible compatible Flex Fuel/Gasolina +5");
    } else {
      score -= 25;
      criticalConflict = true;
      warnings.push("Combustible VIN y SAT no coinciden");
    }
  }

  // Tracción: 7 puntos
  const vinDrive = normalizeDriveForSat(vehicle.drive_type);
  const candidateDrive = satLineDriveType(line);

  if (vinDrive && candidateDrive) {
    if (vinDrive === candidateDrive) {
      score += 7;
      breakdown.push("Tracción compatible +7");
    } else {
      score -= 25;
      criticalConflict = true;
      warnings.push(
        `Tracción VIN ${vinDrive} vs línea SAT ${candidateDrive}`
      );
    }
  }

  // Puertas: 3 puntos
  if (
    vehicle.doors !== null &&
    candidate?.doors !== null
  ) {
    if (Number(candidate.doors) === Number(vehicle.doors)) {
      score += 3;
      breakdown.push("Puertas exactas +3");
    } else {
      warnings.push(
        `Puertas VIN ${vehicle.doors} vs SAT ${candidate.doors}`
      );
    }
  }

  // El score es una CONFIANZA real sobre una escala fija de 100.
  // Datos ausentes no suman puntos automáticamente.
  let confidence = Math.max(
    0,
    Math.min(100, Math.round(score))
  );

  // Si NHTSA no confirmó el trim, ninguna variante puede presentarse
  // como una coincidencia de alta confianza.
  const nativeTrimUnknown =
    nativeTrimAliases.length === 0;

  if (nativeTrimUnknown) {
    const vinHint = getControlledVinVariantHints(vehicle.vin);

    // Una variante de dimensiones puede elevar la confianza, pero por sí sola
    // no debe presentarse como 100% VIN-confirmado.
    if (!vinHint && dimensionTrimAliases.length === 0) {
      confidence = Math.min(confidence, 79);
    } else if (!vinHint && dimensionTrimAliases.length > 0) {
      confidence = Math.min(confidence, 92);
    }
  }

  return {
    confidence,
    raw_score: score,
    has_conflict: criticalConflict,
    warnings,
    breakdown,
    trim_confirmed:
      nativeTrimAliases.length > 0 &&
      nativeTrimAliases.some((alias) =>
        containsExactNormalizedPhrase(line, alias)
      ),
    dimension_variant_confirmed:
      dimensionTrimAliases.length > 0 &&
      dimensionTrimAliases.some((alias) =>
        containsExactNormalizedPhrase(line, alias)
      ),
    trim_available:
      nativeTrimAliases.length > 0 ||
      dimensionTrimAliases.length > 0,
    variant_source:
      nativeTrimAliases.length > 0
        ? "NHTSA"
        : dimensionTrimAliases.length > 0
          ? "DIMENSIONS"
          : null,
  };
}

function buildSatReviewCandidate(
  item: any,
  vehicle: {
    vin?: string | null;
    model_year: number | null;
    model: string | null;
    trim: string | null;
    trim2?: string | null;
    series?: string | null;
    series2?: string | null;
    dimension_variant?: string | null;
    engine_cc: number | null;
    cylinders: number | null;
    doors: number | null;
    fuel_type: string | null;
    drive_type?: string | null;
  }
) {
  const confidenceResult =
    calculateSatConfidence(item, vehicle);

  return {
    sat_vehicle_id: item.id ?? item.sat_vehicle_id,
    line: item.line,
    match_score: confidenceResult.confidence,
    confidence_label: "Confianza",
    raw_match_score:
      item.match_score !== undefined
        ? Number(item.match_score)
        : null,
    taxable_value: item.taxable_value,
    vehicle_type: item.vehicle_type,
    engine_cc: item.engine_cc,
    cylinders: item.cylinders,
    doors: item.doors,
    fuel_type: item.fuel_type,
    seats: item.seats,
    model_year: item.model_year,
    is_rest_of_years: item.is_rest_of_years,
    has_conflict: confidenceResult.has_conflict,
    selectable: !confidenceResult.has_conflict,
    warnings: confidenceResult.warnings,
    score_breakdown: confidenceResult.breakdown,
    trim_confirmed: confidenceResult.trim_confirmed,
    dimension_variant_confirmed:
      confidenceResult.dimension_variant_confirmed,
    trim_available: confidenceResult.trim_available,
    variant_source: confidenceResult.variant_source,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const requestBody = await req.json();
    const {
      vin,
      calculation_mode,
      invoice_value_usd,
    } = requestBody || {};

    const calculationMode =
      String(calculation_mode || "SAT").toUpperCase() === "IMPORTER"
        ? "IMPORTER"
        : "SAT";

    const invoiceValueUsd =
      calculationMode === "IMPORTER"
        ? Number(invoice_value_usd)
        : null;

    const cleanVin = String(vin || "")
      .trim()
      .toUpperCase();

    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "VIN inválido. Debe contener 17 caracteres válidos.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (
      calculationMode === "IMPORTER" &&
      (!Number.isFinite(invoiceValueUsd) || Number(invoiceValueUsd) <= 0)
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "INVALID_INVOICE_VALUE",
          error: "Ingresá un valor de factura válido en USD.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!accessToken) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "AUTH_REQUIRED",
          error: "Debés iniciar sesión para utilizar el cotizador.",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Faltan variables internas de Supabase."
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // =========================================================
    // V18 · CONTROL DE ACCESO / 3 CONSULTAS GRATUITAS
    // =========================================================

    const {
      data: userData,
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    const currentUser = userData?.user || null;

    console.log("=== DECODE VIN V18 ACCESS DEBUG ===");
    console.log("User error:", userError?.message || null);
    console.log("Current user id:", currentUser?.id || null);
    console.log("Is anonymous:", currentUser?.is_anonymous ?? null);
    console.log("User email:", currentUser?.email || null);

    if (userError || !currentUser?.id) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "AUTH_REQUIRED",
          error: "La sesión no es válida o expiró.",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let importerExchangeRate: number | null = null;
    let importerInvoiceTaxableValueGtq: number | null = null;
    let importerExchangeRateSource = "BANGUAT";
    let importerExchangeRateDate: string | null = null;

    if (calculationMode === "IMPORTER") {
      // V27.1 · Fuente oficial Banco de Guatemala.
      // Usamos TipoCambioDiaString vía HTTPS y dejamos app_settings
      // únicamente como respaldo de emergencia.
      try {
        const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <TipoCambioDiaString xmlns="http://www.banguat.gob.gt/variables/ws/" />
  </soap:Body>
</soap:Envelope>`;

        const banguatResponse = await fetch(
          "https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx",
          {
            method: "POST",
            headers: {
              "Content-Type": "text/xml; charset=utf-8",
              "SOAPAction":
                '"http://www.banguat.gob.gt/variables/ws/TipoCambioDiaString"',
            },
            body: soapBody,
          }
        );

        if (!banguatResponse.ok) {
          throw new Error(`BANGUAT_HTTP_${banguatResponse.status}`);
        }

        const xml = await banguatResponse.text();

        // V37.4.2 · Banguat devuelve XML anidado/escapado.
        // No tomamos "el primer número": podría ser un id/variable (=1).
        const decodeXmlEntities = (value: string) =>
          String(value || "")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&amp;/gi, "&");

        const resultMatch = xml.match(
          /<TipoCambioDiaStringResult>([\s\S]*?)<\/TipoCambioDiaStringResult>/i
        );

        const rawResult = decodeXmlEntities(
          String(resultMatch?.[1] || "").trim()
        );

        const preferredPatterns = [
          /<referencia>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/referencia>/i,
          /<tipo_cambio>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/tipo_cambio>/i,
          /<tipocambio>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/tipocambio>/i,
          /<venta>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/venta>/i,
        ];

        let parsedRate: number | null = null;

        for (const pattern of preferredPatterns) {
          const match = rawResult.match(pattern);
          const candidate = Number(match?.[1]);

          if (
            Number.isFinite(candidate) &&
            candidate >= 5 &&
            candidate <= 15
          ) {
            parsedRate = candidate;
            break;
          }
        }

        if (parsedRate === null) {
          const numericCandidates = Array.from(
            rawResult.matchAll(/(?:^|[^0-9])([0-9]+(?:\.[0-9]+)?)(?=$|[^0-9])/g)
          )
            .map((item) => Number(item[1]))
            .filter(
              (candidate) =>
                Number.isFinite(candidate) &&
                candidate >= 5 &&
                candidate <= 15
            );

          parsedRate = numericCandidates[0] ?? null;
        }

        importerExchangeRate = parsedRate;

        if (
          !Number.isFinite(importerExchangeRate) ||
          Number(importerExchangeRate) < 5 ||
          Number(importerExchangeRate) > 15
        ) {
          throw new Error("BANGUAT_INVALID_RATE");
        }

        importerExchangeRateDate =
          new Date().toISOString().slice(0, 10);

        // Cache del último valor oficial exitoso.
        await supabase
          .from("app_settings")
          .upsert(
            [
              {
                setting_key: "importer_exchange_rate",
                setting_value:
                  Number(importerExchangeRate).toFixed(5),
              },
              {
                setting_key: "importer_exchange_rate_source",
                setting_value: "BANGUAT",
              },
              {
                setting_key: "importer_exchange_rate_updated_at",
                setting_value: new Date().toISOString(),
              },
            ],
            { onConflict: "setting_key" }
          );
      } catch (banguatError) {
        console.error(
          "BANGUAT EXCHANGE RATE ERROR:",
          banguatError
        );

        const { data: fallbackSetting } =
          await supabase
            .from("app_settings")
            .select("setting_value")
            .eq("setting_key", "importer_exchange_rate")
            .maybeSingle();

        importerExchangeRate =
          Number(fallbackSetting?.setting_value);

        importerExchangeRateSource =
          "CACHED_FALLBACK";

        if (
          !Number.isFinite(importerExchangeRate) ||
          Number(importerExchangeRate) <= 0
        ) {
          return new Response(
            JSON.stringify({
              success: false,
              code: "BANGUAT_RATE_UNAVAILABLE",
              error:
                "No fue posible obtener el tipo de cambio oficial del Banco de Guatemala y todavía no existe un valor de respaldo.",
            }),
            {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
      }
    }

    // =========================================================
    // V39.9.18.2 · ACCESO VIN PARA USUARIOS INTERNOS
    // =========================================================
    // Los usuarios internos activos (ADMIN / OPERADOR) pertenecen al CRM
    // y no deben consumir las 3 consultas gratuitas del cotizador público.
    const {
      data: internalProfile,
      error: internalProfileError,
    } = await supabase
      .from("profiles")
      .select("id, role, job_title, active, organization_id")
      .eq("id", currentUser.id)
      .eq("active", true)
      .in("role", ["ADMIN", "OPERADOR"])
      .maybeSingle();

    if (internalProfileError) {
      console.error(
        "INTERNAL VIN ACCESS ERROR:",
        internalProfileError
      );
    }

    // =========================================================
    // V39.6.21.3 · BENEFICIO PARA CLIENTES DEL PORTAL DE OFICINA
    // =========================================================
    // Un cliente/importador que trabaja activamente con una oficina NO consume
    // las 3 cotizaciones gratuitas del producto público. Su acceso al cotizador
    // del Portal está incluido como beneficio de la gestión con la oficina.
    //
    // Importer PRO / cotizador público mantienen intactas sus reglas de cuota.
    const {
      data: officePortalAccess,
      error: officePortalAccessError,
    } = await supabase
      .from("office_portal_clients")
      .select(`
        id,
        organization_id,
        active,
        organizations!inner (
          id,
          active
        )
      `)
      .eq("user_id", currentUser.id)
      .eq("active", true)
      .eq("organizations.active", true)
      .limit(1)
      .maybeSingle();

    if (officePortalAccessError) {
      console.error(
        "OFFICE PORTAL QUOTE ACCESS ERROR:",
        officePortalAccessError
      );
    }

    let accessInfo: any = null;
    let accessError: any = null;

        if (internalProfile?.id) {
      accessInfo = {
        allowed: true,
        reason: "INTERNAL_USER",
        used_count: null,
        remaining_count: null,
        plan_status: "INTERNAL_INCLUDED",
        organization_id: internalProfile.organization_id,
        role: internalProfile.role,
        job_title: internalProfile.job_title,
      };

      console.log(
        "Cotizador incluido para usuario interno:",
        accessInfo
      );
    } else if (officePortalAccess?.id) {
      accessInfo = {
        allowed: true,
        reason: "OFFICE_PORTAL_CLIENT",
        used_count: null,
        remaining_count: null,
        plan_status: "OFFICE_INCLUDED",
        organization_id: officePortalAccess.organization_id,
      };

      console.log(
        "Cotizador incluido por Portal de Oficina:",
        accessInfo
      );
    } else {
      const accessResult = await supabase.rpc(
        "consume_quote_access",
        {
          p_user_id: currentUser.id,
        }
      );

      accessError = accessResult.error;

      if (accessError) {
        throw new Error(
          `No fue posible validar el acceso al cotizador: ${accessError.message}`
        );
      }

      accessInfo = Array.isArray(accessResult.data)
        ? accessResult.data[0]
        : accessResult.data;

      console.log(
        "consume_quote_access result:",
        accessInfo || null
      );
    }

    if (!accessInfo?.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          code:
            accessInfo?.reason === "INACTIVE"
              ? "ACCOUNT_INACTIVE"
              : "SUBSCRIPTION_REQUIRED",
          error:
            accessInfo?.reason === "INACTIVE"
              ? "La cuenta está desactivada."
              : "Utilizaste tus 3 cotizaciones gratuitas. Activá una suscripción mensual para continuar.",
          access: accessInfo || null,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // =========================================================
    // 1. DECODIFICAR VIN
    // =========================================================

    const { vehicle, cachedDecode } = await loadNhtsaVin(supabase, cleanVin);

    const parsedVehicle = {
      vin: cleanVin,

      model_year:
        vehicle.ModelYear
          ? Number(vehicle.ModelYear)
          : null,

      make:
        vehicle.Make || null,

      model:
        vehicle.Model || null,

      trim:
        vehicle.Trim || null,

      trim2:
        vehicle.Trim2 || null,

      series:
        vehicle.Series || null,

      series2:
        vehicle.Series2 || null,

      // V19.9 · Se completa después de resolver la ficha dimensional.
      dimension_variant:
        null as string | null,

      vehicle_type:
        vehicle.VehicleType || null,

      body_class:
        vehicle.BodyClass || null,

      engine_cc:
        vehicle.DisplacementCC
          ? Math.round(
              Number(vehicle.DisplacementCC)
            )
          : null,

      engine_liters:
        vehicle.DisplacementL
          ? Number(vehicle.DisplacementL)
          : null,

      cylinders:
        vehicle.EngineCylinders
          ? Number(vehicle.EngineCylinders)
          : null,

      fuel_type:
        (
          vehicle.FuelTypeSecondary &&
          (
            normalizeText(vehicle.FuelTypeSecondary).includes("E85") ||
            normalizeText(vehicle.FuelTypeSecondary).includes("ETHANOL") ||
            normalizeText(vehicle.FuelTypeSecondary).includes("FLEX")
          )
        )
          ? `${vehicle.FuelTypePrimary || ""} / ${vehicle.FuelTypeSecondary}`.trim()
          : (vehicle.FuelTypePrimary || null),

      drive_type:
        vehicle.DriveType || null,

      transmission_style:
        vehicle.TransmissionStyle || null,

      transmission_speeds:
        vehicle.TransmissionSpeeds
          ? Number(vehicle.TransmissionSpeeds)
          : null,

      doors:
        vehicle.Doors
          ? Number(vehicle.Doors)
          : null,

      manufacturer:
        vehicle.Manufacturer || null,

      plant_country:
        vehicle.PlantCountry || null,

      error_code:
        vehicle.ErrorCode || null,

      error_text:
        vehicle.ErrorText || null,

      source:
        "NHTSA_VPIC",

      raw_response:
        vehicle,

      decoded_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),
    };

    // =========================================================
    // 2. DIMENSIONES NHTSA CVS
    // V17: NHTSA CVS + aliases controlados + catálogo verificado
    // =========================================================

    let dimensions: any = null;
    let dimensionCandidates: any[] = [];
    let dimensionSearchAttempts: any[] = [];

    if (
      parsedVehicle.model_year &&
      parsedVehicle.make &&
      parsedVehicle.model
    ) {
      const normalizedDimensionModel =
        normalizeText(parsedVehicle.model);

      // Aliases CONTROLADOS. No hacemos transformaciones genéricas
      // que puedan mezclar familias distintas (ej.: BRONCO SPORT != BRONCO).
      const controlledDimensionAliases: Record<string, string[]> = {
        "CAPTIVA SPORT": ["CAPTIVA"],
      };

      const dimensionModelQueries = Array.from(
        new Set([
          parsedVehicle.model,
          ...(controlledDimensionAliases[normalizedDimensionModel] || []),
        ])
      ).filter(Boolean);

      for (const modelQuery of dimensionModelQueries) {
        const specsUrl =
          "https://vpic.nhtsa.dot.gov/api/vehicles/" +
          "GetCanadianVehicleSpecifications/" +
          `?year=${encodeURIComponent(parsedVehicle.model_year)}` +
          `&make=${encodeURIComponent(parsedVehicle.make)}` +
          `&model=${encodeURIComponent(modelQuery)}` +
          "&units=US&format=json";

        const specsResponse =
          await fetch(specsUrl);

        if (!specsResponse.ok) {
          dimensionSearchAttempts.push({
            model_query: modelQuery,
            http_status: specsResponse.status,
            result_count: 0,
            accepted: false,
          });
          continue;
        }

        const specsData =
          await specsResponse.json();

        const rows =
          specsData?.Results || [];

        dimensionSearchAttempts.push({
          model_query: modelQuery,
          http_status: specsResponse.status,
          result_count: rows.length,
          accepted: rows.length > 0,
        });

        if (rows.length === 0) {
          continue;
        }

        const scoredCandidates = rows
          .map((row: any) => {
            const specs =
              specsArrayToObject(
                row.Specs
              );

            const score =
              scoreDimensionCandidate(
                specs.Model || "",
                parsedVehicle.model || "",
                parsedVehicle.trim,
                parsedVehicle.series,
                parsedVehicle.body_class,
                vehicle.BodyCabType || null,
                parsedVehicle.drive_type,
                parsedVehicle.fuel_type,
                parsedVehicle.engine_liters,
                parsedVehicle.doors
              );

            return {
              model:
                specs.Model || null,
              score,
              specs,
              search_model_query:
                modelQuery,
            };
          })
          .sort(
            (a: any, b: any) =>
              b.score - a.score
          );

        // La primera consulta con resultados se acepta como universo de
        // candidatos. El scorer existente sigue decidiendo la variante.
        dimensionCandidates =
          scoredCandidates;

        break;
      }

      const bestCandidate =
        dimensionCandidates[0] || null;

      const bestSpecs =
        bestCandidate?.specs || null;


      if (
        bestSpecs &&
        bestSpecs.OL
      ) {
        dimensions = {
          dimension_model:
            bestSpecs.Model || null,

          dimension_match_score:
            bestCandidate.score,

          length_inches:
            Number(bestSpecs.OL),

          width_inches:
            bestSpecs.OW
              ? Number(bestSpecs.OW)
              : null,

          height_inches:
            bestSpecs.OH
              ? Number(bestSpecs.OH)
              : null,

          wheelbase_inches:
            bestSpecs.WB
              ? Number(bestSpecs.WB)
              : null,

          curb_weight_lb:
            bestSpecs.CW
              ? Number(bestSpecs.CW)
              : null,

          dimension_source:
            bestCandidate?.search_model_query &&
            normalizeText(bestCandidate.search_model_query) !==
              normalizeText(parsedVehicle.model)
              ? "NHTSA_CVS_ALIAS"
              : "NHTSA_CVS",

          dimension_search_model:
            bestCandidate?.search_model_query ||
            parsedVehicle.model,

          dimensions_updated_at:
            new Date().toISOString(),
        };
      }
    }

    // =========================================================
    // 2B. CATÁLOGO PROPIO DE DIMENSIONES VERIFICADAS
    // V17: fallback después de NHTSA CVS y antes de revisión manual.
    // =========================================================

    if (
      !dimensions &&
      parsedVehicle.model_year &&
      parsedVehicle.make &&
      parsedVehicle.model
    ) {
      const makeKey = normalizeText(parsedVehicle.make);
      const modelKey = normalizeText(parsedVehicle.model);
      const year = Number(parsedVehicle.model_year);

      const { data: catalogRows, error: catalogError } =
        await supabase
          .from("vehicle_dimension_catalog")
          .select("*")
          .eq("make_key", makeKey)
          .eq("model_key", modelKey)
          .lte("model_year_from", year)
          .gte("model_year_to", year)
          .eq("verified", true)
          .order("confidence_score", { ascending: false })
          .limit(25);

      dimensionSearchAttempts.push({
        source: "VERIFIED_CATALOG",
        model_query: parsedVehicle.model,
        http_status: catalogError ? null : 200,
        result_count: catalogRows?.length || 0,
        accepted: !catalogError && (catalogRows?.length || 0) > 0,
        error: catalogError?.message || null,
      });

      if (!catalogError && catalogRows?.length) {
        const scoredCatalog = catalogRows
          .map((row: any) => {
            let score = Number(row.confidence_score || 70);

            const vinTrim = normalizeText(parsedVehicle.trim || "");
            const rowTrim = normalizeText(row.trim || "");
            const vinDrive = normalizeText(parsedVehicle.drive_type || "");
            const rowDrive = normalizeText(row.drive_type || "");
            const vinEngine = Number(parsedVehicle.engine_liters || 0);
            const rowEngine = Number(row.engine_liters || 0);
            const vinDoors = Number(parsedVehicle.doors || 0);
            const rowDoors = Number(row.doors || 0);

            if (rowTrim && vinTrim) {
              if (rowTrim === vinTrim) score += 20;
              else if (vinTrim.includes(rowTrim) || rowTrim.includes(vinTrim)) score += 10;
              else score -= 12;
            }

            if (rowDrive && vinDrive) {
              if (vinDrive.includes(rowDrive) || rowDrive.includes(vinDrive)) score += 10;
              else score -= 10;
            }

            if (rowEngine && vinEngine) {
              const diff = Math.abs(rowEngine - vinEngine);
              if (diff <= 0.1) score += 15;
              else if (diff <= 0.3) score += 5;
              else score -= 20;
            }

            if (rowDoors && vinDoors) {
              if (rowDoors === vinDoors) score += 5;
              else score -= 10;
            }

            return {
              model: row.model,
              score,
              search_model_query: row.model,
              catalog_id: row.id,
              catalog_source: row.source,
              catalog_source_url: row.source_url,
              specs: {
                Model: row.model,
                OL: row.length_inches,
                OW: row.width_inches,
                OH: row.height_inches,
                WB: row.wheelbase_inches,
                CW: row.curb_weight_lb,
              },
            };
          })
          .sort((a: any, b: any) => b.score - a.score);

        const bestCatalog = scoredCatalog[0] || null;
        const secondCatalog = scoredCatalog[1] || null;

        // Solo automatizamos una ficha verificada con score suficiente y
        // sin un empate cercano que pueda cambiar la categoría de flete.
        if (
          bestCatalog &&
          bestCatalog.specs?.OL &&
          bestCatalog.score >= 70 &&
          (!secondCatalog || bestCatalog.score - secondCatalog.score >= 5)
        ) {
          dimensionCandidates = scoredCatalog;
          dimensions = {
            dimension_model: bestCatalog.model,
            dimension_match_score: bestCatalog.score,
            length_inches: Number(bestCatalog.specs.OL),
            width_inches: bestCatalog.specs.OW ? Number(bestCatalog.specs.OW) : null,
            height_inches: bestCatalog.specs.OH ? Number(bestCatalog.specs.OH) : null,
            wheelbase_inches: bestCatalog.specs.WB ? Number(bestCatalog.specs.WB) : null,
            curb_weight_lb: bestCatalog.specs.CW ? Number(bestCatalog.specs.CW) : null,
            dimension_source: "VERIFIED_CATALOG",
            dimension_search_model: bestCatalog.model,
            dimension_catalog_id: bestCatalog.catalog_id,
            dimension_reference_source: bestCatalog.catalog_source || null,
            dimension_reference_url: bestCatalog.catalog_source_url || null,
            dimensions_updated_at: new Date().toISOString(),
          };
        }
      }
    }

    // =========================================================
    // V19.9 · DIMENSION VARIANT RESOLVER
    // Cuando NHTSA no entrega Trim/Trim2/Series útil, la ficha dimensional
    // puede aportar una versión secundaria (ej. OUTLANDER ... AWD XLS).
    // Nunca reemplaza un trim nativo de NHTSA.
    // =========================================================
    const nativeVariantAliasesBeforeSat =
      nativeVehicleVariantAliases(parsedVehicle);

    let dimensionVariant: string | null = null;

    if (
      nativeVariantAliasesBeforeSat.length === 0 &&
      dimensions?.dimension_model
    ) {
      dimensionVariant = extractDimensionVariant(
        dimensions.dimension_model,
        parsedVehicle.model
      );

      if (dimensionVariant) {
        parsedVehicle.dimension_variant =
          dimensionVariant;
      }
    }

    // =========================================================
    // 3. GUARDAR VIN
    // =========================================================

    // V19.2.1 · Trim2 y Series2 se usan sólo durante el análisis.
    // No los enviamos a vin_decodes porque la tabla actual no tiene
    // necesariamente esas columnas.
    const {
      trim2: _analysisTrim2,
      series2: _analysisSeries2,
      dimension_variant: _analysisDimensionVariant,
      ...persistedVehicle
    } = parsedVehicle;

    const vehicleToSave = {
      ...persistedVehicle,

      ...(dimensions
        ? {
            length_inches:
              dimensions.length_inches,

            width_inches:
              dimensions.width_inches,

            height_inches:
              dimensions.height_inches,

            wheelbase_inches:
              dimensions.wheelbase_inches,

            curb_weight_lb:
              dimensions.curb_weight_lb,

            dimension_model:
              dimensions.dimension_model,

            dimension_source:
              dimensions.dimension_source,

            dimensions_updated_at:
              dimensions.dimensions_updated_at,
          }
        : {}),
    };

    let savedDecode = cachedDecode;
    if (!savedDecode) {
      const { data, error: saveError } = await supabase
        .from("vin_decodes")
        .upsert(vehicleToSave, { onConflict: "vin" })
        .select()
        .single();
      if (saveError) throw saveError;
      savedDecode = data;
    }

    // =========================================================
    // 4. MATCH SAT
    // V39.6.19.1 · CATÁLOGO SAT ACTIVO DINÁMICO
    // La versión SAT ya no queda fija en código.
    // =========================================================

    const {
      data: activeSatCatalog,
      error: activeSatCatalogError,
    } = await supabase
      .from("sat_catalog_versions")
      .select("id, table_year")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (activeSatCatalogError) {
      throw activeSatCatalogError;
    }

    if (!activeSatCatalog?.id) {
      throw new Error(
        "No existe una versión activa de la Tabla de Valores SAT."
      );
    }

    const activeSatCatalogVersionId =
      Number(activeSatCatalog.id);

    const activeSatTableYear =
      Number(activeSatCatalog.table_year || 0) || null;

    let satMatches: any[] = [];

    if (
      parsedVehicle.model_year &&
      parsedVehicle.make &&
      parsedVehicle.model
    ) {
      const {
        data,
        error,
      } =
        await supabase.rpc(
          "find_sat_vehicle_matches",
          {
            p_model_year:
              parsedVehicle.model_year,

            p_make:
              parsedVehicle.make,

            p_model:
              parsedVehicle.model,

            // V39.7.9.8+ · dimension_variant NO se envía como trim VIN.
            p_trim:
              nativeVehicleVariantAliases(parsedVehicle)[0] || null,

            p_series:
              parsedVehicle.series,

            p_engine_cc:
              parsedVehicle.engine_cc,

            p_cylinders:
              parsedVehicle.cylinders,

            p_doors:
              parsedVehicle.doors,

            p_fuel_type:
              parsedVehicle.fuel_type,

            p_seats:
              vehicle.Seats
                ? Number(vehicle.Seats)
                : null,

            p_drive_type:
              parsedVehicle.drive_type,

            p_sat_catalog_version_id: activeSatCatalogVersionId,

            p_limit: 20,
          }
        );

      if (error) {
        throw error;
      }

      // V19 · Recalculamos la confianza SAT en una escala fija de 0–100.
      // El RPC sigue trayendo el universo candidato, pero ya no permitimos que
      // varias variantes diferentes aparezcan como "100%" sólo porque comparten
      // año, modelo, motor y combustible.
      satMatches = (data || [])
        .map((item: any) => {
          const confidenceResult =
            calculateSatConfidence(
              item,
              parsedVehicle
            );

          return {
            ...item,
            rpc_match_score:
              item.match_score !== undefined
                ? Number(item.match_score)
                : null,
            match_score:
              confidenceResult.confidence,
            confidence_breakdown:
              confidenceResult.breakdown,
            confidence_warnings:
              confidenceResult.warnings,
            trim_confirmed:
              confidenceResult.trim_confirmed,
            trim_available:
              confidenceResult.trim_available,
            dimension_variant_confirmed:
              confidenceResult.dimension_variant_confirmed,
            variant_source:
              confidenceResult.variant_source,
            // V39.7.9.9.3 · El motor actual recalcula compatibilidad.
            // Un conflicto legado exclusivamente de combustible no bloquea
            // FFV/Gasolina cuando la regla nueva los considera compatibles.
            has_conflict:
              confidenceResult.has_conflict ||
              (
                Boolean(item.has_conflict) &&
                !(
                  fuelsCompatibleForReview(
                    parsedVehicle.fuel_type,
                    item.fuel_type
                  ) &&
                  Array.isArray(item.warnings) &&
                  item.warnings.length > 0 &&
                  item.warnings.every((warning: any) =>
                    String(warning || "")
                      .toUpperCase()
                      .includes("COMBUSTIBLE")
                  )
                )
              ),
          };
        })
        .sort((a: any, b: any) => {
          if (a.has_conflict !== b.has_conflict) {
            return a.has_conflict ? 1 : -1;
          }

          return (
            Number(b.match_score || 0) -
            Number(a.match_score || 0)
          );
        });
    }

    const bestMatch =
      satMatches[0] || null;

    // =========================================================
    // 5. RESOLUCIÓN MANUAL SAT
    // =========================================================

    let manualSatResolution: any = null;

    const {
      data: satResolutionData,
      error: satResolutionError,
    } =
      await supabase
        .from("vin_manual_resolutions")
        .select(`
          id,
          vin,
          sat_vehicle_id,
          resolution_type,
          manual_line,
          manual_vehicle_type,
          manual_taxable_value,
          manual_iprima_rate,
          manual_iva_rate,
          manual_plates_gtq,
          verification_source,
          notes,
          active,
          created_at,
          sat_vehicle_values (
            id,
            sat_catalog_version_id,
            vehicle_type,
            make,
            line,
            engine_cc,
            cylinders,
            doors,
            fuel_type,
            seats,
            model_year,
            is_rest_of_years,
            taxable_value
          )
        `)
        .eq("vin", cleanVin)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

    if (satResolutionError) {
      throw satResolutionError;
    }

    if (satResolutionData) {
      manualSatResolution =
        satResolutionData;
    }

    // =========================================================
    // V39.6.19.1 · MIGRACIÓN SEGURA DE RESOLUCIÓN APRENDIDA
    //
    // Si una resolución manual normal apunta a una fila de una versión SAT
    // anterior, buscamos la MISMA combinación de condicionantes en la tabla
    // actualmente activa. De esta manera se conserva el aprendizaje del VIN,
    // pero nunca se reutiliza silenciosamente el valor monetario del año viejo.
    //
    // Si la línea ya no existe en el catálogo activo, descartamos únicamente
    // esa resolución aprendida para esta consulta y dejamos que el motor SAT
    // normal resuelva el VIN con los candidatos de la nueva versión.
    // =========================================================

    if (
      manualSatResolution &&
      manualSatResolution.resolution_type !== "SAT_EXCEPTIONAL" &&
      manualSatResolution.sat_vehicle_values &&
      Number(
        manualSatResolution
          .sat_vehicle_values
          .sat_catalog_version_id
      ) !== activeSatCatalogVersionId
    ) {
      const previousResolved =
        manualSatResolution.sat_vehicle_values;

      let activeResolutionQuery =
        supabase
          .from("sat_vehicle_values")
          .select(`
            id,
            sat_catalog_version_id,
            vehicle_type,
            make,
            line,
            engine_cc,
            cylinders,
            doors,
            fuel_type,
            seats,
            model_year,
            is_rest_of_years,
            taxable_value
          `)
          .eq(
            "sat_catalog_version_id",
            activeSatCatalogVersionId
          )
          .eq(
            "vehicle_type",
            previousResolved.vehicle_type
          )
          .eq(
            "make",
            previousResolved.make
          )
          .eq(
            "line",
            previousResolved.line
          )
          .eq(
            "engine_cc",
            previousResolved.engine_cc
          )
          .eq(
            "cylinders",
            previousResolved.cylinders
          )
          .eq(
            "doors",
            previousResolved.doors
          )
          .eq(
            "fuel_type",
            previousResolved.fuel_type
          )
          .eq(
            "seats",
            previousResolved.seats
          )
          .eq(
            "is_rest_of_years",
            Boolean(
              previousResolved.is_rest_of_years
            )
          );

      if (previousResolved.model_year === null) {
        activeResolutionQuery =
          activeResolutionQuery.is(
            "model_year",
            null
          );
      } else {
        activeResolutionQuery =
          activeResolutionQuery.eq(
            "model_year",
            previousResolved.model_year
          );
      }

      const {
        data: activeResolvedRow,
        error: activeResolvedRowError,
      } =
        await activeResolutionQuery
          .limit(1)
          .maybeSingle();

      if (activeResolvedRowError) {
        throw activeResolvedRowError;
      }

      if (activeResolvedRow) {
        manualSatResolution = {
          ...manualSatResolution,
          sat_vehicle_id:
            activeResolvedRow.id,
          sat_vehicle_values:
            activeResolvedRow,
          migrated_to_active_sat_version:
            true,
          previous_sat_catalog_version_id:
            previousResolved
              .sat_catalog_version_id,
          active_sat_catalog_version_id:
            activeSatCatalogVersionId,
        };
      } else {
        manualSatResolution = null;
      }
    }

    // =========================================================
    // 6. ESTADO SAT
    // =========================================================

    let satMatchStatus =
      "NO_MATCH";

    let satSelectedMatch: any =
      bestMatch;

    let satAmbiguousOptions: any[] = [];
    let satReviewOptions: any[] = [];

    if (
      manualSatResolution &&
      manualSatResolution.resolution_type === "SAT_EXCEPTIONAL" &&
      manualSatResolution.manual_taxable_value !== null
    ) {
      satSelectedMatch = {
        sat_vehicle_id: null,
        vehicle_type: manualSatResolution.manual_vehicle_type || null,
        make: parsedVehicle.make,
        line: manualSatResolution.manual_line || "RESOLUCIÓN SAT EXCEPCIONAL",
        engine_cc: parsedVehicle.engine_cc,
        cylinders: parsedVehicle.cylinders,
        doors: parsedVehicle.doors,
        fuel_type: parsedVehicle.fuel_type,
        seats: vehicle.Seats ? Number(vehicle.Seats) : null,
        model_year: parsedVehicle.model_year,
        is_rest_of_years: false,
        taxable_value: Number(manualSatResolution.manual_taxable_value),
        match_score: null,
        has_conflict: false,
        warnings: [
          "Valor SAT confirmado manualmente por operador",
        ],
        confidence: "EXCEPTIONAL_RESOLUTION",
      };

      satMatchStatus = "EXCEPTIONAL_RESOLUTION";
    }

    else if (
      manualSatResolution &&
      manualSatResolution.sat_vehicle_values
    ) {
      const resolved =
        manualSatResolution
          .sat_vehicle_values;

      satSelectedMatch = {
        sat_vehicle_id:
          resolved.id,

        vehicle_type:
          resolved.vehicle_type,

        make:
          resolved.make,

        line:
          resolved.line,

        engine_cc:
          resolved.engine_cc,

        cylinders:
          resolved.cylinders,

        doors:
          resolved.doors,

        fuel_type:
          resolved.fuel_type,

        seats:
          resolved.seats,

        model_year:
          resolved.model_year,

        is_rest_of_years:
          resolved.is_rest_of_years,

        taxable_value:
          resolved.taxable_value,

        match_score:
          null,

        has_conflict:
          false,

        warnings: [],

        confidence:
          "MANUAL_RESOLUTION",
      };

      satMatchStatus =
        "MANUAL_RESOLUTION";
    }

    else if (bestMatch) {
      // V15: antes de declarar una ambigüedad técnica, intentamos resolver
      // la variante con el trim que NHTSA sí conoce. Ejemplo: 2LS -> LS.
      // El desempate sólo se acepta entre candidatos mecánicamente compatibles.
      const trimResolvedCandidate =
        resolveSatVariantByTrim(
          parsedVehicle,
          satMatches
        );

      if (trimResolvedCandidate) {
        satMatchStatus =
          "AUTOMATIC_MATCH";

        satSelectedMatch = {
          ...trimResolvedCandidate,
          confidence: "AUTOMATIC_MATCH",
          deterministic_match: true,
          variant_resolved_by_trim: true,
          resolution_reason:
            "EXACT_VIN_VARIANT",
          variant_source:
            "NHTSA",
          normalized_trim_aliases:
            nativeVehicleVariantAliases(parsedVehicle),
        };
      }

      const bestScore =
        Number(
          bestMatch.match_score || 0
        );

      const closeCandidates =
        satMatches.filter(
          (item: any) =>
            Number(item.match_score || 0) >= 60 &&
            Number(item.match_score || 0) >=
              bestScore - 8
        );

      const relevantCloseCandidates =
        closeCandidates.filter(
          (item: any) =>
            !item.has_conflict
        );

      const distinctLines =
        new Set(
          relevantCloseCandidates.map(
            (item: any) =>
              normalizeText(item.line)
          )
        );

      const distinctValues =
        new Set(
          relevantCloseCandidates.map(
            (item: any) =>
              Number(item.taxable_value)
                .toFixed(2)
          )
        );

      const trimIsUnknown =
        nativeVehicleVariantAliases(parsedVehicle).length === 0;

      // Detectamos la familia completa, no sólo candidatos dentro de
      // una ventana de score. Así BASE no puede auto-seleccionarse sólo
      // porque quedó artificialmente por encima de LE/SE/XLE.
      const sameVehicleFamilyCandidates =
        satMatches.filter((item: any) => {
          if (item.has_conflict) return false;

          const sameYear =
            parsedVehicle.model_year === null ||
            item.model_year === null ||
            Number(item.model_year) === Number(parsedVehicle.model_year) ||
            Boolean(item.is_rest_of_years);

          const sameEngine =
            parsedVehicle.engine_cc === null ||
            item.engine_cc === null ||
            Math.abs(
              Number(item.engine_cc) -
              Number(parsedVehicle.engine_cc)
            ) <= 100;

          const sameModel =
            !parsedVehicle.model ||
            containsExactNormalizedPhrase(
              item.line,
              parsedVehicle.model
            );

          return sameYear && sameEngine && sameModel;
        });

      const vinVariantHint =
        getControlledVinVariantHints(parsedVehicle.vin);

      const hintedFamilyCandidates =
        vinVariantHint
          ? sameVehicleFamilyCandidates.filter((item: any) =>
              satLineMatchesAnyVariant(
                item.line,
                vinVariantHint.variant_aliases
              )
            )
          : sameVehicleFamilyCandidates;

      const unresolvedVariantFamily =
        trimIsUnknown &&
        hintedFamilyCandidates.length > 1 &&
        new Set(
          hintedFamilyCandidates.map(
            (item: any) => normalizeText(item.line)
          )
        ).size > 1;

      // V19.9 · Regla explícita de Auto Match.
      // Esta regla usa la confianza FINAL ya recalculada por nuestro motor,
      // no el score original del RPC ni requisitos mecánicos adicionales
      // que podían bloquear un 94% claramente separado.
      const autoMatchSecondCandidate =
        satMatches
          .filter((item: any) =>
            Number(item.sat_vehicle_id) !==
              Number(bestMatch.sat_vehicle_id) &&
            !item.has_conflict
          )
          .sort(
            (a: any, b: any) =>
              Number(b.match_score || 0) -
              Number(a.match_score || 0)
          )[0] || null;

      const autoMatchBestScore =
        Number(bestMatch.match_score || 0);

      const autoMatchSecondScore =
        autoMatchSecondCandidate
          ? Number(autoMatchSecondCandidate.match_score || 0)
          : null;

      const autoMatchMargin =
        autoMatchSecondScore !== null
          ? autoMatchBestScore - autoMatchSecondScore
          : 100;

      const qualifiesForAutoMatch =
        !trimResolvedCandidate &&
        !bestMatch.has_conflict &&
        autoMatchBestScore >= 90 &&
        autoMatchMargin >= 15 &&
        !unresolvedVariantFamily;

      if (qualifiesForAutoMatch) {
        satMatchStatus =
          "AUTOMATIC_MATCH";

        satSelectedMatch = {
          ...bestMatch,
          confidence: "AUTOMATIC_MATCH",
          deterministic_match: true,
          auto_match_rule: "CONFIDENCE_90_MARGIN_15",
          auto_match_best_score:
            autoMatchBestScore,
          auto_match_second_score:
            autoMatchSecondScore,
          auto_match_margin:
            autoMatchMargin,
        };
      }

      else if (
        !trimResolvedCandidate &&
        relevantCloseCandidates.length > 1 &&
        distinctLines.size > 1 &&
        (
          distinctValues.size > 1 ||
          unresolvedVariantFamily
        )
      ) {
        satMatchStatus =
          "AMBIGUOUS_VARIANT";

        satAmbiguousOptions =
          relevantCloseCandidates.map(
            (item: any) => ({
              sat_vehicle_id:
                item.sat_vehicle_id,

              line:
                item.line,

              match_score:
                item.match_score,

              taxable_value:
                item.taxable_value,

              vehicle_type:
                item.vehicle_type,

              engine_cc:
                item.engine_cc,

              fuel_type:
                item.fuel_type,

              warnings:
                [
                  ...(item.warnings || []),
                  ...(item.confidence_warnings || []),
                ],
              score_breakdown:
                item.confidence_breakdown || [],
              trim_confirmed:
                Boolean(item.trim_confirmed),
              rpc_match_score:
                item.rpc_match_score ?? null,
            })
          );
      }

      else if (
        !trimResolvedCandidate &&
        unresolvedVariantFamily
      ) {
        // V19.1 · Hay varias versiones SAT del mismo vehículo y el VIN
        // no confirmó el trim. Nunca elegimos BASE u otra variante por
        // descarte: el caso debe quedar para revisión.
        satMatchStatus =
          "REVIEW_REQUIRED";
      }

      // V19.4.1: la decisión automática ya fue evaluada arriba con
      // confianza >= 90 y margen >= 15. Todo lo demás requiere revisión.
      // V19: ya no confiamos ciegamente en el confidence del RPC.
      // La automatización debe pasar isStrongDeterministicSatMatch().
      // Si el trim no está confirmado o existen variantes cercanas,
      // enviamos el caso a revisión.
      else if (!trimResolvedCandidate) {
        satMatchStatus =
          "REVIEW_REQUIRED";
      }
    }

    // =========================================================
    // V14: OPCIONES PARA REVISIÓN SAT
    //
    // Si el RPC no encontró una coincidencia confiable, buscamos
    // el universo SAT del mismo fabricante/modelo para mostrar
    // información útil al operador. Los candidatos con conflictos
    // críticos se devuelven SOLO como referencia y no deben
    // aprobarse a ciegas.
    // =========================================================

    if (
      satMatchStatus === "REVIEW_REQUIRED" &&
      parsedVehicle.make &&
      parsedVehicle.model
    ) {
      const {
        data: broadSatData,
        error: broadSatError,
      } = await supabase
        .from("sat_vehicle_values")
        .select(`
          id,
          vehicle_type,
          make,
          line,
          engine_cc,
          cylinders,
          doors,
          fuel_type,
          seats,
          model_year,
          taxable_value,
          is_rest_of_years,
          sat_catalog_version_id
        `)
        .eq("sat_catalog_version_id", activeSatCatalogVersionId)
        .ilike("make", parsedVehicle.make)
        .ilike("line", `%${parsedVehicle.model}%`)
        .or(
          `model_year.eq.${parsedVehicle.model_year},is_rest_of_years.eq.true`
        )
        .gt("taxable_value", 0)
        .limit(120);

      if (broadSatError) {
        throw broadSatError;
      }

      satReviewOptions = (broadSatData || [])
        .map((item: any) =>
          buildSatReviewCandidate(
            item,
            parsedVehicle
          )
        )
        .sort((a: any, b: any) => {
          if (a.has_conflict !== b.has_conflict) {
            return a.has_conflict ? 1 : -1;
          }

          return b.match_score - a.match_score;
        })
        .slice(0, 12);

      // Si existe al menos una opción SIN conflicto crítico,
      // la interfaz puede ofrecerla como resolución manual.
      // Si todas tienen conflicto, mantenemos revisión abierta
      // sin fingir que existe una línea SAT correcta.
      const safeReviewOptions =
        satReviewOptions.filter(
          (item: any) => !item.has_conflict
        );

      if (safeReviewOptions.length > 0) {
        satAmbiguousOptions =
          safeReviewOptions;
      }
    }

    // =========================================================
    // 7. IMPUESTOS
    // =========================================================

    if (
      calculationMode === "IMPORTER" &&
      (
        !Number.isFinite(importerExchangeRate) ||
        Number(importerExchangeRate) < 5 ||
        Number(importerExchangeRate) > 15
      )
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "EXCHANGE_RATE_UNAVAILABLE",
          error:
            "No fue posible obtener un tipo de cambio válido del Banco de Guatemala. No se calcularon impuestos para evitar una conversión incorrecta.",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let taxes: any = null;

    if (
      satSelectedMatch &&
      satSelectedMatch.sat_vehicle_id &&
      (
        calculationMode === "IMPORTER" ||
        satMatchStatus === "AUTOMATIC_MATCH" ||
        satMatchStatus === "MANUAL_RESOLUTION"
      )
    ) {
      const { data, error } = await supabase.rpc(
        "calculate_sat_taxes",
        {
          p_sat_vehicle_id: satSelectedMatch.sat_vehicle_id,
          p_port_expenses_gtq: 0,
          p_professional_fees_gtq: 0,
          p_exchange_rate: null,
        }
      );

      if (error) {
        const taxErrorMessage = String(error?.message || "");

        if (
          error?.code === "P0001" &&
          taxErrorMessage.includes("No existe regla de impuestos para el tipo de vehículo:")
        ) {
          const rawVehicleType =
            taxErrorMessage.split(":").slice(1).join(":").trim() ||
            satSelectedMatch?.vehicle_type ||
            "SIN CLASIFICAR";

          const { data: taxRuleOptions, error: rulesError } =
            await supabase.rpc("list_tax_vehicle_rules_v3744");

          if (rulesError) throw rulesError;

          return new Response(
            JSON.stringify({
              success: false,
              code: "TAX_CLASSIFICATION_REVIEW",
              calculation_method: calculationMode,
              invoice_value_usd:
                calculationMode === "IMPORTER" ? invoiceValueUsd : null,
              vehicle: parsedVehicle,
              sat: {
                best_match: bestMatch || null,
                selected_match: satSelectedMatch || null,
                match_status: satMatchStatus || null,
                candidates: satMatches || [],
                ambiguous_options: satAmbiguousOptions || [],
                review_options: satReviewOptions || [],
                requires_review: false,
                warnings:
                  satSelectedMatch?.warnings ||
                  bestMatch?.warnings ||
                  [],
              },
              tax_classification_review: {
                raw_vehicle_type: rawVehicleType,
                options: taxRuleOptions || [],
              },
              error:
                `La clasificación tributaria ${rawVehicleType} necesita revisión administrativa.`,
            }),
            {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }

        throw error;
      }
      taxes = Array.isArray(data) ? data[0] : data;
    }

    else if (
      satSelectedMatch &&
      satMatchStatus === "EXCEPTIONAL_RESOLUTION"
    ) {
      const taxableValue = Number(satSelectedMatch.taxable_value || 0);
      const ivaRate = Number(manualSatResolution?.manual_iva_rate ?? 0.12);
      const iprimaRate = Number(manualSatResolution?.manual_iprima_rate ?? 0);
      const plates = Number(manualSatResolution?.manual_plates_gtq ?? 75);

      const iva = Math.round(taxableValue * ivaRate * 100) / 100;
      const iprima = Math.round(taxableValue * iprimaRate * 100) / 100;
      const total = Math.round((iva + iprima + plates) * 100) / 100;

      taxes = {
        sat_vehicle_id: null,
        vehicle_type: manualSatResolution?.manual_vehicle_type || null,
        make: parsedVehicle.make,
        line: manualSatResolution?.manual_line || null,
        model_year: parsedVehicle.model_year,
        taxable_value_gtq: taxableValue,
        iva_rate: ivaRate,
        iva_gtq: iva,
        iprima_rate: iprimaRate,
        iprima_gtq: iprima,
        plates_gtq: plates,
        port_expenses_gtq: 0,
        professional_fees_gtq: 0,
        total_taxes_gtq: total,
        exchange_rate: null,
        total_taxes_usd: null,
        calculation_source: "EXCEPTIONAL_RESOLUTION",
      };
    }

    // =========================================================
    // V27 · COTIZADOR PARA IMPORTADORES
    // Conservamos exactamente las tasas/tipo/placas obtenidas por
    // la lógica SAT y sustituimos únicamente la base imponible.
    // =========================================================
    if (
      calculationMode === "IMPORTER" &&
      taxes &&
      Number.isFinite(invoiceValueUsd) &&
      Number(invoiceValueUsd) > 0 &&
      Number.isFinite(importerExchangeRate) &&
      Number(importerExchangeRate) > 0
    ) {
      importerInvoiceTaxableValueGtq =
        Math.round(
          Number(invoiceValueUsd) *
          Number(importerExchangeRate) *
          100
        ) / 100;

      const invoiceTaxableValueGtq =
        importerInvoiceTaxableValueGtq;

      const importerIvaRate =
        Number(taxes?.iva_rate ?? 0.12);

      const importerIprimaRate =
        Number(taxes?.iprima_rate ?? 0);

      const importerPlates =
        Number(taxes?.plates_gtq ?? 75);

      const importerIva =
        Math.round(
          invoiceTaxableValueGtq *
          importerIvaRate *
          100
        ) / 100;

      const importerIprima =
        Math.round(
          invoiceTaxableValueGtq *
          importerIprimaRate *
          100
        ) / 100;

      const importerTotal =
        Math.round(
          (
            importerIva +
            importerIprima +
            importerPlates
          ) *
          100
        ) / 100;

      taxes = {
        ...taxes,
        taxable_value_gtq:
          invoiceTaxableValueGtq,
        iva_gtq:
          importerIva,
        iprima_gtq:
          importerIprima,
        total_taxes_gtq:
          importerTotal,
        calculation_source:
          "IMPORTER_INVOICE",
        invoice_value_usd:
          Number(invoiceValueUsd),
        invoice_exchange_rate:
          Number(importerExchangeRate),
        invoice_exchange_rate_source:
          importerExchangeRateSource,
        invoice_exchange_rate_date:
          importerExchangeRateDate,
        exchange_rate:
          Number(importerExchangeRate),
        invoice_taxable_value_gtq:
          invoiceTaxableValueGtq,
      };
    }

    // =========================================================
    // 8. CARGAR TARIFAS
    // =========================================================

    const {
      data: freightRates,
      error: freightRatesError,
    } =
      await supabase
        .from("freight_rates")
        .select(
          "id, category, min_length_inches, max_length_inches, price_usd"
        )
        .eq("active", true)
        .order("min_length_inches");

    if (freightRatesError) {
      throw freightRatesError;
    }

    // =========================================================
    // V39.7.9.9.3 · TARIFA CONFIGURABLE DE MOTOCICLETA
    // =========================================================
    const motorcycleFreightRate =
      (freightRates || []).find((rate: any) => {
        const category = normalizeText(rate?.category);
        return (
          category === "MOTOCICLETA" ||
          category === "MOTOCICLETAS"
        );
      }) || null;

    function findFreightRate(
      length: number | null
    ) {
      if (!length) {
        return null;
      }

      return (
        freightRates?.find(
          (rate: any) =>
            Number(length) >=
              Number(rate.min_length_inches) &&
            Number(length) <=
              Number(rate.max_length_inches)
        ) || null
      );
    }

    // =========================================================
    // 9. RESOLUCIÓN MANUAL DE DIMENSIONES
    // =========================================================

    let manualDimensionResolution: any =
      null;

    const {
      data: dimensionResolutionData,
      error: dimensionResolutionError,
    } =
      await supabase
        .from("vin_dimension_resolutions")
        .select(`
          id,
          vin,
          dimension_model,
          length_inches,
          width_inches,
          height_inches,
          wheelbase_inches,
          curb_weight_lb,
          freight_rate_id,
          notes,
          active,
          created_at,
          freight_rates (
            id,
            category,
            min_length_inches,
            max_length_inches,
            price_usd
          )
        `)
        .eq("vin", cleanVin)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

    if (dimensionResolutionError) {
      throw dimensionResolutionError;
    }

    if (dimensionResolutionData) {
      manualDimensionResolution =
        dimensionResolutionData;
    }

    // =========================================================
    // 10. DETERMINAR DIMENSIONES / FLETE
    // =========================================================

    let freight: any = null;

    let freightStatus =
      "NOT_AVAILABLE";

    let freightOptions: any[] = [];

    let selectedDimensions =
      dimensions;

    // =========================================================
    // V39.7.9.9.3 · FLETE FIJO PARA MOTOCICLETAS
    // =========================================================
    // Las motocicletas NO usan la tabla de rangos por longitud.
    // E&R definió tarifa fija de USD 550.
    const normalizedVehicleType =
      normalizeText(parsedVehicle.vehicle_type);

    const normalizedBodyClass =
      normalizeText(parsedVehicle.body_class);

    const isMotorcycle =
      normalizedVehicleType.includes("MOTORCYCLE") ||
      normalizedBodyClass.includes("MOTORCYCLE") ||
      normalizedBodyClass.includes("MOTORBIKE") ||
      normalizedBodyClass.includes("MOTORCYCLE SCOOTER");

    if (isMotorcycle) {
      const motorcyclePrice =
        motorcycleFreightRate?.price_usd !== null &&
        motorcycleFreightRate?.price_usd !== undefined
          ? Number(motorcycleFreightRate.price_usd)
          : 550;

      freight = {
        id: motorcycleFreightRate?.id ?? null,
        category:
          motorcycleFreightRate?.category || "Motocicletas",
        min_length_inches: null,
        max_length_inches: null,
        price_usd: motorcyclePrice,
        pricing_method: "CONFIGURED_MOTORCYCLE_FIXED",
        configured_rate:
          Boolean(motorcycleFreightRate),
      };

      freightStatus =
        "MOTORCYCLE_FIXED";

      // Conservamos dimensiones si NHTSA/CVS logró encontrarlas,
      // pero NO se usan para calcular el precio.
      selectedDimensions =
        dimensions;
    }

    // ---------------------------------------------------------
    // PRIORIDAD 1:
    // RESOLUCIÓN MANUAL DE DIMENSIONES
    // ---------------------------------------------------------

    else if (manualDimensionResolution) {
      selectedDimensions = {
        dimension_model:
          manualDimensionResolution
            .dimension_model,

        dimension_match_score:
          null,

        length_inches:
          Number(
            manualDimensionResolution
              .length_inches
          ),

        width_inches:
          manualDimensionResolution
            .width_inches !== null
            ? Number(
                manualDimensionResolution
                  .width_inches
              )
            : null,

        height_inches:
          manualDimensionResolution
            .height_inches !== null
            ? Number(
                manualDimensionResolution
                  .height_inches
              )
            : null,

        wheelbase_inches:
          manualDimensionResolution
            .wheelbase_inches !== null
            ? Number(
                manualDimensionResolution
                  .wheelbase_inches
              )
            : null,

        curb_weight_lb:
          manualDimensionResolution
            .curb_weight_lb !== null
            ? Number(
                manualDimensionResolution
                  .curb_weight_lb
              )
            : null,

        dimension_source:
          "MANUAL_RESOLUTION",

        dimensions_updated_at:
          manualDimensionResolution
            .created_at,
      };

      const storedRate =
        manualDimensionResolution
          .freight_rates;

      if (storedRate) {
        freight = {
          id:
            storedRate.id,

          category:
            storedRate.category,

          min_length_inches:
            storedRate
              .min_length_inches,

          max_length_inches:
            storedRate
              .max_length_inches,

          price_usd:
            storedRate.price_usd,
        };
      }

      else {
        freight =
          findFreightRate(
            Number(
              manualDimensionResolution
                .length_inches
            )
          );
      }

      freightStatus =
        "MANUAL_RESOLUTION";
    }

    // ---------------------------------------------------------
    // PRIORIDAD 2:
    // MOTOR AUTOMÁTICO DE DIMENSIONES
    // ---------------------------------------------------------

    else if (
      dimensionCandidates.length > 0
    ) {
      const bestDimensionScore =
        dimensionCandidates[0].score;

      const topDimensionCandidates =
        dimensionCandidates.filter(
          (item: any) =>
            item.score ===
            bestDimensionScore
        );

      freightOptions =
        topDimensionCandidates
          .map((item: any) => {
            const length =
              item.specs?.OL
                ? Number(item.specs.OL)
                : null;

            const rate =
              findFreightRate(length);

            return {
              dimension_model:
                item.model,

              dimension_score:
                item.score,

              length_inches:
                length,

              freight_rate_id:
                rate?.id || null,

              freight_category:
                rate?.category || null,

              freight_usd:
                rate?.price_usd || null,

              width_inches:
                item.specs?.OW
                  ? Number(item.specs.OW)
                  : null,

              height_inches:
                item.specs?.OH
                  ? Number(item.specs.OH)
                  : null,

              wheelbase_inches:
                item.specs?.WB
                  ? Number(item.specs.WB)
                  : null,

              curb_weight_lb:
                item.specs?.CW
                  ? Number(item.specs.CW)
                  : null,
            };
          })
          .filter(
            (item: any) =>
              item.length_inches !== null
          );

      const uniqueFreightResults =
        new Set(
          freightOptions.map(
            (item: any) =>
              `${item.freight_category}|${item.freight_usd}`
          )
        );

      if (
        freightOptions.length > 0 &&
        uniqueFreightResults.size === 1
      ) {
        const selectedOption =
          freightOptions[0];

        freight =
          findFreightRate(
            selectedOption.length_inches
          );

        freightStatus =
          "AUTOMATIC_FREIGHT";
      }

      else if (
        freightOptions.length > 1 &&
        uniqueFreightResults.size > 1
      ) {
        freight = null;

        freightStatus =
          "DIMENSION_REVIEW";

        // Si hay ambigüedad real,
        // no presentamos la primera dimensión
        // como si fuera definitiva.
        selectedDimensions = null;
      }

      else {
        freightStatus =
          "FREIGHT_REVIEW";
      }
    }

    // =========================================================
    // 11. ESTADO GENERAL
    // =========================================================

    // V37.4.1 · IMPORTER nunca queda bloqueado por revisión de valor SAT.
    // SAT puede aportar clasificación/tasa, pero la base imponible proviene
    // exclusivamente de factura USD × tipo de cambio.
    const satRequiresReview =
      calculationMode === "IMPORTER"
        ? false
        : !(
            satMatchStatus === "AUTOMATIC_MATCH" ||
            satMatchStatus === "MANUAL_RESOLUTION" ||
            satMatchStatus === "EXCEPTIONAL_RESOLUTION"
          );

    const freightRequiresReview =
      !(
        freightStatus ===
          "AUTOMATIC_FREIGHT" ||

        freightStatus ===
          "MANUAL_RESOLUTION" ||

        freightStatus ===
          "MOTORCYCLE_FIXED"
      );

    let calculationStatus =
      "READY";

    if (
      satRequiresReview &&
      freightRequiresReview
    ) {
      calculationStatus =
        "SAT_AND_FREIGHT_REVIEW";
    }

    else if (satRequiresReview) {
      calculationStatus =
        "SAT_REVIEW";
    }

    else if (freightRequiresReview) {
      calculationStatus =
        "FREIGHT_REVIEW";
    }

    let customerQueryId: number | null = null;

    // =========================================================
    // 11B. REGISTRAR CONSULTA DEL CLIENTE PARA PROSPECTOS
    // =========================================================
    // Sólo registramos consultas de CUSTOMER. Las consultas internas de
    // ADMIN / OPERADOR no forman parte de la captación comercial.
    try {
      const { data: queryProfile } = await supabase
        .from("profiles")
        .select("full_name, email, phone, role")
        .eq("id", currentUser.id)
        .maybeSingle();

      const queryRole =
        String(queryProfile?.role || "").toUpperCase();

      if (queryRole === "CUSTOMER") {
        const queryEmail =
          String(queryProfile?.email || "")
            .trim()
            .toLowerCase();

        const queryPhone =
          String(queryProfile?.phone || "")
            .replace(/[^0-9]+/g, "");

        const queryContactKey =
          queryEmail || queryPhone
            ? `${queryEmail || "NOEMAIL"}|${queryPhone || "NOPHONE"}`
            : `USER|${currentUser.id}`;

        const { data: queryLogRow, error: queryLogError } =
          await supabase
            .from("customer_quote_queries")
            .insert({
              user_id: currentUser.id,
              contact_key: queryContactKey,
              full_name: queryProfile?.full_name || null,
              email: queryEmail || null,
              phone: queryPhone || null,

              calculation_method:
                calculationMode,
              invoice_value_usd:
                calculationMode === "IMPORTER"
                  ? Number(invoiceValueUsd)
                  : null,

              invoice_exchange_rate:
                calculationMode === "IMPORTER"
                  ? Number(importerExchangeRate)
                  : null,

              invoice_taxable_value_gtq:
                calculationMode === "IMPORTER"
                  ? Number(importerInvoiceTaxableValueGtq)
                  : null,

              vin: cleanVin,
              model_year: parsedVehicle.model_year,
              make: parsedVehicle.make,
              model: parsedVehicle.model,
              trim:
                nativeVehicleVariantAliases(parsedVehicle)[0] ||
                parsedVehicle.trim ||
                null,

              calculation_status:
                calculationStatus,

              sat_line:
                satSelectedMatch?.line || null,

              sat_match_score:
                satSelectedMatch?.match_score ?? null,

              sat_value_gtq:
                (
                  satMatchStatus === "AUTOMATIC_MATCH" ||
                  satMatchStatus === "MANUAL_RESOLUTION" ||
                  satMatchStatus === "EXCEPTIONAL_RESOLUTION"
                )
                  ? satSelectedMatch?.taxable_value || null
                  : null,

              iva_gtq:
                taxes?.iva_gtq || null,

              iprima_gtq:
                taxes?.iprima_gtq || null,

              plates_gtq:
                taxes?.plates_gtq || null,

              total_taxes_gtq:
                taxes?.total_taxes_gtq || null,

              freight_category:
                freight?.category || null,

              freight_usd:
                freight?.price_usd || null,

              length_inches:
                selectedDimensions?.length_inches || null,
            })
            .select("id")
            .single();

        if (queryLogError) {
          console.error(
            "CUSTOMER QUERY LOG ERROR:",
            queryLogError
          );
        } else {
          customerQueryId = queryLogRow?.id !== undefined ? Number(queryLogRow.id) : null;
        }
      }
    } catch (queryLogException) {
      // El registro comercial nunca debe bloquear una cotización.
      console.error(
        "CUSTOMER QUERY LOG EXCEPTION:",
        queryLogException
      );
    }

    // =========================================================
    // 12. RESPUESTA FINAL
    // =========================================================

    return new Response(
      JSON.stringify({
        success: true,

        calculation_method:
          calculationMode,
        invoice_value_usd:
          calculationMode === "IMPORTER"
            ? Number(invoiceValueUsd)
            : null,

        access: accessInfo || null,
        customer_query_id: customerQueryId,

        calculation_status:
          calculationStatus,

        vehicle:
          savedDecode,

        sat: {
          best_match:
            bestMatch,

          selected_match:
            satSelectedMatch,

          match_status:
            satMatchStatus,

          manual_resolution:
            manualSatResolution
              ? {
                  resolution_id:
                    manualSatResolution.id,

                  sat_vehicle_id:
                    manualSatResolution
                      .sat_vehicle_id,

                  resolution_type:
                    manualSatResolution.resolution_type,

                  manual_line:
                    manualSatResolution.manual_line || null,

                  manual_vehicle_type:
                    manualSatResolution.manual_vehicle_type || null,

                  manual_taxable_value:
                    manualSatResolution.manual_taxable_value || null,

                  manual_iprima_rate:
                    manualSatResolution.manual_iprima_rate || null,

                  verification_source:
                    manualSatResolution.verification_source || null,

                  notes:
                    manualSatResolution.notes,

                  created_at:
                    manualSatResolution
                      .created_at,
                }
              : null,

          candidates:
            satMatches,

          ambiguous_options:
            satAmbiguousOptions,

          review_options:
            satReviewOptions,

          no_compatible_match:
            satMatchStatus === "REVIEW_REQUIRED" &&
            satReviewOptions.length > 0 &&
            !satReviewOptions.some(
              (item: any) => !item.has_conflict
            ),

          requires_review:
            calculationMode === "IMPORTER" ? false : satRequiresReview,

          warnings:
            satSelectedMatch?.warnings ||
            bestMatch?.warnings ||
            [],
        },

        taxes,

        dimensions:
          selectedDimensions,

        dimension_search_attempts:
          dimensionSearchAttempts,

        dimension_candidates:
          dimensionCandidates
            .slice(0, 10)
            .map((item: any) => ({
              model:
                item.model,

              search_model_query:
                item.search_model_query || null,

              score:
                item.score,

              length_inches:
                item.specs?.OL
                  ? Number(item.specs.OL)
                  : null,

              width_inches:
                item.specs?.OW
                  ? Number(item.specs.OW)
                  : null,

              height_inches:
                item.specs?.OH
                  ? Number(item.specs.OH)
                  : null,

              wheelbase_inches:
                item.specs?.WB
                  ? Number(item.specs.WB)
                  : null,

              curb_weight_lb:
                item.specs?.CW
                  ? Number(item.specs.CW)
                  : null,

              detected_engine_liters:
                parseCandidateEngineLiters(
                  item.model || ""
                ),

              detected_doors:
                parseCandidateDoors(
                  item.model || ""
                ),
            })),

        dimension_manual_resolution:
          manualDimensionResolution
            ? {
                resolution_id:
                  manualDimensionResolution.id,

                dimension_model:
                  manualDimensionResolution
                    .dimension_model,

                length_inches:
                  Number(
                    manualDimensionResolution
                      .length_inches
                  ),

                freight_rate_id:
                  manualDimensionResolution
                    .freight_rate_id,

                notes:
                  manualDimensionResolution
                    .notes,

                created_at:
                  manualDimensionResolution
                    .created_at,
              }
            : null,

        freight,

        freight_status:
          freightStatus,

        freight_requires_review:
          freightRequiresReview,

        freight_options:
          freightOptions,

        summary: {
          calculation_method:
            calculationMode,

          invoice_value_usd:
            calculationMode === "IMPORTER"
              ? Number(invoiceValueUsd)
              : null,

          vin:
            cleanVin,

          vehicle:
            [
              parsedVehicle.model_year,
              parsedVehicle.make,
              parsedVehicle.model,
              parsedVehicle.series,
              parsedVehicle.trim,
            ]
              .filter(Boolean)
              .join(" "),

          // SAT
          sat_catalog_version_id:
            activeSatCatalogVersionId,

          sat_table_year:
            activeSatTableYear,

          sat_line:
            satSelectedMatch?.line ||
            null,

          sat_match_status:
            satMatchStatus,

          sat_match_score:
            satSelectedMatch
              ?.match_score ?? null,

          sat_confidence:
            satSelectedMatch
              ?.confidence ?? null,

          sat_has_conflict:
            satSelectedMatch
              ?.has_conflict ?? false,

          sat_warnings:
            satSelectedMatch
              ?.warnings || [],

          sat_manual_resolution:
            satMatchStatus === "MANUAL_RESOLUTION" ||
            satMatchStatus === "EXCEPTIONAL_RESOLUTION",

          sat_exceptional_resolution:
            satMatchStatus === "EXCEPTIONAL_RESOLUTION",

          sat_resolution_id:
            manualSatResolution?.id ||
            null,

          sat_ambiguous_count:
            satAmbiguousOptions.length,

          sat_value_gtq:
            (
              satMatchStatus === "AUTOMATIC_MATCH" ||
              satMatchStatus === "MANUAL_RESOLUTION" ||
              satMatchStatus === "EXCEPTIONAL_RESOLUTION"
            )
              ? satSelectedMatch?.taxable_value || null
              : null,

          total_taxes_gtq:
            taxes?.total_taxes_gtq ||
            null,

          // DIMENSIONES
          dimension_model:
            selectedDimensions
              ?.dimension_model ||
            null,

          dimension_match_score:
            selectedDimensions
              ?.dimension_match_score ??
            null,

          length_inches:
            selectedDimensions
              ?.length_inches ||
            null,

          dimension_manual_resolution:
            freightStatus ===
            "MANUAL_RESOLUTION",

          dimension_resolution_id:
            manualDimensionResolution
              ?.id ||
            null,

          // FLETE
          freight_status:
            freightStatus,

          freight_category:
            freight?.category ||
            null,

          freight_usd:
            freight?.price_usd ||
            null,

          freight_requires_review:
            freightRequiresReview,

          // GENERAL
          calculation_status:
            calculationStatus,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );

  } catch (error) {
    console.error(
      "DECODE VIN ERROR:",
      error
    );

    let errorMessage =
      "Error inesperado.";

    let errorDetails = null;

    if (error instanceof Error) {
      errorMessage =
        error.message;
    }

    else if (
      error &&
      typeof error === "object"
    ) {
      errorMessage =
        (error as any).message ||
        JSON.stringify(error);

      errorDetails =
        error;
    }

    else if (error) {
      errorMessage =
        String(error);
    }

    return new Response(
      JSON.stringify({
        success: false,

        error:
          errorMessage,

        details:
          errorDetails,
      }),
      {
        status: error instanceof Error && error.name === "VinServiceUnavailable" ? 503 : 500,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});


