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
  if (!prospect) return null;

  const count = Array.isArray(queries) ? queries.length : 0;

  return (
    <div className="prospect-drawer-backdrop" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose?.();
    }}>
      <aside className="prospect-detail-drawer">
        <header className="prospect-drawer-header">
          <div>
            <span className="section-label">EXPEDIENTE COMERCIAL</span>
            <h2>{prospect.full_name || "Cliente"}</h2>
            <div className="prospect-drawer-status-row">
              <span className={`lead-status ${String(prospect.lead_status || "NUEVO").toLowerCase()}`}>
                {prospect.lead_status || "NUEVO"}
              </span>
              <small>· {count} consulta{count === 1 ? "" : "s"}</small>
            </div>
          </div>

          <button
            type="button"
            className="prospect-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="prospect-drawer-scroll">
          <section className="prospect-contact-card">
            <div>
              <small>CORREO</small>
              <strong>{prospect.email || "—"}</strong>
            </div>
            <div>
              <small>CELULAR</small>
              <strong>{prospect.phone || "—"}</strong>
            </div>
            <div>
              <small>CLAVE COMERCIAL</small>
              <strong>{prospect.contact_key || "—"}</strong>
            </div>
          </section>

          {prospect.phone && buildWhatsAppUrl && (
            <a
              className="whatsapp-action prospect-whatsapp"
              href={buildWhatsAppUrl(
                prospect.phone,
                `Hola ${prospect.full_name || ""}, te contactamos de E&R Solutions.`
              )}
              target="_blank"
              rel="noreferrer"
            >
              <span className="whatsapp-icon">💬</span>
              Contactar por WhatsApp
            </a>
          )}

          {statusForm && setStatusForm && (
            <section className="prospect-drawer-section">
              <div className="prospect-drawer-section-title">
                <span className="section-label">SEGUIMIENTO</span>
                <h3>Estado comercial</h3>
              </div>

              <div className="prospect-followup">
                <label>
                  <span>Estado</span>
                  <select
                    value={statusForm.status || "NUEVO"}
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
                  <span>Notas</span>
                  <textarea
                    rows="3"
                    value={statusForm.notes || ""}
                    onChange={(e) =>
                      setStatusForm((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="Ej. Se llamó, interesado en traer el vehículo..."
                  />
                </label>

                <button
                  className="primary-button"
                  type="button"
                  onClick={onSaveStatus}
                  disabled={saving}
                >
                  {saving ? "Guardando..." : "Guardar seguimiento"}
                </button>

                {message && (
                  <div className="customer-message success">{message}</div>
                )}
              </div>
            </section>
          )}

          <section className="prospect-query-history prospect-drawer-section">
            <div className="prospect-history-title">
              <div>
                <span className="section-label">CONSULTAS REALIZADAS</span>
                <h3>Historial del prospecto</h3>
              </div>
              <strong>
                {queriesLoading
                  ? "Cargando..."
                  : `${count} consulta${count === 1 ? "" : "s"}`}
              </strong>
            </div>

            {!queriesLoading && count === 0 && (
              <div className="prospect-empty-history">
                Este prospecto todavía no tiene consultas registradas.
              </div>
            )}

            {queries.map((q) => {
              const isImporter =
                String(q.calculation_method || "SAT").toUpperCase() === "IMPORTER";

              const importerBase =
                Number(q.invoice_taxable_value_gtq || 0) > 0
                  ? Number(q.invoice_taxable_value_gtq)
                  : (
                      Number(q.invoice_value_usd || 0) > 0 &&
                      Number(q.invoice_exchange_rate || 0) > 0
                    )
                    ? Number(q.invoice_value_usd) * Number(q.invoice_exchange_rate)
                    : null;

              return (
                <article className="prospect-query-item" key={q.id}>
                  <div className="prospect-query-top">
                    <div>
                      <strong>
                        {[q.model_year, q.make, q.model, q.vehicle_trim]
                          .filter(Boolean)
                          .join(" ") || "Vehículo consultado"}
                      </strong>
                      <small>{q.vin}</small>

                      {isImporter && (
                        <span className="importer-history-badge">
                          🧾 IMPORTADOR · FACTURA REAL
                        </span>
                      )}
                    </div>

                    <span className={`query-result ${String(q.calculation_status || "").toLowerCase()}`}>
                      {q.calculation_status || "—"}
                    </span>
                  </div>

                  <dl>
                    {isImporter ? (
                      <>
                        <div>
                          <dt>Factura</dt>
                          <dd>
                            {Number(q.invoice_value_usd || 0) > 0
                              ? moneyUSD?.(q.invoice_value_usd)
                              : "—"}
                          </dd>
                        </div>

                        <div className="importer-base-value">
                          <dt>Valor factura GTQ</dt>
                          <dd>
                            {importerBase
                              ? moneyGTQ?.(importerBase)
                              : "—"}
                          </dd>
                          {Number(q.invoice_exchange_rate || 0) > 0 && (
                            <small>
                              TC Q {Number(q.invoice_exchange_rate).toFixed(4)}
                            </small>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <dt>Línea SAT</dt>
                          <dd>{q.sat_line || "Pendiente de revisión"}</dd>
                        </div>

                        <div>
                          <dt>Valor SAT</dt>
                          <dd>
                            {Number(q.sat_value_gtq || 0) > 0
                              ? moneyGTQ?.(q.sat_value_gtq)
                              : "—"}
                          </dd>
                        </div>
                      </>
                    )}

                    <div>
                      <dt>Tributos</dt>
                      <dd>
                        {Number(q.total_taxes_gtq || 0) > 0
                          ? moneyGTQ?.(q.total_taxes_gtq)
                          : "—"}
                      </dd>
                    </div>

                    <div>
                      <dt>Flete</dt>
                      <dd>
                        {Number(q.freight_usd || 0) > 0
                          ? moneyUSD?.(q.freight_usd)
                          : "—"}
                      </dd>
                    </div>
                  </dl>

                  {q.calculation_status === "READY" && (
                    <div className="prospect-import-actions">
                      <div>
                        <small>✓ CÁLCULO READY</small>
                        <span>Lista para preparar propuesta comercial E&R</span>
                      </div>

                      {onGenerateQuotation && (
                        <button
                          type="button"
                          className="primary-button prospect-generate-quote"
                          onClick={() => onGenerateQuotation(q)}
                          disabled={quoteLoadingId === q.id}
                        >
                          {quoteLoadingId === q.id
                            ? "Preparando..."
                            : "Preparar cotización final →"}
                        </button>
                      )}
                    </div>
                  )}

                  {onConvertManagement && !q.import_management_id && (
                    <div className="prospect-management-action">
                      <button
                        type="button"
                        onClick={() => onConvertManagement(q)}
                        disabled={convertingQueryId === q.id}
                      >
                        {convertingQueryId === q.id
                          ? "Creando gestión..."
                          : "Convertir a gestión"}
                      </button>
                    </div>
                  )}

                  {q.import_management_id && onOpenManagements && (
                    <div className="prospect-quote-generated">
                      <span>✓ Gestión creada</span>
                      <button type="button" onClick={onOpenManagements}>
                        Ver gestiones →
                      </button>
                    </div>
                  )}

                  <small className="prospect-query-date">
                    {q.created_at
                      ? new Date(q.created_at).toLocaleString("es-GT")
                      : ""}
                  </small>
                </article>
              );
            })}
          </section>
        </div>
      </aside>
    </div>
  );
}
