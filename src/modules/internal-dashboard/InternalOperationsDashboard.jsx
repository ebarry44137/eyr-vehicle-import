import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import "./internal-dashboard.css";

const TERMINAL_WORDS = ["ENTREGADO", "DELIVERED", "FINALIZADO", "COMPLETADO"];

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function first(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && clean(value) !== "") return value;
  }
  return null;
}

function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function vehicleText(item) {
  const year = first(item, ["model_year", "vehicle_year", "year"]);
  const make = first(item, ["make", "vehicle_make"]);
  const model = first(item, ["model", "vehicle_model"]);
  return [year, make, model].filter(Boolean).join(" ") || "Vehículo pendiente";
}

function caseCode(item) {
  return (
    first(item, ["case_code", "reference_code", "reference", "case_number"]) ||
    "Sin referencia"
  );
}

function currentStatus(item) {
  return first(item, ["current_status", "status"]) || "Pendiente";
}

function isTerminal(item) {
  const status = upper(currentStatus(item));
  if (first(item, ["delivered_at", "delivery_at"])) return true;
  return TERMINAL_WORDS.some((word) => status.includes(word));
}

function isRed(item) {
  const status = upper(currentStatus(item));
  const selective = upper(
    first(item, [
      "selective",
      "selective_status",
      "selective_color",
      "selective_type",
      "selectivo",
    ])
  );
  return status.includes("ROJO") || selective.includes("ROJO") || selective === "RED";
}

function isPostCustomsStage(item) {
  const status = upper(currentStatus(item));

  return (
    Boolean(first(item, ["delivered_at", "delivery_at"])) ||
    Boolean(first(item, ["envelope_ready_at", "documents_ready_at"])) ||
    Boolean(first(item, ["port_exit_at", "vehicle_released_at", "port_released_at"])) ||
    status.includes("SOBRE PREPARADO") ||
    status.includes("DOCUMENTOS LISTOS") ||
    status.includes("SALIDA DE PUERTO") ||
    status.includes("ENTREGADO")
  );
}

function needsAttention(item) {
  const light = upper(first(item, ["traffic_light", "semaforo", "traffic_status"]));
  const status = upper(currentStatus(item));

  // Un selectivo rojo es una alerta mientras la gestión está en etapa aduanal.
  // Si el vehículo ya salió de puerto o el expediente está en Sobre preparado,
  // ese rojo queda como antecedente histórico y NO como pendiente operativo.
  if (isPostCustomsStage(item)) return false;

  return (
    isRed(item) ||
    light.includes("ATRAS") ||
    light.includes("VENC") ||
    light.includes("ROJO") ||
    status.includes("REVIS") ||
    status.includes("PENDIENTE") ||
    status.includes("OBSERV")
  );
}

function clientName(item, clientsById) {
  const direct = first(item, [
    "client_name",
    "customer_name",
    "importer_name",
    "consignee_name",
  ]);
  if (direct) return direct;

  const clientId = first(item, [
    "office_portal_client_id",
    "portal_client_id",
    "client_id",
  ]);

  const client = clientId ? clientsById.get(String(clientId)) : null;

  return (
    first(client, ["preferred_name", "contact_name", "company_name", "legal_name"]) ||
    "Cliente"
  );
}

