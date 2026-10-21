// Explicit, temporary test access. The shared code creates separate browser profiles;
// it is never a family decryption key or a shared family identity.
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {CloudStore,digest} from './cloud-store.mjs';
import {AppError} from './domain.mjs';
const cookieName='__Host-ourhouse-test';
const cookie=(token,age)=>`${cookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const active=env=>/^[a-f0-9]{64}$/.test(env.OURHOUSE_TEST_ACCESS_HASH||'')&&Number.isSafeInteger(Number(env.OURHOUSE_TEST_ACCESS_EXPIRES))&&Number(env.OURHOUSE_TEST_ACCESS_EXPIRES)>Date.now();
const token=request=>{const values=String(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));if(values.length!==1)return '';const t=values[0].slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(t)?t:'';};
export async function testIdentity(request,env){
 if(!active(env))return null;const value=token(request);if(!value)return null;
 const store=new CloudStore(env.DB,env.BUCKET),row=await store.one('SELECT s.subject,a.name,a.email FROM test_sessions s JOIN accounts a ON a.id=s.user WHERE s.token=? AND s.code_hash=? AND s.expires>?',digest(value),env.OURHOUSE_TEST_ACCESS_HASH,Date.now());
 return row?{userId:row.subject,displayName:row.name,email:row.email}:null;
}
export async function closeTestSession(request,env){const value=token(request);if(value)await new CloudStore(env.DB,env.BUCKET).stmt('DELETE FROM test_sessions WHERE token=?',digest(value)).run();return cookie('',0);}
export async function testAccess(request,env,headers){
 const reply=(body,status=200,extra={})=>Response.json(body,{status,headers:{...headers,...extra}});
 try{
  if(request.method!=='POST')throw new AppError('Use the OurHouse test access form',405);
  const url=new URL(request.url);if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Open the test link in your browser',403);
  if(!env.DB||!active(env))throw new AppError('This test access has expired or is not enabled',410,'TEST_EXPIRED');
  const store=new CloudStore(env.DB,env.BUCKET);await store.rate('test-access:global',60);await store.rate('test-access:'+String(request.headers.get('cf-connecting-ip')||'unknown'),5);
  let size=0,chunks=[];const reader=request.body?.getReader();if(reader)while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>1024){await reader.cancel();throw new AppError('Access request is too large',413);}chunks.push(r.value);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AppError('Enter your test access code');}
  const code=typeof body?.code==='string'?body.code.trim().toUpperCase():'';
  if(!/^[A-Z0-9-]{12,64}$/.test(code)||!timingSafeEqual(Buffer.from(digest(code),'hex'),Buffer.from(env.OURHOUSE_TEST_ACCESS_HASH,'hex')))throw new AppError('The test access code is incorrect. Try the code shared with your link.',401,'TEST_CODE');
  if(await testIdentity(request,env))return reply({unlocked:true});
  await store.stmt('DELETE FROM test_sessions WHERE expires<=? OR code_hash<>?',Date.now(),env.OURHOUSE_TEST_ACCESS_HASH).run();
  const secret=randomBytes(32).toString('hex'),subject='ourhouse-test:'+randomBytes(32).toString('hex'),user=await store.identity({userId:subject,displayName:'OurHouse tester',email:'tester@ourhouse.invalid'}),expires=Number(env.OURHOUSE_TEST_ACCESS_EXPIRES);
  await store.stmt('INSERT INTO test_sessions(token,user,subject,code_hash,expires) VALUES(?,?,?,?,?)',digest(secret),user,subject,env.OURHOUSE_TEST_ACCESS_HASH,expires).run();
  return reply({unlocked:true},200, {'Set-Cookie':cookie(secret,Math.max(1,Math.floor((expires-Date.now())/1000)))});
 }catch(e){return reply({error:e instanceof AppError?e.message:'Could not open test access. Please try again.',code:e instanceof AppError?e.code:'SERVER'},e instanceof AppError?e.status:500);}
}
