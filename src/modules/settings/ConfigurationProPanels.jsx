import { useEffect, useMemo, useState } from "react";

const REQUIRED_SAT_COLUMNS = ["vehicle_type", "make", "line", "taxable_value"];

function cleanNumber(value, integer = false) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = String(value).trim().replace(/,/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return integer ? Math.trunc(number) : number;
}

function cleanBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "si", "sí", "x"].includes(normalized);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => String(value).trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => String(value).trim() !== "")) rows.push(row);

  if (rows.length < 2) throw new Error("El CSV no contiene datos suficientes.");

  const headers = rows[0].map((value) =>
    String(value || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
  );

  for (const required of REQUIRED_SAT_COLUMNS) {
    if (!headers.includes(required)) {
      throw new Error(`El CSV no contiene la columna obligatoria "${required}".`);
    }
  }

  return rows.slice(1).map((values) => {
    const item = {};
    headers.forEach((header, index) => {
      if (header) item[header] = values[index] ?? "";
    });
    return item;
  });
}

async function sha256File(file) {
  if (!globalThis.crypto?.subtle) return "";
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isRpcSignatureError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "PGRST202" ||
    message.includes("could not find the function") ||
    message.includes("function") && message.includes("schema cache")
  );
}

async function rpcWithVariants(supabase, functionName, variants) {
  let lastError = null;

  for (const args of variants) {
    const { data, error } = await supabase.rpc(functionName, args);
    if (!error) return data;

    lastError = error;
    if (!isRpcSignatureError(error)) throw error;
  }

  throw lastError || new Error(`No fue posible ejecutar ${functionName}.`);
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-GT", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function freightRangeLabel(row) {
  const min = Number(row?.min_length_inches);
  const max = Number(row?.max_length_inches);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);

  if (hasMin && hasMax) {
    if (min <= 0) return `Hasta ${max}"`;
    return `${min}" – ${max}"`;
  }
  if (hasMin) return `Desde ${min}"`;
  if (hasMax) return `Hasta ${max}"`;
  return "Rango especial";
}

function normalizeCatalogStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (!status) return "—";
  const labels = {
    PREPARING: "Preparando",
    IMPORTING: "Importando",
    READY: "Lista",
    ACTIVE: "Activa",
    FAILED: "Con error",
  };
  return labels[status] || status;
}

