import {sessionGuard} from '../launch/auth-safety.mjs';
import {cacheMatchesSession} from '../launch/cache.mjs';
import {validateDietChanges,dietMode} from '../recipes/diets.mjs';
import * as C from './e2ee.mjs';
import {loadDevice,saveDevice} from './device.mjs';
import {initialData,validateData,diff,at,set} from '../lib/domain.mjs';
import Ledger from '../lib/expense-ledger.cjs';
const copy=v=>JSON.parse(JSON.stringify(v));
const encryptedCacheKey=()=>new URLSearchParams(location.search).get('test')==='1'?'ourhouse.test.encrypted-cache':window.OurHouseAuth?.enabled?'ourhouse.consumer.encrypted-cache:'+window.OurHouseAuth.subject:'roomio.encrypted-cache';
let root=null,account=null,vault=null,ring=null,raw=null,view=null,unlocking=null,viewSession=null;
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const responseGuards=new WeakMap(),viewGuards=new WeakMap();
function boundTransport(){const guard=sessionGuard(window.OurHouseAuth);return (path,body)=>transport(path,body,guard);}
function assertView(value){viewGuards.get(value)?.();}
async function transport(path,body,guard=sessionGuard(window.OurHouseAuth)){
 guard();const actor=account,house=raw?.house?.id;
 if(navigator.onLine===false)throw Error('Offline');
 const headers=await window.OurHouseAuth?.headers?.();guard();
 let response;try{response=await fetch('/api/secure/'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:{...headers,...(new URLSearchParams(location.search).get('test')==='1'?{'x-ourhouse-test':'1'}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify({...body,actor,...(house?{house}:{})})}:{}),signal:AbortSignal.timeout(20000)});}catch(e){guard();throw e;}
 guard();const data=await response.json();guard();
 if(!response.ok){if(response.status===401&&root)lock();const e=Error(data.error||'Encrypted request failed');e.status=response.status;e.code=data.code;throw e;}
 if(data&&typeof data==='object')responseGuards.set(data,guard);return data;
}
function vaultBody(bundle=ring){return {...vault,bundle:C.wrapKeyring(account,bundle,root)};}
function onlyVault(v){const {revision,...value}=v;return value;}
function lock(){viewSession=null;root?.fill(0);root=null;ring=null;vault=null;view=null;raw=null;account=null;$('roomioVaultGate')?.remove();$('roomioBackupGate')?.remove();window.RoomioFamily?.lockView();}
function rememberInvite(){try{const h=new URLSearchParams(location.hash.slice(1));if(h.get('join')&&h.get('key'))sessionStorage.setItem('roomio.encrypted-invite',JSON.stringify({token:h.get('join'),secret:h.get('key')}));}catch{}}
function inviteSecret(token){rememberInvite();try{const i=JSON.parse(sessionStorage.getItem('roomio.encrypted-invite'));if(i.token===token)return i.secret;}catch{}throw Error('Open the complete private invitation link, including its encryption key.');}
function keyFor(epoch=raw?.house?.epoch){const item=ring?.keys.find(k=>k.house===raw?.house?.id&&k.epoch===epoch);if(!item){const e=Error('Your family key changed. Ask an Admin for a fresh encrypted access link. Your old encrypted drafts stay on this device.');e.code='KEY_CHANGED';e.status=409;throw e;}return C.bytes(item.key);}
async function requireUnlock(state){
 const owner=state.user.id,guard=responseGuards.get(state)||sessionGuard(window.OurHouseAuth);guard();
 if(unlocking)return unlocking;
 if(account!==owner)lock();account=owner;vault=state.vault;
 unlocking=(async()=>{
  let remembered=null;try{remembered=await loadDevice(owner);}catch{}guard();
  let previous=null;
  if(vault&&remembered)try{const candidate=C.bytes(remembered.root);C.readKeyring(owner,onlyVault(vault),candidate);previous=candidate;}catch{}
  if(state.accountMode==='managed'){
   let connected=state;
   if(state.offline){if(!previous)throw Error('Reconnect to restore your account on this device.');}
   else if(!state.accountKey){connected=await transport('account-key',{revision:vault?.revision||0,...(previous?{root:C.hex(previous)}:{})},guard);guard();state.vault=connected.vault;vault=connected.vault;}
   const candidate=state.offline?previous:C.bytes(connected.accountKey);
   const nextRing=C.readKeyring(owner,onlyVault(vault),candidate);guard();
   if(!remembered||remembered.root!==C.hex(candidate)||remembered.recoveryCode)await saveDevice(owner,{root:C.hex(candidate)});
   guard();if(root!==candidate)root?.fill(0);root=candidate;ring=nextRing;
   delete state.accountKey;if(connected!==state)delete connected.accountKey;
   if(previous!==candidate)previous?.fill(0);return;
  }
  // Compatibility for the historical test host; public accounts always use
  // managed restoration and never expose a code/passphrase screen.
  if(previous){root?.fill(0);root=previous;ring=C.readKeyring(owner,onlyVault(vault),root);return;}
  if(vault){const error=Error('Open the current OurHouse app on your previous device to finish account sync.');error.code='MIGRATION_REQUIRED';throw error;}
  let pending=remembered;
  if(!pending?.pendingVault){const created=await C.createVault(owner,C.hex(C.random(32)));guard();pending={root:C.hex(created.root),pendingVault:created.vault};await saveDevice(owner,pending);guard();}
  let saved;try{saved=await transport('vault',{vault:pending.pendingVault,revision:0},guard);}catch(e){if(e.code!=='VAULT_CONFLICT')throw e;saved=(await transport('session',undefined,guard)).vault;}guard();
  const candidate=C.bytes(pending.root);ring=C.readKeyring(owner,onlyVault(saved),candidate);root=candidate;vault=saved;
 })();try{await unlocking;}finally{unlocking=null;}
}
async function decode(state){
 const guard=responseGuards.get(state)||sessionGuard(window.OurHouseAuth);guard();await requireUnlock(state);guard();
 if(raw?.user.id===state.user.id&&raw?.house?.id&&raw.house.id===state.house?.id&&state.house.revision<raw.house.revision){const e=Error('A newer family update is already open. Refresh to continue.');e.code='STALE_SNAPSHOT';e.status=409;throw e;}
 const nextVault=state.vault||vault,nextRing=C.readKeyring(account,onlyVault(nextVault),root);let nextView;
 if(!state.house)nextView={user:state.user,house:null};
 else{
  const entry=nextRing.keys.find(k=>k.house===state.house.id&&k.epoch===state.house.epoch);
  if(!entry){const e=Error('Your family key changed. Ask an Admin for a fresh encrypted access link. Your old encrypted drafts stay on this device.');e.code='KEY_CHANGED';e.status=409;throw e;}
  const data=C.decryptTree(C.bytes(entry.key),state.tree,state.house.id,state.house.epoch);validateData(data,{});
  data.members=Object.fromEntries(state.members.map(m=>[m.user,{name:data.profiles?.[m.user]?.name||(m.user===account?state.user.name:'Family member '+m.user.slice(0,4)),role:m.role,active:!!m.active}]));
  nextView={user:state.user,house:{...state.house,name:data.familyMeta?.name||'My family'},data,offline:!!state.offline};
 }
 guard();raw=state;vault=nextVault;ring=nextRing;view=nextView;viewSession=JSON.stringify([window.OurHouseAuth?.subject||null,window.OurHouseAuth?.generation||0]);viewGuards.set(view,guard);return view;
}
let cacheWarning=false;
function cacheState(state){try{const {accountKey,...cachedState}=state;localStorage.setItem(encryptedCacheKey(),JSON.stringify({...cachedState,vault:state.vault||vault,authSubject:window.OurHouseAuth?.subject||null,user:{id:state.user.id,name:'Offline member',email:''}}));cacheWarning=false;}catch{if(!cacheWarning){window.showToast?.('Family saved online. This browser could not refresh its offline copy.',true);cacheWarning=true;}}}
async function session(){const guard=sessionGuard(window.OurHouseAuth);rememberInvite();const cached=raw,conditional=!!(root&&view&&raw?.syncToken&&!raw.offline&&viewSession===JSON.stringify([window.OurHouseAuth?.subject||null,window.OurHouseAuth?.generation||0]));let state;try{state=await transport('session'+(conditional?'?since='+raw.syncToken:''),undefined,guard);if(state.unchanged){guard();if(!conditional||state.syncToken!==cached?.syncToken||!view||!root)throw Error('Refresh your household to continue.');if(raw===cached)raw.serverTime=state.serverTime;return view;}}catch(e){guard();if(e.status&&e.status<500)throw e;try{state=JSON.parse(localStorage.getItem(encryptedCacheKey())||(window.OurHouseAuth?.enabled?localStorage.getItem('ourhouse.consumer.encrypted-cache'):null));if(!state?.vault||!cacheMatchesSession(state,window.OurHouseAuth)){lock();throw e;}state.offline=true;}catch{throw e;}}try{const value=await decode(state);if(!state.offline)cacheState(state);return value;}catch(e){guard();if(e.code==='KEY_CHANGED'&&sessionStorage.getItem('roomio.encrypted-invite')){raw=state;view={user:state.user,house:null,needsKey:true};viewGuards.set(view,guard);return view;}if(e.code==='KEY_CHANGED'){window.RoomioFamily?.lockView();window.RoomioFamily?.gate('signin',e.message);}throw e;}}
async function result(state){const value=await decode(state);cacheState(state);return value;}
function metadata(info,secret){const opened=C.openInvitation(info.token||'',secret,info.packet);for(const k of ['house','epoch','role','expires','id'])if(opened[k]!==info[k])throw Error('The invitation metadata changed');return opened;}
async function inviteInfo(token){const info=await transport('invite-info',{token}),opened=metadata({...info,token},inviteSecret(token));return {...info,name:opened.name,opened};}
async function apiInternal(path,body){
 const send=boundTransport();
 if(path==='session')return session();
 if(!root)throw Error('Unlock your encrypted vault first');
 if(path==='house'){
  const id=C.hex(C.random(16)),epoch=C.hex(C.random(16)),key=C.random(32),data=initialData();data.settings.people=body.people;data.settings.diet=dietMode(body.diet);data.familyMeta={name:body.name};data.profiles={[account]:{name:raw.user.name}};validateData(data,{});
  const next={keys:[...ring.keys,{house:id,epoch,key:C.hex(key)}]},v=onlyVault(vaultBody(next));const state=await send('house',{id,epoch,tree:C.encryptTree(key,data,id,epoch),vault:v,vaultRevision:vault.revision});responseGuards.get(state)?.();ring=next;return result(state);
 }
 if(path==='changes'){
  const next=copy(view.data);delete next.members;for(const c of body.changes)set(next,c.path,c.value);validateData(next,{});validateDietChanges(view.data,next);
  const changes=C.encryptChanges(keyFor(),body.changes,view.data,raw.house.id,raw.house.epoch);return result(await send('changes',{id:body.id,epoch:raw.house.epoch,changes}));
 }
 if(path==='invite-info')return inviteInfo(body.token);
 if(path==='invite'){
  const info={house:raw.house.id,epoch:raw.house.epoch,id:C.hex(C.random(16)),role:body.role,expires:raw.serverTime+7*864e5-60000,name:view.house.name,keys:ring.keys.filter(k=>k.house===raw.house.id)};
  const invitation=C.makeInvitation(keyFor(),info);await send('invite',{...info,token:invitation.token,packet:invitation.packet,keys:undefined,name:undefined});return {token:invitation.token+'&key='+invitation.secret,id:info.id,role:info.role,expires:info.expires};
 }
 if(path==='join'){
  const info=await inviteInfo(body.token),opened=info.opened,next={keys:[...ring.keys.filter(k=>k.house!==info.house),...opened.keys]};
  const state=await send('join',{token:body.token,vault:onlyVault(vaultBody(next)),vaultRevision:vault.revision});ring=next;try{sessionStorage.removeItem('roomio.encrypted-invite');}catch{}return result(state);
 }
 if(path==='invitations'||path==='revoke')return send(path,body);
 if(path==='member'){
  if(body.active===false){
   const latest=await session();if(latest.offline)throw Error('Reconnect before removing a member');
   if(!confirm('Remove this person’s access to future family updates? Previously downloaded copies cannot be erased.'))return latest;
   const epoch=C.hex(C.random(16)),key=C.random(32),data=copy(view.data);delete data.members;const next={keys:[...ring.keys,{house:raw.house.id,epoch,key:C.hex(key)}]};const state=await send('rotate',{remove:body.id,revision:raw.house.revision,epoch,tree:C.encryptTree(key,data,raw.house.id,epoch),vault:onlyVault(vaultBody(next)),vaultRevision:vault.revision});responseGuards.get(state)?.();ring=next;return result(state);
  }return result(await send('member',body));
 }
 if(path==='activity'){const output=await send('activity');return {activity:output.activity.map(op=>({actor:op.actor,at:op.at,changes:op.changes.map(c=>({path:C.decryptPath(keyFor(op.epoch),c,raw.house.id,op.epoch)}))}))};}
 if(path==='delete-account'){if(body.confirmation!==(view?.house?.owner===account?view.house.name:'DELETE'))throw Error('The confirmation does not match');return send(path,{confirmation:'DELETE'});}
 if(path==='logout'){try{await window.OurHouseApp?.beforeSignOut();}catch{}const out=await send(path,{});try{localStorage.removeItem(encryptedCacheKey());}catch{}lock();return out;}
 throw Error('This service is not connected to the encrypted app');
}
async function api(path,body){const metric=path==='session'?'SYNC':path==='changes'?'SAVE':null,start=performance.now();let failed=false;try{return await apiInternal(path,body);}catch(error){failed=true;throw error;}finally{if(metric)window.OurHouseMetrics?.measure(metric,performance.now()-start,failed);}}
function localContext(key){return {account,purpose:'device-outbox',storageKey:key};}
export function sealLocal(value,key){if(!root)throw Error('Unlock your vault before keeping a draft');return JSON.stringify(C.seal(root,value,localContext(key)));}
export function openLocal(text,key){if(!root)throw Error('Unlock your vault before reopening a draft');return C.open(root,JSON.parse(text),localContext(key));}
async function requestReceipt(scope,token,file){const send=boundTransport();if(!root||scope.site!==raw?.house?.id||scope.actor!==account)throw Error('Reopen this receipt from your own family');const history=ring.keys.filter(k=>k.house===scope.site).slice().reverse();for(const entry of history){const key=C.bytes(entry.key),id=C.code(key,['receipt',scope.group,scope.entry,scope.id]),bound={house:scope.site,epoch:entry.epoch,group:scope.group,entry:scope.entry,id:scope.id,purpose:'receipt'},params={actor:account,house:scope.site,epoch:entry.epoch,id};if(file&&entry.epoch!==raw.house.epoch)continue;try{const cacheKey='roomio.encrypted-receipt:'+account+':'+scope.site+':'+entry.epoch+':'+id;let payload=null;if(file){const cached=localStorage.getItem(cacheKey);payload=cached?JSON.parse(cached):C.seal(key,file,bound);const check=C.open(key,payload,bound);if(check.id!==file.id||check.sha256!==file.sha256)throw Error('Receipt draft does not match this file');localStorage.setItem(cacheKey,JSON.stringify(payload));}let output;try{output=await send('receipt',{scope:params,payload});}catch(e){if(file&&e.code==='RECEIPT_RETRY')output=await send('receipt',{scope:params,payload:null});else throw e;}const record=C.open(key,output.payload,bound);if(file)localStorage.removeItem(cacheKey);if(record.id!==scope.id)throw Error('Encrypted receipt scope changed');const reference={...record,uploadedBy:output.actor,createdAt:output.at};return file?{saved:true,receipt:reference}:reference;}catch(e){if(!file&&e.status===404)continue;throw e;}}throw Error('Receipt is not available with your family keys');}
async function refreshAccess(target){const guard=sessionGuard(window.OurHouseAuth),send=boundTransport();const person=raw.members.find(m=>m.user===target);if(!person)throw Error('Choose an active family member');const info={house:raw.house.id,epoch:raw.house.epoch,id:C.hex(C.random(16)),role:person.role==='viewer'?'viewer':'editor',expires:raw.serverTime+7*864e5-60000,name:view.house.name,keys:ring.keys.filter(k=>k.house===raw.house.id)};const invite=C.makeInvitation(keyFor(),info);await send('invite',{...info,target,token:invite.token,packet:invite.packet,keys:undefined,name:undefined});guard();const link=location.origin+'/?'+(window.OurHouseTest?.active?'test=1':'')+'#join='+invite.token+'&key='+invite.secret;prompt('Share this private key refresh link only with this family member. Single use; valid for 7 days.',link);}
async function showExpenseHistory(group,entry){
 const guard=sessionGuard(window.OurHouseAuth),send=boundTransport();
 const box=document.getElementById('roomioConfirmedHistory');if(!box)return;box.textContent='Decrypting confirmed history…';
 try{let after=0,records=[],data={};
  while(true){const page=await send('activity?after='+after);if(!page.activity.length)break;for(const op of page.activity){const before=copy(data);for(const change of op.changes){const path=C.decryptPath(keyFor(op.epoch),change,raw.house.id,op.epoch);set(data,path,C.decryptChangeValue(keyFor(op.epoch),change,raw.house.id,op.epoch));}const previous=before.expenseGroups?.[group]?.entries?.[entry],current=data.expenseGroups?.[group]?.entries?.[entry],business=e=>e&&Object.fromEntries(Object.entries(e).filter(([k])=>!['history','revision','modifiedBy','updatedAt'].includes(k)));if(current&&JSON.stringify(business(previous))!==JSON.stringify(business(current)))records.push({value:current,actor:op.actor,at:op.at});after=op.revision;}if(page.activity.length<50)break;}
  guard();box.replaceChildren();for(const r of records.reverse()){const row=document.createElement('div');row.className='card';row.style.padding='12px';const title=document.createElement('b');title.textContent=r.value.description+' · '+Ledger.format(r.value.amount,r.value.currency);const detail=document.createElement('p');detail.className='finehint';detail.textContent=(view.data.members[r.actor]?.name||'Former member')+' · '+new Date(r.at).toLocaleString();row.append(title,detail);box.append(row);}if(!records.length)box.textContent='No confirmed encrypted changes for this entry.';
 }catch(e){box.textContent='Could not verify the encrypted history: '+e.message;}
}
window.RoomioVault={assertView,showExpenseHistory,api,sealLocal,openLocal,lock,refreshAccess};
window.ExpenseReceipts={...window.ExpenseReceipts,request:requestReceipt};
