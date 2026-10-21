// Client-only encryption. No password, recovery secret or family key goes to the server.
import {xchacha20poly1305} from '@noble/ciphers/chacha.js';
import {hmac} from '@noble/hashes/hmac.js';
import {sha256} from '@noble/hashes/sha2.js';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export const random=n=>crypto.getRandomValues(new Uint8Array(n));
export const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export const bytes=hex=>{if(typeof hex!=='string'||!/^([a-f0-9]{2})+$/.test(hex))throw Error('Invalid key');return Uint8Array.from(hex.match(/../g),b=>parseInt(b,16));};
export const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)};
export const un64=s=>{if(typeof s!=='string'||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('Invalid encrypted data');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));};
export function canonical(v){
 if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
 if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v&&typeof v==='object'){const keys=Object.keys(v).sort();if(keys.some(k=>!/^[-A-Za-z0-9_:]{1,128}$/.test(k)||['__proto__','constructor','prototype'].includes(k)))throw Error('Invalid record name');return '{'+keys.map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
 throw Error('Only finite JSON records can be encrypted');
}
const aad=context=>encoder.encode(canonical({protocol:'roomio-e2ee-v1',...context}));
const mac=(key,context,value)=>hex(hmac(sha256,key,encoder.encode(canonical({context,value}))));
export function seal(key,value,context){
 if(key.length!==32)throw Error('Invalid encryption key');
 const nonce=random(24),text=encoder.encode(canonical(value)),tag=mac(key,context,value);
 return {v:1,nonce:b64(nonce),body:b64(xchacha20poly1305(key,nonce,aad({...context,tag})).encrypt(text)),tag};
}
export function open(key,packet,context){
 if(!packet||packet.v!==1||!/^[a-f0-9]{64}$/.test(packet.tag||''))throw Error('Invalid encrypted record');
 const nonce=un64(packet.nonce);if(nonce.length!==24)throw Error('Invalid encrypted nonce');
 const value=JSON.parse(decoder.decode(xchacha20poly1305(key,nonce,aad({...context,tag:packet.tag})).decrypt(un64(packet.body))));
 if(mac(key,context,value)!==packet.tag)throw Error('Encrypted record verification failed');return value;
}
// Two schema-only root markers let the server enforce Admin-only settings; their values stay encrypted.
export const code=(key,path)=>path.length===1&&['settings','familyMeta'].includes(path[0])?hex(sha256(encoder.encode('roomio-e2ee-admin-root:'+path[0]))):mac(key,{purpose:'path'},path);
const context=(house,epoch,path,purpose)=>({house,epoch,path,purpose});
function node(key,value,path,house,epoch){
 const label=path.length?seal(key,path.at(-1),context(house,epoch,path.map((_,i)=>code(key,path.slice(0,i+1))).join('/'),'label')):null;
 if(value&&typeof value==='object'&&!Array.isArray(value))return {t:'o',label,children:Object.fromEntries(Object.entries(value).map(([name,v])=>[code(key,[...path,name]),node(key,v,[...path,name],house,epoch)]))};
 return {t:'v',label,value:seal(key,value,context(house,epoch,path.map((_,i)=>code(key,path.slice(0,i+1))).join('/'),'value'))};
}
export const encryptTree=(key,data,house,epoch)=>node(key,data,[],house,epoch);
export function decryptTree(key,tree,house,epoch){
 function visit(n,opaque,plain){
  if(n.t==='v')return open(key,n.value,context(house,epoch,opaque.join('/'),'value'));
  if(n.t!=='o')throw Error('Invalid encrypted tree');const out=Object.create(null);
  for(const [id,child] of Object.entries(n.children)){
   const name=open(key,child.label,context(house,epoch,[...opaque,id].join('/'),'label'));
   if(typeof name!=='string'||!/^[-A-Za-z0-9_:]{1,128}$/.test(name)||['__proto__','constructor','prototype'].includes(name)||id!==code(key,[...plain,name]))throw Error('Encrypted record path was changed');
   out[name]=visit(child,[...opaque,id],[...plain,name]);
  }return out;
 }return JSON.parse(JSON.stringify(visit(tree,[],[])));
}
export function decryptChangeValue(key,change,house,epoch,which='value'){
 const path=open(key,change.sealedPath,context(house,epoch,change.path,'audit-path'));
 if(path.map((_,i)=>code(key,path.slice(0,i+1))).join('/')!==change.path)throw Error('Encrypted audit path changed');
 if(change[which]===null)return null;
 let wrapped=change[which];for(let i=path.length-2;i>=0;i--){const p=path.slice(0,i+1),opaque=p.map((_,j)=>code(key,p.slice(0,j+1))).join('/');wrapped={t:'o',label:change.parents[i].label,children:{[code(key,path.slice(0,i+2))]:wrapped}};}
 const tree={t:'o',label:null,children:{[code(key,path.slice(0,1))]:wrapped}};
 return path.reduce((v,k)=>v[k],decryptTree(key,tree,house,epoch));
}
const at=(obj,path)=>path.reduce((v,k)=>v?.[k],obj);
export function encryptChanges(key,changes,baseline,house,epoch){return changes.map(c=>{
 const path=c.path.split('/');if(path.some(p=>!p||['__proto__','constructor','prototype'].includes(p)))throw Error('Invalid change path');
 const opaque=path.map((_,i)=>code(key,path.slice(0,i+1)));
 const parents=path.slice(0,-1).map((_,i)=>{const p=path.slice(0,i+1),prior=at(baseline,p);if(prior!==undefined&&(!prior||Array.isArray(prior)||typeof prior!=='object'))throw Error('Change crosses a value');return {path:opaque.slice(0,i+1).join('/'),exists:prior!==undefined,label:seal(key,p.at(-1),context(house,epoch,opaque.slice(0,i+1).join('/'),'label'))};});
 return {path:opaque.join('/'),parents,before:c.before==null?null:node(key,c.before,path,house,epoch),value:c.value==null?null:node(key,c.value,path,house,epoch),sealedPath:seal(key,path,context(house,epoch,opaque.join('/'),'audit-path'))};
});}
export const decryptPath=(key,change,house,epoch)=>open(key,change.sealedPath,context(house,epoch,change.path,'audit-path')).join('/');
export const iterations=600000;
async function passwordKey(password,salt){const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,256));}
const vaultContext=(account,purpose)=>({account,purpose});
const url64=value=>b64(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function fromUrl64(value,length){
 if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid recovery code');
 const result=un64(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
 if(result.length!==length||url64(result)!==value){result.fill(0);throw Error('Check the recovery code');}return result;
}
const shortRecoveryKey=seed=>sha256(new Uint8Array([...encoder.encode('ourhouse-recovery-v2:'),...seed]));
function recoveryKey(secret){
 const value=String(secret).trim();
 if(/^OH2-[A-Za-z0-9_-]{22}$/.test(value)){const seed=fromUrl64(value.slice(4),16);try{return shortRecoveryKey(seed);}finally{seed.fill(0);}}
 if(/^OH1-[A-Za-z0-9_-]{43}$/.test(value))return fromUrl64(value.slice(4),32);
 const parts=value.split('-');if(parts.length!==10||!['ROOMIO1','OURHOUSE1'].includes(parts[0]))throw Error('Invalid recovery code');
 const key=bytes(parts.slice(1,9).join('').toLowerCase());if(key.length!==32||parts[9].toLowerCase()!==hex(sha256(key)).slice(0,8)){key.fill(0);throw Error('Check the recovery code');}return key;
}
// Re-encode old backups without changing their secret or invalidating a copy.
export function compactRecoveryCode(secret){const key=recoveryKey(secret);try{return String(secret).trim().startsWith('OH2-')?String(secret).trim():'OH1-'+url64(key);}finally{key.fill(0);}}
export async function createVault(account,password){
 if(typeof password!=='string'||password.length<16||password.length>256)throw Error('Use a vault passphrase of 16–256 characters');
 const root=random(32),salt=random(16),derived=await passwordKey(password,salt),recovery=recoveryFor(account,root);
 const vault={v:1,kdf:{name:'PBKDF2-SHA256',iterations,salt:b64(salt)},password:seal(derived,hex(root),vaultContext(account,'password-root')),recovery:recovery.packet,bundle:seal(root,{keys:[]},vaultContext(account,'keyring'))};derived.fill(0);
 return {root,vault,recoveryCode:recovery.recoveryCode};
}
export async function unlockVault(account,vault,secret,recovery=false){
 if(vault.v!==1||vault.kdf?.name!=='PBKDF2-SHA256'||vault.kdf.iterations!==iterations||un64(vault.kdf.salt).length!==16)throw Error('Unsupported vault format');
 let wrapping;
 if(recovery)wrapping=recoveryKey(secret);
 else wrapping=await passwordKey(String(secret),un64(vault.kdf.salt));
 try{const root=bytes(open(wrapping,recovery?vault.recovery:vault.password,vaultContext(account,recovery?'recovery-root':'password-root')));open(root,vault.bundle,vaultContext(account,'keyring'));return root;}finally{wrapping.fill(0);}
}
export const readKeyring=(account,vault,root)=>open(root,vault.bundle,vaultContext(account,'keyring'));
export const wrapKeyring=(account,keyring,root)=>seal(root,keyring,vaultContext(account,'keyring'));
export async function changePassphrase(account,vault,root,password){if(password.length<16||password.length>256)throw Error('Use a passphrase of 16–256 characters');const salt=random(16),derived=await passwordKey(password,salt);try{return {...vault,kdf:{name:'PBKDF2-SHA256',iterations,salt:b64(salt)},password:seal(derived,hex(root),vaultContext(account,'password-root'))};}finally{derived.fill(0);}}
export function makeInvitation(key,info){const token=hex(random(32)),secret=random(32),packet=seal(secret,{...info,key:hex(key)},{purpose:'family-invitation',token});return {token,secret:hex(secret),packet};}
export function openInvitation(token,secret,packet){return open(bytes(secret),packet,{purpose:'family-invitation',token});}

export function recoveryFor(account,root){const seed=random(16),wrapping=shortRecoveryKey(seed);try{return {packet:seal(wrapping,hex(root),vaultContext(account,'recovery-root')),recoveryCode:'OH2-'+url64(seed)};}finally{seed.fill(0);wrapping.fill(0);}}
