import test from 'node:test';import assert from 'node:assert/strict';import {Miniflare} from 'miniflare';import {readFileSync,readdirSync} from 'node:fs';import {handleAPI} from '../lib/http.mjs';import {SecureStore} from '../lib/secure-store.mjs';import {consumerIdentity,providerSubject,dispatchAuthCleanup} from '../launch/identity.mjs';import {digest} from '../lib/cloud-store.mjs';import * as C from '../crypto/e2ee.mjs';
test('verified Google/email subjects isolate family, vault, writes and receipts despite spoofed identity or identical email',{timeout:15000},async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['BUCKET'],cf:false}),network=globalThis.fetch;
 const env={DB:await mf.getD1Database('DB'),BUCKET:await mf.getR2Bucket('BUCKET'),OURHOUSE_PUBLIC_SIGNUP:'enabled',OURHOUSE_SUPABASE_URL:'https://ourhouse-qa.supabase.co',OURHOUSE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_fixture_only',OURHOUSE_GOOGLE_SIGNIN:'enabled'},origin='https://ourhouse.test',ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'],tokens=['a'.repeat(40),'b'.repeat(40)],records=[];
 globalThis.fetch=async(url,options)=>{if(String(url).startsWith(env.OURHOUSE_SUPABASE_URL)){assert.equal(String(url),env.OURHOUSE_SUPABASE_URL+'/auth/v1/user');assert.equal(options.redirect,'manual');const token=new Headers(options.headers).get('authorization')?.slice(7),index=tokens.indexOf(token);return index<0?Response.json({message:'expired'},{status:401}):Response.json({id:ids[index],email:'same@example.invalid',email_confirmed_at:'2026-10-15',app_metadata:{provider:index?'email':'google'},user_metadata:{display_name:index?'B':'A'}});}return network(url,options);};
 try{
  for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())for(const q of readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8').split('--> statement-breakpoint'))if(q.trim())await env.DB.prepare(q).run();
  const s=new SecureStore(env.DB,env.BUCKET);
  const call=async(index,path,body,spoof=null)=>{const response=await handleAPI(new Request(origin+'/api/secure/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tokens[index],'x-ourhouse-auth':'supabase',origin,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,spoof);const data=await response.json();return {response,data};};
  for(let i=0;i<2;i++){
   const {response,data}=await call(i,'session');assert.equal(response.status,200);assert.equal(data.house,null);const user=data.user.id,v=await C.createVault(user,'synthetic fixture password'),key=C.random(32),house=C.hex(C.random(16)),epoch=C.hex(C.random(16)),tree={familyMeta:{name:'Private family '+i},pantry:{rice:{name:'Private rice '+i,qty:3,unit:'kg'}}};
   assert.equal((await call(i,'vault',{actor:user,vault:v.vault,revision:0})).response.status,200);
   const created=await call(i,'house',{actor:user,id:house,epoch,tree:C.encryptTree(key,tree,house,epoch),vault:{...v.vault,bundle:C.wrapKeyring(user,{keys:[{house,epoch,key:C.hex(key)}]},v.root)},vaultRevision:1});assert.equal(created.response.status,200);records.push({user,v,key,house,epoch,tree});
  }
  const [a,b]=records;assert.notEqual(a.user,b.user);assert.notEqual(a.house,b.house);
  const snapshot=(await call(1,'session',null,{userId:'supabase:'+providerSubject(env.OURHOUSE_SUPABASE_URL,ids[0]),email:'same@example.invalid'})).data;
  assert.equal(snapshot.user.id,b.user);assert.equal(snapshot.house.id,b.house);assert.deepEqual(C.decryptTree(b.key,snapshot.tree,b.house,b.epoch),b.tree);assert.throws(()=>C.decryptTree(a.key,snapshot.tree,b.house,b.epoch));
  const attack=await call(1,'changes',{actor:a.user,house:a.house,epoch:a.epoch,id:'spoofed_actor',changes:[]});assert.equal(attack.response.status,409);assert.equal(attack.data.code,'STALE_CONTEXT');
  const foreign=await call(1,'changes',{actor:b.user,house:a.house,epoch:a.epoch,id:'foreign_family',changes:[]});assert.equal(foreign.response.status,409);
  const receipt=await call(1,'receipt',{actor:b.user,house:b.house,scope:{actor:b.user,house:a.house,epoch:a.epoch,id:C.hex(C.random(32))}});assert.equal(receipt.response.status,403);
  const alteredEmail=await consumerIdentity(new Request(origin,{headers:{authorization:'Bearer '+tokens[0]}}),env,async()=>Response.json({id:ids[0],email:'changed@example.invalid',email_confirmed_at:'2026-10-15'}));assert.equal(await s.identity(alteredEmail),a.user);
  const otherProject=await consumerIdentity(new Request(origin,{headers:{authorization:'Bearer '+tokens[0]}}),{...env,OURHOUSE_SUPABASE_URL:'https://another-project.supabase.co'},async()=>Response.json({id:ids[0],email:'same@example.invalid',email_confirmed_at:'2026-10-15'}));assert.notEqual(await s.identity(otherProject),a.user);
  const expired=await handleAPI(new Request(origin+'/api/secure/session',{headers:{authorization:'Bearer '+('x'.repeat(40)),'x-ourhouse-auth':'supabase'}}),env,{userId:'spoof',email:'same@example.invalid'});assert.equal(expired.status,401);
  const stored=JSON.stringify(await s.all('SELECT * FROM secure_houses'));for(const privateValue of ['Private family','Private rice',C.hex(a.key),a.v.recoveryCode])assert.ok(!stored.includes(privateValue));assert.deepEqual(C.decryptTree(a.key,(await s.snapshot(a.user)).tree,a.house,a.epoch),a.tree);
 }finally{globalThis.fetch=network;await mf.dispose();}
});
test('provider cleanup will not delete a same-UUID account from a different Supabase project',async()=>{
 const subject='old-project.supabase.co:11111111-1111-4111-8111-111111111111',jobs=[{id:digest(subject),subject,attempts:0}];let requests=0;
 const env={OURHOUSE_SUPABASE_URL:'https://new-project.supabase.co',OURHOUSE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_fixture_only',OURHOUSE_SUPABASE_SECRET_KEY:'server_fixture',DB:{prepare:()=>({bind:()=>({all:async()=>({results:jobs})})})}};
 await dispatchAuthCleanup(env,async()=>{requests++;return new Response('',{status:200})});assert.equal(requests,0);
});
