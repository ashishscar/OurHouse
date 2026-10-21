import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionPlan,receiptLines} from '../receipts/layout.mjs';
import {pantryReceipt} from '../receipts/parser.mjs';

test('long warehouse receipt sections retain readable width and cover the whole photo',()=>{
 const plan=sectionPlan(1000,12000);assert.equal(plan.width,1800);assert.ok(plan.sections.length>10);
 assert.equal(plan.sections[0].top,0);assert.equal(plan.sections.at(-1).top+plan.sections.at(-1).height,plan.height);
 for(let i=1;i<plan.sections.length;i++)assert.equal(plan.sections[i-1].top+plan.sections[i-1].height-plan.sections[i].top,240);
 assert.throws(()=>sectionPlan(1000,60000),/too long/);
});

test('a 90-product Costco-style receipt pairs separated name and price columns and preserves repeated purchases',()=>{
 const plan=sectionPlan(1800,6200),words=[];
 for(let i=0;i<90;i++){
  const y=150+i*62;
  for(const [text,x,width] of [[String(100000+i),40,150],['KS TOFU',260,260],['2kg',650,100],['12.99',1500,140],['E',1670,20]])words.push({text,confidence:94,bbox:{x0:x,x1:x+width,y0:y,y1:y+30}});
 }
 const pages=plan.sections.map(section=>({section,data:{words:words.filter(w=>w.bbox.y0>=section.top&&w.bbox.y1<=section.top+section.height).map(w=>({...w,bbox:{...w.bbox,y0:w.bbox.y0-section.top,y1:w.bbox.y1-section.top}}))}}));
 const lines=receiptLines(pages),items=pantryReceipt(lines.map(line=>line.text).join('\n'));
 assert.equal(items.length,90);assert.equal(new Set(items.map(i=>i.itemNumber)).size,90);
 assert.ok(items.every(item=>item.name==='KS TOFU'&&item.qty===2&&item.unit==='kg'&&item.amount==='12.99'&&!item.pick));
});

test('SKU quantities, wrapped lines and product names beginning like payment words remain products',()=>{
 const items=pantryReceipt('2 123456 KS TOFU 400g 8.98 E\n234567 CASHEWS 1kg 19.99 E\n345678 TAXI TOY 12.99\n456789 KS OLIVE OIL\n2L 18.99 E\n999999 INSTANT SAVINGS -3.00\nSUBTOTAL 60.95\nVISA 60.95');
 assert.equal(items.length,4);assert.equal(items[0].qty,800);assert.equal(items[0].itemNumber,'123456');assert.equal(items[1].name,'CASHEWS');assert.equal(items[2].name,'TAXI TOY');
 // A pack-size continuation may still need a manual correction, but it cannot become a price or payment entry.
 assert.ok(items.every(item=>!item.name.includes('SAVINGS')&&!item.name.includes('VISA')));
});

test('real OCR word spacing around price decimals stays separate from quantities',()=>{
 const items=pantryReceipt('100001 KS BASMATI RICE 5kg 12. 99\n100002 CASHEWS 1kg 12 .99\n100003 TOFU 400g 12 . 99 E');
 assert.equal(items.length,3);assert.deepEqual(items.map(i=>i.amount),['12.99','12.99','12.99']);
 assert.deepEqual(items.map(i=>i.qty),[5,1,400]);assert.deepEqual(items.map(i=>i.name),['KS BASMATI RICE','CASHEWS','TOFU']);
});
