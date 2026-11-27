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
  // Apply a negotiated discount to the base charges before allocating cash.
  // Otherwise a fully paid agreement could still show one concept as unpaid.
  if (adjustment < 0) {
    let discount = -adjustment;
    for (const line of [...lines].reverse()) {
      const reduction = Math.min(discount, Math.max(0, line.charge));
      line.charge -= reduction;
      discount -= reduction;
      if (reduction) line.label += " (precio acordado)";
      if (!discount) break;
    }
    if (discount) lines.push({ id: "discount", label: "Descuento adicional", charge: -discount, paid: 0 });
  }
  if (adjustment > 0) lines.push({ id: "agreement", label: lines.length ? "Ajuste al total acordado" : "Gestión aduanal acordada", charge: adjustment, paid: 0 });
  for (const item of data.expenses) {
    const charge = cents(item.amount);
    lines.push({ id: item.id, label: item.concept, date: item.date, charge, paid: item.source === "DIRECT" ? charge : 0 });
  }
  // The server orders receipts by payment date and additional expenses by expense date.
  // Applying the same rule to historical receipts also fixes old manual labels.
  let credit = 0;
  const receipts = [];
  for (const payment of data.payments) {
    let remaining = cents(payment.amount);
    const allocations = [];
    for (const line of lines) {
      if (!remaining) break;
      const applied = Math.min(remaining, Math.max(0, line.charge - line.paid));
      if (applied > 0) {
        line.paid += applied;
        remaining -= applied;
        allocations.push({ label: line.label, amount: applied });
      }
    }
    credit += remaining;
    receipts.push({ date: payment.date, allocations, credit: remaining });
  }
  const charge = lines.reduce((sum, row) => sum + row.charge, 0);
  const paid = lines.reduce((sum, row) => sum + row.paid, credit);
  return { lines, receipts, credit, charge, paid, balance: charge - paid };
}
