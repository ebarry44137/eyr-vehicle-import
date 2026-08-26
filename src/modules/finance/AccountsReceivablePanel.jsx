import { useEffect, useMemo, useState } from "react";
import "./accounts-receivable.css";

function money(value) {
  return `Q ${Number(value || 0).toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AccountsReceivablePanel({ supabase, onChanged }) {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [payment, setPayment] = useState({
    amount_gtq: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "Transferencia",
    reference: "",
    note: "",
  });

  async function load() {
    setLoading(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "list_customer_accounts_admin",
        {
          p_search: search.trim() || null,
        }
      );

      if (rpcError) throw rpcError;
      setAccounts(data || []);

      if (selected) {
        const refreshed = (data || []).find((x) => x.client_id === selected.client_id);
        setSelected(refreshed || null);
      }
    } catch (err) {
      console.error("CUSTOMER ACCOUNTS ERROR:", err);
      setError(err?.message || "No fue posible cargar las cuentas por cobrar.");
    } finally {
      setLoading(false);
    }
  }

  async function openAccount(item) {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "customer_account_detail_admin",
        {
          p_client_id: item.client_id,
        }
      );

      if (rpcError) throw rpcError;

      setDetail(data || null);
    } catch (err) {
      setError(err?.message || "No fue posible cargar el estado de cuenta.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(
    () =>
      accounts.reduce(
        (acc, item) => {
          acc.billed += Number(item.billed_gtq || 0);
          acc.paid += Number(item.paid_gtq || 0);
          acc.pending += Number(item.pending_gtq || 0);
          return acc;
        },
        { billed: 0, paid: 0, pending: 0 }
      ),
    [accounts]
  );

  async function registerPayment(event) {
    event.preventDefault();
    if (!selected) return;

    const amount = Number(payment.amount_gtq || 0);

    if (amount <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }

    if (amount > Number(selected.pending_gtq || 0)) {
      setError("El abono no puede superar el saldo pendiente del cliente.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "register_customer_payment_admin",
        {
          p_client_id: selected.client_id,
          p_amount_gtq: amount,
          p_payment_date: payment.payment_date,
          p_payment_method: payment.payment_method,
          p_reference: payment.reference.trim() || null,
          p_note: payment.note.trim() || null,
        }
      );

      if (rpcError) throw rpcError;

      const result = Array.isArray(data) ? data[0] : data;

      setMessage(
        `Abono registrado. ${money(result?.applied_gtq || amount)} aplicado a los trabajos más antiguos.`
      );

      setPayment({
        amount_gtq: "",
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: "Transferencia",
        reference: "",
        note: "",
      });

      await load();
      await openAccount({
        ...selected,
        pending_gtq: Number(selected.pending_gtq || 0) - amount,
      });
      onChanged?.();
    } catch (err) {
      console.error("CUSTOMER PAYMENT ERROR:", err);
      setError(err?.message || "No fue posible registrar el abono.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="receivable-panel">
      <div className="receivable-head">
        <div>
          <span>CUENTAS POR COBRAR</span>
          <h2>Clientes</h2>
          <p>Estados de cuenta, abonos generales y saldos pendientes.</p>
        </div>

        <div className="receivable-total">
          <small>TOTAL PENDIENTE</small>
          <strong>{money(totals.pending)}</strong>
        </div>
      </div>

      <div className="receivable-kpis">
        <article><span>Facturado</span><strong>{money(totals.billed)}</strong></article>
        <article><span>Recibido</span><strong>{money(totals.paid)}</strong></article>
        <article className="pending"><span>Por cobrar</span><strong>{money(totals.pending)}</strong></article>
        <article><span>Clientes con saldo</span><strong>{accounts.filter(x => Number(x.pending_gtq || 0) > 0).length}</strong></article>
      </div>

      {message && <div className="finance-message success">{message}</div>}
      {error && <div className="finance-message error">{error}</div>}

      <div className="receivable-toolbar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button type="button" onClick={load}>Buscar</button>
      </div>

      <div className="receivable-layout">
        <div className="receivable-list">
          {loading && <div className="receivable-empty">Cargando...</div>}

          {!loading && accounts.length === 0 && (
            <div className="receivable-empty">No hay cuentas de clientes.</div>
          )}

          {accounts.map((item) => (
            <button
              type="button"
              key={item.client_id}
              className={`receivable-client ${selected?.client_id === item.client_id ? "active" : ""}`}
              onClick={() => openAccount(item)}
            >
              <div>
                <strong>{item.client_name}</strong>
                <span>{item.work_count} trabajos · {item.phone || "Sin teléfono"}</span>
              </div>
              <div>
                <small>PENDIENTE</small>
                <strong>{money(item.pending_gtq)}</strong>
              </div>
            </button>
          ))}
        </div>

        <div className="receivable-detail">
          {!selected ? (
            <div className="receivable-empty">
              Seleccioná un cliente para ver su estado de cuenta.
            </div>
          ) : detailLoading ? (
            <div className="receivable-empty">Cargando estado de cuenta...</div>
          ) : (
            <>
              <header className="receivable-detail-head">
                <div>
                  <span>ESTADO DE CUENTA</span>
                  <h3>{selected.client_name}</h3>
                  <p>{selected.email || selected.phone || "Cliente E&R"}</p>
                </div>
                <div>
                  <small>SALDO</small>
                  <strong>{money(selected.pending_gtq)}</strong>
                </div>
              </header>

              <div className="receivable-work-list">
                {(detail?.works || []).map((work) => (
                  <div key={`${work.type}-${work.id}`}>
                    <div>
                      <strong>{work.code}</strong>
                      <span>{work.label}</span>
                      <small>{work.work_date}</small>
                    </div>
                    <div>
                      <span>{money(work.billed_gtq)}</span>
                      <small>Pagado {money(work.paid_gtq)}</small>
                    </div>
                    <strong className={Number(work.pending_gtq) > 0 ? "pending" : "paid"}>
                      {Number(work.pending_gtq) > 0 ? money(work.pending_gtq) : "PAGADO"}
                    </strong>
                  </div>
                ))}
              </div>

              <form className="receivable-payment-form" onSubmit={registerPayment}>
                <div className="receivable-payment-title">
                  <span>REGISTRAR ABONO GENERAL</span>
                  <small>Se aplica automáticamente a los trabajos más antiguos.</small>
                </div>

                <label>
                  <span>Monto (Q)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payment.amount_gtq}
                    onChange={(e) => setPayment((p) => ({ ...p, amount_gtq: e.target.value }))}
                  />
                </label>

                <label>
                  <span>Fecha</span>
                  <input
                    type="date"
                    value={payment.payment_date}
                    onChange={(e) => setPayment((p) => ({ ...p, payment_date: e.target.value }))}
                  />
                </label>

                <label>
                  <span>Forma</span>
                  <select
                    value={payment.payment_method}
                    onChange={(e) => setPayment((p) => ({ ...p, payment_method: e.target.value }))}
                  >
                    <option>Transferencia</option>
                    <option>Efectivo</option>
                    <option>Depósito</option>
                    <option>Cheque</option>
                    <option>Otro</option>
                  </select>
                </label>

                <label>
                  <span>Referencia</span>
                  <input
                    value={payment.reference}
                    onChange={(e) => setPayment((p) => ({ ...p, reference: e.target.value }))}
                    placeholder="Boleta / transferencia"
                  />
                </label>

                <label className="span-2">
                  <span>Nota</span>
                  <input
                    value={payment.note}
                    onChange={(e) => setPayment((p) => ({ ...p, note: e.target.value }))}
                  />
                </label>

                <button
                  type="submit"
                  className="span-2"
                  disabled={saving || Number(selected.pending_gtq || 0) <= 0}
                >
                  {saving ? "Aplicando..." : "Registrar abono y aplicar FIFO"}
                </button>
              </form>

              {(detail?.payments || []).length > 0 && (
                <div className="receivable-payment-history">
                  <span>ÚLTIMOS ABONOS GENERALES</span>
                  {detail.payments.map((item) => (
                    <div key={item.id}>
                      <span>{item.payment_date}</span>
                      <span>{item.payment_method || "—"}</span>
                      <span>{item.reference || item.note || "Sin referencia"}</span>
                      <strong>{money(item.amount_gtq)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
