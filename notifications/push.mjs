import {buildPushPayload} from '@block65/webcrypto-web-push';
import {createHash} from 'node:crypto';
import {SecureStore} from '../lib/secure-store.mjs';
import {AppError} from '../lib/domain.mjs';
import {privateFetch} from '../lib/private-fetch.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export const pushConfig=env=>({enabled:!!(env.OURHOUSE_VAPID_PUBLIC_KEY&&env.OURHOUSE_VAPID_PRIVATE_KEY&&env.OURHOUSE_VAPID_SUBJECT),publicKey:env.OURHOUSE_VAPID_PUBLIC_KEY||null});
export function subscription(value){
 const endpoint=value?.endpoint;if(typeof endpoint!=='string'||endpoint.length>4096)throw new AppError('This browser did not provide a valid push subscription');
 let u;try{u=new URL(endpoint);}catch{throw new AppError('Invalid notification endpoint');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!(/^(?:fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(u.hostname)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname)))throw new AppError('This browser’s notification provider is not supported');
 const {p256dh,auth}=value.keys||{};const key=Buffer.from(p256dh||'','base64url'),secret=Buffer.from(auth||'','base64url');if(!/^[A-Za-z0-9_-]{87}$/.test(p256dh||'')||key.length!==65||key[0]!==4||!/^[A-Za-z0-9_-]{22}$/.test(auth||'')||secret.length!==16)throw new AppError('Invalid notification encryption keys');
 return {endpoint:u.href,keys:{p256dh,auth}};
}
export function quietNow(prefs,time=Date.now()){if(!prefs.quiet)return false;try{const hour=Number(new Intl.DateTimeFormat('en',{timeZone:prefs.timezone,hour:'numeric',hourCycle:'h23'}).format(new Date(time)));return prefs.start<prefs.end?hour>=prefs.start&&hour<prefs.end:hour>=prefs.start||hour<prefs.end;}catch{return true;}}
export function preferences(p={}){let timezone=typeof p.timezone==='string'?p.timezone:'UTC';try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format();}catch{throw new AppError('Choose a valid notification time zone');}const start=p.start??22,end=p.end??7;if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||start>23||end<0||end>23||start===end)throw new AppError('Choose different quiet-hour start and end times');return {quiet:p.quiet===true,start,end,timezone};}
export async function handleNotifications(request,env,identity,headers){const reply=(body,status=200)=>Response.json(body,{status,headers});try{
 if(!identity)throw new AppError('Sign in to manage notifications',401,'AUTH');const url=new URL(request.url),post=request.method==='POST';if(!['GET','POST'].includes(request.method))throw new AppError('Method not allowed',405);
 if(post&&(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json')))throw new AppError('Open OurHouse to manage notifications',403);
 const store=new SecureStore(env.DB,env.BUCKET);await store.rate('push:'+identity.userId,post?15:120);const user=await store.identity(identity);
 if(!post)return reply({devices:(await store.all('SELECT id,prefs,updated_at FROM push_subscriptions WHERE user=?',user)).map(s=>({...s,prefs:JSON.parse(s.prefs)})),...pushConfig(env)});
 let bytes=0,chunks=[];const reader=request.body?.getReader();if(reader)while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>10000){await reader.cancel();throw new AppError('Notification request too large',413);}chunks.push(r.value);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new AppError('Invalid notification request');}
 if(body.action==='unsubscribe'){if(!/^[a-f0-9]{64}$/.test(body.id||''))throw new AppError('Invalid device');await store.db.batch([store.stmt('DELETE FROM push_deliveries WHERE subscription IN (SELECT id FROM push_subscriptions WHERE id=? AND user=?)',body.id,user),store.stmt('DELETE FROM push_subscriptions WHERE id=? AND user=?',body.id,user)]);return reply({disabled:true});}
 const {m}=await store.context(user);if(!pushConfig(env).enabled)throw new AppError('Background notifications are not configured yet',503,'PUSH_SETUP');
 if(body.action==='subscribe'){
  const sub=subscription(body.subscription),id=hash(sub.endpoint),prefs=preferences(body.preferences),existing=await store.one('SELECT user FROM push_subscriptions WHERE id=?',id);
  if(existing&&existing.user!==user)throw new AppError('Disable notifications from the previous account on this device first',409,'DEVICE_ACCOUNT');
  if(!existing&&(await store.one('SELECT count(*) n FROM push_subscriptions WHERE user=?',user)).n>=5)throw new AppError('Remove an older notification device first');
  await store.stmt('INSERT INTO push_subscriptions(id,user,endpoint,p256dh,auth,prefs,mode,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM push_subscriptions WHERE user=?)<5 OR EXISTS(SELECT id FROM push_subscriptions WHERE id=? AND user=?) ON CONFLICT(id) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,prefs=excluded.prefs,mode=excluded.mode,updated_at=excluded.updated_at WHERE push_subscriptions.user=excluded.user',id,user,sub.endpoint,sub.keys.p256dh,sub.keys.auth,JSON.stringify(prefs),identity.userId.startsWith('ourhouse-test:')?'test':'consumer',Date.now(),user,id,user).run();const saved=await store.one('SELECT user FROM push_subscriptions WHERE id=?',id);if(saved?.user!==user)throw new AppError('This device belongs to another account or the device limit was reached',409,'DEVICE_ACCOUNT');return reply({id,enabled:true,prefs});
 }
 if(body.action==='test'){const sub=await store.one('SELECT id FROM push_subscriptions WHERE id=? AND user=?',body.id,user);if(!sub)throw new AppError('Enable notifications on this device first',404);const id=crypto.randomUUID();await store.stmt('INSERT INTO push_deliveries(id,subscription,house,kind,created_at,next_at,attempts,lease_until) VALUES(?,?,?,?,?,?,0,0)',id,sub.id,m.house,'test',Date.now(),Date.now()).run();return reply({queued:true});}
 throw new AppError('Unknown notification action');
 }catch(e){return reply({error:e instanceof AppError?e.message:'Notifications could not be updated. Try again.',code:e instanceof AppError?e.code:'SERVER'},e instanceof AppError?e.status:500);}}
