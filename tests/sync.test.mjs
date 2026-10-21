import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {handleAPI} from '../lib/http.mjs';
import {SecureStore} from '../lib/secure-store.mjs';
import {connectAccount} from '../lib/managed-accounts.mjs';
import {syncDelay,startSync} from '../launch/sync-scheduler.mjs';
import * as C from '../crypto/e2ee.mjs';

test('unchanged checks omit the encrypted snapshot and keys, remain account scoped, and detect role, vault, epoch and membership changes',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("QA")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['BUCKET'],cf:false});
 try{const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const queries=[],env={DB:{prepare(sql){queries.push(sql);return db.prepare(sql);},batch:(...args)=>db.batch(...args)},BUCKET:bucket,OURHOUSE_ACCOUNT_SIGNIN:'managed',OURHOUSE_ACCOUNT_KEY:'ab'.repeat(32)},store=new SecureStore(db,bucket),identity={userId:'sync-owner',email:'same@example.invalid'},otherIdentity={userId:'sync-other',email:'same@example.invalid'},owner=await store.identity(identity),other=await store.identity(otherIdentity);
  const managed=await connectAccount(store,owner,env,{revision:0}),root=C.bytes(managed.accountKey),key=C.random(32),house=C.hex(C.random(16)),epoch=C.hex(C.random(16));
  await store.create(owner,{id:house,epoch,tree:C.encryptTree(key,{notes:'Private synthetic record '.repeat(1000)},house,epoch),vault:{v:2,bundle:C.wrapKeyring(owner,{keys:[{house,epoch,key:C.hex(key)}]},root)},vaultRevision:managed.vault.revision});
  const get=async(since,actor=identity)=>{const response=await handleAPI(new Request('https://ourhouse.test/api/secure/session'+(since?'?since='+since:'')),env,actor);return {response,body:await response.json()};};
  const initial=await get();assert.equal(initial.response.status,200);assert.ok(initial.body.tree);assert.ok(initial.body.accountKey);assert.match(initial.body.syncToken,/^[a-f0-9]{64}$/);
  queries.length=0;const same=await get(initial.body.syncToken);assert.deepEqual(Object.keys(same.body).sort(),['serverTime','syncToken','unchanged']);assert.equal(same.body.unchanged,true);assert.equal(same.response.headers.get('cache-control'),'no-store');assert.ok(JSON.stringify(same.body).length<200);assert.ok(!queries.some(sql=>/h\.\*|managed_account_keys|SELECT data/i.test(sql)));
  const foreign=await get(initial.body.syncToken,otherIdentity);assert.notEqual(foreign.body.unchanged,true);assert.notEqual(foreign.body.syncToken,initial.body.syncToken);assert.equal(foreign.body.house,null);assert.equal(foreign.body.user.id,other);assert.equal((await get(initial.body.syncToken,null)).response.status,401);
  let token=initial.body.syncToken;
  for(const sql of ["UPDATE secure_members SET role='viewer' WHERE user=?","UPDATE secure_vaults SET revision=revision+1 WHERE user=?","UPDATE secure_houses SET revision=revision+1 WHERE owner=?","UPDATE secure_houses SET epoch='1234567890abcdef1234567890abcdef' WHERE owner=?","UPDATE secure_members SET active=0 WHERE user=?"]){await db.prepare(sql).bind(owner).run();const changed=await get(token);assert.equal(changed.response.status,200);assert.notEqual(changed.body.unchanged,true);assert.notEqual(changed.body.syncToken,token);token=changed.body.syncToken;}
 }finally{await mf.dispose();}
});

test('sync polling slows only for idle unchanged sessions, pauses while hidden and backs off failures without overlapping requests',async()=>{
 const target=new EventTarget(),doc=new EventTarget();doc.hidden=false;let time=0,sequence=0,calls=0,failed=false,finish;const timers=new Map();
 const poll=async()=>{calls++;if(finish)await finish.promise;return failed?{failed:true}:{changed:false};};
 const control=startSync(poll,{target,doc,now:()=>time,set:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},clear:id=>timers.delete(id)});
 const next=()=>[...timers.values()][0];const tick=async()=>{const [id,timer]=[...timers][0];timers.delete(id);time+=timer.ms;await timer.fn();};
 try{assert.equal(syncDelay({}),20000);for(let i=0;i<6;i++)await tick();assert.equal(next().ms,60000);target.dispatchEvent(new Event('pointerdown'));assert.equal(next().ms,20000);failed=true;await tick();assert.equal(next().ms,40000);await tick();assert.equal(next().ms,80000);await tick();assert.equal(next().ms,120000);doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,0);target.dispatchEvent(new Event('online'));assert.equal(timers.size,0);failed=false;doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,0));assert.equal(timers.size,1);let resolve;finish={promise:new Promise(r=>resolve=r)};const pending=tick();const before=calls;target.dispatchEvent(new Event('online'));assert.equal(calls,before);resolve();await pending;}finally{control.stop();}assert.equal(timers.size,0);
});
