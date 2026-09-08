import { useEffect, useMemo, useState } from "react";
import "./importer-customs-records.css";

const STATUS_OPTIONS = [
  ["DOCUMENTOS_ENTREGADOS", "Documentos entregados"],
  ["EN_TRAMITE", "En trámite"],
  ["DECLARACION_PREPARADA", "Declaración preparada"],
  ["IVA_PENDIENTE", "IVA pendiente"],
  ["IVA_PAGADO", "IVA pagado"],
  ["SELECTIVO", "Selectivo"],
  ["LIBERADO", "Liberado"],
  ["FINALIZADO", "Finalizado"],
  ["CANCELADO", "Cancelado"],
];

function money(value, currency = "GTQ") {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "es-GT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(number);
}

function statusLabel(value) {
  return STATUS_OPTIONS.find(([key]) => key === value)?.[1] || value || "—";
}

function emptyForm() {
  return {
    id: null,
    vehicle: "",
    vin: "",
    office_name: "",
    manager_name: "",
    assigned_manager_user_id: "",
    customs_office: "Puerto Barrios",
    opened_at: new Date().toISOString().slice(0, 10),
    status: "DOCUMENTOS_ENTREGADOS",
    invoice_value_usd: "",
    estimated_taxes_gtq: "",
    manager_fees_gtq: "",
    notes: "",
  };
}

