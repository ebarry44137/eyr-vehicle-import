import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const TYPE_MAKE_BOUNDARY_RATIO = 0.075;
const MAKE_LINE_BOUNDARY_RATIO = 0.145;
const Y_TOLERANCE = 1.5;

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return normalizeSpace(value).toUpperCase();
}

function isMoney(value) {
  return /^-?\d{1,3}(?:,\d{3})*\.\d{2}$|^-?\d+\.\d{2}$/.test(
    normalizeSpace(value)
  );
}

function moneyToNumber(value) {
  const number = Number(normalizeSpace(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function isIntegerText(value) {
  return /^\d+$/.test(normalizeSpace(value));
}

function buildExpectedYears(tableYear) {
  const year = Number(tableYear);
  return Array.from({ length: 15 }, (_, index) => year - 1 - index);
}

function groupItemsByY(items) {
  const groups = [];

  const clean = (items || [])
    .filter((item) => normalizeSpace(item?.str))
    .map((item) => ({
      text: normalizeSpace(item.str),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      width: Number(item.width || 0),
    }))
    .sort((a, b) => {
      if (Math.abs(b.y - a.y) > Y_TOLERANCE) return b.y - a.y;
      return a.x - b.x;
    });

  for (const item of clean) {
    let group = groups.find((candidate) => Math.abs(candidate.y - item.y) <= Y_TOLERANCE);

    if (!group) {
      group = { y: item.y, items: [] };
      groups.push(group);
    }

    group.items.push(item);
    group.y =
      group.items.reduce((sum, current) => sum + current.y, 0) /
      group.items.length;
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.x - b.x),
    }))
    .sort((a, b) => b.y - a.y);
}

function detectExpectedHeaders(pageText, tableYear, textItems = []) {
  const expectedYears = buildExpectedYears(tableYear);
  const compact = normalizeSpace(pageText);

  // V39.6.19.3:
  // NO buscamos años en todo el texto de la página, porque el título
  // también contiene el año de vigencia (ej. "año 2026") y eso podría
  // hacer parecer que un PDF 2026 corresponde a 2027.
  //
  // En su lugar detectamos la FILA REAL DEL ENCABEZADO usando posición Y
  // y tomamos únicamente los años impresos juntos en esa misma línea.
  const groups = groupItemsByY(textItems);

  const yearRowCandidates = groups
    .map((group) => {
      const years = group.items
        .map((item) => normalizeSpace(item.text))
        .filter((text) => /^20\d{2}$/.test(text))
        .map(Number);

      return {
        y: group.y,
        years,
      };
    })
    .filter((group) => group.years.length >= 10)
    .sort((a, b) => b.years.length - a.years.length);

  const headerYearRow = yearRowCandidates[0] || null;
  const detectedYears = headerYearRow
    ? Array.from(new Set(headerYearRow.years))
    : [];

  const isStrictDescendingSequence =
    detectedYears.length === 15 &&
    detectedYears.every(
      (year, index) =>
        index === 0 ||
        detectedYears[index - 1] - year === 1
    );

  const detectedTableYear =
    isStrictDescendingSequence
      ? detectedYears[0] + 1
      : null;

  const missing = expectedYears.filter(
    (year) => !detectedYears.includes(year)
  );

  return {
    expectedYears,
    detectedYears,
    detectedTableYear,
    missing,
    isStrictDescendingSequence,
    hasRestOfYears:
      /RESTO\s+DE\s+A[ÑN]OS/i.test(compact) ||
      (/RESTO/i.test(compact) && /A[ÑN]OS/i.test(compact)),
  };
}

