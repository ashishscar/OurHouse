import {validateMetrics,performanceAlerts} from './performance.mjs';
import {createHash} from 'node:crypto';
import {pantryReceipt} from '../receipts/parser.mjs';
import {tidyIngredient,parseAmount} from '../recipes/quantities.mjs';
import {matchesDiet} from '../recipes/diets.mjs';
import {assets,release} from './manifest.mjs';

export const MODEL='@cf/meta/llama-3.2-3b-instruct';
export const INTERVAL=300000;
const ORIGIN='https://ourhouse.ashishpatelaaa0.workers.dev';
const publicGet=path=>fetch(ORIGIN+path,{redirect:'manual',headers:{accept:path.endsWith('.js')?'text/javascript':'application/json'},signal:AbortSignal.timeout(6000)});
export const SIGNALS=['INTERFACE_ERROR','RECIPE_LOOKUP','RECEIPT_SCAN','SAVE_RETRY','NOTIFICATION'];
const ACTIONS=['keep_monitoring','protect_recipe_entry','protect_receipt_entry','refresh_public_interface','needs_tested_release'];
const schema=3;
const initial=()=>({release,schema,lastCheck:0,checks:[],flags:{recipes:true,receipts:true,refreshInterface:false},incidents:[],repairs:[],signals:{},ai:{status:'not_reviewed',lastReview:0,summary:'',actions:[]},budget:{day:'',calls:0},healthyStreak:0});
const limit=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('TIMEOUT')),ms))]).finally(()=>clearTimeout(timer));};
export function validateDecision(value){
 if(!value||typeof value!=='object'||!Array.isArray(value.actions)||value.actions.some(a=>!ACTIONS.includes(a)))throw Error('Invalid agent decision');
 return {summary:typeof value.summary==='string'?value.summary.replace(/[\x00-\x1f]/g,' ').slice(0,400):'',actions:[...new Set(value.actions)].slice(0,5)};
}
export async function probes(env){
 const checks=[];let matchingRelease=true;
 const check=async(code,fn)=>{try{checks.push({code,ok:!!await fn()});}catch{checks.push({code,ok:false,reason:'UNREACHABLE'});}};
 await check('SERVICE',async()=>{if(env.SYNTHETIC_SERVICE_CHECK)return env.SYNTHETIC_SERVICE_CHECK();const r=await publicGet('/api/health');if(!r.ok)return false;const health=await r.json();matchingRelease=health.release===release;return health.ok===true;});
 await check('RECEIPT_LOGIC',()=>{const rows=pantryReceipt('MILK 2L 5.99 F\nTOTAL 5.99');return rows.length===1&&rows[0].name==='MILK'&&rows[0].qty===2&&rows[0].unit==='L'&&rows[0].amount==='5.99'&&!rows[0].pick;});
 await check('RECIPE_LOGIC',()=>tidyIngredient({name:'Rice',qty:250.1234,unit:'g'}).qty===250&&parseAmount('⅓')===1/3&&matchesDiet({name:'Dal',ingredients:[{name:'lentils'}]},'swaminarayan')&&!matchesDiet({ingredients:[{name:'garlic'}]},'swaminarayan')&&!matchesDiet({ingredients:[{name:'milk'}]},'vegan'));
 for(const asset of assets){if(!matchingRelease){checks.push({code:asset.code,ok:false,reason:'RELEASE_MISMATCH'});continue;}await check(asset.code,async()=>{
  const response=await limit(env.ASSETS?.fetch?env.ASSETS.fetch(new Request('https://maintenance.internal'+asset.path)):publicGet(asset.path),6000);
  if(response.status!==200)throw Error('PUBLIC_FILE_UNREACHABLE');
  const bytes=await response.arrayBuffer();return bytes.byteLength<1500000&&createHash('sha256').update(new Uint8Array(bytes)).digest('hex')===asset.hash;
 });}
 return checks;
}
export function recover(state,checks,now){
 const failed=new Set(checks.filter(c=>!c.ok).map(c=>c.code));
 const confirmed=code=>checks.some(c=>c.code===code&&!c.ok&&!c.reason);
 const recipes=!(confirmed('RECIPE_LOGIC')||confirmed('RECIPE_ASSET'));
 const receipts=!(confirmed('RECEIPT_LOGIC')||confirmed('RECEIPT_ASSET'));
 const next={recipes,receipts,refreshInterface:confirmed('INTERFACE_ASSET')};
 state.healthyStreak=failed.size?0:state.healthyStreak+1;
 for(const feature of ['recipes','receipts']){
  if(!next[feature]&&state.flags[feature]){state.flags[feature]=false;state.repairs.push({at:now,code:feature==='recipes'?'RECIPE_PROTECTION':'RECEIPT_PROTECTION'});}
  if(next[feature]&&!state.flags[feature]&&state.healthyStreak>=2){state.flags[feature]=true;state.repairs.push({at:now,code:feature==='recipes'?'RECIPE_RESTORED':'RECEIPT_RESTORED'});}
 }
 state.flags.refreshInterface=next.refreshInterface;
 for(const code of failed)if(!state.incidents.some(i=>i.code===code&&i.open))state.incidents.push({at:now,code,open:true,needsRelease:code!=='SERVICE'});
 for(const incident of state.incidents)if(incident.open&&!failed.has(incident.code)){incident.open=false;incident.resolvedAt=now;}
 state.incidents=state.incidents.slice(-30);state.repairs=state.repairs.slice(-30);
}