export default function ImporterCustomsRecordsPage({
  supabase,
  organizationId,
  userId,
  importerName,
  planCode,
  membershipRole,
}) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const isPro = String(planCode || "").toUpperCase() === "IMPORTER_PRO";
  const isManager = isPro && String(membershipRole || "").toUpperCase() === "MEMBER";
  const [teamMembers,setTeamMembers] = useState([]);

  async function loadTeam() {
    if (!isPro) return;
    try {
      const {data,error}=await supabase.functions.invoke("importer-pro-team-manager",{body:{action:"list"}});
      if(error) throw error;
      if(data?.success) setTeamMembers((data.members||[]).filter(m=>m.role==="GESTOR"&&m.active));
    } catch(err) { console.error("V39.7.5.3 TEAM LOAD:",err); }
  }

  async function loadRecords() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      let query = supabase
        .from("importer_customs_records")
        .select("*")
        .eq("organization_id", organizationId)
        .order("opened_at", { ascending: false })
        .order("created_at", { ascending: false });

      const clean = String(search || "").trim();
      if (clean) {
        const safe = clean.replace(/[%(),]/g, " ");
        query = query.or(
          `vehicle.ilike.%${safe}%,vin.ilike.%${safe}%,office_name.ilike.%${safe}%,manager_name.ilike.%${safe}%,customs_office.ilike.%${safe}%`
        );
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("V39.7.4.4 IMPORTER CUSTOMS RECORDS LOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar tus gestiones aduanales.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecords();
    loadTeam();
  }, [organizationId]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => !["FINALIZADO", "CANCELADO"].includes(r.status)).length,
    iva: rows.filter((r) => ["IVA_PENDIENTE", "IVA_PAGADO"].includes(r.status)).length,
    selective: rows.filter((r) => r.status === "SELECTIVO").length,
    finalized: rows.filter((r) => r.status === "FINALIZADO").length,
  }), [rows]);

  function openCreate() {
    setForm(emptyForm());
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function openEdit(row) {
    setForm({
      id: row.id,
      vehicle: row.vehicle || "",
      vin: row.vin || "",
      office_name: row.office_name || "",
      manager_name: row.manager_name || "",
      assigned_manager_user_id: row.assigned_manager_user_id || "",
      customs_office: row.customs_office || "",
      opened_at: row.opened_at ? String(row.opened_at).slice(0, 10) : "",
      status: row.status || "DOCUMENTOS_ENTREGADOS",
      invoice_value_usd: row.invoice_value_usd ?? "",
      estimated_taxes_gtq: row.estimated_taxes_gtq ?? "",
      manager_fees_gtq: row.manager_fees_gtq ?? "",
      notes: row.notes || "",
    });
    setError("");
    setMessage("");
    setShowForm(true);
  }

  async function saveRecord(event) {
    event.preventDefault();
    if (!organizationId || !userId) {
      setError("No pudimos identificar tu cuenta.");
      return;
    }

    const cleanVin = String(form.vin || "").trim().toUpperCase();
    if (cleanVin && cleanVin.length !== 17) {
      setError("El VIN debe tener 17 caracteres o quedar vacío.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    if (isManager && form.id) {
      try {
        const {error:managerError}=await supabase.rpc("importer_pro_manager_update_record",{
          p_record_id:form.id,p_status:form.status,p_notes:String(form.notes||"").trim()||null
        });
        if(managerError) throw managerError;
        setMessage("Gestión actualizada.");
        setShowForm(false);
        await loadRecords();
      } catch(err) { setError(err?.message||"No fue posible actualizar la gestión."); }
      finally { setSaving(false); }
      return;
    }

    const selectedManager=teamMembers.find(m=>m.user_id===form.assigned_manager_user_id);
    const payload = {
      organization_id: organizationId,
      vehicle: String(form.vehicle || "").trim(),
      vin: cleanVin || null,
      office_name: String(form.office_name || "").trim(),
      manager_name: selectedManager?.full_name || String(form.manager_name || "").trim() || null,
      assigned_manager_user_id: form.assigned_manager_user_id || null,
      customs_office: String(form.customs_office || "").trim() || null,
      opened_at: form.opened_at || null,
      status: form.status,
      invoice_value_usd: form.invoice_value_usd === "" ? null : Number(form.invoice_value_usd),
      estimated_taxes_gtq: form.estimated_taxes_gtq === "" ? null : Number(form.estimated_taxes_gtq),
      manager_fees_gtq: form.manager_fees_gtq === "" ? null : Number(form.manager_fees_gtq),
      notes: String(form.notes || "").trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };

    try {
      if (!payload.vehicle) throw new Error("Ingresá el vehículo.");
      if (!payload.office_name) throw new Error("Ingresá la oficina o gestor responsable.");

      if (form.id) {
        const { error: updateError } = await supabase
          .from("importer_customs_records")
          .update(payload)
          .eq("id", form.id)
          .eq("organization_id", organizationId);
        if (updateError) throw updateError;
        setMessage("Gestión aduanal actualizada.");
      } else {
        const { error: insertError } = await supabase
          .from("importer_customs_records")
          .insert({ ...payload, created_by: userId });
        if (insertError) throw insertError;
        setMessage("Gestión aduanal registrada.");
      }

      setShowForm(false);
      setForm(emptyForm());
      await loadRecords();
    } catch (err) {
      console.error("V39.7.4.4 IMPORTER CUSTOMS RECORD SAVE ERROR:", err);
      setError(err?.message || "No fue posible guardar la gestión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="importer-customs-v39744">
      <header className="importer-customs-hero">
        <div>
          <span className="importer-customs-kicker">CONTROL PERSONAL · {isPro ? "IMPORTADOR PRO" : "IMPORTADOR"}</span>
          <h1>Mis Gestiones Aduanales</h1>
          <p>
            Llevá el registro de los trámites que realizás con cualquier gestor u oficina.
            Esta información es para tu propio control.
          </p>
        </div>
        {!isManager && <button type="button" className="importer-customs-new" onClick={openCreate}>
          ＋ Nueva Gestión Aduanal
        </button>}
      </header>

      <div className="importer-customs-note">
        <span>🔐</span>
        <div>
          <strong>Tu registro es independiente</strong>
          <p>
            No significa que E&amp;R Solutions esté gestionando este trámite. Registrá aquí la
            oficina o gestor con quien realmente estás trabajando.
          </p>
        </div>
      </div>

      <section className="importer-customs-kpis">
        <article><small>TOTAL</small><strong>{stats.total}</strong><span>Gestiones registradas</span></article>
        <article><small>ACTIVAS</small><strong>{stats.active}</strong><span>En proceso</span></article>
        <article><small>IVA</small><strong>{stats.iva}</strong><span>Pendiente / pagado</span></article>
        <article><small>SELECTIVO</small><strong>{stats.selective}</strong><span>En esa etapa</span></article>
        <article><small>FINALIZADAS</small><strong>{stats.finalized}</strong><span>Trámites cerrados</span></article>
      </section>

      <section className="importer-customs-panel">
        <div className="importer-customs-toolbar">
          <div>
            <small>HISTORIAL</small>
            <h2>Control de mis trámites</h2>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); loadRecords(); }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar vehículo, VIN, gestor u oficina..."
            />
            <button type="submit" disabled={loading}>Buscar</button>
            <button type="button" onClick={() => { setSearch(""); setTimeout(loadRecords, 0); }}>↻</button>
          </form>
        </div>

        {message && <div className="importer-customs-message success">{message}</div>}
        {error && <div className="importer-customs-message error">{error}</div>}

        {loading ? (
          <div className="importer-customs-empty">Cargando gestiones...</div>
        ) : rows.length === 0 ? (
          <div className="importer-customs-empty">
            <span>🛃</span>
            <strong>Todavía no tenés gestiones aduanales registradas.</strong>
            <p>Creá la primera para comenzar a llevar tu historial.</p>
            <button type="button" onClick={openCreate}>＋ Registrar mi primera gestión</button>
          </div>
        ) : (
          <div className="importer-customs-table-wrap">
            <table className="importer-customs-table">
              <thead>
                <tr>
                  <th>Vehículo</th>
                  <th>Gestor / Oficina</th>
                  <th>Aduana</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Costos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.vehicle}</strong>
                      <small>{row.vin || "Sin VIN"}</small>
                    </td>
                    <td>
                      <strong>{row.office_name}</strong>
                      <small>{row.manager_name || "Sin gestor individual"}</small>
                    </td>
                    <td>{row.customs_office || "—"}</td>
                    <td>{row.opened_at ? new Date(`${String(row.opened_at).slice(0, 10)}T12:00:00`).toLocaleDateString("es-GT") : "—"}</td>
                    <td><span className={`importer-record-status status-${String(row.status || "").toLowerCase()}`}>{statusLabel(row.status)}</span></td>
                    <td>
                      <strong>{row.estimated_taxes_gtq != null ? money(row.estimated_taxes_gtq) : "—"}</strong>
                      <small>{row.manager_fees_gtq != null ? `Honorarios ${money(row.manager_fees_gtq)}` : "Sin honorarios"}</small>
                    </td>
                    <td><button type="button" onClick={() => openEdit(row)}>{isManager ? "Actualizar →" : "Ver / Editar →"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <div className="importer-customs-modal-backdrop" onMouseDown={(e) => {
          if (e.target === e.currentTarget && !saving) setShowForm(false);
        }}>
          <form className="importer-customs-modal" onSubmit={saveRecord}>
            <div className="importer-customs-modal-head">
              <div>
                <small>{form.id ? "EDITAR GESTIÓN" : "NUEVA GESTIÓN ADUANAL"}</small>
                <h2>{form.id ? form.vehicle || "Gestión aduanal" : "Registrar trámite"}</h2>
                <p>{importerName || "Importador"} · control independiente</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} disabled={saving}>×</button>
            </div>

            {isManager ? (
              <div className="importer-customs-form-grid">
                <label className="span-2"><span>Vehículo</span><input value={form.vehicle} disabled /></label>
                <label><span>Estado</span><select value={form.status} onChange={(e)=>setForm(p=>({...p,status:e.target.value}))}>{STATUS_OPTIONS.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
                <label className="span-2"><span>Observaciones del gestor</span><textarea rows="5" value={form.notes} onChange={(e)=>setForm(p=>({...p,notes:e.target.value}))} /></label>
              </div>
            ) : (
            <div className="importer-customs-form-grid">
              <label className="span-2">
                <span>Vehículo *</span>
                <input required value={form.vehicle} onChange={(e) => setForm((p) => ({ ...p, vehicle: e.target.value }))} placeholder="Ej. 2021 Toyota Tacoma TRD" />
              </label>

              <label>
                <span>VIN</span>
                <input maxLength="17" value={form.vin} onChange={(e) => setForm((p) => ({ ...p, vin: e.target.value.toUpperCase() }))} placeholder="17 caracteres" />
              </label>

              <label>
                <span>Fecha de inicio</span>
                <input type="date" value={form.opened_at} onChange={(e) => setForm((p) => ({ ...p, opened_at: e.target.value }))} />
              </label>

              <label>
                <span>Oficina / empresa que lleva el trámite *</span>
                <input required value={form.office_name} onChange={(e) => setForm((p) => ({ ...p, office_name: e.target.value }))} placeholder="Ej. Trámites Aduanales Shaddai" />
              </label>

              <label>
                <span>Gestor asignado</span>
                {isPro ? <select value={form.assigned_manager_user_id} onChange={(e)=>setForm(p=>({...p,assigned_manager_user_id:e.target.value}))}>
                  <option value="">Sin asignar</option>{teamMembers.map(m=><option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                </select> : <input value={form.manager_name} onChange={(e)=>setForm(p=>({...p,manager_name:e.target.value}))} placeholder="Nombre del gestor" />}
              </label>

              <label>
                <span>Aduana</span>
                <input value={form.customs_office} onChange={(e) => setForm((p) => ({ ...p, customs_office: e.target.value }))} placeholder="Puerto Barrios" />
              </label>

              <label>
                <span>Estado</span>
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                  {STATUS_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>

              <label>
                <span>Valor factura USD</span>
                <input type="number" min="0" step="0.01" value={form.invoice_value_usd} onChange={(e) => setForm((p) => ({ ...p, invoice_value_usd: e.target.value }))} placeholder="0.00" />
              </label>

              <label>
                <span>Impuestos estimados GTQ</span>
                <input type="number" min="0" step="0.01" value={form.estimated_taxes_gtq} onChange={(e) => setForm((p) => ({ ...p, estimated_taxes_gtq: e.target.value }))} placeholder="0.00" />
              </label>

              <label>
                <span>Honorarios gestor GTQ</span>
                <input type="number" min="0" step="0.01" value={form.manager_fees_gtq} onChange={(e) => setForm((p) => ({ ...p, manager_fees_gtq: e.target.value }))} placeholder="0.00" />
              </label>

              <label className="span-2">
                <span>Observaciones</span>
                <textarea rows="4" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Pendientes, documentos, referencias o cualquier nota útil..." />
              </label>
            </div>
            )}
            {!isManager && <div className="importer-customs-cost-summary">
              <div><span>Factura</span><strong>{form.invoice_value_usd === "" ? "—" : money(form.invoice_value_usd, "USD")}</strong></div>
              <div><span>Impuestos</span><strong>{form.estimated_taxes_gtq === "" ? "—" : money(form.estimated_taxes_gtq)}</strong></div>
              <div><span>Honorarios</span><strong>{form.manager_fees_gtq === "" ? "—" : money(form.manager_fees_gtq)}</strong></div>
            </div>}
            <div className="importer-customs-modal-actions">
              <button type="button" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</button>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? "Guardando..." : form.id ? "Guardar cambios" : "Registrar gestión"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
