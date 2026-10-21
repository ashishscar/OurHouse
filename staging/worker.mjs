import {handleAPI,security} from '../lib/http.mjs';
import {RELEASE} from '../launch/release.mjs';
import {stagingBuild} from './build-meta.mjs';
const actors=new Set(['owner','member','viewer','foreign']);
export function stagingBucket(db){return {
 async get(key){const row=await db.prepare('SELECT data FROM staging_blobs WHERE key=?').bind(key).first();return row?{text:async()=>row.data,arrayBuffer:async()=>new TextEncoder().encode(row.data).buffer}:null;},
 async put(key,value){await db.prepare('INSERT INTO staging_blobs(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').bind(key,String(value)).run();},
 async delete(key){for(const item of Array.isArray(key)?key:[key])await db.prepare('DELETE FROM staging_blobs WHERE key=?').bind(item).run();},
};}
export function stagingWorker(){return {async fetch(request,env){
 if(env.OURHOUSE_STAGING!=='isolated')return new Response('Not found',{status:404});
 // A mistaken DB binding fails before identity creation or any write. This
 // marker is installed only in the separate staging database.
 try{const marker=await env.DB.prepare("SELECT value FROM staging_meta WHERE key='environment'").first();if(marker?.value!=='ourhouse-staging-v1')throw Error();}catch{return Response.json({error:'Staging isolation is not configured'},{status:503});}
 const url=new URL(request.url),requested=request.headers.get('x-ourhouse-qa-actor')||url.searchParams.get('qa')||'owner',actor=actors.has(requested)?requested:'owner';
 const requestedRun=request.headers.get('x-ourhouse-qa-run')||url.searchParams.get('qaRun')||'browser',run=/^(?:browser|qa[0-9a-f]{12})$/.test(requestedRun)?requestedRun:'browser';
 if(url.pathname==='/__qa/meta')return Response.json({staging:true,release:RELEASE,stagingBuild,identity:'synthetic-only',database:'ourhouse-staging',publicRoutes:false},{headers:security});
 if(url.pathname.startsWith('/api/')){
  const headers=new Headers(request.headers);for(const name of [...headers.keys()])if(name.toLowerCase().startsWith('oai-')||['authorization','x-ourhouse-auth','x-ourhouse-test'].includes(name.toLowerCase()))headers.delete(name);
  return handleAPI(new Request(request,{headers}),{...env,BUCKET:stagingBucket(env.DB)},{userId:'ourhouse-staging:'+run+':'+actor,email:actor+'@example.invalid',displayName:'QA '+actor});
 }
 if(url.pathname==='/'||url.pathname==='/app-shell.html'){
  const response=await env.ASSETS.fetch(new Request(url.origin+'/app-shell.html'));let html=await response.text();
  const shim='<script>window.OurHouseRuntime={staging:true};window.OurHouseAuth={enabled:true,subject:'+JSON.stringify('ourhouse-staging:'+run+':'+actor)+',generation:1,ready:Promise.resolve(),headers:async()=>({"x-ourhouse-qa-actor":'+JSON.stringify(actor)+',"x-ourhouse-qa-run":'+JSON.stringify(run)+'}),markup:()=>"<h1>Private staging</h1>",signOut:()=>location.assign("/")};</script>';
  html=html.replace(/<script\b[^>]*src="\/ourhouse-auth\.js[^" ]*"[^>]*><\/script>/,shim).replace('<title>','<title>Staging · ').replace('<body>','<body><aside style="position:fixed;top:0;left:0;right:0;z-index:200000;background:#126f68;color:white;text-align:center;font:11px system-ui;padding:3px">Private staging · synthetic families only</aside>');
  return new Response(html,{headers:{...security,'Content-Type':'text/html; charset=utf-8'}});
 }
 return env.ASSETS.fetch(request);
}};}
