import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {release} from '../maintenance/manifest.mjs';
test('maintenance status and synthetic checks persist inside an actual SQLite Durable Object runtime',async()=>{
 const output=await build({stdin:{contents:"export {OurHouseMaintenance} from './maintenance/agent.mjs'; export default {fetch(request,env){return env.MAINTENANCE.get(env.MAINTENANCE.idFromName('synthetic-only')).fetch(request);}};",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',external:['node:crypto']});
 const options={modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],durableObjects:{MAINTENANCE:{className:'OurHouseMaintenance',useSQLite:true}},cf:false};
 const mf=new Miniflare({...options,outboundService:async request=>{const url=new URL(request.url);assert.equal(url.origin,'https://ourhouse.ashishpatelaaa0.workers.dev');assert.equal(request.headers.get('authorization'),null);return url.pathname==='/api/health'?Response.json({ok:true,release}):new Response(readFileSync(new URL('../public'+url.pathname,import.meta.url)));}});
 try{const scan=await mf.dispatchFetch('https://maintenance.internal/scan',{method:'POST'});assert.equal(scan.status,200);const status=await scan.json();assert.ok(status.checks.every(c=>c.ok));assert.equal(status.ai.status,'not_configured');assert.equal(status.flags.recipes,true);const saved=await(await mf.dispatchFetch('https://maintenance.internal/status')).json();assert.equal(saved.lastCheck,status.lastCheck);assert.equal(saved.checks.length,status.checks.length);assert.equal(saved.flags.receipts,true);}finally{await mf.dispose();}
 const rolling=new Miniflare({...options,outboundService:async request=>{assert.equal(new URL(request.url).pathname,'/api/health');return Response.json({ok:true,release:release+1});}});
 try{const status=await(await rolling.dispatchFetch('https://maintenance.internal/scan',{method:'POST'})).json();assert.equal(status.flags.recipes,true);assert.equal(status.flags.receipts,true);assert.equal(status.flags.refreshInterface,false);assert.equal(status.checks.find(c=>c.code==='RECIPE_ASSET').reason,'RELEASE_MISMATCH');}finally{await rolling.dispose();}
});
