import {timingBucket} from '../maintenance/performance.mjs';
let sharing=true,timer=null,sending=false,lastSend=0,subject=null,startupSent=false;const counts=new Map();
try{sharing=localStorage.getItem('ourhouse.technical-counts')!=='off';}catch{sharing=false;}
function enabled(){return sharing&&!window.OurHouseRuntime?.staging&&!new URLSearchParams(location.search).has('test');}
function clear(){counts.clear();clearTimeout(timer);timer=null;}
function setSharing(value){sharing=!!value;if(!sharing)clear();try{localStorage.setItem('ourhouse.technical-counts',sharing?'on':'off');}catch{sharing=false;clear();window.showToast?.('This browser could not remember the preference. Technical reporting stays off.',true);}}
function measure(metric,duration,failed=false){
 if(!enabled())return;const bucket=timingBucket(metric,duration,failed);if(!bucket)return;
 const current=window.OurHouseAuth?.subject||null;if(subject!==current){clear();subject=current;}
 const key=metric+':'+bucket;counts.set(key,Math.min(20,(counts.get(key)||0)+1));if(!timer)timer=setTimeout(flush,Math.max(5000,60000-(Date.now()-lastSend)));
}
async function flush(){
 clearTimeout(timer);timer=null;if(document.hidden)return false;if(!enabled()){clear();return false;}if(sending||!counts.size)return false;
 const current=window.OurHouseAuth?.subject;if(!current||current!==subject){clear();return false;}sending=true;lastSend=Date.now();
 const metrics=[...counts].slice(0,12).map(([key,count])=>{const [metric,bucket]=key.split(':');return {metric,bucket,count};});
 try{const headers=await window.OurHouseAuth.headers();if(current!==window.OurHouseAuth.subject||!enabled())return false;
  const response=await fetch('/api/performance',{method:'POST',credentials:'same-origin',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({metrics}),signal:AbortSignal.timeout(10000)});if(!response.ok)return false;
  for(const row of metrics){const key=row.metric+':'+row.bucket,left=(counts.get(key)||0)-row.count;if(left>0)counts.set(key,left);else counts.delete(key);}return true;
 }catch{return false;}finally{sending=false;if(counts.size&&enabled()&&!timer)timer=setTimeout(flush,60000);}
}
function startup(){if(startupSent)return;startupSent=true;measure('STARTUP',performance.now());}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&counts.size&&enabled()&&!timer)timer=setTimeout(flush,5000);});
window.OurHouseMetrics={enabled,setSharing,measure,startup,flush};
