import {createHash, randomBytes} from 'node:crypto';
import Ledger from './expense-ledger.cjs';
import Receipts from './receipt-schema.cjs';
import {AppError,fail,name,safeKey,same,initialData,at,set,validateData} from './domain.mjs';

export const digest=s=>createHash('sha256').update(s).digest('hex');
const id=()=>randomBytes(16).toString('hex');
const LIMITS={houses:50,accounts:1000,receipts:100,operations:10000};
const guard=db=>db.prepare('INSERT INTO assertions(ok) VALUES(changes())');
export class CloudStore {
 constructor(db,bucket){this.db=db.withSession?db.withSession('first-primary'):db;this.bucket=bucket;}
 stmt(sql,...args){return this.db.prepare(sql).bind(...args);}
 async one(sql,...args){return this.stmt(sql,...args).first();}
 async all(sql,...args){return (await this.stmt(sql,...args).all()).results;}
 async identity(identity){
  if(!identity?.userId||!identity?.email)fail('Sign in to your family account',401,'AUTH');
  const provider=digest(identity.userId);let a=await this.one('SELECT id,name,email FROM accounts WHERE provider=?',provider);
  if(!a){
   // Server-side subject is the only account key; email cannot claim another account.
   await this.stmt('INSERT OR IGNORE INTO accounts(id,provider,name,email) SELECT ?,?,?,? WHERE (SELECT count(*) FROM accounts)<?',id(),provider,String(identity.displayName||identity.email).slice(0,80),identity.email.slice(0,200),LIMITS.accounts).run();
   a=await this.one('SELECT id,name,email FROM accounts WHERE provider=?',provider);
   if(!a)fail('OurHouse has reached its early access account limit',503,'CAPACITY');
  }return a.id;
 }
 async membership(user){const m=await this.one('SELECT * FROM members WHERE user=? AND active=1',user);if(!m)fail('Create a household or accept your invitation',403,'NO_HOUSE');return m;}
 async context(user){const m=await this.membership(user);const h=await this.one('SELECT * FROM houses WHERE id=?',m.house);if(!h)fail('This household is no longer available',403,'NO_HOUSE');return {m,h};}
 async people(house){return Object.fromEntries((await this.all('SELECT a.id,a.name,m.role,m.active FROM members m JOIN accounts a ON a.id=m.user WHERE m.house=?',house)).map(p=>[p.id,{name:p.name,role:p.role,active:!!p.active}]));}
 async snapshot(user){
  // One transactional batch prevents mixing a snapshot with a concurrent role removal.
  const r=await this.db.batch([
   this.stmt('SELECT id,name,email FROM accounts WHERE id=?',user),
   this.stmt('SELECT h.*,m.role FROM houses h JOIN members m ON m.house=h.id WHERE m.user=? AND m.active=1',user),
   this.stmt('SELECT a.id,a.name,m.role,m.active FROM members m JOIN accounts a ON a.id=m.user WHERE m.house=(SELECT house FROM members WHERE user=? AND active=1)',user)
  ]);const a=r[0].results[0],h=r[1].results[0];if(!a)fail('Sign in again',401,'AUTH');if(!h)return {user:a,house:null};
  return {user:a,house:{id:h.id,name:h.name,owner:h.owner,revision:h.revision,role:h.role},data:{...JSON.parse(h.data),members:Object.fromEntries(r[2].results.map(p=>[p.id,{name:p.name,role:p.role,active:!!p.active}]))}};
 }
 async commit(h,statements,data=null){
  // D1 batch is an atomic transaction. CHECK(ok=1) aborts the whole batch when
  // the compare-and-swap misses. A racing member change also increments revision.
  const sql=data===null?'UPDATE houses SET revision=revision+1 WHERE id=? AND revision=?':'UPDATE houses SET data=?,revision=revision+1 WHERE id=? AND revision=?';
  const args=data===null?[h.id,h.revision]:[JSON.stringify(data),h.id,h.revision];
  try{await this.db.batch([this.stmt(sql,...args),guard(this.db),...statements,this.stmt('DELETE FROM assertions')]);}
  catch(e){if(/CHECK constraint failed|UNIQUE constraint failed/i.test(e.message))throw new AppError('The household changed while saving. Retry your change.',409,'RETRY');throw e;}
 }
 async retry(fn){for(let attempt=0;attempt<4;attempt++){try{return await fn();}catch(e){if(e.code!=='RETRY')throw e;if(attempt===3)fail('The household is busy saving. Your device will retry.',503,'BUSY');await new Promise(resolve=>setTimeout(resolve,Math.min(15*2**attempt,200)*Math.random()));}}}
 async create(user,title,people=4){
  title=name(title);if(!Number.isInteger(people)||people<1||people>50)fail('Choose a household size from 1 to 50');
  if(await this.one('SELECT user FROM members WHERE user=?',user))fail('This account already belongs to a household',409);
  const house=id(),data=initialData();data.settings.people=people;
  try{await this.db.batch([
   this.stmt('INSERT INTO houses(id,name,owner,data,revision) SELECT ?,?,?,?,1 WHERE (SELECT count(*) FROM houses)<?',house,title,user,JSON.stringify(data),LIMITS.houses),guard(this.db),
   this.stmt('INSERT INTO members(user,house,role,active) VALUES(?,?,?,1)',user,house,'admin'),this.stmt('DELETE FROM assertions')
  ]);}catch(e){if(/UNIQUE/.test(e.message))fail('This account already belongs to a household',409);if(/CHECK/.test(e.message))fail('OurHouse has reached its early access household limit',503,'CAPACITY');throw e;}return this.snapshot(user);
 }
 async invite(user,role='editor'){return this.retry(async()=>{
  const {m,h}=await this.context(user);if(m.role!=='admin')fail('Only a household admin can invite family',403);if(!['editor','viewer'].includes(role))fail('Choose Member or Read only access');
  if((await this.one('SELECT count(*) n FROM invites WHERE house=? AND used=0 AND expires>?',h.id,Date.now())).n>=20)fail('Revoke an unused invitation before making more');
  const token=randomBytes(32).toString('base64url'),inviteId=id(),expires=Date.now()+7*864e5;
  await this.commit(h,[this.stmt('DELETE FROM invites WHERE house=? AND expires<?',h.id,Date.now()-30*864e5),this.stmt('INSERT INTO invites(token,id,house,role,expires,used,created_by) VALUES(?,?,?,?,?,0,?)',digest(token),inviteId,h.id,role,expires,user)]);return {token,id:inviteId,role,expires};
 });}
 async inviteInfo(token){const row=await this.one('SELECT h.name,i.role,i.expires FROM invites i JOIN houses h ON h.id=i.house WHERE i.token=? AND i.used=0 AND i.expires>?',digest(String(token||'')),Date.now());if(!row)fail('This invitation has expired, was revoked or was already used',410);return row;}
 async accept(user,token){return this.retry(async()=>{
  const row=await this.one('SELECT * FROM invites WHERE token=? AND used=0 AND expires>?',digest(String(token||'')),Date.now());if(!row)fail('This invitation has expired, was revoked or was already used',410);
  if(await this.one('SELECT user FROM members WHERE user=?',user))fail('This account already belongs to a household',409);
  const h=await this.one('SELECT * FROM houses WHERE id=?',row.house);if(!h)fail('This invitation is no longer available',410);
  if((await this.one('SELECT count(*) n FROM members WHERE house=? AND active=1',h.id)).n>=50)fail('A household supports up to 50 active members');
  await this.commit(h,[this.stmt('UPDATE invites SET used=1 WHERE token=? AND used=0 AND expires>?',row.token,Date.now()),guard(this.db),this.stmt('INSERT INTO members(user,house,role,active) VALUES(?,?,?,1)',user,h.id,row.role)]);return this.snapshot(user);
 });}
 async invitations(user){const {m}=await this.context(user);if(m.role!=='admin')fail('Admin access required',403);return this.all('SELECT id,role,expires,used FROM invites WHERE house=? AND expires>? ORDER BY expires DESC',m.house,Date.now()-30*864e5);}
 async revoke(user,invite){return this.retry(async()=>{const {m,h}=await this.context(user);if(m.role!=='admin')fail('Admin access required',403);await this.commit(h,[this.stmt('UPDATE invites SET used=1 WHERE house=? AND id=?',m.house,invite)]);return {saved:true};});}
 async member(user,target,role,active=true){return this.retry(async()=>{
  const {m,h}=await this.context(user),t=await this.one('SELECT * FROM members WHERE user=? AND house=?',target,h.id);
  if(!t||m.role!=='admin')fail('Admin access required',403);if(target===h.owner)fail('The household owner keeps full access',403);if(!['admin','editor','viewer'].includes(role)||typeof active!=='boolean')fail('Invalid member access');if(user!==h.owner&&(role==='admin'||t.role==='admin'))fail('Only the owner can manage admin access',403);
  if(active&&!t.active&&(await this.one('SELECT count(*) n FROM members WHERE house=? AND active=1',h.id)).n>=50)fail('Household member limit reached');
  await this.commit(h,[this.stmt('UPDATE members SET role=?,active=? WHERE user=? AND house=?',role,active?1:0,target,h.id)]);return this.snapshot(user);
 });}
 async patch(user,operation){return this.retry(async()=>{
  const {m,h}=await this.context(user);if(!['admin','editor'].includes(m.role))fail('Read only access cannot change household records',403,'ACCESS');
  if(operation.house!==m.house||operation.actor!==user)fail('Your account or household changed. Reopen your own household.',409,'STALE_CONTEXT');
  if(!safeKey(operation.id)||!Array.isArray(operation.changes)||!operation.changes.length||operation.changes.length>2000)fail('Invalid household change');
  if(await this.one('SELECT id FROM operations WHERE house=? AND actor=? AND id=?',h.id,user,operation.id))return {...await this.snapshot(user),saved:true,replayed:true};
  if(h.op_count>=LIMITS.operations)fail('This household has reached the early access change limit. Export your data before continuing.',413,'CAPACITY');
  const data=JSON.parse(h.data),allowed=new Set(Object.keys(initialData())),paths=new Set();
  for(const c of operation.changes){if(typeof c.path!=='string'||c.path.length>512)fail('Invalid record path');const keys=c.path.split('/');if(!allowed.has(keys[0])||keys.length<2||keys.length>12||keys.some(k=>!safeKey(k))||paths.has(c.path))fail('Invalid record path');for(const p of paths)if(p.startsWith(c.path+'/')||c.path.startsWith(p+'/'))fail('Overlapping record paths');paths.add(c.path);if(keys[0]==='settings'&&m.role!=='admin')fail('Admin access is required for household settings',403,'ACCESS');if(!same(at(data,c.path),c.before)&&!same(at(data,c.path),c.value))fail('Someone changed the same record. Your draft is kept for review.',409,'CONFLICT');}
  for(const c of operation.changes)set(data,c.path,c.value);validateData(data,await this.people(h.id));
  if(JSON.stringify(data).length>1000000)fail('The household storage limit is 1 MB. Export or remove old list records.',413,'CAPACITY');
  const old=JSON.parse(h.data),business=record=>Object.fromEntries(Object.entries(record||{}).filter(([key])=>!['history','revision','modifiedBy','updatedAt'].includes(key)));
  for(const [gid,group] of Object.entries(data.expenseGroups)){
   const previous=old.expenseGroups?.[gid];const normalize=(next,current)=>{if(same(next,current))return next;if(same(business(next),business(current)))fail('Expense history is maintained by the server; edit the expense itself');return Ledger.revise(current,{value:business(next),baseRevision:current?.revision||0,opId:operation.id,actor:user,at:Date.now()},()=>true);};
   group.meta=normalize(group.meta,previous?.meta);for(const [eid,e] of Object.entries(group.entries||{}))group.entries[eid]=normalize(e,previous?.entries?.[eid]);
  }
  for(const [gid,g] of Object.entries(old.expenseGroups||{})){const next=data.expenseGroups[gid];if(!next)fail('Archive settled expense groups instead of deleting history');for(const eid of Object.keys(g.entries||{}))if(!next.entries?.[eid])fail('Keep expense history; mark an entry deleted instead');for(const [pid,p] of Object.entries(g.meta.people||{})){if(!next.meta.people[pid])fail('Keep former people in expense history');if(p.active&&!next.meta.people[pid].active&&Object.values(Ledger.balances(next.entries)).some(v=>v[pid]))fail('Settle balances before removing a group person');}if(next.meta.archived&&Object.values(Ledger.balances(next.entries)).some(v=>Object.values(v).some(n=>n)))fail('Settle balances before archiving');}
  const receiptMap=new Map((await this.all('SELECT grp,entry,id,meta FROM receipts WHERE house=? AND ready=1',h.id)).map(r=>[r.grp+'/'+r.entry+'/'+r.id,r.meta]));
  for(const [gid,g] of Object.entries(data.expenseGroups))for(const [eid,e] of Object.entries(g.entries||{}))for(const r of e.receipts||[]){const meta=receiptMap.get(gid+'/'+eid+'/'+r.id);if(!meta||!same(Receipts.reference(JSON.parse(meta)),Receipts.reference(r)))fail('Wait for this expense receipt upload to finish');}
  const audit=[...new Set(operation.changes.map(c=>c.path.split('/')[0]))].map(path=>({path}));
  await this.commit(h,[this.stmt('INSERT INTO operations(house,actor,id,changes,at) VALUES(?,?,?,?,?)',h.id,user,operation.id,JSON.stringify(audit),Date.now()),this.stmt('UPDATE houses SET op_count=op_count+1 WHERE id=?',h.id)],data);return {...await this.snapshot(user),saved:true};
 });}
 async receipt(user,scope,file){
  const {m}=await this.context(user);if(scope.actor&&scope.actor!==user)fail('Your account changed; reopen this receipt',409,'STALE_CONTEXT');
  if(scope.site!==m.house||![scope.group,scope.entry].every(safeKey)||!/^r_[a-f0-9]{64}$/.test(scope.id||''))fail('Receipt is outside your household',403);
  const key=[m.house,scope.group,scope.entry,scope.id].join('/');
  if(!file){const row=await this.one('SELECT meta FROM receipts WHERE house=? AND grp=? AND entry=? AND id=? AND ready=1',m.house,scope.group,scope.entry,scope.id);if(!row)fail('Receipt not found',404);const obj=await this.bucket.get(key);if(!obj)fail('Receipt temporarily unavailable',503);return {...JSON.parse(row.meta),data:Buffer.from(await obj.arrayBuffer()).toString('base64')};}
  if(m.role==='viewer')fail('Read only members cannot attach receipts',403);
  const bytes=Buffer.from(file.data||'','base64');if(bytes.length>524288||bytes.length<1||!Receipts.signature(bytes,file.mime)||file.size!==bytes.length||file.sha256!==digest(bytes)||file.id!==scope.id||file.id!=='r_'+file.sha256)fail('Invalid receipt photo or PDF');
  await this.retry(async()=>{const {m,h}=await this.context(user);if(m.house!==scope.site)fail('Your household changed; reopen this receipt',409,'STALE_CONTEXT');if(m.role==='viewer')fail('Read only members cannot attach receipts',403);const exists=await this.one('SELECT id FROM receipts WHERE house=? AND grp=? AND entry=? AND id=?',h.id,scope.group,scope.entry,scope.id);if(exists)return;if(h.receipt_count>=LIMITS.receipts)fail('The early access receipt limit is 100 per household');const meta=Receipts.reference({...file,uploadedBy:user,createdAt:Date.now()});await this.commit(h,[this.stmt('INSERT INTO receipts(house,grp,entry,id,meta,ready) VALUES(?,?,?,?,?,0)',h.id,scope.group,scope.entry,scope.id,JSON.stringify(meta)),this.stmt('UPDATE houses SET receipt_count=receipt_count+1 WHERE id=?',h.id)]);});
  // Metadata is reserved first, then the immutable, hash-addressed bytes are put.
  // A retry completes interrupted uploads; patches cannot reference pending bytes.
  await this.bucket.put(key,bytes,{httpMetadata:{contentType:file.mime}});
  try{await this.retry(async()=>{const {m,h}=await this.context(user);if(m.house!==scope.site)fail('Your household changed; reopen this receipt',409,'STALE_CONTEXT');if(m.role==='viewer')fail('Your receipt access changed',403);await this.commit(h,[this.stmt('UPDATE receipts SET ready=1 WHERE house=? AND grp=? AND entry=? AND id=?',h.id,scope.group,scope.entry,scope.id)]);});}
  catch(e){if(!await this.one('SELECT id FROM houses WHERE id=?',scope.site)){await this.stmt('INSERT OR IGNORE INTO cleanup(key) VALUES(?)',key).run();try{await this.cleanup();}catch{}}throw e;}
  return {saved:true,receipt:JSON.parse((await this.one('SELECT meta FROM receipts WHERE house=? AND grp=? AND entry=? AND id=?',m.house,scope.group,scope.entry,scope.id)).meta)};
 }
 async activity(user){const m=await this.membership(user);return (await this.all('SELECT actor,changes,at FROM operations WHERE house=? ORDER BY at DESC LIMIT 30',m.house)).map(r=>({actor:r.actor,at:r.at,changes:JSON.parse(r.changes).map(c=>({path:c.path,value:c.value}))}));}
 async rate(key,max=60){const window=Math.floor(Date.now()/60000),hash=digest(key);const row=await this.one('INSERT INTO rate_limits(key,window,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,hits=CASE WHEN rate_limits.window=excluded.window THEN rate_limits.hits+1 ELSE 1 END RETURNING hits',hash,window);if(row.hits>max)fail('Too many requests. Please wait a minute.',429,'RATE');}
 async deleteAccount(user,confirmation){
  const a=await this.one('SELECT * FROM accounts WHERE id=?',user);if(!a)fail('Sign in again',401,'AUTH');
  const m=await this.one('SELECT * FROM members WHERE user=?',user),h=m&&await this.one('SELECT * FROM houses WHERE id=?',m.house);
  const owns=h?.owner===user;if(confirmation!==(owns?h.name:'DELETE'))fail(owns?'Type your household name to delete it and your account':'Type DELETE to delete your account');
  if(owns){
   await this.commit(h,[this.stmt("INSERT OR IGNORE INTO cleanup(key) SELECT house||'/'||grp||'/'||entry||'/'||id FROM receipts WHERE house=?",h.id),...['members','invites','operations','receipts'].map(t=>this.stmt('DELETE FROM '+t+' WHERE house=?',h.id)),this.stmt('DELETE FROM houses WHERE id=?',h.id),this.stmt('DELETE FROM accounts WHERE id=?',user)]);
  }else if(h){
   // Household financial/activity records retain an anonymous actor, never email.
   await this.commit(h,[this.stmt('DELETE FROM members WHERE user=?',user),this.stmt('DELETE FROM accounts WHERE id=?',user)]);
  }else await this.stmt('DELETE FROM accounts WHERE id=?',user).run();
  return {deleted:true};
 }
 async cleanup(){const keys=(await this.all('SELECT key FROM cleanup LIMIT 100')).map(row=>row.key);if(keys.length){await this.bucket.delete(keys);await this.stmt('DELETE FROM cleanup WHERE key IN ('+keys.map(()=>'?').join(',')+')',...keys).run();}}
}