function parseCandidateRow(group, pageWidth, expectedValueCount) {
  const cells = group.items;
  if (cells.length < expectedValueCount + 8) return null;

  const texts = cells.map((cell) => cell.text);
  const valueCells = texts.slice(-expectedValueCount);

  if (!valueCells.every(isMoney)) return null;

  const pre = cells.slice(0, -expectedValueCount);
  if (pre.length < 8) return null;

  const conditionCells = pre.slice(-5).map((cell) => cell.text);
  const [engineCcText, cylindersText, doorsText, fuelTypeText, seatsText] =
    conditionCells;

  if (
    !isIntegerText(engineCcText) ||
    !isIntegerText(cylindersText) ||
    !isIntegerText(doorsText) ||
    !normalizeSpace(fuelTypeText) ||
    !isIntegerText(seatsText)
  ) {
    return {
      candidate: true,
      valid: false,
      error: "No se pudieron interpretar los campos condicionantes.",
      raw: texts.join(" | "),
    };
  }

  const left = pre.slice(0, -5);
  const typeMakeBoundary = pageWidth * TYPE_MAKE_BOUNDARY_RATIO;
  const makeLineBoundary = pageWidth * MAKE_LINE_BOUNDARY_RATIO;

  const vehicleType = normalizeText(
    left
      .filter((cell) => cell.x < typeMakeBoundary)
      .map((cell) => cell.text)
      .join(" ")
  );

  const make = normalizeText(
    left
      .filter(
        (cell) =>
          cell.x >= typeMakeBoundary &&
          cell.x < makeLineBoundary
      )
      .map((cell) => cell.text)
      .join(" ")
  );

  const line = normalizeText(
    left
      .filter((cell) => cell.x >= makeLineBoundary)
      .map((cell) => cell.text)
      .join(" ")
  );

  if (!vehicleType || !make || !line) {
    return {
      candidate: true,
      valid: false,
      error: "No se pudieron separar Tipo, Marca y Línea.",
      raw: texts.join(" | "),
    };
  }

  const values = valueCells.map(moneyToNumber);

  if (values.some((value) => value === null)) {
    return {
      candidate: true,
      valid: false,
      error: "Existe un valor monetario que no pudo convertirse a número.",
      raw: texts.join(" | "),
    };
  }

  return {
    candidate: true,
    valid: true,
    baseRow: {
      vehicle_type: vehicleType,
      make,
      line,
      engine_cc: Number(engineCcText),
      cylinders: Number(cylindersText),
      doors: Number(doorsText),
      fuel_type: normalizeText(fuelTypeText),
      seats: Number(seatsText),
      values,
    },
  };
}

function expandedKey(row) {
  return [
    row.vehicle_type,
    row.make,
    row.line,
    row.engine_cc,
    row.cylinders,
    row.doors,
    row.fuel_type,
    row.seats,
    row.model_year ?? "REST",
    row.is_rest_of_years ? 1 : 0,
    row.sat_table_year,
  ].join("¦");
}

