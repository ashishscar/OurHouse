import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleSpatial,resolveOrphanPrices} from '../receipts/spatial.mjs';

const quad=(x,y,w,h,slope=0)=>[[x,y],[x+w,y+slope*w],[x+w,y+slope*w+h],[x,y+h]];

test('angled receipt columns keep each printed price with its purchase',()=>{
 const slope=.13;
 const record={
  texts:['$7.50','TEST OATS','TEST RICE','$4.25'],
  boxes:[quad(170,44+slope*170,48,12,slope),quad(10,15+slope*10,105,12,slope),quad(10,44+slope*10,105,12,slope),quad(170,15+slope*170,48,12,slope)],
  scores:[.98,.98,.98,.98],
 };
 const result=assembleSpatial(record);
 assert.deepEqual(result.lines,['TEST OATS $4.25','TEST RICE $7.50']);
 assert.deepEqual(result.unmatched,[]);
 assert.deepEqual(result.ambiguous,[]);
 assert.deepEqual(resolveOrphanPrices(record,result).lines,result.lines);
});

test('an isolated amount cannot be assigned across distant receipt rows',()=>{
 const record={texts:['TEST OATS','$4.25'],boxes:[quad(10,15,100,12),quad(170,80,50,12)],scores:[.98,.98]};
 const result=assembleSpatial(record);
 assert.deepEqual(result.unmatched,[1]);
 assert.deepEqual(result.lines,['TEST OATS','$4.25']);
});

test('a sale notice cannot take a nearby repeated product price',()=>{
 const record={
  texts:['CREAM','CREAM','CREAM','Final Sale','$3.59','$3.59','$3.59'],
  boxes:[quad(10,10,90,12),quad(10,50,90,12),quad(10,90,90,12),quad(10,102,90,12),quad(160,20,50,12),quad(160,60,50,12),quad(160,100,50,12)],
  scores:Array(7).fill(.98),
 };
 const result=assembleSpatial(record);
 assert.equal(result.lines.filter(line=>line==='CREAM $3.59').length,3);
 assert.ok(result.lines.includes('Final Sale'));
 assert.deepEqual(result.unmatched,[]);
});

test('an ambiguous amount cannot be rescued onto a sale notice',()=>{
 const record={texts:['Final Sale','Shopping Bag','$0.35'],boxes:[quad(10,10,90,12),quad(10,60,90,12),quad(160,12,50,12)],scores:[.98,.98,.98]};
 const assembly={lines:[...record.texts],observations:[{anchors:[0],prices:[]},{anchors:[1],prices:[]},{box:2,unassigned:true}],ambiguous:[2]};
 const result=resolveOrphanPrices(record,assembly);
 assert.deepEqual(result.lines,record.texts);
 assert.equal(result.remaining_ambiguous,1);
});

test('a tax marker remains part of a price on an angled receipt',()=>{
 const record={
  texts:['Final Sale','Shopping Bag','$0.35 Tx1'],
  boxes:[quad(10,10,90,12,.13),quad(10,40,90,12,.13),quad(160,40+.13*150,80,12,.13)],
  scores:[.98,.98,.98],
 };
 const result=assembleSpatial(record);
 assert.ok(result.lines.includes('Final Sale'));
 assert.ok(result.lines.includes('Shopping Bag $0.35 Tx1'));
});

test('document baseline and separate unit-price column preserve every literal amount',()=>{
 const texts=['TEST APPLES','TEST PEARS','TEST JUICE','3 X','2.42 (','TEST MILK','TEST BREAD','TEST OATS','1.99 €','4.99 ( 11','3.49 € 11','7.26 6 11','2.00 € 11','1.50 € 11','4.25 € 11'];
 const ys=[10,40,70,88,88,110,140,170,150,10,40,70,110,140,170];
 const boxes=texts.map((t,i)=>{const x=i===4||i===8?115:i>=9?190:i===3?40:10,w=i===4||i===8?55:i>=9?80:110;return quad(x,ys[i]+.02*x,w,12,i>=9?.16:.02)});
 const record={texts,boxes,scores:texts.map(()=>.98),baseline_slope:.02};
 const result=assembleSpatial(record,{threshold:1.2,margin:.05});
 assert.ok(result.price_column>115&&result.price_column<190);
 assert.deepEqual(result.lines.filter(x=>x.startsWith('TEST ')),[
  'TEST APPLES 4.99 ( 11','TEST PEARS 3.49 € 11','TEST JUICE 7.26 6 11','TEST MILK 2.00 € 11','TEST BREAD 1.50 € 11','TEST OATS 4.25 € 11'
 ]);
 assert.ok(result.lines.includes('2.42 ('));
 assert.equal(record.texts[9],'4.99 ( 11');
});
