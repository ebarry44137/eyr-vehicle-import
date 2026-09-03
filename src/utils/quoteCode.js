export function getQuotePrefix({
  isWhiteLabelClient = false,
  officeName = "",
  explicitPrefix = "",
} = {}) {
  // E&R siempre conserva su prefijo histórico.
  if (!isWhiteLabelClient) {
    return "ER";
  }

  // Preparado por si posteriormente agregamos quote_prefix
  // directamente en la configuración de cada oficina.
  const configuredPrefix = String(explicitPrefix || "")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 4);

  if (configuredPrefix) {
    return configuredPrefix;
  }

  const cleanName = String(officeName || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!cleanName) {
    return "OF";
  }

  const words = cleanName
    .split(" ")
    .map((word) => word.replace(/[^a-zA-ZÁÉÍÓÚÜÑáéíóúüñ0-9]/g, ""))
    .filter(Boolean);

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  // Primera + última palabra.
  // "Trámites Shaddai"          => TS
  // "Trámites Aduanales Shaddai" => TS
  // "Agencia Aduanal Rivera"     => AR
  const first = words[0].charAt(0);
  const last = words[words.length - 1].charAt(0);

  return `${first}${last}`.toUpperCase();
}


export function buildQuoteCode({
  vin = "",
  isWhiteLabelClient = false,
  officeName = "",
  explicitPrefix = "",
  date = new Date(),
} = {}) {
  const prefix = getQuotePrefix({
    isWhiteLabelClient,
    officeName,
    explicitPrefix,
  });

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  const codeVin = String(vin || "VIN")
    .trim()
    .toUpperCase();

  const vinSuffix =
    codeVin.length >= 6
      ? codeVin.slice(-6)
      : codeVin.padStart(6, "0");

  return `${prefix}-${y}${m}${d}-${hh}${mm}${ss}-${vinSuffix}`;
}