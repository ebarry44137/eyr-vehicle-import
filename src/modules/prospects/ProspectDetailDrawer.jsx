import { useEffect } from "react";
import "./prospects.css";

export default function ProspectDetailDrawer({
  prospect,
  queries = [],
  queriesLoading = false,
  statusForm,
  setStatusForm,
  saving = false,
  message = "",
  quoteLoadingId = null,
  convertingQueryId = null,
  onClose,
  onSaveStatus,
  onGenerateQuotation,
  onConvertManagement,
  onOpenManagements,
  buildWhatsAppUrl,
  moneyGTQ,
  moneyUSD,
}) {
  useEffect(() => {
    if (!prospect) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [prospect, onClose]);

  if (!prospect) return null;

  const status = prospect.lead_status || "NUEVO";
  const queryCount = Number(prospect.query_count || queries.length || 0);

  return (
    <div
      className="prospect-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <aside
        className="prospect-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${prospect.full_name || "prospecto"}`}
      >
        <header className="prospect-drawer-header">
          <div>
            <span className="section-label">EXPEDIENTE COMERCIAL</span>
            <h2>{prospect.full_name || "Cliente"}</h2>

            <div className="prospect-drawer-meta">
              <span className={`lead-status ${status.toLowerCase()}`}>
                {status}
              </span>
              <span>•</span>
              <span>{queryCount} consulta{queryCount === 1 ? "" : "s"}</span>
            </div>
          </div>

          <button
            type="button"
            className="prospect-drawer-close"
            onClick={onClose}
            aria-label="Cerrar detalle"
          >
            ×
          </button>
        </header>

        <div className="prospect-drawer-scroll">
          <section className="prospect-contact-card">
            <div>
              <small>CORREO</small>
              <strong>{prospect.email || "Sin correo"}</strong>
            </div>
            <div>
              <small>CELULAR</small>
              <strong>{prospect.phone || "Sin celular"}</strong>
            </div>
            <div>
              <small>ÚLTIMA ACTIVIDAD</small>
              <strong>
                {prospect.updated_at
                  ? new Date(prospect.updated_at).toLocaleString("es-GT")
                  : "—"}
              </strong>
            </div>
          </section>

          {prospect.phone && (
            <a
              className="whatsapp-action prospect-whatsapp"
              href={buildWhatsAppUrl(
                prospect.phone,
                `Hola ${prospect.full_name || ""}, te contactamos de E&R Solutions. Vimos que realizaste una cotización de importación de vehículo y queremos ayudarte con los siguientes pasos.`
              )}
              target="_blank"
              rel="noreferrer"
            >
              <span className="whatsapp-icon">💬</span>
              Contactar por WhatsApp
            </a>
          )}

          <section className="prospect-followup prospect-drawer-section">
            <div className="prospect-drawer-section-title">
              <span className="section-label">SEGUIMIENTO COMERCIAL</span>
              <h3>Estado y notas</h3>
            </div>

            <label>
              <span>Estado comercial</span>
              <select
                value={statusForm.status}
                onChange={(e) =>
                  setStatusForm((prev) => ({
                    ...prev,
                    status: e.target.value,
                  }))
                }
              >
                <option value="NUEVO">Nuevo</option>
                <option value="CONTACTADO">Contactado</option>
                <option value="SEGUIMIENTO">En seguimiento</option>
                <option value="CONVERTIDO">Convertido</option>
                <option value="NO_INTERESADO">No interesado</option>
              </select>
            </label>

            <label>
              <span>Notas de seguimiento</span>
              <textarea
                rows="4"
                value={statusForm.notes}
                onChange={(e) =>
                  setStatusForm((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
                placeholder="Ej. Se llamó, interesado en traer el vehículo el próximo mes..."
              />
            </label>

            <button
              className="primary-button"
              onClick={onSaveStatus}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar seguimiento"}
            </button>

            {message && (
              <div className="customer-message success">{message}</div>
            )}
          </section>

          <section className="prospect-query-history prospect-drawer-section">
            <div className="prospect-history-title">
              <div>
                <span className="section-label">CONSULTAS REALIZADAS</span>
                <h3>Historial del prospecto</h3>
              </div>
              <strong>
                {queriesLoading
                  ? "Cargando..."
                  : `${queries.length} consulta${queries.length === 1 ? "" : "s"}`}
              </strong>
            </div>

            {!queriesLoading && queries.length === 0 && (
              <div className="prospect-empty-history">
                Este prospecto es anterior al registro detallado de consultas.
                Las próximas consultas sí aparecerán aquí.
              </div>
            )}

            {queries.map((q) => (
              <article className="prospect-query-item" key={q.id}>
                <div className="prospect-query-top">
                  <div>
                    <strong>
                      {[q.model_year, q.make, q.model, q.vehicle_trim]
                        .filter(Boolean)
                        .join(" ") || "Vehículo consultado"}
                    </strong>
                    <small>{q.vin}</small>

                    {q.import_requested_at && (
                      <span className="import-request-badge">
                        🔥 Solicitó iniciar importación
                      </span>
                    )}
                  </div>

                  <span
                    className={`query-result ${String(
                      q.calculation_status || ""
                    ).toLowerCase()}`}
                  >
                    {q.calculation_status || "—"}
                  </span>
                </div>

                <dl>
                  <div>
                    <dt>Línea SAT</dt>
                    <dd>{q.sat_line || "Pendiente de revisión"}</dd>
                  </div>
                  <div>
                    <dt>Valor SAT</dt>
                    <dd>{q.sat_value_gtq ? moneyGTQ(q.sat_value_gtq) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Tributos</dt>
                    <dd>
                      {q.total_taxes_gtq
                        ? moneyGTQ(q.total_taxes_gtq)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Flete</dt>
                    <dd>{q.freight_usd ? moneyUSD(q.freight_usd) : "—"}</dd>
                  </div>
                </dl>

                {q.import_requested_at && (
                  <div className="prospect-import-actions">
                    <div>
                      <small>SOLICITUD DE IMPORTACIÓN</small>
                      <span>
                        {new Date(q.import_requested_at).toLocaleString("es-GT")}
                      </span>
                    </div>

                    <button
                      className="primary-button prospect-generate-quote"
                      onClick={() => onGenerateQuotation?.(q)}
                      disabled={
                        quoteLoadingId === q.id ||
                        q.calculation_status !== "READY"
                      }
                    >
                      {quoteLoadingId === q.id
                        ? "Preparando..."
                        : "Generar cotización"}{" "}
                      <span>→</span>
                    </button>
                  </div>
                )}

                {q.quote_generated_at && (
                  <div className="prospect-quote-generated">
                    <span>✓ Cotización {q.quote_code || ""} generada</span>

                    {q.import_management_id ? (
                      <button
                        className="prospect-management-created"
                        onClick={onOpenManagements}
                      >
                        Gestión creada · Ver →
                      </button>
                    ) : (
                      <button
                        className="primary-button prospect-convert-management"
                        onClick={() => onConvertManagement?.(q)}
                        disabled={convertingQueryId === q.id}
                      >
                        {convertingQueryId === q.id
                          ? "Creando..."
                          : "Convertir en gestión"}
                        <span>→</span>
                      </button>
                    )}
                  </div>
                )}

                <small className="prospect-query-date">
                  {q.created_at
                    ? new Date(q.created_at).toLocaleString("es-GT")
                    : ""}
                </small>
              </article>
            ))}
          </section>
        </div>
      </aside>
    </div>
  );
}
