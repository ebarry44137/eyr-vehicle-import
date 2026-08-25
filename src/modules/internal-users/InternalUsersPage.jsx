import { useEffect, useMemo, useState } from "react";
import "./internal-users.css";

export default function InternalUsersPage({
  invokeFunction,
  currentUserId,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionUserId, setActionUserId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    user_type: "DIGITADOR",
  });

  const admins = useMemo(
    () =>
      users.filter(
        (item) => String(item.role || "").toUpperCase() === "ADMIN"
      ).length,
    [users]
  );

  const digitadores = useMemo(
    () =>
      users.filter(
        (item) =>
          String(item.job_title || "").toUpperCase() === "DIGITADOR"
      ).length,
    [users]
  );

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const { data, error: functionError } =
        await invokeFunction("admin-user-manager", {
          body: { action: "list" },
        });

      if (functionError) throw functionError;
      if (!data?.success) {
        throw new Error(
          data?.error || "No fue posible cargar los usuarios internos."
        );
      }

      setUsers(data.users || []);
    } catch (err) {
      console.error("INTERNAL USERS LOAD ERROR:", err);
      setError(
        err?.message || "No fue posible cargar los usuarios internos."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser(event) {
    event.preventDefault();

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      password: form.password,
      user_type: form.user_type,
    };

    if (!payload.full_name || !payload.email || !payload.password) {
      setError("Nombre, correo y contraseña son obligatorios.");
      return;
    }

    if (payload.password.length < 8) {
      setError("La contraseña inicial debe tener al menos 8 caracteres.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: functionError } =
        await invokeFunction("admin-user-manager", {
          body: {
            action: "create",
            ...payload,
          },
        });

      if (functionError) throw functionError;
      if (!data?.success) {
        throw new Error(data?.error || "No fue posible crear el usuario.");
      }

      setMessage(
        `${data.user?.full_name || "Usuario"} creado correctamente como ${
          data.user?.job_title || data.user?.role
        }.`
      );

      setForm({
        full_name: "",
        email: "",
        phone: "",
        password: "",
        user_type: "DIGITADOR",
      });
      setShowCreate(false);
      await loadUsers();
    } catch (err) {
      console.error("INTERNAL USER CREATE ERROR:", err);
      setError(err?.message || "No fue posible crear el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(userId, action, extra = {}) {
    if (!userId) return;

    setActionUserId(userId);
    setError("");
    setMessage("");

    try {
      const { data, error: functionError } =
        await invokeFunction("admin-user-manager", {
          body: {
            action,
            user_id: userId,
            ...extra,
          },
        });

      if (functionError) throw functionError;
      if (!data?.success) {
        throw new Error(data?.error || "No fue posible actualizar el usuario.");
      }

      setMessage(data.message || "Usuario actualizado correctamente.");
      await loadUsers();
    } catch (err) {
      console.error("INTERNAL USER ACTION ERROR:", err);
      setError(err?.message || "No fue posible actualizar el usuario.");
    } finally {
      setActionUserId(null);
    }
  }

  async function resetPassword(item) {
    const password = window.prompt(
      `Nueva contraseña temporal para ${item.full_name || item.email}:`
    );

    if (!password) return;

    if (password.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    await runAction(item.id, "reset_password", {
      password,
    });
  }

  return (
    <section className="internal-users-module">
      <header className="internal-users-header">
        <div>
          <span className="section-label">ADMINISTRACIÓN E&R</span>
          <h1>Usuarios Internos</h1>
          <p>
            Cuentas del personal de oficina con acceso ilimitado al sistema.
          </p>
        </div>

        <button
          type="button"
          className="internal-user-create-button"
          onClick={() => {
            setShowCreate(true);
            setError("");
            setMessage("");
          }}
        >
          ＋ Crear usuario
        </button>
      </header>

      <section className="internal-user-kpis">
        <article>
          <span>Usuarios internos</span>
          <strong>{users.length}</strong>
        </article>
        <article>
          <span>Administradores</span>
          <strong>{admins}</strong>
        </article>
        <article>
          <span>Digitadores</span>
          <strong>{digitadores}</strong>
        </article>
        <article>
          <span>Activos</span>
          <strong>{users.filter((item) => item.active).length}</strong>
        </article>
      </section>

      {message && (
        <div className="customer-message success">{message}</div>
      )}
      {error && <div className="customer-message error">{error}</div>}

      <section className="internal-users-card">
        <div className="internal-users-card-head">
          <div>
            <span className="section-label">PERSONAL AUTORIZADO</span>
            <h2>
              {loading
                ? "Cargando..."
                : `${users.length} usuario${users.length === 1 ? "" : "s"}`}
            </h2>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={loadUsers}
            disabled={loading}
          >
            ↻ Actualizar
          </button>
        </div>

        <div className="internal-users-table-wrap">
          <table className="internal-users-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Perfil</th>
                <th>Acceso</th>
                <th>Último ingreso</th>
                <th>Creado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    Todavía no hay usuarios internos registrados.
                  </td>
                </tr>
              )}

              {users.map((item) => {
                const isSelf = item.id === currentUserId;
                const busy = actionUserId === item.id;
                const displayRole =
                  String(item.role || "").toUpperCase() === "ADMIN"
                    ? "ADMINISTRADOR"
                    : item.job_title || "DIGITADOR";

                return (
                  <tr key={item.id}>
                    <td>
                      <div className="internal-user-identity">
                        <div className="internal-user-avatar">
                          {(item.full_name || item.email || "U")
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div>
                          <strong>{item.full_name || "Sin nombre"}</strong>
                          <span>{item.email}</span>
                          <small>{item.phone || "Sin teléfono"}</small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`internal-role-badge ${
                          displayRole === "ADMINISTRADOR"
                            ? "admin"
                            : "digitador"
                        }`}
                      >
                        {displayRole}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`internal-access-badge ${
                          item.active ? "active" : "inactive"
                        }`}
                      >
                        {item.active ? "Ilimitado · Activo" : "Desactivado"}
                      </span>
                    </td>

                    <td>
                      {item.last_sign_in_at
                        ? new Date(item.last_sign_in_at).toLocaleString("es-GT")
                        : "Nunca"}
                    </td>

                    <td>
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString("es-GT")
                        : "—"}
                    </td>

                    <td>
                      <div className="internal-user-actions">
                        <button
                          type="button"
                          onClick={() => resetPassword(item)}
                          disabled={busy}
                        >
                          Contraseña
                        </button>

                        {!isSelf && (
                          <button
                            type="button"
                            className={item.active ? "danger" : "success"}
                            onClick={() =>
                              runAction(
                                item.id,
                                item.active ? "deactivate" : "activate"
                              )
                            }
                            disabled={busy}
                          >
                            {item.active ? "Desactivar" : "Activar"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && (
        <div
          className="internal-user-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setShowCreate(false);
            }
          }}
        >
          <form
            className="internal-user-modal"
            onSubmit={createUser}
          >
            <header>
              <div>
                <span className="section-label">NUEVO ACCESO</span>
                <h2>Crear usuario interno</h2>
                <p>
                  Estos usuarios no pagan suscripción y tienen consultas
                  ilimitadas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={saving}
              >
                ×
              </button>
            </header>

            <div className="internal-user-form">
              <label>
                <span>Nombre completo</span>
                <input
                  value={form.full_name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      full_name: e.target.value,
                    }))
                  }
                  placeholder="Nombre y apellido"
                />
              </label>

              <label>
                <span>Correo electrónico</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  placeholder="usuario@eyr.com"
                />
              </label>

              <label>
                <span>Teléfono</span>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                  placeholder="+502 ..."
                />
              </label>

              <label>
                <span>Tipo de usuario</span>
                <select
                  value={form.user_type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      user_type: e.target.value,
                    }))
                  }
                >
                  <option value="DIGITADOR">Digitador</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </label>

              <label className="span-2">
                <span>Contraseña temporal</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  placeholder="Mínimo 8 caracteres"
                />
                <small>
                  El usuario podrá iniciar sesión inmediatamente con este correo
                  y contraseña.
                </small>
              </label>
            </div>

            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCreate(false)}
                disabled={saving}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? "Creando..." : "Crear acceso interno"} <span>→</span>
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