export default function InternalOperationsDashboard({ onNavigate, onOpenCustoms }) {
  const [cases, setCases] = useState([]);
  const [clients, setClients] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [requestCount, setRequestCount] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    const [
      casesResult,
      clientsResult,
      conversationsResult,
      requestsResult,
      filesResult,
    ] = await Promise.allSettled([
      supabase
        .from("customs_cases")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(300),

      supabase
        .from("office_portal_clients")
        .select("id,preferred_name,contact_name,company_name,legal_name,active")
        .limit(500),

      supabase
        .from("portal_support_conversations")
        .select("id,status,subject,last_message_at,portal_client_id,customs_case_id")
        .order("last_message_at", { ascending: false })
        .limit(100),

      supabase
        .from("portal_customs_requests")
        .select("id,status", { count: "exact" })
        .limit(250),

      supabase
        .from("operation_files")
        .select("id", { count: "exact", head: true }),
    ]);

    if (casesResult.status === "fulfilled" && !casesResult.value.error) {
      setCases(casesResult.value.data || []);
    } else {
      const message =
        casesResult.status === "rejected"
          ? casesResult.reason?.message
          : casesResult.value?.error?.message;
      setError(message || "No fue posible cargar Control Aduanal.");
    }

    if (clientsResult.status === "fulfilled" && !clientsResult.value.error) {
      setClients(clientsResult.value.data || []);
    }

    if (
      conversationsResult.status === "fulfilled" &&
      !conversationsResult.value.error
    ) {
      setConversations(conversationsResult.value.data || []);
    }

    if (requestsResult.status === "fulfilled" && !requestsResult.value.error) {
      const rows = requestsResult.value.data || [];
      setRequestCount(
        rows.filter((item) => {
          const s = upper(item.status);
          return !["APPROVED", "REJECTED", "CLOSED", "COMPLETED"].includes(s);
        }).length
      );
    }

    if (filesResult.status === "fulfilled" && !filesResult.value.error) {
      setFileCount(Number(filesResult.value.count || 0));
    }

    setUpdatedAt(new Date());
    setLoading(false);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [String(client.id), client])),
    [clients]
  );

  const activeCases = useMemo(() => cases.filter((item) => !isTerminal(item)), [cases]);
  const attentionCases = useMemo(
    () => activeCases.filter((item) => needsAttention(item)),
    [activeCases]
  );
  const redCases = useMemo(
    () => activeCases.filter((item) => isRed(item) && !isPostCustomsStage(item)),
    [activeCases]
  );
  const waitingOffice = useMemo(
    () => conversations.filter((item) => upper(item.status) === "WAITING_OFFICE"),
    [conversations]
  );
  const readyCases = useMemo(
    () =>
      activeCases.filter((item) => {
        const s = upper(currentStatus(item));
        return (
          s.includes("SOBRE PREPARADO") ||
          s.includes("LISTO") ||
          s.includes("SALIDA DE PUERTO")
        );
      }),
    [activeCases]
  );

  const recent = useMemo(() => cases.slice(0, 8), [cases]);

  const todayLabel = new Intl.DateTimeFormat("es-GT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <section className="eyr-ops-dashboard">
      <header className="eyr-ops-hero">
        <div>
          <span className="eyr-ops-eyebrow">CENTRO DE OPERACIONES · E&R SOLUTIONS</span>
          <h1>Dashboard Operativo</h1>
          <p>
            Todo lo importante de la operación en una sola pantalla: expedientes,
            alertas, clientes y atención pendiente.
          </p>
        </div>

        <div className="eyr-ops-hero-actions">
          <small>{todayLabel}</small>
          <button type="button" onClick={loadDashboard} disabled={loading}>
            {loading ? "Actualizando…" : "↻ Actualizar"}
          </button>
        </div>
      </header>

      {error && (
        <div className="eyr-ops-error">
          <strong>⚠ Dashboard parcialmente disponible</strong>
          <span>{error}</span>
        </div>
      )}

      <section className="eyr-ops-kpis">
        <article>
          <span className="eyr-ops-kpi-icon">🚢</span>
          <div>
            <small>GESTIONES ACTIVAS</small>
            <strong>{loading ? "…" : activeCases.length}</strong>
            <p>{cases.length} expedientes visibles</p>
          </div>
        </article>

        <article className={attentionCases.length ? "attention" : ""}>
          <span className="eyr-ops-kpi-icon">⚠️</span>
          <div>
            <small>REQUIEREN ATENCIÓN</small>
            <strong>{loading ? "…" : attentionCases.length}</strong>
            <p>{redCases.length} con selectivo rojo</p>
          </div>
        </article>

        <article className={waitingOffice.length ? "support" : ""}>
          <span className="eyr-ops-kpi-icon">💬</span>
          <div>
            <small>CLIENTES POR RESPONDER</small>
            <strong>{loading ? "…" : waitingOffice.length}</strong>
            <p>Conversaciones del Portal</p>
          </div>
        </article>

        <article>
          <span className="eyr-ops-kpi-icon">✅</span>
          <div>
            <small>LISTOS / CIERRE</small>
            <strong>{loading ? "…" : readyCases.length}</strong>
            <p>Salida, sobre o entrega próxima</p>
          </div>
        </article>
      </section>

      <section className="eyr-ops-main-grid">
        <article className="eyr-ops-panel eyr-ops-priority">
          <div className="eyr-ops-panel-head">
            <div>
              <small>PRIORIDAD OPERATIVA</small>
              <h2>Requiere atención</h2>
            </div>
            <button type="button" onClick={() => (onOpenCustoms ? onOpenCustoms() : onNavigate?.("customs"))}>
              Ver Control Aduanal →
            </button>
          </div>

          <div className="eyr-ops-priority-list">
            {loading ? (
              <div className="eyr-ops-empty">Cargando prioridades…</div>
            ) : attentionCases.length ? (
              attentionCases.slice(0, 6).map((item) => (
                <button
                  type="button"
                  className="eyr-ops-priority-row"
                  key={item.id}
                  onClick={() => (onOpenCustoms ? onOpenCustoms() : onNavigate?.("customs"))}
                >
                  <span className={isRed(item) ? "dot red" : "dot amber"} />
                  <div>
                    <strong>{vehicleText(item)}</strong>
                    <span>
                      {caseCode(item)} · {clientName(item, clientsById)}
                    </span>
                  </div>
                  <em>{currentStatus(item)}</em>
                </button>
              ))
            ) : (
              <div className="eyr-ops-empty success">
                ✅ No hay expedientes marcados con atención inmediata.
              </div>
            )}
          </div>
        </article>

        <article className="eyr-ops-panel eyr-ops-actions">
          <div className="eyr-ops-panel-head">
            <div>
              <small>ACCESOS RÁPIDOS</small>
              <h2>¿Qué necesitás hacer?</h2>
            </div>
          </div>

          <div className="eyr-ops-action-grid">
            <button type="button" onClick={() => (onOpenCustoms ? onOpenCustoms() : onNavigate?.("customs"))}>
              <span>▣</span>
              <strong>Control Aduanal</strong>
              <small>Expedientes y estados</small>
            </button>

            <button type="button" onClick={() => onNavigate?.("new")}>
              <span>＋</span>
              <strong>Nueva Cotización</strong>
              <small>VIN, SAT e impuestos</small>
            </button>

            <button type="button" onClick={() => onNavigate?.("portal-clients")}>
              <span>👥</span>
              <strong>Clientes del Portal</strong>
              <small>{requestCount} solicitudes pendientes</small>
            </button>

            <button type="button" onClick={() => onNavigate?.("quotations")}>
              <span>▤</span>
              <strong>Cotizaciones</strong>
              <small>Historial del equipo</small>
            </button>
          </div>

          <div className="eyr-ops-mini-stats">
            <div>
              <span>📁</span>
              <p>
                <strong>{fileCount}</strong>
                <small>archivos registrados</small>
              </p>
            </div>
            <div>
              <span>🤖</span>
              <p>
                <strong>{conversations.length}</strong>
                <small>conversaciones Portal</small>
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="eyr-ops-panel eyr-ops-recent">
        <div className="eyr-ops-panel-head">
          <div>
            <small>ACTIVIDAD RECIENTE</small>
            <h2>Últimos expedientes aduanales</h2>
          </div>

          <div className="eyr-ops-refresh-note">
            {updatedAt
              ? `Actualizado ${updatedAt.toLocaleTimeString("es-GT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "—"}
          </div>
        </div>

        <div className="eyr-ops-table-wrap">
          <table className="eyr-ops-table">
            <thead>
              <tr>
                <th>Expediente</th>
                <th>Vehículo</th>
                <th>Cliente</th>
                <th>Estado actual</th>
                <th>Actualización</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button type="button" onClick={() => (onOpenCustoms ? onOpenCustoms() : onNavigate?.("customs"))}>
                      {caseCode(item)}
                    </button>
                  </td>
                  <td>
                    <strong>{vehicleText(item)}</strong>
                    <small>
                      {first(item, ["vin", "vehicle_vin"]) || "VIN pendiente"}
                    </small>
                  </td>
                  <td>{clientName(item, clientsById)}</td>
                  <td>
                    <span
                      className={`eyr-ops-status ${
                        isRed(item) ? "red" : isTerminal(item) ? "done" : ""
                      }`}
                    >
                      {currentStatus(item)}
                    </span>
                  </td>
                  <td>
                    {dateText(
                      first(item, [
                        "updated_at",
                        "last_updated_at",
                        "created_at",
                      ])
                    )}
                  </td>
                </tr>
              ))}

              {!loading && recent.length === 0 && (
                <tr>
                  <td colSpan="5">
                    <div className="eyr-ops-empty">Todavía no hay expedientes visibles.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
