import { useEffect, useMemo, useState } from "react";
import "./declarations.css";

function money(value) {
  return `Q ${Number(value || 0).toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function parseRange(firstValue, lastValue) {
  const first = String(firstValue || "").trim();
  const last = String(lastValue || "").trim();

  const firstMatch = first.match(/^(.*?)(\d+)$/);
  const lastMatch = last.match(/^(.*?)(\d+)$/);

  if (!firstMatch || !lastMatch) {
    return { valid: false, quantity: 0 };
  }

  const [, firstPrefix, firstDigits] = firstMatch;
  const [, lastPrefix, lastDigits] = lastMatch;

  if (firstPrefix !== lastPrefix) {
    return { valid: false, quantity: 0 };
  }

  const firstNumber = BigInt(firstDigits);
  const lastNumber = BigInt(lastDigits);

  if (firstNumber <= 0n || lastNumber < firstNumber) {
    return { valid: false, quantity: 0 };
  }

  return {
    valid: true,
    prefix: firstPrefix,
    firstNumber,
    lastNumber,
    width: Math.max(firstDigits.length, lastDigits.length),
    quantity: Number(lastNumber - firstNumber + 1n),
  };
}

export default function DucaCorrelativesPage({ supabase }) {
  const [batches, setBatches] = useState([]);
  const [payables, setPayables] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const blankForm = {
    purchase_date: new Date().toISOString().slice(0, 10),
    customs_agent: "",
    purchased_quantity: 50,
    available_first_number: "",
    available_last_number: "",
    unit_cost_gtq: 80,
    payment_condition: "CREDITO",
    initial_payment_gtq: 0,
    note: "",
  };

  const [form, setForm] = useState(blankForm);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const { data: batchRows, error: batchError } = await supabase
        .from("duca_correlative_batches")
        .select("*")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (batchError) throw batchError;

      const { data: payableRows, error: payableError } = await supabase
        .from("finance_accounts_payable_overview")
        .select("*")
        .eq("source_type", "DUCA_BATCH");

      if (payableError) throw payableError;

      const { data: numberRows, error: numberError } = await supabase
        .from("duca_correlative_inventory")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);

      if (numberError) throw numberError;

      const { data: summaryRows, error: summaryError } = await supabase.rpc(
        "get_duca_stock_summary"
      );

      if (summaryError) throw summaryError;

      setBatches(batchRows || []);
      setPayables(payableRows || []);
      setNumbers(numberRows || []);
      setSummary(Array.isArray(summaryRows) ? summaryRows[0] : summaryRows);
    } catch (err) {
      console.error("CORRELATIVES LOAD ERROR:", err);
      setError(err?.message || "No fue posible cargar los correlativos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const range = useMemo(
    () =>
      parseRange(
        form.available_first_number,
        form.available_last_number
      ),
    [form.available_first_number, form.available_last_number]
  );

  const loadedQuantity = range.valid ? range.quantity : 0;
  const purchasedQuantity = Number(form.purchased_quantity || 0);
  const historicalUsed = Math.max(0, purchasedQuantity - loadedQuantity);
  const totalPurchase = purchasedQuantity * Number(form.unit_cost_gtq || 0);
  const initialPayment =
    form.payment_condition === "CONTADO"
      ? totalPurchase
      : Number(form.initial_payment_gtq || 0);
  const pendingAtStart = Math.max(0, totalPurchase - initialPayment);


  async function registerBatch(event) {
    event.preventDefault();

    if (!form.customs_agent.trim()) {
      setError("Ingresá el Agente de Aduanas.");
      return;
    }

    if (!range.valid || loadedQuantity <= 0) {
      setError("El rango disponible de correlativos no es válido.");
      return;
    }

    if (purchasedQuantity < loadedQuantity || purchasedQuantity <= 0) {
      setError(
        "La cantidad comprada no puede ser menor que los correlativos disponibles que vas a cargar."
      );
      return;
    }

    if (purchasedQuantity > 500 || loadedQuantity > 500) {
      setError("El lote no puede superar 500 correlativos.");
      return;
    }

    if (Number(form.unit_cost_gtq || 0) <= 0) {
      setError("Ingresá el costo unitario del correlativo.");
      return;
    }

    if (initialPayment > totalPurchase) {
      setError("El pago inicial no puede superar el valor total de la compra.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "register_duca_correlative_batch_v2",
        {
          p_purchase_date: form.purchase_date,
          p_customs_agent: form.customs_agent.trim(),
          p_purchased_quantity: purchasedQuantity,
          p_available_first_number: form.available_first_number.trim(),
          p_available_last_number: form.available_last_number.trim(),
          p_unit_cost_gtq: Number(form.unit_cost_gtq),
          p_payment_condition: form.payment_condition,
          p_initial_payment_gtq: initialPayment,
          p_note: form.note.trim() || null,
        }
      );

      if (rpcError) throw rpcError;

      const row = Array.isArray(data) ? data[0] : data;

      setMessage(
        `${row?.batch_code || "Lote"} registrado: ${
          row?.inventory_quantity ?? loadedQuantity
        } disponibles, ${
          row?.historical_used_quantity ?? historicalUsed
        } utilizados antes del sistema y ${money(
          row?.payable_pending_gtq ?? pendingAtStart
        )} por pagar.`
      );

      setForm(blankForm);
      await load();
    } catch (err) {
      console.error("REGISTER CORRELATIVE BATCH V2 ERROR:", err);
      setError(err?.message || "No fue posible registrar la compra.");
    } finally {
      setSaving(false);
    }
  }

  function payableFor(batchId) {
    return payables.find((item) => item.source_id === batchId);
  }

  return (
    <section className="correlatives-module">
      <header className="declarations-header">
        <div>
          <span className="section-label">INVENTARIO DUCA</span>
          <h1>Correlativos</h1>
          <p>
            Inventario DUCA de esta oficina para Gestiones Aduanales y Declaraciones,
            con control de compras a crédito.
          </p>
        </div>

      </header>

      <section className="correlative-kpis">
        <article>
          <span>Disponibles</span>
          <strong>{summary?.available ?? 0}</strong>
        </article>
        <article>
          <span>Reservados</span>
          <strong>{summary?.reserved ?? 0}</strong>
        </article>
        <article>
          <span>Utilizados</span>
          <strong>{summary?.used ?? 0}</strong>
        </article>
        <article>
          <span>Anulados</span>
          <strong>{summary?.voided ?? 0}</strong>
        </article>
      </section>

      {Number(summary?.available || 0) <= 10 && (
        <div
          className={`correlative-stock-alert ${
            Number(summary?.available || 0) <= 5 ? "critical" : ""
          }`}
        >
          <strong>
            {Number(summary?.available || 0) <= 5
              ? "🚨 STOCK CRÍTICO"
              : "⚠️ STOCK BAJO"}
          </strong>
          <span>
            Quedan {summary?.available || 0} correlativos disponibles.
          </span>
        </div>
      )}

      {message && <div className="customer-message success">{message}</div>}
      {error && <div className="customer-message error">{error}</div>}

      <div className="correlatives-grid v32-2">
        <section className="correlative-register-card">
          <div className="declarations-list-head">
            <div>
              <span className="section-label">NUEVA COMPRA / CARGA INICIAL</span>
              <h2>Registrar lote</h2>
            </div>
          </div>

          <form onSubmit={registerBatch}>
            <label>
              <span>Fecha de compra</span>
              <input
                type="date"
                value={form.purchase_date}
                onChange={(e) =>
                  setForm((p) => ({ ...p, purchase_date: e.target.value }))
                }
              />
            </label>

            <label>
              <span>Agente de Aduanas</span>
              <input
                value={form.customs_agent}
                onChange={(e) =>
                  setForm((p) => ({ ...p, customs_agent: e.target.value }))
                }
                placeholder="Nombre del agente"
              />
            </label>

            <label>
              <span>Cantidad comprada</span>
              <input
                type="number"
                min="1"
                max="500"
                value={form.purchased_quantity}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    purchased_quantity: e.target.value,
                  }))
                }
              />
              <small>
                La deuda se calcula sobre esta cantidad, aunque ya se hayan usado
                algunos antes del sistema.
              </small>
            </label>

            <label>
              <span>Costo unitario (Q)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.unit_cost_gtq}
                onChange={(e) =>
                  setForm((p) => ({ ...p, unit_cost_gtq: e.target.value }))
                }
              />
            </label>

            <label>
              <span>Primer correlativo disponible</span>
              <input
                value={form.available_first_number}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    available_first_number: e.target.value
                      .toUpperCase()
                      .replace(/\s/g, ""),
                  }))
                }
                placeholder="389-20261789"
              />
            </label>

            <label>
              <span>Último correlativo disponible</span>
              <input
                value={form.available_last_number}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    available_last_number: e.target.value
                      .toUpperCase()
                      .replace(/\s/g, ""),
                  }))
                }
                placeholder="389-20261824"
              />
            </label>

            <label>
              <span>Condición de compra</span>
              <select
                value={form.payment_condition}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    payment_condition: e.target.value,
                    initial_payment_gtq:
                      e.target.value === "CONTADO"
                        ? totalPurchase
                        : p.initial_payment_gtq,
                  }))
                }
              >
                <option value="CREDITO">Crédito</option>
                <option value="CONTADO">Contado</option>
              </select>
            </label>

            <label>
              <span>Pago realizado al registrar (Q)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  form.payment_condition === "CONTADO"
                    ? totalPurchase
                    : form.initial_payment_gtq
                }
                disabled={form.payment_condition === "CONTADO"}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    initial_payment_gtq: e.target.value,
                  }))
                }
              />
            </label>

            <div className="batch-financial-summary span-2">
              <div>
                <span>Compra original</span>
                <strong>{purchasedQuantity || 0}</strong>
              </div>
              <div>
                <span>Disponibles cargados</span>
                <strong>{loadedQuantity}</strong>
              </div>
              <div>
                <span>Usados antes del sistema</span>
                <strong>{historicalUsed}</strong>
              </div>
              <div>
                <span>Valor total</span>
                <strong>{money(totalPurchase)}</strong>
              </div>
              <div className="pending">
                <span>Cuenta por pagar</span>
                <strong>{money(pendingAtStart)}</strong>
              </div>
            </div>

            <label className="span-2">
              <span>Nota</span>
              <textarea
                rows="3"
                value={form.note}
                onChange={(e) =>
                  setForm((p) => ({ ...p, note: e.target.value }))
                }
              />
            </label>

            <button type="submit" disabled={saving}>
              {saving
                ? "Registrando..."
                : "Registrar compra + inventario + cuenta por pagar"}
            </button>
          </form>
        </section>

        <section className="correlative-batches-card">
          <div className="declarations-list-head">
            <div>
              <span className="section-label">HISTORIAL</span>
              <h2>Lotes comprados</h2>
            </div>
          </div>

          <div className="correlative-batch-list">
            {batches.map((item) => {
              const payable = payableFor(item.id);

              return (
                <article key={item.id} className="batch-v32-2">
                  <div>
                    <strong>{item.batch_code}</strong>
                    <span>{item.customs_agent}</span>
                    <small>{item.purchase_date}</small>
                  </div>

                  <div>
                    <span>
                      {item.first_number} → {item.last_number}
                    </span>
                    <strong>
                      {item.purchased_quantity || item.quantity} comprados ·{" "}
                      {item.inventory_quantity || item.quantity} cargados
                    </strong>
                    <small>
                      {item.historical_used_quantity || 0} usados antes ·{" "}
                      {money(item.unit_cost_gtq)} c/u
                    </small>
                  </div>

                  <div className="batch-payable-status">
                    <span>{item.payment_condition || "—"}</span>
                    <strong>
                      {money(payable?.pending_gtq || 0)} pendiente
                    </strong>
                    <small>
                      de {money(payable?.original_amount_gtq || item.total_cost_gtq)}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <section className="declarations-list-card">
        <div className="declarations-list-head">
          <div>
            <span className="section-label">TRAZABILIDAD</span>
            <h2>Últimos correlativos</h2>
          </div>
        </div>

        <div className="declarations-table-wrap">
          <table className="declarations-table">
            <thead>
              <tr>
                <th>Correlativo</th>
                <th>Lote</th>
                <th>Estado</th>
                <th>Asignado a</th>
                <th>Expediente / Declaración</th>
                <th>Costo</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.correlative_number}</strong>
                  </td>
                  <td>{item.batch_code}</td>
                  <td>
                    <span
                      className={`correlative-status ${item.status.toLowerCase()}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td>{item.target_type || "—"}</td>
                  <td>{item.target_code || "—"}</td>
                  <td>{money(item.unit_cost_gtq)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
