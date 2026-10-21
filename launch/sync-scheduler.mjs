export function syncDelay({idleMs=0,failures=0,unchanged=0}={}){
 if(failures)return Math.min(120000,20000*2**Math.min(failures,3));
 return idleMs>=120000&&unchanged>=3?60000:20000;
}
export function startSync(poll,{target=window,doc=document,now=()=>Date.now(),set=setTimeout,clear=clearTimeout}={}){
 let timer=null,stopped=false,running=false,lastActivity=now(),failures=0,unchanged=0;
 function schedule(){if(stopped||doc.hidden)return;clear(timer);timer=set(run,syncDelay({idleMs:now()-lastActivity,failures,unchanged}));}
 async function run(){if(stopped||doc.hidden||running)return;clear(timer);running=true;try{const result=await poll();if(result?.failed)failures++;else if(!result?.skipped){failures=0;unchanged=result?.changed?0:unchanged+1;}}catch{failures++;}finally{running=false;schedule();}}
 function active(){lastActivity=now();if(unchanged>=3){unchanged=0;clear(timer);schedule();}}
 function visibility(){clear(timer);if(!doc.hidden)void run();}
 function online(){failures=0;void run();}
 target.addEventListener('pointerdown',active,{passive:true});target.addEventListener('keydown',active);target.addEventListener('online',online);doc.addEventListener('visibilitychange',visibility);schedule();
 return {stop(){stopped=true;clear(timer);target.removeEventListener('pointerdown',active);target.removeEventListener('keydown',active);target.removeEventListener('online',online);doc.removeEventListener('visibilitychange',visibility);}};
}
