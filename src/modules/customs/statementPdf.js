import { jsPDF } from "jspdf";
import { caseStatement, currency } from "./caseStatement.js";

const navy = "#092E4C", gold = "#EE9618", ink = "#142F43", slate = "#536878";
const formatDate = iso => String(iso || "").split("-").reverse().join("/");
const money = cents => currency(cents / 100).replace(/\s/g, " ");

export function statementPdf(record, data, stationery, date) {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const summary = caseStatement(record, data);
  const left = 38, right = 574, bottom = 632;
  let y = 0;

  function text(value, x, top, size = 10, color = ink, bold = false, align = "left") {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(String(value), x, top, { align });
  }
  function box(x, top, width, height, color) {
    doc.setFillColor(color); doc.rect(x, top, width, height, "F");
  }
  function page() {
    if (y) doc.addPage();
    // Bleed the one-pixel frame of the source artwork beyond the Letter page.
    doc.addImage(stationery, "PNG", -1.5, -1.5, 615, 795, "eyr-letterhead", "FAST");
    text("Estado de cuenta", left, 162, 27, navy, true);
    text(record.case_code, left, 181, 11, slate, true);
    text("Emitido el " + formatDate(date), right, 181, 10, slate, false, "right");
    box(left, 191, right-left, 1.4, gold);
    y = 206;
  }
  function space(height, continuation) {
    if (y + height <= bottom) return;
    page();
    continuation?.();
  }
  function wrapped(value, maxWidth, size, bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
    return doc.splitTextToSize(String(value), maxWidth);
  }
  function paragraph(value, size, leading, color, bold = false) {
    for (const line of wrapped(value, right-left, size, bold)) {
      space(leading); text(line,left,y+size,size,color,bold); y+=leading;
    }
  }
  function headings() {
    box(left,y,right-left,22,navy);
    text("Concepto",left+9,y+15,9,"#FFFFFF",true);
    ["Cargo","Pagado","Pendiente"].forEach((v,i)=>text(v,[386,476,565][i],y+15,9,"#FFFFFF",true,"right"));
    y+=22;
  }
  function row(label, values, index, dateLabel) {
    const lines=wrapped(label,246,10);
    space(Math.min(lines.length*13+15+(dateLabel?11:0),320), headings);
    for(let i=0;i<lines.length;i++){
      space(19,headings);
      if(index%2===0) box(left,y,right-left,19,"#F2F5F7");
      text(lines[i],left+9,y+13);
      if(i===0)values.forEach((v,j)=>text(v,[386,476,565][j],y+13,10,ink,j===2,"right"));
      y+=i===lines.length-1?19:13;
    }
    if(dateLabel){space(11,headings);if(index%2===0)box(left,y,right-left,11,"#F2F5F7");text(dateLabel,left+9,y+8,8,slate);y+=11;}
    y+=3;
  }
  page();
  paragraph("CLIENTE",8,13,slate,true);
  paragraph(record.client_name || "Sin nombre registrado",15,20,navy,true);
  paragraph([record.model_year,record.make,record.model || record.vehicle_model].filter(Boolean).join(" · "),11,16,ink);
  if(record.vin)paragraph("VIN   "+record.vin,10,15,slate);
  y+=9;space(48);headings();
  summary.lines.forEach((r,i)=>row(r.label,[money(r.charge),money(r.paid),money(r.charge-r.paid)],i,r.date && formatDate(r.date)));
  if(summary.credit)row("Excedente a favor del cliente",["—",money(summary.credit),money(-summary.credit)],summary.lines.length);
  space(72);box(left,y,right-left,23,"#FDF1D9");text("Total",left+9,y+15,10,navy,true);
  [summary.charge,summary.paid,summary.balance].forEach((v,j)=>text(money(v),[386,476,565][j],y+15,10,navy,true,"right"));
  y+=30;box(left,y,right-left,35,navy);box(left,y,4,35,gold);
  text(summary.balance<0?"Saldo a favor":"Saldo pendiente",left+12,y+22,13,"#FFFFFF",true);
  text(money(Math.abs(summary.balance)),right-12,y+23,18,"#FFFFFF",true,"right");y+=43;
  if(Number(record.crane_usd)>0) paragraph("Grúa cotizada por separado en USD: US$ "+Number(record.crane_usd).toFixed(2),10,14,slate);
  if(data.payments.length){
    space(44);paragraph("Abonos recibidos",12,18,navy,true);
    for (const receipt of summary.receipts) {
      for (const part of receipt.allocations) {
        paragraph(formatDate(receipt.date)+"   ·   "+part.label+"   ·   "+money(part.amount),10,14,ink);
      }
      if (receipt.credit) paragraph(formatDate(receipt.date)+"   ·   Saldo a favor   ·   "+money(receipt.credit),10,14,ink);
    }
  }
  const pages=doc.getNumberOfPages();
  for(let n=1;n<=pages;n++){doc.setPage(n);text(n+" / "+pages,right,651,8,slate,false,"right");}
  doc.setProperties({title:"Estado de cuenta "+record.case_code,author:"EyR Solutions"});
  return doc;
}
