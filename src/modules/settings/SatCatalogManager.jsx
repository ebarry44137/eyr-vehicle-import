import { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizedRowsToCsv,
  parseSatPdf,
} from "./satPdfParser.js";
import "./sat-catalog-manager.css";

const BATCH_SIZE = 800;

function formatNumber(value) {
  return new Intl.NumberFormat("es-GT").format(Number(value || 0));
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

function statusLabel(status, active) {
  if (active) return "ACTIVA";
  const normalized = String(status || "").toUpperCase();
  const map = {
    PROCESSING: "PROCESANDO",
    READY: "LISTA",
    FAILED: "CON ERROR",
    ARCHIVED: "HISTÓRICA",
    DRAFT: "BORRADOR",
    ACTIVE: "ACTIVA",
  };
  return map[normalized] || normalized || "HISTÓRICA";
}

function statusClass(status, active) {
  if (active) return "active";
  const normalized = String(status || "").toUpperCase();
  if (normalized === "READY") return "ready";
  if (normalized === "PROCESSING") return "processing";
  if (normalized === "FAILED") return "failed";
  return "archived";
}

export default function SatCatalogManager({ supabase, isAdmin = false }) {
  const inputRef = useRef(null);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [tableYear, setTableYear] = useState("");
  const [parsed, setParsed] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activatingId, setActivatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, text: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeVersion = useMemo(
    () => versions.find((item) => item.is_active),
    [versions]
  );

  useEffect(() => {
    if (!isAdmin) return;
    loadVersions();
  }, [isAdmin]);

  useEffect(() => {
    if (tableYear) return;
    const activeYear = Number(activeVersion?.table_year || 0);
    if (activeYear > 0) {
      setTableYear(String(activeYear + 1));
    }
  }, [activeVersion, tableYear]);

  async function loadVersions() {
    setLoadingVersions(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "list_sat_catalog_versions_admin_v39619"
      );
      if (rpcError) throw rpcError;

      setVersions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("SAT VERSIONS LOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar las versiones SAT.");
    } finally {
      setLoadingVersions(false);
    }
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setParsed(null);
    setMessage("");
    setError("");
    setProgress({ percent: 0, text: "" });

    if (!file) return;

    const year = Number(tableYear);
    if (!Number.isInteger(year)) {
      setError("Ingresá primero el año de la nueva tabla SAT.");
      return;
    }

    setParsing(true);

    try {
      const result = await parseSatPdf(file, year, (state) => {
        const text =
          state.stage === "PARSING"
            ? `Leyendo PDF · página ${state.current} de ${state.total}`
            : state.stage === "VALIDATING"
            ? "Validando estructura y condicionantes..."
            : "PDF validado correctamente.";

        setProgress({
          percent: state.percent || 0,
          text,
        });
      });

      setParsed(result);
      setMessage(
        `PDF validado: ${formatNumber(result.validation.base_rows)} líneas base y ${formatNumber(result.validation.expanded_rows)} registros normalizados.`
      );
    } catch (err) {
      console.error("SAT PDF PARSE ERROR:", err);
      setError(err?.message || "No fue posible procesar el PDF SAT.");
    } finally {
      setParsing(false);
    }
  }

  function resetSelection() {
    setSelectedFile(null);
    setParsed(null);
    setProgress({ percent: 0, text: "" });
    setMessage("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadParsedVersion() {
    if (!parsed || uploading) return;

    setUploading(true);
    setMessage("");
    setError("");

    try {
      setProgress({
        percent: 56,
        text: "Preparando nueva versión SAT...",
      });

      const { data: prepareData, error: prepareError } = await supabase.rpc(
        "prepare_sat_catalog_version_admin_v39619",
        {
          p_table_year: parsed.tableYear,
          p_source_file_name: parsed.sourceFileName,
          p_source_sha256: parsed.sourceSha256,
          p_source_file_size: parsed.sourceFileSize,
          p_base_row_count: parsed.validation.base_rows,
          p_expanded_row_count: parsed.validation.expanded_rows,
          p_pdf_year_columns: parsed.years,
        }
      );

      if (prepareError) throw prepareError;

      const versionId = Number(prepareData?.version_id);
      if (!Number.isFinite(versionId)) {
        throw new Error("Supabase no devolvió el ID de la nueva versión.");
      }

      const totalBatches = Math.ceil(
        parsed.expandedRows.length / BATCH_SIZE
      );

      for (let index = 0; index < totalBatches; index += 1) {
        const start = index * BATCH_SIZE;
        const batch = parsed.expandedRows.slice(
          start,
          start + BATCH_SIZE
        );

        const { error: batchError } = await supabase.rpc(
          "import_sat_catalog_batch_admin_v39619",
          {
            p_version_id: versionId,
            p_rows: batch,
          }
        );

        if (batchError) throw batchError;

        const uploadPercent =
          56 + Math.round(((index + 1) / totalBatches) * 37);

        setProgress({
          percent: Math.min(uploadPercent, 93),
          text: `Cargando registros · lote ${index + 1} de ${totalBatches}`,
        });
      }

      setProgress({
        percent: 95,
        text: "Ejecutando validación final en Supabase...",
      });

      const { data: finalData, error: finalError } = await supabase.rpc(
        "finalize_sat_catalog_import_admin_v39619",
        {
          p_version_id: versionId,
          p_validation: parsed.validation,
        }
      );

      if (finalError) throw finalError;

      setProgress({
        percent: 100,
        text: "Nueva tabla lista para activar.",
      });

      setMessage(
        `SAT ${parsed.tableYear} quedó cargada y validada con ${formatNumber(finalData?.total_rows || parsed.validation.expanded_rows)} registros. SAT ${activeVersion?.table_year || "actual"} sigue activa hasta que presionés Activar.`
      );

      await loadVersions();
    } catch (err) {
      console.error("SAT VERSION UPLOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar la nueva tabla SAT.");
    } finally {
      setUploading(false);
    }
  }

  async function activateVersion(version) {
    if (!version?.id || activatingId) return;

    const ok = window.confirm(
      `¿Activar SAT ${version.table_year}?\n\nLas cotizaciones nuevas usarán esta tabla. La versión anterior quedará guardada como histórica y podrá restaurarse.`
    );

    if (!ok) return;

    setActivatingId(version.id);
    setMessage("");
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "activate_sat_catalog_version_admin_v39619",
        { p_version_id: version.id }
      );

      if (rpcError) throw rpcError;

      setMessage(
        `✅ SAT ${data?.table_year || version.table_year} quedó activa. El motor de VIN utilizará automáticamente esta versión.`
      );

      await loadVersions();
      resetSelection();
    } catch (err) {
      console.error("SAT ACTIVATE ERROR:", err);
      setError(err?.message || "No fue posible activar la versión SAT.");
    } finally {
      setActivatingId(null);
    }
  }

  async function deleteDraft(version) {
    if (!version?.id || version?.is_active || deletingId) return;

    const ok = window.confirm(
      `¿Eliminar el borrador SAT ${version.table_year}? Esta acción solo afecta esa versión no activa.`
    );

    if (!ok) return;

    setDeletingId(version.id);
    setMessage("");
    setError("");

    try {
      const { error: rpcError } = await supabase.rpc(
        "delete_sat_catalog_draft_admin_v39619",
        { p_version_id: version.id }
      );

      if (rpcError) throw rpcError;

      setMessage(`Borrador SAT ${version.table_year} eliminado.`);
      await loadVersions();
    } catch (err) {
      console.error("SAT DELETE DRAFT ERROR:", err);
      setError(err?.message || "No fue posible eliminar el borrador.");
    } finally {
      setDeletingId(null);
    }
  }

  function downloadNormalizedCsv() {
    if (!parsed?.expandedRows?.length) return;

    const csv = normalizedRowsToCsv(parsed.expandedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `SAT-${parsed.tableYear}-normalizada.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (!isAdmin) return null;

  return (
    <section className="settings-card sat-catalog-card">
      <div className="settings-card-head">
        <div className="settings-icon sat-catalog-icon">🇬🇹</div>
        <div>
          <span className="section-label">CATÁLOGO OFICIAL SAT</span>
          <h2>Tabla de Valores SAT</h2>
          <p>
            Cargá el PDF oficial. E&R lo convierte, valida y versiona sin
            reemplazar la tabla vigente hasta que vos decidás activarla.
          </p>
        </div>
      </div>

      <div className="sat-active-summary">
        <div>
          <small>VERSIÓN ACTIVA</small>
          <strong>
            {activeVersion ? `SAT ${activeVersion.table_year}` : "Sin versión activa"}
          </strong>
          <span>
            {activeVersion
              ? `${formatNumber(activeVersion.total_rows)} registros en producción`
              : "Revisá la configuración de la base."}
          </span>
        </div>
        <div className="sat-active-shield">🛡️</div>
      </div>

      <div className="sat-upload-panel">
        <div className="sat-upload-copy">
          <strong>Subir nueva tabla oficial</strong>
          <span>
            No compara montos contra el año anterior. Valida el año desde la fila real del encabezado,
            estructura, condicionantes y consistencia del documento.
          </span>
        </div>

        <div className="sat-year-file-row">
          <label>
            <span>Año de la tabla</span>
            <input
              type="number"
              min="2000"
              max="2100"
              step="1"
              value={tableYear}
              onChange={(event) => {
                setTableYear(event.target.value);
                resetSelection();
              }}
              disabled={parsing || uploading}
            />
          </label>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={handleFileSelected}
          />

          <button
            type="button"
            className="sat-select-pdf"
            onClick={() => inputRef.current?.click()}
            disabled={parsing || uploading || !tableYear}
          >
            {parsing ? "Analizando PDF..." : "📄 Seleccionar PDF de SAT"}
          </button>
        </div>

        {selectedFile && (
          <div className="sat-selected-file">
            <span>PDF seleccionado</span>
            <strong>{selectedFile.name}</strong>
            <small>
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </small>
          </div>
        )}

        {(parsing || uploading || progress.percent > 0) && (
          <div className="sat-progress-wrap">
            <div className="sat-progress-head">
              <span>{progress.text || "Procesando..."}</span>
              <strong>{progress.percent || 0}%</strong>
            </div>
            <div className="sat-progress-track">
              <i style={{ width: `${Math.max(0, Math.min(progress.percent, 100))}%` }} />
            </div>
          </div>
        )}

        {parsed && (
          <div className="sat-validation-result">
            <div className="sat-validation-badge">✓</div>
            <div>
              <small>VALIDACIÓN AUTOMÁTICA SUPERADA</small>
              <h3>SAT {parsed.tableYear} lista para cargar</h3>
              <p>
                {formatNumber(parsed.validation.base_rows)} líneas del PDF ·{" "}
                {formatNumber(parsed.validation.expanded_rows)} registros
                normalizados · {parsed.pageCount} páginas.
              </p>
            </div>
          </div>
        )}

        {parsed && (
          <div className="sat-validation-grid">
            <article>
              <span>Columnas de años</span>
              <strong>
                {parsed.years[0]}–{parsed.years.at(-1)}
              </strong>
              <small>+ Resto de Años</small>
            </article>
            <article>
              <span>Condicionantes incompletos</span>
              <strong>0</strong>
              <small>Tipo, marca, línea, CC, cilindros, puertas, combustible y asientos</small>
            </article>
            <article>
              <span>Duplicados</span>
              <strong>{parsed.validation.duplicate_rows}</strong>
              <small>Debe permanecer en cero</small>
            </article>
            <article>
              <span>Valores en Q0.00</span>
              <strong>{formatNumber(parsed.validation.zero_values)}</strong>
              <small>Permitidos: SAT puede publicarlos así</small>
            </article>
          </div>
        )}

        {error && <div className="customer-message error">{error}</div>}
        {message && <div className="customer-message success">{message}</div>}

        {parsed && (
          <div className="sat-upload-actions">
            <button
              type="button"
              className="primary-button"
              onClick={uploadParsedVersion}
              disabled={uploading || parsing}
            >
              {uploading
                ? "Cargando tabla..."
                : `Cargar SAT ${parsed.tableYear} como nueva versión`}{" "}
              <span>→</span>
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={downloadNormalizedCsv}
              disabled={uploading}
            >
              Descargar respaldo CSV
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={resetSelection}
              disabled={uploading}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="sat-history">
        <div className="sat-history-head">
          <div>
            <span className="section-label">HISTORIAL</span>
            <h3>Versiones del catálogo</h3>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={loadVersions}
            disabled={loadingVersions}
          >
            {loadingVersions ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {loadingVersions ? (
          <div className="sat-history-empty">Cargando versiones...</div>
        ) : versions.length === 0 ? (
          <div className="sat-history-empty">
            No hay versiones disponibles.
          </div>
        ) : (
          <div className="sat-version-list">
            {versions.map((version) => {
              const status = statusLabel(
                version.import_status,
                version.is_active
              );

              return (
                <article
                  className={`sat-version-row ${
                    version.is_active ? "current" : ""
                  }`}
                  key={version.id}
                >
                  <div className="sat-version-year">
                    <small>CATÁLOGO</small>
                    <strong>SAT {version.table_year}</strong>
                  </div>

                  <div className="sat-version-data">
                    <span>Registros</span>
                    <strong>{formatNumber(version.total_rows)}</strong>
                  </div>

                  <div className="sat-version-data">
                    <span>Archivo</span>
                    <strong>{version.source_file_name || "Carga histórica"}</strong>
                  </div>

                  <div className="sat-version-data">
                    <span>Actualización</span>
                    <strong>
                      {formatDate(
                        version.activated_at ||
                          version.imported_at ||
                          version.created_at
                      )}
                    </strong>
                  </div>

                  <span
                    className={`sat-version-status ${statusClass(
                      version.import_status,
                      version.is_active
                    )}`}
                  >
                    {status}
                  </span>

                  <div className="sat-version-actions">
                    {!version.is_active &&
                      String(version.import_status || "").toUpperCase() ===
                        "READY" && (
                        <button
                          type="button"
                          className="sat-activate-button"
                          onClick={() => activateVersion(version)}
                          disabled={Boolean(activatingId)}
                        >
                          {activatingId === version.id
                            ? "Activando..."
                            : "✓ Activar"}
                        </button>
                      )}

                    {!version.is_active &&
                      ["READY", "FAILED", "PROCESSING", "DRAFT"].includes(
                        String(version.import_status || "").toUpperCase()
                      ) && (
                        <button
                          type="button"
                          className="sat-delete-button"
                          onClick={() => deleteDraft(version)}
                          disabled={Boolean(deletingId)}
                        >
                          {deletingId === version.id
                            ? "Eliminando..."
                            : "Eliminar"}
                        </button>
                      )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="sat-safety-note">
        <span>🔒</span>
        <div>
          <strong>Protección de producción</strong>
          <p>
            La tabla activa nunca se borra durante una carga. La nueva versión
            se procesa aparte y solo entra en producción cuando supera las
            validaciones y un administrador la activa.
          </p>
        </div>
      </div>
    </section>
  );
}
