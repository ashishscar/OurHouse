import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateReceipt} from '../receipts/evaluation.mjs';
const product=(label,amount='2.99',rate='',name=label,kind='p')=>[label,amount,rate,name,kind];
test('evaluation counts repeated purchases and does not let equal totals hide a missing line',()=>{
 const rows=[product('APPLE'),product('APPLE'),product('ORANGE'),['Subtotal','8.97','','','s']];
 const score=evaluateReceipt({rows},{rows:[product('APPLE'),product('ORANGE','5.98')]});
 assert.equal(score.missing,1);assert.equal(score.reconciled,true);assert.equal(score.allFieldsExact,1);assert.equal(score.amountExact,1);
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
