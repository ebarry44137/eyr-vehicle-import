import { useEffect, useMemo, useState } from "react";
import "./accounts-receivable.css";
import "./accounts-receivable-v36.css";

function money(value) {
  return `Q ${Number(value || 0).toLocaleString("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function firstDayOfMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastDayOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function AccountsReceivablePanel({
  supabase,
  onChanged,
  officeName = "E&R Solutions",
  isWhiteLabelClient = false,
}) {
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState({
    from: firstDayOfMonth(),
    to: lastDayOfMonth(),
  });
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
        "list_customer_accounts_admin_v36",
        { p_search: search.trim() || null }
      );
      if (rpcError) throw rpcError;
      setAccounts(data || []);
      if (selected) {
        const refreshed = (data || []).find((x) => x.client_id === selected.client_id);
        setSelected(refreshed || null);
      }
    } catch (err) {
      console.error("CUSTOMER ACCOUNTS V36 ERROR:", err);
      setError(err?.message || "No fue posible cargar las cuentas por cobrar.");
    } finally {
      setLoading(false);
    }
  }

  async function openAccount(item = selected, nextPeriod = period) {
    if (!item) return;
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "customer_account_statement_admin_v36",
        {
          p_client_id: item.client_id,
          p_from: nextPeriod.from,
          p_to: nextPeriod.to,
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

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => accounts.reduce((acc, item) => {
    acc.billed += Number(item.billed_gtq || 0);
    acc.paid += Number(item.paid_gtq || 0);
    acc.pending += Number(item.pending_gtq || 0);
    return acc;
  }, { billed: 0, paid: 0, pending: 0 }), [accounts]);

  async function applyPeriod() {
    if (!selected) return;
    await openAccount(selected, period);
  }

  async function registerPayment(event) {
    event.preventDefault();
    if (!selected) return;
    const amount = Number(payment.amount_gtq || 0);
    if (amount <= 0) return setError("Ingresá un monto válido.");
    if (amount > Number(selected.pending_gtq || 0)) {
      return setError("El abono no puede superar el saldo pendiente del cliente.");
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "register_customer_payment_admin_v36",
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
      setMessage(`Abono registrado. ${money(result?.applied_gtq || amount)} aplicado a los trabajos más antiguos.`);
      setPayment({
        amount_gtq: "",
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: "Transferencia",
        reference: "",
        note: "",
      });
      await load();
      await openAccount({ ...selected, pending_gtq: Number(selected.pending_gtq || 0) - amount }, period);
      onChanged?.();
    } catch (err) {
      setError(err?.message || "No fue posible registrar el abono.");
    } finally {
      setSaving(false);
    }
  }

  function printStatement() {
    if (!selected || !detail) return;
    const works = detail?.works || [];
    const totals = detail?.period_totals || {};
    const rows = works.map((work) => `
      <tr>
        <td>${escapeHtml(work.work_date)}</td>
        <td>${escapeHtml(work.code)}</td>
        <td>${escapeHtml(work.correlative_number || "—")}</td>
        <td>${escapeHtml(work.importer_name || work.label)}</td>
        <td>${escapeHtml(work.label)}</td>
        <td class="num">${escapeHtml(money(work.billed_gtq))}</td>
        <td class="num">${escapeHtml(money(work.paid_gtq))}</td>
        <td class="num strong">${escapeHtml(money(work.pending_gtq))}</td>
      </tr>`).join("");

    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return setError("El navegador bloqueó la ventana de impresión.");

    const statementBrand =
  isWhiteLabelClient
    ? officeName || "Oficina Aduanal"
    : "E&R Solutions";

    win.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>Estado de Cuenta - ${escapeHtml(selected.client_name)}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#0b335b;margin:34px} .head{display:flex;justify-content:space-between;border-bottom:3px solid #0b335b;padding-bottom:18px;margin-bottom:22px}.brand{font-size:24px;font-weight:900}.brand span{display:block;font-size:11px;letter-spacing:2px;color:#a46c12;margin-top:5px}.right{text-align:right}.right h1{margin:0;font-size:24px}.right p{margin:5px 0;color:#66798c;font-size:12px}.client{padding:15px;background:#f5f8fb;border-radius:10px;margin-bottom:18px}.client strong{font-size:17px}.client span{display:block;color:#6f8296;font-size:11px;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#0b335b;color:#fff;padding:8px;text-align:left}td{padding:8px;border-bottom:1px solid #dfe6ed}.num{text-align:right;white-space:nowrap}.strong{font-weight:800}.totals{margin-left:auto;margin-top:18px;width:330px}.totals div{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #dfe6ed}.totals .grand{font-size:16px;font-weight:900;color:#a46c12}.note{margin-top:28px;color:#718397;font-size:10px;border-top:1px solid #dfe6ed;padding-top:12px}@media print{button{display:none}body{margin:18px}}
      </style></head><body>
      <div class="head"><div class="brand">
  ${escapeHtml(statementBrand)}
  <span>AGENCIA ADUANAL</span>
</div><div class="right"><h1>ESTADO DE CUENTA</h1><p>${escapeHtml(period.from)} al ${escapeHtml(period.to)}</p></div></div>
      <div class="client"><strong>${escapeHtml(selected.client_name)}</strong><span>${escapeHtml(selected.nit ? `NIT ${selected.nit}` : selected.email || selected.phone || "Cliente E&R")}</span></div>
      <table><thead><tr><th>Fecha</th><th>Documento</th><th>Correlativo DUCA</th><th>Cliente DUCA</th><th>Servicio</th><th>Cobro</th><th>Pagado</th><th>Saldo</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No hay movimientos en este período.</td></tr>'}</tbody></table>
      <div class="totals"><div><span>Total trabajado</span><strong>${escapeHtml(money(totals.billed_gtq))}</strong></div><div><span>Pagado</span><strong>${escapeHtml(money(totals.paid_gtq))}</strong></div><div class="grand"><span>Saldo del período</span><strong>${escapeHtml(money(totals.pending_gtq))}</strong></div></div>
      <div class="note">
  Documento generado por ${escapeHtml(statementBrand)}.
  Para guardar como PDF seleccioná “Guardar como PDF”
  en la ventana de impresión.
</div>
      <script>window.onload=()=>{window.print();}</script></body></html>`);
    win.document.close();
  }

  return (
    <section className="receivable-panel">
      <div className="receivable-head">
        <div><span>CUENTAS POR COBRAR</span><h2>Clientes de facturación</h2><p>
  Gestiones y declaraciones agrupadas por quien realmente paga a{" "}
  {isWhiteLabelClient ? officeName : "E&R"}.
</p></div>
        <div className="receivable-total"><small>TOTAL PENDIENTE</small><strong>{money(totals.pending)}</strong></div>
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
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente que paga..." onKeyDown={(e) => e.key === "Enter" && load()} />
        <button type="button" onClick={load}>Buscar</button>
      </div>

      <div className="receivable-layout">
        <div className="receivable-list">
          {loading && <div className="receivable-empty">Cargando...</div>}
          {!loading && accounts.length === 0 && <div className="receivable-empty">No hay cuentas de clientes.</div>}
          {accounts.map((item) => (
            <button type="button" key={item.client_id} className={`receivable-client ${selected?.client_id === item.client_id ? "active" : ""}`} onClick={() => openAccount(item)}>
              <div><strong>{item.client_name}</strong><span>{item.work_count} trabajos · {item.phone || "Sin teléfono"}</span></div>
              <div><small>PENDIENTE</small><strong>{money(item.pending_gtq)}</strong></div>
            </button>
          ))}
        </div>

        <div className="receivable-detail">
          {!selected ? <div className="receivable-empty">Seleccioná un cliente para ver su estado de cuenta.</div> : detailLoading ? <div className="receivable-empty">Cargando estado de cuenta...</div> : <>
            <header className="receivable-detail-head">
              <div><span>ESTADO DE CUENTA</span><h3>{selected.client_name}</h3><p>{selected.email ||
selected.phone ||
`Cliente ${isWhiteLabelClient ? officeName : "E&R"}`}</p></div>
              <div><small>SALDO TOTAL</small><strong>{money(selected.pending_gtq)}</strong></div>
            </header>

            <div className="statement-period-toolbar">
              <label><span>Desde</span><input type="date" value={period.from} onChange={(e) => setPeriod(p => ({...p, from:e.target.value}))}/></label>
              <label><span>Hasta</span><input type="date" value={period.to} onChange={(e) => setPeriod(p => ({...p, to:e.target.value}))}/></label>
              <button type="button" onClick={applyPeriod}>Aplicar período</button>
              <button type="button" className="print" onClick={printStatement}>🧾 Imprimir / Guardar PDF</button>
            </div>

            <div className="statement-period-kpis">
              <div><span>Trabajado período</span><strong>{money(detail?.period_totals?.billed_gtq)}</strong></div>
              <div><span>Pagado</span><strong>{money(detail?.period_totals?.paid_gtq)}</strong></div>
              <div className="pending"><span>Saldo período</span><strong>{money(detail?.period_totals?.pending_gtq)}</strong></div>
            </div>

            <div className="receivable-work-list v36">
              {(detail?.works || []).map((work) => (
                <div key={`${work.type}-${work.id}`}>
                  <div><strong>{work.code}</strong><span>{work.importer_name || work.label}</span><small>{work.work_date} · {work.correlative_number || "Sin correlativo"}</small></div>
                  <div><span>{work.label}</span><small>Cobro {money(work.billed_gtq)}</small></div>
                  <strong className={Number(work.pending_gtq) > 0 ? "pending" : "paid"}>{Number(work.pending_gtq) > 0 ? money(work.pending_gtq) : "PAGADO"}</strong>
                </div>
              ))}
              {(detail?.works || []).length === 0 && <div className="receivable-empty">No hay trabajos en el período seleccionado.</div>}
            </div>

            <form className="receivable-payment-form" onSubmit={registerPayment}>
              <div className="receivable-payment-title"><span>REGISTRAR ABONO GENERAL</span><small>Se aplica automáticamente a los trabajos más antiguos de esta cuenta.</small></div>
              <label><span>Monto (Q)</span><input type="number" min="0" step="0.01" value={payment.amount_gtq} onChange={(e) => setPayment(p => ({...p, amount_gtq:e.target.value}))}/></label>
              <label><span>Fecha</span><input type="date" value={payment.payment_date} onChange={(e) => setPayment(p => ({...p, payment_date:e.target.value}))}/></label>
              <label><span>Forma</span><select value={payment.payment_method} onChange={(e) => setPayment(p => ({...p, payment_method:e.target.value}))}><option>Transferencia</option><option>Efectivo</option><option>Depósito</option><option>Cheque</option><option>Otro</option></select></label>
              <label><span>Referencia</span><input value={payment.reference} onChange={(e) => setPayment(p => ({...p, reference:e.target.value}))} placeholder="Boleta / transferencia"/></label>
              <label className="span-2"><span>Nota</span><input value={payment.note} onChange={(e) => setPayment(p => ({...p, note:e.target.value}))}/></label>
              <button type="submit" className="span-2" disabled={saving || Number(selected.pending_gtq || 0) <= 0}>{saving ? "Aplicando..." : "Registrar abono y aplicar FIFO"}</button>
            </form>
          </>}
        </div>
      </div>
    </section>
  );
}
