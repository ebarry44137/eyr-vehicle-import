import { useEffect, useMemo, useState } from "react";
import "./performance-bonuses.css";
import PerformanceAttendanceAdmin from "../performance-attendance/PerformanceAttendanceAdmin.jsx";

const money = (value) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", maximumFractionDigits: 2 })
    .format(Number(value || 0));

const pct = (value) => value == null ? "—" : `${Number(value).toFixed(1)}%`;

const resultLabel = (value) => ({
  APLICA: "APLICA",
  APLICA_LIMITADO_50: "APLICA · LIMITADO 50%",
  NO_APLICA: "NO APLICA",
  NO_APLICA_CRITICAL: "NO APLICA · ERROR CRÍTICO",
  PENDIENTE_DATOS: "PENDIENTE DE DATOS",
}[value] || "PENDIENTE");

const PROFILE_OPTIONS = [
  {
    value: "DIGITACION",
    label: "Digitación DUCA",
    description: "Elaboración y control de DUCAs / expedientes.",
  },
  {
    value: "GESTION_PUERTO",
    label: "Gestión de retiro portuario",
    description: "Retiro del vehículo del puerto una vez autorizada la documentación.",
  },
];

export default function PerformanceBonusesPage({ supabase, invokeFunction }) {
  const [allowed, setAllowed] = useState(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [internalUsers, setInternalUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editingCompensation, setEditingCompensation] = useState(false);
  const [compensationForm, setCompensationForm] = useState({
    base_salary: "",
    monthly_bonus_cap: "",
    quarterly_bonus_cap: "",
    monthly_volume_target: "20",
  });
  const [employeeForm, setEmployeeForm] = useState({
    user_id: "",
    evaluation_profile: "DIGITACION",
    base_salary: "1500",
    monthly_bonus_cap: "1400",
    quarterly_bonus_cap: "300",
    monthly_volume_target: "20",
  });

  const periodDate = `${month}-01`;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("can_access_performance");
        if (error) throw error;
        if (!mounted) return;
        setAllowed(Boolean(data));
      } catch (e) {
        console.error("PERFORMANCE ACCESS ERROR", e);
        if (mounted) setAllowed(false);
      }
    })();
    return () => { mounted = false; };
  }, [supabase]);

  async function loadInternalUsers() {
    if (!invokeFunction) return;
    try {
      const { data, error } = await invokeFunction("admin-user-manager", {
        body: { action: "list" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "No fue posible cargar usuarios internos.");
      const users = (data.users || []).filter((u) =>
        u?.active !== false &&
        ["OPERADOR", "ADMIN"].includes(String(u?.role || "").toUpperCase())
      );
      setInternalUsers(users);
    } catch (e) {
      console.error("PERFORMANCE INTERNAL USERS:", e);
      setMessage("⚠️ No pude cargar los usuarios internos. Revisá que tu sesión tenga permiso administrativo.");
    }
  }

  async function loadAll() {
    if (!allowed) return;
    setLoading(true);
    try {
      const [{ data: dashboard, error: dErr }, { data: emps, error: eErr }] = await Promise.all([
        supabase.rpc("performance_dashboard_v3984", { p_period_month: periodDate }),
        supabase.from("performance_employees").select("*").order("full_name"),
      ]);
      if (dErr) throw dErr;
      if (eErr) throw eErr;
      const { data: volumeRows, error: vErr } = await supabase.rpc(
        "performance_volume_snapshot_v3987",
        { p_period_month: periodDate }
      );
      if (vErr) throw vErr;

      const volumeByPeriod = new Map(
        (volumeRows || []).map((item) => [item.period_id, item])
      );
      const mergedDashboard = (dashboard || []).map((item) => ({
        ...item,
        ...(volumeByPeriod.get(item.period_id) || {}),
      }));

      setRows(mergedDashboard);
      setEmployees(emps || []);
      setSelected((current) => {
        if (!current) return null;
        return mergedDashboard.find((r) => r.employee_id === current.employee_id) || null;
      });
    } catch (e) {
      console.error(e);
      setMessage(e?.message || "No fue posible cargar Rendimiento & Bonos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) {
      loadAll();
      loadInternalUsers();
    }
  }, [allowed, month]);

  const linkedUserIds = useMemo(
    () => new Set(employees.map((e) => e.user_id).filter(Boolean)),
    [employees]
  );

  const availableUsers = useMemo(
    () => internalUsers.filter((u) => !linkedUserIds.has(u.id)),
    [internalUsers, linkedUserIds]
  );

  const selectedInternalUser = useMemo(
    () => internalUsers.find((u) => u.id === employeeForm.user_id) || null,
    [internalUsers, employeeForm.user_id]
  );

  const selectedProfile = useMemo(
    () => PROFILE_OPTIONS.find((p) => p.value === employeeForm.evaluation_profile) || PROFILE_OPTIONS[0],
    [employeeForm.evaluation_profile]
  );

  const totals = useMemo(() => {
    const active = rows.length;
    const applying = rows.filter(r => String(r.eligibility_result || "").startsWith("APLICA")).length;
    const projected = rows.reduce((sum, r) => sum + Number(r.projected_bonus ?? r.final_bonus ?? 0), 0);
    const critical = rows.reduce((sum, r) => sum + Number(r.critical_error_count || 0), 0);
    return { active, applying, projected, critical };
  }, [rows]);

  async function linkEmployee(e) {
    e.preventDefault();
    setBusy("employee");
    setMessage("");
    try {
      if (!selectedInternalUser) throw new Error("Seleccioná un empleado registrado.");
      const payload = {
        user_id: selectedInternalUser.id,
        full_name: selectedInternalUser.full_name || selectedInternalUser.email || "Usuario interno",
        job_title: selectedProfile.label,
        department: "Operaciones",
        evaluation_profile: employeeForm.evaluation_profile,
        base_salary: Number(employeeForm.base_salary || 0),
        monthly_bonus_cap: Number(employeeForm.monthly_bonus_cap || 0),
        quarterly_bonus_cap: Number(employeeForm.quarterly_bonus_cap || 0),
        monthly_volume_target: Math.max(1, Number(employeeForm.monthly_volume_target || 20)),
      };
      const { error } = await supabase.from("performance_employees").insert(payload);
      if (error) throw error;
      setShowEmployeeForm(false);
      setEmployeeForm(p => ({ ...p, user_id: "" }));
      setMessage(`✅ ${payload.full_name} fue vinculado a Rendimiento como ${payload.job_title}.`);
      await loadAll();
    } catch (e) {
      setMessage(e?.message || "No fue posible vincular el empleado.");
    } finally {
      setBusy("");
    }
  }

  
  function openCompensationEditor(row) {
    const employee = employees.find((item) => item.id === row?.employee_id);
    if (!employee) {
      setMessage("No pude localizar la configuración del empleado.");
      return;
    }

    setCompensationForm({
      base_salary: String(employee.base_salary ?? 0),
      monthly_bonus_cap: String(employee.monthly_bonus_cap ?? 0),
      quarterly_bonus_cap: String(employee.quarterly_bonus_cap ?? 0),
      monthly_volume_target: String(employee.monthly_volume_target ?? 20),
    });
    setEditingCompensation(true);
  }

  async function saveCompensation() {
    if (!selected?.employee_id) return;
    setBusy("compensation");
    setMessage("");

    try {
      const payload = {
        base_salary: Number(compensationForm.base_salary || 0),
        monthly_bonus_cap: Number(compensationForm.monthly_bonus_cap || 0),
        quarterly_bonus_cap: Number(compensationForm.quarterly_bonus_cap || 0),
        monthly_volume_target: Math.max(1, Number(compensationForm.monthly_volume_target || 20)),
      };

      if (payload.base_salary < 0 || payload.monthly_bonus_cap < 0 || payload.quarterly_bonus_cap < 0) {
        throw new Error("Los valores de compensación no pueden ser negativos.");
      }

      const { error } = await supabase
        .from("performance_employees")
        .update(payload)
        .eq("id", selected.employee_id);

      if (error) throw error;

      setEditingCompensation(false);
      setMessage("✅ Compensación actualizada correctamente.");
      await loadAll();
    } catch (e) {
      setMessage(e?.message || "No fue posible actualizar la compensación.");
    } finally {
      setBusy("");
    }
  }

async function openPeriod(employeeId, baseline = true) {
    setBusy(`period:${employeeId}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("performance_open_period_v3980", {
        p_employee_id: employeeId,
        p_period_month: periodDate,
        p_baseline: baseline,
      });
      if (error) throw error;
      setMessage(baseline ? "✅ Mes 0 abierto correctamente." : "✅ Período mensual abierto.");
      await loadAll();
    } catch (e) {
      setMessage(e?.message || "No fue posible abrir el período.");
    } finally {
      setBusy("");
    }
  }

  async function updateMetrics(row, patch) {
    if (!row?.period_id) return;
    setBusy(`metrics:${row.period_id}`);
    setMessage("");
    try {
      const { error } = await supabase
        .from("performance_periods")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", row.period_id);
      if (error) throw error;
      await recalculate(row.period_id, false);
    } catch (e) {
      setMessage(e?.message || "No fue posible actualizar los indicadores.");
      setBusy("");
    }
  }

  async function recalculate(periodId, showMsg = true) {
    setBusy(`calc:${periodId}`);
    try {
      const { data, error } = await supabase.rpc("performance_recalculate_auto_v3987", { p_period_id: periodId });
      if (error) throw error;
      if (showMsg) setMessage(`✅ Motor actualizado: ${money(data?.bonus?.final_bonus)} · ${resultLabel(data?.bonus?.eligibility_result)}`);
      await loadAll();
    } catch (e) {
      setMessage(e?.message || "No fue posible recalcular.");
    } finally {
      setBusy("");
    }
  }

  async function approve(row) {
    if (!row?.period_id) return;
    if (!window.confirm(`¿Aprobar y bloquear el período de ${row.employee_name}?`)) return;
    setBusy(`approve:${row.period_id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("performance_approve_period_v3980", { p_period_id: row.period_id });
      if (error) throw error;
      setMessage("✅ Período aprobado y snapshot generado.");
      await loadAll();
    } catch (e) {
      setMessage(e?.message || "No fue posible aprobar el período.");
    } finally {
      setBusy("");
    }
  }

  if (allowed === null) return <section className="perf-shell"><div className="perf-loading">Verificando acceso gerencial…</div></section>;
  if (!allowed) return (
    <section className="perf-shell">
      <div className="perf-denied"><span>🔐</span><h2>Acceso restringido</h2><p>Este módulo está reservado para Dirección.</p></div>
    </section>
  );

  return (
    <section className="perf-shell">
      <header className="perf-hero">
        <div>
          <small>DIRECCIÓN · INFORMACIÓN CONFIDENCIAL</small>
          <h1>Rendimiento & Bonos</h1>
          <p>El motor cruza la función de cada empleado con los hitos reales de Control Aduanal y calcula automáticamente productividad, calidad y tiempos.</p>
        </div>
        <div className="perf-hero-actions">
          <label><span>Período</span><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
          <button type="button" onClick={() => setShowEmployeeForm(true)}>＋ Vincular empleado</button>
        </div>
      </header>

      {message && <div className="perf-message">{message}</div>}

      <div className="perf-kpis">
        <article><span>👥</span><div><small>EN EVALUACIÓN</small><strong>{totals.active}</strong></div></article>
        <article><span>✅</span><div><small>APLICAN</small><strong>{totals.applying}</strong></div></article>
        <article><span>💰</span><div><small>BONO PROYECTADO</small><strong>{money(totals.projected)}</strong></div></article>
        <article className={totals.critical ? "danger" : ""}><span>⚠️</span><div><small>ERRORES CRÍTICOS</small><strong>{totals.critical}</strong></div></article>
      </div>

      <section className="perf-panel">
        <header>
          <div><small>CIERRE DEL MES</small><h2>Equipo evaluado</h2></div>
          <button className="perf-secondary" type="button" onClick={loadAll}>↻ Actualizar</button>
        </header>

        {loading ? <div className="perf-loading">Calculando indicadores…</div> : rows.length === 0 ? (
          <div className="perf-empty">
            <span>🔗</span><strong>Vinculá a Paola y Geovany.</strong>
            <p>No hay que volver a crearlos: elegilos desde los usuarios internos de E&R y asignales su función de evaluación.</p>
            <button type="button" onClick={() => setShowEmployeeForm(true)}>＋ Vincular empleado</button>
          </div>
        ) : (
          <div className="perf-list">
            {rows.map(row => {
              const hasPeriod = Boolean(row.period_id);
              const locked = ["APPROVED","PAID","CLOSED"].includes(row.period_status);
              return (
                <article className="perf-employee-card" key={row.employee_id}>
                  <button className="perf-card-main" type="button" onClick={() => { setSelected(row); setEditingCompensation(false); }}>
                    <div className="perf-avatar">{String(row.employee_name || "?").slice(0,1).toUpperCase()}</div>
                    <div className="perf-card-copy"><small>{row.job_title}</small><strong>{row.employee_name}</strong><span>{hasPeriod ? row.period_status : "SIN PERÍODO"}</span></div>
                    <div className="perf-card-result">
                      <small>DEVENGADO · {resultLabel(row.eligibility_result)}</small>
                      <strong>{money(row.earned_bonus ?? row.final_bonus)}</strong>
                      <span className="perf-card-volume">
                        {Number(row.volume_completed || 0)} / {Number(row.volume_target || 0)} completados
                        {" · "}Proyección {money(row.projected_bonus ?? row.final_bonus)}
                      </span>
                    </div>
                  </button>
                  <div className="perf-score-grid">
                    <div><span>Productividad</span><b>{pct(row.productivity_percent)}</b></div>
                    <div><span>Calidad</span><b>{pct(row.quality_percent)}</b></div>
                    <div><span>SLA</span><b>{pct(row.sla_percent)}</b></div>
                    <div><span>Organización</span><b>{pct(row.organization_percent)}</b></div>
                    <div><span>Profesionalismo</span><b>{row.professionalism_points == null ? "—" : `${row.professionalism_points}/100`}</b></div>
                  </div>
                  <footer>
                    {!hasPeriod ? (
                      <>
                        <button type="button" disabled={busy === `period:${row.employee_id}`} onClick={() => openPeriod(row.employee_id, true)}>Abrir Mes 0</button>
                        <button className="perf-secondary" type="button" disabled={busy === `period:${row.employee_id}`} onClick={() => openPeriod(row.employee_id, false)}>Abrir con bono</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={locked || busy} onClick={() => recalculate(row.period_id)}>⚙ Actualizar motor</button>
                        <button className="perf-secondary" type="button" onClick={() => setSelected(row)}>Ver detalle</button>
                        {!locked && <button className="perf-approve" type="button" disabled={busy} onClick={() => approve(row)}>✓ Aprobar</button>}
                      </>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <PerformanceAttendanceAdmin
        supabase={supabase}
        employees={employees}
        month={month}
      />

      {selected && (
        <div className="perf-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setSelected(null)}>
          <section className="perf-modal">
            <header>
              <div><small>FICHA MENSUAL</small><h2>{selected.employee_name}</h2><p>{selected.job_title}</p></div>
              <button type="button" onClick={() => setSelected(null)}>×</button>
            </header>
            {!selected.period_id ? <div className="perf-empty"><p>Este empleado todavía no tiene período abierto para {month}.</p></div> : (
              <>
                <div className="perf-compensation-card">
                  <div>
                    <small>COMPENSACIÓN VIGENTE</small>
                    <strong>{money(employees.find((item) => item.id === selected.employee_id)?.base_salary || 0)}</strong>
                    <span>Sueldo base</span>
                  </div>
                  <div>
                    <strong>{money(employees.find((item) => item.id === selected.employee_id)?.monthly_bonus_cap || 0)}</strong>
                    <span>Bono mensual máximo</span>
                  </div>
                  <div>
                    <strong>{money(employees.find((item) => item.id === selected.employee_id)?.quarterly_bonus_cap || 0)}</strong>
                    <span>Bono trimestral máximo</span>
                  </div>
                  <div>
                    <strong>{employees.find((item) => item.id === selected.employee_id)?.monthly_volume_target ?? 20}</strong>
                    <span>Meta mensual de volumen</span>
                  </div>
                  <button type="button" className="perf-secondary" onClick={() => openCompensationEditor(selected)}>⚙ Editar compensación</button>
                </div>

                <div className="perf-auto-engine">
                  <div className="perf-auto-head">
                    <div>
                      <small>MOTOR AUTOMÁTICO · V39.8.7</small>
                      <strong>Datos tomados de Control Aduanal</strong>
                    </div>
                    <span>{selected.auto_calculated_at ? "ACTUALIZADO" : "SIN CALCULAR"}</span>
                  </div>
                  <div className="perf-auto-grid">
                    <div><span>Gestiones elegibles</span><strong>{selected.auto_stats?.eligible ?? "—"}</strong></div>
                    <div><span>Completadas</span><strong>{selected.auto_stats?.completed ?? "—"}</strong></div>
                    <div><span>Dentro de SLA</span><strong>{selected.auto_stats?.within_sla ?? "—"}</strong></div>
                    <div><span>Volumen terminado</span><strong>{selected.volume_completed ?? 0}/{selected.volume_target ?? employees.find((item) => item.id === selected.employee_id)?.monthly_volume_target ?? 20}</strong></div>
                    <div><span>Factor de volumen</span><strong>{pct(Number(selected.volume_factor || 0) * 100)}</strong></div>
                    <div><span>Avance del período</span><strong>{pct(Number(selected.period_progress_factor || 0) * 100)}</strong></div>
                    <div><span>Errores atribuibles</span><strong>{selected.auto_stats?.attributable_errors ?? "—"}</strong></div>
                    <div><span>Asignaciones explícitas</span><strong>{selected.auto_stats?.explicit_assignments ?? "—"}</strong></div>
                    <div><span>Días marcados</span><strong>{selected.auto_stats?.attendance_days ?? "—"}</strong></div>
                    <div><span>Días puntuales</span><strong>{selected.auto_stats?.punctual_days ?? "—"}</strong></div>
                    <div><span>Incidentes a tiempo</span><strong>{selected.auto_stats?.incidents_on_time ?? "—"}/{selected.auto_stats?.incidents_total ?? "—"}</strong></div>
                  </div>
                  <p>
                    {selected.evaluation_profile === "DIGITACION"
                      ? "Paola: desde Inicio de digitación hasta Firma de declaración."
                      : selected.evaluation_profile === "GESTION_PUERTO"
                        ? "Gestión de puerto: desde Selectivo autorizado hasta Salida del puerto."
                        : "Perfil operativo."}
                    {selected.auto_stats?.sla_target_minutes
                      ? ` SLA objetivo: ${selected.auto_stats.sla_target_minutes} min.`
                      : ""}
                  </p>
                </div>

                <div className="perf-detail-total">
                  <div><span>Bono por KPI · bruto</span><strong>{money(selected.bonus_before_volume ?? selected.preliminary_bonus)}</strong></div>
                  <div><span>Proyección ajustada por volumen</span><strong>{money(selected.projected_bonus ?? selected.final_bonus)}</strong></div>
                  <div><span>Devengado actual</span><strong>{money(selected.earned_bonus ?? selected.final_bonus)}</strong></div>
                  <div><span>Resultado</span><strong>{resultLabel(selected.eligibility_result)}</strong></div>
                </div>
                <div className="perf-metric-editor">
                  <h3>Indicadores del período</h3>
                  <p>El motor ya calcula estos indicadores desde Control Aduanal. Usá esta edición manual solo como ajuste excepcional durante la etapa de validación.</p>
                  {[
                    ["productivity_percent","Productividad",selected.productivity_percent],
                    ["quality_percent","Calidad",selected.quality_percent],
                    ["sla_percent","Cumplimiento SLA",selected.sla_percent],
                  ].map(([key,label,value]) => (
                    <label key={key}><span>{label}</span><div><input type="number" min="0" max="200" step="0.1" defaultValue={value ?? ""} id={`perf-${key}-${selected.period_id}`} /><b>%</b></div></label>
                  ))}
                  {!["APPROVED","PAID","CLOSED"].includes(selected.period_status) && (
                    <button type="button" onClick={() => {
                      const get = key => {
                        const raw = document.getElementById(`perf-${key}-${selected.period_id}`)?.value;
                        return raw === "" ? null : Number(raw);
                      };
                      updateMetrics(selected, {
                        productivity_percent: get("productivity_percent"),
                        quality_percent: get("quality_percent"),
                        sla_percent: get("sla_percent"),
                      });
                    }}>Guardar y recalcular</button>
                  )}
                </div>
                <div className="perf-detail-notes">
                  <div><span>Errores graves</span><strong>{selected.severe_error_count || 0}</strong></div>
                  <div><span>Errores críticos</span><strong>{selected.critical_error_count || 0}</strong></div>
                  <div><span>Estado</span><strong>{selected.period_status}</strong></div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {editingCompensation && selected && (
        <div className="perf-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setEditingCompensation(false)}>
          <section className="perf-modal perf-form">
            <header>
              <div>
                <small>EDITAR COMPENSACIÓN</small>
                <h2>{selected.employee_name}</h2>
                <p>Estos valores pueden cambiarse cuando sea necesario. Los períodos ya aprobados o pagados conservan su cierre histórico.</p>
              </div>
              <button type="button" onClick={() => setEditingCompensation(false)}>×</button>
            </header>

            <div className="perf-form-grid">
              <label>
                <span>Sueldo base</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={compensationForm.base_salary}
                  onChange={e => setCompensationForm(p => ({ ...p, base_salary: e.target.value }))}
                />
              </label>
              <label>
                <span>Bono mensual máximo</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={compensationForm.monthly_bonus_cap}
                  onChange={e => setCompensationForm(p => ({ ...p, monthly_bonus_cap: e.target.value }))}
                />
              </label>
              <label>
                <span>Bono trimestral máximo</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={compensationForm.quarterly_bonus_cap}
                  onChange={e => setCompensationForm(p => ({ ...p, quarterly_bonus_cap: e.target.value }))}
                />
              </label>
              <label>
                <span>Meta mensual de volumen</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={compensationForm.monthly_volume_target}
                  onChange={e => setCompensationForm(p => ({ ...p, monthly_volume_target: e.target.value }))}
                />
              </label>
            </div>

            <div className="perf-compensation-note">
              <strong>🔐 Configuración gerencial</strong>
              <p>Solo Dirección puede modificar estos montos. Esta edición cambia la configuración vigente del empleado.</p>
            </div>

            <footer>
              <button className="perf-secondary" type="button" onClick={() => setEditingCompensation(false)}>Cancelar</button>
              <button type="button" disabled={busy === "compensation"} onClick={saveCompensation}>
                {busy === "compensation" ? "Guardando..." : "Guardar cambios"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {showEmployeeForm && (
        <div className="perf-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setShowEmployeeForm(false)}>
          <form className="perf-modal perf-form" onSubmit={linkEmployee}>
            <header>
              <div><small>VINCULAR USUARIO INTERNO</small><h2>¿A quién vamos a evaluar?</h2><p>No creamos otra cuenta. Usamos el usuario que ya existe en E&R.</p></div>
              <button type="button" onClick={() => setShowEmployeeForm(false)}>×</button>
            </header>

            <label>
              <span>Empleado registrado</span>
              <select value={employeeForm.user_id} onChange={e=>setEmployeeForm(p=>({...p,user_id:e.target.value}))}>
                <option value="">Seleccionar empleado...</option>
                {availableUsers.map(user => <option key={user.id} value={user.id}>{user.full_name || user.email} · {user.job_title || user.role}</option>)}
              </select>
            </label>

            <label>
              <span>Función que vamos a medir</span>
              <select value={employeeForm.evaluation_profile} onChange={e=>setEmployeeForm(p=>({...p,evaluation_profile:e.target.value}))}>
                {PROFILE_OPTIONS.map(profile => <option key={profile.value} value={profile.value}>{profile.label}</option>)}
              </select>
            </label>

            <div className="perf-role-preview">
              <strong>{selectedProfile.label}</strong>
              <p>{selectedProfile.description}</p>
              {selectedInternalUser && <small>Se vinculará a: {selectedInternalUser.full_name || selectedInternalUser.email}</small>}
            </div>

            <details className="perf-advanced">
              <summary>Configuración avanzada del bono</summary>
              <div className="perf-form-grid">
                <label><span>Sueldo base</span><input type="number" value={employeeForm.base_salary} onChange={e=>setEmployeeForm(p=>({...p,base_salary:e.target.value}))} /></label>
                <label><span>Bono mensual máximo</span><input type="number" value={employeeForm.monthly_bonus_cap} onChange={e=>setEmployeeForm(p=>({...p,monthly_bonus_cap:e.target.value}))} /></label>
                <label><span>Bono trimestral máximo</span><input type="number" value={employeeForm.quarterly_bonus_cap} onChange={e=>setEmployeeForm(p=>({...p,quarterly_bonus_cap:e.target.value}))} /></label>
                <label><span>Meta mensual de volumen</span><input type="number" min="1" step="1" value={employeeForm.monthly_volume_target} onChange={e=>setEmployeeForm(p=>({...p,monthly_volume_target:e.target.value}))} /></label>
              </div>
            </details>

            <footer><button className="perf-secondary" type="button" onClick={()=>setShowEmployeeForm(false)}>Cancelar</button><button type="submit" disabled={busy==="employee" || !employeeForm.user_id}>{busy==="employee" ? "Vinculando..." : "Vincular a Rendimiento"}</button></footer>
          </form>
        </div>
      )}
    </section>
  );
}
