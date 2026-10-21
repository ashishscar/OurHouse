import * as C from '../crypto/e2ee.mjs';
import {AppError} from './domain.mjs';

export const managedAccountMode=env=>env.OURHOUSE_ACCOUNT_SIGNIN==='managed';
const unavailable=()=>new AppError('Account storage is temporarily unavailable. Please try again.',503,'ACCOUNT_STORAGE');
function masterKey(env){if(!/^[a-f0-9]{64}$/.test(env.OURHOUSE_ACCOUNT_KEY||''))throw unavailable();return C.bytes(env.OURHOUSE_ACCOUNT_KEY);}
const keyContext=user=>({account:user,purpose:'managed-account-root',version:1});
function unwrap(env,user,data){const master=masterKey(env);try{const value=C.open(master,JSON.parse(data),keyContext(user));if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw Error();return C.bytes(value);}catch{throw unavailable();}finally{master.fill(0);}}
function wrap(env,user,root){const master=masterKey(env);try{return JSON.stringify(C.seal(master,C.hex(root),keyContext(user)));}finally{master.fill(0);}}

// Only called after server-side provider verification and immutable actor checks.
// This is service-managed encryption: the operator can recover these keys.
export async function accountSession(store,user,env){
 const snapshot=await store.snapshot(user);if(!managedAccountMode(env))return snapshot;
 const master=masterKey(env);master.fill(0);snapshot.accountMode='managed';
 const row=await store.one('SELECT data FROM managed_account_keys WHERE user=?',user);
 if(row){const root=unwrap(env,user,row.data);try{C.readKeyring(user,snapshot.vault,root);snapshot.accountKey=C.hex(root);}catch{throw unavailable();}finally{root.fill(0);}}
 return snapshot;
}

export async function connectAccount(store,user,env,body){
 if(!managedAccountMode(env))throw new AppError('Account sync is not configured',503,'ACCOUNT_SETUP');
 const master=masterKey(env);master.fill(0);
 if(await store.one('SELECT user FROM managed_account_keys WHERE user=?',user))return accountSession(store,user,env);
 const vault=await store.vault(user),revision=vault?.revision||0;
 if(body.revision!==revision)throw new AppError('Your account changed. Refresh and try again.',409,'VAULT_CONFLICT');
 let root,bundle,emptyReset=false;
 if(body.root!==undefined){
  if(!/^[a-f0-9]{64}$/.test(body.root)||!vault)throw new AppError('Previous device access could not be verified',409,'MIGRATION_REQUIRED');
  root=C.bytes(body.root);try{C.readKeyring(user,vault,root);bundle=vault.bundle;}catch{root.fill(0);throw new AppError('Previous device access could not be verified',409,'MIGRATION_REQUIRED');}
 }else{
  // Never reset a vault containing a family's inaccessible data. A connected
  // old device can adopt its root through the authenticated path above.
  if(vault?.v===2||await store.one('SELECT user FROM secure_members WHERE user=? UNION SELECT user FROM members WHERE user=?',user,user))throw new AppError('Open OurHouse once on your previous connected device to finish syncing this account. Existing data has been preserved.',409,'MIGRATION_REQUIRED');
  emptyReset=true;root=C.random(32);bundle=C.wrapKeyring(user,{keys:[]},root);
 }
 try{
  const next={v:2,bundle},packet=wrap(env,user,root);
  const statements=[];
  if(emptyReset)statements.push(store.stmt('INSERT INTO assertions(ok) SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM secure_members WHERE user=?) AND NOT EXISTS(SELECT 1 FROM members WHERE user=?) THEN 1 ELSE 0 END',user,user));
  statements.push(store.vaultStatement(user,next,revision),store.stmt('INSERT INTO assertions(ok) VALUES(changes())'),store.stmt('INSERT INTO managed_account_keys(user,data,legacy_vault,created_at) VALUES(?,?,?,?)',user,packet,vault?JSON.stringify(vault):null,Date.now()),store.stmt('DELETE FROM assertions'));
  try{await store.db.batch(statements);}catch(e){
   // Another device may have completed the same first-login transaction.
   if(!/CHECK|UNIQUE/.test(e.message))throw e;
   if(!await store.one('SELECT user FROM managed_account_keys WHERE user=?',user))throw new AppError('Your account changed. Refresh and try again.',409,'VAULT_CONFLICT');
  }
  return accountSession(store,user,env);
 }finally{root.fill(0);}
}

export async function managedMemberVaults(store,user,env,body){
 if(!managedAccountMode(env))return [];
 const {m,h}=await store.context(user);if(m.role!=='admin')throw new AppError('Admin access required',403,'ACCESS');
 const own=await store.one('SELECT data FROM managed_account_keys WHERE user=?',user);if(!own)throw unavailable();
 const root=unwrap(env,user,own.data);let nextKey;
 try{nextKey=C.readKeyring(user,body.vault,root).keys.find(k=>k.house===h.id&&k.epoch===body.epoch);if(!nextKey||!/^[a-f0-9]{64}$/.test(nextKey.key))throw Error();}catch{throw new AppError('Family access update could not be verified',409,'CONFLICT');}finally{root.fill(0);}
 const rows=await store.all('SELECT m.user,k.data AS managed_key,v.data AS vault,v.revision FROM secure_members m LEFT JOIN managed_account_keys k ON k.user=m.user LEFT JOIN secure_vaults v ON v.user=m.user WHERE m.house=? AND m.active=1 AND m.user<>? AND m.user<>?',h.id,user,body.remove);
 const statements=[];
 for(const row of rows){
  if(!row.managed_key||!row.vault)throw new AppError('A family member needs to open the current app once before this access update.',409,'MIGRATION_REQUIRED');
  const memberRoot=unwrap(env,row.user,row.managed_key);
  try{const ring=C.readKeyring(row.user,JSON.parse(row.vault),memberRoot),keys=[...ring.keys.filter(k=>k.house!==h.id||k.epoch!==body.epoch),nextKey];statements.push(store.vaultStatement(row.user,{v:2,bundle:C.wrapKeyring(row.user,{keys},memberRoot)},row.revision),store.stmt('INSERT INTO assertions(ok) VALUES(changes())'));}finally{memberRoot.fill(0);}
 }
 return statements;
}
