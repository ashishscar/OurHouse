import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReceipt,parseReceiptFields,pantryReceipt,expenseReceipt,auditReceipt} from '../receipts/parser.mjs';

test('hyphenated stock numbers stay separate from names and measurements',()=>{
 const rows=parseReceipt('527-8910-2 TEST STORAGE BOX $7.25\n3 638-1029-4 TEST TOWEL $9.00');
 assert.deepEqual(rows.map(({name,itemNumber,qty,unit,amount})=>({name,itemNumber,qty,unit,amount})),[
  {name:'TEST STORAGE BOX',itemNumber:'527-8910-2',qty:1,unit:'pcs',amount:'7.25'},
  {name:'TEST TOWEL',itemNumber:'638-1029-4',qty:3,unit:'pcs',amount:'9.00'},
 ]);
 const other=parseReceipt('2026-10-24 TEST NOTE $1.00\n555-010-1234 TEST CONTACT $2.00');
 assert.equal(other[0].itemNumber,undefined);assert.ok(other[0].name.startsWith('2026-10-24'));
 assert.equal(other[1].itemNumber,undefined);assert.ok(other[1].name.startsWith('555-010-1234'));
});

test('OCR-damaged numeric item codes do not become product names',()=>{
 const rows=parseReceiptFields({label:'057379(501 TEST WATERS',amount:'4.75'});
 assert.equal(rows.name,'TEST WATERS');assert.equal(rows.raw,'057379(501 TEST WATERS $4.75');
 const lines=parseReceipt('0603838:100 TEST CORN $4.99\n252411V TEST PEPPER $10.99\n*4087 TEST TOMATO $3.00');
 assert.deepEqual(lines.map(r=>r.name),['TEST CORN','TEST PEPPER','TEST TOMATO']);
 assert.equal(parseReceipt('2026-10-24 TEST NOTE $1.00')[0].name,'2026-10-24 TEST NOTE');
 assert.equal(parseReceipt('7UP TEST SODA $2.00')[0].name,'7UP TEST SODA');
});

test('a wrapped package size below the current priced product adds stock without changing price',()=>{
 const rows=parseReceipt('TEST CRACKERS $3.49\n400G\nTEST OATS $6.00\n3 @ $2.00\n250GM\nTOTAL $9.49');
 assert.deepEqual(rows.map(({name,qty,unit,packCount,amount})=>({name,qty,unit,packCount,amount})),[
  {name:'TEST CRACKERS',qty:400,unit:'g',packCount:1,amount:'3.49'},
  {name:'TEST OATS',qty:750,unit:'g',packCount:3,amount:'6.00'},
 ]);
 assert.equal(rows[0].raw,'TEST CRACKERS $3.49\n400G');
 const conflict=parseReceipt('TEST MILK 2L $6.00\n1L')[0];
 assert.equal(conflict.qty,2);assert.equal(conflict.unit,'L');assert.match(conflict.warning,/conflicts/);assert.equal(conflict.unmatchedQuantity,'1L');
 const separated=parseReceipt('TEST SOAP $2.00\nDiscount -$0.25\n400G\nTEST PEARS $3.00');
 assert.equal(separated[0].qty,1);assert.equal(separated[1].qty,1);
});

