import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('../ui/user-guide.js',import.meta.url),'utf8');
function host(){
 const dom=new JSDOM('<button id="opener">Guide</button>',{url:'https://ourhouse.test',runScripts:'dangerously'}),w=dom.window,calls=[];
 let active=true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.RoomioFamily={getSession:()=>active?{house:{id:'fixture'}}:null,chores:()=>calls.push('chores')};
 for(const name of ['closeDrawer','closeAllSheets'])w[name]=()=>{};
 w.goTo=name=>calls.push(name);w.openExpenses=()=>calls.push('expenses');w.openWaterBillSheet=()=>calls.push('water');w.openSheet=name=>calls.push(name);
 w.eval(source);
 const send=(data,{origin=w.location.origin,source=w.document.querySelector('iframe')?.contentWindow}={})=>w.dispatchEvent(new w.MessageEvent('message',{origin,source,data}));
 return {w,calls,send,signedOut(){active=false;},close:()=>w.close()};
}
test('guide bridge rejects foreign origins, other frames, unknown actions and hidden-frame requests',()=>{
 const h=host();try{h.w.OurHouseGuide.open();const command={type:'ourhouse-guide:navigate',destination:'recipes'};
  h.send(command,{origin:'https://other.test'});h.send(command,{source:h.w});h.send({...command,destination:'delete-account'});h.send({...command,destination:'__proto__'});h.send({...command,destination:{}});
  assert.deepEqual(h.calls,[]);assert.equal(h.w.document.querySelector('dialog').open,true);
  h.send(command);assert.deepEqual(h.calls,['dishes']);assert.equal(h.w.document.querySelector('dialog').open,false);assert.equal(h.w.document.querySelector('.user-guide-return').hidden,false);
  h.send(command);assert.deepEqual(h.calls,['dishes']);h.w.document.querySelector('.user-guide-return button').click();assert.equal(h.w.document.querySelector('dialog').open,true);
  h.w.OurHouseGuide.reset();assert.equal(h.w.document.querySelector('iframe'),null);assert.equal(h.w.document.querySelector('.user-guide-return'),null);
 }finally{h.close();}
});
test('guide cannot navigate after the account is cleared',()=>{const h=host();try{h.w.OurHouseGuide.open();h.signedOut();h.send({type:'ourhouse-guide:navigate',destination:'expenses'});assert.deepEqual(h.calls,[]);assert.equal(h.w.document.querySelector('dialog'),null);h.w.OurHouseGuide.open();assert.equal(h.w.document.querySelector('dialog'),null);}finally{h.close();}});

test('manual search, checklist, guided steps and kitchen reference work without account or network access',()=>{
 const html=readFileSync(new URL('../manual/user-guide.html',import.meta.url),'utf8'),errors=[];
 const dom=new JSDOM(html,{url:'https://ourhouse.test/user-guide',runScripts:'dangerously',beforeParse(w){w.HTMLElement.prototype.scrollIntoView=function(){};w.fetch=()=>{throw Error('Manual must not fetch data');};w.addEventListener('error',e=>errors.push(e.message));}}),w=dom.window,d=w.document;
 try{assert.equal(d.querySelectorAll('.topic').length,17);assert.equal(d.querySelectorAll('[data-check]').length,90);const search=d.getElementById('manualSearch');search.value='cover';search.dispatchEvent(new w.Event('input'));assert.equal(d.querySelector('.topic.active').id,'cover');
  const check=d.querySelector('#cover [data-check]');check.click();assert.equal(JSON.parse(w.localStorage.getItem('ourhouse-user-manual-v1')).checks[check.dataset.check],true);
  d.querySelector('#cover .view-toggle').click();assert.equal(d.querySelectorAll('#cover .sop-step:not([hidden])').length,1);d.querySelector('#cover .step-next').click();assert.equal(d.querySelector('#cover .step-position').textContent,'2 / 5');
  d.querySelector('[data-topic-link="kitchen"]').click();d.querySelector('[data-diet="vegan"]').click();assert.match(d.getElementById('dietExplanation').textContent,/no eggs, dairy, honey/);assert.equal(d.querySelectorAll('[data-app-destination]:not([hidden])').length,0);assert.deepEqual(errors,[]);
 }finally{w.close();}
});
