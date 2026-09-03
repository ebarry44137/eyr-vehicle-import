import { useEffect, useMemo, useState } from "react";
import "./importers.css";

const EMPTY_FORM = {
  id: null,
  organization_id: "",
  importer_type: "COMPANY",
  legal_name: "",
  trade_name: "",
  nit: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  office_portal_client_id: "",
  notes: "",
  active: true,
};

export default function ImportersPage({
  supabase,
  isSystemAdmin = false,
  canEdit = false,
  tenantOrganizationId = "",
  tenantBrandName = "Oficina",
}) {
  const [rows, setRows] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [portalClients, setPortalClients] = useState([]);
  const [search, setSearch] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const activeCount = useMemo(
    () => rows.filter((item) => item.active).length,
    [rows]
  );

  const portalLinked = useMemo(
    () => rows.filter((item) => item.office_portal_client_id).length,
    [rows]
  );

  const operationCount = useMemo(
    () =>
      rows.reduce(
        (sum, item) =>
          sum +
          Number(item.import_count || 0) +
          Number(item.customs_count || 0),
        0
      ),
    [rows]
  );

  async function loadOrganizations() {
    if (!isSystemAdmin) return;

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_list_portal_offices_v3922"
      );

      if (rpcError) throw rpcError;
      setOrganizations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("IMPORTERS ORGS ERROR:", err);
    }
  }

  async function loadPortalClients(organizationId) {
    if (!organizationId) {
      setPortalClients([]);
      return;
    }

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "list_office_portal_clients_v3922",
        {
          p_search: null,
          p_organization_id: organizationId,
        }
      );

      if (rpcError) throw rpcError;

      setPortalClients(
        (Array.isArray(data) ? data : []).filter((item) => item.active)
      );
    } catch (err) {
      console.error("IMPORTERS PORTAL CLIENTS ERROR:", err);
      setPortalClients([]);
    }
  }

  async function loadImporters(
    nextSearch = search,
    nextOrganization = organizationFilter
  ) {
    setLoading(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "list_office_importers_v393",
        {
          p_search: String(nextSearch || "").trim() || null,
          p_organization_id:
            isSystemAdmin &&
            nextOrganization &&
            nextOrganization !== "ALL"
              ? nextOrganization
              : null,
          p_include_inactive: true,
        }
      );

      if (rpcError) throw rpcError;
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("IMPORTERS LOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar los importadores.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrganizations();
    loadImporters("", "ALL");
  }, [isSystemAdmin]);

  function openCreate() {
    const orgId = isSystemAdmin
      ? organizationFilter !== "ALL"
        ? organizationFilter
        : organizations[0]?.id || ""
      : tenantOrganizationId;

    setForm({
      ...EMPTY_FORM,
      organization_id: orgId,
    });

    loadPortalClients(orgId);
    setError("");
    setMessage("");
    setShowModal(true);
  }

  function openEdit(item) {
    setForm({
      id: item.id,
      organization_id: item.organization_id || "",
      importer_type: item.importer_type || "COMPANY",
      legal_name: item.legal_name || "",
      trade_name: item.trade_name || "",
      nit: item.nit || "",
      contact_name: item.contact_name || "",
      email: item.email || "",
      phone: item.phone || "",
      address: item.address || "",
      office_portal_client_id: item.office_portal_client_id || "",
      notes: item.notes || "",
      active: Boolean(item.active),
    });

    loadPortalClients(item.organization_id);
    setError("");
    setMessage("");
    setShowModal(true);
  }

  async function saveImporter(event) {
    event.preventDefault();

    if (!form.contact_name.trim()) {
      setError("El nombre del contacto es obligatorio.");
      return;
    }

    if (isSystemAdmin && !form.organization_id) {
      setError("Seleccioná la oficina propietaria del importador.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "save_office_importer_v393",
        {
          p_id: form.id || null,
          p_organization_id: form.organization_id || null,
          p_importer_type: form.importer_type,
          p_legal_name: form.legal_name.trim() || null,
          p_trade_name: form.trade_name.trim() || null,
          p_nit: form.nit.trim() || null,
          p_contact_name: form.contact_name.trim(),
          p_email: form.email.trim() || null,
          p_phone: form.phone.trim() || null,
          p_address: form.address.trim() || null,
          p_office_portal_client_id:
            form.office_portal_client_id || null,
          p_notes: form.notes.trim() || null,
          p_active: Boolean(form.active),
        }
      );

      if (rpcError) throw rpcError;

      setMessage(
        form.id
          ? "Importador actualizado correctamente."
          : "Importador registrado correctamente."
      );
      setShowModal(false);
      await loadImporters(search, organizationFilter);
    } catch (err) {
      console.error("IMPORTER SAVE ERROR:", err);
      setError(err?.message || "No fue posible guardar el importador.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="impdir-module">
      <header className="impdir-header">
        <div>
          <span className="impdir-eyebrow">
            {isSystemAdmin
              ? "ADMINISTRACIÓN GLOBAL · V39.3"
              : "FULL OFFICE · V39.3"}
          </span>
          <h1>Directorio de Importadores</h1>
          <p>
            Registro maestro para reutilizar el mismo importador en Gestiones de
            Importación, Control Aduanal y próximamente Importer PRO.
          </p>
        </div>

        {canEdit && (
          <button className="impdir-primary" onClick={openCreate}>
            ＋ Nuevo importador
          </button>
        )}
      </header>

      <section className="impdir-kpis">
        <article>
          <span>Importadores</span>
          <strong>{rows.length}</strong>
          <small>en la vista actual</small>
        </article>
        <article>
          <span>Activos</span>
          <strong>{activeCount}</strong>
          <small>disponibles para selección</small>
        </article>
        <article>
          <span>Con Portal</span>
          <strong>{portalLinked}</strong>
          <small>acceso vinculado</small>
        </article>
        <article>
          <span>Operaciones</span>
          <strong>{operationCount}</strong>
          <small>importación + aduana</small>
        </article>
      </section>

      <section className="impdir-panel">
        <div className="impdir-panel-head">
          <div>
            <span className="impdir-eyebrow">
              {isSystemAdmin ? "DIRECTORIO GLOBAL" : tenantBrandName}
            </span>
            <h2>Importadores registrados</h2>
          </div>
          <span>{rows.length} registro(s)</span>
        </div>

        <form
          className={`impdir-search ${isSystemAdmin ? "global" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            loadImporters(search, organizationFilter);
          }}
        >
          {isSystemAdmin && (
            <select
              value={organizationFilter}
              onChange={(e) => {
                const next = e.target.value;
                setOrganizationFilter(next);
                loadImporters(search, next);
              }}
            >
              <option value="ALL">Todas las oficinas</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          )}

          <div>
            <span>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar importador, NIT, contacto, correo o teléfono..."
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>

        {error && <div className="impdir-message error">{error}</div>}
        {message && <div className="impdir-message success">{message}</div>}

        {loading ? (
          <div className="impdir-empty">
            <strong>Cargando importadores...</strong>
          </div>
        ) : rows.length === 0 ? (
          <div className="impdir-empty">
            <span>🚢</span>
            <strong>No hay importadores registrados.</strong>
            <p>
              Creá el primer registro para empezar a reutilizarlo en las
              operaciones de la oficina.
            </p>
            {canEdit && (
              <button className="impdir-primary" onClick={openCreate}>
                ＋ Registrar importador
              </button>
            )}
          </div>
        ) : (
          <div className="impdir-table-wrap">
            <table className="impdir-table">
              <thead>
                <tr>
                  <th>Importador</th>
                  {isSystemAdmin && <th>Oficina</th>}
                  <th>NIT</th>
                  <th>Contacto</th>
                  <th>Portal</th>
                  <th>PRO</th>
                  <th>Operaciones</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="impdir-name">
                        <span>
                          {(item.display_name || "I").charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <strong>{item.display_name}</strong>
                          <small>
                            {item.importer_type === "PERSON"
                              ? "Persona individual"
                              : item.legal_name || "Empresa"}
                          </small>
                        </div>
                      </div>
                    </td>

                    {isSystemAdmin && (
                      <td>
                        <strong>{item.organization_name}</strong>
                      </td>
                    )}

                    <td>{item.nit || "—"}</td>

                    <td>
                      <strong>{item.contact_name}</strong>
                      <small>{item.email || item.phone || "—"}</small>
                    </td>

                    <td>
                      {item.office_portal_client_id ? (
                        <span className="impdir-pill portal">
                          ✓ {item.portal_client_name || "Vinculado"}
                        </span>
                      ) : (
                        <span className="impdir-pill muted">Sin acceso</span>
                      )}
                    </td>

                    <td>
                      <span
                        className={`impdir-pill ${
                          item.pro_status === "ACTIVE" ? "pro" : "muted"
                        }`}
                      >
                        {item.pro_status === "ACTIVE"
                          ? "IMPORTER PRO"
                          : "No activo"}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {Number(item.import_count || 0) +
                          Number(item.customs_count || 0)}
                      </strong>
                    </td>

                    <td>
                      <span
                        className={`impdir-pill ${
                          item.active ? "active" : "inactive"
                        }`}
                      >
                        {item.active ? "ACTIVO" : "INACTIVO"}
                      </span>
                    </td>

                    <td>
                      {canEdit && (
                        <button
                          className="impdir-edit"
                          onClick={() => openEdit(item)}
                        >
                          Editar →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="impdir-info">
        <span>🧩</span>
        <div>
          <strong>Preparado para Importer PRO</strong>
          <p>
            El registro ya incluye la relación futura con usuario PRO. No
            necesitaremos crear otra tabla maestra cuando construyamos el
            dashboard del importador.
          </p>
        </div>
      </section>

      {showModal && (
        <div
          className="impdir-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setShowModal(false);
            }
          }}
        >
          <form className="impdir-modal" onSubmit={saveImporter}>
            <header>
              <div>
                <span className="impdir-eyebrow">
                  {form.id ? "EDITAR IMPORTADOR" : "NUEVO IMPORTADOR"}
                </span>
                <h2>
                  {form.id ? "Actualizar registro" : "Registrar importador"}
                </h2>
                <p>
                  Este registro podrá seleccionarse desde cualquier gestión de
                  esta oficina.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                ×
              </button>
            </header>

            <div className="impdir-form-grid">
              {isSystemAdmin && (
                <label className="full">
                  <span>Oficina propietaria *</span>
                  <select
                    required
                    value={form.organization_id}
                    onChange={(e) => {
                      const orgId = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        organization_id: orgId,
                        office_portal_client_id: "",
                      }));
                      loadPortalClients(orgId);
                    }}
                  >
                    <option value="">Seleccionar oficina</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                <span>Tipo *</span>
                <select
                  value={form.importer_type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      importer_type: e.target.value,
                    }))
                  }
                >
                  <option value="COMPANY">Empresa</option>
                  <option value="PERSON">Persona individual</option>
                </select>
              </label>

              <label>
                <span>NIT</span>
                <input
                  value={form.nit}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, nit: e.target.value }))
                  }
                  placeholder="Ej. 1234567-8"
                />
              </label>

              <label className="full">
                <span>Nombre comercial</span>
                <input
                  value={form.trade_name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      trade_name: e.target.value,
                    }))
                  }
                  placeholder="Ej. Importadora del Caribe"
                />
              </label>

              <label className="full">
                <span>Razón social / nombre legal</span>
                <input
                  value={form.legal_name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      legal_name: e.target.value,
                    }))
                  }
                  placeholder="Nombre legal registrado"
                />
              </label>

              <label className="full">
                <span>Nombre del contacto *</span>
                <input
                  required
                  value={form.contact_name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      contact_name: e.target.value,
                    }))
                  }
                  placeholder="Nombre completo"
                />
              </label>

              <label>
                <span>Correo</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </label>

              <label>
                <span>Teléfono</span>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </label>

              <label className="full">
                <span>Dirección</span>
                <input
                  value={form.address}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                />
              </label>

              <label className="full">
                <span>Cliente del Portal vinculado</span>
                <select
                  value={form.office_portal_client_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      office_portal_client_id: e.target.value,
                    }))
                  }
                >
                  <option value="">— Sin acceso al Portal —</option>
                  {portalClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {[
                        client.company_name || client.contact_name,
                        client.company_name ? client.contact_name : "",
                        client.email,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </option>
                  ))}
                </select>
                <small>
                  Opcional. Podés registrar al importador sin crearle acceso.
                </small>
              </label>

              <label className="full">
                <span>Observaciones</span>
                <textarea
                  rows="3"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                />
              </label>

              <label className="impdir-check full">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      active: e.target.checked,
                    }))
                  }
                />
                <span>Importador activo y disponible para nuevas gestiones</span>
              </label>
            </div>

            <footer>
              <button
                type="button"
                className="impdir-secondary"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="impdir-primary"
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar importador →"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
