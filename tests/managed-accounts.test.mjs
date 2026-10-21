import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAPI} from '../lib/http.mjs';
import {SecureStore} from '../lib/secure-store.mjs';
import {accountSession,connectAccount} from '../lib/managed-accounts.mjs';
import * as C from '../crypto/e2ee.mjs';

async function fixture(){
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['BUCKET'],cf:false});
 const env={DB:await mf.getD1Database('DB'),BUCKET:await mf.getR2Bucket('BUCKET'),OURHOUSE_ACCOUNT_SIGNIN:'managed',OURHOUSE_ACCOUNT_KEY:'ab'.repeat(32)};
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())for(const q of readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8').split('--> statement-breakpoint'))if(q.trim())await env.DB.prepare(q).run();
 const store=new SecureStore(env.DB,env.BUCKET),identities=[{userId:'managed-a',email:'same@example.invalid'},{userId:'managed-b',email:'same@example.invalid'},{userId:'managed-c',email:'other@example.invalid'}],users=await Promise.all(identities.map(i=>store.identity(i)));
 const call=async(index,path,body,origin='https://ourhouse.test')=>{
  const response=await handleAPI(new Request('https://ourhouse.test/api/secure/'+path,{method:body?'POST':'GET',headers:{origin,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,index===null?null:identities[index]);
  return {status:response.status,headers:response.headers,body:await response.json()};
 };
 return {mf,env,store,users,identities,call};
}

test('verified account restoration is stable across devices, private per immutable account, and never exposes the master key',async()=>{
 const f=await fixture();try{
  const [a,b]=f.users;
  const results=await Promise.all(Array.from({length:6},()=>f.call(0,'account-key',{actor:a,revision:0})));
  for(const r of results)assert.equal(r.status,200);
  const key=results[0].body.accountKey;for(const r of results)assert.equal(r.body.accountKey,key);
  const other=await f.call(1,'account-key',{actor:b,revision:0});assert.notEqual(other.body.accountKey,key);
  const reopened=await f.call(0,'session');assert.equal(reopened.body.accountKey,key);assert.equal(reopened.body.accountMode,'managed');assert.equal(reopened.body.vault.v,2);assert.equal(reopened.body.vault.recovery,undefined);
  assert.equal(reopened.headers.get('cache-control'),'no-store');
  const stored=JSON.stringify(await f.store.all('SELECT * FROM managed_account_keys'));assert.ok(!stored.includes(key));assert.ok(!stored.includes(other.body.accountKey));assert.ok(!stored.includes(f.env.OURHOUSE_ACCOUNT_KEY));
  assert.equal((await f.call(null,'session')).status,401);
  assert.equal((await f.call(1,'account-key',{actor:a,revision:0})).status,409);
  assert.equal((await f.call(0,'account-key',{actor:a,revision:0},'https://foreign.invalid')).status,403);
  const config=await handleAPI(new Request('https://ourhouse.test/api/config'),f.env,null);assert.ok(!(await config.text()).includes(f.env.OURHOUSE_ACCOUNT_KEY));
 }finally{await f.mf.dispose();}
});

test('empty legacy account migrates automatically while archiving its old vault',async()=>{
 const f=await fixture();try{
  const user=f.users[0],old=await C.createVault(user,'legacy synthetic passphrase');await f.store.putVault(user,old.vault,0);
  const connected=await connectAccount(f.store,user,f.env,{revision:1});assert.equal(connected.vault.v,2);assert.deepEqual(C.readKeyring(user,connected.vault,C.bytes(connected.accountKey)),{keys:[]});
  const archived=JSON.parse((await f.store.one('SELECT legacy_vault FROM managed_account_keys WHERE user=?',user)).legacy_vault);
  assert.deepEqual(await C.unlockVault(user,archived,old.recoveryCode,true),old.root);
 }finally{await f.mf.dispose();}
});

test('legacy family data is never reset without its original root and a verified adoption preserves all data',async()=>{
 const f=await fixture();try{
  const user=f.users[0],old=await C.createVault(user,'legacy synthetic passphrase'),key=C.random(32),house=C.hex(C.random(16)),epoch=C.hex(C.random(16)),tree={familyMeta:{name:'Preserved fixture'},pantry:{rice:{qty:4}}};
  await f.store.putVault(user,old.vault,0);const created=await f.store.create(user,{id:house,epoch,tree:C.encryptTree(key,tree,house,epoch),vault:{...old.vault,bundle:C.wrapKeyring(user,{keys:[{house,epoch,key:C.hex(key)}]},old.root)},vaultRevision:1});
  const before=JSON.stringify(created);
  await assert.rejects(()=>connectAccount(f.store,user,f.env,{revision:2}),e=>e.code==='MIGRATION_REQUIRED');
  await assert.rejects(()=>connectAccount(f.store,user,f.env,{revision:2,root:C.hex(C.random(32))}),e=>e.code==='MIGRATION_REQUIRED');
  const unchanged=await f.store.snapshot(user);assert.equal(unchanged.house.revision,created.house.revision);assert.equal(JSON.stringify(unchanged.tree),JSON.stringify(created.tree));assert.equal(unchanged.vault.revision,2);assert.ok(before.includes('bundle'));
  const connected=await connectAccount(f.store,user,f.env,{revision:2,root:C.hex(old.root)});assert.equal(connected.accountKey,C.hex(old.root));assert.deepEqual(C.decryptTree(key,connected.tree,house,epoch),tree);
  const reopened=await accountSession(f.store,user,f.env);assert.deepEqual(C.readKeyring(user,reopened.vault,C.bytes(reopened.accountKey)).keys[0].key,C.hex(key));
 }finally{await f.mf.dispose();}
});

test('missing or incorrect server wrapping keys fail closed and account deletion removes managed key and archive',async()=>{
 const f=await fixture();try{
  const user=f.users[0];await connectAccount(f.store,user,f.env,{revision:0});
  await assert.rejects(()=>accountSession(f.store,user,{...f.env,OURHOUSE_ACCOUNT_KEY:''}),e=>e.status===503);
  await assert.rejects(()=>accountSession(f.store,user,{...f.env,OURHOUSE_ACCOUNT_KEY:'cd'.repeat(32)}),e=>e.status===503);
  assert.equal((await f.store.one('SELECT count(*) n FROM managed_account_keys')).n,1);
  await f.store.deleteAccount(user,'DELETE');assert.equal(await f.store.one('SELECT user FROM managed_account_keys WHERE user=?',user),null);
 }finally{await f.mf.dispose();}
});

test('removing a managed family member refreshes remaining accounts automatically and rejects removed access',async()=>{
 const f=await fixture();try{
  const connected=await Promise.all(f.users.map(user=>connectAccount(f.store,user,f.env,{revision:0}))),[owner,removed,remaining]=f.users;
  const roots=connected.map(s=>C.bytes(s.accountKey)),house=C.hex(C.random(16)),epoch=C.hex(C.random(16)),key=C.random(32),tree={familyMeta:{name:'Synthetic managed family'},pantry:{rice:{qty:2}}};
  const first=await f.store.create(owner,{id:house,epoch,tree:C.encryptTree(key,tree,house,epoch),vault:{v:2,bundle:C.wrapKeyring(owner,{keys:[{house,epoch,key:C.hex(key)}]},roots[0])},vaultRevision:1});
  for(const [index,user] of [[1,removed],[2,remaining]]){
   await f.store.putVault(user,{v:2,bundle:C.wrapKeyring(user,{keys:[{house,epoch,key:C.hex(key)}]},roots[index])},1);
   await f.store.stmt('INSERT INTO secure_members(user,house,role,active) VALUES(?,?,?,1)',user,house,'editor').run();
  }
  const nextEpoch=C.hex(C.random(16)),nextKey=C.random(32),body={actor:owner,house,remove:removed,revision:first.house.revision,epoch:nextEpoch,tree:C.encryptTree(nextKey,tree,house,nextEpoch),vault:{v:2,bundle:C.wrapKeyring(owner,{keys:[{house,epoch,key:C.hex(key)},{house,epoch:nextEpoch,key:C.hex(nextKey)}]},roots[0])},vaultRevision:2};
  assert.equal((await f.call(1,'rotate',{...body,actor:removed})).status,403);
  assert.equal((await f.call(0,'rotate',body)).status,200);
  const reopened=await accountSession(f.store,remaining,f.env),ring=C.readKeyring(remaining,reopened.vault,C.bytes(reopened.accountKey));
  assert.equal(ring.keys.find(k=>k.epoch===nextEpoch).key,C.hex(nextKey));assert.deepEqual(C.decryptTree(nextKey,reopened.tree,house,nextEpoch),tree);
  const blocked=await f.call(1,'receipt',{actor:removed,scope:{actor:removed,house,epoch:nextEpoch,id:C.hex(C.random(32))}});assert.equal(blocked.status,403);
  const removedRing=C.readKeyring(removed,(await accountSession(f.store,removed,f.env)).vault,roots[1]);assert.equal(removedRing.keys.some(k=>k.epoch===nextEpoch),false);
 }finally{await f.mf.dispose();}
});
