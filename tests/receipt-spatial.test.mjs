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
