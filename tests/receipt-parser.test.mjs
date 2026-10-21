import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReceipt,pantryReceipt,expenseReceipt} from '../receipts/parser.mjs';

test('receipt prices and tax flags never become product names or pantry quantities',()=>{
 const rows=pantryReceipt('FAMILY MARKET\n123 Main Street\n123456 MILK 2L    $5.99 F\nBASMATI RICE 5 kg  18.49H\nBREAD 3.49 A\nSUBTOTAL 27.97\nHST 1.20\nTOTAL 29.17\nVISA 29.17\nTHANK YOU');
 assert.deepEqual(rows.map(({name,qty,unit,amount,quantityKnown,pick})=>({name,qty,unit,amount,quantityKnown,pick})),[
  {name:'MILK',qty:2,unit:'L',amount:'5.99',quantityKnown:true,pick:false},
  {name:'BASMATI RICE',qty:5,unit:'kg',amount:'18.49',quantityKnown:true,pick:false},
  {name:'BREAD',qty:1,unit:'pcs',amount:'3.49',quantityKnown:false,pick:false},
 ]);
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
