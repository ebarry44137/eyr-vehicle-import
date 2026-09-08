import { useEffect, useMemo, useState } from "react";
import "./importer-dashboard.css";

const ACTIVE_STATUSES = [
  "DOCUMENTOS_ENTREGADOS",
  "EN_TRAMITE",
  "DECLARACION_PREPARADA",
  "IVA_PENDIENTE",
  "IVA_PAGADO",
  "SELECTIVO",
  "LIBERADO",
];

function humanStatus(value) {
  const labels = {
    DOCUMENTOS_ENTREGADOS: "Documentos entregados",
    EN_TRAMITE: "En trámite",
    DECLARACION_PREPARADA: "Declaración preparada",
    IVA_PENDIENTE: "IVA pendiente",
    IVA_PAGADO: "IVA pagado",
    SELECTIVO: "Selectivo",
    LIBERADO: "Liberado",
    FINALIZADO: "Finalizado",
    CANCELADO: "Cancelado",
  };
  return labels[value] || value || "Pendiente";
}

export default function ImporterDashboard({
  supabase,
  organizationId,
  importerName,
  planCode,
  onNewQuote,
  onOpenImports,
  onOpenExpenses,
  onOpenAnalytics,
  onOpenReminders,
  onOpenTeam,
  onOpenFiles,
  isManager=false,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isPro = String(planCode || "").toUpperCase() === "IMPORTER_PRO";

  async function loadDashboard() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: loadError } = await supabase
        .from("importer_customs_records")
        .select("id, vehicle, vin, office_name, manager_name, customs_office, opened_at, status, created_at")
        .eq("organization_id", organizationId)
        .order("opened_at", { ascending: false })
        .limit(100);
      if (loadError) throw loadError;
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("V39.7.4.4 IMPORTER DASHBOARD ERROR:", err);
      setError(err?.message || "No fue posible cargar tus gestiones aduanales.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDashboard(); }, [organizationId]);

  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter((i) => ACTIVE_STATUSES.includes(i.status)).length,
    iva: items.filter((i) => ["IVA_PENDIENTE", "IVA_PAGADO"].includes(i.status)).length,
    selective: items.filter((i) => i.status === "SELECTIVO").length,
    finalized: items.filter((i) => i.status === "FINALIZADO").length,
  }), [items]);

  const firstName = String(importerName || "Importador").trim().split(/\s+/)[0] || "Importador";

  return (
    <section className="importer-dashboard-v3974">
      <header className="importer-dashboard-hero">
        <div>
          <span className="importer-dashboard-kicker">{isPro ? "IMPORTADOR PRO" : "IMPORTADOR"} · E&amp;R SOLUTIONS</span>
          <h1>Hola, {firstName} 👋</h1>
          <p>{isManager ? "Tus gestiones asignadas, estados y documentos en un solo lugar." : "Tu control de cotizaciones y gestiones aduanales, en un solo lugar."}</p>
        </div>
        <div className={`importer-plan-badge ${isPro ? "pro" : ""}`}>
          <small>PLAN ACTIVO</small>
          <strong>{isPro ? "IMPORTADOR PRO" : "IMPORTADOR"}</strong>
          <span>{isPro ? "Q249 / mes" : "Q149 / mes"}</span>
        </div>
      </header>

      <div className="importer-dashboard-actions">
        <button type="button" className="primary" onClick={onNewQuote}>＋ Nueva cotización</button>
        <button type="button" onClick={onOpenImports}>🛃 Mis gestiones aduanales</button>
        <button type="button" onClick={loadDashboard} disabled={loading}>↻ {loading ? "Actualizando..." : "Actualizar"}</button>
      </div>

      {error && <div className="importer-dashboard-error">{error}</div>}

      <section className="importer-dashboard-kpis">
        <article><span>🛃</span><div><small>GESTIONES</small><strong>{stats.total}</strong><p>Total registradas</p></div></article>
        <article><span>⚡</span><div><small>ACTIVAS</small><strong>{stats.active}</strong><p>En proceso</p></div></article>
        <article><span>💳</span><div><small>IVA</small><strong>{stats.iva}</strong><p>Pendiente / pagado</p></div></article>
        <article><span>🎯</span><div><small>SELECTIVO</small><strong>{stats.selective}</strong><p>En esa etapa</p></div></article>
        <article><span>✅</span><div><small>FINALIZADAS</small><strong>{stats.finalized}</strong><p>Trámites cerrados</p></div></article>
      </section>

      <section className="importer-dashboard-grid">
        <article className="importer-dashboard-recent">
          <div className="importer-dashboard-section-head">
            <div><small>ACTIVIDAD RECIENTE</small><h2>Mis últimas gestiones</h2></div>
            <button type="button" onClick={onOpenImports}>Ver todas →</button>
          </div>
          {loading ? (
            <div className="importer-dashboard-empty">Cargando tus gestiones...</div>
          ) : items.length === 0 ? (
            <div className="importer-dashboard-empty">
              <span>🛃</span>
              <strong>Todavía no tenés gestiones aduanales registradas.</strong>
              <p>Podés registrar trámites realizados con cualquier oficina o gestor.</p>
              <button type="button" onClick={onOpenImports}>Registrar una gestión</button>
            </div>
          ) : (
            <div className="importer-dashboard-list">
              {items.slice(0, 6).map((item) => (
                <button key={item.id} type="button" className="importer-dashboard-row" onClick={onOpenImports}>
                  <div className="vehicle-icon">🛃</div>
                  <div className="vehicle-copy"><strong>{item.vehicle}</strong><span>{item.office_name}{item.vin ? ` · ${item.vin}` : ""}</span></div>
                  <div className="vehicle-status"><small>ESTADO</small><strong>{humanStatus(item.status)}</strong></div>
                  <span className="row-arrow">→</span>
                </button>
              ))}
            </div>
          )}
        </article>

        <aside className={`importer-dashboard-pro-card ${isPro ? "enabled" : ""}`}>
          <span>{isPro ? "⭐" : "🚀"}</span>
          <small>{isPro ? "IMPORTADOR PRO" : "SUBÍ A PRO"}</small>
          <h3>{isPro ? "Más control para tu operación." : "Llevá tu control al siguiente nivel."}</h3>
          <p>{isPro ? "Tu plan está preparado para incorporar documentos, estadísticas, alertas y funciones avanzadas." : "Importador PRO agrega herramientas avanzadas para quienes operan de forma independiente."}</p>
          <div className="importer-dashboard-pro-features">
            <span>{isPro ? "✓" : "○"} Control de costos por gestión</span>
            <span>{isPro ? "✓" : "○"} Estadísticas avanzadas</span>
            <span>{isPro ? "✓" : "○"} Agenda y recordatorios</span>
            <span>{isPro ? "✓" : "○"} Documentos y fotografías en R2</span>
          </div>
          {isPro ? (
            isManager ? <div className="importer-pro-dashboard-links">
              <button type="button" onClick={onOpenImports}>🛃 Gestiones asignadas</button>
              <button type="button" onClick={onOpenFiles}>📁 Documentos & Fotos</button>
            </div> : <div className="importer-pro-dashboard-links">
              <button type="button" onClick={onOpenTeam}>👥 Mi Equipo</button>
              <button type="button" onClick={onOpenExpenses}>💰 Costos</button>
              <button type="button" onClick={onOpenAnalytics}>📊 Estadísticas</button>
              <button type="button" onClick={onOpenReminders}>🔔 Agenda</button>
              <button type="button" onClick={onOpenFiles}>📁 Documentos & Fotos</button>
            </div>
          ) : <strong className="upgrade-price">PRO · Q249/mes</strong>}
        </aside>
      </section>
    </section>
  );
}
