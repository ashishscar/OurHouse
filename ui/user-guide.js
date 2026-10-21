/* Public help content. Only explicit, allowlisted screen navigation crosses the frame. */
window.OurHouseGuide=(()=>{
 let dialog,frame,returnBar;
 const routes={
  home:()=>goTo('home'),meals:()=>goTo('week'),shop:()=>goTo('grocery'),
  recipes:()=>goTo('dishes'),pantry:()=>goTo('pantry'),
  expenses:()=>openExpenses(),chores:()=>RoomioFamily.chores(),
  water:()=>openWaterBillSheet(),settings:()=>openSheet('settings'),
 };
 function mount(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.className='user-guide-dialog';dialog.id='userGuide';
  dialog.setAttribute('aria-labelledby','userGuideTitle');
  dialog.innerHTML='<header class="user-guide-header"><div><small>OurHouse · Help at your pace</small><h2 id="userGuideTitle">User guide</h2></div><a href="/user-guide?download=1" download="OurHouse-User-SOP-Manual.html">Download</a><button type="button" autofocus aria-label="Close user guide">Close</button></header><iframe title="OurHouse interactive user guide" src="/user-guide?embedded=1" referrerpolicy="no-referrer"></iframe>';
  frame=dialog.querySelector('iframe');dialog.querySelector('button').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{document.querySelector('.tab.on')?.focus();});
  document.body.append(dialog);
  returnBar=document.createElement('div');returnBar.className='user-guide-return';returnBar.hidden=true;
  returnBar.innerHTML='<button type="button">← Return to guide</button><button type="button" aria-label="Dismiss return to guide">×</button>';
  returnBar.children[0].onclick=open;returnBar.children[1].onclick=()=>returnBar.hidden=true;document.body.append(returnBar);
 }
 function open(){
  if(!window.RoomioFamily?.getSession()?.house)return;
  closeDrawer();closeAllSheets();mount();returnBar.hidden=true;
  if(!dialog.open)dialog.showModal();
 }
 function reset(){if(dialog?.open)dialog.close();dialog?.remove();returnBar?.remove();dialog=frame=returnBar=null;}
 window.addEventListener('message',event=>{
  if(!dialog?.open||event.origin!==location.origin||event.source!==frame?.contentWindow)return;
  const data=event.data;
  if(!data||data.type!=='ourhouse-guide:navigate'||typeof data.destination!=='string'||!Object.hasOwn(routes,data.destination))return;
  if(!window.RoomioFamily?.getSession()?.house){reset();return;}
  dialog.close();closeAllSheets();closeDrawer();routes[data.destination]();returnBar.hidden=false;
 });
 return {open,reset};
})();
