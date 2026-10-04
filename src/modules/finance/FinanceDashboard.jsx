import { useEffect, useMemo, useState } from "react";
import "./finance.css";
import "./finance-v39622.css";
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

export default function FinanceDashboard({ supabase }) {
  const [summary, setSummary] = useState(null);
  const [cases, setCases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [closings, setClosings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reserves, setReserves] = useState({
    duca_pending_gtq: 0,
    dispatch_pending_gtq: 0,
    other_pending_gtq: 0,
    total_pending_gtq: 0,
    supplier_payments_period_gtq: 0,
    duca_provider_debt_gtq: 0,
    dispatch_provider_debt_gtq: 0,
    other_provider_debt_gtq: 0,
    total_provider_debt_gtq: 0,
  });

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

  // V39.9.18.10G.1 · CLOSING PRO PREVIEW UI
  // Vista segura: el servidor determina apertura y movimientos.
  const [closingPreview, setClosingPreview] = useState(null);
  const [closingPreviewError, setClosingPreviewError] = useState("");

  // V39.9.18.10H.1 · FINANCE PRO TOP DASHBOARD
  // Fuente de verdad de liquidez/banco. Separada del P&L por rango.
  const [bankDashboard, setBankDashboard] = useState(null);
  const [bankDashboardError, setBankDashboardError] = useState("");

  // V39.9.18.10H.2.1 · POST-CLOSING CURRENT PERIOD
  // El dashboard operativo empieza después del último cierre ACTIVE del motor BANK.
  const [currentPeriodFrom, setCurrentPeriodFrom] = useState(fromDate);

  async function load() {
    setLoading(true);
    setError("");

    try {
      // ============================================================
      // V39.9.18.10E.3 · BANK DIAGNOSTIC
      // Diagnóstico autenticado solamente.
      // NO modifica registros, cierres ni KPIs.
      // ============================================================
      const { data: bankDiagnosticRows, error: bankDiagnosticError } =
        await supabase.rpc("finance_bank_dashboard");

      if (bankDiagnosticError) {
        setBankDashboard(null);
        setBankDashboardError(
          bankDiagnosticError?.message ||
            "No fue posible cargar el estado bancario."
        );
        console.error(
          "🏦 V39.9.18.10E.3 · BANK DIAGNOSTIC ERROR:",
          bankDiagnosticError
        );
      } else {
        const bankDiagnostic = Array.isArray(bankDiagnosticRows)
          ? bankDiagnosticRows[0]
          : bankDiagnosticRows;

        setBankDashboard(bankDiagnostic || null);
        setBankDashboardError("");

        console.group("🏦 V39.9.18.10E.3 · BANK DIAGNOSTIC");
        console.log("Diagnóstico completo:", bankDiagnostic);

        console.table({
          "Saldo conciliado": Number(
            bankDiagnostic?.reconciliation_balance_gtq || 0
          ),
          "Cobros expedientes BANK": Number(
            bankDiagnostic?.case_collections_gtq || 0
          ),
          "Cobros declaraciones BANK": Number(
            bankDiagnostic?.declaration_collections_gtq || 0
          ),
          "Total cobros BANK": Number(
            bankDiagnostic?.total_collections_gtq || 0
          ),
          "Gastos generales BANK": Number(
            bankDiagnostic?.general_expenses_gtq || 0
          ),
          "Pagos proveedores BANK": Number(
            bankDiagnostic?.supplier_payments_gtq || 0
          ),
          "Total salidas BANK": Number(
            bankDiagnostic?.total_bank_outflows_gtq || 0
          ),
          "Movimiento neto BANK": Number(
            bankDiagnostic?.net_bank_movement_gtq || 0
          ),
          "Saldo bancario calculado": Number(
            bankDiagnostic?.calculated_bank_balance_gtq || 0
          ),
          "Compromisos pendientes": Number(
            bankDiagnostic?.pending_commitments_gtq || 0
          ),
          "Disponible bancario": Number(
            bankDiagnostic?.available_bank_gtq || 0
          ),
        });

        console.groupEnd();
      }

      // ============================================================
      // V39.9.18.10F.4 + 10G.1 · NEXT CLOSING PREVIEW
      // Simulación autenticada del próximo cierre.
      // NO inserta cierres ni modifica movimientos.
      // ============================================================
      const { data: closingPreviewRows, error: closingPreviewRpcError } =
        await supabase.rpc("finance_next_closing_preview");

      if (closingPreviewRpcError) {
        setClosingPreview(null);
        setClosingPreviewError(
          closingPreviewRpcError?.message ||
            "No fue posible simular el próximo cierre."
        );
        console.error(
          "🧪 V39.9.18.10F.4 · NEXT CLOSING PREVIEW ERROR:",
          closingPreviewRpcError
        );
      } else {
        const nextClosingPreview = Array.isArray(closingPreviewRows)
          ? closingPreviewRows[0]
          : closingPreviewRows;

        setClosingPreview(nextClosingPreview || null);
        setClosingPreviewError("");

        console.group("🧪 V39.9.18.10F.4 · NEXT CLOSING PREVIEW");
        console.log("Preview completo:", nextClosingPreview);
        console.table({
          "Modo checkpoint": nextClosingPreview?.checkpoint_mode || "—",
          "Corte desde": nextClosingPreview?.cutoff_from || "—",
          "Corte simulado": nextClosingPreview?.cutoff_to || "—",
          "Saldo inicial BANK": Number(nextClosingPreview?.opening_bank_gtq || 0),
          "Cantidad total cobros": Number(nextClosingPreview?.total_collections_count || 0),
          "Total cobros BANK": Number(nextClosingPreview?.total_collections_gtq || 0),
          "Cantidad total salidas": Number(nextClosingPreview?.total_bank_outflows_count || 0),
          "Total salidas BANK": Number(nextClosingPreview?.total_bank_outflows_gtq || 0),
          "Movimiento neto BANK": Number(nextClosingPreview?.net_bank_movement_gtq || 0),
          "Saldo bancario proyectado": Number(nextClosingPreview?.projected_bank_balance_gtq || 0),
          "Compromisos pendientes": Number(nextClosingPreview?.pending_commitments_gtq || 0),
          "Disponible bancario proyectado": Number(nextClosingPreview?.projected_available_bank_gtq || 0),
        });
        console.groupEnd();
      }

      const { data: closingRows, error: closingError } = await supabase
        .from("finance_closings")
        .select("*")
        .order("period_end", { ascending: false })
        .limit(24);

      if (closingError) throw closingError;

      // V39.9.18.10H.2.1 · POST-CLOSING CURRENT PERIOD
      const latestBankClosing = (closingRows || [])
        .filter((item) => item?.status === "ACTIVE" && item?.bank_cutoff_to)
        .sort(
          (a, b) =>
            new Date(b.bank_cutoff_to).getTime() -
            new Date(a.bank_cutoff_to).getTime()
        )[0];

      const nextPeriodFrom = latestBankClosing?.period_end
        ? (() => {
            const [y, m, d] = latestBankClosing.period_end.split("-").map(Number);
            const next = new Date(Date.UTC(y, m - 1, d + 1));
            return next.toISOString().slice(0, 10);
          })()
        : fromDate;

      setCurrentPeriodFrom(nextPeriodFrom);

      const operationalFrom = nextPeriodFrom > fromDate ? nextPeriodFrom : fromDate;
      const hasOpenAccountingDays = operationalFrom <= toDate;

      let summaryRows = null;
      let summaryError = null;

      if (hasOpenAccountingDays) {
        const summaryResponse = await supabase.rpc(
          "finance_period_summary",
          {
            p_from: operationalFrom,
            p_to: toDate,
          }
        );
        summaryRows = summaryResponse.data;
        summaryError = summaryResponse.error;
      } else {
        summaryRows = {
          billed_gtq: 0,
          collected_gtq: 0,
          receivable_gtq: 0,
          direct_costs_gtq: 0,
          gross_profit_gtq: 0,
          general_expenses_gtq: 0,
          net_result_gtq: 0,
          supplier_payments_gtq: 0,
          duca_accrued_cost_gtq: 0,
          cash_direct_outflows_gtq: 0,
          cash_result_gtq: 0,
        };
      }

      if (summaryError) throw summaryError;

      const { data: reserveRows, error: reserveError } = await supabase.rpc(
        "finance_operational_reserves_v396223",
        { p_from: fromDate, p_to: toDate }
      );
      if (reserveError) throw reserveError;

      let caseRows = [];
      let caseError = null;

      if (hasOpenAccountingDays) {
        const caseResponse = await supabase
          .from("finance_case_overview")
          .select("*")
          .gte("notice_date", operationalFrom)
          .lte("notice_date", toDate)
          .order("notice_date", { ascending: false });

        caseRows = caseResponse.data || [];
        caseError = caseResponse.error;
      }

      if (caseError) throw caseError;

      let expenseRows = [];
      let expenseError = null;

      if (hasOpenAccountingDays) {
        const expenseResponse = await supabase
          .from("finance_expenses")
          .select("*")
          .gte("expense_date", operationalFrom)
          .lte("expense_date", toDate)
          .order("expense_date", { ascending: false });

        expenseRows = expenseResponse.data || [];
        expenseError = expenseResponse.error;
      }

      if (expenseError) throw expenseError;



      setSummary(Array.isArray(summaryRows) ? summaryRows[0] : summaryRows);
      setReserves((Array.isArray(reserveRows) ? reserveRows[0] : reserveRows) || {
        duca_pending_gtq: 0,
        dispatch_pending_gtq: 0,
        other_pending_gtq: 0,
        total_pending_gtq: 0,
        supplier_payments_period_gtq: 0,
        duca_provider_debt_gtq: 0,
        dispatch_provider_debt_gtq: 0,
        other_provider_debt_gtq: 0,
        total_provider_debt_gtq: 0,
      });
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

  async function deleteExpense(item) {
    if (!item?.id) {
      setError("No fue posible identificar el gasto.");
      return;
    }

    const amount = Number(item.amount_gtq || 0).toLocaleString(
      "es-GT",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    );

    const confirmed = window.confirm(
      [
        "¿Eliminar este egreso?",
        "",
        "Fecha: " + (item.expense_date || "—"),
        "Descripción: " + (item.description || "—"),
        "Beneficiario: " + (item.payee || "—"),
        "Monto: Q " + amount,
        "",
        "Esta acción eliminará el registro financiero.",
      ].join("\n")
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const { data, error: deleteError } = await supabase
        .from("finance_expenses")
        .delete()
        .eq("id", item.id)
        .select("id");

      if (deleteError) throw deleteError;

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(
          "Supabase no eliminó el egreso. Verificá los permisos de eliminación."
        );
      }

      setMessage(
        "Egreso eliminado correctamente: " +
        (item.description || item.category || "Gasto") +
        " · Q " +
        amount
      );

      await load();
    } catch (err) {
      console.error("FINANCE EXPENSE DELETE ERROR:", err);

      setError(
        err?.message ||
        "No fue posible eliminar el egreso."
      );
    }
  }


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

  // V39.9.18.10G.2 · SAFE CLOSING CONFIRMATION
  async function createClosing() {
    setError("");
    setMessage("");

    try {
      // 1) Preview fresco justo antes de confirmar.
      const { data: freshPreviewRows, error: freshPreviewError } =
        await supabase.rpc("finance_next_closing_preview");

      if (freshPreviewError) throw freshPreviewError;

      const freshPreview = Array.isArray(freshPreviewRows)
        ? freshPreviewRows[0]
        : freshPreviewRows;

      if (!freshPreview) {
        throw new Error("No fue posible obtener la simulación bancaria del cierre.");
      }

      // Refresca también lo visible para que la confirmación y la pantalla
      // representen el mismo snapshot previo.
      setClosingPreview(freshPreview);
      setClosingPreviewError("");

      const money = (value) =>
        Number(value || 0).toLocaleString("es-GT", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      const checkpointLabel =
        freshPreview.checkpoint_mode === "PREVIOUS_CLOSING"
          ? "Último cierre"
          : freshPreview.checkpoint_mode === "RECONCILIATION"
            ? "Conciliación bancaria"
            : freshPreview.checkpoint_mode || "—";

      const confirmed = window.confirm(
        [
          "¿Confirmar cierre financiero?",
          "",
          "Período: " + fromDate + " → " + toDate,
          "Tipo: " + closingForm.closing_type,
          "Punto de partida: " + checkpointLabel,
          "",
          "Saldo inicial BANK: Q " + money(freshPreview.opening_bank_gtq),
          "Entradas BANK: Q " + money(freshPreview.total_collections_gtq),
          "Salidas BANK: Q " + money(freshPreview.total_bank_outflows_gtq),
          "Movimiento neto BANK: Q " + money(freshPreview.net_bank_movement_gtq),
          "",
          "Saldo bancario a cerrar: Q " +
            money(freshPreview.projected_bank_balance_gtq),
          "Compromisos pendientes: Q " +
            money(freshPreview.pending_commitments_gtq),
          "Disponible no comprometido: Q " +
            money(freshPreview.projected_available_bank_gtq),
          "",
          "Este cierre creará un nuevo checkpoint financiero.",
          "Los movimientos incluidos no volverán a consumirse en el siguiente cierre.",
          "",
          "¿Deseás continuar?",
        ].join("\n")
      );

      if (!confirmed) return;

      // 2) El servidor vuelve a calcular el resultado definitivo bajo
      //    el bloqueo transaccional de V39.9.18.10F.5.
      const { data, error: rpcError } = await supabase.rpc(
        "create_finance_closing",
        {
          p_type: closingForm.closing_type,
          p_from: fromDate,
          p_to: toDate,

          // Compatibilidad con la firma legacy.
          // El backend 10F.5 IGNORA este valor para gobernar la apertura.
          p_opening_cash: Number(freshPreview.opening_bank_gtq || 0),
        }
      );

      if (rpcError) throw rpcError;

      const row = Array.isArray(data) ? data[0] : data;

      if (!row?.id || !row?.closing_code) {
        throw new Error(
          "El servidor no devolvió un cierre válido. Revisá antes de volver a intentar."
        );
      }

      setMessage(
        `Cierre ${row.closing_code} generado correctamente. Saldo bancario final: ${q(
          row.closing_cash_gtq
        )}`
      );

      // 3) load() debe cambiar el preview de RECONCILIATION
      //    a PREVIOUS_CLOSING después del primer cierre nuevo.
      await load();
    } catch (err) {
      console.error("FINANCE SAFE CLOSING ERROR:", err);
      setError(
        err?.message ||
          "No fue posible generar el cierre financiero."
      );
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

  console.log("🔥 FINANCE SUMMARY REAL:", summary);

  const reserveTotal = Number(reserves?.total_pending_gtq || 0);
  const providerDebtTotal = Number(reserves?.total_provider_debt_gtq || 0);
  // V39.6.22.7 · DISPONIBLE REAL BASADO EN FLUJO DE CAJA
//
// cash_result_gtq representa:
// dinero cobrado
// - pagos reales realizados a proveedores
// - gastos generales
//
// Al resultado de caja únicamente le restamos el apartado
// operativo que todavía permanece comprometido.
const grossProfit = Number(s.gross_profit_gtq || 0);
const generalExpenses = Number(s.general_expenses_gtq || 0);
const cashResult = Number(s.cash_result_gtq || 0);

const availableAfterReserves =
  cashResult - reserveTotal;

  // V39.9.18.10H.1 · FINANCE PRO TOP DASHBOARD
  const bankOpening = Number(bankDashboard?.reconciliation_balance_gtq || 0);
  const bankCollections = Number(bankDashboard?.total_collections_gtq || 0);
  const bankOutflows = Number(bankDashboard?.total_bank_outflows_gtq || 0);
  const bankNetMovement = Number(bankDashboard?.net_bank_movement_gtq || 0);
  const bankBalance = Number(bankDashboard?.calculated_bank_balance_gtq || 0);
  const bankCommitments = Number(bankDashboard?.pending_commitments_gtq || 0);
  const bankAvailable = Number(bankDashboard?.available_bank_gtq || 0);

  console.log("🔥 CONCILIACION FINANZAS:", {
  desde: fromDate,
  hasta: toDate,

  cobrado: Number(s.collected_gtq || 0),

  costosDirectos: Number(s.direct_costs_gtq || 0),
  pagosProveedores: Number(s.supplier_payments_gtq || 0),
  salidasCajaDirectas: Number(s.cash_direct_outflows_gtq || 0),

  gastosGenerales: Number(s.general_expenses_gtq || 0),

  cashResult: Number(s.cash_result_gtq || 0),

  apartadoPendiente: reserveTotal,

  disponibleCalculado: availableAfterReserves,
});

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
          <div style={{width:"100%",fontSize:"10px",fontWeight:900,letterSpacing:".08em",color:"#64748b",marginBottom:"3px"}}>
            📚 CONSULTA HISTÓRICA / RANGO
          </div>
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

      {/* V39.9.18.10H.2.1 · POST-CLOSING CURRENT PERIOD */}
      <div className="finance-message" style={{ marginBottom: "14px" }}>
        <strong>📍 Período financiero actual:</strong>{" "}
        {currentPeriodFrom <= toDate
          ? `${currentPeriodFrom} → ${toDate}`
          : "Sin movimientos contables nuevos después del último cierre"}
        {" · "}
        <span>Saldo de arrastre BANK: {q(bankBalance)}</span>
      </div>

      {/* V39.9.18.10H.3 · FINANCE VISUAL SEPARATION */}
      <section style={{
        marginBottom:"18px",
        padding:"18px",
        border:"1px solid #dbe4ee",
        borderRadius:"18px",
        background:"rgba(255,255,255,.58)"
      }}>
        <div style={{marginBottom:"12px"}}>
          <span className="finance-eyebrow">📊 PERÍODO FINANCIERO ACTUAL</span>
          <h2 style={{margin:"4px 0 2px",fontSize:"20px"}}>Actividad desde el último cierre</h2>
          <p style={{margin:0,color:"#64748b",fontSize:"12px"}}>
            Solo muestra actividad contable nueva. Los movimientos incluidos en FIN-2026-0003 permanecen en el historial.
          </p>
        </div>

        <section className="finance-kpis">
          <article>
            <span>Facturado desde último cierre</span>
            <strong>{q(s.billed_gtq)}</strong>
            <small>Facturación nueva del período abierto</small>
          </article>

          <article className="warning">
            <span>Por cobrar</span>
            <strong>{q(s.receivable_gtq)}</strong>
            <small>Cartera pendiente del período abierto</small>
          </article>

          <article>
            <span>Costos desde último cierre</span>
            <strong>{q(s.direct_costs_gtq)}</strong>
            <small>Costos nuevos del período abierto</small>
          </article>

          <article className="profit">
            <span>Utilidad bruta</span>
            <strong>{q(s.gross_profit_gtq)}</strong>
            <small>Facturado nuevo - costos nuevos</small>
          </article>

          <article>
            <span>Gastos desde último cierre</span>
            <strong>{q(s.general_expenses_gtq)}</strong>
            <small>Gastos nuevos del período abierto</small>
          </article>

          <article className={Number(s.net_result_gtq || 0) >= 0 ? "profit" : "danger"}>
            <span>Utilidad neta desde último cierre</span>
            <strong>{q(s.net_result_gtq)}</strong>
            <small>Resultado del período abierto</small>
          </article>
        </section>
      </section>

      <section style={{
        marginBottom:"18px",
        padding:"18px",
        border:"1px solid #bfdbfe",
        borderRadius:"18px",
        background:"linear-gradient(135deg, rgba(239,246,255,.9), rgba(255,255,255,.72))"
      }}>
        <div style={{marginBottom:"12px"}}>
          <span className="finance-eyebrow">🏦 ESTADO BANCARIO</span>
          <h2 style={{margin:"4px 0 2px",fontSize:"20px"}}>Banco desde el último checkpoint</h2>
          <p style={{margin:0,color:"#64748b",fontSize:"12px"}}>
            El saldo de arrastre ya contiene todo lo ocurrido antes del último cierre. Aquí solo se suman o restan movimientos BANK nuevos.
          </p>
        </div>

        <section className="finance-kpis">
          <article className="cash">
            <span>Entradas BANK nuevas</span>
            <strong>{q(bankCollections)}</strong>
            <small>Cobros posteriores al checkpoint</small>
          </article>

          <article>
            <span>Salidas BANK nuevas</span>
            <strong>{q(bankOutflows)}</strong>
            <small>Gastos y pagos posteriores al checkpoint</small>
          </article>

          <article className={bankNetMovement >= 0 ? "profit" : "danger"}>
            <span>Movimiento neto BANK</span>
            <strong>{q(bankNetMovement)}</strong>
            <small>Entradas nuevas - salidas nuevas</small>
          </article>

          <article className="cash">
            <span>Saldo bancario actual</span>
            <strong>{q(bankBalance)}</strong>
            <small>Saldo de arrastre + movimiento BANK nuevo</small>
          </article>

          <article className="warning">
            <span>Compromisos pendientes</span>
            <strong>{q(bankCommitments)}</strong>
            <small>Obligaciones no pagadas; todavía no reducen el banco</small>
          </article>

          <article className={bankAvailable >= 0 ? "profit" : "danger"}>
            <span>Disponible no comprometido</span>
            <strong>{q(bankAvailable)}</strong>
            <small>Saldo bancario - compromisos pendientes</small>
          </article>
        </section>
      </section>

      {bankDashboardError && (
        <div className="finance-message error">
          Estado bancario no disponible: {bankDashboardError}
        </div>
      )}

      <section className="finance-reserve-board">
        <div className="finance-reserve-head">
          <div>
            <span className="finance-eyebrow">DETALLE OPERATIVO DE OBLIGACIONES</span>
            <h2>Compromisos y servicios pendientes</h2>
            <p>El saldo bancario y el disponible superior usan el nuevo motor BANK. Este bloque conserva el desglose operativo para identificar de dónde provienen las obligaciones pendientes.</p>
          </div>
          <div className="finance-provider-debt-total">
            <small>COMPROMISOS PENDIENTES</small>
            <strong>{q(bankCommitments)}</strong>
          </div>
        </div>

        <div className="finance-reserve-grid finance-reserve-grid-v396223">
          <article className="debt-card">
            <span>💳 Deuda total proveedores</span>
            <strong>{q(providerDebtTotal)}</strong>
            <small>Todo lo pendiente: lotes DUCA + despachos + otros</small>
          </article>

          <article>
            <span>🧾 Apartado DUCA usadas</span>
            <strong>{q(reserves?.duca_pending_gtq)}</strong>
            <small>Solo correlativos ya utilizados en gestiones y aún no cubiertos</small>
          </article>

          <article>
            <span>🚙 Despachos pendientes</span>
            <strong>{q(reserves?.dispatch_pending_gtq)}</strong>
            <small>Gestiones de despacho reconocidas y todavía no pagadas</small>
          </article>

          <article>
            <span>🔒 Compromisos pendientes</span>
            <strong>{q(bankCommitments)}</strong>
            <small>Total pendiente usado por el motor bancario</small>
          </article>

        </div>

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
            <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Beneficiario</th><th>Forma</th><th>Monto</th><th style={{textAlign:"center"}}>Acciones</th></tr></thead>
            <tbody>
              {expenses.map((item) => (
                <tr key={item.id}>
                  <td>{item.expense_date}</td><td>{item.category}</td><td>{item.description}</td><td>{item.payee || "—"}</td><td>{item.payment_method || "—"}</td><td><strong>{q(item.amount_gtq)}</strong></td>
                  <td style={{textAlign:"center"}}>
                    <button
                      type="button"
                      onClick={() => deleteExpense(item)}
                      title="Eliminar egreso"
                      aria-label={"Eliminar egreso " + (item.description || "")}
                      style={{
                        border: "1px solid #fecaca",
                        background: "#fff1f2",
                        color: "#dc2626",
                        width: "32px",
                        height: "32px",
                        borderRadius: "9px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "15px",
                        lineHeight: 1,
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan="7" className="finance-empty">No hay gastos registrados en el período.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <AccountsReceivablePanel
        supabase={supabase}
        onChanged={load}
      />

      <AccountsPayablePanel
        supabase={supabase}
        onChanged={load}
      />

      {/* V39.9.18.10G.1 · CLOSING PRO PREVIEW UI */}
      <section className="finance-closing-section">
        <div className="finance-closing-builder">
          <div>
            <span>CIERRE FINANCIERO PRO</span>
            <h2>Próximo cierre bancario</h2>
            <p>
              El saldo inicial y los movimientos BANK son determinados por el servidor
              desde el último checkpoint confiable. Los compromisos se muestran aparte:
              no reducen el saldo bancario hasta que realmente se pagan.
            </p>
          </div>

          <div className="closing-controls">
            <label>
              <span>Tipo</span>
              <select
                value={closingForm.closing_type}
                onChange={(e) =>
                  setClosingForm((p) => ({
                    ...p,
                    closing_type: e.target.value,
                  }))
                }
              >
                <option value="QUINCENAL">Quincenal</option>
                <option value="MENSUAL">Mensual</option>
              </select>
            </label>

            <div>
              <span style={{display:"block",fontSize:"12px",fontWeight:700,marginBottom:"6px"}}>
                Punto de partida
              </span>
              <strong>
                {closingPreview?.checkpoint_mode === "PREVIOUS_CLOSING"
                  ? "Último cierre"
                  : closingPreview?.checkpoint_mode === "RECONCILIATION"
                    ? "Conciliación bancaria"
                    : "—"}
              </strong>
            </div>

            <button
              type="button"
              onClick={createClosing}
              disabled={loading || !closingPreview || Boolean(closingPreviewError)}
              title={
                closingPreviewError
                  ? "El preview bancario presenta un error."
                  : !closingPreview
                    ? "Esperando simulación bancaria."
                    : "Revisar y confirmar el cierre financiero."
              }
            >
              {loading ? "Procesando…" : "Generar cierre →"}
            </button>
          </div>

          {closingPreviewError && (
            <div className="finance-message error">
              No se puede habilitar el cierre: {closingPreviewError}
            </div>
          )}

          {!closingPreview && !closingPreviewError && (
            <div className="finance-empty">
              Calculando simulación bancaria…
            </div>
          )}

          {closingPreview && (
            <div className="closing-preview">
              <div>
                <span>🏦 Saldo inicial BANK</span>
                <strong>{q(closingPreview.opening_bank_gtq)}</strong>
              </div>

              <div>
                <span>+ Cobros BANK</span>
                <strong>{q(closingPreview.total_collections_gtq)}</strong>
              </div>

              <div>
                <span className="closing-subnote">
                  {Number(closingPreview.total_collections_count || 0)} movimiento(s):
                  {" "}
                  {Number(closingPreview.case_collections_count || 0)} expediente(s) +
                  {" "}
                  {Number(closingPreview.declaration_collections_count || 0)} declaración(es)
                </span>
                <strong></strong>
              </div>

              <div>
                <span>- Salidas BANK</span>
                <strong>{q(closingPreview.total_bank_outflows_gtq)}</strong>
              </div>

              <div>
                <span className="closing-subnote">
                  {Number(closingPreview.total_bank_outflows_count || 0)} movimiento(s):
                  {" "}
                  {Number(closingPreview.general_expenses_count || 0)} gasto(s) +
                  {" "}
                  {Number(closingPreview.supplier_payments_count || 0)} pago(s) a proveedores
                </span>
                <strong></strong>
              </div>

              <div>
                <span>Movimiento neto BANK</span>
                <strong>{q(closingPreview.net_bank_movement_gtq)}</strong>
              </div>

              <div>
                <span>Saldo bancario proyectado</span>
                <strong>{q(closingPreview.projected_bank_balance_gtq)}</strong>
              </div>

              <div>
                <span>- Compromisos pendientes</span>
                <strong>{q(closingPreview.pending_commitments_gtq)}</strong>
              </div>

              <div className="closing-total">
                <span>Disponible no comprometido</span>
                <strong>{q(closingPreview.projected_available_bank_gtq)}</strong>
              </div>

              <div>
                <span className="closing-subnote">
                  Corte técnico desde: {closingPreview.cutoff_from
                    ? new Date(closingPreview.cutoff_from).toLocaleString("es-GT")
                    : "—"}
                </span>
                <strong></strong>
              </div>

              <div>
                <span className="closing-subnote">
                  Simulación al: {closingPreview.cutoff_to
                    ? new Date(closingPreview.cutoff_to).toLocaleString("es-GT")
                    : "—"}
                </span>
                <strong></strong>
              </div>
            </div>
          )}
        </div>

        <div className="finance-closing-history">
          <div className="finance-panel-head">
            <div><span>HISTORIAL</span><h2>Cierres realizados</h2></div>
          </div>

          {closings.length === 0 && (
            <div className="finance-empty">Todavía no hay cierres.</div>
          )}

          {closings.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.closing_code}</strong>
                <span>
                  {item.closing_type} · {item.period_start} → {item.period_end}
                  {item.status === "VOID" ? " · ANULADO" : ""}
                </span>
              </div>
              <div>
                <small>SALDO FINAL</small>
                <strong>{q(item.closing_cash_gtq)}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
