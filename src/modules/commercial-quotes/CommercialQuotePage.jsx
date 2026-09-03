import { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { buildQuoteCode } from "../../utils/quoteCode";
import "./commercial-quote.css";

function n(v) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function gtq(v) {
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  }).format(n(v));
}

function usd(v) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n(v));
}

export default function CommercialQuotePage({
  supabase,
  context,
  logo,
  onBack,
  onFinalized,
  buildWhatsAppUrl,
}) {
  const quoteRef = useRef(null);
  const result = context?.result || {};
  const query = context?.query || {};
  const prospect = context?.prospect || {};
  const vehicle = result?.vehicle || {};
  const taxes = result?.taxes || {};
  const freight = result?.freight || {};
  const summary = result?.summary || {};

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [quoteCode, setQuoteCode] = useState(() => {
  if (context?.quoteCode) {
    return context.quoteCode;
  }

  return buildQuoteCode({
    vin: query?.vin || vehicle?.vin || "VIN",
    isWhiteLabelClient: Boolean(context?.isWhiteLabelClient),
    officeName: context?.officeName || "",
    explicitPrefix: context?.quotePrefix || "",
  });
});

  const [form, setForm] = useState({
    include_freight:
      !result?.freight_requires_review && n(freight?.price_usd) > 0,

    document_collection_charge_gtq: "",
    port_expenses_charge_gtq: "",
    professional_fees_charge_gtq: "",
    other_charge_gtq: "",
    other_charge_concept: "Otros servicios",
    crane_charge_usd: "",

    document_collection_cost_gtq: "",
    port_expenses_cost_gtq: "",
    professional_cost_gtq: "",
    other_cost_gtq: "",
    crane_cost_usd: "",
    freight_cost_usd: n(freight?.price_usd) || "",

    validity_days: 5,
    notes:
      "Cotización sujeta a validación final de SAT, naviera, puerto y gastos operativos al momento de efectuar la importación.",
  });

  const calc = useMemo(() => {
    const baseTaxes = n(taxes?.total_taxes_gtq);
    const clientExtrasGTQ =
      n(form.document_collection_charge_gtq) +
      n(form.port_expenses_charge_gtq) +
      n(form.professional_fees_charge_gtq) +
      n(form.other_charge_gtq);

    const clientGuatemalaGTQ = baseTaxes + clientExtrasGTQ;

    const freightClientUSD = form.include_freight ? n(freight?.price_usd) : 0;
    const craneClientUSD = form.include_freight ? n(form.crane_charge_usd) : 0;
    const clientTransportUSD = freightClientUSD + craneClientUSD;

    const internalGTQ =
      n(form.document_collection_cost_gtq) +
      n(form.port_expenses_cost_gtq) +
      n(form.professional_cost_gtq) +
      n(form.other_cost_gtq);

    const internalUSD = form.include_freight
      ? n(form.freight_cost_usd) + n(form.crane_cost_usd)
      : 0;

    const commercialRevenueGTQ = clientExtrasGTQ;
    const commercialRevenueUSD = clientTransportUSD;

    const marginGTQ = commercialRevenueGTQ - internalGTQ;
    const marginUSD = commercialRevenueUSD - internalUSD;

    const exchangeRate = n(
      summary?.exchange_rate || result?.exchange_rate || taxes?.exchange_rate
    );

    const clientGrandUSD = exchangeRate > 0
      ? clientGuatemalaGTQ / exchangeRate + clientTransportUSD
      : null;

    const revenueEquivalentGTQ = exchangeRate > 0
      ? commercialRevenueGTQ + commercialRevenueUSD * exchangeRate
      : null;
    const costEquivalentGTQ = exchangeRate > 0
      ? internalGTQ + internalUSD * exchangeRate
      : null;
    const profitEquivalentGTQ =
      revenueEquivalentGTQ !== null && costEquivalentGTQ !== null
        ? revenueEquivalentGTQ - costEquivalentGTQ
        : null;
    const marginPct =
      revenueEquivalentGTQ && revenueEquivalentGTQ > 0
        ? (profitEquivalentGTQ / revenueEquivalentGTQ) * 100
        : null;

    return {
      baseTaxes,
      clientExtrasGTQ,
      clientGuatemalaGTQ,
      freightClientUSD,
      craneClientUSD,
      clientTransportUSD,
      internalGTQ,
      internalUSD,
      commercialRevenueGTQ,
      commercialRevenueUSD,
      marginGTQ,
      marginUSD,
      exchangeRate,
      clientGrandUSD,
      revenueEquivalentGTQ,
      costEquivalentGTQ,
      profitEquivalentGTQ,
      marginPct,
    };
  }, [form, freight, result, summary, taxes]);

  function payload(status) {
    return {
      p_query_id: query.id,
      p_contact_key: prospect.contact_key || query.contact_key || null,
      p_quote_code: quoteCode,
      p_status: status,
      p_client_name: prospect.full_name || query.full_name || "Cliente",
      p_client_phone: prospect.phone || query.phone || null,
      p_vin: query.vin || vehicle.vin || null,
      p_vehicle_label: [
        vehicle.model_year || vehicle.year || query.model_year,
        vehicle.make || query.make,
        vehicle.model || query.model,
        vehicle.trim || query.vehicle_trim,
      ].filter(Boolean).join(" "),
      p_exchange_rate: calc.exchangeRate || null,
      p_snapshot: result,
      p_public_costs: {
        taxes_gtq: calc.baseTaxes,
        document_collection_gtq: n(form.document_collection_charge_gtq),
        port_expenses_gtq: n(form.port_expenses_charge_gtq),
        professional_fees_gtq: n(form.professional_fees_charge_gtq),
        other_charge_gtq: n(form.other_charge_gtq),
        other_charge_concept: form.other_charge_concept,
        include_freight: form.include_freight,
        freight_usd: calc.freightClientUSD,
        crane_usd: calc.craneClientUSD,
      },
      p_internal_costs: {
        document_collection_cost_gtq: n(form.document_collection_cost_gtq),
        port_expenses_cost_gtq: n(form.port_expenses_cost_gtq),
        professional_cost_gtq: n(form.professional_cost_gtq),
        other_cost_gtq: n(form.other_cost_gtq),
        freight_cost_usd: form.include_freight ? n(form.freight_cost_usd) : 0,
        crane_cost_usd: form.include_freight ? n(form.crane_cost_usd) : 0,
      },
      p_totals: calc,
      p_validity_days: Number(form.validity_days || 5),
      p_notes: form.notes || null,
    };
  }

  async function save(status = "DRAFT") {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "save_commercial_quote_v37",
        payload(status)
      );
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.quote_code) setQuoteCode(row.quote_code);
      setMessage(
        status === "FINALIZED"
          ? "Cotización finalizada y congelada correctamente."
          : "Borrador guardado."
      );
      if (status === "FINALIZED") {
        try {
          await supabase.rpc("admin_mark_quote_generated", {
            p_query_id: query.id,
            p_quote_code: row?.quote_code || quoteCode,
          });
        } catch (markErr) {
          console.warn("QUOTE MARK GENERATED:", markErr);
        }
        onFinalized?.(row || { quote_code: quoteCode });
      }
      return row;
    } catch (err) {
      console.error("COMMERCIAL QUOTE SAVE ERROR:", err);
      setError(err?.message || "No fue posible guardar la cotización.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function downloadPng() {
    if (!quoteRef.current) return;
    setSaving(true);
    setError("");
    try {
      const canvas = await html2canvas(quoteRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `${quoteCode}.png`;
      link.href = canvas.toDataURL("image/png", 1);
      link.click();
    } catch (err) {
      setError(err?.message || "No fue posible generar la imagen.");
    } finally {
      setSaving(false);
    }
  }

  async function finalizeAndWhatsApp() {
    const saved = await save("FINALIZED");
    if (!saved) return;
    await downloadPng();
    const phone = prospect.phone || query.phone;
    if (phone && buildWhatsAppUrl) {
      const msg =
        `Hola ${prospect.full_name || query.full_name || ""}, te compartimos la cotización ${saved.quote_code || quoteCode} de E&R Solutions para tu ` +
        `${[vehicle.model_year || vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")} ` +
        `(VIN ${query.vin || vehicle.vin || "—"}). Adjuntá la imagen generada en este chat.`;
      window.open(buildWhatsAppUrl(phone, msg), "_blank", "noopener,noreferrer");
    }
  }

  const vehicleLabel = [
    vehicle.model_year || vehicle.year || query.model_year,
    vehicle.make || query.make,
    vehicle.model || query.model,
    vehicle.trim || query.vehicle_trim,
  ].filter(Boolean).join(" ") || "Vehículo";

  return (
    <section className="commercial-quote-page">
      <header className="commercial-quote-topbar">
        <div>
          <span>COTIZACIÓN COMERCIAL · E&R SOLUTIONS</span>
          <h1>Preparar cotización final</h1>
          <p>{vehicleLabel} · {query.vin || vehicle.vin}</p>
        </div>
        <div className="commercial-quote-top-actions">
          <button className="secondary" onClick={onBack}>← Volver a Prospectos</button>
          <button onClick={() => save("DRAFT")} disabled={saving}>Guardar borrador</button>
        </div>
      </header>

      {message && <div className="commercial-quote-message success">{message}</div>}
      {error && <div className="commercial-quote-message error">{error}</div>}

      <div className="commercial-quote-layout">
        <div className="commercial-quote-editor">
          <section className="commercial-card">
            <div className="commercial-card-head">
              <div><span>DATOS BASE</span><h2>Cálculo ya validado</h2></div>
              <strong className="ready-pill">READY</strong>
            </div>
            <div className="commercial-base-grid">
              <div><span>Cliente</span><strong>{prospect.full_name || query.full_name || "—"}</strong></div>
              <div><span>VIN</span><strong>{query.vin || vehicle.vin || "—"}</strong></div>
              <div><span>Línea SAT</span><strong>{result?.sat?.line || result?.sat?.selected_match?.line || query.sat_line || "—"}</strong></div>
              <div><span>Tributos</span><strong>{gtq(calc.baseTaxes)}</strong></div>
              <div><span>Flete calculado</span><strong>{calc.freightClientUSD ? usd(calc.freightClientUSD) : "—"}</strong></div>
              <div><span>Tipo de cambio</span><strong>{calc.exchangeRate ? calc.exchangeRate.toFixed(4) : "—"}</strong></div>
            </div>
          </section>

          <section className="commercial-card">
            <div className="commercial-card-head"><div><span>COBROS AL CLIENTE</span><h2>Qué incluirá la propuesta</h2></div></div>
            <div className="commercial-form-grid">
              <label><span>Recolección de documentos (Q)</span><input type="number" min="0" step="0.01" value={form.document_collection_charge_gtq} onChange={e=>setForm(p=>({...p,document_collection_charge_gtq:e.target.value}))}/></label>
              <label><span>Gastos portuarios / operativos (Q)</span><input type="number" min="0" step="0.01" value={form.port_expenses_charge_gtq} onChange={e=>setForm(p=>({...p,port_expenses_charge_gtq:e.target.value}))}/></label>
              <label><span>Honorarios E&R (Q)</span><input type="number" min="0" step="0.01" value={form.professional_fees_charge_gtq} onChange={e=>setForm(p=>({...p,professional_fees_charge_gtq:e.target.value}))}/></label>
              <label><span>Otro cobro (Q)</span><input type="number" min="0" step="0.01" value={form.other_charge_gtq} onChange={e=>setForm(p=>({...p,other_charge_gtq:e.target.value}))}/></label>
              <label className="span-2"><span>Concepto otro cobro</span><input value={form.other_charge_concept} onChange={e=>setForm(p=>({...p,other_charge_concept:e.target.value}))}/></label>
              <label className="commercial-toggle span-2"><div><strong>Incluir flete marítimo</strong><small>Desactivalo para clientes que embarcan por su cuenta.</small></div><input type="checkbox" checked={form.include_freight} onChange={e=>setForm(p=>({...p,include_freight:e.target.checked}))}/></label>
              <label><span>Grúa a cobrar (USD)</span><input type="number" min="0" step="0.01" disabled={!form.include_freight} value={form.crane_charge_usd} onChange={e=>setForm(p=>({...p,crane_charge_usd:e.target.value}))}/></label>
              <label><span>Vigencia (días)</span><input type="number" min="1" max="30" value={form.validity_days} onChange={e=>setForm(p=>({...p,validity_days:e.target.value}))}/></label>
            </div>
          </section>

          <section className="commercial-card internal-cost-card">
            <div className="commercial-card-head"><div><span>🔐 SOLO ADMINISTRACIÓN</span><h2>Costos reales y rentabilidad</h2></div></div>
            <div className="commercial-form-grid">
              <label><span>Costo recolección (Q)</span><input type="number" min="0" step="0.01" value={form.document_collection_cost_gtq} onChange={e=>setForm(p=>({...p,document_collection_cost_gtq:e.target.value}))}/></label>
              <label><span>Costo portuario / operativo (Q)</span><input type="number" min="0" step="0.01" value={form.port_expenses_cost_gtq} onChange={e=>setForm(p=>({...p,port_expenses_cost_gtq:e.target.value}))}/></label>
              <label><span>Costo asociado a honorarios (Q)</span><input type="number" min="0" step="0.01" value={form.professional_cost_gtq} onChange={e=>setForm(p=>({...p,professional_cost_gtq:e.target.value}))}/></label>
              <label><span>Otros costos internos (Q)</span><input type="number" min="0" step="0.01" value={form.other_cost_gtq} onChange={e=>setForm(p=>({...p,other_cost_gtq:e.target.value}))}/></label>
              <label><span>Costo real flete (USD)</span><input type="number" min="0" step="0.01" disabled={!form.include_freight} value={form.freight_cost_usd} onChange={e=>setForm(p=>({...p,freight_cost_usd:e.target.value}))}/></label>
              <label><span>Costo real grúa (USD)</span><input type="number" min="0" step="0.01" disabled={!form.include_freight} value={form.crane_cost_usd} onChange={e=>setForm(p=>({...p,crane_cost_usd:e.target.value}))}/></label>
            </div>

            <div className="profit-kpis">
              <div><span>Ingreso comercial GTQ</span><strong>{gtq(calc.commercialRevenueGTQ)}</strong></div>
              <div><span>Costos internos GTQ</span><strong>{gtq(calc.internalGTQ)}</strong></div>
              <div><span>Margen GTQ</span><strong>{gtq(calc.marginGTQ)}</strong></div>
              <div><span>Margen USD</span><strong>{usd(calc.marginUSD)}</strong></div>
              {calc.profitEquivalentGTQ !== null && <div className="profit"><span>Utilidad estimada equivalente</span><strong>{gtq(calc.profitEquivalentGTQ)}</strong><small>{calc.marginPct?.toFixed(1)}% margen</small></div>}
            </div>
          </section>

          <section className="commercial-card">
            <div className="commercial-card-head"><div><span>OBSERVACIONES</span><h2>Condiciones para el cliente</h2></div></div>
            <textarea className="commercial-notes" rows="4" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}/>
          </section>
        </div>

        <aside className="commercial-preview-column">
          <div className="commercial-preview-sticky">
            <div className="commercial-preview-label">VISTA DEL CLIENTE</div>
            <div className="commercial-quote-sheet" ref={quoteRef}>
              <header>
                <img src={logo} alt="E&R Solutions" />
                <div className="sheet-meta"><span>COTIZACIÓN</span><strong>{quoteCode}</strong><small>{new Date().toLocaleDateString("es-GT")}</small></div>
              </header>
              <div className="sheet-client"><span>CLIENTE</span><strong>{prospect.full_name || query.full_name || "Cliente"}</strong></div>
              <div className="sheet-vehicle"><small>VEHÍCULO</small><h2>{vehicleLabel}</h2><span>VIN {query.vin || vehicle.vin || "—"}</span></div>

              <section className="sheet-costs">
                <div><span>Tributos estimados</span><strong>{gtq(calc.baseTaxes)}</strong></div>
                {n(form.document_collection_charge_gtq)>0 && <div><span>Recolección de documentos</span><strong>{gtq(form.document_collection_charge_gtq)}</strong></div>}
                {n(form.port_expenses_charge_gtq)>0 && <div><span>Gastos portuarios / operativos</span><strong>{gtq(form.port_expenses_charge_gtq)}</strong></div>}
                {n(form.professional_fees_charge_gtq)>0 && <div><span>Honorarios E&R</span><strong>{gtq(form.professional_fees_charge_gtq)}</strong></div>}
                {n(form.other_charge_gtq)>0 && <div><span>{form.other_charge_concept || "Otros servicios"}</span><strong>{gtq(form.other_charge_gtq)}</strong></div>}
                <div className="sheet-total"><span>TOTAL GUATEMALA</span><strong>{gtq(calc.clientGuatemalaGTQ)}</strong></div>
              </section>

              {form.include_freight && (
                <section className="sheet-transport">
                  <small>TRANSPORTE MARÍTIMO</small>
                  <div><span>Flete</span><strong>{usd(calc.freightClientUSD)}</strong></div>
                  {calc.craneClientUSD>0 && <div><span>Grúa</span><strong>{usd(calc.craneClientUSD)}</strong></div>}
                  <div className="sheet-total"><span>TOTAL TRANSPORTE</span><strong>{usd(calc.clientTransportUSD)}</strong></div>
                </section>
              )}

              {calc.clientGrandUSD !== null && (
                <div className="sheet-grand-total"><span>TOTAL GENERAL ESTIMADO</span><strong>{usd(calc.clientGrandUSD)}</strong><small>Conversión referencial con TC {calc.exchangeRate.toFixed(4)}</small></div>
              )}

              <footer>
                <p>{form.notes}</p>
                <strong>Vigencia: {form.validity_days} días</strong>
                <span>E&R Solutions · Agencia Aduanal</span>
              </footer>
            </div>

            <div className="commercial-preview-actions">
              <button className="secondary" onClick={downloadPng} disabled={saving}>Descargar PNG</button>
              <button onClick={finalizeAndWhatsApp} disabled={saving}>Finalizar y enviar →</button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
