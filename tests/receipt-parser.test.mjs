import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReceipt,parseReceiptFields,pantryReceipt,expenseReceipt,auditReceipt} from '../receipts/parser.mjs';
import {documentFrom} from '../receipts/document.mjs';

test('a receipt deposit is a bill charge, not stock or an extra purchased item',()=>{
 const lines=['FRESHCO','Yog Drink Ayran $1.79 HC','Simply Chy Limeade $3.19 H','+Deposit $0.10','Cherries Red $6.16 C','0.935 kg @ $6.59 / kg','INSTANT SAVINGS','-$1.00','SUBTOTAL $10.24','3','NUMBER OF ITEMS'];
 const doc=documentFrom([{lines,native:true}],{name:'synthetic-freshco.jpg'},{ai:true});
 assert.deepEqual(doc.items.map(row=>[row.receiptName,row.amount,row.qty,row.unit,row.section]),[
  ['Yog Drink Ayran','1.79',1,'pcs','kitchen'],['Simply Chy Limeade','3.19',1,'pcs','kitchen'],['Cherries Red','6.16',0.935,'kg','kitchen']
 ]);
 assert.equal(doc.audit.itemSum,'11.14');
 assert.equal(doc.audit.charges,'0.10');
 assert.equal(doc.audit.discounts,'1.00');
 assert.equal(doc.audit.netSum,'10.24');
 assert.equal(doc.audit.productCount,3);
 assert.equal(doc.audit.packCount,3);
 assert.deepEqual(doc.audit.warnings,[]);
 assert.equal(doc.ocr.text,lines.join('\n'));
});

test('Costco item codes, OCR O/0, discounts and product types survive a whole receipt',()=>{
 const lines=[
  'OSTCO WHOLESALE',
  '430 XL EGGS 9.00',
  '1346909 KS ORG 2% 4L 10.00',
  '2919781 Z0A 25.00 H',
  '2064222 TPD/2919781 4.00- H',
  '2908438 BIOSTEEL 30.00 H',
  'SUBTOTAL 70.00',
  'TOTAL 72.00',
  'TOTAL NUMBER OF ITEMS SOLD = 4',
  'TOTAL DISCOUNT(S) $4.00',
 ];
 const doc=documentFrom([{lines,native:true}], 'synthetic-costco', {ai:true});
 assert.deepEqual(doc.items.map(({name,qty,unit,section,itemNumber})=>({name,qty,unit,section,itemNumber})),[
  {name:'XL EGGS',qty:1,unit:'pcs',section:'kitchen',itemNumber:'430'},
  {name:'Organic milk 2%',qty:4,unit:'L',section:'kitchen',itemNumber:'1346909'},
  {name:'Energy drink',qty:1,unit:'pcs',section:'kitchen',itemNumber:'2919781'},
  {name:'Sports drink',qty:1,unit:'pcs',section:'kitchen',itemNumber:'2908438'},
 ]);
 assert.deepEqual(doc.items.map(item=>item.amount),['9.00','10.00','25.00','30.00']);
 assert.equal(doc.items[2].receiptName,'Z0A');
 assert.equal(doc.audit.packCount,4);
 assert.equal(doc.audit.netSum,'70.00');
 assert.equal(doc.audit.total,'72.00');
 assert.deepEqual(doc.warnings,[]);
});

test('a priced count line before its label belongs to the following purchase',()=>{
 const lines=['STCC','VHOLESALE','***START OF PRE-SCANNED ITEMS***','1346909 KS ORG 2% 4L 10.29','2 @ 9.69 19.38','430 XL EGGS','***END OF PRE-SCANNED ITEMS***','TOTAL NUMBER OF PRE-SCANNED ITEMS= 3','SUBTOTAL 29.67'];
 const doc=documentFrom([{lines,native:true}], 'synthetic-forward-rate', {ai:true});
 assert.deepEqual(doc.items.map(({name,amount,qty,unit,section})=>({name,amount,qty,unit,section})),[
  {name:'Organic milk 2%',amount:'10.29',qty:4,unit:'L',section:'kitchen'},
  {name:'XL EGGS',amount:'19.38',qty:2,unit:'pcs',section:'kitchen'},
 ]);
 assert.equal(doc.audit.packCount,3);
 assert.deepEqual(doc.warnings,[]);
});

