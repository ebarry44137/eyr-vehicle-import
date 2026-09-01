import { useEffect, useState } from "react";
import "./admin-center.css";

function money(v) {
  return `Q ${Number(v || 0).toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdminCenterPage({ supabase }) {
  const [tab, setTab] = useState("customers");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");

  async function search(nextTab = tab) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_search_records",
        {
          p_entity: nextTab,
          p_search: query.trim() || null,
        }
      );

      if (rpcError) throw rpcError;
      setRows(data || []);
      setSelected(null);
    } catch (err) {
      console.error("ADMIN SEARCH ERROR:", err);
      setError(err?.message || "No fue posible cargar la información.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit() {
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_get_audit_log",
        { p_limit: 100 }
      );
      if (rpcError) throw rpcError;
      setAudit(data || []);
    } catch (err) {
      setError(err?.message || "No fue posible cargar la bitácora.");
    }
  }

  useEffect(() => {
    if (tab === "audit") loadAudit();
    else search(tab);
  }, [tab]);

  function open(row) {
    setSelected(JSON.parse(JSON.stringify(row)));
    setReason("");
    setError("");
    setMessage("");
  }

  async function saveCustomer() {
    if (!selected) return;
    if (!reason.trim()) {
      setError("Ingresá el motivo de la corrección.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("admin_update_customer", {
        p_id: selected.id,
        p_name: selected.name,
        p_nit: selected.nit || null,
        p_phone: selected.phone || null,
        p_email: selected.email || null,
        p_reason: reason.trim(),
      });
      if (rpcError) throw rpcError;
      setMessage("Cliente actualizado y cambio registrado en bitácora.");
      await search();
    } catch (err) {
      setError(err?.message || "No fue posible actualizar el cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCustoms() {
    if (!selected) return;
    if (!reason.trim()) {
      setError("Ingresá el motivo de la corrección.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc(
        "admin_update_customs_case",
        {
          p_id: selected.id,
          p_client_name: selected.client_name,
          p_vin: selected.vin || null,
          p_bl: selected.bl || null,
          p_container_number: selected.container_number || null,
          p_shipping_line: selected.shipping_line || null,
          p_notice_date: selected.notice_date || null,
          p_status: selected.current_status || null,
          p_reason: reason.trim(),
        }
      );
      if (rpcError) throw rpcError;
      setMessage("Expediente actualizado y auditado.");
      await search();
    } catch (err) {
      setError(err?.message || "No fue posible actualizar el expediente.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCustomsCase() {
    if (!selected) return;

    if (!reason.trim()) {
      setError("Ingresá el motivo antes de eliminar o anular el expediente.");
      return;
    }

    const confirmed = window.confirm(
      `⚠️ ACCIÓN ADMINISTRATIVA\n\n` +
        `${selected.primary_label} · ${selected.client_name}\n\n` +
        `Si el expediente no tiene pagos ni pertenece a un período cerrado, se eliminará y su correlativo DUCA quedará disponible nuevamente.\n\n` +
        `Si ya tiene movimientos financieros, el sistema lo ANULARÁ sin borrar su historial.\n\n` +
        `¿Querés continuar?`
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_remove_customs_case",
        {
          p_id: selected.id,
          p_reason: reason.trim(),
        }
      );

      if (rpcError) throw rpcError;

      const action = Array.isArray(data) ? data[0] : data;

      setMessage(
        action === "DELETED"
          ? "Expediente duplicado eliminado. Si tenía correlativo DUCA, quedó disponible nuevamente."
          : "El expediente tenía movimientos protegidos y fue ANULADO sin borrar su historial."
      );

      setSelected(null);
      setReason("");
      await search("customs");
    } catch (err) {
      console.error("ADMIN REMOVE CUSTOMS ERROR:", err);
      setError(err?.message || "No fue posible eliminar/anular el expediente.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDeclaration() {
    if (!selected) return;
    if (!reason.trim()) {
      setError("Ingresá el motivo de la corrección.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc(
        "admin_update_declaration_manual",
        {
          p_id: selected.id,
          p_client_name: selected.client_name,
          p_client_reference: selected.client_reference || null,
          p_service_type: selected.service_type,
          p_status: selected.status,
          p_charge_gtq: Number(selected.charge_gtq || 0),
          p_description: selected.description || null,
          p_reason: reason.trim(),
        }
      );
      if (rpcError) throw rpcError;
      setMessage("Declaración actualizada y auditada.");
      await search();
    } catch (err) {
      setError(err?.message || "No fue posible actualizar la declaración.");
    } finally {
      setSaving(false);
    }
  }

  async function reassignCorrelative() {
    if (!selected) return;
    if (!reason.trim()) {
      setError("Ingresá el motivo de la corrección.");
      return;
    }

    const newNumber = window.prompt(
      "Nuevo correlativo DUCA disponible:",
      selected.correlative_number || ""
    );
    if (newNumber === null) return;

    setSaving(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc(
        "admin_reassign_duca_correlative",
        {
          p_target_type: selected.target_type,
          p_target_id: selected.target_id,
          p_new_correlative_number: newNumber.trim(),
          p_reason: reason.trim(),
        }
      );
      if (rpcError) throw rpcError;
      setMessage("Correlativo reasignado correctamente y auditado.");
      await search();
    } catch (err) {
      setError(err?.message || "No fue posible reasignar el correlativo.");
    } finally {
      setSaving(false);
    }
  }

  function field(label, key, type = "text") {
    return (
      <label>
        <span>{label}</span>
        <input
          type={type}
          value={selected?.[key] ?? ""}
          onChange={(e) =>
            setSelected((p) => ({ ...p, [key]: e.target.value }))
          }
        />
      </label>
    );
  }

  return (
    <section className="admin-center">
      <header className="admin-center-header">
        <div>
          <span>CENTRO ADMINISTRATIVO</span>
          <h1>Correcciones y Overrides</h1>
          <p>
            Modificaciones manuales con trazabilidad completa para casos excepcionales.
          </p>
        </div>
      </header>

      <div className="admin-tabs">
        {[
          ["customers", "Clientes"],
          ["customs", "Expedientes"],
          ["declarations", "Declaraciones"],
          ["correlatives", "Correlativos DUCA"],
          ["audit", "Bitácora"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "audit" && (
        <div className="admin-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, código, VIN, BL o correlativo..."
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button onClick={() => search()} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>
      )}

      {message && <div className="admin-message success">{message}</div>}
      {error && <div className="admin-message error">{error}</div>}

      {tab === "audit" ? (
        <section className="admin-audit-card">
          <div className="admin-card-head">
            <div>
              <span>BITÁCORA ADMINISTRATIVA</span>
              <h2>Últimos cambios</h2>
            </div>
            <button onClick={loadAudit}>↻ Actualizar</button>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Administrador</th>
                  <th>Entidad</th>
                  <th>Registro</th>
                  <th>Acción</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.created_at).toLocaleString("es-GT")}</td>
                    <td>{item.admin_name || item.admin_email}</td>
                    <td>{item.entity_type}</td>
                    <td>{item.entity_label}</td>
                    <td>{item.action}</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="admin-layout">
          <section className="admin-list-card">
            <div className="admin-card-head">
              <div>
                <span>RESULTADOS</span>
                <h2>{rows.length} registros</h2>
              </div>
            </div>

            <div className="admin-record-list">
              {rows.map((row) => (
                <button
                  key={`${row.entity_type}-${row.id}`}
                  className={selected?.id === row.id ? "active" : ""}
                  onClick={() => open(row)}
                >
                  <div>
                    <strong>{row.primary_label}</strong>
                    <span>{row.secondary_label}</span>
                  </div>
                  <small>{row.tertiary_label}</small>
                </button>
              ))}

              {!loading && rows.length === 0 && (
                <div className="admin-empty">No hay resultados.</div>
              )}
            </div>
          </section>

          <section className="admin-editor-card">
            {!selected ? (
              <div className="admin-empty">
                Seleccioná un registro para modificarlo.
              </div>
            ) : (
              <>
                <div className="admin-card-head">
                  <div>
                    <span>EDICIÓN ADMINISTRATIVA</span>
                    <h2>{selected.primary_label}</h2>
                  </div>
                </div>

                <div className="admin-editor-body">
                  {tab === "customers" && (
                    <div className="admin-form-grid">
                      {field("Nombre / empresa", "name")}
                      {field("NIT", "nit")}
                      {field("Teléfono", "phone")}
                      {field("Correo", "email", "email")}
                    </div>
                  )}

                  {tab === "customs" && (
                    <div className="admin-form-grid">
                      {field("Cliente", "client_name")}
                      {field("VIN", "vin")}
                      {field("BL", "bl")}
                      {field("Contenedor", "container_number")}
                      {field("Naviera", "shipping_line")}
                      {field("Fecha de ingreso", "notice_date", "date")}
                      {field("Estado", "current_status")}
                      <div className="admin-readonly">
                        <span>Correlativo DUCA</span>
                        <strong>{selected.duca_correlative_number || "Sin asignar"}</strong>
                      </div>
                    </div>
                  )}

                  {tab === "declarations" && (
                    <div className="admin-form-grid">
                      {field("Cliente", "client_name")}
                      {field("Referencia", "client_reference")}
                      <label>
                        <span>Tipo de servicio</span>
                        <select
                          value={selected.service_type || ""}
                          onChange={(e) =>
                            setSelected((p) => ({
                              ...p,
                              service_type: e.target.value,
                            }))
                          }
                        >
                          <option value="VEHICULOS">Vehículos</option>
                          <option value="MERCADERIA">Mercadería</option>
                          <option value="MERCADERIA_ESPECIAL">Mercadería Especial</option>
                          <option value="GESTOR_PARTICULAR">Gestor Particular</option>
                          <option value="RECTIFICACION_GESTOR_PARTICULAR">Rectificación Gestor Particular</option>
                          <option value="CONTENEDOR">Contenedor</option>
                          <option value="RECTIFICACION">Rectificación</option>
                          <option value="TRANSITOS">Tránsitos</option>
                          <option value="EXCEPCIONAL">Cobro Excepcional</option>
                        </select>
                      </label>
                      <label>
                        <span>Estado</span>
                        <select
                          value={selected.status || ""}
                          onChange={(e) =>
                            setSelected((p) => ({ ...p, status: e.target.value }))
                          }
                        >
                          <option value="EN_ELABORACION">En elaboración</option>
                          <option value="FINALIZADA">Finalizada</option>
                          <option value="ANULADA">Anulada</option>
                        </select>
                      </label>
                      {field("Cobro (Q)", "charge_gtq", "number")}
                      <label className="span-2">
                        <span>Descripción</span>
                        <textarea
                          rows="3"
                          value={selected.description || ""}
                          onChange={(e) =>
                            setSelected((p) => ({
                              ...p,
                              description: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="admin-readonly span-2">
                        <span>Correlativo DUCA</span>
                        <strong>{selected.correlative_number || "Sin asignar"}</strong>
                      </div>
                    </div>
                  )}

                  {tab === "correlatives" && (
                    <div className="admin-correlative-editor">
                      <div className="admin-readonly">
                        <span>Correlativo actual</span>
                        <strong>{selected.correlative_number}</strong>
                      </div>
                      <div className="admin-readonly">
                        <span>Asignado a</span>
                        <strong>{selected.target_code || "Sin asignar"}</strong>
                      </div>
                      <div className="admin-readonly">
                        <span>Estado</span>
                        <strong>{selected.status}</strong>
                      </div>
                    </div>
                  )}

                  <label className="admin-reason">
                    <span>Motivo de la corrección *</span>
                    <textarea
                      rows="3"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ej. Cliente solicitó corrección de BL / correlativo asignado incorrectamente..."
                    />
                  </label>

                  <div className="admin-editor-actions">
                    {tab === "customers" && (
                      <button onClick={saveCustomer} disabled={saving}>
                        Guardar corrección
                      </button>
                    )}
                    {tab === "customs" && (
                      <>
                        <button onClick={saveCustoms} disabled={saving}>
                          Guardar expediente
                        </button>
                        <button
                          className="secondary"
                          onClick={reassignCorrelative}
                          disabled={saving}
                        >
                          Cambiar correlativo DUCA
                        </button>
                        <button
                          className="danger"
                          onClick={removeCustomsCase}
                          disabled={saving}
                        >
                          Eliminar / Anular expediente
                        </button>
                      </>
                    )}
                    {tab === "declarations" && (
                      <>
                        <button onClick={saveDeclaration} disabled={saving}>
                          Guardar declaración
                        </button>
                        <button
                          className="secondary"
                          onClick={reassignCorrelative}
                          disabled={saving}
                        >
                          Cambiar correlativo DUCA
                        </button>
                      </>
                    )}
                    {tab === "correlatives" && (
                      <button onClick={reassignCorrelative} disabled={saving}>
                        Reasignar correlativo
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
