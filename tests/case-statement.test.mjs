import assert from "node:assert/strict";
import test from "node:test";
import {caseStatement} from "../src/modules/customs/caseStatement.js";

test("desglosa el acuerdo, pagos directos y abonos sin duplicar el cargo adicional", () => {
 const caseRow = {document_collection_gtq:150, port_expenses_gtq:400, professional_fees_gtq:1000};
 const data = {billed:2100, extras:550, expenses:[
   {id:"yard",concept:"Almacenaje",amount:350,source:"BANK"},
   {id:"crane",concept:"Grúa",amount:200,source:"CASH"},
   {id:"direct",concept:"Otros",amount:75,source:"DIRECT"}
 ],payments:[{amount:150,line:"collection"},{amount:400,line:"port"},{amount:500}]};
 const s = caseStatement(caseRow,data);
 assert.deepEqual([s.charge,s.paid,s.balance,s.credit],[217500,112500,105000,0]);
 assert.equal(s.lines.find(row=>row.id==="direct").paid,7500);
});
test("respeta el precio acordado, abonos históricos y saldo a favor",()=>{
 const s = caseStatement({professional_fees_gtq:150},{billed:100,extras:0,expenses:[],payments:[{amount:110}]});
 assert.equal(s.balance,-1000);assert.equal(s.lines[0].charge,10000);assert.equal(s.credit,1000);
});

test("0081 cubre gestión primero y el siguiente abono cubre almacenaje parcialmente",()=>{
 const data={billed:5390,extras:740,expenses:[
   {id:"storage",concept:"Almacenaje",amount:540,source:"BANK"},
   {id:"crane",concept:"Grúa",amount:200,source:"BANK"}
 ],payments:[{amount:4650,line:"storage"}]};
 let s=caseStatement({},data);
 assert.deepEqual(s.lines.map(row=>row.paid),[465000,0,0]);
 assert.equal(s.balance,74000);
 data.payments.push({amount:300});
 s=caseStatement({},data);
 assert.deepEqual(s.lines.map(row=>row.charge-row.paid),[0,24000,20000]);
 data.payments.push({amount:300});
 s=caseStatement({},data);
 assert.deepEqual(s.receipts.at(-1).allocations.map(a=>a.amount),[24000,6000]);
 assert.equal(s.balance,14000);
});
