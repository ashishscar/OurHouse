import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';
import {timingBucket,validateMetrics,performanceAlerts} from '../maintenance/performance.mjs';
import {performanceAPI} from '../maintenance/performance-http.mjs';
test('performance reports use fixed timing buckets with bounded counts and reject free text or identifying fields',()=>{
 assert.equal(timingBucket('SYNC',120),'FAST');assert.equal(timingBucket('STARTUP',2100),'OK');assert.equal(timingBucket('SAVE',3000),'SLOW');assert.equal(timingBucket('FEATURE',4,true),'FAILED');assert.equal(timingBucket('private recipe',1234),null);assert.equal(timingBucket('SYNC',NaN),null);
 for(const body of [{metrics:[{metric:'SYNC',bucket:'FAST',count:1,user:'private'}]},{metrics:[{metric:'private',bucket:'FAST',count:1}]},{metrics:[{metric:'SYNC',bucket:'FAST',count:1}],url:'private'},{metrics:[{metric:'SYNC',bucket:'FAST',count:21}]}])assert.throws(()=>validateMetrics(body));
 assert.deepEqual(performanceAlerts({counts:{SYNC:{FAST:3,SLOW:2},FEATURE:{SLOW:1}}}),['SYNC']);
});
test('only authenticated same-origin bounded reports reach the isolated agent, without sign-in headers or identity fields',async()=>{
 const received=[],env={DB:{prepare(){return {bind(){return {first:async()=>({hits:1})};}};}},CARE_SERVICE:{fetch:async request=>{received.push({body:await request.json(),authorization:request.headers.get('authorization')});return Response.json({received:true});}}},url='https://ourhouse.test/api/performance',body={metrics:[{metric:'SYNC',bucket:'FAST',count:2}]};
 const req=(payload=body,origin='https://ourhouse.test')=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer synthetic_secret'},body:JSON.stringify(payload)});
 assert.equal((await performanceAPI(req(),env,null,{})).status,401);assert.equal((await performanceAPI(req(body,'https://foreign.test'),env,{userId:'private_actor'},{})).status,403);assert.equal((await performanceAPI(req({...body,page:'private family text'}),env,{userId:'private_actor'},{})).status,400);assert.equal((await performanceAPI(req({extra:'x'.repeat(1700)}),env,{userId:'private_actor'},{})).status,413);
 assert.equal((await performanceAPI(req(),env,{userId:'private_actor'},{})).status,200);assert.deepEqual(received,[{body,authorization:null}]);
});
test('browser batches bucket counts without precise durations, URLs or content, and stops reporting immediately when disabled',async()=>{
 const dom=new JSDOM('<p>Very private family screen</p>',{url:'https://ourhouse.test/?private=secret',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
 try{w.AbortSignal=AbortSignal;w.OurHouseAuth={subject:'private_subject',headers:async()=>({authorization:'Bearer private_token'})};w.fetch=async(path,options)=>{calls.push({path,body:options.body});return {ok:true};};w.eval(readFileSync(new URL('../public/ourhouse-metrics.js',import.meta.url),'utf8'));w.OurHouseMetrics.measure('SYNC',123.456789);w.OurHouseMetrics.measure('SYNC',123.456789);await w.OurHouseMetrics.flush();assert.deepEqual(JSON.parse(calls[0].body),{metrics:[{metric:'SYNC',bucket:'FAST',count:2}]});assert.doesNotMatch(calls[0].body,/123|private|token|https|screen/);w.OurHouseMetrics.measure('SAVE',5000,true);w.OurHouseMetrics.setSharing(false);await w.OurHouseMetrics.flush();assert.equal(calls.length,1);assert.equal(w.localStorage.getItem('ourhouse.technical-counts'),'off');}finally{w.close();}
});
