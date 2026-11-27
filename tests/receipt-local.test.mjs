import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalSections} from '../receipts/local.mjs';

test('long local receipt preserves physical order when parallel OCR finishes out of order',async()=>{
 const completed=[],terminated=[],started=[];
 const read=await readLocalSections([0,1,2,3,4,5],{
  concurrency:2,
  createWorker:async()=>({terminate:async()=>terminated.push(true)}),
  readPage:async(_worker,index)=>{started.push(index);await new Promise(resolve=>setTimeout(resolve,index%2?1:10));completed.push(index);return {text:'LINE '+index};}
 });
 assert.equal(terminated.length,2);
 assert.notDeepEqual(completed,[0,1,2,3,4,5]);
 assert.deepEqual(read.map(page=>page.text),['LINE 0','LINE 1','LINE 2','LINE 3','LINE 4','LINE 5']);
 assert.equal(new Set(started).size,6);
});

test('a failed section returns no partial receipt and releases every OCR worker',async()=>{
 const terminated=[];
 await assert.rejects(()=>readLocalSections([0,1,2,3],{
  concurrency:2,
  createWorker:async()=>({terminate:async()=>terminated.push(true)}),
  readPage:async(_worker,index)=>{if(index===1)throw Error('unreadable section');await new Promise(resolve=>setTimeout(resolve,2));return index;}
 }),/unreadable section/);
 assert.equal(terminated.length,2);
});
