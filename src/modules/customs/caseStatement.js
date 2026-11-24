export const currency = value => new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(value);
const cents = value => Math.round(Number(value || 0) * 100);

export function caseStatement(record, data) {
  const lines = [
    ["collection", "Recolección de documentos", record.document_collection_gtq],
    ["port", "Gastos de puerto", record.port_expenses_gtq],
    ["fees", "Honorarios", record.professional_fees_gtq],
    ["other", record.other_charges_note || "Otros cargos acordados", record.other_charges_gtq],
  ].map(([id, label, value]) => ({ id, label, charge: cents(value), paid: 0 })).filter(row => row.charge);
  const adjustment = cents(data.billed) - cents(data.extras) - lines.reduce((s, row) => s + row.charge, 0);
  if (adjustment) lines.push({ id: "agreement", label: lines.length ? "Ajuste al total acordado" : "Gestión aduanal acordada", charge: adjustment, paid: 0 });
  for (const item of data.expenses) {
    const charge = cents(item.amount);
    lines.push({ id: item.id, label: item.concept, date: item.date, charge, paid: item.source === "DIRECT" ? charge : 0 });
  }
  let general = 0;
  for (const payment of data.payments) {
    const line = lines.find(row => row.id === payment.line);
    const allocated = line ? Math.min(cents(payment.amount), Math.max(0, line.charge - line.paid)) : 0;
    if (line) line.paid += allocated;
    general += cents(payment.amount) - allocated;
  }
  const charge = lines.reduce((s,r) => s+r.charge, 0);
  const paid = lines.reduce((s,r) => s+r.paid, general);
  return { lines, general, charge, paid, balance: charge-paid };
}
