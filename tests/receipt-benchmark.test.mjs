import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePredictions} from '../scripts/receipt-training/evaluate.mjs';

const row=['RICE 1KG','2.00','','Rice','p'];
const reference=(image,rows=[row])=>({source_group:'synthetic',images:[image],messages:[{role:'assistant',content:JSON.stringify({rows})}]});
const prediction=(ref,overrides={})=>({source_group:ref.source_group,images:ref.images,expected:JSON.parse(ref.messages[0].content),prediction:ref.messages[0].content,seconds:1,finish_reason:'stop',...overrides});

test('missing crops retain all independently expected purchases',()=>{
 const refs=[reference('a'),reference('b')],report=evaluatePredictions([prediction(refs[0])],refs);
 assert.equal(report.completeSplit,false);assert.equal(report.expectedCrops,2);
 assert.equal(report.aggregate.expected,2);assert.equal(report.cases[0].missingCrops,1);assert.equal(report.cases[0].valid,false);
});
test('duplicate crops and modified references cannot improve benchmark scores',()=>{
 const ref=reference('a'),record=prediction(ref);
 assert.throws(()=>evaluatePredictions([record,record],[ref]),/Duplicate prediction/);
 assert.throws(()=>evaluatePredictions([prediction(ref,{expected:{rows:[]}})],[ref]),/differs/);
 assert.throws(()=>evaluatePredictions([prediction(reference('other'))],[ref]),/not in/);
});
test('unknown provider finish is distinguished from known truncation',()=>{
 const ref=reference('a');
 const unknown=evaluatePredictions([prediction(ref,{finish_reason:'unspecified'})],[ref]);
 assert.equal(unknown.cases[0].unknownFinish,1);assert.equal(unknown.cases[0].truncated,false);assert.equal(unknown.aggregate.allFieldsExact,1);
 const truncated=evaluatePredictions([prediction(ref,{finish_reason:'length'})],[ref]);
 assert.equal(truncated.cases[0].truncated,true);assert.equal(truncated.cases[0].valid,false);
});
test('a provider failure cannot pass even when its payload contains valid JSON',()=>{
 const ref=reference('a'),report=evaluatePredictions([prediction(ref,{provider_success:false})],[ref]);
 assert.equal(report.cases[0].providerFailures,1);assert.equal(report.cases[0].valid,false);
});