test('a grocery savings footer cannot become products or erase pack rates',()=>{
 const lines=['FRESHCO','Tomatos Diced No Slt $11.94 C','6 @ 1/ $1.99','YOU SAVED $4.20','Milk 2% 1X4L $12.88 C','2 @ 1/ $6.44','YOUR DISCOUNT $1.35','Vinegar $1.69 C','INSTANT SAVINGS -$2.00','CocaCola Zero Can $25.96×HC','2 @ $12.98','YOU PRICE MATCHED & SAVED $6.02','SUBTOTAL $49.12','TOTAL $50.00'];
 const doc=documentFrom([{lines,native:true}], 'synthetic-grocery-savings', {ai:true});
 assert.deepEqual(doc.items.map(({amount,qty,unit,section})=>({amount,qty,unit,section})),[
  {amount:'11.94',qty:6,unit:'pcs',section:'kitchen'},
  {amount:'12.88',qty:8,unit:'L',section:'kitchen'},
  {amount:'1.69',qty:1,unit:'pcs',section:'kitchen'},
  {amount:'25.96',qty:2,unit:'pcs',section:'kitchen'},
 ]);
 assert.equal(doc.audit.discounts,'3.35');
 assert.equal(doc.audit.netSum,'49.12');
 assert.deepEqual(doc.warnings,[]);
});

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

test('a numeric item code before PC is not a billion-piece package',()=>{
 const row=parseReceiptFields({label:'06038389781 PC GIGANTICO BUN MRJ',amount:'12.00',quantityLine:'4 @ $3.00 MRJ'});
 assert.equal(row.name,'PC GIGANTICO BUN');
 assert.equal(row.itemNumber,'06038389781');
 assert.equal(row.qty,4);
 assert.equal(row.unit,'pcs');
 assert.equal(row.packSize,undefined);
 assert.equal(row.warning,undefined);
});

test('a terminal OCR dot after a price does not merge adjacent purchases',()=>{
 const rows=parseReceipt('4032 WMELON RED SDLS MRJ 3.44.\n(2)4090 SPINACH BUNCHED MRJ\n2 @ $2.79 5.58\nSUBTOTAL 9.02');
 assert.deepEqual(rows.map(({name,amount,qty})=>({name,amount,qty})),[
  {name:'WMELON RED SDLS',amount:'3.44',qty:1},
  {name:'SPINACH BUNCHED',amount:'5.58',qty:2},
 ]);
 const offers=parseReceipt("TEST YOGURT 5.99\nIn-Sture Offers 500 Pts\n(3)18275700051 BRAR'S MALAI PAN MRJ\n3 @ $6.29 18.87\nSUBTOTAL 24.86");
 assert.deepEqual(offers.map(({name,amount})=>({name,amount})),[
  {name:'TEST YOGURT',amount:'5.99'},
  {name:"BRAR'S MALAI PAN",amount:'18.87'},
 ]);
});

test('OCR letter O inside a printed metric pack size can be read as zero',()=>{
 const rows=parseReceipt('MTR RICE IDLI MIX 50OGM 13.16\n4 @ $3.29\nSESAME SEED BROWN 80OGM 5.49\nSESAME SEED BROWN 8O0GM 5.49\nCROWN 20OZ OATS 4.99');
 assert.deepEqual(rows.map(({name,qty,unit})=>({name,qty,unit})),[
  {name:'MTR RICE IDLI MIX',qty:2000,unit:'g'},
  {name:'SESAME SEED BROWN',qty:800,unit:'g'},
  {name:'SESAME SEED BROWN',qty:800,unit:'g'},
  {name:'CROWN OATS',qty:566.990463,unit:'g'},
 ]);
 assert.match(rows[0].raw,/50OGM/);
});

