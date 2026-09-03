import { useEffect, useMemo, useState } from "react";
import "./finance.css";
import AccountsPayablePanel from "./AccountsPayablePanel";
import AccountsReceivablePanel from "./AccountsReceivablePanel";

function q(value) {
  const number = Number(value || 0);
  return Number.isFinite(number)
    ? `Q ${number.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "Q 0.00";
}

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

export default function FinanceDashboard({
  supabase,
  officeName = "E&R Solutions",
  isWhiteLabelClient = false,
}) {
  const [summary, setSummary] = useState(null);
  const [cases, setCases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [closings, setClosings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));

  const [expenseForm, setExpenseForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    category: "SUELDOS",
    description: "",
    payee: "",
    amount_gtq: "",
    payment_method: "Transferencia",
    note: "",
  });

  const [closingForm, setClosingForm] = useState({
    closing_type: "MENSUAL",
    opening_cash_gtq: "",
  });

  async function load() {
    setLoading(true);
    setError("");

    try {
      const { data: summaryRows, error: summaryError } = await supabase.rpc(
        "finance_period_summary",
        {
          p_from: fromDate,
          p_to: toDate,
        }
      );
      if (summaryError) throw summaryError;

      const { data: caseRows, error: caseError } = await supabase
        .from("finance_case_overview")
        .select("*")
        .gte("notice_date", fromDate)
        .lte("notice_date", toDate)
        .order("notice_date", { ascending: false });

      if (caseError) throw caseError;

      const { data: expenseRows, error: expenseError } = await supabase
        .from("finance_expenses")
        .select("*")
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate)
        .order("expense_date", { ascending: false });

      if (expenseError) throw expenseError;

      const { data: closingRows, error: closingError } = await supabase
        .from("finance_closings")
        .select("*")
        .order("period_end", { ascending: false })
        .limit(24);

      if (closingError) throw closingError;

      setSummary(Array.isArray(summaryRows) ? summaryRows[0] : summaryRows);
      setCases(caseRows || []);
      setExpenses(expenseRows || []);
      setClosings(closingRows || []);

      const latest = (closingRows || [])[0];
      if (!closingForm.opening_cash_gtq && latest?.closing_cash_gtq != null) {
        setClosingForm((prev) => ({
          ...prev,
          opening_cash_gtq: String(latest.closing_cash_gtq),
        }));
      }
    } catch (err) {
      console.error("FINANCE DASHBOARD LOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar Finanzas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [fromDate, toDate]);

  async function addExpense(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (Number(expenseForm.amount_gtq || 0) <= 0) {
      setError("Ingresá un monto de gasto válido.");
      return;
    }

    try {
      const { error: insertError } = await supabase
        .from("finance_expenses")
        .insert({
          expense_date: expenseForm.expense_date,
          category: expenseForm.category,
          description: expenseForm.description || expenseForm.category,
          payee: expenseForm.payee || null,
          amount_gtq: Number(expenseForm.amount_gtq),
          payment_method: expenseForm.payment_method || null,
          note: expenseForm.note || null,
        });

      if (insertError) throw insertError;

      setExpenseForm({
        expense_date: new Date().toISOString().slice(0, 10),
        category: "SUELDOS",
        description: "",
        payee: "",
        amount_gtq: "",
        payment_method: "Transferencia",
        note: "",
      });
      setMessage("Gasto registrado.");
      await load();
    } catch (err) {
      setError(err?.message || "No fue posible registrar el gasto.");
    }
  }

  async function createClosing() {
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "create_finance_closing",
        {
          p_type: closingForm.closing_type,
          p_from: fromDate,
          p_to: toDate,
          p_opening_cash: Number(closingForm.opening_cash_gtq || 0),
        }
      );

      if (rpcError) throw rpcError;

      const row = Array.isArray(data) ? data[0] : data;
      setMessage(
        `Cierre ${row?.closing_code || ""} generado. Saldo final: ${q(
          row?.closing_cash_gtq
        )}`
      );
      await load();
    } catch (err) {
      setError(err?.message || "No fue posible generar el cierre.");
    }
  }

  const s = summary || {
    billed_gtq: 0,
    collected_gtq: 0,
    receivable_gtq: 0,
    direct_costs_gtq: 0,
    gross_profit_gtq: 0,
    general_expenses_gtq: 0,
    net_result_gtq: 0,
  };

  const expenseByCategory = useMemo(() => {
    return expenses.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + Number(item.amount_gtq || 0);
      return acc;
    }, {});
  }, [expenses]);

  return (
    <section className="finance-module">
      <header className="finance-header">
        <div>
          <span className="finance-eyebrow">CONTROL FINANCIERO</span>
          <h1>Finanzas</h1>
          <p>Rentabilidad por expediente, cuentas por cobrar, gastos y cierres.</p>
        </div>

        <div className="finance-period">
          <label>
            <span>Desde</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <button onClick={load} disabled={loading}>↻</button>
        </div>
      </header>

      {message && <div className="finance-message success">{message}</div>}
      {error && <div className="finance-message error">{error}</div>}

      <section className="finance-kpis">
        <article><span>Facturado</span><strong>{q(s.billed_gtq)}</strong><small>Acuerdos con clientes</small></article>
        <article className="cash"><span>Cobrado</span><strong>{q(s.collected_gtq)}</strong><small>Dinero recibido</small></article>
        <article className="warning"><span>Por cobrar</span><strong>{q(s.receivable_gtq)}</strong><small>Cartera pendiente</small></article>
        <article><span>Costos directos</span><strong>{q(s.direct_costs_gtq)}</strong><small>Gestiones / terceros</small></article>
        <article className="profit"><span>Utilidad bruta</span><strong>{q(s.gross_profit_gtq)}</strong><small>Facturado - costos directos</small></article>
        <article><span>Gastos generales</span><strong>{q(s.general_expenses_gtq)}</strong><small>Personal, renta, servicios...</small></article>
        <article><span>Pagos a proveedores</span><strong>{q(s.supplier_payments_gtq || 0)}</strong><small>Salidas reales por cuentas a pagar</small></article>
        <article className={Number(s.cash_result_gtq ?? s.net_result_gtq) >= 0 ? "profit" : "danger"}><span>Flujo de caja</span><strong>{q(s.cash_result_gtq ?? s.net_result_gtq)}</strong><small>Cobrado - salidas reales - gastos</small></article>
      </section>

      <div className="finance-grid-layout">
        <section className="finance-panel finance-cases-panel">
          <div className="finance-panel-head">
            <div><span>EXPEDIENTES</span><h2>Rentabilidad por gestión</h2></div>
            <strong>{cases.length}</strong>
          </div>

          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Expediente</th>
                  <th>Cliente</th>
                  <th>Cobrado</th>
                  <th>Recibido</th>
                  <th>Pendiente</th>
                  <th>Costos</th>
                  <th>Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {cases.length === 0 && (
                  <tr><td colSpan="7" className="finance-empty">No hay expedientes financieros en el período.</td></tr>
                )}
                {cases.map((item) => (
                  <tr key={item.customs_case_id}>
                    <td><strong>{item.case_code}</strong><small>{item.notice_date}</small></td>
                    <td><strong>{item.client_name}</strong><small>{item.vin}</small></td>
                    <td>{q(item.client_charge_gtq)}</td>
                    <td>{q(item.paid_gtq)}</td>
                    <td className={Number(item.pending_gtq) > 0 ? "pending" : ""}>{q(item.pending_gtq)}</td>
                    <td>{q(item.direct_costs_gtq)}</td>
                    <td className={Number(item.gross_profit_gtq) >= 0 ? "positive" : "negative"}><strong>{q(item.gross_profit_gtq)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="finance-panel finance-expense-entry">
          <div className="finance-panel-head">
            <div><span>EGRESOS</span><h2>Registrar gasto general</h2></div>
          </div>

          <form onSubmit={addExpense}>
            <label><span>Fecha</span><input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm((p) => ({...p, expense_date:e.target.value}))}/></label>
            <label>
              <span>Categoría</span>
              <select value={expenseForm.category} onChange={(e) => setExpenseForm((p) => ({...p, category:e.target.value}))}>
                <option value="SUELDOS">Sueldos / trabajadores</option>
                <option value="ENERGIA">Energía</option>
                <option value="INTERNET">Internet</option>
                <option value="RENTA">Renta</option>
                <option value="INSUMOS">Insumos</option>
                <option value="TRANSPORTE">Transporte</option>
                <option value="OTROS">Otros</option>
              </select>
            </label>
            <label><span>Descripción</span><input value={expenseForm.description} onChange={(e)=>setExpenseForm((p)=>({...p,description:e.target.value}))}/></label>
            <label><span>Beneficiario</span><input value={expenseForm.payee} onChange={(e)=>setExpenseForm((p)=>({...p,payee:e.target.value}))}/></label>
            <label><span>Monto (Q)</span><input type="number" step="0.01" value={expenseForm.amount_gtq} onChange={(e)=>setExpenseForm((p)=>({...p,amount_gtq:e.target.value}))}/></label>
            <label><span>Forma de pago</span><select value={expenseForm.payment_method} onChange={(e)=>setExpenseForm((p)=>({...p,payment_method:e.target.value}))}><option>Transferencia</option><option>Efectivo</option><option>Cheque</option><option>Tarjeta</option><option>Otro</option></select></label>
            <label className="span-2"><span>Nota</span><input value={expenseForm.note} onChange={(e)=>setExpenseForm((p)=>({...p,note:e.target.value}))}/></label>
            <button type="submit">+ Registrar gasto</button>
          </form>
        </section>
      </div>

      <section className="finance-panel">
        <div className="finance-panel-head">
          <div><span>GASTOS DEL PERÍODO</span><h2>Distribución de egresos</h2></div>
          <strong>{q(s.general_expenses_gtq)}</strong>
        </div>

        <div className="expense-category-grid">
          {["SUELDOS","ENERGIA","INTERNET","RENTA","INSUMOS","TRANSPORTE","OTROS"].map((category) => (
            <article key={category}><span>{category.replace("_"," ")}</span><strong>{q(expenseByCategory[category] || 0)}</strong></article>
          ))}
        </div>

        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Beneficiario</th><th>Forma</th><th>Monto</th></tr></thead>
            <tbody>
              {expenses.map((item) => (
                <tr key={item.id}>
                  <td>{item.expense_date}</td><td>{item.category}</td><td>{item.description}</td><td>{item.payee || "—"}</td><td>{item.payment_method || "—"}</td><td><strong>{q(item.amount_gtq)}</strong></td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan="6" className="finance-empty">No hay gastos registrados en el período.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <AccountsReceivablePanel
  supabase={supabase}
  onChanged={load}
  officeName={officeName}
  isWhiteLabelClient={isWhiteLabelClient}
/>

      <AccountsPayablePanel
        supabase={supabase}
        onChanged={load}
      />

      <section className="finance-closing-section">
        <div className="finance-closing-builder">
          <div>
            <span>CIERRE DE CAJA</span>
            <h2>Generar cierre</h2>
            <p>El saldo final podrá utilizarse como saldo inicial del siguiente período.</p>
          </div>

          <div className="closing-controls">
            <label><span>Tipo</span><select value={closingForm.closing_type} onChange={(e)=>setClosingForm((p)=>({...p,closing_type:e.target.value}))}><option value="QUINCENAL">Quincenal</option><option value="MENSUAL">Mensual</option></select></label>
            <label><span>Saldo inicial (Q)</span><input type="number" step="0.01" value={closingForm.opening_cash_gtq} onChange={(e)=>setClosingForm((p)=>({...p,opening_cash_gtq:e.target.value}))}/></label>
            <button onClick={createClosing}>Generar cierre →</button>
          </div>

          <div className="closing-preview">
            <div><span>Saldo inicial</span><strong>{q(closingForm.opening_cash_gtq)}</strong></div>
            <div><span>+ Cobrado</span><strong>{q(s.collected_gtq)}</strong></div>
            <div><span>- Salidas operativas reales</span><strong>{q(s.cash_direct_outflows_gtq ?? s.direct_costs_gtq)}</strong></div>
            <div><span className="closing-subnote">Incluye pagos a proveedores: {q(s.supplier_payments_gtq || 0)}</span><strong></strong></div>
            <div><span>- Gastos generales</span><strong>{q(s.general_expenses_gtq)}</strong></div>
            <div className="closing-total"><span>Saldo final estimado</span><strong>{q(Number(closingForm.opening_cash_gtq || 0) + Number(s.collected_gtq || 0) - Number((s.cash_direct_outflows_gtq ?? s.direct_costs_gtq) || 0) - Number(s.general_expenses_gtq || 0))}</strong></div>
          </div>
        </div>

        <div className="finance-closing-history">
          <div className="finance-panel-head"><div><span>HISTORIAL</span><h2>Cierres realizados</h2></div></div>
          {closings.length === 0 && <div className="finance-empty">Todavía no hay cierres.</div>}
          {closings.map((item) => (
            <article key={item.id}>
              <div><strong>{item.closing_code}</strong><span>{item.closing_type} · {item.period_start} → {item.period_end}</span></div>
              <div><small>SALDO FINAL</small><strong>{q(item.closing_cash_gtq)}</strong></div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
