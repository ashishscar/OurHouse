import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {evaluateReceipt} from '../../receipts/evaluation.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/receipt-training/evaluate.mjs PRIVATE_PREDICTIONS.jsonl PRIVATE_REPORT.json');
const root=path.resolve(import.meta.dirname,'../..'),destination=path.resolve(output);
if(destination===root||destination.startsWith(root+path.sep)){
 try{execFileSync('git',['check-ignore','--quiet',destination],{cwd:root});}catch{throw Error('Report must be Git-ignored or outside the checkout');}
}
if(existsSync(destination))throw Error('Do not overwrite an existing evaluation');
const groups=new Map();
for(const line of readFileSync(input,'utf8').split('\n').filter(Boolean)){
 const record=JSON.parse(line),key=String(record.source_group);let group=groups.get(key);
 if(!group)groups.set(key,group={expected:{rows:[]},predicted:{rows:[]},seconds:0,crops:0,valid:true,truncated:false});
 group.expected.rows.push(...record.expected.rows);group.seconds+=record.seconds;group.crops++;
 group.truncated||=record.finish_reason!=='stop';
 try{const parsed=JSON.parse(record.prediction.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));if(!Array.isArray(parsed.rows))throw Error();group.predicted.rows.push(...parsed.rows);}catch{group.valid=false;}
}
const cases=[...groups].map(([source,g])=>({source,crops:g.crops,sequentialLocalSeconds:g.seconds,truncated:g.truncated,
 ...evaluateReceipt(g.expected,g.valid&&!g.truncated?g.predicted:null)}));
const counters=['expected','predicted','matched','missing','extra','labelExact','amountExact','stockExact','nameExact','categoryExact','allFieldsExact'];
const aggregate=Object.fromEntries(counters.map(key=>[key,cases.reduce((sum,c)=>sum+c[key],0)]));
aggregate.recall=aggregate.matched/Math.max(aggregate.expected,1);aggregate.precision=aggregate.matched/Math.max(aggregate.predicted,1);
writeFileSync(destination,JSON.stringify({cases,aggregate,notes:'Private cropped-image local benchmark. Not an end-to-end phone latency measurement. Same decoding settings required for base/adapter comparison.'},null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({receipts:cases.length,...aggregate}));
