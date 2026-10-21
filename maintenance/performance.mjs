export const METRICS=['STARTUP','SYNC','FEATURE','RECIPE_SEARCH','RECEIPT_SCAN','SAVE'];
export const BUCKETS=['FAST','OK','SLOW','FAILED'];
export function timingBucket(metric,duration,failed=false){
 if(!METRICS.includes(metric))return null;if(failed)return 'FAILED';if(!Number.isFinite(duration)||duration<0)return null;
 const [fast,ok]={STARTUP:[1000,3000],SYNC:[250,1500],FEATURE:[100,1000],RECIPE_SEARCH:[1000,3000],RECEIPT_SCAN:[5000,20000],SAVE:[500,2000]}[metric];return duration<=fast?'FAST':duration<=ok?'OK':'SLOW';
}
export function validateMetrics(body){
 if(!body||typeof body!=='object'||Object.keys(body).length!==1||!Array.isArray(body.metrics)||body.metrics.length<1||body.metrics.length>12)throw Error('Technical counts only');
 const keys=new Set();return body.metrics.map(row=>{if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!=='bucket,count,metric'||!METRICS.includes(row.metric)||!BUCKETS.includes(row.bucket)||!Number.isInteger(row.count)||row.count<1||row.count>20)throw Error('Technical counts only');const key=row.metric+':'+row.bucket;if(keys.has(key))throw Error('Duplicate metric');keys.add(key);return {metric:row.metric,bucket:row.bucket,count:row.count};});
}
export function performanceAlerts(performance){return Object.entries(performance?.counts||{}).filter(([,counts])=>{const total=Object.values(counts).reduce((a,n)=>a+n,0);return total>=5&&((counts.SLOW||0)+(counts.FAILED||0))/total>=.2;}).map(([metric])=>metric).sort();}
