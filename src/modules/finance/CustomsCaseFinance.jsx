import { useEffect, useMemo, useState } from "react";
import "./finance.css";

const LOCATIONS = [
  { value: "", label: "Seleccionar ubicación", cost: 0 },
  { value: "CHIQUITA", label: "Chiquita", cost: 1015 },
  { value: "ALDEGUA", label: "Aldegua", cost: 930 },
  { value: "SANTO_TOMAS", label: "Santo Tomás de Castilla", cost: 200 },
  { value: "CIUDAD", label: "Ciudad", cost: 900 },
];

const SHIPPING_LINES = [
  "Transoceanic",
  "Port to Port",
  "Central de Logística",
  "Matus",
];

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function CustomsCaseFinance({
  supabase,
  caseId,
  caseCode,
  clientName,
  compact = false,
  onChanged,
}) {
  const [finance, setFinance] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    amount_gtq: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "Efectivo",
    note: "",
  });

  async function load() {
    if (!caseId) return;
    setLoading(true);
    setError("");

    try {
      const { data: financeRow, error: financeError } = await supabase
        .from("customs_case_finance")
        .select("*")
        .eq("customs_case_id", caseId)
        .maybeSingle();

      if (financeError) throw financeError;

      const { data: paymentRows, error: paymentError } = await supabase
        .from("finance_case_payments")
        .select("*")
        .eq("customs_case_id", caseId)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (paymentError) throw paymentError;

      setFinance(
        financeRow || {
          customs_case_id: caseId,
          client_charge_gtq: "",
          operation_location: "",
          corroboration_cost_gtq: 0,
          includes_duca: false,
          duca_client_value_gtq: 165,
          duca_cost_gtq: 80,
          document_collection_company: "",
          document_collection_cost_gtq: "",
          dispatch_management_cost_gtq: 100,
          other_direct_cost_gtq: "",
          other_direct_cost_note: "",
          notes: "",
        }
      );
      setPayments(paymentRows || []);
    } catch (err) {
      console.error("CASE FINANCE LOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar la información financiera.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [caseId]);

  const paid = useMemo(
    () => payments.reduce((sum, item) => sum + number(item.amount_gtq), 0),
    [payments]
  );

  const directCosts = useMemo(() => {
    if (!finance) return 0;
    return (
      number(finance.corroboration_cost_gtq) +
      (finance.includes_duca ? number(finance.duca_cost_gtq || 80) : 0) +
      number(finance.document_collection_cost_gtq) +
      number(finance.dispatch_management_cost_gtq) +
      number(finance.other_direct_cost_gtq)
    );
  }, [finance]);

  const billed = number(finance?.client_charge_gtq);
  const pending = Math.max(0, billed - paid);
  const grossProfit = billed - directCosts;

  function setLocation(value) {
    const location = LOCATIONS.find((item) => item.value === value);
    setFinance((prev) => ({
      ...prev,
      operation_location: value,
      corroboration_cost_gtq: location?.cost || 0,
    }));
  }

  async function saveFinance() {
    if (!caseId || !finance) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        customs_case_id: caseId,
        client_charge_gtq: number(finance.client_charge_gtq),
        operation_location: finance.operation_location || null,
        corroboration_cost_gtq: number(finance.corroboration_cost_gtq),
        includes_duca: Boolean(finance.includes_duca),
        duca_client_value_gtq: finance.includes_duca
          ? number(finance.duca_client_value_gtq || 165)
          : 0,
        duca_cost_gtq: finance.includes_duca
          ? number(finance.duca_cost_gtq || 80)
          : 0,
        document_collection_company:
          finance.document_collection_company || null,
        document_collection_cost_gtq: number(
          finance.document_collection_cost_gtq
        ),
        dispatch_management_cost_gtq: number(
          finance.dispatch_management_cost_gtq || 100
        ),
        other_direct_cost_gtq: number(finance.other_direct_cost_gtq),
        other_direct_cost_note: finance.other_direct_cost_note || null,
        notes: finance.notes || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error: saveError } = await supabase
        .from("customs_case_finance")
        .upsert(payload, { onConflict: "customs_case_id" })
        .select()
        .single();

      if (saveError) throw saveError;

      setFinance(data);
      setMessage("Información financiera guardada.");
      onChanged?.();
    } catch (err) {
      console.error("CASE FINANCE SAVE ERROR:", err);
      setError(err?.message || "No fue posible guardar los valores financieros.");
    } finally {
      setSaving(false);
    }
  }

  async function addPayment(event) {
    event.preventDefault();

    const amount = number(paymentForm.amount_gtq);

    if (amount <= 0) {
      setError("Ingresá un monto de pago válido.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { error: paymentError } = await supabase
        .from("finance_case_payments")
        .insert({
          customs_case_id: caseId,
          amount_gtq: amount,
          payment_date: paymentForm.payment_date,
          payment_method: paymentForm.payment_method || null,
          note: paymentForm.note || null,
        });

      if (paymentError) throw paymentError;

      setPaymentForm({
        amount_gtq: "",
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: "Efectivo",
        note: "",
      });

      setMessage("Pago registrado correctamente.");
      await load();
      onChanged?.();
    } catch (err) {
      console.error("CASE PAYMENT ERROR:", err);
      setError(err?.message || "No fue posible registrar el pago.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="case-finance-loading">Cargando finanzas...</div>;
  }

  if (!finance) return null;

  return (
    <section className={`case-finance-card ${compact ? "compact" : ""}`}>
      <div className="case-finance-head">
        <div>
          <span>FINANZAS DEL EXPEDIENTE</span>
          <h3>{caseCode || "Gestión aduanal"}</h3>
          <p>{clientName || "Cliente"}</p>
        </div>
        <div className="case-finance-profit">
          <small>UTILIDAD ESTIMADA</small>
          <strong>Q {grossProfit.toLocaleString("es-GT", { minimumFractionDigits: 2 })}</strong>
        </div>
      </div>

      {message && <div className="finance-message success">{message}</div>}
      {error && <div className="finance-message error">{error}</div>}

      <div className="case-finance-kpis">
        <article>
          <span>Cobrado / acordado</span>
          <strong>Q {billed.toLocaleString("es-GT", { minimumFractionDigits: 2 })}</strong>
        </article>
        <article>
          <span>Recibido</span>
          <strong>Q {paid.toLocaleString("es-GT", { minimumFractionDigits: 2 })}</strong>
        </article>
        <article>
          <span>Pendiente</span>
          <strong>Q {pending.toLocaleString("es-GT", { minimumFractionDigits: 2 })}</strong>
        </article>
        <article>
          <span>Costos directos</span>
          <strong>Q {directCosts.toLocaleString("es-GT", { minimumFractionDigits: 2 })}</strong>
        </article>
      </div>

      <div className="case-finance-grid">
        <label>
          <span>Total cobrado al cliente (Q)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={finance.client_charge_gtq ?? ""}
            onChange={(e) =>
              setFinance((prev) => ({
                ...prev,
                client_charge_gtq: e.target.value,
              }))
            }
          />
          <small>Ingresá el total acordado con el cliente por la gestión.</small>
        </label>

        <label>
          <span>Ubicación / corroboración</span>
          <select
            value={finance.operation_location || ""}
            onChange={(e) => setLocation(e.target.value)}
          >
            {LOCATIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
                {item.cost ? ` · Q${item.cost}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Costo corroboración (Q)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={finance.corroboration_cost_gtq ?? 0}
            onChange={(e) =>
              setFinance((prev) => ({
                ...prev,
                corroboration_cost_gtq: e.target.value,
              }))
            }
          />
        </label>

        <label className="finance-checkbox">
          <input
            type="checkbox"
            checked={Boolean(finance.includes_duca)}
            onChange={(e) =>
              setFinance((prev) => ({
                ...prev,
                includes_duca: e.target.checked,
                duca_client_value_gtq: e.target.checked ? 165 : 0,
                duca_cost_gtq: e.target.checked ? 80 : 0,
              }))
            }
          />
          <div>
            <strong>Incluye DUCA · Q165</strong>
            <small>Costo real del número: Q80 · margen interno: Q85.</small>
          </div>
        </label>

        <label>
          <span>Recolección de documentos</span>
          <select
            value={finance.document_collection_company || ""}
            onChange={(e) =>
              setFinance((prev) => ({
                ...prev,
                document_collection_company: e.target.value,
              }))
            }
          >
            <option value="">No aplica / pendiente</option>
            {SHIPPING_LINES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Costo recolección (Q)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={finance.document_collection_cost_gtq ?? ""}
            onChange={(e) =>
              setFinance((prev) => ({
                ...prev,
                document_collection_cost_gtq: e.target.value,
              }))
            }
            placeholder="Variable"
          />
        </label>

        <label>
          <span>Gestión de despacho · Geovany (Q)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={finance.dispatch_management_cost_gtq ?? 100}
            onChange={(e) =>
              setFinance((prev) => ({
                ...prev,
                dispatch_management_cost_gtq: e.target.value,
              }))
            }
          />
        </label>

        <label>
          <span>Otros costos directos (Q)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={finance.other_direct_cost_gtq ?? ""}
            onChange={(e) =>
              setFinance((prev) => ({
                ...prev,
                other_direct_cost_gtq: e.target.value,
              }))
            }
          />
        </label>

        <label className="span-2">
          <span>Concepto otros costos</span>
          <input
            value={finance.other_direct_cost_note || ""}
            onChange={(e) =>
              setFinance((prev) => ({
                ...prev,
                other_direct_cost_note: e.target.value,
              }))
            }
          />
        </label>
      </div>

      <div className="case-finance-breakdown">
        <div><span>Corroboración</span><strong>Q {number(finance.corroboration_cost_gtq).toFixed(2)}</strong></div>
        {finance.includes_duca && (
          <>
            <div><span>DUCA cobrada</span><strong>Q {number(finance.duca_client_value_gtq || 165).toFixed(2)}</strong></div>
            <div><span>Costo número DUCA</span><strong>- Q {number(finance.duca_cost_gtq || 80).toFixed(2)}</strong></div>
            <div className="profit-line"><span>Margen DUCA</span><strong>Q {(number(finance.duca_client_value_gtq || 165) - number(finance.duca_cost_gtq || 80)).toFixed(2)}</strong></div>
          </>
        )}
        <div><span>Recolección documentos</span><strong>Q {number(finance.document_collection_cost_gtq).toFixed(2)}</strong></div>
        <div><span>Gestión despacho</span><strong>Q {number(finance.dispatch_management_cost_gtq || 100).toFixed(2)}</strong></div>
        <div><span>Otros directos</span><strong>Q {number(finance.other_direct_cost_gtq).toFixed(2)}</strong></div>
        <div className="total"><span>Total costos directos</span><strong>Q {directCosts.toFixed(2)}</strong></div>
      </div>

      <div className="case-finance-actions">
        <button
          type="button"
          className="finance-primary"
          onClick={saveFinance}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Guardar finanzas"}
        </button>
      </div>

      <div className="case-payment-section">
        <div className="case-payment-title">
          <div>
            <span>PAGOS DEL CLIENTE</span>
            <h4>Registrar abonos</h4>
          </div>
          <strong>Q {paid.toLocaleString("es-GT", { minimumFractionDigits: 2 })}</strong>
        </div>

        <form className="case-payment-form" onSubmit={addPayment}>
          <input
            type="number"
            step="0.01"
            min="0"
            value={paymentForm.amount_gtq}
            onChange={(e) =>
              setPaymentForm((prev) => ({ ...prev, amount_gtq: e.target.value }))
            }
            placeholder="Monto Q"
          />
          <input
            type="date"
            value={paymentForm.payment_date}
            onChange={(e) =>
              setPaymentForm((prev) => ({ ...prev, payment_date: e.target.value }))
            }
          />
          <select
            value={paymentForm.payment_method}
            onChange={(e) =>
              setPaymentForm((prev) => ({ ...prev, payment_method: e.target.value }))
            }
          >
            <option>Efectivo</option>
            <option>Transferencia</option>
            <option>Depósito</option>
            <option>Cheque</option>
            <option>Otro</option>
          </select>
          <input
            value={paymentForm.note}
            onChange={(e) =>
              setPaymentForm((prev) => ({ ...prev, note: e.target.value }))
            }
            placeholder="Nota"
          />
          <button type="submit" disabled={saving}>+ Registrar pago</button>
        </form>

        {payments.length > 0 && (
          <div className="case-payment-list">
            {payments.map((item) => (
              <div key={item.id}>
                <span>{new Date(`${item.payment_date}T12:00:00`).toLocaleDateString("es-GT")}</span>
                <span>{item.payment_method || "—"}</span>
                <span>{item.note || "Sin nota"}</span>
                <strong>Q {number(item.amount_gtq).toLocaleString("es-GT", { minimumFractionDigits: 2 })}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