async function sha256Hex(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function parseSatPdf(file, tableYear, onProgress = () => {}) {
  if (!file) throw new Error("Seleccioná el PDF oficial de SAT.");
  if (file.type && file.type !== "application/pdf") {
    throw new Error("El archivo debe ser PDF.");
  }

  const year = Number(tableYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Ingresá un año de tabla SAT válido.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const expectedYears = buildExpectedYears(year);
  const expectedValueCount = expectedYears.length + 1;

  const baseRows = [];
  const parseErrors = [];
  let headerValidated = false;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item) => item?.str || "")
      .join(" ");

    if (pageNumber === 1) {
      const header = detectExpectedHeaders(pageText, year, textContent.items);

      if (!header.hasRestOfYears) {
        throw new Error(
          `No se encontró la columna "Resto de Años" en el encabezado oficial SAT.`
        );
      }

      if (!header.detectedTableYear) {
        const detectedText = header.detectedYears?.length
          ? ` Se detectaron en la fila del encabezado: ${header.detectedYears.join(", ")}.`
          : "";

        throw new Error(
          `No fue posible identificar de forma segura la secuencia real de 15 años del encabezado SAT.${detectedText} La carga fue bloqueada.`
        );
      }

      if (header.detectedTableYear !== year) {
        throw new Error(
          `El año seleccionado no coincide con el contenido del PDF. Seleccionaste SAT ${year}, pero las columnas del documento corresponden a SAT ${header.detectedTableYear} (${header.detectedYears[0]}–${header.detectedYears.at(-1)} + Resto de Años).`
        );
      }

      if (header.missing.length > 0) {
        throw new Error(
          `El PDF no coincide con la estructura SAT esperada para ${year}. Faltan columnas de año: ${header.missing.join(", ")}.`
        );
      }

      headerValidated = true;
    }

    const groups = groupItemsByY(textContent.items);

    for (const group of groups) {
      const parsed = parseCandidateRow(
        group,
        viewport.width,
        expectedValueCount
      );

      if (!parsed?.candidate) continue;

      if (!parsed.valid) {
        parseErrors.push({
          page: pageNumber,
          error: parsed.error,
          raw: parsed.raw,
        });
        continue;
      }

      baseRows.push({
        page: pageNumber,
        ...parsed.baseRow,
      });
    }

    onProgress({
      stage: "PARSING",
      current: pageNumber,
      total: pdf.numPages,
      percent: Math.round((pageNumber / pdf.numPages) * 45),
    });
  }

  if (!headerValidated) {
    throw new Error("No fue posible validar las columnas del PDF SAT.");
  }

  if (parseErrors.length > 0) {
    const example = parseErrors[0];
    throw new Error(
      `El PDF contiene ${parseErrors.length} fila(s) que no pudieron interpretarse. Primera incidencia: página ${example.page} · ${example.error}`
    );
  }

  if (baseRows.length === 0) {
    throw new Error("No se encontraron filas válidas en el PDF.");
  }

  const expandedRows = [];

  for (const base of baseRows) {
    expectedYears.forEach((modelYear, index) => {
      expandedRows.push({
        vehicle_type: base.vehicle_type,
        make: base.make,
        line: base.line,
        engine_cc: base.engine_cc,
        cylinders: base.cylinders,
        doors: base.doors,
        fuel_type: base.fuel_type,
        seats: base.seats,
        model_year: modelYear,
        is_rest_of_years: false,
        taxable_value: base.values[index],
        sat_table_year: year,
      });
    });

    expandedRows.push({
      vehicle_type: base.vehicle_type,
      make: base.make,
      line: base.line,
      engine_cc: base.engine_cc,
      cylinders: base.cylinders,
      doors: base.doors,
      fuel_type: base.fuel_type,
      seats: base.seats,
      model_year: null,
      is_rest_of_years: true,
      taxable_value: base.values.at(-1),
      sat_table_year: year,
    });
  }

  onProgress({
    stage: "VALIDATING",
    current: 1,
    total: 1,
    percent: 50,
  });

  const seen = new Map();
  const duplicates = [];

  for (const row of expandedRows) {
    const key = expandedKey(row);
    if (seen.has(key)) {
      duplicates.push({
        key,
        first: seen.get(key),
        duplicate: row,
      });
    } else {
      seen.set(key, row);
    }
  }

  const structuralErrors = {
    missing_vehicle_type: expandedRows.filter((row) => !row.vehicle_type).length,
    missing_make: expandedRows.filter((row) => !row.make).length,
    missing_line: expandedRows.filter((row) => !row.line).length,
    missing_engine_cc: expandedRows.filter(
      (row) => !Number.isFinite(row.engine_cc)
    ).length,
    missing_cylinders: expandedRows.filter(
      (row) => !Number.isFinite(row.cylinders)
    ).length,
    missing_doors: expandedRows.filter(
      (row) => !Number.isFinite(row.doors)
    ).length,
    missing_fuel_type: expandedRows.filter((row) => !row.fuel_type).length,
    missing_seats: expandedRows.filter(
      (row) => !Number.isFinite(row.seats)
    ).length,
    invalid_year_condition: expandedRows.filter(
      (row) =>
        (row.is_rest_of_years && row.model_year !== null) ||
        (!row.is_rest_of_years && !Number.isFinite(row.model_year))
    ).length,
    invalid_taxable_value: expandedRows.filter(
      (row) => !Number.isFinite(row.taxable_value)
    ).length,
  };

  const blockingCount =
    Object.values(structuralErrors).reduce(
      (sum, value) => sum + Number(value || 0),
      0
    ) + duplicates.length;

  if (blockingCount > 0) {
    throw new Error(
      `La validación estructural encontró ${blockingCount} incidencia(s). No se cargará la tabla.`
    );
  }

  const sourceSha256 = await sha256Hex(file);

  const byVehicleType = {};
  for (const row of baseRows) {
    byVehicleType[row.vehicle_type] =
      (byVehicleType[row.vehicle_type] || 0) + 1;
  }

  const validation = {
    table_year: year,
    page_count: pdf.numPages,
    header_years: expectedYears,
    has_rest_of_years: true,
    base_rows: baseRows.length,
    expanded_rows: expandedRows.length,
    values_per_base_row: expectedValueCount,
    duplicate_rows: duplicates.length,
    blocking_errors: blockingCount,
    structural_errors: structuralErrors,
    zero_values: expandedRows.filter((row) => row.taxable_value === 0).length,
    negative_values: expandedRows.filter((row) => row.taxable_value < 0).length,
    by_vehicle_type: byVehicleType,
    parser: "EYR_SAT_PDF_V1",
  };

  onProgress({
    stage: "READY",
    current: 1,
    total: 1,
    percent: 55,
  });

  return {
    tableYear: year,
    years: expectedYears,
    pageCount: pdf.numPages,
    sourceFileName: file.name,
    sourceFileSize: file.size,
    sourceSha256,
    baseRows,
    expandedRows,
    validation,
  };
}

export function normalizedRowsToCsv(rows) {
  const headers = [
    "vehicle_type",
    "make",
    "line",
    "engine_cc",
    "cylinders",
    "doors",
    "fuel_type",
    "seats",
    "model_year",
    "is_rest_of_years",
    "taxable_value",
    "sat_table_year",
  ];

  const quote = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  return [
    headers.join(","),
    ...(rows || []).map((row) =>
      headers.map((header) => quote(row[header])).join(",")
    ),
  ].join("\n");
}