export default function ConfigurationProPanels({ supabase, isSystemAdmin = false }) {
  const [freightRates, setFreightRates] = useState([]);
  const [freightLoading, setFreightLoading] = useState(false);
  const [freightSaving, setFreightSaving] = useState(false);
  const [freightMessage, setFreightMessage] = useState("");
  const [freightError, setFreightError] = useState("");

  const [catalogs, setCatalogs] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogMessage, setCatalogMessage] = useState("");
  const [catalogYear, setCatalogYear] = useState(String(new Date().getFullYear() + 1));
  const [catalogFile, setCatalogFile] = useState(null);
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [catalogProgress, setCatalogProgress] = useState({ done: 0, total: 0, label: "" });
  const [activatingId, setActivatingId] = useState(null);

  const activeCatalog = useMemo(
    () => catalogs.find((item) => Boolean(item.is_active)) || null,
    [catalogs]
  );

  async function loadFreightRates() {
    if (!isSystemAdmin) return;
    setFreightLoading(true);
    setFreightError("");

    try {
      const { data, error } = await supabase.rpc("list_freight_rates_admin_v39618");
      if (error) throw error;

      setFreightRates(
        (Array.isArray(data) ? data : []).map((row) => ({
          category: String(row.category || ""),
          min_length_inches:
            row.min_length_inches === null || row.min_length_inches === undefined
              ? null
              : Number(row.min_length_inches),
          max_length_inches:
            row.max_length_inches === null || row.max_length_inches === undefined
              ? null
              : Number(row.max_length_inches),
          price_usd: String(row.price_usd ?? ""),
          active: Boolean(row.active),
          updated_at: row.updated_at || null,
        }))
      );
    } catch (error) {
      console.error("V39.7.9.6 FREIGHT LOAD ERROR:", error);
      setFreightError(error?.message || "No fue posible cargar las tarifas de flete.");
    } finally {
      setFreightLoading(false);
    }
  }

  async function saveFreightRates(event) {
    event?.preventDefault?.();
    if (!freightRates.length) return;

    setFreightSaving(true);
    setFreightMessage("");
    setFreightError("");

    try {
      for (const row of freightRates) {
        const price = Number(row.price_usd);
        if (!Number.isFinite(price) || price <= 0) {
          throw new Error(`Ingresá una tarifa válida para ${row.category || "la categoría"}.`);
        }

        const { error } = await supabase.rpc("update_freight_rate_admin_v39618", {
          p_category: row.category,
          p_price_usd: price,
        });

        if (error) throw error;
      }

      await loadFreightRates();
      setFreightMessage(
        "Tarifas actualizadas. Las nuevas cotizaciones usarán estos valores."
      );
    } catch (error) {
      console.error("V39.7.9.6 FREIGHT SAVE ERROR:", error);
      setFreightError(error?.message || "No fue posible actualizar las tarifas.");
    } finally {
      setFreightSaving(false);
    }
  }

  function updateFreightDraft(category, value) {
    setFreightRates((current) =>
      current.map((row) =>
        row.category === category ? { ...row, price_usd: value } : row
      )
    );
    setFreightMessage("");
    setFreightError("");
  }

  async function loadSatCatalogs() {
    if (!isSystemAdmin) return;
    setCatalogLoading(true);
    setCatalogError("");

    try {
      const { data, error } = await supabase.rpc(
        "list_sat_catalog_versions_admin_v397962"
      );

      if (error) throw error;

      setCatalogs(
        (Array.isArray(data) ? data : []).map((item) => ({
          id: Number(item.id),
          table_year: Number(item.table_year),
          is_active: Boolean(item.is_active),
          import_status: item.import_status || null,
          total_records: Number(item.total_records || 0),
          created_at: item.created_at || null,
          activated_at: item.activated_at || null,
        }))
      );
    } catch (error) {
      console.error("V39.7.9.6.2 SAT CATALOG LOAD ERROR:", error);
      setCatalogError(
        error?.message ||
          "No fue posible leer las versiones de la Tabla de Valores SAT."
      );
    } finally {
      setCatalogLoading(false);
    }
  }

  async function importSatCatalog() {
    if (!catalogFile || catalogImporting) return;

    const year = Number(catalogYear);
    if (!Number.isInteger(year) || year < 2020 || year > 2200) {
      setCatalogError("Ingresá un año SAT válido.");
      return;
    }

    const duplicated = catalogs.some((item) => Number(item.table_year) === year);
    if (duplicated) {
      setCatalogError(
        `Ya existe una versión SAT ${year}. No se creará otra versión con el mismo año.`
      );
      return;
    }

    const accepted = window.confirm(
      `Se preparará la Tabla SAT ${year} desde "${catalogFile.name}".\n\n` +
        "La versión actual NO se desactivará. La nueva tabla quedará pendiente de activación manual al terminar."
    );
    if (!accepted) return;

    setCatalogImporting(true);
    setCatalogError("");
    setCatalogMessage("");
    setCatalogProgress({ done: 0, total: 0, label: "Leyendo archivo..." });

    try {
      if (!/\.csv$/i.test(catalogFile.name)) {
        throw new Error(
          "La restauración segura acepta el CSV normalizado de SAT. No cargués el PDF bruto directamente."
        );
      }

      const rawText = await catalogFile.text();
      const rawRows = parseCsv(rawText);

      const normalizedRows = rawRows
        .map((row, index) => {
          const vehicleType = String(row.vehicle_type || "").trim();
          const make = String(row.make || "").trim();
          const line = String(row.line || "").trim();
          const taxableValue = cleanNumber(row.taxable_value);

          if (!vehicleType || !make || !line || taxableValue === null || taxableValue < 0) {
            throw new Error(
              `Fila ${index + 2}: faltan tipo, marca, línea o valor imponible válido.`
            );
          }

          return {
            vehicle_type: vehicleType,
            make,
            line,
            engine_cc: cleanNumber(row.engine_cc, true),
            cylinders: cleanNumber(row.cylinders, true),
            doors: cleanNumber(row.doors, true),
            fuel_type: String(row.fuel_type || "").trim() || null,
            seats: cleanNumber(row.seats, true),
            model_year: cleanNumber(row.model_year, true),
            taxable_value: taxableValue,
            sat_table_year: year,
            is_rest_of_years:
              cleanBoolean(row.is_rest_of_years) ||
              row.model_year === null ||
              row.model_year === undefined ||
              String(row.model_year).trim() === "",
          };
        });

      if (!normalizedRows.length) {
        throw new Error("El CSV no contiene registros para importar.");
      }

      const modelYears = Array.from(
        new Set(
          normalizedRows
            .map((row) => row.model_year)
            .filter((value) => Number.isInteger(value))
        )
      ).sort((a, b) => b - a);

      const sha256 = await sha256File(catalogFile);

      setCatalogProgress({
        done: 0,
        total: normalizedRows.length,
        label: "Preparando versión SAT...",
      });

      const prepared = await rpcWithVariants(
        supabase,
        "prepare_sat_catalog_version_admin_v39619",
        [
          {
            p_table_year: year,
            p_source_file_name: catalogFile.name,
            p_source_sha256: sha256 || null,
            p_source_file_size: catalogFile.size,
            p_base_row_count: normalizedRows.length,
            p_expanded_row_count: normalizedRows.length,
            p_pdf_year_columns: modelYears,
          },
        ]
      );

      const versionId = Number(
        prepared?.version_id ??
          prepared?.id ??
          (Array.isArray(prepared) ? prepared[0]?.version_id ?? prepared[0]?.id : null)
      );

      if (!Number.isInteger(versionId) || versionId <= 0) {
        throw new Error("La preparación SAT no devolvió un version_id válido.");
      }

      const batchSize = 500;
      let imported = 0;

      for (let start = 0; start < normalizedRows.length; start += batchSize) {
        const batch = normalizedRows.slice(start, start + batchSize);

        const response = await rpcWithVariants(
          supabase,
          "import_sat_catalog_batch_admin_v39619",
          [
            { p_version_id: versionId, p_rows: batch },
          ]
        );

        const inserted = Number(
          response?.inserted_rows ??
            (Array.isArray(response) ? response[0]?.inserted_rows : null) ??
            batch.length
        );

        if (!Number.isFinite(inserted) || inserted <= 0) {
          throw new Error(
            `La importación SAT se detuvo en el lote que inicia en la fila ${start + 2}.`
          );
        }

        imported += inserted;

        setCatalogProgress({
          done: Math.min(imported, normalizedRows.length),
          total: normalizedRows.length,
          label: `Importando registros SAT ${year}...`,
        });
      }

      const validationReport = {
        parser: "NORMALIZED_CSV_V39796",
        source_filename: catalogFile.name,
        source_sha256: sha256 || null,
        parsed_rows: normalizedRows.length,
        expanded_rows: normalizedRows.length,
        imported_rows: imported,
        blocking_errors: 0,
        duplicate_rows: 0,
        model_years: modelYears,
      };

      setCatalogProgress({
        done: normalizedRows.length,
        total: normalizedRows.length,
        label: "Validando versión...",
      });

      await rpcWithVariants(
        supabase,
        "finalize_sat_catalog_import_admin_v39619",
        [
          { p_version_id: versionId, p_validation: validationReport },
        ]
      );

      setCatalogMessage(
        `Tabla SAT ${year} importada y validada. La versión anterior sigue activa hasta que presionés “Activar”.`
      );
      setCatalogFile(null);
      await loadSatCatalogs();
    } catch (error) {
      console.error("V39.7.9.6 SAT IMPORT ERROR:", error);
      setCatalogError(
        error?.message || "No fue posible importar la nueva Tabla de Valores SAT."
      );
    } finally {
      setCatalogImporting(false);
      setCatalogProgress((current) => ({ ...current, label: "" }));
    }
  }

  async function activateCatalog(item) {
    if (!item?.id || activatingId) return;

    const year = Number(item.table_year);
    const accepted = window.confirm(
      `¿Activar la Tabla SAT ${year}?\n\n` +
        `La tabla activa actual${activeCatalog ? ` (${activeCatalog.table_year})` : ""} dejará de ser la principal. ` +
        "Las cotizaciones nuevas usarán la nueva versión. Las cotizaciones históricas no se recalculan."
    );
    if (!accepted) return;

    setActivatingId(item.id);
    setCatalogError("");
    setCatalogMessage("");

    try {
      await rpcWithVariants(
        supabase,
        "activate_sat_catalog_version_admin_v39619",
        [
          { p_version_id: Number(item.id) },
        ]
      );

      await loadSatCatalogs();
      setCatalogMessage(`Tabla SAT ${year} activada correctamente.`);
    } catch (error) {
      console.error("V39.7.9.6 SAT ACTIVATE ERROR:", error);
      setCatalogError(error?.message || "No fue posible activar la Tabla SAT.");
    } finally {
      setActivatingId(null);
    }
  }

  useEffect(() => {
    if (!isSystemAdmin) return;
    loadFreightRates();
    loadSatCatalogs();
  }, [isSystemAdmin]);

  if (!isSystemAdmin) return null;

  const progressPercent =
    catalogProgress.total > 0
      ? Math.min(
          100,
          Math.round((catalogProgress.done / catalogProgress.total) * 100)
        )
      : 0;

  return (
    <div className="config-pro-panels">
      <section className="settings-card freight-settings-card config-pro-card">
        <div className="settings-card-head">
          <div className="settings-icon">🚢</div>
          <div>
            <span className="section-label">TRANSPORTE MARÍTIMO</span>
            <h2>Tarifas de flete</h2>
            <p>
              Modificá los precios utilizados automáticamente por el cotizador
              según el largo del vehículo.
            </p>
          </div>
        </div>

        <div className="config-pro-safe-note">
          <span>🔒</span>
          <div>
            <strong>Rangos protegidos</strong>
            <small>
              Solo modificás el precio. El cambio aplica a cotizaciones nuevas;
              las cotizaciones guardadas conservan su valor histórico.
            </small>
          </div>
        </div>

        {freightLoading ? (
          <div className="config-pro-loading">Cargando tarifas de flete...</div>
        ) : (
          <form onSubmit={saveFreightRates}>
            <div className="config-pro-rate-grid">
              {freightRates.map((row) => (
                <article
                  key={row.category}
                  className={`config-pro-rate-item ${row.active ? "" : "inactive"}`}
                >
                  <div className="config-pro-rate-copy">
                    <div>
                      <strong>{row.category}</strong>
                      <span className={row.active ? "active" : ""}>
                        {row.active ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                    <small>{freightRangeLabel(row)}</small>
                  </div>

                  <label>
                    <span>USD</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.price_usd}
                      disabled={!row.active || freightSaving}
                      onChange={(event) =>
                        updateFreightDraft(row.category, event.target.value)
                      }
                    />
                  </label>
                </article>
              ))}
            </div>

            {freightError && (
              <div className="customer-message error">{freightError}</div>
            )}
            {freightMessage && (
              <div className="customer-message success">{freightMessage}</div>
            )}

            <div className="settings-actions config-pro-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={freightLoading || freightSaving || !freightRates.length}
              >
                {freightSaving ? "Guardando..." : "Guardar tarifas de flete"}{" "}
                <span>→</span>
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={loadFreightRates}
                disabled={freightLoading || freightSaving}
              >
                ↻ Recargar
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="settings-card config-pro-card sat-catalog-card">
        <div className="settings-card-head">
          <div className="settings-icon">📊</div>
          <div>
            <span className="section-label">TABLA DE VALORES SAT</span>
            <h2>Versiones del catálogo</h2>
            <p>
              Prepará una nueva tabla, validala y activala sin reemplazar
              silenciosamente la versión que hoy utiliza el cotizador.
            </p>
          </div>
        </div>

        <div className="sat-active-summary">
          <div className="sat-active-icon">✓</div>
          <div>
            <span>VERSIÓN ACTIVA</span>
            <strong>
              {activeCatalog ? `SAT ${activeCatalog.table_year}` : "Sin versión detectada"}
            </strong>
            <small>
              {activeCatalog?.activated_at
                ? `Activada ${formatDate(activeCatalog.activated_at)}`
                : "El motor siempre consulta la versión marcada como activa."}
            </small>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={loadSatCatalogs}
            disabled={catalogLoading || catalogImporting}
          >
            {catalogLoading ? "Cargando..." : "↻ Actualizar"}
          </button>
        </div>

        <div className="sat-catalog-list">
          {catalogs.map((item) => (
            <article
              className={`sat-catalog-version ${item.is_active ? "active" : ""}`}
              key={item.id}
            >
              <div>
                <span className="sat-year">SAT {item.table_year}</span>
                <strong>
                  {item.is_active
                    ? "Versión activa"
                    : normalizeCatalogStatus(item.import_status)}
                </strong>
                <small>
                  Versión registrada en Supabase
                  {item.total_records
                    ? ` · ${Number(item.total_records).toLocaleString("es-GT")} registros`
                    : ""}
                </small>
              </div>

              {item.is_active ? (
                <span className="sat-active-badge">ACTIVA</span>
              ) : (
                <button
                  type="button"
                  className="secondary-button sat-activate-button"
                  onClick={() => activateCatalog(item)}
                  disabled={
                    catalogImporting ||
                    activatingId !== null ||
                    (item.import_status &&
                      !["READY", "LISTA", "VALIDATED"].includes(
                        String(item.import_status).toUpperCase()
                      ))
                  }
                >
                  {activatingId === item.id ? "Activando..." : "Activar"}
                </button>
              )}
            </article>
          ))}

          {!catalogLoading && catalogs.length === 0 && (
            <div className="config-pro-empty">
              No se encontraron versiones SAT disponibles para este administrador.
            </div>
          )}
        </div>

        <div className="sat-import-box">
          <div className="sat-import-head">
            <div>
              <span className="section-label">NUEVA VERSIÓN</span>
              <h3>Cargar tabla normalizada</h3>
              <p>
                Utiliza el mismo formato CSV normalizado que ya usamos para
                SAT 2026. La nueva tabla NO se activa automáticamente.
              </p>
            </div>
            <span className="sat-safe-pill">🛡 Activación manual</span>
          </div>

          <div className="sat-import-grid">
            <label>
              <span>Año de la Tabla SAT</span>
              <input
                type="number"
                min="2020"
                max="2200"
                value={catalogYear}
                disabled={catalogImporting}
                onChange={(event) => {
                  setCatalogYear(event.target.value);
                  setCatalogError("");
                }}
              />
            </label>

            <label className="sat-file-field">
              <span>CSV normalizado</span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={catalogImporting}
                onChange={(event) => {
                  setCatalogFile(event.target.files?.[0] || null);
                  setCatalogError("");
                  setCatalogMessage("");
                }}
              />
              <small>
                Columnas base: vehicle_type, make, line, taxable_value y los
                condicionantes del vehículo.
              </small>
            </label>
          </div>

          {catalogFile && (
            <div className="sat-file-ready">
              <span>▤</span>
              <div>
                <strong>{catalogFile.name}</strong>
                <small>{(catalogFile.size / 1024 / 1024).toFixed(2)} MB</small>
              </div>
            </div>
          )}

          {catalogImporting && (
            <div className="sat-progress">
              <div>
                <strong>{catalogProgress.label || "Procesando..."}</strong>
                <span>
                  {catalogProgress.total
                    ? `${catalogProgress.done.toLocaleString("es-GT")} / ${catalogProgress.total.toLocaleString("es-GT")}`
                    : "Preparando..."}
                </span>
              </div>
              <div className="sat-progress-track">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}

          {catalogError && (
            <div className="customer-message error">{catalogError}</div>
          )}
          {catalogMessage && (
            <div className="customer-message success">{catalogMessage}</div>
          )}

          <div className="settings-actions config-pro-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!catalogFile || catalogImporting}
              onClick={importSatCatalog}
            >
              {catalogImporting ? "Importando..." : "Preparar nueva Tabla SAT"}{" "}
              <span>→</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
