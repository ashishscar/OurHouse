let state=null,pending=null,lastReport=0,lastRefresh=0;
const $=id=>document.getElementById(id);
async function request(body){
 const headers=body?(window.OurHouseTest?.active?{'x-ourhouse-test':'1'}:await window.OurHouseAuth?.headers?.()||{}):{};
 const response=await fetch('/api/maintenance',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{...headers,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(28000)});
 const result=await response.json();if(!response.ok)throw Error('App health is temporarily unavailable. Your data has not been reset.');return result;
}
function render(){
 const status=$('ourhouseCareStatus');if(!status)return;
 if(!state?.enabled){status.textContent='Background app care is connecting.';return;}
 const failed=(state.checks||[]).filter(c=>!c.ok);
 status.textContent=!state.lastCheck?'Waiting for the first background check.':failed.length?'A technical issue is being checked. Affected entry tools may be temporarily protected.':state.flags?.recipes===false||state.flags?.receipts===false?'Checks are passing. Protected tools return after the second successful check.':'The latest automatic checks passed.';
 $('ourhouseCareTime').textContent=state.lastCheck?'Checked '+new Date(state.lastCheck).toLocaleString()+'. Checks run every five minutes, including while the app is closed.':'Checks run on OurHouse’s server every five minutes.';
 $('ourhouseCareAI').textContent=state.ai?.status==='reviewed'?'AI review completed '+new Date(state.ai.lastReview).toLocaleString()+'.':state.ai?.status==='reviewing'?'AI is reviewing the technical checks.':state.ai?.status==='unavailable'?'AI review is temporarily unavailable; verified protection rules are active.':'AI review is waiting for its next available check.';
 $('ourhouseCareSummary').textContent=state.ai?.summary||'Only synthetic checks and fixed technical codes are sent to the model.';
 $('ourhouseCareRepairs').textContent=(state.repairs||[]).length+' automatic protection or recovery actions recorded. '+(state.reviewQueue||[]).length+' technical reports need a tested release.';
 const preference=$('ourhouseTechnicalCounts');if(preference)preference.checked=window.OurHouseMetrics?.enabled()!==false;const counters=$('ourhousePerformanceCounts');if(counters){const counts=state.performance?.counts||{};counters.textContent=Object.entries(counts).map(([metric,buckets])=>metric.toLowerCase().replaceAll('_',' ')+': '+Object.entries(buckets).map(([bucket,count])=>count+' '+bucket.toLowerCase()).join(', ')).join(' · ')||'Aggregated performance counts will appear after the app is used.';}
 const flags=state.flags||{};document.documentElement.dataset.recipeProtection=flags.recipes===false?'on':'off';document.documentElement.dataset.receiptProtection=flags.receipts===false?'on':'off';
}
async function refresh(){if(pending)return pending;pending=request().then(value=>{state=value;render();if(state.flags?.refreshInterface)void refreshInterface();}).catch(()=>{if($('ourhouseCareStatus'))$('ourhouseCareStatus').textContent='The health service is temporarily unavailable. Continue to keep any unsent drafts on this device.';}).finally(()=>pending=null);return pending;}
async function refreshInterface(){
 if(Date.now()-lastRefresh<3600000)return;lastRefresh=Date.now();
 try{const registration=await navigator.serviceWorker?.getRegistration();await registration?.update();registration?.active?.postMessage({type:'OURHOUSE_REPAIR_PUBLIC_CACHE'});}catch{}
 // Never reload a page, clear storage, discard a draft or alter the save queue.
}
async function report(code){
 if(Date.now()-lastReport<600000)return;
 lastReport=Date.now();
 try{await request({action:'report',code});}catch{}
 if(code==='INTERFACE_ERROR')void refreshInterface();
}
function panel(){const checked=window.OurHouseMetrics?.enabled()===false?'':' checked';return '<details class="settings-group" id="ourhouseCareGroup"><summary><b>AI app care</b></summary><div class="settings-group-body"><p id="ourhouseCareStatus" class="finehint" role="status">Checking app care…</p><p id="ourhouseCareTime" class="finehint"></p><p id="ourhouseCareAI" class="finehint"></p><button id="ourhouseCareRun" class="btn tint block" onclick="OurHouseMaintenance.check()">Run health check</button><p class="finehint">The agent checks public app files and synthetic recipe/receipt examples. It can protect faulty entry tools and restore them after verified checks. New code defects need a tested release. It cannot read family recipes, messages, expenses, receipts, account keys or sign-in tokens.</p><label class="family-field">Report a technical problem<select id="ourhouseCareProblem"><option value="RECIPE_LOOKUP">Recipe suggestions</option><option value="RECEIPT_SCAN">Receipt scanning</option><option value="SAVE_RETRY">Saving or syncing</option><option value="INTERFACE_ERROR">Opening or navigating</option><option value="NOTIFICATION">Notifications</option></select></label><button class="btn grey block" onclick="OurHouseMaintenance.reportProblem()">Send technical code</button><p id="ourhouseCareNotice" class="finehint" role="status"></p><label class="family-metric-choice"><span>Share technical performance counts</span><input id="ourhouseTechnicalCounts" type="checkbox" onchange="OurHouseMetrics.setSharing(this.checked)"'+checked+'></label><p class="finehint">Only Fast, OK, Slow or Failed counts are reported. No exact timings, names, screen contents or private URLs. You can turn reporting off on this device.</p><details><summary>Technical details</summary><p id="ourhousePerformanceCounts" class="finehint"></p><p id="ourhouseCareSummary" class="finehint"></p><p id="ourhouseCareRepairs" class="finehint"></p><p class="finehint">No raw errors, screen text, URLs, identifiers or household content are sent to the model. Reports contain only the selected fixed code. AI usage is capped at eight short reviews per day across OurHouse.</p></details></div></details>';}
async function check(){const button=$('ourhouseCareRun');if(button)button.disabled=true;if($('ourhouseCareNotice'))$('ourhouseCareNotice').textContent='Running the next available health check…';try{state=await request({action:'check'});render();$('ourhouseCareNotice').textContent='Check completed. Checks and AI reviews have shared cooldowns and daily limits.';}catch(e){if($('ourhouseCareNotice'))$('ourhouseCareNotice').textContent=e.message;}finally{if(button?.isConnected)button.disabled=false;}}
async function reportProblem(){try{await request({action:'report',code:$('ourhouseCareProblem').value});$('ourhouseCareNotice').textContent='Technical code received. No family content was included.';}catch(e){if($('ourhouseCareNotice'))$('ourhouseCareNotice').textContent=e.message;}}
function open(){window.closeDrawer();window.closeAllSheets();window.openSheet('settings');const group=$('ourhouseCareGroup');if(group){group.open=true;group.scrollIntoView({block:'start',behavior:'smooth'});}void refresh();}
window.OurHouseMaintenance={panel,report,mount:refresh,check,reportProblem,open,allows:feature=>state?.flags?.[feature]!==false};
window.addEventListener('error',event=>{if(event.target===window||event.target?.tagName==='SCRIPT')void report('INTERFACE_ERROR');},true);
window.addEventListener('unhandledrejection',()=>void report('INTERFACE_ERROR'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
setInterval(()=>{if(!document.hidden)void refresh();},300000);
void refresh();
