// Structured receipt drafts: never use a monetary amount as stock quantity.
const currency=String.raw`(?:C\$|CA\$|US\$|\$|₹|£|€|Rs\.?)`;
const decimal=String.raw`(?:\d{1,3}(?:[ ,]\d{3})+|\d+)\s*[.,]\s*\d{2}`;
const priceEnd=new RegExp(String.raw`(?:^|\s|\.{2,})(?:\*\s*)?(${currency}\s*)?(${decimal}|\d+\s*${currency})(?:\s*(?:CAD|USD|INR|GBP|EUR))?\s*(?:[A-Z*]{1,3})?$`,'i');
const bareCurrencyEnd=new RegExp(String.raw`(?:^|\s)(${currency})\s*(\d+)(?:\s*[A-Z*]{1,3})?$`,'i');
const noise=/^(?:(?:(?:sub\s*|grand\s*)?total|tax(?:es)?|hst|gst|pst|qst|vat|cash|change|visa|mastercard|amex|debit|credit|card|balance|thank|receipt|store|tel(?:ephone)?|phone|invoice|qty|quantity|item(?:s)?|amount|discount|savings|coupon|member(?:ship)?|points|date|time|payment|tender|auth|terminal|transaction|register|cashier|rounding|refund|return|number\s+of\s+products|special\s+sale)\b|www\.|https?:)/i;
const unitMap={g:'g',gm:'g',gms:'g',gram:'g',grams:'g',kg:'kg',kgs:'kg',ml:'ml',l:'L',litre:'L',liter:'L',litres:'L',liters:'L',pc:'pcs',pcs:'pcs',ea:'pcs',each:'pcs',pk:'packet',pack:'packet',packs:'packet',packet:'packet',packets:'packet',bunch:'bunch',lb:'kg',lbs:'kg',oz:'g'};
const unitPattern=String.raw`kg|kgs|gms|gm|grams?|ml|litres?|liters?|pcs?|each|ea|packets?|packs?|pk|bunch|lbs?|oz|g|l`;
const measurement=new RegExp(String.raw`\b(\d+(?:[.,]\d{1,3})?)\s*(${unitPattern})\b`,'i');
const ratePattern=new RegExp(String.raw`^\s*(\d+(?:[.,]\d{1,3})?)\s*(${unitPattern})?\s*[@x×]\s*(?:${currency})?\s*(\d+\s*[.,]\s*\d{2})(?:\s*(?:per|/)\s*(?:${unitPattern}))?\s*$`,'i');
const num=s=>Number(String(s).replace(/\s/g,'').replace(',','.'));
const rounded=n=>Math.round(n*1e6)/1e6;
function measured(q,u){u=u.toLowerCase();return {qty:rounded(q*(u==='lb'||u==='lbs'?0.45359237:u==='oz'?28.349523125:1)),unit:unitMap[u]||'pcs'};}
function amount(value){const s=value.replace(/[^\d.,]/g,'');const i=Math.max(s.lastIndexOf('.'),s.lastIndexOf(','));return i<0?s+'.00':s.slice(0,i).replace(/[.,]/g,'')+'.'+s.slice(i+1);}
function splitPrice(line){const m=line.match(priceEnd)||line.match(bareCurrencyEnd);if(!m)return null;return {body:line.slice(0,m.index).trim(),amount:amount(m[2])};}
function quantity(body){
 let name=body.replace(/^[A-Z]\s+(?=\d{4,14}\s)/,''),count=1,known=false;
 const inline=name.match(new RegExp(ratePattern.source.replace('^\\s*','(?:^|\\s)'),'i'));if(inline)name=name.slice(0,inline.index).trim();
 const counted=name.match(/^(\d{1,3})\s+(\d{4,14})\s+/),lead=name.match(/^\s*(\d{1,3})\s*[x×]\s*/i);
 if(counted){count=Number(counted[1]);name=name.slice(counted[1].length).trim();known=true;}
 if(lead){count=Number(lead[1]);name=name.slice(lead[0].length);known=true;}
 const itemNumber=name.match(/^(\d{4,14})\s+/)?.[1],weight=name.match(measurement);
 let value={qty:count,unit:'pcs'};if(weight){value=measured(num(weight[1])*count,weight[2]);name=name.replace(weight[0],' ').trim();known=true;}
 name=name.replace(/^\s*\d{4,14}\s+/,'').replace(/[*#_]/g,' ').replace(/\.{2,}/g,' ').replace(/\s+/g,' ').trim();
 const row={name,...value,quantityKnown:known,packCount:count,...(weight?{packSize:num(weight[1]),packUnit:weight[2].toLowerCase()}:{}),...(itemNumber?{itemNumber}:{})};return inline?applyRate(row,inline):row;
}
function validName(name){return name.length>=2&&name.length<=80&&/\p{L}{2}/u.test(name)&&!noise.test(name)&&!/(?:instant\s+savings|coupon|discount)\b/i.test(name)&&!/(?:[$₹£€]|\bRs\.?\s*\d|\d+[.,]\d{2}(?:\s|$))/i.test(name);}
function applyRate(row,rate){
 const count=num(rate[1]),u=rate[2]?.toLowerCase();
 if(u){Object.assign(row,measured(count,u));row.packCount=['ea','pcs','pc','each'].includes(u)?count:1;row.quantityDetail=rate[1]+' '+u;}
 else {row.packCount=count;if(row.packSize){Object.assign(row,measured(row.packSize*count,row.packUnit));row.quantityDetail=count+' packs × '+row.packSize+' '+row.packUnit;}else{row.qty=count;row.unit='pcs';row.quantityDetail=count+' items';}}
 row.quantityKnown=true;row.unitPrice=amount(rate[3]);return row;
}
export function parseReceipt(text){
 const lines=String(text||'').slice(0,200000).split(/\r?\n/).map(x=>x.replace(/\u00a0/g,' ').trim()).filter(Boolean),rows=[];
 let pending=null,pendingDraft=null,last=null;
 for(const line of lines){
  if(noise.test(line)||/^[-=*_\s]+$/.test(line)||/^-\s*[$₹£€]?\s*\d/.test(line)){pending=null;pendingDraft=null;last=null;continue;}
  const priced=splitPrice(line),body=priced?.body??line;
  // A count @ unit price is a continuation, even when its last decimal looks
  // like a line total. Test the full line before removing the trailing price.
  const rate=body.match(ratePattern)||(!priced?.body?.match(ratePattern)?line.match(ratePattern):null);
  if(rate){
   const row=pending?(pendingDraft||{...quantity(pending),raw:pending}):last;
   if(row){applyRate(row,rate);if(priced&&body.match(ratePattern))row.amount=priced.amount;row.raw+='\n'+line;if(pending){if(row.amount&&validName(row.name))rows.push(row);else {pending=row.raw;pendingDraft=row;}}last=row;}
   if(row?.amount){pending=null;pendingDraft=null;}continue;
  }
  const q=quantity(body);
  if(priced&&pending&&/^\d{4,14}\s/.test(pending)&&!q.itemNumber){const joined=quantity(pending+' '+body);if(validName(joined.name)){const row={...joined,amount:priced.amount,raw:pending+'\n'+line};rows.push(row);last=row;pending=null;continue;}}
  if(priced&&!body&&pending){const row={...(pendingDraft||quantity(pending)),amount:priced.amount,raw:pending+'\n'+line};if(validName(row.name)){rows.push(row);last=row;}pending=null;continue;}
  if(priced){pending=null;pendingDraft=null;if(validName(q.name)){const row={...q,amount:priced.amount,raw:line};rows.push(row);last=row;}else last=null;}
  else {pendingDraft=null;pending=validName(q.name)?line:null;last=pending?null:last;}
  if(rows.length>=500)break;
 }
 return rows;
}
export function pantryReceipt(text){return parseReceipt(text).slice(0,500).map(row=>({...row,pick:false,confidence:'review'}));}
export function expenseReceipt(text){return parseReceipt(text).map(({name,amount,raw})=>({name,amount,raw}));}
export function auditReceipt(text,items=pantryReceipt(text)){
 const lines=String(text).split(/\r?\n/),footer={},warnings=[];
 for(const line of lines){const p=splitPrice(line);if(p&&/^\s*(?:sub\s*total|grand\s*total|total)\b/i.test(line))footer[/^\s*sub/i.test(line)?'subtotal':'total']=p.amount;const m=line.match(/(?:number\s+of\s+products|items?\s+(?:sold|count))\s*[:=]?\s*(\d{1,4})\b/i);if(m)footer.productCount=Number(m[1]);}
 if(!footer.subtotal&&!footer.total)warnings.push('No printed total was read. Compare the product list with the whole photo.');
 const itemSum=rounded(items.reduce((n,r)=>n+Number(r.amount||0),0)),packCount=items.reduce((n,r)=>n+(r.packCount||1),0),target=footer.subtotal||footer.total;
 if(target&&Math.abs(Number(target)-itemSum)>.02)warnings.push('The extracted product amounts do not match the printed '+(footer.subtotal?'subtotal':'total')+'. Check for missing lines, discounts or tax.');
 if(footer.productCount&&packCount!==footer.productCount)warnings.push('The receipt prints '+footer.productCount+' purchased units; '+packCount+' units were read across '+items.length+' product lines. Review missing or repeated lines.');
 return {itemSum:itemSum.toFixed(2),packCount,...footer,warnings};
}