test('receipt prices and tax flags never become product names or pantry quantities',()=>{
 const rows=pantryReceipt('FAMILY MARKET\n123 Main Street\n123456 MILK 2L    $5.99 F\nBASMATI RICE 5 kg  18.49H\nBREAD 3.49 A\nSUBTOTAL 27.97\nHST 1.20\nTOTAL 29.17\nVISA 29.17\nTHANK YOU');
 assert.deepEqual(rows.map(({name,qty,unit,amount,quantityKnown,pick})=>({name,qty,unit,amount,quantityKnown,pick})),[
  {name:'MILK',qty:2,unit:'L',amount:'5.99',quantityKnown:true,pick:false},
  {name:'BASMATI RICE',qty:5,unit:'kg',amount:'18.49',quantityKnown:true,pick:false},
  {name:'BREAD',qty:1,unit:'pcs',amount:'3.49',quantityKnown:false,pick:false},
 ]);
 const reversedTax=parseReceipt('TEST SOAP $2.00\n13% HST $0.26\nTOTAL $2.26');
 assert.deepEqual(reversedTax.map(({name,amount})=>({name,amount})),[{name:'TEST SOAP',amount:'2.00'}]);
 assert.equal(parseReceipt('SOUR CREAM 13% $4.00')[0].name,'SOUR CREAM 13%');
});
test('counts, weights, decimal commas and currency-prefixed whole prices are distinct fields',()=>{
 const rows=parseReceipt('2 x YOGURT 500g 4.98\nAPPLES 3 @ 0.99 2.97 T\nTOMATOES 0.742 kg @ 2.99/kg 2.22 F\nTOFU 400 g €3,49\nLENTILS 1kg ₹120\nRICE 5 kg Rs. 450.00');
 assert.deepEqual(rows.map(({name,qty,unit,amount})=>({name,qty,unit,amount})),[
  {name:'YOGURT',qty:1000,unit:'g',amount:'4.98'},
  {name:'APPLES',qty:3,unit:'pcs',amount:'2.97'},
  {name:'TOMATOES',qty:.742,unit:'kg',amount:'2.22'},
  {name:'TOFU',qty:400,unit:'g',amount:'3.49'},
  {name:'LENTILS',qty:1,unit:'kg',amount:'120.00'},
  {name:'RICE',qty:5,unit:'kg',amount:'450.00'},
 ]);
});
test('wrapped item and weight lines attach to the product while repeated purchases stay separate',()=>{
 const rows=parseReceipt('BANANAS\n0.742 kg @ 2.99/kg 2.22 F\nMILK 2L\n5.99 F\nTOFU 3.49\nTOFU 3.49\nGST 0.20\nDISCOUNT -1.00\n2 @ 1.00 2.00');
 assert.equal(rows.length,4);assert.equal(rows[0].name,'BANANAS');assert.equal(rows[0].qty,.742);assert.equal(rows[0].unit,'kg');assert.equal(rows[1].name,'MILK');assert.equal(rows[1].qty,2);assert.equal(rows[1].amount,'5.99');assert.equal(rows[2].name,'TOFU');assert.equal(rows[3].name,'TOFU');
});
test('expense drafts use the line total, omit receipt metadata, and skip ambiguous numeric columns',()=>{
 const text='MILK 2L 5.99 F\nRICE 2 @ 3.00 6.00\nBREAD 2 1.99 3.98\nTOTAL 15.97\nCARD 15.97';
 const rows=expenseReceipt(text);assert.deepEqual(rows.map(({name,amount})=>({name,amount})),[{name:'MILK',amount:'5.99'},{name:'RICE',amount:'6.00'}]);assert.equal(rows[1].raw,'RICE 2 @ 3.00 6.00');
});

test('wrapped product names retain the full flavour, size and leading fat qualifier',()=>{
 const rows=parseReceipt('TEST BRAND PICKLE MASALA 250G\nSWEET\n2 @ $4.49 $8.98\nTEST BRAND SPICY VEGGIE BURGERS\n400G $4.99\n35%\nTEST BRAND WHIPPING CREAM $8.99\nTOTAL $22.96');
 assert.equal(rows.length,3);
 assert.equal(rows[0].name,'TEST BRAND PICKLE MASALA SWEET');
 assert.equal(rows[0].qty,500);
 assert.equal(rows[0].raw,'TEST BRAND PICKLE MASALA 250G\nSWEET\n2 @ $4.49 $8.98');
 assert.equal(rows[1].name,'TEST BRAND SPICY VEGGIE BURGERS');
 assert.equal(rows[1].qty,400);
 assert.equal(rows[2].name,'35% TEST BRAND WHIPPING CREAM');
});

test('a leading count belongs to the next product only when its printed amount supports it',()=>{
 const rows=parseReceipt('TEST BRAND CHEESE $13.99\n5 @ $5.99\nTEST BRAND SOUR CREAM $29.95\nTOTAL $43.94');
 assert.equal(rows.length,2);
 assert.equal(rows[0].qty,1);
 assert.equal(rows[0].amount,'13.99');
 assert.equal(rows[0].warning,undefined);
 assert.equal(rows[1].qty,5);
 assert.equal(rows[1].quantityKnown,true);
 assert.equal(rows[1].amount,'29.95');
 assert.equal(rows[1].raw,'5 @ $5.99\nTEST BRAND SOUR CREAM $29.95');
 assert.equal(rows[1].warning,undefined);
 const uncertain=parseReceipt('TEST BRAND CHEESE $13.99\n5 @ $5.99\nTEST BRAND SOUR CREAM $28.95');
 assert.ok(uncertain[0].warning);
 assert.equal(uncertain[0].qty,1);
 assert.equal(uncertain[1].qty,1);
 const first=parseReceipt('5 @ $5.99\nTEST BRAND SOUR CREAM $29.95');
 assert.equal(first[0].qty,5);
 assert.equal(first[0].amount,'29.95');
});

