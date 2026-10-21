import {RELEASE} from '../launch/release.mjs';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=path.join(here,'ui');
mkdirSync(path.join(here,'public/icons'),{recursive:true});
await import('../manual/build.mjs');
for(const f of readdirSync(source))if(/\.(css|js|webmanifest)$/.test(f)&&f!=='family.js')copyFileSync(path.join(source,f),path.join(here,'public',f));
let adapter=readFileSync(path.join(source,'family.js'),'utf8');
const begin=adapter.indexOf('  else html+=`<h1>');
const end=adapter.indexOf('el.innerHTML=html;',begin);
if(begin<0||end<0)throw Error('Onboarding template changed');
adapter=adapter.slice(0,begin)+`  else if(window.OurHouseTest?.active)html+=OurHouseTest.markup();
  else if(window.OurHouseAuth?.enabled)html+=OurHouseAuth.markup();
  else if(window.OurHouseAuth&&new URLSearchParams(location.search).get('legacy')!=='1')html+=OurHouseAuth.pendingMarkup();
  else html+='<h1>Welcome home.</h1><p>One private space for your family’s meals, shopping, chores and shared expenses.</p><a class="btn primary block" href="/signin-with-chatgpt?return_to=%2F" target="_top">Continue with ChatGPT</a><p class="finehint">Use your own ChatGPT account. OurHouse never receives your password. Your sign-in provider handles account verification and recovery.</p>';
  html+='<p id="familyGateError" role="alert">'+esc(error)+'</p><div class="family-preview-label">Early access · Your household is private to invited family members.<br><a href="/privacy">Privacy & data</a> · <a href="/support">Help & support</a></div></div>';`+adapter.slice(end);
