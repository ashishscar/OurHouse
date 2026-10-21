import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {receiptBucket} from '../lib/receipt-storage.mjs';
import {SecureStore} from '../lib/secure-store.mjs';
import * as C from '../crypto/e2ee.mjs';

const env={OURHOUSE_SUPABASE_URL:'https://receipt-fixture.supabase.co',OURHOUSE_SUPABASE_SECRET_KEY:'sb_secret_server_fixture_only',OURHOUSE_RECEIPT_BUCKET:'ourhouse-receipts'};
const key='sealed/'+ 'a'.repeat(32)+'/'+ 'b'.repeat(32)+'/'+ 'c'.repeat(64);
function provider(){
 const files=new Map(), calls=[];let failDelete=false,failGet=false;
 return {files,calls,set failDelete(v){failDelete=v;},set failGet(v){failGet=v;},async fetch(target,options={}){
  const url=new URL(target),headers=new Headers(options.headers),method=options.method||'GET';
  assert.equal(url.origin,env.OURHOUSE_SUPABASE_URL);assert.equal(options.redirect,'manual');
  assert.equal(headers.get('apikey'),env.OURHOUSE_SUPABASE_SECRET_KEY);
  assert.ok(url.pathname.startsWith('/storage/v1/object/'));assert.ok(!url.pathname.includes('/public/'));
  calls.push({path:url.pathname,method,body:options.body,headers});
  if(method==='POST'){
   assert.equal(headers.get('content-type'),'application/octet-stream');assert.equal(headers.get('x-upsert'),'true');
   files.set(url.pathname.split('/ourhouse-receipts/')[1],options.body);return Response.json({Key:'stored'});
  }
  if(method==='DELETE'){
   if(failDelete)return Response.json({message:'temporary outage'},{status:503});
   const {prefixes}=JSON.parse(options.body);prefixes.forEach(k=>files.delete(k));return Response.json(prefixes.map(name=>({name})));
  }
  if(failGet)return Response.json({message:'unauthorized'},{status:401});
  const name=url.pathname.split('/ourhouse-receipts/')[1];
  return files.has(name)?new Response(files.get(name),{headers:{'content-type':'application/octet-stream'}}):Response.json({message:'Object not found',statusCode:'404',error:'not_found'},{status:404});
 }};
}

test('private storage uses the server SDK with opaque paths, encrypted bytes, no public URLs and bounded metadata',async()=>{
 const remote=provider(),bucket=receiptBucket(env,remote.fetch),secret=C.random(32),file={name:'private.pdf',data:'confidential dinner receipt'},payload=JSON.stringify(C.seal(secret,file,{purpose:'test'}));
 await bucket.put(key,payload);assert.ok(!remote.files.get(key).includes(file.name));assert.ok(!remote.files.get(key).includes(file.data));
 assert.deepEqual(C.open(secret,JSON.parse(await (await bucket.get(key)).text()),{purpose:'test'}),file);
 await bucket.delete([key]);assert.equal(await bucket.get(key),null);
});

test('storage outages and failed authorization remain errors rather than being mistaken for missing receipts',async()=>{
 const remote=provider(),bucket=receiptBucket(env,remote.fetch);remote.failGet=true;
 await assert.rejects(()=>bucket.get(key),e=>e.status===503);remote.failGet=false;
 assert.equal(await bucket.get(key),null);remote.failDelete=true;
 await assert.rejects(()=>bucket.delete(key),e=>e.status===503);
});

test('receipt adapter rejects arbitrary URLs, traversal, plaintext paths and oversized uploads before a provider request',async()=>{
 let calls=0;const bucket=receiptBucket(env,async()=>{calls++;throw Error('unexpected request');});
 for(const path of ['https://evil.example/x','sealed/../x','family/receipt.pdf',key+'/extra'])await assert.rejects(()=>bucket.get(path),e=>e.status===400);
 await assert.rejects(()=>bucket.put(key,'x'.repeat(1500001)),e=>e.status===413);assert.equal(calls,0);
 for(const override of [{OURHOUSE_SUPABASE_URL:'https://evil.example'},{OURHOUSE_SUPABASE_URL:'http://receipt-fixture.supabase.co'},{OURHOUSE_SUPABASE_SECRET_KEY:'sb_publishable_not_server'},{OURHOUSE_RECEIPT_BUCKET:'../other'}])assert.throws(()=>receiptBucket({...env,...override}),e=>e.status===503);
});

test('encrypted D1 receipts retain family authorization, idempotent uploads and retryable owner cleanup with private Supabase storage',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],cf:false});
 try{
  const db=await mf.getD1Database('DB');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())for(const q of readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8').split('--> statement-breakpoint'))if(q.trim())await db.prepare(q).run();
  const remote=provider(),bucket=receiptBucket(env,remote.fetch),store=new SecureStore(db,bucket),who=await store.identity({userId:'fixture-owner',email:'fixture@example.invalid'}),other=await store.identity({userId:'fixture-other',email:'fixture@example.invalid'});
  const vault=await C.createVault(who,'synthetic fixture passphrase'),house=C.hex(C.random(16)),epoch=C.hex(C.random(16)),familyKey=C.random(32);
  await store.putVault(who,vault.vault,0);await store.create(who,{id:house,epoch,tree:C.encryptTree(familyKey,{familyMeta:{name:'private fixture'}},house,epoch),vault:{...vault.vault,bundle:C.wrapKeyring(who,{keys:[{house,epoch,key:C.hex(familyKey)}]},vault.root)},vaultRevision:1});
  const scope={actor:who,house,epoch,id:C.hex(C.random(32))},file={name:'private family receipt.pdf',data:'private family bytes'},packet=C.seal(familyKey,file,{purpose:'fixture'});
  const saved=await store.receipt(who,scope,packet);assert.deepEqual(C.open(familyKey,saved.payload,{purpose:'fixture'}),file);await store.receipt(who,scope,packet);assert.equal(remote.files.size,1);
  const before=remote.calls.length;await assert.rejects(()=>store.receipt(other,{...scope,actor:other},null),e=>e.status===403);assert.equal(remote.calls.length,before);
  await assert.rejects(()=>store.receipt(who,scope,C.seal(familyKey,{changed:true},{purpose:'fixture'})),e=>e.code==='RECEIPT_RETRY');
  await store.deleteAccount(who,'DELETE');remote.failDelete=true;await assert.rejects(()=>store.cleanup());assert.equal((await db.prepare('SELECT count(*) n FROM cleanup').first()).n,1);
  remote.failDelete=false;await store.cleanup();assert.equal(remote.files.size,0);assert.equal((await db.prepare('SELECT count(*) n FROM cleanup').first()).n,0);
 }finally{await mf.dispose();}
});
