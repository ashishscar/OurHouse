import {AuthClient} from '@supabase/supabase-js';
import {authStorage,googleAuthorization} from './auth-safety.mjs';
const params=new URLSearchParams(location.search),excluded=params.get('test')==='1'||params.get('legacy')==='1';
let config={enabled:false},client=null,subject=null,generation=0,initialError='';
function setSubject(next){if(next===subject)return;const previous=subject;subject=next;generation++;if(previous){window.RoomioVault?.lock();location.reload();}}
function keepInvitation(){try{const hash=new URLSearchParams(location.hash.slice(1));if(hash.get('join')&&hash.get('key')){sessionStorage.setItem('roomio.encrypted-invite',JSON.stringify({token:hash.get('join'),secret:hash.get('key')}));sessionStorage.setItem('roomio.pending-invite',hash.get('join'));}}catch{throw Error('This browser could not keep your invitation. Allow browser storage and try again.');}}
async function initialize(){
 if(excluded)return;
 try{const response=await (window.OurHouseConfigRequest||fetch('/api/config',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}));if(!response?.ok)throw Error();config=(await response.json()).auth;try{localStorage.setItem('ourhouse.auth.config',JSON.stringify(config));}catch{}}
 catch{try{config=JSON.parse(localStorage.getItem('ourhouse.auth.config')||'{}');}catch{}}
 if(!config?.enabled)return;
 try{
  keepInvitation();
  try{subject=JSON.parse(localStorage.getItem('ourhouse.consumer.auth')||'null')?.user?.id||null;}catch{}
  client={auth:new AuthClient({url:config.url.replace(/\/$/,'')+'/auth/v1',headers:{apikey:config.key,Authorization:'Bearer '+config.key},persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'ourhouse.consumer.auth',storage:authStorage(localStorage),hasCustomAuthorizationHeader:false})};
  client.auth.onAuthStateChange((_event,session)=>setSubject(session?.user?.id||null));
  if(navigator.onLine!==false){const {error}=await client.auth.initialize();if(error)initialError='The sign-in link could not be verified. Start sign-in again in this browser.';const {data,error:sessionError}=await client.auth.getSession();if(sessionError)throw sessionError;setSubject(data.session?.user.id||null);if(params.has('code')&&!data.session)initialError='This sign-in link is expired or belongs to another browser. Start sign-in here again.';}
 }catch{initialError='Sign-in is unavailable in this browser. Check your connection and browser storage, then try again.';}
 finally{
  // Do not keep one-time auth credentials in the address bar or a later copied link.
  if(params.has('code')||params.has('error')||params.has('error_description'))history.replaceState(null,'',location.pathname+location.hash);
 }
}
const ready=initialize();
async function headers(){
 await ready;if(!client)return {};
 const before=subject,epoch=generation,{data,error}=await client.auth.getSession();
 if(error)throw Error('Sign-in service is temporarily unavailable');
 if(epoch!==generation||before!==subject||subject!==(data.session?.user.id||null)){const e=Error('Your account changed. Reopen OurHouse.');e.status=409;e.code='AUTH_CHANGED';throw e;}
 return {'x-ourhouse-auth':'supabase',...(data.session?{authorization:'Bearer '+data.session.access_token}:{})};
}
const status=text=>{const el=document.getElementById('ourhouseAuthStatus');if(el)el.textContent=text;};
function markup(){return '<h1>Welcome to OurHouse</h1><p>Your own account. Your family’s private space.</p>'+(config.providers?.google?'<button class="btn primary block" id="ourhouseGoogle" onclick="OurHouseAuth.google()">Continue with Google</button>':'')+(config.providers?.email!==false?'<form onsubmit="event.preventDefault();OurHouseAuth.send()"><label class="family-field" for="ourhouseAuthName">Your name<input id="ourhouseAuthName" maxlength="60" autocomplete="name" required></label><label class="family-field" for="ourhouseAuthEmail">Email<input id="ourhouseAuthEmail" type="email" autocomplete="email" autocapitalize="off" required></label><button class="btn grey block" id="ourhouseSendCode" type="submit">Send sign-in code</button></form><form id="ourhouseVerify" hidden onsubmit="event.preventDefault();OurHouseAuth.verify()"><label class="family-field" for="ourhouseAuthCode">Email sign-in code<input id="ourhouseAuthCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required></label><button class="btn primary block" type="submit">Verify and continue</button></form>':'')+'<p id="ourhouseAuthStatus" role="status" aria-live="polite">'+initialError+'</p><p class="finehint">Sign in with the same Google account on any device. Your household syncs automatically.</p>';}
function pendingMarkup(){if(config.standalone)return '<h1>Welcome to OurHouse</h1><p>Your own account. Your family’s private space.</p><p id="ourhouseAuthStatus" role="status">Google sign-in is being connected to this new address. Please refresh shortly.</p>';return '<h1>Your family, together.</h1><p>A private home for meals, recipes, shopping, chores and shared expenses.</p><p class="finehint">Public signup is being prepared. Already testing OurHouse?</p><a class="btn primary block" href="/?test=1&amp;v=12">Open early access</a><p class="finehint">Use the test code shared with your invitation. No ChatGPT account is needed.</p>';}
async function google(){
 await ready;if(!client||!config.providers?.google)return status('Google sign-in is not configured yet.');
 const button=document.getElementById('ourhouseGoogle');if(button)button.disabled=true;
 try{keepInvitation();const url=await googleAuthorization(client,location.origin,config.url);window.RoomioVault?.lock();location.assign(url);}catch(e){status(e.message);if(button)button.disabled=false;}
}
async function send(){await ready;if(!client||config.providers?.email===false)return status('Email sign-in is not configured yet.');const button=document.getElementById('ourhouseSendCode');button.disabled=true;try{const email=document.getElementById('ourhouseAuthEmail').value.trim(),name=document.getElementById('ourhouseAuthName').value.trim();if(!email||!name)throw Error();const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+'/',data:{display_name:name},shouldCreateUser:true}});if(error)throw error;document.getElementById('ourhouseVerify').hidden=false;status('Check your email for the sign-in code or link.');}catch{status('Could not send the sign-in email. Check your details and try again shortly.');}finally{button.disabled=false;}}
async function verify(){await ready;if(!client||config.providers?.email===false)return;const button=document.querySelector('#ourhouseVerify button');button.disabled=true;try{const {error}=await client.auth.verifyOtp({email:document.getElementById('ourhouseAuthEmail').value.trim(),token:document.getElementById('ourhouseAuthCode').value.trim(),type:'email'});if(error)throw error;location.reload();}catch{status('This code could not be verified. Try again or request a new code.');button.disabled=false;}}
async function signOut(){await ready;try{if(subject){localStorage.removeItem('ourhouse.consumer.encrypted-cache:'+config.url+':'+subject);const old=JSON.parse(localStorage.getItem('ourhouse.consumer.encrypted-cache')||'null');if(old?.authSubject===subject||old?.authSubject===config.url+':'+subject)localStorage.removeItem('ourhouse.consumer.encrypted-cache');}}catch{}window.RoomioVault?.lock();if(client){const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;}location.assign('/');}
window.OurHouseAuth={ready,headers,markup,pendingMarkup,google,send,verify,signOut,get enabled(){return !!client;},get subject(){return subject?config.url+':'+subject:null;},get generation(){return generation;}};
