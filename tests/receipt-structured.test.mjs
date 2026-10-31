import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReceiptFields} from '../receipts/parser.mjs';
import {validateReceiptRows,receiptRowsToDraft} from '../receipts/structured.mjs';

test('explicit receipt fields preserve a decimal label and keep cost out of stock',()=>{
 const row=parseReceiptFields({label:'TEST TOMATO 2.84',amount:'9.99'});
 assert.equal(row.name,'TEST TOMATO 2.84');assert.equal(row.amount,'9.99');assert.equal(row.qty,1);assert.equal(row.quantityKnown,false);
 const weighted=parseReceiptFields({label:'TEST LENTILS 10LB',amount:'12.00',quantityLine:'2 @ $6.00'});
 assert.equal(weighted.qty,9.071847);assert.equal(weighted.quantityDetail,'2 packs × 10 lb');
 const loose=parseReceiptFields({label:'TEST APPLES',amount:'2.20',quantityLine:'1.100 kg @ $2.00/kg'});assert.equal(loose.qty,1.1);assert.equal(loose.unit,'kg');
});
test('compact rows retain repeat purchases, review selections and category boundaries',()=>{
 const result=receiptRowsToDraft({rows:[['TEST MILK 2%','3.00','','2% Milk','p'],['TEST MILK 2%','3.00','','2% Milk','p'],['TEST HAND SOAP 500ML','4.00','','Hand soap','h'],['GROCERY','2.00','','GROCERY','u'],['TOTAL','12.00','','','t']]});
 assert.equal(result.items.length,4);assert.equal(result.items[0].name,'2% Milk');assert.equal(result.items[0].pick,false);assert.equal(result.items[2].section,'household');assert.equal(result.items[2].qty,500);assert.equal(result.items[3].name,'GROCERY');assert.equal(result.items[3].section,'');assert.equal(result.metadata[0].amount,'12.00');
});
test('malformed compact rows cannot turn metadata or hostile values into stock',()=>{
 for(const rows of [[['TOTAL','2.00','','Rice','p']],[['Rice','2.00',{},'Rice','p']],[['Rice','NaN','','Rice','p']],[['Rice','2.00','','Rice','other']],[['<img>','2.00','','Rice','p']],[['COUNT','3.5','','','c']],[['TOTAL','2.00','','Rice','t']]])assert.throws(()=>validateReceiptRows({rows}));
 assert.throws(()=>validateReceiptRows({rows:Array(181).fill(['Rice','2.00','','Rice','p'])}));
});
test('compact name suggestions retain the original label when product words are removed or invented',()=>{
 const result=receiptRowsToDraft({rows:[['TEST BRAND RICE','2.00','','TEST BRAND','p'],['TEST BLUE','3.00','','Paper towels','h']]});
 assert.equal(result.items[0].name,'TEST BRAND RICE');assert.equal(result.items[1].name,'TEST BLUE');
});
