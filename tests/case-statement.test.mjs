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
 assert.deepEqual([s.charge,s.paid,s.balance,s.general],[217500,112500,105000,50000]);
 assert.equal(s.lines.find(row=>row.id==="direct").paid,7500);
});
test("respeta el precio acordado, abonos históricos y saldo a favor",()=>{
 const s = caseStatement({professional_fees_gtq:150},{billed:100,extras:0,expenses:[],payments:[{amount:110}]});
 assert.equal(s.balance,-1000);assert.equal(s.lines.at(-1).charge,-5000);
});
