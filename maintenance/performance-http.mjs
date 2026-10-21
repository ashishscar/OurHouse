import {validateMetrics} from './performance.mjs';
import {CloudStore} from '../lib/cloud-store.mjs';
export async function performanceAPI(request,env,identity,headers){
 const reply=(body,status)=>Response.json(body,{status,headers});
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(!identity)return reply({error:'Sign in to OurHouse'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Open this request from OurHouse'},403);
 try{const reader=request.body?.getReader();let size=0,chunks=[];if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1600){await reader.cancel();return reply({error:'Technical counts only'},413);}chunks.push(value);}let rows;try{rows=validateMetrics(JSON.parse(Buffer.concat(chunks).toString()));}catch{return reply({error:'Technical counts only'},400);}
  if(!env.CARE_SERVICE)return reply({error:'Technical monitoring is temporarily unavailable'},503);
  await new CloudStore(env.DB,env.BUCKET).rate('performance:'+identity.userId,12);
  const response=await env.CARE_SERVICE.fetch(new Request('https://maintenance.internal/metrics',{method:'POST',body:JSON.stringify({metrics:rows})}));return reply(await response.json(),response.status);
 }catch(error){return reply({error:'Technical monitoring is temporarily unavailable'},error?.status===429?429:503);}
}
