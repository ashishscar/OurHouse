import {recordTechnicalSignal} from '../maintenance/agent.mjs';
import {dispatchPush} from '../notifications/push.mjs';
import {dispatchAuthCleanup} from '../launch/identity.mjs';
import {storageEnvironment} from '../lib/receipt-storage.mjs';

// Direct Cloudflare hosting has no trusted ChatGPT identity proxy. Never accept
// its identity headers from an Internet request, even if someone knows an ID.
export function standaloneWorker(application, jobs = [env=>dispatchPush(storageEnvironment(env)), env=>dispatchAuthCleanup(storageEnvironment(env))]) {
 return {
  async fetch(request, env, context) {
   const url = new URL(request.url);
   if (['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'].includes(url.pathname)) {
    return Response.redirect(url.origin + '/', 303);
   }
   if (url.searchParams.has('legacy')) {
    url.searchParams.delete('legacy');
    return Response.redirect(url.href, 303);
   }
   const headers = new Headers(request.headers);
   for (const name of [...headers.keys()]) if (name.toLowerCase().startsWith('oai-')) headers.delete(name);
   let runtime = env;
   try {if (url.pathname.startsWith('/api/') && url.pathname !== '/api/config') runtime = storageEnvironment(env);}
   catch {return Response.json({error: 'OurHouse storage is being configured', code: 'STORAGE_UNAVAILABLE'}, {status: 503, headers: {'Cache-Control': 'no-store'}});}
   return application.fetch(new Request(request, {headers}), runtime, context);
  },
  scheduled(_event, env, context) {
   // Scheduled retries do not depend on a browser or a request to the app.
   context.waitUntil(Promise.all(jobs.map((job,index) => Promise.resolve().then(() => job(env)).catch(async error=>{if(index<2)await recordTechnicalSignal(env,index===0?'NOTIFICATION':'SAVE_RETRY');throw error;}))));
  },
 };
}
