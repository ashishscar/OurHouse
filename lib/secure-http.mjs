import {SecureStore} from './secure-store.mjs';
import {AppError} from './domain.mjs';
import {accountSession,connectAccount,managedMemberVaults} from './managed-accounts.mjs';
export async function handleSecure(request,env,identity,headers){const reply=(body,status=200)=>Response.json(body,{status,headers});try{
 const url=new URL(request.url),path=url.pathname.replace('/api/secure/',''),post=request.method==='POST';
 if(!['GET','POST'].includes(request.method))throw new AppError('Method not allowed',405);
 if(!identity)throw new AppError('Sign in to your OurHouse account',401,'AUTH');
 if(post&&(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json')))throw new AppError('Open this request from OurHouse',403);
 const store=new SecureStore(env.DB,env.BUCKET);await store.rate('secure:'+identity.userId,post?60:120);const user=await store.identity(identity);
 let body={};if(post){let size=0,chunks=[];const reader=request.body?.getReader();if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2500000){await reader.cancel();throw new AppError('Encrypted request is too large',413);}chunks.push(value);}try{body=JSON.parse(Buffer.concat(chunks).toString());if(!body||Array.isArray(body)||typeof body!=='object')throw Error();}catch{throw new AppError('Invalid encrypted request');}}
 if(path==='session'&&!post){const since=url.searchParams.get('since');if(since&&/^[a-f0-9]{64}$/.test(since)&&since===await store.sessionRevision(user))return reply({unchanged:true,syncToken:since,serverTime:Date.now()});try{await store.cleanup();}catch{}return reply(await accountSession(store,user,env));}
 if(path==='invite-info'&&post)return reply(await store.inviteInfo(body.token));
 if(post&&body.actor!==user)throw new AppError('Your account changed. Unlock your own account before saving.',409,'STALE_CONTEXT');
 if(post&&body.house&&(await store.membership(user)).house!==body.house)throw new AppError('Your family changed. Reopen your own family.',409,'STALE_CONTEXT');
 if(path==='account-key'&&post)return reply(await connectAccount(store,user,env,body));
 if(path==='vault'&&post)return reply(await store.putVault(user,body.vault,body.revision));
 if(path==='house'&&post)return reply(await store.create(user,body));
 if(path==='changes'&&post)return reply(await store.patch(user,body));
 if(path==='invite'&&post)return reply(await store.invite(user,body));
 if(path==='join'&&post)return reply(await store.accept(user,body));
 if(path==='invitations'&&!post)return reply({invites:await store.invitations(user)});
 if(path==='revoke'&&post)return reply(await store.revoke(user,body.id));
 if(path==='member'&&post)return reply(await store.member(user,body.id,body.role,body.active));
 if(path==='rotate'&&post)return reply(await store.rotate(user,body,await managedMemberVaults(store,user,env,body)));
 if(path==='activity'&&!post)return reply({activity:await store.history(user,Number(url.searchParams.get('after')||0))});
 if(path==='receipt'&&post)return reply(await store.receipt(user,body.scope,body.payload||null));
 if(path==='delete-account'&&post){if(identity.provider==='supabase'&&!env.OURHOUSE_SUPABASE_SECRET_KEY)throw new AppError('Account deletion is not configured. Contact the publisher before adding personal data.',503,'AUTH_SETUP');const result=await store.deleteAccount(user,body.confirmation,identity.provider==='supabase'?identity.subject:null);try{await store.cleanup();}catch{result.receiptCleanupPending=true;}return reply(result);}
 if(path==='logout'&&post)return reply({signedOut:true});
 return reply({error:'Encrypted service not found'},404);
 }catch(e){return reply({error:e instanceof AppError?e.message:'OurHouse could not confirm the encrypted request. Your device keeps its draft.',code:e instanceof AppError?e.code:'SERVER'},e instanceof AppError?e.status:500);}}
