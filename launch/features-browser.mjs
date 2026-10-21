const loading=new Map();let intent=0;
function context(){const session=window.RoomioFamily?.getSession();return JSON.stringify([window.OurHouseAuth?.subject,window.OurHouseAuth?.generation,session?.user.id,session?.house?.id]);}
function paths(){try{return JSON.parse(document.getElementById('ourhouse-feature-map')?.textContent||'{}');}catch{return {};}}
function load(feature){
 if(loading.has(feature))return loading.get(feature);
 const path=paths()[feature];if(typeof path!=='string'||!/^\/assets\/(?:expenses|water)-[a-f0-9]{16}\.js$/.test(path))return Promise.reject(Error('This tool could not load. Reopen OurHouse when connected.'));
 const start=performance.now();
 const pending=new Promise((resolve,reject)=>{const script=document.createElement('script');const timer=setTimeout(()=>{script.remove();reject(Error('This tool is taking too long to download. Your draft is kept. Try again.'));},15000);script.src=path;script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('This tool could not download. Connect and try again. Your saved data is kept.'));};document.head.append(script);});
 pending.then(()=>window.OurHouseMetrics?.measure('FEATURE',performance.now()-start),()=>window.OurHouseMetrics?.measure('FEATURE',performance.now()-start,true));
 loading.set(feature,pending);pending.catch(()=>loading.delete(feature));return pending;
}
async function run(feature,name,args){const account=context(),ticket=intent;try{await load(feature);if(account!==context()||ticket!==intent)return;const fn=window[name];if(typeof fn!=='function')throw Error('This tool could not start. Reopen OurHouse.');return fn(...args);}catch(error){if(account===context()&&ticket===intent)window.showToast?.(error.message,true);}}
window.OurHouseFeatures={load,run,cancel:()=>intent++};
window.addEventListener('pagehide',()=>intent++);
