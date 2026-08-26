import { useEffect, useMemo, useState } from "react";
import "./declarations.css";
import CustomerAutocomplete from "../customers/CustomerAutocomplete";

const SERVICE_TYPES = [
  ["VEHICULOS", "Vehículos", 165],
  ["MERCADERIA", "Mercadería", 250],
  ["MERCADERIA_ESPECIAL", "Mercadería Especial", 350],
  ["GESTOR_PARTICULAR", "Gestor Particular", 250],
  ["RECTIFICACION_GESTOR_PARTICULAR", "Rectificación Gestor Particular", 200],
  ["CONTENEDOR", "Contenedor", 250],
  ["RECTIFICACION", "Rectificación", 165],
  ["TRANSITOS", "Tránsitos", 500],
  ["EXCEPCIONAL", "Cobro Excepcional", 0],
];

function money(value) {
  return `Q ${Number(value || 0).toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DeclarationsPage({ supabase, isAdmin = false }) {
  const [items, setItems] = useState([]);
  const [stock, setStock] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    declaration_date: new Date().toISOString().slice(0, 10),
    client_id: null,
    client_name: "",
    client_reference: "",
    service_type: "VEHICULOS",
    charge_gtq: 165,
    description: "",
  });

  async function load() {
    setLoading(true);
    setError("");

    try {
      const { data, error: listError } = await supabase.rpc(
        "list_declaration_services_secure",
        {
          p_search: search.trim() || null,
        }
      );

      if (listError) throw listError;

      const { data: stockRows, error: stockError } = await supabase.rpc(
        "get_duca_stock_summary"
      );

      if (stockError) throw stockError;

      setItems(data || []);
      setStock(Array.isArray(stockRows) ? stockRows[0] : stockRows);
    } catch (err) {
      console.error("DECLARATIONS SECURE LOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar las declaraciones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function changeType(value) {
    const selected = SERVICE_TYPES.find(([key]) => key === value);

    setForm((prev) => ({
      ...prev,
      service_type: value,
      charge_gtq:
        value === "EXCEPCIONAL"
          ? ""
          : selected?.[2] || 0,
    }));
  }

  async function createDeclaration(event) {
    event.preventDefault();

    if (!form.client_name.trim()) {
      setError("Ingresá el nombre del cliente.");
      return;
    }

    if (
      isAdmin &&
      form.service_type === "EXCEPCIONAL" &&
      Number(form.charge_gtq || 0) <= 0
    ) {
      setError("Ingresá el cobro excepcional.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "create_declaration_service_secure_v33",
        {
          p_declaration_date: form.declaration_date,
          p_client_id: form.client_id || null,
          p_client_name: form.client_name.trim(),
          p_client_reference: form.client_reference.trim() || null,
          p_service_type: form.service_type,
          p_admin_charge_gtq:
            isAdmin && form.service_type === "EXCEPCIONAL"
              ? Number(form.charge_gtq || 0)
              : null,
          p_description: form.description.trim() || null,
        }
      );

      if (rpcError) throw rpcError;

      const row = Array.isArray(data) ? data[0] : data;

      setMessage(
        row?.correlative_number
          ? `Declaración ${row.declaration_code} creada con correlativo ${row.correlative_number}.`
          : `Declaración ${row?.declaration_code || ""} creada.`
      );

      setShowForm(false);
      setForm({
        declaration_date: new Date().toISOString().slice(0, 10),
        client_id: null,
        client_name: "",
        client_reference: "",
        service_type: "VEHICULOS",
        charge_gtq: 165,
        description: "",
      });

      await load();
    } catch (err) {
      console.error("CREATE DECLARATION SECURE ERROR:", err);
      setError(err?.message || "No fue posible crear la declaración.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id, status) {
    setError("");

    try {
      const { error: updateError } = await supabase.rpc(
        "update_declaration_status_secure",
        {
          p_declaration_id: id,
          p_status: status,
        }
      );

      if (updateError) throw updateError;
      await load();
    } catch (err) {
      setError(err?.message || "No fue posible actualizar la declaración.");
    }
  }

  async function adjustCharge(item) {
    if (!isAdmin) return;

    const input = window.prompt(
      `Cobro para ${item.declaration_code} · ${item.service_label}`,
      String(item.charge_gtq ?? "")
    );

    if (input === null) return;

    const amount = Number(input);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Ingresá un cobro válido.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { error: rpcError } = await supabase.rpc(
        "set_declaration_charge_admin",
        {
          p_declaration_id: item.id,
          p_charge_gtq: amount,
        }
      );

      if (rpcError) throw rpcError;

      setMessage(
        `Cobro de ${item.declaration_code} actualizado a ${money(amount)}.`
      );
      await load();
    } catch (err) {
      setError(err?.message || "No fue posible actualizar el cobro.");
    } finally {
      setSaving(false);
    }
  }

  const totals = useMemo(() => {
    if (!isAdmin) return null;

    return items.reduce(
      (acc, item) => {
        acc.billed += Number(item.charge_gtq || 0);
        acc.paid += Number(item.paid_gtq || 0);
        acc.pending += Number(item.pending_gtq || 0);
        return acc;
      },
      { billed: 0, paid: 0, pending: 0 }
    );
  }, [items, isAdmin]);

  return (
    <section className="declarations-module">
      <header className="declarations-header">
        <div>
          <span className="section-label">CONTROL ADUANAL</span>
          <h1>Declaraciones</h1>
          <p>DUCAs elaboradas para clientes externos y servicios puntuales.</p>
        </div>

        <button
          className="declaration-create-button"
          onClick={() => {
            setShowForm(true);
            setError("");
            setMessage("");
          }}
        >
          ＋ Nueva declaración
        </button>
      </header>

      <section
        className={`declaration-kpis ${
          !isAdmin ? "declaration-kpis-operational" : ""
        }`}
      >
        <article>
          <span>Declaraciones</span>
          <strong>{items.length}</strong>
        </article>

        {isAdmin && (
          <>
            <article>
              <span>Facturado</span>
              <strong>{money(totals?.billed)}</strong>
            </article>
            <article>
              <span>Por cobrar</span>
              <strong>{money(totals?.pending)}</strong>
            </article>
          </>
        )}

        <article
          className={Number(stock?.available || 0) <= 10 ? "warning" : ""}
        >
          <span>Correlativos disponibles</span>
          <strong>{stock?.available ?? 0}</strong>
          <small>
            {Number(stock?.available || 0) <= 5
              ? "STOCK CRÍTICO"
              : Number(stock?.available || 0) <= 10
                ? "Stock bajo"
                : "Stock suficiente"}
          </small>
        </article>
      </section>

      {!isAdmin && (
        <div className="declaration-operational-notice">
          📄 Vista operativa · La información financiera está restringida a
          Administración.
        </div>
      )}

      {message && <div className="customer-message success">{message}</div>}
      {error && <div className="customer-message error">{error}</div>}

      <section className="declarations-list-card">
        <div className="declarations-list-head">
          <div>
            <span className="section-label">BASE DE DECLARACIONES</span>
            <h2>{loading ? "Cargando..." : `${items.length} registros`}</h2>
          </div>

          <div className="declaration-search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente, declaración, correlativo..."
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
            />
            <button onClick={load}>Buscar</button>
          </div>
        </div>

        <div className="declarations-table-wrap">
          <table className="declarations-table">
            <thead>
              <tr>
                <th>Declaración</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Correlativo DUCA</th>
                {isAdmin && <th>Cobro</th>}
                <th>Estado</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>

            <tbody>
              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? "8" : "6"}
                    className="empty-cell"
                  >
                    No hay declaraciones registradas.
                  </td>
                </tr>
              )}

              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.declaration_code}</strong>
                    <small>{item.client_reference || "Sin referencia"}</small>
                  </td>

                  <td>{item.declaration_date}</td>

                  <td>
                    <strong>{item.client_name}</strong>
                  </td>

                  <td>{item.service_label}</td>

                  <td>
                    {item.correlative_number ? (
                      <span className="duca-correlative-badge">
                        {item.correlative_number}
                      </span>
                    ) : (
                      <span className="duca-correlative-missing">
                        SIN ASIGNAR
                      </span>
                    )}
                  </td>

                  {isAdmin && (
                    <td>
                      {Number(item.charge_gtq || 0) > 0 ? (
                        <>
                          <strong>{money(item.charge_gtq)}</strong>
                          <small>
                            Costo correlativo:{" "}
                            {money(item.correlative_cost_gtq)}
                          </small>
                        </>
                      ) : (
                        <span className="declaration-charge-pending">
                          COBRO PENDIENTE
                        </span>
                      )}
                    </td>
                  )}

                  <td>
                    <select
                      value={item.status}
                      onChange={(e) =>
                        updateStatus(item.id, e.target.value)
                      }
                    >
                      <option value="EN_ELABORACION">En elaboración</option>
                      <option value="FINALIZADA">Finalizada</option>
                      <option value="ANULADA">Anulada</option>
                    </select>
                  </td>

                  {isAdmin && (
                    <td>
                      <button
                        type="button"
                        className="declaration-adjust-charge"
                        onClick={() => adjustCharge(item)}
                        disabled={saving}
                      >
                        Ajustar cobro
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div
          className="declaration-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setShowForm(false);
            }
          }}
        >
          <form className="declaration-modal" onSubmit={createDeclaration}>
            <header>
              <div>
                <span className="section-label">NUEVA DUCA</span>
                <h2>Registrar declaración</h2>
                <p>
                  El correlativo se asignará automáticamente del inventario
                  disponible.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </header>

            <div className="declaration-form-grid">
              <label>
                <span>Fecha</span>
                <input
                  type="date"
                  value={form.declaration_date}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      declaration_date: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                <span>Cliente</span>
                <CustomerAutocomplete
                  supabase={supabase}
                  value={form.client_name}
                  clientId={form.client_id}
                  required
                  placeholder="Escribí nombre o empresa..."
                  onSelect={(client) =>
                    setForm((p) => ({
                      ...p,
                      client_id: client.id || null,
                      client_name: client.name || "",
                    }))
                  }
                />
              </label>

              <label>
                <span>Referencia del cliente</span>
                <input
                  value={form.client_reference}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      client_reference: e.target.value,
                    }))
                  }
                  placeholder="Opcional"
                />
              </label>

              <label>
                <span>Tipo de servicio</span>
                <select
                  value={form.service_type}
                  onChange={(e) => changeType(e.target.value)}
                >
                  {SERVICE_TYPES.map(([key, label, price]) => (
                    <option key={key} value={key}>
                      {isAdmin && price
                        ? `${label} · Q${price}`
                        : label}
                    </option>
                  ))}
                </select>
              </label>

              {isAdmin && (
                <label>
                  <span>Cobro al cliente (Q)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.charge_gtq}
                    readOnly={form.service_type !== "EXCEPCIONAL"}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        charge_gtq: e.target.value,
                      }))
                    }
                  />
                  {form.service_type === "EXCEPCIONAL" && (
                    <small>Ingresá manualmente el valor excepcional.</small>
                  )}
                </label>
              )}

              {!isAdmin && form.service_type === "EXCEPCIONAL" && (
                <div className="declaration-exceptional-admin-note">
                  <strong>Cobro Excepcional</strong>
                  <span>
                    Administración definirá el valor de este servicio.
                  </span>
                </div>
              )}

              <label className="span-2">
                <span>Descripción / observación</span>
                <textarea
                  rows="3"
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? "Creando..." : "Crear y asignar correlativo"}{" "}
                <span>→</span>
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