test('a single OCR-damaged tax marker after a printed price retains the purchase',()=>{
 const rows=parseReceipt('3458556 TIDE COLDWTR 27.99 H\n3458556 TIDE COLDWTR 27.99 工\nSUBTOTAL 55.98');
 assert.deepEqual(rows.map(({name,amount})=>({name,amount})),[
  {name:'TIDE COLDWTR',amount:'27.99'},
  {name:'TIDE COLDWTR',amount:'27.99'},
 ]);
 assert.match(rows[1].raw,/27\.99 工/);
});

test('OCR-damaged numeric item codes do not become product names',()=>{
 const rows=parseReceiptFields({label:'057379(501 TEST WATERS',amount:'4.75'});
 assert.equal(rows.name,'TEST WATERS');assert.equal(rows.raw,'057379(501 TEST WATERS $4.75');
 const lines=parseReceipt('0603838:100 TEST CORN $4.99\n252411V TEST PEPPER $10.99\n*4087 TEST TOMATO $3.00');
 assert.deepEqual(lines.map(r=>r.name),['TEST CORN','TEST PEPPER','TEST TOMATO']);
 assert.equal(parseReceipt('(2)0333#367101 TEST CUCUMBER $2.58')[0].name,'TEST CUCUMBER');
 assert.equal(parseReceipt('2026-10-24 TEST NOTE $1.00')[0].name,'2026-10-24 TEST NOTE');
 assert.equal(parseReceipt('7UP TEST SODA $2.00')[0].name,'7UP TEST SODA');
 const slash=parseReceipt('98765432/123 TEST OATS $3.99\nTOTAL $3.99')[0];
 assert.equal(slash.name,'TEST OATS');
 assert.equal(slash.itemNumber,'98765432/123');
 assert.equal(slash.amount,'3.99');
 assert.equal(slash.raw,'98765432/123 TEST OATS $3.99');
 assert.equal(parseReceipt('2026/10/24 TEST NOTE $1.00')[0].name,'2026/10/24 TEST NOTE');
});

test('a digit-damaged department heading stays separate from the next priced product',()=>{
 const text='21-6ROCERY\n03904700115 TEST SHORTBREAD $5.49\n0333836!162 TEST ROMAINE $4.99\n41-HOME\n123456 TEST SOAP $2.49\nSUBTOTAL $12.97';
 const rows=parseReceipt(text);
 assert.deepEqual(rows.map(({name,amount,department})=>({name,amount,department})),[
  {name:'TEST SHORTBREAD',amount:'5.49',department:'kitchen'},
  {name:'TEST ROMAINE',amount:'4.99',department:'kitchen'},
  {name:'TEST SOAP',amount:'2.49',department:'household'},
 ]);
 assert.equal(rows[1].raw,'0333836!162 TEST ROMAINE $4.99');
});

test('repeated OCR decoration cannot merge a basket heading into the first priced product',()=>{
 const rows=parseReceipt('哈哈哈哈哈哈 BASKET HEADER\n1234567 TEST OATS $4.25\n1234568 TEST RICE $5.50\nTOTAL $9.75');
 assert.deepEqual(rows.map(({name,amount})=>({name,amount})),[
  {name:'TEST OATS',amount:'4.25'},
  {name:'TEST RICE',amount:'5.50'},
 ]);
});

