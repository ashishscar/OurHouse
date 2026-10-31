import test from 'node:test';
import assert from 'node:assert/strict';
import {printedReceiptCount} from '../receipts/metadata.mjs';
import {auditReceipt} from '../receipts/parser.mjs';

test('complete count headings tolerate one OCR character error without changing the printed number',()=>{
 for(const heading of ['Number','Mumber','Nuber','Nummber','Numher']){
  const raw=heading+' of items: 17',count=printedReceiptCount(raw);
  assert.equal(count.value,'17');assert.equal(count.label,'Number of items');assert.equal(count.printed,raw);
  assert.equal(count.headingCorrected,heading!=='Number');
 }
 assert.equal(printedReceiptCount('Item count: 23').value,'23');
 assert.equal(printedReceiptCount('Items sold 19').value,'19');
 assert.equal(printedReceiptCount('Number of products: 0').value,'0');
 const audit=auditReceipt('TEST OATS $2.00\nTOTAL $2.00\nNumher of items: 17');
 assert.equal(audit.productCount,17);assert.equal(audit.productCountEvidence.printed,'Numher of items: 17');
 assert.equal(audit.packCount,1);assert.match(audit.warnings.join(' '),/17 purchased units/);
});

test('count recognition rejects incomplete, ambiguous and unrelated lines',()=>{
 for(const line of ['Number of items: 10000','Nubmer of items: 17','Whatever of items: 17','Number of items: 17 $1.00','TEST NUMBER OF ITEMS 17','Num of products: 17','Number of items: -17','Numbereel of items: 17','Number of products:17 more','BOB Count 17','TEST 17','Number of items:','Number of items: 1.7',null])assert.equal(printedReceiptCount(line),null);
 const audit=auditReceipt('TEST OATS $2.00\nTOTAL $2.00\nBOB Count 1');
 assert.equal(audit.productCount,undefined);assert.equal(audit.partialBasketCount,1);
});
