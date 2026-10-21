import test from 'node:test';
import assert from 'node:assert/strict';
import {identifyReceiptItems,receiptSection,supportedName} from '../receipts/identity.mjs';
import {documentFrom} from '../receipts/document.mjs';
test('short receipt names remain grounded in the print and retain type, flavour and fat percentage',()=>{
 for(const [name,source] of [['35% Whipping cream','TEST BRAND WHIPPING CREAM 35%'],['Toor dal','TEST BRAND TOOR DAL'],['Split cashews','TEST BRAND CASHEW SPLIT'],['Spicy vegetable burgers','TEST BRAND SPICY VEGGIE BURGERS'],['Nylon gathiya','TEST BRAND NYLON GATHIYA']])assert.ok(supportedName(name,source));
 for(const [name,source] of [['Cream','TEST BRAND WHIPPING CREAM 35%'],['Cashews','TEST BRAND CASHEW SPLIT'],['Rice','TEST BRAND TOOR DAL'],['Toothpaste','TEST BRAND BLUE'],['Red bhakharwadi','RD MINI BHAKHARWADI'],['TEST BRAND','TEST BRAND RICE'],['Whipping','TEST BRAND WHIPPING CREAM'],['Chili','TEST BRAND THAI CHILLI'],['<img src=x>','TEST BRAND RICE']])assert.equal(supportedName(name,source),false);
});
test('unsupported, conflicting or unbound name suggestions keep the receipt label',()=>{
 const rows=[{name:'TEST BRAND BLUE',raw:'TEST BRAND BLUE $2.00',qty:1,unit:'pcs',amount:'2.00'}];
 for(const labels of [[],[{source:'TEST BRAND BLUE $2.00',name:'Paper towels',section:'household'}],[{source:'OTHER LABEL $2.00',name:'Blue',section:'pantry'}],[{source:'TEST BRAND BLUE $2.00',name:'Blue',section:'household'},{source:'TEST BRAND BLUE $2.00',name:'TEST BRAND BLUE',section:'household'}]])assert.equal(identifyReceiptItems(rows,labels)[0].name,'TEST BRAND BLUE');
 const clear=identifyReceiptItems([{name:'TEST BRAND SOAP',raw:'TEST BRAND SOAP $2.00'}],[{source:'TEST BRAND SOAP $2.00',name:'Soap',section:'pantry'}])[0];assert.equal(clear.section,'household');assert.equal(clear.name,'Soap');assert.equal(clear.receiptName,'TEST BRAND SOAP');
});
test('Pantry and Household use product words rather than substrings, with no forced section for opaque labels',()=>{
 for(const name of ['Milk','Green peas','Organic ginger','Chhas masala','Papad','Plastic-free water'])assert.equal(receiptSection(name),'kitchen');
 for(const name of ['Shopping bag','Paper towels','Laundry detergent','Body wash with coconut oil','Pliers','Glass cleaner'])assert.equal(receiptSection(name),'household');
 for(const name of ['GROCERY','TEST BRAND BLUE','TEST BRAND 12X600','Potting mix'])assert.equal(receiptSection(name),'');
});
test('document evidence and product identity remain separate from quantities, amounts and repeated purchases',()=>{
 const lines=['TEST BRAND WHIPPING CREAM 35% $4.00','TEST BRAND WHIPPING CREAM 35% $4.00','TEST BRAND SOAP $3.00','GROCERY $2.00','TOTAL $13.00'];
 const doc=documentFrom([{lines,labels:[{line:0,name:'35% Whipping cream',section:'pantry'},{line:1,name:'35% Whipping cream',section:'pantry'},{line:2,name:'Soap',section:'household'},{line:3,name:'Grocery',section:'unknown'}]}],{name:'synthetic.jpg'},{ai:true});
 assert.equal(doc.items.length,4);assert.deepEqual(doc.items.map(r=>r.name),['35% Whipping cream','35% Whipping cream','Soap','Grocery']);assert.equal(doc.items[0].qty,1);assert.equal(doc.items[0].amount,'4.00');assert.equal(doc.items[0].receiptName,'TEST BRAND WHIPPING CREAM 35%');assert.equal(doc.items[2].section,'household');assert.equal(doc.items[3].section,'');assert.equal(doc.ocr.text,lines.join('\n'));assert.deepEqual(doc.ocr.sections[0].lines,lines);assert.deepEqual(doc.audit.warnings,[]);
});
