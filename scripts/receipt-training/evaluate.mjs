import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {evaluateReceipt} from '../../receipts/evaluation.mjs';
const keyOf=record=>JSON.stringify([String(record.source_group),record.images]);
const readRows=file=>readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));

// Independent references define the denominator, including missing crops.
export function evaluatePredictions(records,references){
 if(!references.length)throw Error('Reference split must not be empty');
 const expected=new Map(),predictions=new Map(),groups=new Map();
 for(const reference of references){
  if(!Array.isArray(reference.images)||!reference.images.length)throw Error('Missing reference image identity');
  const key=keyOf(reference);if(expected.has(key))throw Error('Duplicate reference crop');
  const completion=reference.messages.at(-1);if(completion?.role!=='assistant')throw Error('Missing reference completion');
  expected.set(key,{reference,rows:JSON.parse(completion.content).rows});
 }
 for(const record of records){
  const key=keyOf(record),target=expected.get(key);
  if(!target)throw Error('Prediction is not in the requested reference split');
  if(predictions.has(key))throw Error('Duplicate prediction crop');
  if(JSON.stringify(record.expected?.rows)!==JSON.stringify(target.rows))throw Error('Prediction reference differs from independent split');
  if(!Number.isFinite(record.seconds)||record.seconds<0)throw Error('Invalid inference duration');
  predictions.set(key,record);
 }
 for(const[key,{reference,rows}]of expected){
  const source=String(reference.source_group);let group=groups.get(source);
  if(!group)groups.set(source,group={expected:{rows:[]},predicted:{rows:[]},seconds:0,crops:0,missingCrops:0,valid:true,truncated:false,unknownFinish:0,providerFailures:0});
  group.expected.rows.push(...rows);group.crops++;
  const record=predictions.get(key);
  if(!record){group.missingCrops++;group.valid=false;continue;}
  group.seconds+=record.seconds;
  if(record.provider_success===false){group.providerFailures++;group.valid=false;}
  if(record.finish_reason==='unspecified'||record.finish_reason==null)group.unknownFinish++;
  else if(record.finish_reason!=='stop')group.truncated=true;
  try{const parsed=JSON.parse(record.prediction.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));if(!Array.isArray(parsed.rows))throw Error();group.predicted.rows.push(...parsed.rows);}catch{group.valid=false;}
 }
 const cases=[...groups].map(([source,g])=>({source,crops:g.crops,missingCrops:g.missingCrops,sequentialInferenceSeconds:g.seconds,
  truncated:g.truncated,unknownFinish:g.unknownFinish,providerFailures:g.providerFailures,
  ...evaluateReceipt(g.expected,g.valid&&!g.truncated?g.predicted:null)}));
 const counters=['expected','predicted','matched','missing','extra','labelExact','amountExact','stockExact','nameExact','categoryExact','allFieldsExact'];
 const aggregate=Object.fromEntries(counters.map(key=>[key,cases.reduce((sum,c)=>sum+c[key],0)]));
 aggregate.recall=aggregate.matched/Math.max(aggregate.expected,1);aggregate.precision=aggregate.matched/Math.max(aggregate.predicted,1);
 return {completeSplit:predictions.size===expected.size,expectedCrops:expected.size,receivedCrops:predictions.size,cases,aggregate,
  notes:'Private cropped-image benchmark. Not end-to-end phone latency. Unknown finish reasons do not establish provider completion. Same decoding settings required for comparison.'};
}

function main(){
const [input,output,referenceFile]=process.argv.slice(2);
if(!input||!output||!referenceFile)throw Error('Usage: node scripts/receipt-training/evaluate.mjs PRIVATE_PREDICTIONS.jsonl PRIVATE_REPORT.json PRIVATE_REFERENCE_SPLIT.jsonl');
const root=path.resolve(import.meta.dirname,'../..'),destination=path.resolve(output);
if(destination===root||destination.startsWith(root+path.sep)){
 try{execFileSync('git',['check-ignore','--quiet',destination],{cwd:root});}catch{throw Error('Report must be Git-ignored or outside the checkout');}
}
if(existsSync(destination))throw Error('Do not overwrite an existing evaluation');
const report=evaluatePredictions(readRows(input),readRows(referenceFile));
writeFileSync(destination,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({receipts:report.cases.length,completeSplit:report.completeSplit,...report.aggregate}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
