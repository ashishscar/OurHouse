import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OurHouseMaintenance,maintenanceAPI,probes,validateDecision,INTERVAL} from '../maintenance/agent.mjs';
import {release} from '../maintenance/manifest.mjs';

function fixture(){
 const stored=new Map(),calls=[];let broken=false,invalid=false;
 const env={PRIVATE_KEY:'synthetic_secret_never_sent',SYNTHETIC_SERVICE_CHECK:async()=>true,ASSETS:{fetch:async request=>{const path=new URL(request.url).pathname;return new Response(broken&&path.includes('recipes')?'bad asset':readFileSync(new URL('../public'+path,import.meta.url)));}},AI:{run:async(model,input)=>{calls.push({model,input});return {response:invalid?'not json':JSON.stringify({summary:'Verified synthetic checks reviewed.',actions:broken?['protect_recipe_entry','needs_tested_release']:['keep_monitoring']})};}}};
 const ctx={storage:{get:async key=>stored.has(key)?structuredClone(stored.get(key)):undefined,put:async(key,value)=>{stored.set(key,structuredClone(value));}}};
 const agent=new OurHouseMaintenance(ctx,env);let now=1800000000000;agent.now=()=>now;
 env.MAINTENANCE={idFromName:name=>name,get:()=>({fetch:request=>agent.fetch(typeof request==='string'?new Request(request):request)})};
 return {agent,env,calls,stored,advance(ms=INTERVAL+1){now+=ms;},break(){broken=true;},fix(){broken=false;},invalid(){invalid=true;}};
}
test('built-in agent checks synthetic logic and public assets, calls the real AI interface, and sends no household material',async()=>{
 const f=fixture();assert.ok((await probes(f.env)).every(c=>c.ok));
 const status=await f.agent.scan();assert.equal(status.release,release);assert.equal(status.ai.status,'reviewed');assert.equal(f.calls.length,1);
 const prompt=JSON.stringify(f.calls[0]);assert.doesNotMatch(prompt,/synthetic_secret_never_sent|SELECT|provider|authorization|email|householdId/);assert.equal(f.env.DB,undefined);
 await Promise.all(Array.from({length:10},()=>f.agent.scan()));assert.equal(f.calls.length,1);assert.equal(status.flags.recipes,true);
});
test('bad recipe assets are protected and restored only after two healthy checks; arbitrary AI actions are rejected',async()=>{
 const f=fixture();f.break();let state=await f.agent.scan();assert.equal(state.flags.recipes,false);assert.equal(state.repairs.length,1);assert.equal(state.ai.actions.includes('protect_recipe_entry'),true);
 f.fix();f.advance();state=await f.agent.scan();assert.equal(state.flags.recipes,false);f.advance();state=await f.agent.scan();assert.equal(state.flags.recipes,true);assert.equal(state.repairs.at(-1).code,'RECIPE_RESTORED');
 assert.throws(()=>validateDecision({summary:'do damage',actions:['delete-account']}));assert.throws(()=>validateDecision({actions:['run_sql']}));assert.throws(()=>validateDecision({actions:['deploy_code']}));
});
test('AI failure leaves verified protection active and total daily inference is capped',async()=>{
 const f=fixture();f.break();f.invalid();let state=await f.agent.scan();assert.equal(state.flags.recipes,false);assert.equal(state.ai.status,'unavailable');
 for(let i=0;i<15;i++){f.advance(900001);state=await f.agent.scan();}assert.equal(f.calls.length,8);assert.equal(state.budget.calls,8);assert.equal(state.flags.recipes,false);
});
test('public maintenance status is read-only, mutations require verified identity and origin, and reports accept fixed codes only',async()=>{
 const f=fixture(),url='https://ourhouse.test/api/maintenance',headers={'cache-control':'no-store'},identity={userId:'synthetic_actor'};
 const post=(body,origin='https://ourhouse.test')=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await maintenanceAPI(new Request(url),f.env,null,headers)).status,200);assert.equal(f.calls.length,0);
 assert.equal((await maintenanceAPI(post({action:'check'}),f.env,null,headers)).status,401);
 assert.equal((await maintenanceAPI(post({action:'check'},'https://evil.test'),f.env,identity,headers)).status,403);
 assert.equal((await maintenanceAPI(post({action:'report',code:'RECIPE_LOOKUP',recipe:'private'}),f.env,identity,headers)).status,400);
 assert.equal((await maintenanceAPI(post({action:'report',code:'anything private'}),f.env,identity,headers)).status,400);
 assert.equal((await maintenanceAPI(post({action:'report',code:'RECIPE_LOOKUP',extra:'x'.repeat(300)}),f.env,identity,headers)).status,413);
 assert.equal((await maintenanceAPI(post({action:'report',code:'RECIPE_LOOKUP'}),f.env,identity,headers)).status,200);
 const status=await(await maintenanceAPI(post({action:'check'}),f.env,identity,headers)).json();assert.equal(status.ai.status,'reviewed');assert.doesNotMatch(JSON.stringify(status),/synthetic_actor|private/);
});
test('concurrent reports do not lose counts or cross the hourly storage cap',async()=>{
 const f=fixture();const send=()=>f.agent.fetch(new Request('https://maintenance.internal/signal',{method:'POST',body:JSON.stringify({code:'SAVE_RETRY'})}));
 await Promise.all(Array.from({length:20},send));let status=await(await f.agent.fetch(new Request('https://maintenance.internal/status'))).json();assert.equal(status.signals.SAVE_RETRY,20);
 await Promise.all(Array.from({length:110},send));status=await(await f.agent.fetch(new Request('https://maintenance.internal/status'))).json();assert.equal(status.signals.SAVE_RETRY,100);
});
test('hosted care worker has no family data bindings or public endpoint, and release changes preserve the daily AI budget',async()=>{
 const config=JSON.parse(readFileSync(new URL('../maintenance/wrangler.json',import.meta.url)));assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);assert.equal(config.observability.enabled,false);
 for(const key of ['d1_databases','r2_buckets','services','vars','routes'])assert.equal(config[key],undefined);
 const f=fixture();const state=await f.agent.scan();f.stored.set('status',{...state,release:-1,budget:{...state.budget,calls:8}});f.advance(900001);const next=await f.agent.scan();assert.equal(next.budget.calls,8);assert.equal(f.calls.length,1);
});
test('a probe routing outage does not disable working recipe and receipt tools',async()=>{
 const f=fixture();f.env.ASSETS.fetch=async()=>{throw Error('transport unavailable');};const state=await f.agent.scan();assert.equal(state.checks.find(c=>c.code==='RECIPE_ASSET').reason,'UNREACHABLE');assert.equal(state.flags.recipes,true);assert.equal(state.flags.receipts,true);assert.equal(state.flags.refreshInterface,false);
});
test('Cloudflare JSON mode object responses are validated as well as text responses',async()=>{
 const f=fixture();f.env.AI.run=async()=>({response:{summary:'Synthetic examples are healthy.',actions:['keep_monitoring']}});const state=await f.agent.scan();assert.equal(state.ai.status,'reviewed');assert.deepEqual(state.ai.actions,['keep_monitoring']);assert.equal(state.ai.summary,'Synthetic examples are healthy.');
});

test('performance aggregation is serialized, capped and technical only; fixed aggregates are the only added AI input',async()=>{
 const f=fixture();const report=body=>f.agent.fetch(new Request('https://maintenance.internal/metrics',{method:'POST',body:JSON.stringify(body)}));
 await Promise.all(Array.from({length:20},()=>report({metrics:[{metric:'SYNC',bucket:'SLOW',count:2}]})));
 let state=await f.agent.scan();assert.equal(state.performance.counts.SYNC.SLOW,40);assert.equal(JSON.parse(f.calls[0].input.messages.at(-1).content).performance.counts.SYNC.SLOW,40);assert.doesNotMatch(JSON.stringify(f.calls[0].input),/synthetic_secret_never_sent|private_actor|authorization/);
 assert.equal((await report({metrics:[{metric:'SYNC',bucket:'SLOW',count:2,recipe:'private'}]})).status,400);
 await Promise.all(Array.from({length:510},()=>report({metrics:[{metric:'SYNC',bucket:'SLOW',count:20}]})));state=await f.agent.load();assert.equal(state.performance.counts.SYNC.SLOW,10000);
});
