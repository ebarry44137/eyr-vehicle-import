import { useEffect, useMemo, useState } from "react";
import "./performance-attendance-admin.css";

const monthDate = (month) => `${month}-01`;

function fmtDate(v) {
  if (!v) return "—";
  return new Date(`${v}T00:00:00`).toLocaleDateString("es-GT", {
    day: "2-digit", month: "short"
  });
}
function fmtTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("es-GT", { hour: "numeric", minute: "2-digit" });
}

export default function PerformanceAttendanceAdmin({ supabase, employees, month }) {
  const [tab, setTab] = useState("today");
  const [requests, setRequests] = useState([]);
  const [devices, setDevices] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");

  async function loadAll() {
    const [{ data: req }, { data: dev }, { data: att }, { data: sch }] = await Promise.all([
      supabase
        .from("performance_device_requests")
        .select("*")
        .order("requested_at", { ascending: false }),
      supabase
        .from("performance_authorized_devices")
        .select("*")
        .order("authorized_at", { ascending: false }),
      supabase.rpc("performance_attendance_admin_v3986", {
        p_month: monthDate(month),
      }),
      supabase
        .from("performance_work_schedules")
        .select("*"),
    ]);
    setRequests(req || []);
    setDevices(dev || []);
    setAttendance(att || []);
    setSchedules(sch || []);
  }

  useEffect(() => { loadAll(); }, [month]);

  const employeeByUser = useMemo(() => {
    const map = new Map();
    (employees || []).forEach(e => e.user_id && map.set(e.user_id, e));
    return map;
  }, [employees]);

  const todayGT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
  const todayRows = attendance.filter(r => r.work_date === todayGT);
  const pending = requests.filter(r => r.status === "PENDING");

  async function review(requestId, action) {
    setSaving(`request:${requestId}`);
    setMessage("");
    try {
      const req = requests.find(r => r.id === requestId);
      const employee = employeeByUser.get(req?.user_id);
      const { error } = await supabase.rpc("performance_review_device_v3986", {
        p_request_id: requestId,
        p_action: action,
        p_device_name: employee ? `PC · ${employee.full_name}` : "PC E&R",
      });
      if (error) throw error;
      setMessage(action === "APPROVE" ? "✅ Computadora autorizada." : "Solicitud rechazada.");
      await loadAll();
    } catch (e) {
      setMessage(e?.message || "No fue posible revisar la solicitud.");
    } finally {
      setSaving("");
    }
  }

  async function toggleDevice(device) {
    setSaving(`device:${device.id}`);
    const { error } = await supabase
      .from("performance_authorized_devices")
      .update({ active: !device.active })
      .eq("id", device.id);
    setSaving("");
    if (error) return setMessage(error.message);
    await loadAll();
  }

  async function saveSchedule(employee, draft) {
    setSaving(`schedule:${employee.id}`);
    setMessage("");
    try {
      const { error } = await supabase.rpc("performance_save_schedule_v3986", {
        p_user_id: employee.user_id,
        p_work_start: draft.work_start || "08:00",
        p_tolerance_minutes: Number(draft.tolerance_minutes || 0),
        p_monday: !!draft.monday,
        p_tuesday: !!draft.tuesday,
        p_wednesday: !!draft.wednesday,
        p_thursday: !!draft.thursday,
        p_friday: !!draft.friday,
        p_saturday: !!draft.saturday,
        p_sunday: !!draft.sunday,
      });
      if (error) throw error;
      setMessage(`✅ Horario de ${employee.full_name} actualizado.`);
      await loadAll();
    } catch (e) {
      setMessage(e?.message || "No fue posible guardar el horario.");
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="paa-panel">
      <header className="paa-head">
        <div>
          <small>ASISTENCIA · CONTROL GERENCIAL</small>
          <h2>Asistencia & PCs autorizadas</h2>
          <p>Solo Dirección puede autorizar dispositivos y configurar horarios.</p>
        </div>
        <div className="paa-badges">
          <span>{pending.length} solicitudes</span>
          <span>{devices.filter(d => d.active).length} PCs activas</span>
        </div>
      </header>

      {message && <div className="paa-message">{message}</div>}

      <nav className="paa-tabs">
        <button className={tab==="today"?"active":""} onClick={()=>setTab("today")}>Hoy</button>
        <button className={tab==="requests"?"active":""} onClick={()=>setTab("requests")}>Solicitudes {pending.length ? `(${pending.length})` : ""}</button>
        <button className={tab==="schedules"?"active":""} onClick={()=>setTab("schedules")}>Horarios</button>
        <button className={tab==="devices"?"active":""} onClick={()=>setTab("devices")}>PCs</button>
        <button className={tab==="history"?"active":""} onClick={()=>setTab("history")}>Historial</button>
      </nav>

      {tab === "today" && (
        <div className="paa-today">
          {(employees || []).map(emp => {
            const row = todayRows.find(r => r.user_id === emp.user_id);
            return (
              <article key={emp.id}>
                <div><strong>{emp.full_name}</strong><span>{emp.job_title}</span></div>
                {row ? (
                  <div className="paa-arrival">
                    <b className={row.punctual ? "ok" : "late"}>
                      {row.punctual ? "✅ Puntual" : `🕒 ${row.minutes_late || 0} min tarde`}
                    </b>
                    <span>{fmtTime(row.checked_in_at)}</span>
                  </div>
                ) : <b className="missing">Sin marcar</b>}
              </article>
            );
          })}
        </div>
      )}

      {tab === "requests" && (
        <div className="paa-list">
          {pending.length === 0 ? <div className="paa-empty">No hay PCs pendientes de autorización.</div> :
            pending.map(req => {
              const emp = employeeByUser.get(req.user_id);
              return (
                <article key={req.id}>
                  <div>
                    <strong>{emp?.full_name || "Empleado"}</strong>
                    <span>{req.device_name || "Computadora sin nombre"}</span>
                    <small>Solicitada {fmtTime(req.requested_at)}</small>
                  </div>
                  <div className="paa-actions">
                    <button className="approve" disabled={saving===`request:${req.id}`} onClick={()=>review(req.id,"APPROVE")}>✓ Autorizar</button>
                    <button className="reject" disabled={saving===`request:${req.id}`} onClick={()=>review(req.id,"REJECT")}>Rechazar</button>
                  </div>
                </article>
              );
            })}
        </div>
      )}

      {tab === "schedules" && (
        <div className="paa-schedules">
          {(employees || []).filter(e => e.user_id).map(emp => {
            const stored = schedules.find(s => s.user_id === emp.user_id);
            return <ScheduleRow key={emp.id} employee={emp} stored={stored} saving={saving} onSave={saveSchedule} />;
          })}
        </div>
      )}

      {tab === "devices" && (
        <div className="paa-list">
          {devices.length === 0 ? <div className="paa-empty">Todavía no hay computadoras autorizadas.</div> :
            devices.map(d => (
              <article key={d.id}>
                <div><strong>{d.device_name}</strong><span>{d.active ? "Activa" : "Desactivada"}</span><small>Último uso: {fmtTime(d.last_seen_at)}</small></div>
                <button className={d.active ? "reject" : "approve"} disabled={saving===`device:${d.id}`} onClick={()=>toggleDevice(d)}>
                  {d.active ? "Desactivar" : "Activar"}
                </button>
              </article>
            ))}
        </div>
      )}

      {tab === "history" && (
        <div className="paa-history">
          <div className="paa-history-head"><span>Empleado</span><span>Fecha</span><span>Hora</span><span>Resultado</span><span>PC</span></div>
          {attendance.filter(r => r.work_date).map((r,i) => (
            <div className="paa-history-row" key={`${r.user_id}-${r.work_date}-${i}`}>
              <strong>{r.employee_name}</strong><span>{fmtDate(r.work_date)}</span><span>{fmtTime(r.checked_in_at)}</span>
              <span className={r.punctual ? "ok" : "late"}>{r.punctual ? "Puntual" : `${r.minutes_late || 0} min tarde`}</span>
              <span>{r.device_name || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ScheduleRow({ employee, stored, saving, onSave }) {
  const [draft, setDraft] = useState(() => ({
    work_start: (stored?.work_start || "08:00").slice(0,5),
    tolerance_minutes: stored?.tolerance_minutes ?? 5,
    monday: stored?.monday ?? true,
    tuesday: stored?.tuesday ?? true,
    wednesday: stored?.wednesday ?? true,
    thursday: stored?.thursday ?? true,
    friday: stored?.friday ?? true,
    saturday: stored?.saturday ?? false,
    sunday: stored?.sunday ?? false,
  }));

  useEffect(() => {
    if (!stored) return;
    setDraft({
      work_start: (stored.work_start || "08:00").slice(0,5),
      tolerance_minutes: stored.tolerance_minutes ?? 5,
      monday: stored.monday ?? true, tuesday: stored.tuesday ?? true,
      wednesday: stored.wednesday ?? true, thursday: stored.thursday ?? true,
      friday: stored.friday ?? true, saturday: stored.saturday ?? false,
      sunday: stored.sunday ?? false,
    });
  }, [stored?.updated_at]);

  const days = [["monday","L"],["tuesday","M"],["wednesday","X"],["thursday","J"],["friday","V"],["saturday","S"],["sunday","D"]];

  return (
    <article>
      <div className="paa-schedule-person"><strong>{employee.full_name}</strong><span>{employee.job_title}</span></div>
      <label><span>Entrada</span><input type="time" value={draft.work_start} onChange={e=>setDraft(v=>({...v,work_start:e.target.value}))}/></label>
      <label><span>Tolerancia</span><div className="paa-minutes"><input type="number" min="0" max="120" value={draft.tolerance_minutes} onChange={e=>setDraft(v=>({...v,tolerance_minutes:e.target.value}))}/><b>min</b></div></label>
      <div className="paa-days">{days.map(([key,label])=><button type="button" key={key} className={draft[key]?"on":""} onClick={()=>setDraft(v=>({...v,[key]:!v[key]}))}>{label}</button>)}</div>
      <button className="save" disabled={saving===`schedule:${employee.id}`} onClick={()=>onSave(employee,draft)}>Guardar</button>
    </article>
  );
}
