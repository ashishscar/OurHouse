import assert from 'node:assert/strict';
import * as C from '../crypto/e2ee.mjs';
import {initialData} from '../lib/domain.mjs';
import {RELEASE} from '../launch/release.mjs';

// This harness refuses public hosts and verifies the isolation marker before
// creating synthetic accounts. It never accepts a production URL or identity.
export async function stageSmoke(base,fetcher=fetch,expectedBuild){
 const origin=new URL(base).origin;if(!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))throw Error('Staging checks require the local private-worker proxy');
 const meta=await(await fetcher(origin+'/__qa/meta')).json();assert.ok(meta.staging===true&&meta.identity==='synthetic-only'&&meta.publicRoutes===false&&meta.release===RELEASE,'Private staging metadata mismatch');
 if(expectedBuild)assert.ok(meta.stagingBuild===expectedBuild,'Staging build mismatch: deploy this validated build before testing');
 const run='qa'+C.hex(C.random(6)),accounts=new Map(),checks=[];let key;
 const request=async(actor,path,body,expected=200)=>{const response=await fetcher(origin+'/api/secure/'+path,{method:body?'POST':'GET',headers:{origin,'x-ourhouse-qa-run':run,'x-ourhouse-qa-actor':actor,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});assert.ok(response.status===expected,'Staging API status mismatch: '+path.split('?')[0]);return response.json();};
 const connect=async actor=>{let state=await request(actor,'session');accounts.set(actor,{user:state.user});state=await request(actor,'account-key',{actor:state.user.id,revision:state.vault?.revision||0});const account={user:state.user,root:C.bytes(state.accountKey),state};accounts.set(actor,account);return account;};
 const record=name=>checks.push({name,passed:true});
 try{
  const owner=await connect('owner'),member=await connect('member'),viewer=await connect('viewer'),foreign=await connect('foreign');
  const house=C.hex(C.random(16)),epoch=C.hex(C.random(16));key=C.random(32);const ring={keys:[{house,epoch,key:C.hex(key)}]},data=initialData();data.settings.diet='vegetarian';data.familyMeta={name:'Disposable release QA'};
  owner.state=await request('owner','house',{actor:owner.user.id,id:house,epoch,tree:C.encryptTree(key,data,house,epoch),vault:{v:2,bundle:C.wrapKeyring(owner.user.id,ring,owner.root)},vaultRevision:owner.state.vault.revision});record('managed encrypted household creation');
  const small=await request('owner','session?since='+owner.state.syncToken);assert.ok(small.unchanged===true&&!small.tree&&!small.accountKey,'Unchanged response leaked a snapshot');record('revision-only sync');
  const other=await request('foreign','session?since='+owner.state.syncToken);assert.ok(other.unchanged!==true&&other.house===null,'Foreign account reused another session');record('foreign-family isolation');
  for(const [actor,account,role] of [['member',member,'editor'],['viewer',viewer,'viewer']]){
   const info={id:C.hex(C.random(16)),house,epoch,role,expires:Date.now()+3600000,name:'Disposable release QA',keys:ring.keys},invitation=C.makeInvitation(key,info);
   await request('owner','invite',{actor:owner.user.id,...info,token:invitation.token,packet:invitation.packet,keys:undefined,name:undefined});
   account.state=await request(actor,'join',{actor:account.user.id,token:invitation.token,vault:{v:2,bundle:C.wrapKeyring(account.user.id,ring,account.root)},vaultRevision:account.state.vault.revision});
   assert.ok(account.state.house.id===house,'Invitation joined the wrong household');
  }record('member and read-only invitations');
  const change=(actor,path,value,id)=>({actor,house,epoch,id,changes:C.encryptChanges(key,[{path,before:null,value}],data,house,epoch)}),first=change(owner.user.id,'grocery/release_rice',{name:'QA rice',qty:.5,unit:'kg'},'release_rice');
  const saved=await Promise.all([request('owner','changes',first),request('member','changes',change(member.user.id,'pantry/release_lentils',{name:'QA lentils',qty:2,unit:'cup'},'release_lentils'))]);
  const latest=await request('owner','session'),decoded=C.decryptTree(key,latest.tree,house,epoch);assert.ok(decoded.grocery.release_rice.qty===.5&&decoded.pantry.release_lentils.qty===2,'Concurrent writes did not merge');
  const replay=await request('owner','changes',first);assert.ok(replay.replayed===true&&replay.house.revision===latest.house.revision,'A retry duplicated an operation');record('concurrent writes and idempotent retries');
  await request('viewer','changes',change(viewer.user.id,'pantry/forbidden',{name:'Forbidden',qty:1,unit:'pcs'},'viewer_write'),403);await request('foreign','changes',change(foreign.user.id,'pantry/forbidden',{name:'Forbidden',qty:1,unit:'pcs'},'foreign_write'),403);record('read-only and foreign writes rejected');
  const receiptId=C.hex(C.random(32)),scope={actor:owner.user.id,house,epoch,id:receiptId},context={house,epoch,id:receiptId,purpose:'synthetic-release-receipt'},payload=C.seal(key,{data:'Synthetic receipt only'},context);
  const receipt=await request('owner','receipt',{actor:owner.user.id,house,scope,payload});assert.ok(C.open(key,receipt.payload,context).data==='Synthetic receipt only','Staging encrypted receipt failed');record('isolated encrypted receipt storage');
  const prior=member.state.syncToken;await request('owner','member',{actor:owner.user.id,house,id:member.user.id,role:'viewer',active:true});const access=await request('member','session?since='+prior);assert.ok(access.unchanged!==true&&access.house.role==='viewer','Role change was hidden by revision polling');await request('member','changes',change(member.user.id,'pantry/blocked',{name:'Blocked',qty:1,unit:'pcs'},'changed_role_write'),403);record('role changes invalidate the revision token');
 }finally{
  let cleanupFailed=false;for(const [actor,account] of accounts){try{await request(actor,'delete-account',{actor:account.user.id,confirmation:'DELETE'});}catch{cleanupFailed=true;}account.root?.fill(0);}key?.fill(0);if(cleanupFailed)throw Error('Synthetic staging account cleanup needs attention');
 }
 record('synthetic accounts and receipts cleaned up');return {passed:true,release:RELEASE,checkedAt:new Date().toISOString(),checks};
}
