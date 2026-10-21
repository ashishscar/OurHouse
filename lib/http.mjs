import {RELEASE} from '../launch/release.mjs';
import {performanceAPI} from '../maintenance/performance-http.mjs';
import {maintenanceAPI} from '../maintenance/agent.mjs';
import {dispatchJobs} from '../launch/jobs.mjs';
import {storageEnvironment} from './receipt-storage.mjs';
import {consumerIdentity,publicAuthConfig} from '../launch/identity.mjs';
import {handleNotifications,pushConfig} from '../notifications/push.mjs';
import {testAccess,testIdentity,closeTestSession} from './test-access.mjs';
import {handleSecure} from './secure-http.mjs';
import {CloudStore} from './cloud-store.mjs';
import {AppError} from './domain.mjs';
export const security={
 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'X-Frame-Options':'DENY','Permissions-Policy':'camera=(self), microphone=(), geolocation=()',
 'Strict-Transport-Security':'max-age=31536000',
 'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' blob: data: https://images.openfoodfacts.org; connect-src 'self' https://cdn.jsdelivr.net https://tessdata.projectnaptha.com https://world.openfoodfacts.org https://en.wikibooks.org https://*.supabase.co; worker-src 'self' blob: https://cdn.jsdelivr.net; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
const json=(body,status=200)=>Response.json(body,{status,headers:security});
export async function handleLegacyAPI(request,env,identity){
 try{
  const url=new URL(request.url),path=url.pathname.slice(5),post=request.method==='POST';
  if(!['GET','POST'].includes(request.method))throw new AppError('Method not allowed',405);
  if(post&&(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json')))throw new AppError('Open this request from OurHouse',403);
  if(!env.DB||!env.BUCKET)throw new AppError('OurHouse storage is not ready',503);
  const store=new CloudStore(env.DB,env.BUCKET);
  // No public signup, password, demo-account or client identity endpoints exist.
  if(!identity)throw new AppError('Sign in to your family account',401,'AUTH');
  await store.rate('identity:'+identity.userId,post?60:120);
  let body={};if(post){
   const reader=request.body?.getReader();let bytes=0,chunks=[];
   if(reader){while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1100000){await reader.cancel();throw new AppError('Request too large',413);}chunks.push(value);}}
   try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||Array.isArray(body)||typeof body!=='object')throw Error();}catch{throw new AppError('Invalid request');}
  }
  const user=await store.identity(identity);
  if(path==='session'&&!post){try{await store.cleanup();}catch{}return json(await store.snapshot(user));}
  if(path==='invite-info'&&post)return json(await store.inviteInfo(body.token));
  if(post&&path!=='expenses/receipt'){
   if(body.actor!==user)throw new AppError('Your account changed. Reopen your household; your draft stays on this device.',409,'STALE_CONTEXT');
   if(body.house&&(await store.membership(user)).house!==body.house)throw new AppError('Your household changed. Reopen your household.',409,'STALE_CONTEXT');
  }
  if(path==='house'&&post)return json(await store.create(user,body.name,body.people));
  if(path==='changes'&&post)return json(await store.patch(user,body));
  if(path==='invite'&&post)return json(await store.invite(user,body.role));
  if(path==='invitations'&&!post)return json({invites:await store.invitations(user)});
  if(path==='revoke'&&post)return json(await store.revoke(user,body.id));
  if(path==='join'&&post)return json(await store.accept(user,body.token));
  if(path==='member'&&post)return json(await store.member(user,body.id,body.role,body.active));
  if(path==='activity'&&!post)return json({activity:await store.activity(user)});
  if(path==='expenses/receipt')return json(await store.receipt(user,Object.fromEntries(url.searchParams),post?body:null));
  if(path==='delete-account'&&post){const result=await store.deleteAccount(user,body.confirmation);try{await store.cleanup();}catch{result.receiptCleanupPending=true;}return json(result);}
  if(path==='logout'&&post)return json({signedOut:true});
  return json({error:'This service is not connected to OurHouse'},404);
 }catch(e){return json({error:e instanceof AppError?e.message:'OurHouse could not confirm this request. Your unsent changes are kept.',code:e instanceof AppError?e.code:'SERVER'},e instanceof AppError?e.status:500);}
}

export async function handleAPI(request,env,identity){
 const path=new URL(request.url).pathname;
 if(path==='/api/health'){if(request.method!=='GET')return Response.json({ok:false},{status:405,headers:security});try{const row=await env.DB.prepare('SELECT 1 AS ok').first();return Response.json({ok:Number(row?.ok)===1,release:RELEASE},{status:Number(row?.ok)===1?200:503,headers:security});}catch{return Response.json({ok:false,release:RELEASE},{status:503,headers:security});}}
 if(path==='/api/config'){if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405,headers:security});return Response.json({auth:publicAuthConfig(env),push:pushConfig(env),release:RELEASE},{headers:security});}
 try{env=storageEnvironment(env);}catch{return Response.json({error:'OurHouse storage is temporarily unavailable',code:'STORAGE_UNAVAILABLE'},{status:503,headers:security});}
 if(path==='/api/jobs/dispatch')return dispatchJobs(request,env,security);
 if(path==='/api/test-access')return testAccess(request,env,security);
 if(request.headers.get('x-ourhouse-test')==='1'){
  try{identity=await testIdentity(request,env);}catch{return Response.json({error:'Test access is temporarily unavailable',code:'SERVER'},{status:503,headers:security});}
 }
 if(request.headers.get('x-ourhouse-test')!=='1'&&request.headers.get('x-ourhouse-auth')==='supabase'){try{await new CloudStore(env.DB,env.BUCKET).rate('consumer-auth:'+String(request.headers.get('cf-connecting-ip')||'unknown'),120);identity=await consumerIdentity(request,env);}catch(e){return Response.json({error:e.message,code:e.code},{status:e.status||503,headers:security});}}
 if(path==='/api/performance')return performanceAPI(request,env,identity,security);
 if(path==='/api/maintenance')return maintenanceAPI(request,env,identity,security);
 if(path==='/api/notifications')return handleNotifications(request,env,identity,security);
 if(path.startsWith('/api/secure/')){
  const response=await handleSecure(request,env,identity,security);
  if(response.ok&&request.headers.get('x-ourhouse-test')==='1'&&['/api/secure/logout','/api/secure/delete-account'].includes(path)){const headers=new Headers(response.headers);headers.set('Set-Cookie',await closeTestSession(request,env));return new Response(response.body,{status:response.status,headers});}
  return response;
 }
 return Response.json({error:'OurHouse now requires the encrypted client. Reload the app; plaintext saves are disabled.',code:'E2EE_REQUIRED'},{status:426,headers:security});
}
