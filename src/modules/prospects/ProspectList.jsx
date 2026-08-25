import "./prospects.css";

export default function ProspectList({
  prospects = [],
  loading = false,
  page = 1,
  pageSize = 20,
  onPageChange,
  onOpen,
  onRefresh,
}) {
  const total = prospects.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const visible = prospects.slice(start, end);

  return (
    <section className="prospects-list-card">
      <div className="prospects-list-head">
        <div>
          <span className="section-label">BASE DE PROSPECTOS</span>
          <h2>
            {loading
              ? "Cargando..."
              : `${total} prospecto${total === 1 ? "" : "s"}`}
          </h2>
          {!loading && total > 0 && (
            <small className="prospect-range">
              Mostrando {start + 1}–{end} de {total}
            </small>
          )}
        </div>

        <button
          className="secondary-button"
          onClick={onRefresh}
          disabled={loading}
        >
          ↻ Actualizar
        </button>
      </div>

      <div className="prospects-table-wrap">
        <table className="prospects-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Consultas</th>
              <th>Último vehículo</th>
              <th>Actividad</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {!loading && total === 0 && (
              <tr>
                <td colSpan="6" className="empty-cell">
                  No hay prospectos que coincidan con la búsqueda.
                </td>
              </tr>
            )}

            {visible.map((item) => (
              <tr key={item.contact_key}>
                <td>
                  <strong>{item.full_name || "Cliente sin nombre"}</strong>
                  <small>{item.email || "Sin correo"}</small>
                  <small>{item.phone || "Sin celular"}</small>
                </td>

                <td>
                  <strong>{item.used_count || 0} / 3</strong>
                  <small>{item.query_count || 0} registradas</small>
                </td>

                <td>
                  <strong>{item.latest_vehicle || "—"}</strong>
                  <small>{item.latest_vin || "Sin VIN registrado"}</small>
                </td>

                <td>
                  <strong>
                    {item.updated_at
                      ? new Date(item.updated_at).toLocaleDateString("es-GT")
                      : "—"}
                  </strong>
                  <small>
                    {item.updated_at
                      ? new Date(item.updated_at).toLocaleTimeString("es-GT", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </small>
                </td>

                <td>
                  <span
                    className={`lead-status ${(
                      item.lead_status || "NUEVO"
                    ).toLowerCase()}`}
                  >
                    {item.lead_status || "NUEVO"}
                  </span>
                </td>

                <td>
                  <button
                    className="prospect-open-button"
                    onClick={() => onOpen?.(item)}
                  >
                    Ver detalle →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <footer className="prospect-pagination">
          <div className="prospect-pagination-info">
            <span>RESULTADOS</span>
            <strong>
              {start + 1}–{end} <em>de {total}</em>
            </strong>
          </div>

          <div className="prospect-pagination-controls">
            <button
              type="button"
              className="prospect-page-button"
              disabled={safePage <= 1}
              onClick={() => onPageChange?.(safePage - 1)}
            >
              <span>←</span>
              Anterior
            </button>

            <div className="prospect-page-counter">
              <small>PÁGINA</small>
              <strong>{safePage}</strong>
              <span>/ {totalPages}</span>
            </div>

            <button
              type="button"
              className="prospect-page-button next"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange?.(safePage + 1)}
            >
              Siguiente
              <span>→</span>
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}
