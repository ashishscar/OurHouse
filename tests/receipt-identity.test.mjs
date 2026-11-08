import test from 'node:test';
import assert from 'node:assert/strict';
import {identifyReceiptItems,receiptSection,supportedName,qualifiedReceiptName} from '../receipts/identity.mjs';
import {documentFrom} from '../receipts/document.mjs';
import {parseReceipt,auditReceipt} from '../receipts/parser.mjs';
test('verified food types are pantry even when a receipt omits the word snack',()=>{
 for(const label of ['DP SPICY VEGGIE BURGERS','DP ORIGINAL KHARI','MUZDA MAKHANIA','BALAJI CRUNCHEM','BR 5050 SWEET&SALTY FAMILY','COKE DIET'])assert.equal(receiptSection(label),'kitchen',label);
 for(const label of ['BR 5050 FAMILY','UNKNOWN SWEET&SALTY FAMILY','COLDWTR CLEANER'])assert.notEqual(receiptSection(label),'kitchen',label);
});
test('French fish and meat labels remain excluded while vegetarian labels can enter Pantry',()=>{
 const rows=[
  {name:'TEST THON',raw:'TEST THON 2,40 €',amount:'2.40',qty:1,unit:'pcs'},
  {name:'TEST TABOULE POULE',raw:'TEST TABOULE POULE 3,20 €',amount:'3.20',qty:1,unit:'pcs'},
  {name:'TEST CHIPOS VEGETALES',raw:'TEST CHIPOS VEGETALES 4,10 €',amount:'4.10',qty:1,unit:'pcs'}
 ];
 const named=identifyReceiptItems(rows,[],'SAMPLE MARCHE');
 assert.deepEqual(named.map(row=>[row.section,Boolean(row.excludedFromPantry)]),[['',true],['',true],['kitchen',false]]);
 assert.equal(qualifiedReceiptName('Legumes','TEST BOUILL LEGUMES'),'Bouill Legumes');
 assert.equal(qualifiedReceiptName('Bouill','TEST BOUILL LEGUMES'),'');
});
test('French receipt departments and literal OCR rate lines keep food, wine and household separate',()=>{
 const text='CHAMPAGNES MOUSSEUX\n12.00 € 13\nSAMPLE CUVEE 75CL\n2 X 6.00 UF\nCONDIMENTS-SAUCES FROIDES\nOLIVES 3.00 € 11\n1 X 3.00 EUR\nMOBILIER\nCINTRE 2.00 € 13\n1 X 2.00 EUR\nVINS AOC\nSAMPLE BOTTLE RG 75CL 9.00 € 13\n1 X 9.00 EUR\nTOTL [5] Articles 26.00 €\nSOUS-TOTAL 22.00 € 4.00 B\nTOTAL TVA 4.00 B';
 const items=identifyReceiptItems(parseReceipt(text),[],text);
 assert.deepEqual(items.map(item=>[item.amount,item.section,item.packCount]),[['12.00','',2],['3.00','kitchen',1],['2.00','household',1],['9.00','',1]]);
 assert.deepEqual(auditReceipt(text,items).warnings,[]);
 assert.equal(auditReceipt(text,items).subtotal,undefined);
 assert.equal(receiptSection('ÉSPRESSO'),'kitchen');
 assert.equal(receiptSection('ESPRES SPLEND.CAPS'),'kitchen');
 assert.equal(receiptSection('RI2 BASMAI U BIO'),'kitchen');
});
test('short receipt names remain grounded in the print and retain type, flavour and fat percentage',()=>{
 for(const [name,source] of [['35% Whipping cream','TEST BRAND WHIPPING CREAM 35%'],['Toor dal','TEST BRAND TOOR DAL'],['Split cashews','TEST BRAND CASHEW SPLIT'],['Spicy vegetable burgers','TEST BRAND SPICY VEGGIE BURGERS'],['Nylon gathiya','TEST BRAND NYLON GATHIYA']])assert.ok(supportedName(name,source));
 for(const [name,source] of [['Cream','TEST BRAND WHIPPING CREAM 35%'],['Cashews','TEST BRAND CASHEW SPLIT'],['Rice','TEST BRAND TOOR DAL'],['Toothpaste','TEST BRAND BLUE'],['Red bhakharwadi','RD MINI BHAKHARWADI'],['TEST BRAND','TEST BRAND RICE'],['Whipping','TEST BRAND WHIPPING CREAM'],['Chili','TEST BRAND THAI CHILLI'],['<img src=x>','TEST BRAND RICE']])assert.equal(supportedName(name,source),false);
});
test('grocery till abbreviations can be expanded without dropping printed product traits',()=>{
 assert.equal(qualifiedReceiptName('Diced tomatoes no salt','Tomatos Diced No Slt'),'Diced tomatoes no salt');
 assert.equal(qualifiedReceiptName('1% chocolate milk sugar reduced','Quebon Choc Milk 1% SgrRedu'),'1% chocolate milk sugar reduced');
 assert.equal(qualifiedReceiptName('Green seedless grapes','Grapes Green Sdls'),'Green seedless grapes');
 assert.equal(qualifiedReceiptName('Vegetable oil','Unico Vegoil'),'Vegetable oil');
 assert.equal(qualifiedReceiptName('Diced tomatoes','Tomatos Diced No Slt'),'');
 assert.equal(qualifiedReceiptName('Chocolate milk','Quebon Choc Milk 1% SgrRedu'),'');
 assert.equal(qualifiedReceiptName('Seedless grapes','Grapes Green Sdls'),'Green Seedless grapes');
 assert.equal(qualifiedReceiptName('Orange juice','Org Juice No Pul NFC'),'');
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
 assert.equal(qualifiedReceiptName('Ketchup','SAMPLE 4L KCP'),'Ketchup');
 const row={name:'SAMPLE 4L KCP',raw:'SAMPLE 4L KCP $4.00',qty:1,unit:'pcs',amount:'4.00'};
 const named=identifyReceiptItems([row],[{source:row.raw,name:'Ketchup',section:'pantry'}])[0];
 assert.equal(named.name,'Ketchup');
 assert.equal(named.receiptName,row.name);
 assert.equal(named.raw,row.raw);
 assert.equal(named.amount,row.amount);
 assert.equal(qualifiedReceiptName('TEX white','DEMP TEX WHT'),'');
 assert.equal(qualifiedReceiptName('Beads','DOWNY BEADS'),'');
});
test('opaque brand-only names retain their printed order',()=>{
 assert.equal(qualifiedReceiptName('CLASSIC LAYS','LAYS CLASSIC'),'LAYS CLASSIC');
 assert.equal(qualifiedReceiptName('BLUE BRAND','BRAND BLUE'),'BRAND BLUE');
 assert.equal(qualifiedReceiptName('Roma tomato','TOMATO ROMA'),'Roma tomato');
 assert.equal(qualifiedReceiptName('RUSS potato','POTATO RUSS'),'RUSS potato');
 assert.equal(qualifiedReceiptName('Bunched spinach','SPINACH BUNCHED'),'Bunched spinach');
});
test('short names recover only qualifiers printed on the same product and keep opaque labels',()=>{
 assert.equal(qualifiedReceiptName('Waters','NAYA WATERS'),'Waters');
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
test('fasting food distinctions survive model suggestions that omit them',()=>{
 assert.equal(qualifiedReceiptName('Chevdo','SAMPLE FARALI CHEVDO'),'Farali Chevdo');
 assert.equal(qualifiedReceiptName('Moraiyo','SAMPLE UPAVAS MORAIYO'),'Upavas Moraiyo');
 assert.equal(qualifiedReceiptName('Potato & peanut chevdo','SAMPLE POTATO & PEANUT BRAND FARALI CHEVDO'),'Potato & peanut Farali chevdo');
 assert.equal(qualifiedReceiptName('Farali','SAMPLE FARALI CHEVDO'),'');
 assert.equal(qualifiedReceiptName('Farali chevdo','SAMPLE CHEVDO'),'');
 const row={name:'SAMPLE FARALI CHEVDO',raw:'SAMPLE FARALI CHEVDO $3.00',amount:'3.00',qty:1,unit:'pcs'};
 const result=identifyReceiptItems([row],[{source:row.raw,name:'Chevdo',section:'pantry'}])[0];
 assert.deepEqual([result.name,result.receiptName,result.raw,result.amount],['Farali Chevdo',row.name,row.raw,row.amount]);
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
 for(const name of ['Milk','Green peas','Organic ginger','Jaggery bucket 5 kg','Chhas masala','Papad','Plastic-free water','NAYA WATERS','TEST THR CHS RCH','TEST SSME BN','CORRIENDER EACH'])assert.equal(receiptSection(name),'kitchen');
 for(const name of ['Shopping bag','Paper towels','Laundry detergent','Body wash with coconut oil','Pliers','Glass cleaner','TIDE COLDWTR','DOWNY BEADS','COLGATE TP'])assert.equal(receiptSection(name),'household');
 for(const name of ['GROCERY','TEST BRAND BLUE','TEST BRAND 12X600','Potting mix','TEST CRFLY CRFTD'])assert.equal(receiptSection(name),'');
});

test('clear food, drink and household words on mixed-store receipts determine the section',()=>{
 for(const label of ['ROTI CHICKEN','MONSTER VRTY','Mnstr Ultra Paradise','Soft Drink 0range','Sprite Zero','Cocomax Coconut Wtr','0nions Green'])assert.equal(receiptSection(label),'kitchen',label);
 for(const label of ['Bath Tiss Jmbo 202S','Carry Bag Large Ther','FreshCo 2.0 ReuseBag'])assert.equal(receiptSection(label),'household',label);
 for(const label of ['LCBO CARD','MONSTER TOY','ACTIVATED','GIFT CARD'])assert.equal(receiptSection(label),'',label);
 assert.equal(qualifiedReceiptName('Coconut water','Cocomax Coconut Wtr'),'Coconut water');
 assert.equal(qualifiedReceiptName('Green onions','0nions Green'),'Green onions');
 const rows=identifyReceiptItems([
  {name:'Cocomax Coconut Wtr',raw:'Cocomax Coconut Wtr $2.99',amount:'2.99'},
  {name:'Soft Drink 0range',raw:'Soft Drink 0range $8.99',amount:'8.99'},
  {name:'Bath Tiss Jmbo 202S',raw:'Bath Tiss Jmbo 202S $17.99',amount:'17.99'},
  {name:'LCBO CARD',raw:'LCBO CARD $400.00',amount:'400.00'}
 ]);
 assert.deepEqual(rows.map(row=>[row.name,row.receiptName,row.section]),[
  ['Cocomax Coconut Water','Cocomax Coconut Wtr','kitchen'],
  ['Soft Drink Orange','Soft Drink 0range','kitchen'],
  ['Bath Tissue Jumbo 202S','Bath Tiss Jmbo 202S','household'],
  ['LCBO CARD','LCBO CARD','']
 ]);
});
test('printed receipt departments classify unfamiliar labels while clear product types win',()=>{
 const text='21-GROCERY\nZXQ VARIETY 4.99\nTEST SOAP 2.49\n41-HOME\nTEST OPAQUE ITEM 6.89\nTEST MILK 3.99\n27-PRODUC:\nFRESH QT 2.99\nTOTAL 21.35';
 const rows=parseReceipt(text);
 assert.deepEqual(rows.map(row=>row.department),['kitchen','kitchen','household','household','kitchen']);
 assert.deepEqual(identifyReceiptItems(rows).map(row=>row.section),['kitchen','household','household','kitchen','kitchen']);
 assert.deepEqual(rows.map(row=>row.amount),['4.99','2.49','6.89','3.99','2.99']);
 const opaque=parseReceipt('TEST MARKET\nZXQ VARIETY 6.89');
 assert.equal(identifyReceiptItems(opaque)[0].section,'');
 const doc=documentFrom([{lines:['27-PRODUC:','ZXQ VARIETY 4.99','41-HOME','TEST OPAQUE ITEM 6.89','TOTAL 11.88'],labels:[{line:1,name:'ZXQ VARIETY',section:'unknown'},{line:3,name:'TEST OPAQUE ITEM',section:'unknown'}]}],{name:'synthetic.jpg'},{ai:true});
 assert.deepEqual(doc.items.map(row=>row.section),['kitchen','household']);
});
test('repeated purchases repair display names from another printed line while retaining every original line',()=>{
 const row=(name,amount='8.99',itemNumber='')=>({name,raw:`${itemNumber?itemNumber+' ':''}${name} ${amount}`,amount,qty:1,unit:'pcs',itemNumber});
 const cream=[row('35% FIELD WHIPPING CREAM'),row('35% FIELD WHIPPING CREAM'),row('35% FIELD WHIPPING CREAN')];
 const annotations=cream.slice(0,2).map(item=>({source:item.raw,name:'35% Whipping cream',section:'pantry'}));
 const named=identifyReceiptItems(cream,annotations);
 assert.deepEqual(named.map(item=>item.name),['35% Whipping cream','35% Whipping cream','35% Whipping cream']);
 assert.equal(named[2].receiptName,'35% FIELD WHIPPING CREAN');assert.equal(named[2].raw,cream[2].raw);assert.equal(named[2].nameSource,'repeated');
 const produce=[row('EGGPLANT BABY','3.78','123456'),row('EGGPLANI BABY','4.23','123456')];
 const corrected=identifyReceiptItems(produce,[{source:produce[0].raw,name:'Baby eggplant',section:'pantry'},{source:produce[1].raw,name:'EGGPLANI BABY',section:'pantry'}]);
 assert.deepEqual(corrected.map(item=>item.name),['Baby eggplant','Baby eggplant']);assert.deepEqual(corrected.map(item=>item.amount),['3.78','4.23']);
 const different=[row('35% FIELD WHIPPING CREAM'),row('25% FIELD WHIPPING CREAM'),row('35% FIELD WHIPPING CREAM')];
 const separated=identifyReceiptItems(different,[{source:different[0].raw,name:'35% Whipping cream',section:'pantry'},{source:different[2].raw,name:'35% Whipping cream',section:'pantry'}]);
 assert.equal(separated[1].name,'25% FIELD WHIPPING CREAM');
});
test('unnumbered repeated purchases use a unique printed spelling without merging lines',()=>{
 const names=['35% Lactantia Whipping Cream','35% Lactantia Whipping Crean','35% Lactantia Whipping Cream','35% Lactantla Whipping Crean','35% Lactantia Whipping Cream'];
 const rows=names.map(name=>({name,raw:name+' $8.99',amount:'8.99',qty:1,unit:'pcs'}));
 const fixed=identifyReceiptItems(rows);
 assert.equal(fixed.length,5);
 assert.deepEqual(fixed.map(row=>row.name),Array(5).fill('35% Lactantia Whipping Cream'));
 assert.deepEqual(fixed.map(row=>row.section),Array(5).fill('kitchen'));
 assert.equal(fixed[1].receiptName,names[1]);
 assert.equal(fixed[3].receiptName,names[3]);
 assert.equal(fixed[3].raw,rows[3].raw);
 const distinct=identifyReceiptItems([
  {name:'TEST MILD SAUCE',raw:'TEST MILD SAUCE $5.00',amount:'5.00',qty:1,unit:'pcs'},
  {name:'TEST MILD SAUCE',raw:'TEST MILD SAUCE $5.00',amount:'5.00',qty:1,unit:'pcs'},
  {name:'TEST WILD SAUCE',raw:'TEST WILD SAUCE $5.00',amount:'5.00',qty:1,unit:'pcs'},
 ]);
 assert.equal(distinct[2].receiptName,'TEST WILD SAUCE');
});
test('verified Costco household labels override conflicting model categories without changing evidence',()=>{
 for(const receiptName of ['TIDE COLDWTR','DOWNY BEADS','COLGATE TP']){
  const row={name:receiptName,receiptName,raw:`${receiptName} $27.99`,qty:1,unit:'item',amount:'27.99'};
  const named=identifyReceiptItems([row],[{source:row.raw,name:receiptName,section:'pantry'}])[0];
  assert.equal(named.section,'household');
  assert.equal(named.receiptName,receiptName);
  assert.equal(named.raw,row.raw);
  assert.equal(named.amount,row.amount);
 }
 assert.equal(receiptSection('TIDE RICE'),'kitchen');
 assert.equal(receiptSection('COLGATE SNACKS'),'kitchen');
});
test('user-confirmed Surati bhindi displays Bhindi without changing the printed purchase',()=>{
 const row={name:'SURATI BHINDI',raw:'(4)06865600856 SURATI BHINDI MRJ\n4 @ $1.79 7.16',qty:4,unit:'pcs',amount:'7.16'};
 const named=identifyReceiptItems([row])[0];
 assert.deepEqual([named.name,named.section,named.receiptName,named.raw,named.qty,named.unit,named.amount],['Bhindi','kitchen',row.name,row.raw,4,'pcs','7.16']);
 assert.equal(receiptSection('SURATI BHINDI'),'kitchen');
 assert.notEqual(identifyReceiptItems([{...row,name:'SURATI GATHIYA'}])[0].name,'Bhindi');
});
test('document evidence and product identity remain separate from quantities, amounts and repeated purchases',()=>{
 const lines=['TEST BRAND WHIPPING CREAM 35% $4.00','TEST BRAND WHIPPING CREAM 35% $4.00','TEST BRAND SOAP $3.00','GROCERY $2.00','TOTAL $13.00'];
 const doc=documentFrom([{lines,labels:[{line:0,name:'35% Whipping cream',section:'pantry'},{line:1,name:'35% Whipping cream',section:'pantry'},{line:2,name:'Soap',section:'household'},{line:3,name:'Grocery',section:'unknown'}]}],{name:'synthetic.jpg'},{ai:true});
 assert.equal(doc.items.length,4);assert.deepEqual(doc.items.map(r=>r.name),['35% Whipping cream','35% Whipping cream','Soap','Grocery']);assert.equal(doc.items[0].qty,1);assert.equal(doc.items[0].amount,'4.00');assert.equal(doc.items[0].receiptName,'TEST BRAND WHIPPING CREAM 35%');assert.equal(doc.items[2].section,'household');assert.equal(doc.items[3].section,'');assert.equal(doc.ocr.text,lines.join('\n'));assert.deepEqual(doc.ocr.sections[0].lines,lines);assert.deepEqual(doc.audit.warnings,[]);
});
test('verified retailer SKU and receipt words resolve opaque products without an outside scan request',()=>{
 const text='COSTCO WHOLESALE\n161552 KS QUE PASA $6.99\n1081570 MF CHEESE SA $13.99\nTOTAL $20.98';
 const rows=identifyReceiptItems(parseReceipt(text),[],text);
 assert.deepEqual(rows.map(row=>[row.name,row.section,row.nameSource]),[['Tortilla chips','kitchen','verified-catalog'],['Nacho cheese sauce','kitchen','verified-catalog']]);
 assert.deepEqual(rows.map(row=>[row.receiptName,row.amount]),[['KS QUE PASA','6.99'],['MF CHEESE SA','13.99']]);
 const wrongStore=identifyReceiptItems(parseReceipt(text),[],'OTHER STORE\n'+text.split('\n').slice(1).join('\n'));
 assert.deepEqual(wrongStore.map(row=>row.name),['KS QUE PASA','MF CHEESE SA']);
 const wrongLabel=identifyReceiptItems([{name:'KS OTHER ITEM',itemNumber:'161552',raw:'161552 KS OTHER ITEM $6.99',amount:'6.99'}],[],text);
 assert.equal(wrongLabel[0].name,'KS OTHER ITEM');
 const conflicting=identifyReceiptItems([{name:'KS QUE PASA SOAP',itemNumber:'161552',raw:'161552 KS QUE PASA SOAP $6.99',amount:'6.99'}],[],text);
 assert.equal(conflicting[0].name,'KS QUE PASA SOAP');assert.equal(conflicting[0].section,'household');
 const doc=documentFrom([{lines:text.split('\n'),labels:[]}],{name:'synthetic.jpg'},{ai:true});
 assert.deepEqual(doc.items.map(row=>row.name),['Tortilla chips','Nacho cheese sauce']);
});
test('short display names use printed evidence and keep gift cards out of stock',()=>{
 const text='COSTCO WHOLESALE\n305882 KS IBU 400M 16.99\n399 DOORDASH2X50 79.99\n401150 NANO 24X93ML 13.49\nSUBTOTAL 110.47';
 const rows=identifyReceiptItems(parseReceipt(text),[],text);
 assert.deepEqual(rows.map(row=>[row.name,row.section]),[
  ['Ibuprofen','household'],['DoorDash gift cards',''],['Drinkable yogurt','kitchen']
 ]);
 assert.deepEqual(rows.map(row=>row.receiptName),['KS IBU 400M','DOORDASH2X50','NANO']);
 assert.deepEqual(rows.map(row=>row.amount),['16.99','79.99','13.49']);
 assert.deepEqual(rows.map(row=>row.raw),text.split('\n').slice(1,4));
 assert.equal(rows[1].excludedFromPantry,true);
 assert.equal(rows[1].exclusionReason,'non-stock');
 assert.equal(rows[2].qty,2232);
 assert.equal(rows[2].unit,'ml');
 const otherStore=identifyReceiptItems(parseReceipt(text),[],'OTHER STORE\n'+text.split('\n').slice(1).join('\n'));
 assert.deepEqual(otherStore.map(row=>row.name),['KS IBU 400M','DOORDASH2X50','NANO']);
 assert.equal(otherStore[1].excludedFromPantry,true);
 const mismatched=identifyReceiptItems([{name:'KS IBU 200M',itemNumber:'305882',raw:'305882 KS IBU 200M 16.99',amount:'16.99'}],[],text);
 assert.equal(mismatched[0].name,'KS IBU 200M');
});
test('a recognizable produce abbreviation is Pantry without changing its receipt line',()=>{
 const line='Tom Diced $10.76 C';
 const row=identifyReceiptItems([{name:'Tom Diced',raw:line,amount:'10.76',qty:4,unit:'pcs'}])[0];
 assert.deepEqual([row.name,row.section,row.receiptName,row.raw,row.amount,row.qty],['Diced tomatoes','kitchen','Tom Diced',line,'10.76',4]);
 assert.equal(receiptSection('TOM TOY'),'');
});
test('a printed merchant prefix can be removed while keeping the product and receipt evidence',()=>{
 const text='CITRUS SPICE GROCERIES\nCITRUS SPICE WHOLE WHEAT FLOUR 2KG $3.49\nCITRUS SPICE RAW CASHEW 4 LB $8.99\nTOTAL $12.48';
 const rows=identifyReceiptItems(parseReceipt(text),[],text);
 assert.deepEqual(rows.map(row=>[row.name,row.section,row.nameSource]),[['Whole wheat flour','kitchen','merchant-prefix'],['Raw cashew','kitchen','merchant-prefix']]);
 assert.deepEqual(rows.map(row=>[row.receiptName,row.amount]),[['CITRUS SPICE WHOLE WHEAT FLOUR','3.49'],['CITRUS SPICE RAW CASHEW','8.99']]);
 assert.equal(rows[0].raw,'CITRUS SPICE WHOLE WHEAT FLOUR 2KG $3.49');
 assert.equal(identifyReceiptItems(parseReceipt(text),[],'OTHER GROCERIES\n'+text.split('\n').slice(1).join('\n'))[0].name,'CITRUS SPICE WHOLE WHEAT FLOUR');
 assert.equal(identifyReceiptItems([{name:'CITRUS SPICE 2L',raw:'CITRUS SPICE 2L $3.49',amount:'3.49'}],[],text)[0].name,'CITRUS SPICE 2L');
 const firstProduct='TEST BRAND WHIPPING CREAM 35%\n$4.00\nTEST BRAND WHIPPING CREAM 35% $4.00';
 assert.equal(identifyReceiptItems([{name:'TEST BRAND WHIPPING CREAM 35%',raw:'TEST BRAND WHIPPING CREAM 35% $4.00',amount:'4.00'}],[],firstProduct)[0].name,'TEST BRAND WHIPPING CREAM 35%');
});
test('Costco household products use verified SKU and printed words while retaining receipt evidence',()=>{
 const receiptText='COSTCO WHOLESALE\n1974989 EVRST 12X600 42.99 H\n2633624 CHARMIN ULTR 32.49 H\n3458556 TIDE COLDWTR 27.99 H';
 const rows=[['1974989','EVRST 12X600','42.99'],['2633624','CHARMIN ULTR','32.49'],['3458556','TIDE COLDWTR','27.99'],['3458556','TIDE COLDWTR','27.99']].map(([itemNumber,name,amount])=>({itemNumber,name,amount,qty:1,unit:'pcs',raw:itemNumber+' '+name+' '+amount+' H'}));
 const named=identifyReceiptItems(rows,[],receiptText);
 assert.deepEqual(named.map(row=>[row.name,row.section]),[['White towel rolls','household'],['Toilet paper','household'],['Coldwater laundry detergent','household'],['Coldwater laundry detergent','household']]);
 assert.ok(named.every((row,i)=>row.nameSource==='verified-catalog'&&row.receiptName===rows[i].name&&row.raw===rows[i].raw&&row.amount===rows[i].amount&&row.qty===1));
 const missingHeader=receiptText.split('\n').slice(1).join('\n');
 assert.deepEqual(identifyReceiptItems(rows,[],missingHeader).map(row=>row.name),named.map(row=>row.name));
 assert.equal(identifyReceiptItems([rows[0]],[],missingHeader.split('\n')[0])[0].name,'EVRST 12X600');
 assert.equal(identifyReceiptItems([rows[0]],[],'OTHER STORE')[0].name,'EVRST 12X600');
 assert.equal(identifyReceiptItems(rows,[],'OTHER STORE\n'+missingHeader)[0].name,'EVRST 12X600');
 assert.equal(identifyReceiptItems([{...rows[0],name:'EVRST SOAP'}],[],receiptText)[0].name,'EVRST SOAP');
});

test('two independently verified Costco SKUs recover products when the logo is unreadable',()=>{
 const text='VHOLESALE\n25771 MINI CUKES 3.79\n1474938 COLGATE PR 18.99 H\n435259 2% FINE-FILT 6.69\nSUBTOTAL 29.47';
 const rows=identifyReceiptItems(parseReceipt(text),[],text);
 assert.deepEqual(rows.map(row=>[row.name,row.section]),[
  ['Mini cucumbers','kitchen'],['Pro-Relief toothpaste','household'],['Fine-filtered milk 2%','kitchen']
 ]);
 assert.equal(rows[0].receiptName,'MINI CUKES');
 assert.equal(rows[1].raw,'1474938 COLGATE PR 18.99 H');
 assert.equal(identifyReceiptItems(parseReceipt('25771 MINI CUKES 3.79'),[],'OTHER STORE\n25771 MINI CUKES 3.79')[0].name,'MINI CUKES');
});
test('verified food and household SKUs keep each price and printed label across a mixed basket',()=>{
 const text='OSTCO\nWHOLESALE\n232952 COKE ZERO 17.99 H\n1041477 PINEAP JUICE 11.99 H\n1792990 KS PAD - JLA 21.49\n810 LCBO CARD 400.00\nSUBTOTAL 451.47';
 const rows=identifyReceiptItems(parseReceipt(text),[],text);
 assert.deepEqual(rows.map(row=>[row.name,row.amount,row.section]),[
  ['Coke Zero','17.99','kitchen'],['Pineapple juice','11.99','kitchen'],['Absorbent pads','21.49','household'],['LCBO CARD','400.00','']
 ]);
 assert.deepEqual(rows.map(row=>row.receiptName),['COKE ZERO','PINEAP JUICE','KS PAD - JLA','LCBO CARD']);
 assert.equal(rows[2].raw,'1792990 KS PAD - JLA 21.49');
 assert.equal(identifyReceiptItems(parseReceipt(text),[],'OTHER STORE\n'+text.split('\n').slice(2).join('\n'))[2].name,'KS PAD - JLA');
});
test('food categories recognize weighed fruit, yogurt drinks, limeade and chocolate candy',()=>{
 for(const label of ['Cherries Red','Yog Drink Ayran','Simply Chy Limeade','M&Ms Minis'])assert.equal(receiptSection(label),'kitchen',label);
 for(const label of ['Cherry scented cleaner','Limeade shampoo','Mini tools'])assert.notEqual(receiptSection(label),'kitchen',label);
});
test('repeated item numbers repair one-letter OCR labels without merging purchases or hiding source lines',()=>{
 const lines=['123456 TEST TOVATO $2.11','123456 TEST TOMATO $3.22','123456 TEST TOMATO $4.33','654321 TEST TOVATO $5.44'];
 const rows=identifyReceiptItems(parseReceipt(lines.join('\n')));
 assert.equal(rows.length,4);
 assert.deepEqual(rows.map(row=>row.receiptName),['TEST TOMATO','TEST TOMATO','TEST TOMATO','TEST TOVATO']);
 assert.equal(rows[0].ocrName,'TEST TOVATO');assert.equal(rows[0].nameSource,'repeated-label');
 assert.deepEqual(rows.map(row=>row.amount),['2.11','3.22','4.33','5.44']);
 assert.equal(rows[0].raw,lines[0]);assert.equal(rows[3].raw,lines[3]);
 const doc=documentFrom([{lines,labels:[]}],{name:'synthetic.jpg'},{ai:true});
 assert.equal(doc.items[0].receiptName,'TEST TOMATO');assert.equal(doc.items[0].ocrName,'TEST TOVATO');
 assert.equal(doc.ocr.text,lines.join('\n'));
 const variants=identifyReceiptItems(parseReceipt('123456 TEST TOMATO $2.11\n123456 TEST POTATO $3.22'));
 assert.deepEqual(variants.map(row=>row.receiptName),['TEST TOMATO','TEST POTATO']);
});
test('two full repeated labels support one middle wrapped-line dropout at the same printed unit price',()=>{
 const text='SAMPLEBOX SPICY CRACKER $2.25\nSPICY CRACKER $2.25\nSAMPLEBOX SPICY CRACKER\n13 @ $2.25ea. $29.25\nSUBTOTAL $33.75';
 const rows=identifyReceiptItems(parseReceipt(text),[],text);
 assert.deepEqual(rows.map(row=>row.receiptName),Array(3).fill('SAMPLEBOX SPICY CRACKER'));
 assert.deepEqual(rows.map(row=>row.amount),['2.25','2.25','29.25']);
 assert.equal(rows[1].raw,'SPICY CRACKER $2.25');
 assert.equal(rows[1].ocrName,'SPICY CRACKER');
 const different=identifyReceiptItems(parseReceipt(text.replace('SPICY CRACKER $2.25','SPICY CRACKER $2.35')),[],text);
 assert.equal(different[1].receiptName,'SPICY CRACKER');
});

test('meat and alcohol purchases stay visible for bill review without being assigned to vegetarian pantry',()=>{
 const text='21-GROCERY SAMPLE SODA 1.00\n26-LIQUOR SAMPLE BEER 2.00\n31-MEATS SAMPLE DRUMSTICKS 3.00\nSUBTOTAL 6.00';
 const rows=identifyReceiptItems(parseReceipt(text),[],text);
 assert.deepEqual(rows.map(row=>[row.name,row.amount,row.section]),[
  ['SAMPLE SODA','1.00','kitchen'],['SAMPLE BEER','2.00',''],['SAMPLE DRUMSTICKS','3.00','']
 ]);
 assert.equal(rows[1].excludedFromPantry,true);assert.equal(rows[2].excludedFromPantry,true);
 assert.deepEqual(auditReceipt(text,rows).warnings,[]);
});

test('a Walmart barcode plus visible words can identify drink and cleaner while preserving the OCR evidence',()=>{
 const text='Walmart\nCRLSH ZERO 0 056000010660 $8.28 J\nLYS0L BATH P 059631882930 $3.97 J\nLYSOL BATH P 059631882930 $3.97 J\nSUBTOTAL $16.22';
 const rows=identifyReceiptItems(parseReceipt(text),[],text);
 assert.deepEqual(rows.map(row=>[row.name,row.section,row.nameSource]),[
  ['Crush Zero Orange','kitchen','verified-catalog'],['Bathroom cleaner','household','verified-catalog'],['Bathroom cleaner','household','verified-catalog']
 ]);
 assert.deepEqual(rows.map(row=>row.receiptName),['CRLSH ZERO 0','LYS0L BATH P','LYSOL BATH P']);
 assert.equal(rows[0].raw,'CRLSH ZERO 0 056000010660 $8.28 J');
 assert.equal(identifyReceiptItems(parseReceipt(text),[],'OTHER STORE\n'+text.split('\n').slice(1).join('\n'))[0].name,'CRLSH ZERO 0');
 assert.equal(identifyReceiptItems([{...rows[0],name:'OTHER ZERO 0',receiptName:'OTHER ZERO 0'}],[],text)[0].name,'OTHER ZERO 0');
 assert.equal(identifyReceiptItems([{...rows[0],itemNumber:'000000000000'}],[],text)[0].name,'CRLSH ZERO 0');
});

test('a manufacturer-verified plant seasoning is pantry food but unrelated meat stays excluded',()=>{
 const text='TOMAX STEAM MEAT 5 SPICES PDR W $2.99\nSAMPLE MEAT SPICES PDR W $3.99\nSUBTOTAL $6.98';
 const rows=identifyReceiptItems(parseReceipt(text),[],text);
 assert.equal(rows[0].name,'Five-spice powder');
 assert.equal(rows[0].receiptName,'TOMAX STEAM MEAT 5 SPICES PDR');
 assert.equal(rows[0].section,'kitchen');
 assert.equal(rows[0].nameSource,'verified-catalog');
 assert.equal(rows[0].raw,'TOMAX STEAM MEAT 5 SPICES PDR W $2.99');
 assert.equal(rows[1].section,'');
 assert.equal(rows[1].excludedFromPantry,true);
});

test('short till prefixes are removed only when remaining printed words identify a product',()=>{
 const text='SAMPLE MARKET\nAB WASABI IN TUBE FAMILY SIZE $6.59\nXY LIGHT PRSVD MUSTARD STEM $6.97\nQW TRUFFLE INSTANT NOODLE $4.49\nYZ ON SWEETENED SOYA DRINK $5.98\nMF CHEESE SA $13.99\nTEST TOMATO $2.11\nSUBTOTAL $40.13';
 const rows=identifyReceiptItems(parseReceipt(text),[],text);
 assert.deepEqual(rows.map(row=>row.name),[
  'WASABI','LIGHT Preserved MUSTARD STEM','TRUFFLE INSTANT NOODLE','SWEETENED SOYA DRINK','MF CHEESE SA','TEST TOMATO'
 ]);
 assert.deepEqual(rows.map(row=>row.receiptName),[
  'AB WASABI IN TUBE FAMILY SIZE','XY LIGHT PRSVD MUSTARD STEM','QW TRUFFLE INSTANT NOODLE','YZ ON SWEETENED SOYA DRINK','MF CHEESE SA','TEST TOMATO'
 ]);
 assert.equal(rows[0].raw,'AB WASABI IN TUBE FAMILY SIZE $6.59');
 assert.deepEqual(rows.map(row=>row.amount),['6.59','6.97','4.49','5.98','13.99','2.11']);
});
