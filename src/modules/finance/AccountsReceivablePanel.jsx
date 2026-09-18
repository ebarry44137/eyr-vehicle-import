import { useEffect, useMemo, useState } from "react";
import html2pdf from "html2pdf.js";
import "./accounts-receivable.css";
import "./accounts-receivable-v36.css";
import HistoricalPortfolioImport from "./HistoricalPortfolioImport";

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
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailForm, setEmailForm] = useState({
    to: "",
    subject: "",
    senderName: "",
    senderEmail: "",
    fileName: "",
  });
  const [emailTestSending, setEmailTestSending] = useState(false);
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
      const { data: histData, error: histError } = await supabase.rpc("list_historical_customer_accounts_v397995", { p_search: search.trim() || null });
      if (histError) throw histError;
      const merged = new Map();
      [...(data || []), ...(histData || [])].forEach(x => { const prev=merged.get(x.client_id)||{}; merged.set(x.client_id,{...prev,...x,work_count:Number(prev.work_count||0)+Number(x.work_count||0),billed_gtq:Number(prev.billed_gtq||0)+Number(x.billed_gtq||0),paid_gtq:Number(prev.paid_gtq||0)+Number(x.paid_gtq||0),pending_gtq:Number(prev.pending_gtq||0)+Number(x.pending_gtq||0)}); });
      const all=[...merged.values()]; setAccounts(all);
      if (selected) {
        const refreshed = all.find((x) => x.client_id === selected.client_id);
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
      const { data: histRows, error: histError } = await supabase.rpc("historical_customer_statement_v397995", {p_client_id:item.client_id,p_from:nextPeriod.from,p_to:nextPeriod.to});
      if(histError) throw histError;
      const base=data||{}; const works=[...(base.works||[]),...(histRows||[])].sort((a,b)=>String(a.work_date).localeCompare(String(b.work_date)));
      const period_totals=works.reduce((a,w)=>({billed_gtq:a.billed_gtq+Number(w.billed_gtq||0),paid_gtq:a.paid_gtq+Number(w.paid_gtq||0),pending_gtq:a.pending_gtq+Number(w.pending_gtq||0)}),{billed_gtq:0,paid_gtq:0,pending_gtq:0});
      setDetail({...base,works,period_totals});
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
      const { data: histPay, error: histPayError } = await supabase.rpc("apply_historical_payment_v397995", {p_client_id:selected.client_id,p_amount_gtq:amount});
      if(histPayError) throw histPayError;
      const hp=Array.isArray(histPay)?histPay[0]:histPay; const remaining=Number(hp?.remaining_gtq||0); let result={applied_gtq:Number(hp?.applied_gtq||0)};
      if(remaining>0){ const {data,error:rpcError}=await supabase.rpc("register_customer_payment_admin_v36",{p_client_id:selected.client_id,p_amount_gtq:remaining,p_payment_date:payment.payment_date,p_payment_method:payment.payment_method,p_reference:payment.reference.trim()||null,p_note:payment.note.trim()||null}); if(rpcError)throw rpcError; const legacy=Array.isArray(data)?data[0]:data; result.applied_gtq+=Number(legacy?.applied_gtq||remaining); }
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

  async function voidHistoricalReceivable(work) {
    if (!work || work.type !== "HISTORICAL" || !work.id) return;

    const amount = Number(work.billed_gtq || 0);
    const correlative = work.correlative_number || work.code || "Sin correlativo";
    const consignee = work.importer_name || "Sin consignatario";

    const confirmed = window.confirm(
      "ANULAR CARGO HISTÓRICO\\n\\n" +
      "Correlativo: " + correlative + "\\n" +
      "Consignatario: " + consignee + "\\n" +
      "Monto: " + money(amount) + "\\n\\n" +
      "Este cargo dejará de formar parte de la cuenta por cobrar.\\n" +
      "El registro NO será eliminado de la base de datos.\\n\\n" +
      "¿Deseás continuar?"
    );

    if (!confirmed) return;

    const reason = window.prompt(
      "Motivo de la anulación:",
      "Cobro pagado antes de la migración de cartera histórica"
    );

    if (reason === null) return;

    if (!reason.trim()) {
      setError("Debés indicar el motivo de la anulación.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "void_historical_receivable_v3979911",
        {
          p_id: work.id,
          p_reason: reason.trim(),
        }
      );

      if (rpcError) throw rpcError;

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.success) {
        throw new Error("Supabase no confirmó la anulación del cargo.");
      }

      setMessage(
        "Cargo histórico " +
        correlative +
        " anulado correctamente por " +
        money(result.amount_gtq || amount) +
        "."
      );

      const currentClientId = selected?.client_id;

      await load();

      if (currentClientId) {
        await openAccount(
          {
            ...selected,
            client_id: currentClientId,
            pending_gtq:
              Number(selected?.pending_gtq || 0) -
              Number(result.amount_gtq || amount),
          },
          period
        );
      }

      onChanged?.();

    } catch (err) {
      console.error("VOID HISTORICAL RECEIVABLE ERROR:", err);
      setError(
        err?.message ||
        "No fue posible anular el cargo histórico."
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendStatementEmailTest() {
    if (!selected || !detail) return;

    setEmailTestSending(true);
    setError("");
    setMessage("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const accessToken = sessionData?.session?.access_token;
      const userId = sessionData?.session?.user?.id;

      if (!accessToken || !userId) {
        throw new Error("No hay una sesión activa de E&R.");
      }

      const senderByUser = {
        "3e8d533d-878e-4f04-8f01-80b640d9d7d9": {
          name: "Edgar Barrientos",
          email: "ebarrientos@eyrsolutionsgt.com",
        },
        "8fd10b89-47d0-45e4-ba91-7465c3f027e1": {
          name: "Ronaldo Barrientos",
          email: "rbarrientos@eyrsolutionsgt.com",
        },
      };

      const sender = senderByUser[userId];

      if (!sender) {
        throw new Error(
          "Este usuario no está autorizado para enviar estados de cuenta."
        );
      }

      const suggestedRecipient =
        selected.email || sender.email;

      const recipient = window.prompt(
        "PRUEBA DE CORREO E&R\n\n" +
        "De: " + sender.name + " <" + sender.email + ">\n" +
        "Cliente: " + selected.client_name + "\n\n" +
        "¿A qué correo enviamos la prueba?",
        suggestedRecipient
      );

      if (recipient === null) return;

      const to = recipient.trim();

      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        throw new Error("Ingresá un correo destinatario válido.");
      }

      const response = await fetch(
        "https://jbrgbqlyohlnwdnwhort.supabase.co/functions/v1/send-account-statement",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "test",
            to,
            clientName: selected.client_name,
            subject:
              "Prueba de envío E&R Solutions - " +
              selected.client_name,
          }),
        }
      );

      let result = null;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error ||
          `La prueba de correo falló (HTTP ${response.status}).`
        );
      }

      setMessage(
        "Correo de prueba enviado correctamente desde " +
        (result.sender || sender.email) +
        " hacia " +
        to +
        "."
      );
    } catch (err) {
      console.error("ACCOUNT STATEMENT EMAIL TEST ERROR:", err);
      setError(
        err?.message ||
        "No fue posible enviar el correo de prueba."
      );
    } finally {
      setEmailTestSending(false);
    }
  }

  function safeFilePart(value) {
    return String(value || "Cliente")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Cliente";
  }

  async function openStatementEmailModal() {
    if (!selected || !detail) return;

    setError("");
    setMessage("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error("No hay una sesión activa de E&R.");

      const senderByUser = {
        "3e8d533d-878e-4f04-8f01-80b640d9d7d9": {
          name: "Edgar Barrientos",
          email: "ebarrientos@eyrsolutionsgt.com",
        },
        "8fd10b89-47d0-45e4-ba91-7465c3f027e1": {
          name: "Ronaldo Barrientos",
          email: "rbarrientos@eyrsolutionsgt.com",
        },
      };

      const sender = senderByUser[userId];
      if (!sender) {
        throw new Error("Este usuario no está autorizado para enviar estados de cuenta.");
      }

      setEmailForm({
        to: selected.email || "",
        subject: "Estado de Cuenta E&R Solutions - " + selected.client_name,
        senderName: sender.name,
        senderEmail: sender.email,
        fileName: "Estado-de-Cuenta-" + safeFilePart(selected.client_name) + ".pdf",
      });
      setEmailModalOpen(true);
    } catch (err) {
      setError(err?.message || "No fue posible preparar el envío.");
    }
  }

  async function generateStatementPdfBase64() {
    if (!selected || !detail) {
      throw new Error("No hay Estado de Cuenta para generar.");
    }

    const works = detail?.works || [];
    const totals = detail?.period_totals || {};
    const billed = Number(totals.billed_gtq || 0);
    const paid = Number(totals.paid_gtq || 0);
    const pending = Number(totals.pending_gtq || 0);
    const statementBrand = isWhiteLabelClient
      ? (officeName || "Oficina Aduanal")
      : "E&R Solutions";

    const shortDate = (value) => {
      if (!value) return "—";
      const p = String(value).slice(0, 10).split("-");
      return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(value);
    };

    const longDate = (value) => {
      if (!value) return "—";
      const p = String(value).slice(0, 10).split("-");
      const months = [
        "enero","febrero","marzo","abril","mayo","junio",
        "julio","agosto","septiembre","octubre","noviembre","diciembre"
      ];
      return p.length === 3
        ? `${Number(p[2])} de ${months[Number(p[1]) - 1]} de ${p[0]}`
        : String(value);
    };

    const issued = new Date().toLocaleDateString("es-GT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const meta = [
      selected.nit ? `NIT: ${selected.nit}` : null,
      selected.phone || null,
      selected.email || null,
    ].filter(Boolean);

    let running = 0;
    const normalizedRows = works.map((w, i) => {
      const charge = Number(w.billed_gtq || 0);
      const credit = Number(w.paid_gtq || 0);
      running += charge - credit;

      return {
        n: i + 1,
        date: shortDate(w.work_date),
        correlative: w.correlative_number || w.code || "—",
        consignee: w.importer_name || w.client_duca || w.label || "—",
        service: String(w.label || w.service_name || "Servicio")
          .replace(/^Cartera histórica\s*[:·-]?\s*/i, "")
          .trim() || "Servicio",
        charge,
        credit,
        balance: running,
      };
    });

    const last = works.at(-1);
    const lastCode = last
      ? (last.correlative_number || last.code || "—")
      : "—";

    const loadImageData = async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`No se pudo cargar recurso del reporte: ${url}`);
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    const [logoData, heroData] = await Promise.all([
      loadImageData("/branding/eyr-logo-horizontal.png"),
      loadImageData("/branding/eyr-account-port-hero.png"),
    ]);

    const root = document.createElement("div");
    root.className = "eyr-mail-pdf-root";
    // V39.7.9.9.12.3.2: html2canvas no debe capturar el reporte
    // fuera del viewport. Lo renderizamos en una capa temporal visible para
    // el motor, pero cubierta para el usuario.
    const captureHost = document.createElement("div");
    captureHost.setAttribute("aria-hidden", "true");
    captureHost.style.position = "fixed";
    captureHost.style.inset = "0";
    captureHost.style.zIndex = "2147483646";
    captureHost.style.overflow = "auto";
    captureHost.style.background = "#ffffff";
    captureHost.style.pointerEvents = "none";

    const visualCover = document.createElement("div");
    visualCover.style.position = "fixed";
    visualCover.style.inset = "0";
    visualCover.style.zIndex = "2147483647";
    visualCover.style.background = "#ffffff";
    visualCover.style.pointerEvents = "none";

    root.style.position = "relative";
    root.style.left = "0";
    root.style.top = "0";
    root.style.width = "794px";
    root.style.margin = "0";
    root.style.background = "#ffffff";
    root.style.zIndex = "1";

    captureHost.appendChild(root);
    document.body.appendChild(captureHost);
    document.body.appendChild(visualCover);

    const svg = {
      user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-5 3.5-7 8-7s7.2 2 8 7"/></svg>',
      doc: '<svg viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></svg>',
      money: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 9h.01M17 15h.01M12 9v6M14 10.5c-.5-1-3.5-1-3.5.5s3.5 1 3.5 2.5-3 1.5-3.8.5"/></svg>',
      list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
      info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/></svg>',
      phone: '<svg viewBox="0 0 24 24"><path d="M5 3h4l2 5-3 2c1.5 3 3 4.5 6 6l2-3 5 2v4c0 1-1 2-2 2C10 21 3 14 3 5c0-1 1-2 2-2Z"/></svg>',
      mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
      pin: '<svg viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    };

    const icon = (name, extra = "") =>
      `<span class="pdf-ico ${extra}">${svg[name]}</span>`;

    const makeHeader = (compact = false) => `
      <section class="pdf-brandbar ${compact ? "compact" : ""}">
        <img class="pdf-port-hero" src="${heroData}" alt="">
        <div class="pdf-brand-fade"></div>
        <img class="pdf-logo" src="${logoData}" alt="E&R Solutions">
        <div class="pdf-tags">LOGÍSTICA<br>ADUANAS<br>SOLUCIONES</div>
      </section>
      ${compact ? `
        <section class="pdf-cont-head">
          <div><b>ESTADO DE CUENTA</b><span>${escapeHtml(selected.client_name)}</span></div>
          <div><b>PERÍODO</b><span>${escapeHtml(shortDate(period.from))} — ${escapeHtml(shortDate(period.to))}</span></div>
        </section>
      ` : ""}
    `;

    const makeFooter = () => `
      <footer class="pdf-foot">
        <div class="pdf-slogan">Más que aduanas,<br><span>somos aliados en tu crecimiento.</span><i></i></div>
        <div class="pdf-contacts">
          <div>${icon("phone")}<span><b>3766-6273 / 3401-9981</b></span></div>
          <div>${icon("mail")}<span><b>ebarrientos@eyrsolutionsgt.com</b><br><b>rbarrientos@eyrsolutionsgt.com</b></span></div>
          <div>${icon("pin")}<span>9 calle 1 avenida, Puerto Barrios, Izabal</span></div>
        </div>
        <div class="pdf-foot-logo"><img src="${logoData}" alt="E&R Solutions"></div>
      </footer>
    `;

    const makeTable = (rows) => `
      <table class="pdf-table">
        <thead><tr>
          <th class="c">#</th><th>Fecha</th><th>Correlativo</th>
          <th>Consignatario / Cliente DUCA</th><th>Servicio / Mercancía</th>
          <th class="r">Cargo</th><th class="r">Abono</th><th class="r">Saldo</th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map((r) => `
            <tr>
              <td class="c">${r.n}</td>
              <td>${escapeHtml(r.date)}</td>
              <td>${escapeHtml(r.correlative)}</td>
              <td>${escapeHtml(r.consignee)}</td>
              <td>${escapeHtml(r.service)}</td>
              <td class="r">${escapeHtml(money(r.charge))}</td>
              <td class="r">${escapeHtml(money(r.credit))}</td>
              <td class="r balance">${escapeHtml(money(r.balance))}</td>
            </tr>
          `).join("") : '<tr><td colspan="8" class="empty">No hay movimientos en este período.</td></tr>'}
        </tbody>
      </table>
    `;

    // Fixed pagination is deliberate: it prevents html2canvas/html2pdf from
    // interpreting SVG/image dimensions as separate giant pages.
    // First page keeps the full PRO cover; continuation pages are compact.
    const firstCount = normalizedRows.length <= 15 ? normalizedRows.length : 15;
    const nextCount = 18;
    const chunks = [];
    chunks.push(normalizedRows.slice(0, firstCount));
    for (let i = firstCount; i < normalizedRows.length; i += nextCount) {
      chunks.push(normalizedRows.slice(i, i + nextCount));
    }
    if (!chunks.length) chunks.push([]);

    const firstPageIntro = `
      <section class="pdf-title">
        <div><h1>ESTADO DE CUENTA</h1><span>MOVIMIENTOS Y SALDO ACTUAL</span></div>
        <div class="pdf-dates">
          <div><b>Período</b>${escapeHtml(longDate(period.from))}<br>al ${escapeHtml(longDate(period.to))}</div>
          <div><b>Fecha de emisión</b>${escapeHtml(issued)}</div>
        </div>
      </section>

      <section class="pdf-client">
        <div class="pdf-client-icon">${icon("user","navy")}</div>
        <div><h2>${escapeHtml(selected.client_name)}</h2><small>Cliente ${escapeHtml(statementBrand)}</small></div>
        <div class="pdf-meta">${meta.length ? meta.map(x => `<div>${escapeHtml(x)}</div>`).join("") : "Información de contacto no registrada"}</div>
        <div class="pdf-thanks">“Gracias por confiar en nosotros”</div>
      </section>

      <section class="pdf-kpis">
        <div class="pdf-kpi">${icon("doc")}<label>Total facturado</label><strong>${escapeHtml(money(billed))}</strong><small>${works.length} movimientos</small></div>
        <div class="pdf-kpi">${icon("money","green")}<label>Total pagado</label><strong>${escapeHtml(money(paid))}</strong><small>Abonos aplicados</small></div>
        <div class="pdf-kpi due">${icon("doc","red")}<label>Saldo pendiente</label><strong>${escapeHtml(money(pending))}</strong><small>Saldo del período</small></div>
        <div class="pdf-kpi">${icon("list","navy")}<label>Último movimiento</label><strong class="small">${escapeHtml(last ? shortDate(last.work_date) : "—")}</strong><small>${escapeHtml(lastCode)}</small></div>
      </section>
    `;

    const finalBlocks = `
      <section class="pdf-totals">
        <div><span>Total cargos</span><strong>${escapeHtml(money(billed))}</strong></div>
        <div><span>Total abonos</span><strong>${escapeHtml(money(paid))}</strong></div>
        <div class="grand"><span>Saldo pendiente</span><strong>${escapeHtml(money(pending))}</strong></div>
      </section>
      <section class="pdf-notes">
        ${icon("info","navy")}
        <div><b>OBSERVACIONES</b><ul>
          <li>Este estado de cuenta puede incluir cargos importados desde cartera histórica.</li>
          <li>Los montos están expresados en Quetzales (GTQ).</li>
          <li>Para cualquier consulta, comuníquese con nuestro equipo de atención al cliente.</li>
        </ul></div>
      </section>
    `;

    const style = `
      <style>
        .eyr-mail-pdf-root,.eyr-mail-pdf-root *{box-sizing:border-box}
        .eyr-mail-pdf-root{font-family:Arial,sans-serif;color:#163b5d}
        .pdf-page{width:794px;height:1123px;background:#fff;padding:34px 42px 32px;position:relative;overflow:hidden}
        .pdf-page+.pdf-page{page-break-before:auto}
        .pdf-brandbar{height:144px;border:1px solid #dce7ef;border-radius:15px;position:relative;overflow:hidden;margin-bottom:18px;background:#fff}
        .pdf-brandbar.compact{height:82px;margin-bottom:9px}
        .pdf-port-hero{position:absolute;right:0;top:0;width:73%;height:100%;object-fit:cover;object-position:center 55%}
        .pdf-brand-fade{position:absolute;inset:0;background:linear-gradient(90deg,#fff 0%,#fff 29%,rgba(255,255,255,.94) 35%,rgba(255,255,255,.15) 53%,rgba(7,59,103,.08) 100%)}
        .pdf-brandbar:after{content:"";position:absolute;right:0;bottom:0;width:45%;height:4px;background:linear-gradient(90deg,transparent,#ed1c24 42%,#ed1c24)}
        .pdf-logo{position:absolute;z-index:2;left:22px;top:50%;transform:translateY(-50%);width:257px;max-height:102px;object-fit:contain;object-position:left center}
        .compact .pdf-logo{width:168px;max-height:62px}
        .pdf-tags{position:absolute;z-index:2;right:23px;top:26px;color:#fff;text-align:right;font-size:10px;font-weight:800;letter-spacing:1.7px;line-height:1.55;text-shadow:0 1px 4px rgba(0,0,0,.5)}
        .compact .pdf-tags{top:14px;font-size:8px}
        .pdf-title{display:grid;grid-template-columns:1fr auto;gap:25px;align-items:end;margin-bottom:14px}
        .pdf-title h1{margin:0;color:#073b67;font-size:27px}.pdf-title>div>span{font-size:10px;letter-spacing:3px}
        .pdf-dates{display:flex;gap:22px;font-size:8px;line-height:1.5}.pdf-dates b{display:block;color:#073b67;text-transform:uppercase}
        .pdf-client{display:grid;grid-template-columns:48px 1.05fr 1fr .78fr;gap:16px;align-items:center;background:linear-gradient(90deg,#eef5fa,#f8fbfd);border:1px solid #e4edf3;border-radius:14px;padding:13px 16px;margin-bottom:13px}
        .pdf-client h2{margin:0;font-size:18px;color:#073b67}.pdf-client small{color:#6e8295}.pdf-meta,.pdf-thanks{border-left:1px solid #b9cbd8;padding-left:14px;font-size:8px;line-height:1.8}.pdf-thanks{font-size:10px;font-weight:700;font-style:italic}
        .pdf-ico{width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#e3f0f8;color:#073b67;flex:0 0 auto}
        .pdf-ico svg{width:17px!important;height:17px!important;max-width:17px!important;max-height:17px!important;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
        .pdf-ico.green{background:#e4f6ed;color:#07955f}.pdf-ico.red{background:#ffe7e9;color:#d91f2d}.pdf-ico.navy{background:#073b67;color:#fff}
        .pdf-client-icon .pdf-ico{width:42px;height:42px}.pdf-client-icon .pdf-ico svg{width:22px!important;height:22px!important}
        .pdf-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:13px}
        .pdf-kpi{position:relative;min-height:83px;border:1px solid #e2ebf2;border-radius:11px;padding:12px 9px 10px 48px;background:#f6fafd}
        .pdf-kpi>.pdf-ico{position:absolute;left:10px;top:12px}.pdf-kpi label{display:block;font-size:7px;font-weight:800;text-transform:uppercase}.pdf-kpi strong{display:block;margin-top:7px;font-size:15px;color:#073b67}.pdf-kpi strong.small{font-size:12px}.pdf-kpi small{font-size:7px;color:#6e8295}.pdf-kpi.due{background:#fff0f1}.pdf-kpi.due strong{color:#d91f2d}
        .pdf-cont-head{height:48px;border:1px solid #dbe6ee;border-radius:10px;display:grid;grid-template-columns:1.3fr 1fr;gap:20px;align-items:center;padding:8px 14px;margin-bottom:10px;background:#f7fafc}.pdf-cont-head b{display:block;color:#073b67;font-size:9px}.pdf-cont-head span{font-size:8px;color:#61798d}
        .pdf-table{width:100%;border-collapse:separate;border-spacing:0;font-size:7px;border:1px solid #dbe6ee;border-radius:10px;overflow:hidden;table-layout:fixed}
        .pdf-table th{background:#073b67;color:#fff;padding:8px 5px;text-align:left;font-size:6.5px}.pdf-table td{padding:7px 5px;border-bottom:1px solid #dbe6ee;vertical-align:top;overflow-wrap:anywhere}.pdf-table tbody tr:nth-child(even){background:#f8fbfd}.pdf-table .r{text-align:right;white-space:nowrap}.pdf-table .c{text-align:center}.pdf-table .balance{font-weight:900;color:#073b67}.pdf-table .empty{text-align:center;padding:25px}
        .pdf-table th:nth-child(1){width:4%}.pdf-table th:nth-child(2){width:9%}.pdf-table th:nth-child(3){width:14%}.pdf-table th:nth-child(4){width:25%}.pdf-table th:nth-child(5){width:19%}.pdf-table th:nth-child(6),.pdf-table th:nth-child(7),.pdf-table th:nth-child(8){width:9.66%}
        .pdf-totals{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:9px;margin-top:13px}.pdf-totals>div{border:1px solid #e1eaf1;border-radius:10px;padding:11px}.pdf-totals span{font-size:7px;font-weight:800;text-transform:uppercase}.pdf-totals strong{display:block;font-size:15px;margin-top:6px;color:#073b67}.pdf-totals .grand{background:#073b67;color:#fff}.pdf-totals .grand strong{color:#fff;font-size:18px}
        .pdf-notes{display:flex;gap:10px;margin-top:12px;background:#f1f7fb;border-radius:10px;padding:11px 14px;font-size:7.5px;line-height:1.45}.pdf-notes .pdf-ico{width:25px;height:25px}.pdf-notes .pdf-ico svg{width:14px!important;height:14px!important}.pdf-notes ul{margin:4px 0 0;padding-left:17px}
        .pdf-foot{position:absolute;left:42px;right:42px;bottom:31px;height:95px;border-top:1px solid #dbe6ee;display:grid;grid-template-columns:1.08fr 1.42fr .86fr;gap:20px;align-items:center;padding:12px 7px 9px}
        .pdf-foot:after{content:"";position:absolute;left:0;right:0;bottom:-31px;height:15px;background:linear-gradient(90deg,#073b67 0 62%,#ed1c24 62% 69%,#092f52 69% 100%)}
        .pdf-slogan{font-family:"Segoe Print","Segoe Script","Bradley Hand","Brush Script MT",cursive;font-size:15px;font-weight:700;line-height:1.05;transform:rotate(-2deg);color:#073b67}.pdf-slogan span{font-size:12px}.pdf-slogan i{display:block;width:150px;height:2px;background:#ed1c24;margin:7px 0 0 18px;transform:rotate(-4deg)}
        .pdf-contacts{font-size:7px;line-height:1.35;border-left:1px solid #c9d8e3;padding-left:12px}.pdf-contacts>div{display:flex;align-items:center;gap:7px;margin:5px 0}.pdf-contacts .pdf-ico{width:20px;height:20px;background:transparent}.pdf-contacts .pdf-ico svg{width:13px!important;height:13px!important}
        .pdf-foot-logo{text-align:right}.pdf-foot-logo img{width:142px;max-height:64px;object-fit:contain}
      </style>
    `;

    const pages = chunks.map((chunk, index) => {
      const isFirst = index === 0;
      const isLast = index === chunks.length - 1;
      return `
        <section class="pdf-page">
          ${makeHeader(!isFirst)}
          ${isFirst ? firstPageIntro : ""}
          ${makeTable(chunk)}
          ${isLast ? finalBlocks : ""}
          ${makeFooter()}
        </section>
      `;
    }).join("");

    root.innerHTML = style + pages;

    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const imgs = [...root.querySelectorAll("img")];
      await Promise.all(imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      // V39.7.9.9.12.3.3: render multipágina determinista.
      // Cada .pdf-page se captura de forma individual y luego se agrega
      // al mismo jsPDF. Esto evita que html2pdf deje las continuaciones
      // en blanco al procesar todo el root de una sola vez.
      const pageNodes = [...root.querySelectorAll(".pdf-page")];

      if (!pageNodes.length) {
        throw new Error("No se encontraron páginas para generar el Estado de Cuenta.");
      }

      const baseOptions = {
        margin: 0,
        filename: emailForm.fileName || "Estado-de-Cuenta.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          width: 794,
          windowWidth: 794,
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: {
          unit: "px",
          format: [794, 1123],
          orientation: "portrait",
          hotfixes: ["px_scaling"],
        },
      };

      // La primera página crea el documento jsPDF.
      const firstWorker = html2pdf()
        .set(baseOptions)
        .from(pageNodes[0])
        .toPdf();

      const pdf = await firstWorker.get("pdf");

      // Una página DOM fija puede producir una hoja adicional por redondeo.
      // Dejamos únicamente la primera antes de anexar continuaciones.
      while (pdf.internal.getNumberOfPages() > 1) {
        pdf.deletePage(pdf.internal.getNumberOfPages());
      }

      // Las continuaciones se rasterizan UNA POR UNA.
      for (let i = 1; i < pageNodes.length; i += 1) {
        const canvasWorker = html2pdf()
          .set(baseOptions)
          .from(pageNodes[i])
          .toCanvas();

        const canvas = await canvasWorker.get("canvas");

        if (!canvas || !canvas.width || !canvas.height) {
          throw new Error(`No fue posible renderizar la página ${i + 1} del Estado de Cuenta.`);
        }

        const imageData = canvas.toDataURL("image/jpeg", 0.98);

        pdf.addPage([794, 1123], "portrait");
        pdf.addImage(
          imageData,
          "JPEG",
          0,
          0,
          794,
          1123,
          undefined,
          "FAST",
        );
      }

      const dataUri = pdf.output("datauristring");
      return dataUri.split(",")[1] || "";
    } finally {
      visualCover.remove();
      captureHost.remove();
    }
  }

  async function sendStatementEmail(event) {
    event?.preventDefault?.();
    if (!selected || !detail) return;

    const to = String(emailForm.to || "").trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setError("Ingresá un correo destinatario válido.");
      return;
    }

    setEmailSending(true);
    setError("");
    setMessage("");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("No hay una sesión activa de E&R.");

      const pdfBase64 = await generateStatementPdfBase64();
      if (!pdfBase64) throw new Error("No fue posible generar el PDF.");

      const pending = Number(detail?.period_totals?.pending_gtq || 0);
      const response = await fetch(
        "https://jbrgbqlyohlnwdnwhort.supabase.co/functions/v1/send-account-statement",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "send",
            to,
            clientName: selected.client_name,
            subject: emailForm.subject.trim() || ("Estado de Cuenta E&R Solutions - " + selected.client_name),
            fileName: emailForm.fileName,
            pdfBase64,
            periodText: period.from + " al " + period.to,
            balanceText: money(pending),
          }),
        }
      );

      let result = null;
      try { result = await response.json(); } catch {}

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `El envío falló (HTTP ${response.status}).`);
      }

      setEmailModalOpen(false);
      setMessage(
        "Estado de Cuenta enviado correctamente desde " +
        (result.sender || emailForm.senderEmail) +
        " hacia " + to + "."
      );
    } catch (err) {
      console.error("SEND ACCOUNT STATEMENT ERROR:", err);
      setError(err?.message || "No fue posible enviar el Estado de Cuenta.");
    } finally {
      setEmailSending(false);
    }
  }

  function printStatement() {
    if (!selected || !detail) return;
    const works=detail?.works||[], totals=detail?.period_totals||{};
    const billed=Number(totals.billed_gtq||0), paid=Number(totals.paid_gtq||0), pending=Number(totals.pending_gtq||0);
    const statementBrand=isWhiteLabelClient?(officeName||"Oficina Aduanal"):"E&R Solutions";
    const liveLogo="/branding/eyr-logo-horizontal.png";
    const portHero="/branding/eyr-account-port-hero.png";
    const shortDate=v=>{if(!v)return "—";const p=String(v).slice(0,10).split("-");return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:String(v)};
    const longDate=v=>{if(!v)return "—";const p=String(v).slice(0,10).split("-"),m=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];return p.length===3?`${Number(p[2])} de ${m[Number(p[1])-1]} de ${p[0]}`:String(v)};
    let running=0;
    const rows=works.map((w,i)=>{const c=Number(w.billed_gtq||0),p=Number(w.paid_gtq||0);running+=c-p;const corr=w.correlative_number||w.code||"—",cons=w.importer_name||w.client_duca||w.label||"—",svc=String(w.label||w.service_name||"Servicio").replace(/^Cartera histórica\s*[:·-]?\s*/i,"").trim()||"Servicio";return `<tr><td class="ctr">${i+1}</td><td>${escapeHtml(shortDate(w.work_date))}</td><td>${escapeHtml(corr)}</td><td>${escapeHtml(cons)}</td><td>${escapeHtml(svc)}</td><td class="num">${escapeHtml(money(c))}</td><td class="num">${escapeHtml(money(p))}</td><td class="num bal">${escapeHtml(money(running))}</td></tr>`}).join("");
    const last=works.at(-1), lastCode=last?(last.correlative_number||last.code||"—"):"—";
    const issued=new Date().toLocaleDateString("es-GT",{day:"2-digit",month:"long",year:"numeric"});
    const meta=[selected.nit?`NIT: ${selected.nit}`:null,selected.phone||null,selected.email||null].filter(Boolean);
    const win=window.open("","_blank","width=1200,height=900"); if(!win)return setError("El navegador bloqueó la ventana de impresión.");
    win.document.write(`<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Estado de Cuenta - ${escapeHtml(selected.client_name)}</title><style>
*{box-sizing:border-box}:root{--n:#073b67;--n2:#092f52;--r:#d91f2d;--g:#b57912;--ink:#163b5d;--mut:#6e8295;--ln:#dbe6ee;--soft:#f3f8fc}@page{size:A4 portrait;margin:9mm}body{margin:0;background:#eaf0f5;font-family:Arial,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{width:210mm;min-height:297mm;margin:16px auto;background:#fff;padding:10mm 11mm;box-shadow:0 18px 50px #052a491f}.brandbar{position:relative;min-height:38mm;border-radius:4mm;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0;margin-bottom:5mm;border:1px solid #dce7ef}.brandbar:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#fff 0%,#fff 29%,rgba(255,255,255,.94) 35%,rgba(255,255,255,.15) 53%,rgba(7,59,103,.08) 100%);z-index:1;pointer-events:none}.logo{position:relative;z-index:3;width:72mm;height:30mm;display:flex;align-items:center;padding-left:6mm}.logo img{width:68mm;max-width:68mm;max-height:27mm;object-fit:contain;object-position:left center}.fallback{font-size:22px;font-weight:900;color:var(--n)}.fallback small{display:block;font-size:8px;letter-spacing:2px;color:var(--g)}.tags{position:absolute;z-index:4;right:6mm;top:7mm;color:#fff;text-align:right;font-size:8px;font-weight:800;letter-spacing:1.7px;line-height:1.55;text-shadow:0 1px 4px rgba(0,0,0,.45)}.title{display:grid;grid-template-columns:1fr auto;gap:8mm;align-items:end;margin-bottom:4mm}.title h1{margin:0;font-size:25px;color:var(--n)}.title .sub{font-size:10px;letter-spacing:3px}.dates{display:flex;gap:7mm;font-size:8px;line-height:1.5}.dates b{display:block;color:var(--n);text-transform:uppercase}.client{display:grid;grid-template-columns:1.1fr 1fr .8fr;gap:5mm;background:linear-gradient(90deg,#eef5fa,#f8fbfd);border:1px solid #e4edf3;border-radius:4mm;padding:4mm 5mm;margin-bottom:4mm}.client h2{margin:0;font-size:18px;color:var(--n)}.client small{color:var(--mut)}.meta,.thanks{border-left:1px solid #b9cbd8;padding-left:4mm;font-size:8px;line-height:1.8}.thanks{font-size:10px;font-weight:700;font-style:italic;display:flex;align-items:center}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-bottom:4mm}.kpi{border:1px solid #e2ebf2;border-radius:3mm;padding:3.5mm;background:#f6fafd}.kpi label{font-size:7px;font-weight:800;text-transform:uppercase}.kpi strong{display:block;margin-top:2mm;font-size:16px;color:var(--n)}.kpi small{font-size:7px;color:var(--mut)}.kpi.due{background:#fff0f1}.kpi.due strong{color:var(--r)}table{width:100%;border-collapse:separate;border-spacing:0;font-size:7px;border:1px solid var(--ln);border-radius:3mm;overflow:hidden}thead{display:table-header-group}th{background:var(--n);color:#fff;padding:2.8mm 1.8mm;text-align:left}td{padding:2.4mm 1.8mm;border-bottom:1px solid var(--ln)}tbody tr:nth-child(even){background:#f8fbfd}.num{text-align:right;white-space:nowrap}.ctr{text-align:center}.bal{font-weight:900;color:var(--n)}tr{break-inside:avoid}.totals{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:3mm;margin-top:4mm}.total{border:1px solid #e1eaf1;border-radius:3mm;padding:3.5mm}.total span{font-size:7px;font-weight:800;text-transform:uppercase}.total strong{display:block;font-size:16px;margin-top:2mm;color:var(--n)}.total.grand{background:var(--n);color:#fff}.total.grand strong{color:#fff;font-size:19px}.notes{margin-top:4mm;background:#f1f7fb;border-radius:3mm;padding:3.5mm 5mm;font-size:7.5px;line-height:1.55}.notes ul{margin:1.5mm 0 0;padding-left:5mm}.foot{margin-top:4mm;border-top:1px solid var(--ln);padding-top:3mm;display:flex;justify-content:space-between;align-items:end}.slogan{font-size:13px;font-style:italic;font-weight:700;color:var(--n)}.legal{text-align:right;font-size:7px;color:var(--mut);line-height:1.5}.actions{position:fixed;right:18px;bottom:18px;display:flex;gap:8px}.actions button{border:0;border-radius:10px;padding:11px 16px;font-weight:800;cursor:pointer}.primary{background:var(--n);color:#fff}@media print{body{background:#fff}.sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}.actions{display:none}.brandbar,.client,.kpis,.totals,.notes{break-inside:avoid}}
.port-hero{position:absolute;z-index:0;right:0;top:0;width:73%;height:100%;object-fit:cover;object-position:center 55%}
.brandbar:before{content:"";position:absolute;z-index:2;right:0;bottom:0;width:45%;height:4px;background:linear-gradient(90deg,transparent,#ed1c24 42%,#ed1c24)}
@media print{.port-hero{display:block!important}}
.premium-foot{position:relative;display:grid;grid-template-columns:1.15fr 1.45fr .8fr;gap:5mm;align-items:center;margin-top:5mm;padding:5mm 0 3mm;border-top:1px solid var(--ln)}
.premium-foot:after{content:"";position:absolute;left:0;right:0;bottom:-10mm;height:4mm;background:linear-gradient(90deg,#073b67 0 62%,#ed1c24 62% 69%,#092f52 69% 100%)}
.premium-foot .slogan{font-size:12px;line-height:1.15;font-style:italic;font-weight:800;color:var(--n)}
.premium-foot .slogan span{font-size:10px}
.contact-grid{font-size:7.5px;line-height:1.8;color:#294b68;border-left:1px solid #c9d8e3;padding-left:4mm}
.foot-brand{text-align:right}.foot-brand img{width:34mm;max-height:15mm;object-fit:contain}.foot-brand small{display:block;font-size:6px;letter-spacing:1.4px;color:#61778a;margin-top:1mm}

.ico{width:11mm;height:11mm;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;background:#e3f0f8;color:var(--n)}
.ico svg{width:6mm;height:6mm;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ico.green{background:#e4f6ed;color:#07955f}.ico.red{background:#ffe7e9;color:#e21d2d}.ico.navy{background:var(--n);color:#fff}
.kpi{position:relative;min-height:30mm;padding:4mm 3mm 3.5mm 15mm!important}.kpi>.ico{position:absolute;left:3mm;top:4mm;width:9mm;height:9mm}.kpi>.ico svg{width:5mm;height:5mm}.kpi label{display:block}.kpi strong{font-size:15px!important}.kpi.due>.ico{background:#ffe1e4;color:var(--r)}
.client{grid-template-columns:13mm 1.05fr 1fr .78fr!important}.client-avatar{display:flex;align-items:center}.client-avatar .ico{width:11mm;height:11mm;background:var(--n);color:#fff}.client-avatar .ico svg{width:6mm;height:6mm}
.notes{position:relative;padding-left:14mm!important}.notes>.ico{position:absolute;left:4mm;top:4mm;width:7mm;height:7mm}.notes>.ico svg{width:4mm;height:4mm}
.total{position:relative;padding-left:14mm!important;min-height:22mm}.total>.ico{position:absolute;left:3mm;top:5mm;width:8mm;height:8mm}.total>.ico svg{width:4.5mm;height:4.5mm}.total.grand>.ico{background:#fff;color:var(--n)}
.premium-foot{grid-template-columns:1.25fr 1.35fr .8fr!important;padding-top:6mm!important}.premium-foot .slogan{font-family:"Segoe Script","Lucida Handwriting","Brush Script MT",cursive!important;font-size:15px!important;line-height:1.02!important;font-weight:700!important;transform:rotate(-2deg);padding-left:2mm;position:relative}.premium-foot .slogan span{font-size:12px!important}.premium-foot .slogan:after{content:"";display:block;width:42mm;height:2px;background:#ed1c24;margin:2mm 0 0 8mm;transform:rotate(-3deg)}
.contact-grid{font-size:7.5px!important;line-height:1.45!important}.contact-line{display:flex;align-items:center;gap:2mm;margin:1.5mm 0}.contact-line .ico{width:5.5mm;height:5.5mm;background:transparent;color:var(--n)}.contact-line .ico svg{width:4mm;height:4mm}
.foot-brand img{width:39mm!important;max-height:17mm!important}.foot-brand small{display:none!important}

.final-polish-note{display:none}
.premium-foot{grid-template-columns:1.08fr 1.42fr .86fr!important;gap:6mm!important;padding:7mm 2mm 5mm!important}
.premium-foot .slogan,.script{font-family:"Segoe Print","Segoe Script","Bradley Hand","Brush Script MT",cursive!important;font-size:16px!important;font-weight:700!important;line-height:1.02!important;letter-spacing:-.4px!important;transform:rotate(-2deg)}
.premium-foot .slogan span,.script span{font-size:13px!important}
.premium-foot .slogan:after,.script i{width:48mm!important;height:2.2px!important;background:#ed1c24!important;margin:2.3mm 0 0 5mm!important;transform:rotate(-4deg)!important}
.contact-grid,.contacts{font-size:7.3px!important;line-height:1.45!important}
.contact-line,.contacts>div{margin:1.8mm 0!important;gap:2.3mm!important}
.foot-brand img,.foot-logo img{width:43mm!important;max-height:19mm!important}
@media print{.premium-foot{break-inside:avoid}.totals,.notes{break-inside:avoid}}

.repeat-account-head{display:none}.repeat-account-head th{background:#fff!important;color:#073b67!important;padding:0 0 3mm!important;border-bottom:1px solid #b8cddd!important}
.repeat-inner{height:21mm;display:grid;grid-template-columns:43mm 1fr 47mm 42mm;gap:4mm;align-items:center;text-align:left;font-weight:400}
.repeat-inner img{width:39mm;max-height:17mm;object-fit:contain;object-position:left center}.repeat-inner>div:nth-child(2){border-left:1px solid #a8c0d1;padding-left:4mm}.repeat-inner>div:nth-child(2) b{display:block;font-size:11px}.repeat-inner>div:nth-child(2) strong{display:block;font-size:8px}.repeat-inner>div:nth-child(2) span,.repeat-period span{font-size:6.5px;color:#61798d}.repeat-period b{display:block;font-size:6.5px}
@media print{thead{display:table-header-group}.repeat-account-head{display:table-row}.first-page .repeat-account-head{display:none}}
</style></head><body><main class="sheet">
<section class="brandbar"><img class="port-hero" src="${portHero}" alt=""><div class="logo">${liveLogo?`<img src="${escapeHtml(liveLogo)}" alt="${escapeHtml(statementBrand)}">`:`<div class="fallback">${escapeHtml(statementBrand)}<small>AGENCIA ADUANAL</small></div>`}</div><div class="tags">LOGÍSTICA<br>ADUANAS<br>SOLUCIONES</div></section>
<section class="title"><div><h1>ESTADO DE CUENTA</h1><div class="sub">MOVIMIENTOS Y SALDO ACTUAL</div></div><div class="dates"><div><b>Período</b>${escapeHtml(longDate(period.from))}<br>al ${escapeHtml(longDate(period.to))}</div><div><b>Fecha de emisión</b>${escapeHtml(issued)}</div></div></section>
<section class="client"><div class="client-avatar"><span class="ico navy"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-5 3.5-7 8-7s7.2 2 8 7"/></svg></span></div><div><h2>${escapeHtml(selected.client_name)}</h2><small>Cliente ${escapeHtml(statementBrand)}</small></div><div class="meta">${meta.length?meta.map(x=>`<div>${escapeHtml(x)}</div>`).join(""):"Información de contacto no registrada"}</div><div class="thanks">“Gracias por confiar en nosotros”</div></section>
<section class="kpis">
<div class="kpi"><span class="ico "><svg viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></svg></span><label>Total facturado</label><strong>${escapeHtml(money(billed))}</strong><small>${works.length} movimientos</small></div>
<div class="kpi"><span class="ico green"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 9h.01M17 15h.01M12 9v6M14 10.5c-.5-1-3.5-1-3.5.5s3.5 1 3.5 2.5-3 1.5-3.8.5"/></svg></span><label>Total pagado</label><strong>${escapeHtml(money(paid))}</strong><small>Abonos aplicados</small></div>
<div class="kpi due"><span class="ico red"><svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V6M16 20V12M22 20V3"/><path d="m3 9 6-5 6 5 7-7"/></svg></span><label>Saldo pendiente</label><strong>${escapeHtml(money(pending))}</strong><small>Saldo del período</small></div>
<div class="kpi"><span class="ico navy"><svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg></span><label>Último movimiento</label><strong style="font-size:12px">${escapeHtml(last?shortDate(last.work_date):"—")}</strong><small>${escapeHtml(lastCode)}</small></div>
</section>
<table><thead><tr><th>#</th><th>Fecha</th><th>Correlativo</th><th>Consignatario / Cliente DUCA</th><th>Servicio / Mercancía</th><th class="num">Cargo</th><th class="num">Abono</th><th class="num">Saldo</th></tr></thead><tbody>${rows||'<tr><td colspan="8" style="text-align:center;padding:8mm">No hay movimientos en este período.</td></tr>'}</tbody></table>
<section class="totals">
<div class="total"><span class="ico "><svg viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></svg></span><span>Total cargos</span><strong>${escapeHtml(money(billed))}</strong></div>
<div class="total"><span class="ico green"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 9h.01M17 15h.01M12 9v6M14 10.5c-.5-1-3.5-1-3.5.5s3.5 1 3.5 2.5-3 1.5-3.8.5"/></svg></span><span>Total abonos</span><strong>${escapeHtml(money(paid))}</strong></div>
<div class="total grand"><span class="ico "><svg viewBox="0 0 24 24"><path d="M12 3v18M7 21h10M5 6h14M7 6l-4 7h8L7 6ZM17 6l-4 7h8l-4-7Z"/><path d="M3 13c0 2 1.8 3 4 3s4-1 4-3M13 13c0 2 1.8 3 4 3s4-1 4-3"/></svg></span><span>Saldo pendiente</span><strong>${escapeHtml(money(pending))}</strong></div>
</section>
<section class="notes"><span class="ico navy"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/></svg></span><b>OBSERVACIONES</b><ul><li>Este estado de cuenta puede incluir cargos importados desde cartera histórica.</li><li>Los montos están expresados en Quetzales (GTQ).</li><li>Para cualquier consulta, comuníquese con nuestro equipo de atención al cliente.</li></ul></section>
<footer class="foot premium-foot">
<div class="slogan">Más que aduanas,<br><span>somos aliados en tu crecimiento.</span></div>
<div class="contact-grid">
<div class="contact-line"><span class="ico "><svg viewBox="0 0 24 24"><path d="M5 3h4l2 5-3 2c1.5 3 3 4.5 6 6l2-3 5 2v4c0 1-1 2-2 2C10 21 3 14 3 5c0-1 1-2 2-2Z"/></svg></span><span><b>3766-6273 / 3401-9981</b></span></div>
<div class="contact-line"><span class="ico "><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg></span><span><b>ebarrientos@eyrsolutionsgt.com</b><br><b>rbarrientos@eyrsolutionsgt.com</b></span></div>
<div class="contact-line"><span class="ico "><svg viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span>9 calle 1 avenida, Puerto Barrios, Izabal</span></div>
</div>
<div class="foot-brand"><img src="/branding/eyr-logo-horizontal.png" alt="E&R Solutions"></div>
</footer>
</main><div class="actions"><button onclick="window.close()">Cerrar</button><button class="primary" onclick="window.print()">Imprimir / Guardar PDF</button></div></body></html>`);
    win.document.close(); win.focus();
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
        <HistoricalPortfolioImport supabase={supabase} onImported={async()=>{await load(); onChanged?.();}} />
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
              <button type="button" className="print" onClick={printStatement}>🖨️ Imprimir / Guardar PDF</button>
              <button
                type="button"
                className="statement-email-send-btn"
                onClick={openStatementEmailModal}
                disabled={emailSending}
              >
                ✉️ Enviar por correo
              </button>
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
                  <div className="receivable-work-actions">
                    <strong className={Number(work.pending_gtq) > 0 ? "pending" : "paid"}>
                      {Number(work.pending_gtq) > 0 ? money(work.pending_gtq) : "PAGADO"}
                    </strong>

                    {work.type === "HISTORICAL" && Number(work.pending_gtq || 0) > 0 && (
                      <button
                        type="button"
                        className="historical-void-btn"
                        onClick={() => voidHistoricalReceivable(work)}
                        disabled={saving}
                        title="Anular cargo histórico"
                      >
                        🗑️ Anular
                      </button>
                    )}
                  </div>
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

      {emailModalOpen && (
        <div
          className="statement-email-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !emailSending) setEmailModalOpen(false);
          }}
        >
          <form className="statement-email-modal" onSubmit={sendStatementEmail}>
            <div className="statement-email-modal-head">
              <div>
                <span>ENVÍO SEGURO · ZOHO MAIL</span>
                <h3>Enviar Estado de Cuenta</h3>
                <p>El PDF premium se genera automáticamente y se adjunta al correo.</p>
              </div>
              <button
                type="button"
                className="statement-email-close"
                onClick={() => setEmailModalOpen(false)}
                disabled={emailSending}
                aria-label="Cerrar"
              >×</button>
            </div>

            <div className="statement-email-summary">
              <div><span>CLIENTE</span><strong>{selected?.client_name}</strong></div>
              <div><span>PERÍODO</span><strong>{period.from} → {period.to}</strong></div>
              <div><span>SALDO DEL PERÍODO</span><strong>{money(detail?.period_totals?.pending_gtq)}</strong></div>
            </div>

            <label className="statement-email-field">
              <span>De</span>
              <div className="statement-email-sender">
                <b>{emailForm.senderName}</b>
                <small>{emailForm.senderEmail}</small>
              </div>
            </label>

            <label className="statement-email-field">
              <span>Para</span>
              <input
                type="email"
                value={emailForm.to}
                onChange={(e) => setEmailForm((p) => ({ ...p, to: e.target.value }))}
                placeholder="cliente@correo.com"
                autoFocus
                required
              />
            </label>

            <label className="statement-email-field">
              <span>Asunto</span>
              <input
                value={emailForm.subject}
                onChange={(e) => setEmailForm((p) => ({ ...p, subject: e.target.value }))}
                required
              />
            </label>

            <div className="statement-email-attachment">
              <div className="statement-email-pdf-icon">PDF</div>
              <div>
                <span>ARCHIVO ADJUNTO</span>
                <strong>{emailForm.fileName}</strong>
                <small>Estado de Cuenta E&R Solutions · generado al enviar</small>
              </div>
            </div>

            <div className="statement-email-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEmailModalOpen(false)}
                disabled={emailSending}
              >
                Cancelar
              </button>
              <button type="submit" className="primary" disabled={emailSending}>
                {emailSending ? "Generando PDF y enviando..." : "✉️ Enviar Estado de Cuenta"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