test('tax codes and each-price rows stay metadata, and sale notices never become stock',()=>{
 const rows=parseReceipt('TEST BRAND SNACK 200G\n13 @ $1.69ea. $21.97 Tx1\nTEST BRAND MILK $3.59\nFinal Sale $3.59\nSHOPPING BAG $0.35 TX1\nSUB TOTAL\nDUPLICATED FOOTER PRODUCT $1.00');
 assert.equal(rows.length,3);
 assert.equal(rows[0].name,'TEST BRAND SNACK');
 assert.equal(rows[0].qty,2600);
 assert.equal(rows[0].packCount,13);
 assert.equal(rows[0].amount,'21.97');
 assert.equal(rows[1].name,'TEST BRAND MILK');
 assert.equal(rows[2].name,'SHOPPING BAG');
 assert.equal(rows[2].amount,'0.35');
});

test('a printed per-one-unit rate does not discard the actual purchased weight',()=>{
 const rows=parseReceipt('PAPAYA(LB) $8.12\n3.26 lb @ $2.49 per 1 lb\nGINGER $2.79\n1 kg @ $2.79 per 1 kg');
 assert.equal(rows[0].qty,1.478711);assert.equal(rows[0].unit,'kg');assert.equal(rows[0].quantityKnown,true);assert.equal(rows[1].qty,1);assert.equal(rows[1].unit,'kg');
});

test('an interposed discount does not discard a uniquely matching pack quantity',()=>{
 for(const discount of ['-$1.14','Coupon -$1.14','$1.14-']){
  const rows=parseReceipt('TEST OATS 250G $9.51\n'+discount+'\n3 @ $3.17\nTEST PEARS $4.00\nSUBTOTAL $12.37');
  assert.equal(rows.length,2);assert.equal(rows[0].qty,750);assert.equal(rows[0].unit,'g');
  assert.equal(rows[0].packCount,3);assert.equal(rows[0].amount,'9.51');assert.equal(rows[0].warning,undefined);
  assert.ok(rows[0].raw.endsWith('3 @ $3.17'));assert.equal(rows[1].qty,1);
 }
 const end=parseReceipt('TEST OATS 250G $9.51\n-$1.14\n3 @ $3.17');
 assert.equal(end[0].qty,750);
});

test('a quantity after a discount can belong to the next product; equal totals remain ambiguous',()=>{
 const next=parseReceipt('TEST SOAP $5.00\n-$1.00\n2 @ $3.17\nTEST RICE 1KG $6.34');
 assert.equal(next[0].qty,1);assert.equal(next[1].qty,2);assert.equal(next[1].unit,'kg');
 const both=parseReceipt('TEST SOAP $6.34\n-$1.00\n2 @ $3.17\nTEST RICE 1KG $6.34');
 assert.equal(both[0].qty,1);assert.equal(both[1].qty,1);
 for(const row of both){assert.match(row.warning,/matches two/);assert.equal(row.unmatchedQuantity,'2 @ $3.17');}
 const neither=parseReceipt('TEST SOAP $5.00\n-$1.00\n2 @ $3.17\nTEST RICE 1KG $7.00');
 assert.equal(neither[0].qty,1);assert.equal(neither[1].qty,1);assert.ok(neither[0].warning);
});

test('discount quantity recovery stops at a heading, return line or sale notice',()=>{
 for(const boundary of ['23-FROZEN','Final Sale','RETURNED PRODUCT -$1.14','Regular price $12.00']){
  const rows=parseReceipt('TEST OATS 250G $9.51\n'+boundary+'\n3 @ $3.17\nTEST PEARS $4.00');
  assert.equal(rows[0].qty,250);assert.equal(rows[1].qty,1);
 }
});

test('a partial basket count never replaces the whole receipt count',()=>{
 const text='TEST OATS $3.00\n*** BOB Count 1 ***\nTEST RICE $4.00\nSUBTOTAL $7.00';
 const partial=auditReceipt(text);
 assert.equal(partial.partialBasketCount,1);assert.equal(partial.productCount,undefined);assert.equal(partial.packCount,2);assert.deepEqual(partial.warnings,[]);
 const whole=auditReceipt(text+'\nNumber of items: 2');
 assert.equal(whole.partialBasketCount,1);assert.equal(whole.productCount,2);assert.deepEqual(whole.warnings,[]);
 const missing=auditReceipt(text+'\nNumber of items: 3');
 assert.match(missing.warnings[0],/3 purchased units/);
});