// One SQLite-backed object stores technical status only. No family records,
// identifiers, raw errors, stacks, URLs, receipts or deployment credentials.
export class OurHouseMaintenance {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.now=()=>Date.now();this.running=null;this.tail=Promise.resolve();}
 mutate(fn){const pending=this.tail.then(fn,fn);this.tail=pending.catch(()=>{});return pending;}
 async load(){const saved=await this.ctx.storage.get('status');if(saved?.release===release&&saved?.schema===schema)return saved;const fresh=initial();if(saved?.budget&&Number.isInteger(saved.budget.calls)&&saved.budget.calls>=0)fresh.budget=saved.budget;return fresh;}
 async scan(){
  if(this.running)return this.running;
  this.running=this.perform().finally(()=>this.running=null);return this.running;
 }
 async perform(){
  const now=this.now(),state=await this.load();if(now-state.lastCheck<INTERVAL)return state;
  state.checks=await probes(this.env);state.lastCheck=now;recover(state,state.checks,now);
  if(state.signalHour!==Math.floor(now/3600000)){state.signalHour=Math.floor(now/3600000);state.signals={};}
  const signature=JSON.stringify([state.checks,state.signals,performanceAlerts(state.performance)]);
  const day=new Date(now).toISOString().slice(0,10);if(state.performance&&state.performance.day!==day)state.performance={day,counts:{}};if(state.budget.day!==day)state.budget={day,calls:0};
  // At most eight short reviews/day across the whole app; no per-user AI calls.
  const due=!state.ai.lastReview||signature!==state.ai.signature||now-state.ai.lastReview>86400000;
  if(due&&this.env.AI?.run&&state.budget.calls<8&&now-(state.ai.lastAttempt||0)>900000){
   state.budget.calls++;state.ai.lastAttempt=now;state.ai.status='reviewing';await this.ctx.storage.put('status',state);
   try{
    const result=await limit(this.env.AI.run(MODEL,{messages:[
     {role:'system',content:'You maintain OurHouse. Diagnose only the synthetic check results and fixed technical signal counts provided. No user content exists in this input. Return JSON {"summary":"brief technical diagnosis","actions":[...]}. Allowed actions: '+ACTIONS.join(', ')+'. Never propose SQL, account changes, deleting data, disabling authentication, secrets, generated JavaScript or deployment. Failed recipe/receipt checks use their protection actions; other code defects need needs_tested_release. Healthy checks use keep_monitoring. These actions cannot modify family records.'},
     {role:'user',content:JSON.stringify({release,checks:state.checks,signals:state.signals,protection:state.flags,performance:state.performance||{}})},
    ],temperature:0,max_tokens:256,response_format:{type:'json_object'}}),20000);
    const output=result.response;
    const decision=validateDecision(typeof output==='object'?output:JSON.parse(String(output||'').trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')));
    state.ai={...state.ai,...decision,status:'reviewed',lastReview:now,signature,model:MODEL};
    // The model can request only prewritten, condition-checked tools.
    // Recovery revalidates the actual failed checks; model text is never executable.
    state.ai.actions=decision.actions.filter(action=>action==='keep_monitoring'||action==='needs_tested_release'||action==='protect_recipe_entry'&&state.flags.recipes===false||action==='protect_receipt_entry'&&state.flags.receipts===false||action==='refresh_public_interface'&&state.flags.refreshInterface);
    if(decision.actions.includes('needs_tested_release'))state.reviewQueue=Object.entries(state.signals).filter(([,n])=>n>0).map(([code])=>({code,at:now,status:'needs_tested_release'}));
   }catch(error){const provider=String(error?.message||'').match(/\b(?:[1-9]\d{3,5})\b/);state.ai={...state.ai,status:'unavailable',failureCode:error instanceof SyntaxError?'INVALID_JSON':error?.message==='Invalid agent decision'?'INVALID_DECISION':error?.message==='TIMEOUT'?'AI_TIMEOUT':provider?'PROVIDER_'+provider[0]:'AI_UNAVAILABLE',summary:'AI review is temporarily unavailable. Verified protection rules remain active.'};}
  }else if(!this.env.AI?.run)state.ai.status='not_configured';
  await this.ctx.storage.put('status',state);return state;
 }
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/status'&&request.method==='GET')return Response.json(await this.load());
  if(url.pathname==='/scan'&&request.method==='POST')return Response.json(await this.mutate(()=>this.scan()));
  if(url.pathname==='/metrics'&&request.method==='POST')return this.mutate(async()=>{let rows;try{rows=validateMetrics(await request.json());}catch{return Response.json({error:'Technical counts only'},{status:400});}const state=await this.load(),day=new Date(this.now()).toISOString().slice(0,10);if(state.performance?.day!==day)state.performance={day,counts:{}};for(const {metric,bucket,count} of rows){const counters=state.performance.counts[metric]||={};counters[bucket]=Math.min(10000,(counters[bucket]||0)+count);}await this.ctx.storage.put('status',state);return Response.json({received:true});});
  if(url.pathname==='/signal'&&request.method==='POST')return this.mutate(async()=>{
   const {code}=await request.json();if(!SIGNALS.includes(code))return Response.json({error:'Invalid signal'},{status:400});
   // Serialize signal updates with scans to avoid lost counters.
   if(this.running)await this.running;
   const state=await this.load(),hour=Math.floor(this.now()/3600000);
   if(state.signalHour!==hour){state.signalHour=hour;state.signals={};}
   if((state.signals[code]||0)>=100)return Response.json({received:true});state.signals[code]=(state.signals[code]||0)+1;await this.ctx.storage.put('status',state);return Response.json({received:true});
  });
  return Response.json({error:'Not found'},{status:404});
 }
}

