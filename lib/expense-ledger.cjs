/* Independent expense arithmetic. Every stored amount is an integer minor unit.
   No network, browser storage, AI or household permission decisions live here. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ExpenseLedger=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX=1000000000000;
const fail=message=>{throw new Error(message);};
function integer(n){if(!Number.isSafeInteger(n)||Math.abs(n)>MAX)fail('Amount exceeds the supported limit');return n;}
function precision(currency){
  if(!/^[A-Z]{3}$/.test(currency)||!Intl.supportedValuesOf('currency').includes(currency))fail('Choose a supported currency code');
  return new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;
}
function decimal(value,digits=2,negative=false){
  const text=String(value??'').trim();
  if(!new RegExp('^'+(negative?'-?':'')+'[0-9]+(?:\\.[0-9]{1,'+Math.max(1,digits)+'})?$').test(text))fail('Enter a valid amount with at most '+digits+' decimal places');
  const sign=text.startsWith('-')?-1:1,parts=text.replace('-','').split('.');
  if(digits===0&&parts[1])fail('This currency does not use decimal places');
  const minor=BigInt(parts[0])*10n**BigInt(digits)+BigInt((parts[1]||'').padEnd(digits,'0')||'0');
  if(minor>BigInt(MAX))fail('Amount exceeds the supported limit');return integer(sign*Number(minor));
}
function money(value,currency){return decimal(value,precision(currency));}
function text(minor,currency){const digits=precision(currency),sign=minor<0?'-':'';minor=Math.abs(integer(minor));const base=10**digits;return sign+Math.floor(minor/base)+(digits?'.'+String(minor%base).padStart(digits,'0'):'');}
function format(minor,currency){return new Intl.NumberFormat(undefined,{style:'currency',currency,minimumFractionDigits:precision(currency),maximumFractionDigits:precision(currency)}).format(integer(minor)/10**precision(currency));}
function ids(values){if(!Array.isArray(values)||!values.length||values.length>200||new Set(values).size!==values.length||values.some(id=>typeof id!=='string'||!id||['__proto__','constructor','prototype'].includes(id)||/[.#$\[\]\/]/.test(id)))fail('Select valid, distinct people');return values.slice().sort();}
function sum(map){return Object.values(map||{}).reduce((s,n)=>integer(s+integer(n)),0);}
function allocate(total,weights){
  integer(total);if(total<0)fail('Allocation cannot be negative');const keys=ids(Object.keys(weights)),denom=keys.reduce((s,k)=>s+BigInt(integer(weights[k])),0n);
  if(keys.some(k=>weights[k]<0)||denom<=0n)fail('Shares must be non-negative and at least one must be positive');
  const out={},remainders=[];let used=0;
  for(const k of keys){const product=BigInt(total)*BigInt(weights[k]),part=Number(product/denom);out[k]=part;used+=part;remainders.push({k,remainder:product%denom});}
  remainders.sort((a,b)=>a.remainder===b.remainder?a.k.localeCompare(b.k):a.remainder>b.remainder?-1:1);
  for(let i=0;i<total-used;i++)out[remainders[i].k]++;return out;
}
function split(total,people,method='equal',values={},currency='CAD'){
  people=ids(people);integer(total);if(total<=0)fail('Amount must be greater than zero');
  const weights={};
  if(method==='exact'){for(const id of people)weights[id]=money(values[id]??'0',currency);if(sum(weights)!==total)fail('Exact shares must add up to the total');return weights;}
  if(method==='adjustment'){
    const additions={};for(const id of people)additions[id]=decimal(values[id]??'0',precision(currency),true);
    const rest=integer(total-sum(additions));if(rest<0)fail('Adjustments exceed the total');const base=allocate(rest,Object.fromEntries(people.map(id=>[id,1])));
    for(const id of people){base[id]=integer(base[id]+additions[id]);if(base[id]<0)fail('An adjustment gives someone a negative share');}return base;
  }
  for(const id of people)weights[id]=method==='equal'?1:decimal(values[id]??'0',4);
  if(method==='percentage'&&sum(weights)!==1000000)fail('Percentages must add up to 100%');
  if(!['equal','percentage','shares'].includes(method))fail('Choose a valid split method');return allocate(total,weights);
}
function itemize(items,charges,currency){
  if(!Array.isArray(items)||!items.length||items.length>200)fail('Add receipt items');let subtotal=0;const shares={};
  for(const item of items){const amount=money(item.amount,currency);if(amount<=0||!String(item.name||'').trim())fail('Each item needs a name and positive amount');subtotal=integer(subtotal+amount);
    const itemShares=split(amount,item.people,item.method||'equal',item.values||{},currency);for(const [id,n] of Object.entries(itemShares))shares[id]=integer((shares[id]||0)+n);}
  const discount=money(charges.discount||'0',currency);if(discount>subtotal)fail('Discount cannot exceed item total');
  const tax=money(charges.tax||'0',currency),tip=money(charges.tip||'0',currency),net=integer(subtotal-discount+tax+tip);
  if(net<=0)fail('Receipt total must be positive');return {amount:net,shares:allocate(net,shares),subtotal,tax,tip,discount};
}
function validate(entry){
  if(!entry||!['expense','refund','payment'].includes(entry.type))fail('Invalid entry type');
  precision(entry.currency);if(integer(entry.amount)<=0)fail('Amount must be greater than zero');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||new Date(entry.date+'T12:00:00Z').toISOString().slice(0,10)!==entry.date)fail('Choose a valid date');
  if(!String(entry.description||'').trim()||entry.description.length>160)fail('Add a description up to 160 characters');
  if(entry.type==='payment'){ids([entry.from,entry.to]);if(entry.from===entry.to)fail('Choose different people for a payment');}
  else{ids(Object.keys(entry.paid||{}));ids(Object.keys(entry.shares||{}));if(Object.values(entry.paid).some(n=>integer(n)<0)||Object.values(entry.shares).some(n=>integer(n)<0))fail('Contributions and shares cannot be negative');if(sum(entry.paid)!==entry.amount||sum(entry.shares)!==entry.amount)fail('Contributions and shares must each equal the total');}
  return entry;
}
function balances(entries){const result={};for(const e of Object.values(entries||{})){if(e.deleted)continue;validate(e);const totals=result[e.currency]||(result[e.currency]={});const add=(id,n)=>totals[id]=integer((totals[id]||0)+n);
    if(e.type==='payment'){add(e.from,e.amount);add(e.to,-e.amount);}else{const sign=e.type==='refund'?-1:1;for(const [id,n] of Object.entries(e.paid))add(id,n*sign);for(const [id,n] of Object.entries(e.shares))add(id,-n*sign);}}
  for(const totals of Object.values(result))if(sum(totals)!==0)fail('Ledger does not balance');return result;}
function simplify(totals){if(sum(totals)!==0)fail('Ledger does not balance');const debtors=[],creditors=[];for(const id of Object.keys(totals).sort()){const n=integer(totals[id]);if(n<0)debtors.push({id,n:-n});if(n>0)creditors.push({id,n});}
  debtors.sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id));creditors.sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id));const out=[];let d=0,c=0;
  while(d<debtors.length&&c<creditors.length){const amount=Math.min(debtors[d].n,creditors[c].n);out.push({from:debtors[d].id,to:creditors[c].id,amount});debtors[d].n-=amount;creditors[c].n-=amount;if(!debtors[d].n)d++;if(!creditors[c].n)c++;}return out;
}
function directDebts(entries,currency){const net={};function add(from,to,n){if(from===to||!n)return;const pair=[from,to].sort(),key=pair.join('\0');net[key]=integer((net[key]||0)+(from===pair[0]?n:-n));}
  for(const e of Object.values(entries||{})){if(e.deleted||e.currency!==currency)continue;validate(e);if(e.type==='payment'){add(e.from,e.to,-e.amount);continue;}
    const sign=e.type==='refund'?-1:1;
    /* First retain self-funded portions; match remaining debt and contributions.
       This produces explicit payer paths without floating-point multiplication. */
    const people=[...new Set([...Object.keys(e.paid),...Object.keys(e.shares)])];const delta=Object.fromEntries(people.map(id=>[id,(e.paid[id]||0)-(e.shares[id]||0)]));
    for(const p of simplify(delta))add(p.from,p.to,p.amount*sign);
  }
  return Object.entries(net).filter(([,n])=>n).map(([key,n])=>{const [a,b]=key.split('\0');return {from:n>0?a:b,to:n>0?b:a,amount:Math.abs(n)};});
}
function revise(current,spec,validator=validate){
  if(!spec||!spec.opId||!Number.isSafeInteger(spec.baseRevision)||!Number.isSafeInteger(spec.at)||!spec.actor)fail('Invalid saved operation');
  if(Object.values(current?.history||{}).some(r=>r.opId===spec.opId))return current;
  if((current?.revision||0)!==spec.baseRevision)return undefined;
  validator(spec.value);const revision=spec.baseRevision+1,history=Object.assign({},current?.history||{});
  history['r'+revision]={value:JSON.parse(JSON.stringify(spec.value)),actor:spec.actor,at:spec.at,opId:spec.opId};
  return Object.assign({},spec.value,{revision,modifiedBy:spec.actor,updatedAt:spec.at,history});
}
function recurrenceDate(anchor,frequency,index){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor)||!Number.isSafeInteger(index)||index<0)fail('Invalid recurring schedule');
  const d=new Date(anchor+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==anchor)fail('Invalid recurring date');
  if(frequency==='weekly'||frequency==='fortnightly')d.setUTCDate(d.getUTCDate()+index*(frequency==='weekly'?7:14));
  else if(frequency==='monthly'||frequency==='yearly'){const day=d.getUTCDate(),year=d.getUTCFullYear(),month=d.getUTCMonth();d.setUTCDate(1);if(frequency==='monthly')d.setUTCMonth(month+index);else d.setUTCFullYear(year+index);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}
  else fail('Choose a repeat frequency');return d.toISOString().slice(0,10);
}
function report(entries,month=''){const totals={},categories={},months={};for(const e of Object.values(entries||{})){if(e.deleted||e.type==='payment'||(month&&!e.date.startsWith(month)))continue;validate(e);const sign=e.type==='refund'?-1:1,n=e.amount*sign,key=e.currency;totals[key]=integer((totals[key]||0)+n);const cat=(categories[key]||(categories[key]={})),time=(months[key]||(months[key]={}));cat[e.category||'Other']=integer((cat[e.category||'Other']||0)+n);time[e.date.slice(0,7)]=integer((time[e.date.slice(0,7)]||0)+n);}return {totals,categories,months};}
function csv(entries,names={}){const cell=value=>'"'+String(value??'').replace(/^[=+\-@\t\r]/,"'"+'$&').replaceAll('"','""')+'"';
  const rows=[['ID','Date','Type','Description','Currency','Amount','Paid by','Shares / payment to','Category','Note','Revision','Deleted']];
  for(const [id,e] of Object.entries(entries||{})){validate(e);const map=m=>Object.entries(m||{}).map(([person,n])=>(names[person]||person)+': '+text(n,e.currency)).join('; ');rows.push([id,e.date,e.type,e.description,e.currency,text(e.amount,e.currency),e.type==='payment'?(names[e.from]||e.from):map(e.paid),e.type==='payment'?(names[e.to]||e.to):map(e.shares),e.category||'',e.note||'',e.revision||1,e.deleted?'yes':'no']);}return rows.map(row=>row.map(cell).join(',')).join('\r\n');}
return {MAX,integer,precision,money,text,format,allocate,split,itemize,validate,balances,simplify,directDebts,revise,recurrenceDate,report,csv};
});
