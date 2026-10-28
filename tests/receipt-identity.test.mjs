import test from 'node:test';
import assert from 'node:assert/strict';
import {identifyReceiptItems,receiptSection,supportedName,qualifiedReceiptName} from '../receipts/identity.mjs';
import {documentFrom} from '../receipts/document.mjs';
test('short receipt names remain grounded in the print and retain type, flavour and fat percentage',()=>{
 for(const [name,source] of [['35% Whipping cream','TEST BRAND WHIPPING CREAM 35%'],['Toor dal','TEST BRAND TOOR DAL'],['Split cashews','TEST BRAND CASHEW SPLIT'],['Spicy vegetable burgers','TEST BRAND SPICY VEGGIE BURGERS'],['Nylon gathiya','TEST BRAND NYLON GATHIYA']])assert.ok(supportedName(name,source));
 for(const [name,source] of [['Cream','TEST BRAND WHIPPING CREAM 35%'],['Cashews','TEST BRAND CASHEW SPLIT'],['Rice','TEST BRAND TOOR DAL'],['Toothpaste','TEST BRAND BLUE'],['Red bhakharwadi','RD MINI BHAKHARWADI'],['TEST BRAND','TEST BRAND RICE'],['Whipping','TEST BRAND WHIPPING CREAM'],['Chili','TEST BRAND THAI CHILLI'],['<img src=x>','TEST BRAND RICE']])assert.equal(supportedName(name,source),false);
});
test('decimal fat percentages cannot become a different percentage during name shortening',()=>{
 assert.equal(supportedName('3.25% Milk','TEST BRAND MILK 3.25%'),true);
 for(const name of ['25% Milk','3% Milk','Milk'])assert.equal(supportedName(name,'TEST BRAND MILK 3.25%'),false);
 assert.equal(qualifiedReceiptName('Milk','TEST BRAND MILK 3.25%'),'3.25% Milk');
 assert.equal(qualifiedReceiptName('25% Milk','TEST BRAND MILK 3.25%'),'');
});
test('an opaque receipt label can drop only an explicit pack size',()=>{
 assert.equal(qualifiedReceiptName('HOMO','HOMO 4LT'),'HOMO');
 assert.equal(qualifiedReceiptName('ZQXR','ZQXR 4LT'),'ZQXR');
 assert.equal(qualifiedReceiptName('ZQXR','ZQXR X4'),'');
 assert.equal(qualifiedReceiptName('BRAND','BRAND BLUE 4LT'),'');
});
test('opaque brand-only names retain their printed order',()=>{
 assert.equal(qualifiedReceiptName('CLASSIC LAYS','LAYS CLASSIC'),'LAYS CLASSIC');
 assert.equal(qualifiedReceiptName('BLUE BRAND','BRAND BLUE'),'BRAND BLUE');
 assert.equal(qualifiedReceiptName('Roma tomato','TOMATO ROMA'),'Roma tomato');
 assert.equal(qualifiedReceiptName('RUSS potato','POTATO RUSS'),'RUSS potato');
});
test('short names recover only qualifiers printed on the same product and keep opaque labels',()=>{
 assert.equal(qualifiedReceiptName('Cashews','TEST BRAND SPLIT CASHEWS 500G'),'Split Cashews');
 assert.equal(qualifiedReceiptName('Green peas','TEST BRAND ORGANIC GREEN PEAS 1KG'),'Organic Green peas');
 assert.equal(qualifiedReceiptName('Cream','TEST BRAND WHIPPING CREAM 35%'),'35% Whipping Cream');
 for(const name of ['Frozen peas','Whole rice','Paper towels','Blue'])assert.equal(qualifiedReceiptName(name,'TEST BRAND BLUE'),'');
 const row={name:'TEST BRAND BLUE',raw:'TEST BRAND BLUE $2.00',qty:1,unit:'pcs',amount:'2.00'};
 assert.equal(identifyReceiptItems([row],[{source:row.raw,name:'Blue',section:'unknown'}])[0].name,row.name);
 const cream={name:'TEST BRAND WHIPPING CREAM 35%',raw:'TEST BRAND WHIPPING CREAM 35% $4.00',qty:2,unit:'kg',amount:'4.00'};
 const named=identifyReceiptItems([cream],[{source:cream.raw,name:'Cream',section:'pantry'}])[0];
 assert.equal(named.name,'35% Whipping Cream');assert.equal(named.receiptName,cream.name);
 assert.equal(named.qty,2);assert.equal(named.unit,'kg');assert.equal(named.amount,'4.00');assert.equal(named.raw,cream.raw);
 assert.equal(qualifiedReceiptName('PRD VX','TEST BRAND PRD VX'),'');
 assert.equal(qualifiedReceiptName('8 inch T&G plier','TEST 8" T&G PLIER'),'8 inch T&G plier');
 for(const food of ['Jeera puri','Poona mukhwas','Shahi biryani','Paratha'])assert.equal(qualifiedReceiptName(food,'TEST '+food.toUpperCase()),food);
 assert.equal(qualifiedReceiptName('Cut okra','DIVYA OKRA CUT'),'Cut okra');
 assert.equal(qualifiedReceiptName('Cut okra','DIVYA FROZEN OKRA CUT'),'Frozen Cut okra');
 assert.equal(qualifiedReceiptName('Cut okra','DIVYA CARROT CUT'),'');
 assert.equal(qualifiedReceiptName('Bhakharwadi','RD MINI BHAKHARWADI'),'Mini Bhakharwadi');
});
test('unsupported, conflicting or unbound name suggestions keep the receipt label',()=>{
 const rows=[{name:'TEST BRAND BLUE',raw:'TEST BRAND BLUE $2.00',qty:1,unit:'pcs',amount:'2.00'}];
 for(const labels of [[],[{source:'TEST BRAND BLUE $2.00',name:'Paper towels',section:'household'}],[{source:'OTHER LABEL $2.00',name:'Blue',section:'pantry'}],[{source:'TEST BRAND BLUE $2.00',name:'Blue',section:'household'},{source:'TEST BRAND BLUE $2.00',name:'TEST BRAND BLUE',section:'household'}]])assert.equal(identifyReceiptItems(rows,labels)[0].name,'TEST BRAND BLUE');
 const clear=identifyReceiptItems([{name:'TEST BRAND SOAP',raw:'TEST BRAND SOAP $2.00'}],[{source:'TEST BRAND SOAP $2.00',name:'Soap',section:'pantry'}])[0];assert.equal(clear.section,'household');assert.equal(clear.name,'Soap');assert.equal(clear.receiptName,'TEST BRAND SOAP');
});
test('grounded name completion puts missing product types after their ingredient or flavour',()=>{
 assert.equal(qualifiedReceiptName('Mango','TEST BRAND CHUTNEY MANGO'),'Mango chutney');
 assert.equal(qualifiedReceiptName('Tomato','TEST BRAND KETCHUP TOMATO'),'Tomato ketchup');
 assert.equal(qualifiedReceiptName('Tomato','TEST BRAND ORGANIC KETCHUP TOMATO'),'Organic Tomato ketchup');
 const row={name:'TEST BRAND CHUTNEY MANGO',raw:'TEST BRAND CHUTNEY MANGO $6.25',qty:2,unit:'pcs',amount:'6.25'};
 const result=identifyReceiptItems([row],[{source:row.raw,name:'Mango',section:'pantry'}])[0];
 assert.equal(result.name,'Mango chutney');
 assert.deepEqual([result.raw,result.qty,result.unit,result.amount],[row.raw,row.qty,row.unit,row.amount]);
 assert.equal(qualifiedReceiptName('Mango','TEST BRAND CHUTNEY PEACH'),'');
});
test('Pantry and Household use product words rather than substrings, with no forced section for opaque labels',()=>{
 for(const name of ['Milk','Green peas','Organic ginger','Chhas masala','Papad','Plastic-free water','TEST THR CHS RCH','TEST SSME BN','CORRIENDER EACH'])assert.equal(receiptSection(name),'kitchen');
 for(const name of ['Shopping bag','Paper towels','Laundry detergent','Body wash with coconut oil','Pliers','Glass cleaner'])assert.equal(receiptSection(name),'household');
 for(const name of ['GROCERY','TEST BRAND BLUE','TEST BRAND 12X600','Potting mix','TEST CRFLY CRFTD'])assert.equal(receiptSection(name),'');
});
test('document evidence and product identity remain separate from quantities, amounts and repeated purchases',()=>{
 const lines=['TEST BRAND WHIPPING CREAM 35% $4.00','TEST BRAND WHIPPING CREAM 35% $4.00','TEST BRAND SOAP $3.00','GROCERY $2.00','TOTAL $13.00'];
 const doc=documentFrom([{lines,labels:[{line:0,name:'35% Whipping cream',section:'pantry'},{line:1,name:'35% Whipping cream',section:'pantry'},{line:2,name:'Soap',section:'household'},{line:3,name:'Grocery',section:'unknown'}]}],{name:'synthetic.jpg'},{ai:true});
 assert.equal(doc.items.length,4);assert.deepEqual(doc.items.map(r=>r.name),['35% Whipping cream','35% Whipping cream','Soap','Grocery']);assert.equal(doc.items[0].qty,1);assert.equal(doc.items[0].amount,'4.00');assert.equal(doc.items[0].receiptName,'TEST BRAND WHIPPING CREAM 35%');assert.equal(doc.items[2].section,'household');assert.equal(doc.items[3].section,'');assert.equal(doc.ocr.text,lines.join('\n'));assert.deepEqual(doc.ocr.sections[0].lines,lines);assert.deepEqual(doc.audit.warnings,[]);
});
