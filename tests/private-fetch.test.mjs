import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {privateFetch} from '../lib/private-fetch.mjs';
import {consumerIdentity,dispatchAuthCleanup} from '../launch/identity.mjs';
import {receiptBucket} from '../lib/receipt-storage.mjs';

test('private service requests run in Workers and never follow redirects with credentials',async()=>{
 let redirect=false,calls=0;
 const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',cf:false,
  script:`${privateFetch.toString()}
   export default {async fetch(){try {
    const response=await privateFetch(fetch,'https://private-service.invalid/user',{headers:{Authorization:'Bearer synthetic_fixture_only'}});
    return Response.json({status:response.status});
   }catch{return Response.json({redirectRejected:true},{status:502});}}};`,
  outboundService:request=>{
   calls++;assert.equal(new URL(request.url).hostname,'private-service.invalid');
   assert.equal(request.headers.get('authorization'),'Bearer synthetic_fixture_only');
   return redirect?new Response('',{status:302,headers:{Location:'https://unexpected.invalid/collect'}}):Response.json({ok:true});
  }});
 try{
  assert.equal((await mf.dispatchFetch('https://ourhouse.invalid/')).status,200);
  redirect=true;const response=await mf.dispatchFetch('https://ourhouse.invalid/');
  assert.equal(response.status,502);assert.equal((await response.json()).redirectRejected,true);
  assert.equal(calls,2,'redirect target must not receive a request');
 }finally{await mf.dispose();}
});

test('provider redirects cannot authenticate users or clear account-deletion retry jobs',async()=>{
 const subject='11111111-1111-4111-8111-111111111111',updates=[];
 const env={OURHOUSE_PUBLIC_SIGNUP:'enabled',OURHOUSE_SUPABASE_URL:'https://fixture.supabase.co',OURHOUSE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_fixture_only',OURHOUSE_SUPABASE_SECRET_KEY:'sb_secret_synthetic_fixture_only',DB:{prepare:sql=>({bind:()=>({all:async()=>({results:[{id:'fixture',subject:'fixture.supabase.co:'+subject,attempts:0}]}),run:async()=>{updates.push(sql);}})})}};
 let calls=0;
 const redirect=async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response('',{status:307,headers:{Location:'https://unexpected.invalid/'}});};
 await assert.rejects(()=>consumerIdentity(new Request('https://ourhouse.invalid/',{headers:{Authorization:'Bearer '+('a'.repeat(40))}}),env,redirect),e=>e.code==='AUTH_UNAVAILABLE');
 await dispatchAuthCleanup(env,redirect);
 assert.equal(calls,2);assert.equal(updates.length,1);assert.ok(updates[0].includes('attempts=attempts+1'));
});

test('receipt redirects remain failures for downloads, uploads and deletions',async()=>{
 const env={OURHOUSE_SUPABASE_URL:'https://fixture.supabase.co',OURHOUSE_SUPABASE_SECRET_KEY:'sb_secret_synthetic_fixture_only',OURHOUSE_RECEIPT_BUCKET:'ourhouse-receipts'};
 let calls=0;
 const bucket=receiptBucket(env,async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response('',{status:308,headers:{Location:'https://unexpected.invalid/'}});});
 const path='sealed/'+['a','b','c'].map(x=>x.repeat(32)).join('/');
 for(const operation of [()=>bucket.get(path),()=>bucket.put(path,'encrypted_fixture'),()=>bucket.delete(path)])await assert.rejects(operation,e=>e.code==='STORAGE_UNAVAILABLE');
 assert.equal(calls,3,'each operation must fail before requesting a redirect target');
});
