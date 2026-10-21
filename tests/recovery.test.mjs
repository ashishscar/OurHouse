import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '@noble/hashes/sha2.js';
import * as C from '../crypto/e2ee.mjs';

test('automatic compact recovery codes restore the full vault only for the correct account',async()=>{
 const {root,vault,recoveryCode}=await C.createVault('recovery-fixture','synthetic optional passphrase');
 assert.equal(root.length,32);assert.match(recoveryCode,/^OH2-[A-Za-z0-9_-]{22}$/);
 assert.deepEqual(await C.unlockVault('recovery-fixture',vault,recoveryCode,true),root);
 const seen=new Set([recoveryCode]);
 for(let i=0;i<64;i++){
  const next=C.recoveryFor('recovery-fixture',root);assert.equal(seen.has(next.recoveryCode),false);seen.add(next.recoveryCode);
  assert.deepEqual(await C.unlockVault('recovery-fixture',{...vault,recovery:next.packet},next.recoveryCode,true),root);
  assert.equal(C.compactRecoveryCode(next.recoveryCode),next.recoveryCode);
 }
 for(const code of ['123456','OH2-123456',recoveryCode.slice(0,-1),'OH2-'+('A'.repeat(22))])await assert.rejects(()=>C.unlockVault('recovery-fixture',vault,code,true));
 await assert.rejects(()=>C.unlockVault('other-account',vault,recoveryCode,true));
 assert.ok(!JSON.stringify(vault).includes(recoveryCode));assert.ok(!JSON.stringify(vault).includes(C.hex(root)));
});

test('legacy codes can be compacted without rotating keys or invalidating saved recovery copies',async()=>{
 const account='legacy-fixture',{root,vault}=await C.createVault(account,'synthetic optional passphrase'),key=C.random(32);
 const legacy='OURHOUSE1-'+C.hex(key).match(/.{1,8}/g).join('-')+'-'+C.hex(sha256(key)).slice(0,8);
 const original={...vault,recovery:C.seal(key,C.hex(root),{account,purpose:'recovery-root'})},before=JSON.stringify(original);
 const compact=C.compactRecoveryCode(legacy);assert.equal(compact.length,47);assert.match(compact,/^OH1-/);
 for(const code of [legacy,legacy.replace('OURHOUSE1-','ROOMIO1-'),compact])assert.deepEqual(await C.unlockVault(account,original,code,true),root);
 assert.equal(JSON.stringify(original),before);assert.equal(C.compactRecoveryCode(compact),compact);
 assert.throws(()=>C.compactRecoveryCode(legacy.slice(0,-1)+(legacy.endsWith('0')?'1':'0')));
});
