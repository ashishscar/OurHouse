import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {CloudStore,digest} from '../lib/cloud-store.mjs';
import {handleLegacyAPI as handleAPI} from '../lib/http.mjs';
import {diff} from '../lib/domain.mjs';
let mf,db,bucket,s,owner,editor,viewer,other,house;
const identity=n=>({userId:'cloud-test-'+n,email:n+'@example.invalid',displayName:n});
const createUser=async n=>s.identity(identity(n));
const patch=(user,id,changes,h=house)=>s.patch(user,{id,actor:user,house:h,changes});
const reject=(fn,status,code)=>assert.rejects(fn,e=>e.status===status&&(!code||e.code===code));
before(async()=>{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],r2Buckets:['BUCKET'],cf:false});
 db=await mf.getD1Database('DB');bucket=await mf.getR2Bucket('BUCKET');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 s=new CloudStore(db,bucket);owner=await createUser('owner');editor=await createUser('editor');viewer=await createUser('viewer');other=await createUser('other');
 house=(await s.create(owner,'Cloud test family',4)).house.id;
 for(const [user,role] of [[editor,'editor'],[viewer,'viewer']])await s.accept(user,(await s.invite(owner,role)).token);
 await s.create(other,'Other family',2);
});
after(async()=>{await mf?.dispose();});
test('managed subject binds identity; email cannot claim another account; families stay isolated',async()=>{
 assert.equal(await s.identity(identity('owner')),owner);
 assert.notEqual(await s.identity({...identity('imposter'),email:identity('owner').email}),owner);
 assert.equal((await s.snapshot(editor)).house.id,house);
 assert.notEqual((await s.snapshot(other)).house.id,house);
 assert.ok(!JSON.stringify(await s.snapshot(other)).includes('Cloud test family'));
 await reject(()=>s.create(editor,'Second house'),409);
});
test('D1 transaction compare-and-swap aborts every statement after stale revision',async()=>{
 const {h}=await s.context(owner);
 await patch(owner,'cas_new',[{path:'pantry/rice',before:null,value:{name:'Rice',qty:5,unit:'kg'}}]);
 await reject(()=>s.commit(h,[s.stmt('UPDATE members SET role=? WHERE user=?','admin',viewer)]),409,'RETRY');
 assert.equal((await s.membership(viewer)).role,'viewer');
 assert.equal((await db.prepare('SELECT count(*) n FROM assertions').first()).n,0);
});
test('50 concurrent D1 saves merge; same operation replays once; stale overlapping cooking rolls back',async()=>{
 const writes=Array.from({length:50},(_,i)=>()=>patch(editor,'parallel_'+i,[{path:'grocery/item_'+i,before:null,value:{name:'Item '+i,qty:1,unit:'pcs'}}]));
 const first=await Promise.allSettled(writes.map(write=>write()));
 for(const [i,result] of first.entries())if(result.status==='rejected'){assert.equal(result.reason.code,'BUSY');await writes[i]();}
 let snap=await s.snapshot(owner);assert.equal(Object.keys(snap.data.grocery).length,50);
 const op={id:'once',actor:owner,house,changes:[{path:'pantry/rice/qty',before:5,value:4}]};await s.patch(owner,op);await patch(editor,'later',[{path:'pantry/rice/qty',before:4,value:3}]);assert.equal((await s.patch(owner,op)).replayed,true);assert.equal((await s.snapshot(owner)).data.pantry.rice.qty,3);
 await reject(()=>patch(owner,'bad_cook',[{path:'pantry/rice/qty',before:4,value:2},{path:'weeks/week1',before:null,value:{Monday:{cooked:true}}}]),409,'CONFLICT');assert.equal((await s.snapshot(owner)).data.weeks.week1,undefined);
});
test('invites expire, revoke and race single use; role elevation requires owner',async()=>{
 const a=await createUser('join-a'),b=await createUser('join-b'),invite=await s.invite(owner);
 const results=await Promise.allSettled([s.accept(a,invite.token),s.accept(b,invite.token)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await reject(()=>s.inviteInfo(invite.token),410);
 const revoked=await s.invite(owner);await s.revoke(owner,revoked.id);await reject(async()=>s.accept(await createUser('revoked'),revoked.token),410);
 const expired=await s.invite(owner);await db.prepare('UPDATE invites SET expires=0 WHERE id=?').bind(expired.id).run();await reject(()=>s.inviteInfo(expired.token),410);
 await reject(()=>s.member(editor,viewer,'admin'),403);await s.member(owner,editor,'admin');await reject(()=>s.member(editor,viewer,'admin'),403);await reject(()=>s.member(editor,owner,'viewer'),403);await s.member(owner,editor,'editor');
 await reject(()=>patch(viewer,'viewer_patch',[{path:'pantry/rice/qty',before:3,value:2}]),403,'ACCESS');
});
test('private R2 receipts validate bytes and household/expense scope; upload retry completes',async()=>{
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);const sha=digest(bytes),file={id:'r_'+sha,sha256:sha,mime:'image/png',size:bytes.length,name:'receipt.png',data:bytes.toString('base64')},scope={site:house,group:'bills',entry:'shop',id:file.id,actor:owner};
 const uploaded=await s.receipt(owner,scope,file);assert.equal(uploaded.saved,true);assert.equal((await s.receipt(viewer,{...scope,actor:viewer})).data,file.data);
 assert.equal((await s.receipt(owner,scope,file)).receipt.createdAt,uploaded.receipt.createdAt);
 await reject(()=>s.receipt(other,{...scope,actor:other}),403);await reject(()=>s.receipt(viewer,{...scope,actor:viewer},file),403);await reject(()=>s.receipt(owner,{...scope,entry:'other'}),404);
 await reject(()=>s.receipt(owner,scope,{...file,size:99}),400);
 // An interrupted R2 write leaves a pending reservation that a retry can complete.
 const broken=new CloudStore(db,{put:async()=>{throw Error('offline')}});const scope2={...scope,entry:'interrupted'};await assert.rejects(()=>broken.receipt(owner,scope2,file));await reject(()=>s.receipt(owner,scope2),404);await s.receipt(owner,scope2,file);assert.equal((await s.receipt(owner,scope2)).data,file.data);
});
test('deleting a household during a receipt upload cannot resurrect its private file',async()=>{
 const who=await createUser('upload-delete-race'),title='Receipt race fixture',snap=await s.create(who,title);
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,1]),sha=digest(bytes),file={id:'r_'+sha,sha256:sha,mime:'image/png',size:bytes.length,name:'race.png',data:bytes.toString('base64')},scope={site:snap.house.id,group:'bills',entry:'race',id:file.id,actor:who};
 const racing=new CloudStore(db,{put:async(key,data,options)=>{await s.deleteAccount(who,title);await s.cleanup();return bucket.put(key,data,options)},delete:key=>bucket.delete(key)});
 await reject(()=>racing.receipt(who,scope,file),403,'NO_HOUSE');
 assert.equal(await bucket.get([scope.site,scope.group,scope.entry,scope.id].join('/')),null);
});
test('expense math and audit stay server-owned through cloud storage',async()=>{
 const before=(await s.snapshot(owner)).data,after=structuredClone(before);
 after.expenseGroups.bills={meta:{name:'Bills',people:{[owner]:{name:'Owner',active:true},[editor]:{name:'Editor',active:true}},currency:'CAD',simplify:true},entries:{shop:{type:'expense',description:'Shop',date:'2026-10-15',currency:'CAD',amount:1001,paid:{[owner]:1001},shares:{[owner]:501,[editor]:500},method:'equal'}},comments:{}};
 await patch(owner,'expense',diff(before,after));let snap=await s.snapshot(owner),e=snap.data.expenseGroups.bills.entries.shop;assert.equal(e.modifiedBy,owner);assert.equal(e.revision,1);
 await reject(()=>patch(owner,'forge',[{path:'expenseGroups/bills/entries/shop/history',before:e.history,value:[]}]),400);
 await patch(editor,'expense_edit',[{path:'expenseGroups/bills/entries/shop/description',before:'Shop',value:'Updated shop'}]);e=(await s.snapshot(owner)).data.expenseGroups.bills.entries.shop;assert.equal(e.modifiedBy,editor);assert.equal(e.revision,2);assert.equal(Object.keys(e.history).length,2);
});
test('HTTP rejects unauthenticated requests, CSRF, spoofed actors, local passwords and cross-family drafts',async()=>{
 const req=(path,body,origin='https://roomio.test')=>new Request('https://roomio.test/api/'+path,body?{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}:{});
 const env={DB:db,BUCKET:bucket};assert.equal((await handleAPI(req('session'),env,null)).status,401);
 assert.equal((await handleAPI(req('house',{actor:owner,name:'Bad'},'https://evil.test'),env,identity('owner'))).status,403);
 assert.equal((await handleAPI(req('changes',{actor:other,house,changes:[],id:'spoof'}),env,identity('owner'))).status,409);
 assert.equal((await handleAPI(req('changes',{actor:other,house,changes:[],id:'cross'}),env,identity('other'))).status,409);
 assert.equal((await handleAPI(req('register',{email:'x@y.test',password:'secret'}),env,identity('owner'))).status,409);
 const response=await handleAPI(req('session'),env,identity('owner'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-frame-options'),'DENY');
});
test('rate limits persist; member deletion detaches identity; owner deletion removes records and receipt bytes',async()=>{
 for(let i=0;i<3;i++)await s.rate('synthetic-rate',3);await reject(()=>new CloudStore(db,bucket).rate('synthetic-rate',3),429);
 await reject(()=>s.deleteAccount(viewer,'wrong'),400);await s.deleteAccount(viewer,'DELETE');assert.ok(!(await s.people(house))[viewer]);assert.notEqual(await createUser('viewer'),viewer);
 const keys=(await bucket.list()).objects.map(o=>o.key);assert.ok(keys.length>0);
 await reject(()=>s.deleteAccount(owner,'wrong'),400);await s.deleteAccount(owner,'Cloud test family');await s.cleanup();
 assert.equal((await s.snapshot(editor)).house,null);assert.equal((await bucket.list()).objects.length,0);assert.equal((await db.prepare('SELECT count(*) n FROM operations WHERE house=?').bind(house).first()).n,0);
 assert.ok((await s.snapshot(other)).house);
});
