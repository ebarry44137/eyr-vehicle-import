import { useEffect, useMemo, useState } from "react";
import "./accounts-payable.css";

function money(value) {
  return `Q ${Number(value || 0).toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AccountsPayablePanel({ supabase, onChanged }) {
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    amount_gtq: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "Transferencia",
    note: "",
  });

  async function load() {
    setLoading(true);
    setError("");

    try {
      const { data: rows, error: rowsError } = await supabase
        .from("finance_accounts_payable_overview")
        .select("*")
        .order("purchase_date", { ascending: false });

      if (rowsError) throw rowsError;

      const { data: paymentRows, error: paymentsError } = await supabase
        .from("finance_accounts_payable_payments")
        .select("*")
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

      if (paymentsError) throw paymentsError;

      setItems(rows || []);
      setPayments(paymentRows || []);

      if (selected) {
        const refreshed = (rows || []).find((item) => item.id === selected.id);
        setSelected(refreshed || null);
      }
    } catch (err) {
      console.error("ACCOUNTS PAYABLE LOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar las cuentas por pagar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => {
          acc.original += Number(item.original_amount_gtq || 0);
          acc.paid += Number(item.paid_gtq || 0);
          acc.pending += Number(item.pending_gtq || 0);
          return acc;
        },
        { original: 0, paid: 0, pending: 0 }
      ),
    [items]
  );

  async function registerPayment(event) {
    event.preventDefault();

    if (!selected) return;

    const amount = Number(form.amount_gtq || 0);

    if (amount <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }

    if (amount > Number(selected.pending_gtq || 0)) {
      setError("El pago no puede superar el saldo pendiente.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "register_accounts_payable_payment",
        {
          p_payable_id: selected.id,
          p_amount_gtq: amount,
          p_payment_date: form.payment_date,
          p_payment_method: form.payment_method,
          p_note: form.note.trim() || null,
        }
      );

      if (rpcError) throw rpcError;

      const row = Array.isArray(data) ? data[0] : data;

      setMessage(
        `Pago registrado. Saldo pendiente: ${money(
          row?.pending_gtq ?? Number(selected.pending_gtq || 0) - amount
        )}.`
      );

      setForm({
        amount_gtq: "",
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: "Transferencia",
        note: "",
      });

      await load();
      onChanged?.();
    } catch (err) {
      console.error("PAYABLE PAYMENT ERROR:", err);
      setError(err?.message || "No fue posible registrar el pago.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="accounts-payable-panel">
      <div className="accounts-payable-head">
        <div>
          <span>CUENTAS POR PAGAR</span>
          <h2>Proveedores / Agente de Aduanas</h2>
          <p>
            La deuda se registra al comprar. El egreso de caja ocurre cuando
            realmente se efectúa el pago.
          </p>
        </div>

        <div className="accounts-payable-total">
          <small>SALDO PENDIENTE</small>
          <strong>{money(totals.pending)}</strong>
        </div>
      </div>

      <div className="accounts-payable-kpis">
        <article>
          <span>Comprado a crédito/contado</span>
          <strong>{money(totals.original)}</strong>
        </article>
        <article>
          <span>Pagado</span>
          <strong>{money(totals.paid)}</strong>
        </article>
        <article className="pending">
          <span>Por pagar</span>
          <strong>{money(totals.pending)}</strong>
        </article>
      </div>

      {message && <div className="finance-message success">{message}</div>}
      {error && <div className="finance-message error">{error}</div>}

      <div className="accounts-payable-layout">
        <div className="accounts-payable-list">
          {loading && <div className="accounts-payable-empty">Cargando...</div>}

          {!loading && items.length === 0 && (
            <div className="accounts-payable-empty">
              No hay cuentas por pagar registradas.
            </div>
          )}

          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`accounts-payable-item ${
                selected?.id === item.id ? "active" : ""
              }`}
              onClick={() => {
                setSelected(item);
                setError("");
                setMessage("");
              }}
            >
              <div>
                <strong>{item.creditor_name}</strong>
                <span>{item.concept}</span>
                <small>
                  {item.batch_code || item.source_type} · {item.purchase_date}
                </small>
              </div>

              <div>
                <small>{item.status}</small>
                <strong>{money(item.pending_gtq)}</strong>
                <span>pendiente</span>
              </div>
            </button>
          ))}
        </div>

        <div className="accounts-payable-payment">
          {!selected ? (
            <div className="accounts-payable-select">
              Seleccioná una cuenta para registrar un pago.
            </div>
          ) : (
            <>
              <header>
                <div>
                  <span>PAGO A PROVEEDOR</span>
                  <h3>{selected.creditor_name}</h3>
                  <p>{selected.concept}</p>
                </div>

                <div>
                  <small>PENDIENTE</small>
                  <strong>{money(selected.pending_gtq)}</strong>
                </div>
              </header>

              <form onSubmit={registerPayment}>
                <label>
                  <span>Monto (Q)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount_gtq}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, amount_gtq: e.target.value }))
                    }
                  />
                </label>

                <label>
                  <span>Fecha de pago</span>
                  <input
                    type="date"
                    value={form.payment_date}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, payment_date: e.target.value }))
                    }
                  />
                </label>

                <label>
                  <span>Forma de pago</span>
                  <select
                    value={form.payment_method}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        payment_method: e.target.value,
                      }))
                    }
                  >
                    <option>Transferencia</option>
                    <option>Efectivo</option>
                    <option>Cheque</option>
                    <option>Depósito</option>
                    <option>Otro</option>
                  </select>
                </label>

                <label className="span-2">
                  <span>Nota</span>
                  <input
                    value={form.note}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, note: e.target.value }))
                    }
                    placeholder="Ej. Pago parcial de correlativos"
                  />
                </label>

                <button
                  type="submit"
                  className="span-2"
                  disabled={saving || Number(selected.pending_gtq || 0) <= 0}
                >
                  {saving ? "Registrando..." : "Registrar pago al Agente"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {payments.length > 0 && (
        <div className="accounts-payable-history">
          <div className="accounts-payable-history-head">
            <span>ÚLTIMOS PAGOS</span>
          </div>

          {payments.slice(0, 8).map((payment) => (
            <div key={payment.id}>
              <span>{payment.payment_date}</span>
              <span>{payment.payment_method || "—"}</span>
              <span>{payment.note || "Sin nota"}</span>
              <strong>{money(payment.amount_gtq)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