const bstart=adapter.indexOf(' async function boot()'),bend=adapter.indexOf(' async function demo()',bstart);
adapter=adapter.slice(0,bstart)+` async function boot(){try{appearance(localStorage.getItem('roomio.appearance')||'system',false);}catch{}setupDOM();mode='local';DB=freshDB();DB.settings.sattvik=false;firstSyncDone=false;authOk=false;gate('restoring');$('splash')?.remove();
  try{inviteToken=new URLSearchParams(location.hash.slice(1)).get('join')||sessionStorage.getItem('roomio.pending-invite')||'';if(inviteToken)sessionStorage.setItem('roomio.pending-invite',inviteToken);}catch{}
  try{if(window.OurHouseAuth)await window.OurHouseAuth.ready;const result=await api('session');if(inviteToken){try{inviteInfo=await api('invite-info',{token:inviteToken});}catch(e){if(e.status!==401){inviteToken='';inviteInfo=null;sessionStorage.removeItem('roomio.pending-invite');history.replaceState(null,'',location.pathname);showToast(e.message,true);}}}apply(result,true);window.OurHouseMetrics?.startup();void flush();}catch(e){gate(e.status===401?'signin':'restore-error',e.status===401?'':e.message);}
  poller?.stop?.();poller=window.OurHouseSync?.start(poll);window.addEventListener('online',()=>{void flush();});
 }
`+adapter.slice(bend);
adapter=adapter.replace("inviteToken='';inviteInfo=null;history.replaceState", "inviteToken='';inviteInfo=null;try{sessionStorage.removeItem('roomio.pending-invite');}catch{}history.replaceState");
adapter=adapter.replace("gate('signin');}\n async function newInvite", "window.OurHouseAuth?.enabled?OurHouseAuth.signOut():window.OurHouseTest?OurHouseTest.signOut():location.assign('/signout-with-chatgpt?return_to=%2F');}\n async function newInvite");
adapter=adapter.replace('Private web prototype','Private household');
adapter=adapter.replace('<button class="family-text" onclick="RoomioFamily.logout()">Sign out</button>', '<button class="family-text" onclick="RoomioFamily.deleteAccount()">Delete my OurHouse account</button><button class="family-text" onclick="RoomioFamily.logout()">Sign out</button>');
adapter=adapter.replace('This separate web prototype uses local sync, on-device commands and optional downloaded OCR. Public invitations, background push, cloud AI and native installation are future connected work.','Your family data syncs securely across signed-in devices. Receipt scanning runs on this device after downloading scanner resources. Household AI chat and Siri are not connected. AI app care uses technical checks only. Background family updates are optional in Settings. Scheduled reminders are still in development.');
adapter=adapter.replace('This local web preview uses a separate database. Cloud AI, background push, Siri and public phone invitations will need a separate connected release. No paid plan is enabled.','OurHouse is an early access web app with private family invitations. Household AI chat and Siri are not connected. AI app care uses technical checks only. Background family updates are optional in Settings. Scheduled reminders are still in development.');
adapter=adapter.replace('<button class="btn red block" onclick="RoomioFamily.logout()">Sign out</button>`;', '<p class="finehint"><a href="/privacy">Privacy, storage limits & account recovery</a></p><button class="btn grey block" onclick="RoomioFamily.deleteAccount()">Delete my OurHouse account</button><button class="btn red block" onclick="RoomioFamily.logout()">Sign out</button>`;');
const deleteFn=` async function deleteAccount(){if(busy||queue.length){showToast('Sync or review all unsent changes before deleting your account.',true);return;}const owner=session?.house?.owner===session?.user.id;const confirmation=prompt(owner?'This permanently deletes your OurHouse account, the entire household and all family records and receipts. Other members lose this household. Export a backup first. Type the household name to confirm:':'This deletes your OurHouse account and family membership. Shared household records and their financial history remain. Type DELETE to confirm:');if(confirmation===null)return;try{await api('delete-account',{confirmation});try{await personalPhotoStore('delete',personalPhotoScope());}catch{}clearFamilyViews();window.OurHouseAuth?.enabled?OurHouseAuth.signOut():window.OurHouseTest?OurHouseTest.signOut():location.assign('/signout-with-chatgpt?return_to=%2F');}catch(e){showToast(e.message,true);}}\n`;
adapter=adapter.replace(' return {boot,api,gate,',deleteFn+' return {deleteAccount,boot,api,gate,');
adapter=adapter.replaceAll('Prototype-only family adapter','OurHouse household adapter').replaceAll('In this prototype I can','In OurHouse I can');
// Use the encrypted transport and encrypt each durable outbox record synchronously.
const apiStart=adapter.indexOf(' async function api('),apiEnd=adapter.indexOf(' function queueKey()',apiStart);
adapter=adapter.slice(0,apiStart)+" async function api(path,body){if(!window.RoomioVault)throw Error('Encryption could not load. Reload the app before entering family data.');return RoomioVault.api(path,body); }\n"+adapter.slice(apiEnd);
adapter=adapter.replaceAll('roomio.family.queue:','roomio.e2ee.queue:');
adapter=adapter.replace('localStorage.setItem(prefix+op.id,JSON.stringify(op))','localStorage.setItem(prefix+op.id,RoomioVault.sealLocal(op,prefix+op.id))');
adapter=adapter.replace("legacy=JSON.parse(localStorage.getItem(queueKey())||'[]')","legacy=[]");
adapter=adapter.replace('JSON.parse(localStorage.getItem(k))','RoomioVault.openLocal(localStorage.getItem(k),k)');
adapter=adapter.replace("connection='Family synced';$('familyGate')","connection=result.offline?'Offline · encrypted device copy':'Family synced';$('familyGate')");
const lockFn="function lockView(){clearFamilyViews();session=null;observed=null;queue=[];DB=freshDB();authOk=false;firstSyncDone=false;myUid=null;siteId=null;myRole=null;document.body.classList.add('family-gated');if($('familyGate')){$('familyGate').hidden=false;$('familyGate').replaceChildren();}}\n";
adapter=adapter.replace('function apply(result,loadQueue=false){','function apply(result,loadQueue=false){window.RoomioVault?.assertView?.(result);');
adapter=adapter.replace('function clearFamilyViews(){', 'function clearFamilyViews(){window.RoomioRecipes?.forget();');
adapter=adapter.replace(' return {deleteAccount,boot',lockFn+' return {lockView,deleteAccount,boot');
adapter=adapter.replace('})();','})();\nwindow.RoomioFamily=RoomioFamily;');
adapter=adapter.replace("RoomioFamily.member('${id}','editor',true)","RoomioVault.refreshAccess('${id}').catch(e=>showToast(e.message,true))");
adapter=adapter.replace('Download household backup','Export readable family backup');
adapter=adapter.replace('exportData=()=>{','exportData=()=>{if(!confirm(\'This exports a readable copy of your family data. Keep the file private; anyone with it can read it. Continue?\'))return;');
adapter=adapter.replaceAll("history.replaceState(null,'',location.pathname)","history.replaceState(null,'',location.pathname+location.search)");
writeFileSync(path.join(here,'public/family.js'),adapter);
let html=readFileSync(path.join(source,'index.html'),'utf8').replace('<script>','<script src="/ourhouse-auth.js"></script><script src="/ourhouse-app.js"></script><script src="/ourhouse-sync.js"></script><script src="/ourhouse-metrics.js"></script><script src="/ourhouse-cover.js"></script><script src="/user-guide.js"></script><script src="/ourhouse-maintenance.js"></script><script src="/ourhouse-receipts.js"></script><script src="/ourhouse-test.js"></script><script src="/roomio-vault.js"></script><script src="/roomio-recipes.js"></script>\n<script>').replace('/* ROOMIO_FAMILY_ADAPTER */',()=>adapter).replace('RoomioFamily.boot();',()=> 'RoomioFamily.boot();\n'+readFileSync(path.join(source,'redesign.js'),'utf8')).replace('</head>','<link rel="stylesheet" href="/redesign.css"></head>');
html=html.replace(/let VAPID_PUBLIC_KEY='[^']*';/,"let VAPID_PUBLIC_KEY='';").replace(/const DEFAULT_SITE_LIST=\[[\s\S]*?\];/,'const DEFAULT_SITE_LIST=[];').replaceAll('harisumiran-personal-media','roomio-personal-media').replaceAll('/icons/harisumiran-house-180-v3.png','/icons/ourhouse-180.png').replaceAll('/icons/harisumiran-house-192-v3.png','/icons/ourhouse-192.png');
writeFileSync(path.join(here,'lib/shell.ts'),'// Generated from the isolated prototype by scripts/prepare-ui.mjs.\nexport default '+JSON.stringify(html)+';\n');
const manifest=JSON.parse(readFileSync(path.join(source,'manifest.webmanifest'),'utf8'));manifest.icons=[{src:'/icons/ourhouse-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/ourhouse-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}];writeFileSync(path.join(here,'public/manifest.webmanifest'),JSON.stringify(manifest));
console.log('Prepared OurHouse cloud UI with managed sign-in and account deletion.');

const {build}=await import('esbuild');
await build({entryPoints:[path.join(here,'crypto/browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/roomio-vault.js'),minify:true});

await build({entryPoints:[path.join(here,'recipes/browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/roomio-recipes.js'),minify:true});

await build({entryPoints:[path.join(here,'test-access/browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/ourhouse-test.js'),minify:true});

await build({entryPoints:[path.join(here,'launch/auth-browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/ourhouse-auth.js'),minify:true});
await build({entryPoints:[path.join(here,'launch/app-browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/ourhouse-app.js'),minify:true});
await build({entryPoints:[path.join(here,'photos/browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/ourhouse-cover.js'),minify:true});
await build({entryPoints:[path.join(here,'receipts/browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/ourhouse-receipts.js'),minify:true});
await build({entryPoints:[path.join(here,'maintenance/browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/ourhouse-maintenance.js'),minify:true});
await build({entryPoints:[path.join(here,'launch/sync-browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/ourhouse-sync.js'),minify:true});
await build({entryPoints:[path.join(here,'launch/metrics-browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/ourhouse-metrics.js'),minify:true});
const {splitShell}=await import('../build/split-shell.mjs');
await build({entryPoints:[path.join(here,'launch/features-browser.mjs')],bundle:true,format:'iife',platform:'browser',target:['es2022'],outfile:path.join(here,'public/ourhouse-features.js'),minify:true});
const split=await splitShell(html,path.join(here,'public'));html=split.html;
const {createHash}=await import('node:crypto');
// Version styles as well as scripts so installed apps refresh photo layouts.
html=html.replace(/href="(\/[^"?]+\.css)"/g,(_,url)=>'href="'+url+'?v='+createHash('sha256').update(readFileSync(path.join(here,'public',url))).digest('hex').slice(0,12)+'"');
html=html.replace(/src="(\/(?:ourhouse-metrics|ourhouse-sync|ourhouse-features|ourhouse-auth|ourhouse-app|ourhouse-cover|ourhouse-maintenance|ourhouse-receipts|user-guide|ourhouse-test|roomio-vault|roomio-recipes)\.js)"/g,(_,url)=>'src="'+url+'?v='+createHash('sha256').update(readFileSync(path.join(here,'public',url))).digest('hex').slice(0,12)+'"');
// Start config and critical script downloads before parsing the app body.
const criticalScripts=[...html.matchAll(/src="(\/(?:ourhouse-auth\.js[^" ]*|assets\/app-core-[^"]+))"/g)].map(match=>match[1]);
html=html.replace('<head>','<head>\n<script id="ourhouse-bootstrap">'+readFileSync(path.join(here,'launch/bootstrap.js'),'utf8')+'</script>\n'+criticalScripts.map(url=>'<link rel="preload" as="script" href="'+url+'" fetchpriority="high">').join('\n'));
writeFileSync(path.join(here,'lib/shell.ts'),'// Generated public app shell; never contains household data.\nexport default '+JSON.stringify(html)+';\n');
writeFileSync(path.join(here,'public/app-shell.html'),html);
const resources=[...html.matchAll(/(?:src|href)="((?:\/|\.\/)[^"#]+)"/g)].map(m=>m[1].replace(/^\.\//,'/')).filter(url=>/\.(?:js|css|png)(?:\?|$)/.test(url)&&!url.includes('harisumiran')).filter(url=>{try{return !!readFileSync(path.join(here,'public',url.split('?')[0]));}catch{return false;}});
resources.push(...Object.values(split.features));
resources.push('/user-guide','/user-guide?embedded=1','/app-shell.html','/icons/ourhouse-192.png','/icons/ourhouse-512.png');
const revision=createHash('sha256').update(html).update(readFileSync(path.join(here,'manual/user-guide.html'))).digest('hex').slice(0,12);
writeFileSync(path.join(here,'public/sw.js'),readFileSync(path.join(here,'launch/sw-template.js'),'utf8').replace('__CACHE__','ourhouse-shell-'+revision).replace('__ASSETS__',JSON.stringify([...new Set(resources)])).replace('__OPTIONAL__',JSON.stringify(Object.values(split.features))).replace('__HASHES__',JSON.stringify(Object.fromEntries(resources.filter(url=>/\.js(?:\?|$)/.test(url)).map(url=>[url.split('?')[0],createHash('sha256').update(readFileSync(path.join(here,'public',url.split('?')[0]))).digest('hex')])))));

const watched=[['RECIPE_ASSET','/roomio-recipes.js'],['RECEIPT_ASSET','/ourhouse-receipts.js'],['INTERFACE_ASSET','/family.js']].map(([code,url])=>({code,path:url,hash:createHash('sha256').update(readFileSync(path.join(here,'public',url))).digest('hex')}));
writeFileSync(path.join(here,'maintenance/manifest.mjs'),'// Public build fingerprints; no household data.\nexport const release='+RELEASE+';\nexport const assets='+JSON.stringify(watched)+';\n');