const stub=env=>env.CARE_SERVICE||env.MAINTENANCE?.get(env.MAINTENANCE.idFromName('ourhouse-maintenance-v1'));
export async function runMaintenance(env){const agent=stub(env);if(!agent)return {enabled:false};const r=await agent.fetch(new Request('https://maintenance.internal/scan',{method:'POST'}));if(!r.ok)throw Error('MAINTENANCE_UNAVAILABLE');return r.json();}
export async function maintenanceAPI(request,env,identity,headers){
 const reply=(value,status=200)=>Response.json(value,{status,headers});
 const agent=stub(env);if(!agent)return reply({enabled:false,flags:{recipes:true,receipts:true},ai:{status:'not_configured'}},503);
 try{
  if(request.method==='GET'){const response=await agent.fetch('https://maintenance.internal/status');return reply({enabled:true,...await response.json()});}
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(!identity)return reply({error:'Sign in to OurHouse'},401);
  if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Open this request from OurHouse'},403);
  const reader=request.body?.getReader();let text='',size=0;if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>128){await reader.cancel();return reply({error:'Technical codes only'},413);}text+=new TextDecoder().decode(value);}
  let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request'},400);}
  if(!body||typeof body!=='object'||Object.keys(body).some(k=>!['action','code'].includes(k)))return reply({error:'Technical codes only'},400);
  if(body.action==='check')return reply({enabled:true,...await runMaintenance(env)});
  if(body.action==='report'&&SIGNALS.includes(body.code)){const response=await agent.fetch(new Request('https://maintenance.internal/signal',{method:'POST',body:JSON.stringify({code:body.code})}));return reply(await response.json(),response.status);}
  return reply({error:'Invalid maintenance action'},400);
 }catch{return reply({error:'App health is temporarily unavailable',code:'MAINTENANCE_UNAVAILABLE'},503);}
}

export async function recordTechnicalSignal(env,code){try{const agent=stub(env);if(agent&&SIGNALS.includes(code))await agent.fetch(new Request('https://maintenance.internal/signal',{method:'POST',body:JSON.stringify({code})}));}catch{}}
