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
