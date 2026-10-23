import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateReceipt} from '../receipts/evaluation.mjs';
const product=(label,amount='2.99',rate='',name=label,kind='p')=>[label,amount,rate,name,kind];
test('evaluation counts repeated purchases and does not let equal totals hide a missing line',()=>{
 const rows=[product('APPLE'),product('APPLE'),product('ORANGE'),['Subtotal','8.97','','','s']];
 const score=evaluateReceipt({rows},{rows:[product('APPLE'),product('ORANGE','5.98')]});
 assert.equal(score.missing,1);assert.equal(score.reconciled,true);assert.equal(score.allFieldsExact,1);assert.equal(score.amountExact,1);
 assert.equal(score.exactExtraction,false);
});
test('evaluation separates stock, labels, identities and categories',()=>{
 const score=evaluateReceipt({rows:[product('RICE 10LB','9.98','2 @ $4.99','Rice')]},{rows:[product('RICE 10LB','9.98','','Rice','h')]});
 assert.equal(score.matched,1);assert.equal(score.stockExact,0);assert.equal(score.categoryExact,0);assert.equal(score.amountExact,1);
});
test('a malformed result is a failed receipt; equal-price unrelated products do not align',()=>{
 const e={rows:[product('PAPAYA')]};
 assert.equal(evaluateReceipt(e,'not json').valid,false);
 const score=evaluateReceipt(e,{rows:[product('DISH SOAP','2.99','','Dish soap','h')]});
 assert.equal(score.matched,0);assert.equal(score.extra,1);assert.equal(score.missing,1);
});
test('whole-receipt evaluation spans many bounded sections without collapsing repeated purchases',()=>{
 const rows=Array.from({length:220},(_,i)=>product(i%2?'RED APPLE':'GREEN APPLE'));
 const score=evaluateReceipt({rows},{rows});assert.equal(score.matched,220);assert.equal(score.allFieldsExact,220);
});
test('matching purchases and balanced totals do not hide a missing count or changed discount',()=>{
 const rows=[product('OATS','6.00'),['Savings','1.00','','','d'],['Subtotal','5.00','','','s'],['Tax','0.50','','','x'],['Total','5.50','','','t'],['Number of items','2','','','c']];
 const expected={rows};
 assert.equal(evaluateReceipt(expected,expected).exactExtraction,true);
 for(const index of [1,3,4,5]){
  const missing=evaluateReceipt(expected,{rows:rows.filter((_,i)=>i!==index)});
  assert.equal(missing.allFieldsExact,1);assert.equal(missing.metadataExact,false);assert.equal(missing.exactExtraction,false);
 }
 const changed=rows.map(row=>row.slice());changed[5][1]='3';
 assert.equal(evaluateReceipt(expected,{rows:changed}).exactExtraction,false);
});