export async function enqueueFamilyUpdate(env,user,house,revision){const store=new SecureStore(env.DB,env.BUCKET),now=Date.now();await store.stmt("INSERT OR IGNORE INTO push_deliveries(id,subscription,house,kind,created_at,next_at,attempts,lease_until) SELECT ?||':'||s.id,s.id,?,'family-update',?,?,0,0 FROM push_subscriptions s JOIN secure_members m ON m.user=s.user WHERE m.house=? AND m.active=1 AND s.user<>?",house+':'+revision,house,now,now,house,user).run();}
export async function dispatchPush(env,network=fetch,clock=Date.now){if(!pushConfig(env).enabled||!env.DB)return {sent:0};const store=new SecureStore(env.DB,env.BUCKET),now=clock();let sent=0;
 // Retain only a bounded operational queue; no family content is included.
 const rows=await store.all('SELECT id FROM push_deliveries WHERE next_at<=? AND lease_until<=? AND attempts<5 AND created_at>? ORDER BY created_at LIMIT 20',now,now,now-24*3600000);
 if(rows.length)await store.stmt('DELETE FROM push_deliveries WHERE created_at<? OR attempts>=5',now-24*3600000).run();
 const deliver=async({id})=>{const lease=await store.stmt('UPDATE push_deliveries SET lease_until=?,attempts=attempts+1 WHERE id=? AND next_at<=? AND lease_until<=? RETURNING *',now+30000,id,now,now).first();if(!lease)return;
  const sub=await store.one('SELECT s.* FROM push_subscriptions s JOIN secure_members m ON m.user=s.user WHERE s.id=? AND m.house=? AND m.active=1',lease.subscription,lease.house);
  if(!sub||lease.kind!=='test'&&quietNow(JSON.parse(sub.prefs),now)){await store.stmt('DELETE FROM push_deliveries WHERE id=?',id).run();return;}
  try{
   const data={title:'OurHouse',body:lease.kind==='test'?'Notifications are ready on this device.':'Your family has an update. Open OurHouse to see it.',tag:lease.kind==='test'?'ourhouse-test':'ourhouse-family-update',url:sub.mode==='test'?'/?test=1':'/'};
   const target=subscription({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}});
   const payload=await buildPushPayload({data,options:{ttl:3600,urgency:'normal'}},target,{subject:env.OURHOUSE_VAPID_SUBJECT,publicKey:env.OURHOUSE_VAPID_PUBLIC_KEY,privateKey:env.OURHOUSE_VAPID_PRIVATE_KEY});
   const response=await privateFetch(network,target.endpoint,{...payload,signal:AbortSignal.timeout(5000)});
   if(response.status===404||response.status===410){await store.db.batch([store.stmt('DELETE FROM push_deliveries WHERE subscription=?',sub.id),store.stmt('DELETE FROM push_subscriptions WHERE id=?',sub.id)]);return;}
   if(!response.ok)throw Error('Push service unavailable');await store.stmt('DELETE FROM push_deliveries WHERE id=?',id).run();sent++;
  }catch{await store.stmt('UPDATE push_deliveries SET next_at=?,lease_until=0 WHERE id=?',now+Math.min(3600000,15000*2**lease.attempts),id).run();}
 };
 let cursor=0;await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(cursor<rows.length)await deliver(rows[cursor++]);}));
 return {sent};
}