test('a currency glyph read as s is repaired only when quantity and line total reconcile',()=>{
 const rows=parseReceipt('TEST MALAI PAN\n3 @ s6.29 18.87\nTEST YOGURT 5.99\nTOTAL 24.86');
 assert.deepEqual(rows.map(({name,amount,qty})=>({name,amount,qty})),[
  {name:'TEST MALAI PAN',amount:'18.87',qty:3},
  {name:'TEST YOGURT',amount:'5.99',qty:1},
 ]);
 const structured=parseReceiptFields({label:'TEST MALAI PAN',amount:'18.87',quantityLine:'3 @ s6.29'});
 assert.equal(structured.qty,3);
 assert.equal(structured.unitPrice,'6.29');
 assert.equal(structured.warning,undefined);
 const mismatch=parseReceiptFields({label:'TEST MALAI PAN',amount:'17.87',quantityLine:'3 @ s6.29'});
 assert.equal(mismatch.qty,1);
 assert.match(mismatch.warning,/not understood/);
 assert.deepEqual(parseReceipt('TEST MALAI PAN\n3 @ s6.29 17.87\nTEST YOGURT 5.99').map(row=>row.name),['TEST YOGURT']);
});

test('a printed POS marker after the unit price does not hide purchased quantity',()=>{
 const row=parseReceiptFields({label:'SPINACH BUNCHED',amount:'5.58',quantityLine:'2 @ $2.79 MRJ'});
 assert.equal(row.qty,2);assert.equal(row.unit,'pcs');assert.equal(row.unitPrice,'2.79');assert.equal(row.warning,undefined);
 assert.match(row.raw,/2 @ \$2\.79 MRJ/);
 assert.deepEqual(parseReceipt('SPINACH BUNCHED 5.58\n2 @ $2.79 MRJ\nTOTAL 5.58').map(item=>[item.name,item.qty,item.amount]),[['SPINACH BUNCHED',2,'5.58']]);
 const unknown=parseReceiptFields({label:'SPINACH BUNCHED',amount:'5.58',quantityLine:'2 @ $2.79 EXTRA'});
 assert.equal(unknown.qty,1);assert.match(unknown.warning,/not understood/);
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
test('wrapped repeated products keep every price and do not absorb the receipt heading',()=>{
 const text='FAMILY MARKET\n123 Main Street\n35%\n$8.99\nTEST WHIPPING CREAM\n35%\nTEST WHIPPING CREAM $8.99\nTEST SPICY SNACK\nTEST CHEVDO $1.69 Tx1\nTEST SPICY SNACK\nTEST CHEVDO $1.69 Tx]\nTEST SPICY SNACK\nTEST CHEVDO\n13 @ $1.69ea. $21.97 Tx1\nSUBTOTAL $43.33\nTOTAL $43.33';
 const rows=parseReceipt(text);
 assert.deepEqual(rows.map(({name,amount,qty})=>({name,amount,qty})),[
  {name:'35% TEST WHIPPING CREAM',amount:'8.99',qty:1},
  {name:'35% TEST WHIPPING CREAM',amount:'8.99',qty:1},
  {name:'TEST SPICY SNACK TEST CHEVDO',amount:'1.69',qty:1},
  {name:'TEST SPICY SNACK TEST CHEVDO',amount:'1.69',qty:1},
  {name:'TEST SPICY SNACK TEST CHEVDO',amount:'21.97',qty:13},
 ]);
 assert.deepEqual(auditReceipt(text,rows).warnings,[]);
 assert.equal(rows[3].raw,'TEST SPICY SNACK\nTEST CHEVDO $1.69 Tx]');
 const incomplete=parseReceipt('35%\n$8.99\nTEST MILK $5.00\nTOTAL $13.99');
 assert.deepEqual(incomplete.map(({name,amount})=>({name,amount})),[{name:'TEST MILK',amount:'5.00'}]);
});

test('tilted OCR price-first percent rows keep each independent purchase',()=>{
 const text='$8.99\n35%\nTEST WHIPPING CREAM\n$8.99\n35%\nTEST WHIPPING CREAM\n35%\nTEST WHIPPING CREAM $8.99\nSUBTOTAL $26.97';
 const rows=parseReceipt(text);
 assert.deepEqual(rows.map(({name,amount,qty})=>({name,amount,qty})),Array(3).fill({name:'35% TEST WHIPPING CREAM',amount:'8.99',qty:1}));
 assert.equal(rows[0].raw,'35%\n$8.99\nTEST WHIPPING CREAM');
 assert.deepEqual(auditReceipt(text,rows).warnings,[]);
 const interrupted=parseReceipt('$8.99\n35%\nSUBTOTAL $8.99\nTEST WHIPPING CREAM $8.99');
 assert.equal(interrupted.length,1);
 assert.equal(interrupted[0].name,'TEST WHIPPING CREAM');
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

test('a standalone gift card activation notice cannot join the next purchase',()=>{
 const text='SAMPLE STORE\nLCBO CARD $400.00\nACTIVATED\n2773717 MONSTER VRTY $44.99\nSUBTOTAL $444.99';
 const rows=parseReceipt(text);
 assert.deepEqual(rows.map(({name,amount})=>[name,amount]),[['LCBO CARD','400.00'],['MONSTER VRTY','44.99']]);
 assert.deepEqual(auditReceipt(text,rows).warnings,[]);
 const product=parseReceipt('ACTIVATED CHARCOAL $3.99\nSUBTOTAL $3.99');
 assert.equal(product[0].name,'ACTIVATED CHARCOAL');
});

test('a positive OCR amount on an instant savings line still reduces the basket subtotal',()=>{
 const text='BATH TISSUE $17.99\nINSTANT SAVINGS $6.00\nYOU SAVED $2.00\nSOFT DRINK $17.98\n-$2.00\nINSTANT SAVINGS\nSPRITE ZERO $53.94\nINSTANT SAVINGS\n-$6.00\nSUBTOTAL $75.91';
 const rows=parseReceipt(text),audit=auditReceipt(text,rows);
 assert.deepEqual(rows.map(({name,amount})=>[name,amount]),[['BATH TISSUE','17.99'],['SOFT DRINK','17.98'],['SPRITE ZERO','53.94']]);
 assert.equal(audit.discounts,'14.00');
 assert.equal(audit.netSum,'75.91');
 assert.deepEqual(audit.warnings,[]);
});

test('a loyalty points footer cannot become another purchase when its subtotal is damaged',()=>{
 const text='BREAD $2.75\nBonus Points 1 Pts\nFRUIT 400 Pts\n200 Pts\nSAMPLE BREAD 300 Pts\naVTES 34.56\nSAMPLE COOKIES\nSUBTOTAL\nTOTAL 35.12';
 assert.deepEqual(parseReceipt(text).map(row=>[row.name,row.amount]),[['BREAD','2.75']]);
 const offer='OATS $3.00\nBonus Points 100 Pts\nRICE $4.00\nSUBTOTAL $7.00';
 assert.deepEqual(parseReceipt(offer).map(row=>row.name),['OATS','RICE']);
});

test('a printed item beside a merged points offer keeps its own supported count and amount',()=>{
 const text='MILK $3.99\nX8900T005fers TEST OATS BAR MRJ 500 Pts\n(3)12345678901\n3 @ $2.13 6.39\nYOGURT $5.99\nSUBTOTAL $16.37';
 const rows=parseReceipt(text);
 assert.deepEqual(rows.map(row=>[row.name,row.amount,row.qty]),[['MILK','3.99',1],['TEST OATS BAR','6.39',3],['YOGURT','5.99',1]]);
 assert.match(rows[1].raw,/500 Pts/);
 assert.match(rows[1].raw,/\(3\)12345678901/);
 const noPrice=parseReceipt('MILK $3.99\nX8900T005fers TEST OATS BAR MRJ 500 Pts\n(3)12345678901\n3 @ $2.13\nYOGURT $5.99');
 assert.deepEqual(noPrice.map(row=>row.name),['MILK','YOGURT']);
 assert.deepEqual(parseReceipt('MILK $3.99\nIn-Stare Offers 500 Pts\nRICE $4.00\nSUBTOTAL $7.99').map(row=>row.name),['MILK','RICE']);
});
