/* Only the public app shell and static assets are cached. Never cache API responses. */
const CACHE='__CACHE__',ASSETS=__ASSETS__,HASHES=__HASHES__,OPTIONAL=__OPTIONAL__;
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(ASSETS.filter(path=>!OPTIONAL.includes(path)&&path!=='/app-shell.html'));
 // The .html asset redirects to /app-shell on Cloudflare. Cache the canonical
 // public document instead, including the server's browser security headers.
 const shell=await fetch(new URL('/',self.location.origin),{cache:'reload',credentials:'omit',redirect:'error'});
 if(!shell.ok||!shell.headers.get('content-type')?.includes('text/html'))throw Error('Public shell unavailable');
 await cache.put('/app-shell.html',shell);
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ourhouse-shell-')&&k!==CACHE).slice(0,-1).map(k=>caches.delete(k)))),self.clients.claim(),caches.open(CACHE).then(cache=>cache.addAll(OPTIONAL)).catch(()=>{})])));
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'&&url.pathname==='/user-guide'){event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));return;}
 if(request.mode==='navigate'){if(!['/','/app-shell.html'].includes(url.pathname))return;
  // This shell contains no account data. The active worker's complete version
  // opens without a network round trip; sign-in and household APIs stay live.
  // Installing a newer worker prepares its assets for the next opening.
  event.respondWith((async()=>{const cache=await caches.open(CACHE),shell=await cache.match('/app-shell.html');
   if(shell&&url.searchParams.get('test')!=='1'&&url.searchParams.get('legacy')!=='1')return new Response(shell.body,{status:shell.status,statusText:shell.statusText,headers:shell.headers});
   try{const response=await fetch(request);if(response.status>=500)throw Error('Service unavailable');return response;}catch(error){if(shell)return new Response(shell.body,{status:shell.status,statusText:shell.statusText,headers:shell.headers});throw error;}
  })());return;}
 if(ASSETS.includes(url.pathname+url.search))event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
self.addEventListener('push',event=>{event.waitUntil((async()=>{let data={};try{data=event.data?.json()||{};}catch{}const url=data.url==='/?test=1'?'/?test=1':'/';await self.registration.showNotification('OurHouse',{body:data.body==='Notifications are ready on this device.'?data.body:'Your family has an update. Open OurHouse to see it.',icon:'/icons/ourhouse-192.png',badge:'/icons/ourhouse-192.png',tag:data.tag==='ourhouse-test'?'ourhouse-test':'ourhouse-family-update',data:{url},renotify:false});})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const path=event.notification.data?.url==='/?test=1'?'/?test=1':'/',target=new URL(path,self.location.origin);const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){const u=new URL(client.url);if(u.origin===target.origin&&u.searchParams.get('test')===target.searchParams.get('test')){await client.focus();return;}}await self.clients.openWindow(target.href);})());});

self.addEventListener('message',event=>{if(event.data?.type!=='OURHOUSE_REPAIR_PUBLIC_CACHE'||!event.source?.url)return;let source;try{source=new URL(event.source.url);}catch{return;}if(source.origin!==self.location.origin||!['/','/app-shell.html'].includes(source.pathname))return;event.waitUntil((async()=>{let repaired=0,failed=0;const cache=await caches.open(CACHE);for(const [path,expected] of Object.entries(HASHES)){try{const url=ASSETS.find(asset=>asset.split('?')[0]===path);if(!url||url.startsWith('/api/'))continue;const response=await fetch(new URL(url,self.location.origin),{cache:'reload',credentials:'omit'});if(!response.ok)throw Error();const bytes=await response.clone().arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes),actual=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');if(actual!==expected)throw Error();await cache.put(url,response);repaired++;}catch{failed++;}}event.ports?.[0]?.postMessage({type:'OURHOUSE_CACHE_REPAIRED',repaired,failed});})());});
