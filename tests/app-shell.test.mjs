import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {intent,commitSwipe,rubber} from '../launch/motion.mjs';
test('gesture intent preserves scrolling and soft swipe thresholds respond to distance and velocity',()=>{assert.equal(intent(2,5),'pending');assert.equal(intent(16,100),'vertical');assert.equal(intent(-60,3),'horizontal');assert.equal(commitSwipe(10,2,390),false);assert.equal(commitSwipe(36,.9,390),true);assert.equal(commitSwipe(36,-.9,390),false);assert.equal(commitSwipe(90,0,390),true);assert.ok(Math.abs(rubber(2000,38))<=38);assert.equal(rubber(-100),-rubber(100));});
function worker({cached=true,network=async()=>new Response('network',{headers:{'content-type':'text/html','Content-Security-Policy':"default-src 'self'"}})}={}){
 const handlers={},notifications=[],cacheNames=['ourhouse-shell-old','ourhouse-shell-previous','other-app-cache'],deleted=[],opened=[],requests=[],puts=[];let offline=false;
 const self={location:{origin:'https://ourhouse.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},registration:{showNotification:async(title,options)=>notifications.push({title,...options})},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 const context={self,URL,Response,fetch:async (request,options)=>{requests.push({url:request.url||request.href||String(request),options});if(offline)throw Error('offline');return network(request);},caches:{open:async()=>({addAll:async assets=>assert.ok(assets.every(a=>!a.startsWith('/api/'))),put:async(key,response)=>puts.push({key,response}),match:async key=>{if(!cached)return;const response=new Response(key==='/app-shell.html'?'public offline shell':'cached static',{headers:{'Content-Security-Policy':"default-src 'self'"}});Object.defineProperty(response,'redirected',{value:true});return response;}}),keys:async()=>cacheNames,delete:async name=>deleted.push(name),match:async()=>new Response('cached static')}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);return {handlers,notifications,deleted,opened,requests,puts,offline:()=>offline=true};
}
test('service worker caches only public assets, never API data, and preserves unrelated caches',async()=>{const w=worker();let waiting;w.handlers.install({waitUntil:p=>waiting=p});await waiting;w.handlers.activate({waitUntil:p=>waiting=p});await waiting;assert.deepEqual(w.deleted,['ourhouse-shell-old']);for(const request of [{method:'GET',url:'https://ourhouse.test/api/secure/session',mode:'navigate'},{method:'POST',url:'https://ourhouse.test/',mode:'navigate'},{method:'GET',url:'https://evil.test/',mode:'navigate'}])w.handlers.fetch({request,respondWith:()=>assert.fail('Private or foreign data must not be intercepted')});w.offline();let response;w.handlers.fetch({request:{method:'GET',url:'https://ourhouse.test/',mode:'navigate'},respondWith:p=>response=p});assert.equal(await (await response).text(),'public offline shell');});
test('push UI cannot display private payload text or navigate outside OurHouse',async()=>{const w=worker();let pending;w.handlers.push({data:{json:()=>({title:'Private family',body:'Private expense amount',url:'https://evil.test/',tag:'private'})},waitUntil:p=>pending=p});await pending;assert.equal(w.notifications[0].title,'OurHouse');assert.equal(w.notifications[0].body,'Your family has an update. Open OurHouse to see it.');assert.equal(w.notifications[0].data.url,'/');w.handlers.notificationclick({notification:{data:{url:'https://evil.test/'},close(){}},waitUntil:p=>pending=p});await pending;assert.deepEqual(w.opened,['https://ourhouse.test/']);});

test('offline shell precaches its relative financial helpers as well as versioned app scripts',()=>{const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');for(const asset of ['expense-ledger.js','expense-input.js','receipt-schema.js','expense-cache.js','expense-receipts.js','ourhouse-receipts.js'])assert.ok(sw.includes('/'+asset),asset+' must be cached with the public shell');});

test('automatic cache repair replaces only fingerprint-verified public scripts and never touches private caches',async()=>{
 const handlers={},puts=[],requests=[];let waiting;
 const self={location:{origin:'https://ourhouse.test'},addEventListener:(name,fn)=>handlers[name]=fn};
 const {webcrypto}=await import('node:crypto');
 const context={self,URL,crypto:webcrypto,caches:{open:async name=>({put:async(path)=>puts.push({name,path})})},fetch:async target=>{const url=new URL(target);requests.push(url.href);const file=url.pathname.slice(1);return new Response(file==='family.js'?'corrupt download':readFileSync(new URL('../public/'+file,import.meta.url)));}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 handlers.message({data:{type:'OURHOUSE_REPAIR_PUBLIC_CACHE'},source:{url:'https://evil.test/'},waitUntil:()=>assert.fail()});
 handlers.message({data:{type:'OURHOUSE_REPAIR_PUBLIC_CACHE'},source:{url:'https://ourhouse.test/'},waitUntil:p=>waiting=p});await waiting;
 assert.ok(puts.length>0);assert.ok(puts.every(p=>p.name.startsWith('ourhouse-shell-')&&!p.path.startsWith('/api/')));assert.ok(!puts.some(p=>p.path==='/family.js'));assert.ok(requests.every(url=>url.startsWith('https://ourhouse.test/')&&!url.includes('/api/')));
});

test('repeat openings use the active public shell without waiting for a slow network; missing shells fall back to network',async()=>{
 const warm=worker({network:()=>new Promise(()=>{})});let response;
 warm.handlers.fetch({request:{method:'GET',url:'https://ourhouse.test/?code=callback-for-this-browser',mode:'navigate'},respondWith:p=>response=p});
 const opened=await response;assert.equal(opened.redirected,false,'cached redirect metadata must never reach navigation');assert.equal(opened.url,'');assert.equal(opened.headers.get('Content-Security-Policy'),"default-src 'self'");assert.equal(await opened.text(),'public offline shell');assert.equal(warm.requests.length,0);
 const cold=worker({cached:false});cold.handlers.fetch({request:{method:'GET',url:'https://ourhouse.test/',mode:'navigate'},respondWith:p=>response=p});assert.equal(await (await response).text(),'network');assert.equal(cold.requests.length,1);
 const testing=worker();testing.handlers.fetch({request:{method:'GET',url:'https://ourhouse.test/?test=1',mode:'navigate'},respondWith:p=>response=p});assert.equal(await (await response).text(),'network');
});

test('shell installation fetches the canonical public document without credentials and preserves its security headers',async()=>{
 const w=worker();let ready;w.handlers.install({waitUntil:p=>ready=p});await ready;
 assert.equal(w.requests.length,1);assert.equal(w.requests[0].url,'https://ourhouse.test/');assert.equal(w.requests[0].options.credentials,'omit');assert.equal(w.requests[0].options.redirect,'error');
 assert.equal(w.puts[0].key,'/app-shell.html');assert.equal(w.puts[0].response.headers.get('Content-Security-Policy'),"default-src 'self'");
});
