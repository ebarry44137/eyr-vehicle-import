import { useEffect, useMemo, useState } from "react";
import "./office-portal-clients.css";

const EMPTY_FORM = {
  organization_id: "",
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  password: "",
};

export default function OfficePortalClientsPage({
  supabase,
  invokeFunction,
  officeName = "Tu oficina",
  officeSlug = "",
  isSystemAdmin = false,
}) {
  const [clients, setClients] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState(null);

  const [search, setSearch] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("ALL");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // V39.4 · Clientes existentes listos para activar Portal
  const [portalCandidates, setPortalCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [activationCandidate, setActivationCandidate] = useState(null);
  const [activationPassword, setActivationPassword] = useState("");
  const [activationEmail, setActivationEmail] = useState("");


  const activeCount = useMemo(
    () => clients.filter((item) => item.active).length,
    [clients]
  );

  const withUserCount = useMemo(
    () => clients.filter((item) => item.user_id).length,
    [clients]
  );

  const importsCount = useMemo(
    () =>
      clients.reduce(
        (total, item) => total + Number(item.import_count || 0),
        0
      ),
    [clients]
  );

  const representedOffices = useMemo(
    () =>
      new Set(
        clients
          .map((item) => item.organization_id)
          .filter(Boolean)
      ).size,
    [clients]
  );

  const selectedCreateOrganization = useMemo(() => {
    if (!isSystemAdmin) return null;

    return (
      organizations.find(
        (item) => item.id === form.organization_id
      ) || null
    );
  }, [organizations, form.organization_id, isSystemAdmin]);

  const selectedFilterOrganization = useMemo(() => {
    if (!isSystemAdmin || organizationFilter === "ALL") {
      return null;
    }

    return (
      organizations.find(
        (item) => item.id === organizationFilter
      ) || null
    );
  }, [organizations, organizationFilter, isSystemAdmin]);

  const portalUrl = useMemo(() => {
    if (isSystemAdmin) {
      const slug =
        selectedCreateOrganization?.slug ||
        selectedFilterOrganization?.slug ||
        "";

      return slug ? `/portal/${slug}` : "/portal";
    }

    return officeSlug ? `/portal/${officeSlug}` : "/portal";
  }, [
    isSystemAdmin,
    officeSlug,
    selectedCreateOrganization,
    selectedFilterOrganization,
  ]);

  async function loadOrganizations() {
    if (!isSystemAdmin) return;

    setOrgsLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_list_portal_offices_v3922"
      );

      if (rpcError) throw rpcError;

      const rows = Array.isArray(data) ? data : [];
      setOrganizations(rows);

      setForm((prev) => {
        if (prev.organization_id || !rows.length) return prev;

        const firstFullOffice =
          rows.find(
            (item) =>
              String(item.plan_code || "").toUpperCase() === "FULL_OFFICE"
          ) || rows[0];

        return {
          ...prev,
          organization_id: firstFullOffice?.id || "",
        };
      });
    } catch (err) {
      console.error("PORTAL OFFICES LOAD ERROR:", err);
      setError(
        err?.message ||
          "No fue posible cargar las oficinas para soporte."
      );
    } finally {
      setOrgsLoading(false);
    }
  }

  async function loadPortalCandidates(
    nextSearch = search,
    nextOrganization = organizationFilter
  ) {
    setCandidatesLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "list_portal_access_candidates_v394",
        {
          p_search: String(nextSearch || "").trim() || null,
          p_organization_id:
            isSystemAdmin && nextOrganization !== "ALL"
              ? nextOrganization
              : null,
        }
      );
      if (rpcError) throw rpcError;
      setPortalCandidates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("PORTAL CANDIDATES ERROR:", err);
      setError(err?.message || "No fue posible cargar clientes existentes.");
    } finally {
      setCandidatesLoading(false);
    }
  }

  async function activateCandidate(event) {
    event.preventDefault();
    if (!activationCandidate) return;

    const cleanEmail = String(activationEmail || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Ingresá un correo válido para crear el acceso.");
      return;
    }
    if (activationPassword.length < 8) {
      setError("La contraseña temporal debe tener al menos 8 caracteres.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data, error: functionError } = await invokeFunction(
        "office-client-manager",
        {
          body: {
            action: "activate_existing",
            organization_id: activationCandidate.organization_id,
            contact_name: activationCandidate.contact_name,
            company_name: activationCandidate.company_name || "",
            email: cleanEmail,
            phone: activationCandidate.phone || "",
            password: activationPassword,
          },
        }
      );
      if (functionError) throw functionError;
      if (!data?.success) throw new Error(data?.error || "No fue posible activar el Portal.");

      setMessage(data.message || "Acceso al Portal activado.");
      setActivationCandidate(null);
      setActivationEmail("");
      setActivationPassword("");
      await Promise.all([
        loadPortalCandidates(search, organizationFilter),
        loadClients(search, organizationFilter),
      ]);
    } catch (err) {
      setError(err?.message || "No fue posible activar el acceso.");
    } finally {
      setSaving(false);
    }
  }

  async function loadClients(
    nextSearch = search,
    nextOrganization = organizationFilter
  ) {
    setLoading(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "list_office_portal_clients_v3922",
        {
          p_search: String(nextSearch || "").trim() || null,
          p_organization_id:
            isSystemAdmin &&
            nextOrganization &&
            nextOrganization !== "ALL"
              ? nextOrganization
              : null,
        }
      );

      if (rpcError) throw rpcError;

      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("OFFICE PORTAL CLIENTS LOAD ERROR:", err);
      setError(
        err?.message ||
          "No fue posible cargar los clientes del portal."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isSystemAdmin) {
      loadOrganizations();
    }

    loadClients("", "ALL");
    loadPortalCandidates("", "ALL");
  }, [isSystemAdmin]);

  async function createClient(event) {
    event.preventDefault();

    const payload = {
      organization_id: isSystemAdmin
        ? form.organization_id
        : null,
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      password: form.password,
    };

    if (
      isSystemAdmin &&
      !payload.organization_id
    ) {
      setError("Seleccioná la oficina a la que pertenece el cliente.");
      return;
    }

    if (
      !payload.contact_name ||
      !payload.email ||
      !payload.password
    ) {
      setError(
        "Nombre del contacto, correo y contraseña son obligatorios."
      );
      return;
    }

    if (payload.password.length < 8) {
      setError(
        "La contraseña inicial debe tener al menos 8 caracteres."
      );
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: functionError } =
        await invokeFunction(
          "office-client-manager",
          {
            body: {
              action: "create",
              ...payload,
            },
          }
        );

      if (functionError) {
        let detail =
          functionError?.message || "";

        try {
          if (functionError?.context?.json) {
            const server =
              await functionError.context.json();

            detail =
              server?.error ||
              server?.message ||
              detail;
          }
        } catch {
          // Mantener mensaje original.
        }

        throw new Error(
          detail ||
            "No fue posible crear el cliente."
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "No fue posible crear el cliente."
        );
      }

      setMessage(
        `${payload.contact_name} ya tiene acceso al Portal de Clientes de ${
          data?.organization?.name ||
          selectedCreateOrganization?.name ||
          officeName
        }.`
      );

      setForm((prev) => ({
        ...EMPTY_FORM,
        organization_id:
          isSystemAdmin
            ? prev.organization_id
            : "",
      }));

      setShowCreate(false);

      await loadClients(
        search,
        organizationFilter
      );
    } catch (err) {
      console.error(
        "OFFICE PORTAL CLIENT CREATE ERROR:",
        err
      );

      setError(
        err?.message ||
          "No fue posible crear el cliente."
      );
    } finally {
      setSaving(false);
    }
  }

  async function runAction(
    item,
    action,
    extra = {}
  ) {
    if (!item?.id) return;

    setActionId(item.id);
    setError("");
    setMessage("");

    try {
      const { data, error: functionError } =
        await invokeFunction(
          "office-client-manager",
          {
            body: {
              action,
              client_id: item.id,
              ...extra,
            },
          }
        );

      if (functionError) {
        let detail =
          functionError?.message || "";

        try {
          if (functionError?.context?.json) {
            const server =
              await functionError.context.json();

            detail =
              server?.error ||
              server?.message ||
              detail;
          }
        } catch {
          // Mantener mensaje original.
        }

        throw new Error(
          detail ||
            "No fue posible actualizar el acceso."
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "No fue posible actualizar el acceso."
        );
      }

      setMessage(
        data?.message ||
          "Acceso actualizado correctamente."
      );

      await loadClients(
        search,
        organizationFilter
      );
    } catch (err) {
      console.error(
        "OFFICE PORTAL CLIENT ACTION ERROR:",
        err
      );

      setError(
        err?.message ||
          "No fue posible actualizar el acceso."
      );
    } finally {
      setActionId(null);
    }
  }

  async function resetPassword(item) {
    const password = window.prompt(
      `Nueva contraseña temporal para ${
        item.contact_name || item.email
      }:`
    );

    if (!password) return;

    if (password.length < 8) {
      setError(
        "La nueva contraseña debe tener al menos 8 caracteres."
      );
      return;
    }

    await runAction(
      item,
      "reset_password",
      { password }
    );
  }

  function copyPortalLink() {
    const absolute =
      `${window.location.origin}${portalUrl}`;

    navigator.clipboard
      ?.writeText(absolute)
      .then(() =>
        setMessage(
          "Enlace del portal copiado."
        )
      )
      .catch(() =>
        setMessage(`Portal: ${absolute}`)
      );
  }

  return (
    <section className="opc-module">
      <header className="opc-header">
        <div>
          <span className="opc-eyebrow">
            {isSystemAdmin
              ? "ADMINISTRACIÓN GLOBAL · SOPORTE"
              : "FULL OFFICE · PORTAL DE CLIENTES"}
          </span>

          <h1>
            {isSystemAdmin
              ? "Clientes del Portal · Global"
              : "Clientes del Portal"}
          </h1>

          <p>
            {isSystemAdmin
              ? "Consultá y administrá los accesos de todas las oficinas para soporte de la plataforma."
              : "Creá accesos para tus clientes y controlá quién puede consultar las gestiones que tu oficina le haya asignado."}
          </p>
        </div>

        <div className="opc-header-actions">
          <button
            type="button"
            className="opc-secondary"
            onClick={copyPortalLink}
          >
            🔗 Copiar enlace
          </button>

          <button
            type="button"
            className="opc-primary"
            onClick={() => {
              setShowCreate(true);
              setError("");
              setMessage("");
            }}
          >
            ＋ Nuevo cliente
          </button>
        </div>
      </header>

      <section className="opc-kpis">
        <article>
          <span>Clientes</span>
          <strong>{clients.length}</strong>
          <small>en la vista actual</small>
        </article>

        <article>
          <span>Activos</span>
          <strong>{activeCount}</strong>
          <small>con acceso</small>
        </article>

        <article>
          <span>Importaciones</span>
          <strong>{importsCount}</strong>
          <small>vinculadas</small>
        </article>

        <article>
          <span>
            {isSystemAdmin
              ? "Oficinas"
              : "Con usuario"}
          </span>
          <strong>
            {isSystemAdmin
              ? representedOffices
              : withUserCount}
          </strong>
          <small>
            {isSystemAdmin
              ? "representadas"
              : "credenciales creadas"}
          </small>
        </article>
      </section>

            <section className="opc-v394-existing">
        <div className="opc-v394-head">
          <div>
            <span className="opc-eyebrow">CLIENTES EXISTENTES · V39.4</span>
            <h2>Activar acceso al Portal</h2>
            <p>
              Estos clientes ya existen por sus Gestiones de Importación o Control Aduanal.
              No tenés que volver a registrarlos.
            </p>
          </div>
          <span>{portalCandidates.filter((item) => !item.portal_user_id).length} sin acceso</span>
        </div>

        {candidatesLoading ? (
          <div className="opc-v394-empty">Buscando clientes existentes...</div>
        ) : portalCandidates.length === 0 ? (
          <div className="opc-v394-empty">
            Todavía no encontramos clientes operativos para activar.
          </div>
        ) : (
          <div className="opc-v394-grid">
            {portalCandidates.map((item) => (
              <article key={item.candidate_key} className="opc-v394-card">
                <div>
                  <strong>{item.contact_name || item.email || "Cliente"}</strong>
                  <small>
                    {[item.organization_name, item.email, item.phone]
                      .filter(Boolean).join(" · ")}
                  </small>
                </div>
                <div className="opc-v394-meta">
                  <span>{item.operation_count || 0} operación(es)</span>
                  {item.portal_user_id ? (
                    <b className="active">PORTAL ACTIVO</b>
                  ) : (
                    <b>SIN ACCESO</b>
                  )}
                </div>
                {!item.portal_user_id && (
                  <button
                    type="button"
                    className="opc-primary"
                    onClick={() => {
                      setActivationCandidate(item);
                      setActivationEmail(item.email || "");
                      setActivationPassword("");
                      setError("");
                    }}
                  >
                    🔐 Crear acceso al Portal
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

<section className="opc-panel">
        <div className="opc-panel-head">
          <div>
            <span className="opc-eyebrow">
              {isSystemAdmin
                ? "CONSOLA GLOBAL"
                : `CLIENTES DE ${officeName.toUpperCase()}`}
            </span>

            <h2>Acceso al Portal</h2>
          </div>

          <span className="opc-result-count">
            {clients.length} cliente(s)
          </span>
        </div>

        <form
          className={`opc-search ${
            isSystemAdmin
              ? "global"
              : ""
          }`}
          onSubmit={(event) => {
            event.preventDefault();
            loadClients(
              search,
              organizationFilter
            );
          }}
        >
          {isSystemAdmin && (
            <select
              value={organizationFilter}
              onChange={(event) => {
                const next =
                  event.target.value;

                setOrganizationFilter(next);

                loadClients(
                  search,
                  next
                );
              }}
              disabled={orgsLoading}
            >
              <option value="ALL">
                Todas las oficinas
              </option>

              {organizations.map(
                (org) => (
                  <option
                    key={org.id}
                    value={org.id}
                  >
                    {org.name}
                  </option>
                )
              )}
            </select>
          )}

          <div>
            <span>⌕</span>

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Buscar empresa, cliente, correo o teléfono..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Buscando..."
              : "Buscar"}
          </button>

          {search && (
            <button
              type="button"
              className="opc-secondary"
              onClick={() => {
                setSearch("");
                loadClients(
                  "",
                  organizationFilter
                );
              }}
            >
              Limpiar
            </button>
          )}
        </form>

        {error && (
          <div className="opc-message error">
            {error}
          </div>
        )}

        {message && (
          <div className="opc-message success">
            {message}
          </div>
        )}

        {loading ? (
          <div className="opc-empty">
            <div className="opc-spinner" />
            <strong>
              Cargando clientes...
            </strong>
          </div>
        ) : clients.length === 0 ? (
          <div className="opc-empty">
            <span>👥</span>

            <strong>
              No hay clientes en esta vista.
            </strong>

            <p>
              {isSystemAdmin
                ? "Seleccioná otra oficina o creá un acceso nuevo."
                : "Creá el primer acceso para que tu cliente pueda consultar las gestiones asignadas."}
            </p>

            <button
              type="button"
              className="opc-primary"
              onClick={() =>
                setShowCreate(true)
              }
            >
              ＋ Crear cliente
            </button>
          </div>
        ) : (
          <div className="opc-table-wrap">
            <table className="opc-table">
              <thead>
                <tr>
                  <th>Cliente</th>

                  {isSystemAdmin && (
                    <th>Oficina</th>
                  )}

                  <th>Correo</th>
                  <th>Teléfono</th>
                  <th>Importaciones</th>
                  <th>Acceso</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {clients.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="opc-client-cell">
                        <span className="opc-avatar">
                          {(
                            item.company_name ||
                            item.contact_name ||
                            "C"
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </span>

                        <div>
                          <strong>
                            {item.company_name ||
                              item.contact_name}
                          </strong>

                          <small>
                            {item.company_name
                              ? item.contact_name
                              : "Cliente individual"}
                          </small>
                        </div>
                      </div>
                    </td>

                    {isSystemAdmin && (
                      <td>
                        <div className="opc-office-cell">
                          <strong>
                            {item.organization_name ||
                              "—"}
                          </strong>

                          <small>
                            {item.organization_slug ||
                              ""}
                          </small>
                        </div>
                      </td>
                    )}

                    <td>{item.email}</td>

                    <td>
                      {item.phone || "—"}
                    </td>

                    <td>
                      <strong className="opc-import-count">
                        {item.import_count || 0}
                      </strong>
                    </td>

                    <td>
                      <span
                        className={`opc-status ${
                          item.active
                            ? "active"
                            : "inactive"
                        }`}
                      >
                        {item.active
                          ? "ACTIVO"
                          : "INACTIVO"}
                      </span>
                    </td>

                    <td>
                      <div className="opc-row-actions">
                        <button
                          type="button"
                          className="opc-action"
                          disabled={
                            actionId === item.id
                          }
                          onClick={() =>
                            resetPassword(item)
                          }
                          title="Cambiar contraseña temporal"
                        >
                          🔑
                        </button>

                        <button
                          type="button"
                          className={`opc-action ${
                            item.active
                              ? "danger"
                              : "success"
                          }`}
                          disabled={
                            actionId === item.id
                          }
                          onClick={() =>
                            runAction(
                              item,
                              item.active
                                ? "deactivate"
                                : "activate"
                            )
                          }
                          title={
                            item.active
                              ? "Suspender acceso"
                              : "Reactivar acceso"
                          }
                        >
                          {item.active
                            ? "⏸"
                            : "▶"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="opc-info">
        <span>🔐</span>

        <div>
          <strong>
            {isSystemAdmin
              ? "Soporte global con control administrativo"
              : "Acceso aislado por cliente"}
          </strong>

          <p>
            {isSystemAdmin
              ? "E&R puede consultar y administrar cualquier cliente del portal para soporte. Las oficinas siguen aisladas entre sí."
              : "Un cliente creado aquí no es usuario interno de la oficina. Solo puede entrar a su Portal de Clientes y ver las gestiones que le asignen."}
          </p>
        </div>
      </section>

      {showCreate && (
        <div
          className="opc-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !saving
            ) {
              setShowCreate(false);
            }
          }}
        >
          <form
            className="opc-modal"
            onSubmit={createClient}
          >
            <header>
              <div>
                <span className="opc-eyebrow">
                  NUEVO ACCESO
                </span>

                <h2>
                  Crear cliente del portal
                </h2>

                <p>
                  {isSystemAdmin
                    ? "Seleccioná la oficina propietaria del cliente. E&R conserva capacidad de soporte global."
                    : `Estas credenciales se utilizarán únicamente para consultar las gestiones asignadas por ${officeName}.`}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowCreate(false)
                }
                disabled={saving}
              >
                ×
              </button>
            </header>

            <div className="opc-form-grid">
              {isSystemAdmin && (
                <label className="full">
                  <span>
                    Oficina propietaria *
                  </span>

                  <select
                    required
                    value={
                      form.organization_id
                    }
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        organization_id:
                          event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      Seleccionar oficina
                    </option>

                    {organizations.map(
                      (org) => (
                        <option
                          key={org.id}
                          value={org.id}
                        >
                          {org.name} ·{" "}
                          {org.plan_code}
                        </option>
                      )
                    )}
                  </select>

                  <small>
                    El cliente quedará aislado
                    dentro de esta organización.
                  </small>
                </label>
              )}

              <label className="full">
                <span>
                  Empresa / Importador
                </span>

                <input
                  value={form.company_name}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      company_name:
                        event.target.value,
                    }))
                  }
                  placeholder="Ej. Importadora Hernández"
                />

                <small>
                  Opcional si es cliente
                  individual.
                </small>
              </label>

              <label className="full">
                <span>
                  Nombre del contacto *
                </span>

                <input
                  required
                  value={form.contact_name}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      contact_name:
                        event.target.value,
                    }))
                  }
                  placeholder="Nombre completo"
                />
              </label>

              <label>
                <span>
                  Correo electrónico *
                </span>

                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={form.email}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      email:
                        event.target.value,
                    }))
                  }
                  placeholder="cliente@empresa.com"
                />
              </label>

              <label>
                <span>Teléfono</span>

                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      phone:
                        event.target.value,
                    }))
                  }
                  placeholder="+502 ..."
                />
              </label>

              <label className="full">
                <span>
                  Contraseña temporal *
                </span>

                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      password:
                        event.target.value,
                    }))
                  }
                  placeholder="Mínimo 8 caracteres"
                />
              </label>
            </div>

            <footer>
              <button
                type="button"
                className="opc-secondary"
                onClick={() =>
                  setShowCreate(false)
                }
                disabled={saving}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="opc-primary"
                disabled={saving}
              >
                {saving
                  ? "Creando acceso..."
                  : "Crear acceso →"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {activationCandidate && (
      <div className="opc-modal-backdrop">
      <form className="opc-v394-modal" onSubmit={activateCandidate}>
      <header>
      <div>
      <span className="opc-eyebrow">V39.4 · ACTIVAR PORTAL</span>
      <h2>Crear acceso al Portal del Cliente</h2>
      <p>
      No crea Importer PRO. Este acceso pertenece a {activationCandidate.organization_name}.
      </p>
      </div>
      <button type="button" onClick={() => {
                setActivationCandidate(null);
                setActivationEmail("");
                setActivationPassword("");
              }}>×</button>
      </header>
      
      <div className="opc-v394-modal-body">
      <label>
      <span>Cliente / Importador</span>
      <input value={activationCandidate.contact_name || ""} disabled />
      </label>
      <label>
      <span>Correo de acceso</span>
      <input
                  type="email"
                  required
                  value={activationEmail}
                  onChange={(e) => setActivationEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  autoComplete="email"
                />
      </label>
      <label>
      <span>Contraseña temporal</span>
      <input
      type="password"
      minLength="8"
      required
      value={activationPassword}
      onChange={(e) => setActivationPassword(e.target.value)}
      placeholder="Mínimo 8 caracteres"
      />
      </label>
      <div className="opc-v394-notice">
      🔒 El usuario verá únicamente las operaciones que esta oficina le asigne.
      No será usuario interno de la oficina y no obtiene Importer PRO.
      </div>
      </div>
      
      <footer>
      <button type="button" className="opc-secondary" onClick={() => {
                setActivationCandidate(null);
                setActivationEmail("");
                setActivationPassword("");
              }}>
      Cancelar
      </button>
      <button type="submit" className="opc-primary" disabled={saving}>
      {saving ? "Creando acceso..." : "Crear acceso →"}
      </button>
      </footer>
      </form>
      </div>
      )}
    </section>
      
  );
}
