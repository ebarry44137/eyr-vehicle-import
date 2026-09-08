import { useEffect, useMemo, useState } from "react";
import "./importer-pro.css";

const CATEGORIES = [
  ["FLETE", "Flete"],
  ["PUERTO", "Gastos de puerto"],
  ["ADUANA", "Gastos aduanales"],
  ["ALMACENAJE", "Almacenaje"],
  ["TRANSPORTE", "Transporte"],
  ["REPARACION", "Reparación / preparación"],
  ["COMISION", "Comisión"],
  ["OTRO", "Otro"],
];

function money(value, currency) {
  const number = Number(value || 0);
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "es-GT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
}

function emptyForm() {
  return {
    customs_record_id: "",
    category: "FLETE",
    description: "",
    amount: "",
    currency: "GTQ",
    expense_date: new Date().toISOString().slice(0, 10),
    notes: "",
  };
}

export default function ImporterProExpensesPage({ supabase, organizationId, userId }) {
  const [records, setRecords] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  async function loadData() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const [{ data: recordRows, error: recordsError }, { data: expenseRows, error: expensesError }] = await Promise.all([
        supabase
          .from("importer_customs_records")
          .select("id, vehicle, vin, office_name, invoice_value_usd, estimated_taxes_gtq, manager_fees_gtq, status")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("importer_customs_expenses")
          .select("*")
          .eq("organization_id", organizationId)
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      if (recordsError) throw recordsError;
      if (expensesError) throw expensesError;
      setRecords(Array.isArray(recordRows) ? recordRows : []);
      setExpenses(Array.isArray(expenseRows) ? expenseRows : []);
    } catch (err) {
      console.error("V39.7.5 PRO EXPENSES LOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar los costos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [organizationId]);

  const recordMap = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);
  const totals = useMemo(() => {
    const extrasGTQ = expenses.filter((e) => e.currency === "GTQ").reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const extrasUSD = expenses.filter((e) => e.currency === "USD").reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const baseGTQ = records.reduce((sum, r) => sum + Number(r.estimated_taxes_gtq || 0) + Number(r.manager_fees_gtq || 0), 0);
    const baseUSD = records.reduce((sum, r) => sum + Number(r.invoice_value_usd || 0), 0);
    return { extrasGTQ, extrasUSD, baseGTQ, baseUSD, grandGTQ: extrasGTQ + baseGTQ, grandUSD: extrasUSD + baseUSD };
  }, [records, expenses]);

  async function saveExpense(event) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error: insertError } = await supabase.from("importer_customs_expenses").insert({
        organization_id: organizationId,
        customs_record_id: form.customs_record_id || null,
        category: form.category,
        description: String(form.description || "").trim() || null,
        amount,
        currency: form.currency,
        expense_date: form.expense_date || null,
        notes: String(form.notes || "").trim() || null,
        created_by: userId,
        updated_by: userId,
      });
      if (insertError) throw insertError;
      setShowForm(false);
      setForm(emptyForm());
      setMessage("Costo registrado correctamente.");
      await loadData();
    } catch (err) {
      console.error("V39.7.5 PRO EXPENSE SAVE ERROR:", err);
      setError(err?.message || "No fue posible registrar el costo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="importer-pro-page">
      <header className="importer-pro-hero">
        <div>
          <span>IMPORTADOR PRO · CONTROL FINANCIERO</span>
          <h1>Costos de Importación</h1>
          <p>Conocé cuánto llevás invertido por vehículo y registrá los gastos adicionales de cada operación.</p>
        </div>
        <button className="pro-primary" onClick={() => setShowForm(true)}>＋ Registrar costo</button>
      </header>

      <section className="importer-pro-kpis four">
        <article><small>INVERSIÓN VEHÍCULOS</small><strong>{money(totals.baseUSD, "USD")}</strong><span>Valor de facturas registradas</span></article>
        <article><small>IMPUESTOS + HONORARIOS</small><strong>{money(totals.baseGTQ, "GTQ")}</strong><span>Costos base de tus gestiones</span></article>
        <article><small>GASTOS ADICIONALES</small><strong>{money(totals.extrasGTQ, "GTQ")}</strong><span>+ {money(totals.extrasUSD, "USD")}</span></article>
        <article className="highlight"><small>TOTAL CONTROLADO</small><strong>{money(totals.grandGTQ, "GTQ")}</strong><span>+ {money(totals.grandUSD, "USD")}</span></article>
      </section>

      {message && <div className="pro-message success">{message}</div>}
      {error && <div className="pro-message error">{error}</div>}

      <section className="importer-pro-card">
        <div className="pro-card-head"><div><small>HISTORIAL DE COSTOS</small><h2>Gastos adicionales</h2></div><button onClick={loadData}>↻ Actualizar</button></div>
        {loading ? <div className="pro-empty">Cargando costos...</div> : expenses.length === 0 ? (
          <div className="pro-empty"><span>💰</span><strong>Aún no registraste costos adicionales.</strong><p>Agregá fletes, puerto, almacenaje, transporte u otros gastos.</p></div>
        ) : (
          <div className="pro-table-wrap"><table className="pro-table"><thead><tr><th>Fecha</th><th>Gestión</th><th>Categoría</th><th>Detalle</th><th>Monto</th></tr></thead><tbody>
            {expenses.map((e) => {
              const record = recordMap.get(e.customs_record_id);
              return <tr key={e.id}><td>{e.expense_date ? new Date(`${String(e.expense_date).slice(0,10)}T12:00:00`).toLocaleDateString("es-GT") : "—"}</td><td><strong>{record?.vehicle || "Costo general"}</strong><small>{record?.vin || "Sin gestión vinculada"}</small></td><td>{CATEGORIES.find(([k]) => k === e.category)?.[1] || e.category}</td><td>{e.description || e.notes || "—"}</td><td><strong>{money(e.amount, e.currency)}</strong></td></tr>;
            })}
          </tbody></table></div>
        )}
      </section>

      {showForm && <div className="pro-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setShowForm(false); }}>
        <form className="pro-modal" onSubmit={saveExpense}>
          <div className="pro-modal-head"><div><small>IMPORTADOR PRO</small><h2>Registrar costo</h2><p>Agregalo a una gestión específica o dejalo como gasto general.</p></div><button type="button" onClick={() => setShowForm(false)}>×</button></div>
          <div className="pro-form-grid">
            <label className="span-2"><span>Gestión / vehículo</span><select value={form.customs_record_id} onChange={(e) => setForm((p) => ({...p, customs_record_id:e.target.value}))}><option value="">— Gasto general —</option>{records.map((r)=><option key={r.id} value={r.id}>{r.vehicle}{r.vin ? ` · ${r.vin}` : ""}</option>)}</select></label>
            <label><span>Categoría</span><select value={form.category} onChange={(e) => setForm((p)=>({...p,category:e.target.value}))}>{CATEGORIES.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
            <label><span>Fecha</span><input type="date" value={form.expense_date} onChange={(e)=>setForm((p)=>({...p,expense_date:e.target.value}))}/></label>
            <label><span>Moneda</span><select value={form.currency} onChange={(e)=>setForm((p)=>({...p,currency:e.target.value}))}><option value="GTQ">GTQ · Quetzales</option><option value="USD">USD · Dólares</option></select></label>
            <label><span>Monto *</span><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e)=>setForm((p)=>({...p,amount:e.target.value}))} placeholder="0.00"/></label>
            <label className="span-2"><span>Descripción</span><input value={form.description} onChange={(e)=>setForm((p)=>({...p,description:e.target.value}))} placeholder="Ej. Almacenaje por 3 días"/></label>
            <label className="span-2"><span>Notas</span><textarea rows="3" value={form.notes} onChange={(e)=>setForm((p)=>({...p,notes:e.target.value}))}/></label>
          </div>
          <div className="pro-modal-actions"><button type="button" onClick={()=>setShowForm(false)}>Cancelar</button><button className="pro-primary" disabled={saving}>{saving ? "Guardando..." : "Registrar costo"}</button></div>
        </form>
      </div>}
    </section>
  );
}
