// Receipt amounts and stock quantities are separate. OCR rows remain review drafts.
const currency=String.raw`(?:C\$|CA\$|US\$|\$|₹|£|€|Rs\.?)`;
// OCR often separates decimal punctuation into its own word. Accept that spacing
// only in the trailing price field; do not rewrite quantities or product names.
const decimal=String.raw`(?:\d{1,3}(?:[ ,]\d{3})+|\d+)\s*[.,]\s*\d{2}`;
const priceEnd=new RegExp(String.raw`(?:^|\s|\.{2,})(${currency}\s*)?(${decimal}|\d+\s*${currency})(?:\s*(?:CAD|USD|INR|GBP|EUR))?\s*(?:[A-Z*]{1,3})?$`,'i');
const bareCurrencyEnd=new RegExp(String.raw`(?:^|\s)(${currency})\s*(\d+)(?:\s*[A-Z*]{1,3})?$`,'i');
const noise=/^(?:(?:(?:sub\s*|grand\s*)?total|tax(?:es)?|hst|gst|pst|qst|vat|cash|change|visa|mastercard|amex|debit|credit|card|balance|thank|receipt|store|tel(?:ephone)?|phone|invoice|qty|quantity|item(?:s)?|amount|discount|savings|coupon|member(?:ship)?|points|date|time|payment|tender|auth|terminal|transaction|register|cashier|rounding|refund|return)\b|www\.|https?:)/i;
const unitMap={g:'g',gm:'g',gms:'g',gram:'g',grams:'g',kg:'kg',kgs:'kg',ml:'ml',l:'L',litre:'L',liter:'L',litres:'L',liters:'L',pc:'pcs',pcs:'pcs',ea:'pcs',each:'pcs',pk:'packet',pack:'packet',packs:'packet',packet:'packet',packets:'packet',bunch:'bunch'};
const measurement=/\b(\d+(?:[.,]\d{1,3})?)\s*(kg|kgs|gms|gm|grams?|ml|litres?|liters?|pcs?|each|ea|packets?|packs?|pk|bunch|g|l)\b/i;
function amount(value){const s=value.replace(/[^\d.,]/g,'');const i=Math.max(s.lastIndexOf('.'),s.lastIndexOf(','));return i<0?s+'.00':s.slice(0,i).replace(/[.,]/g,'')+'.'+s.slice(i+1);}
function splitPrice(line){const m=line.match(priceEnd)||line.match(bareCurrencyEnd);if(!m)return null;return {body:line.slice(0,m.index).trim(),amount:amount(m[2])};}
function quantity(body){
 let qty=null,unit='pcs',name=body.replace(/^[A-Z]\s+(?=\d{4,14}\s)/,''),count=1;
 const countedCode=name.match(/^(\d{1,3})\s+(\d{4,14})\s+/);if(countedCode){count=Number(countedCode[1]);qty=count;name=name.slice(countedCode[1].length).trim();}
 const itemNumber=name.match(/^(\d{4,14})\s+/)?.[1];
 const lead=name.match(/^\s*(\d{1,3})\s*[x×]\s*/i);if(lead){count=Number(lead[1]);name=name.slice(lead[0].length);qty=count;}
 // Receipt count/rate columns are not part of a product name or stock amount.
 const rate=name.match(/(?:^|\s)(\d+(?:[.,]\d{1,3})?)\s*(kg|g|ml|l|ea|pcs)?\s*[@x×]\s*(?:C?\$|₹|Rs\.?)?\s*\d+(?:[.,]\d{2})(?:\s*\/\s*(?:kg|g|ml|l|ea|pcs))?\s*$/i);
 if(rate){qty=Number(rate[1].replace(',','.'));unit=unitMap[(rate[2]||'pcs').toLowerCase()]||'pcs';name=name.slice(0,rate.index).trim();}
 else {const weight=name.match(measurement);if(weight){qty=Number(weight[1].replace(',','.'))*count;unit=unitMap[weight[2].toLowerCase()];name=name.replace(weight[0],' ').trim();}}
 name=name.replace(/^\s*\d{4,14}\s+/,'').replace(/[*#_]/g,' ').replace(/\.{2,}/g,' ').replace(/\s+/g,' ').trim();
 const known=qty!==null&&Number.isFinite(qty)&&qty>0&&qty<=100000;
 return {name,qty:known?qty:1,unit:known?unit:'pcs',quantityKnown:known,...(itemNumber?{itemNumber}:{})};
}
function validName(name){return name.length>=2&&name.length<=80&&/\p{L}{2}/u.test(name)&&!noise.test(name)&&!/(?:instant\s+savings|coupon|discount)\b/i.test(name)&&!/(?:[$₹£€]|\bRs\.?\s*\d|\d+[.,]\d{2}(?:\s|$))/i.test(name);}
export function parseReceipt(text){
 const lines=String(text||'').slice(0,100000).split(/\r?\n/).map(x=>x.replace(/\u00a0/g,' ').trim()).filter(Boolean),rows=[];
 let pending=null,last=null;
 for(const line of lines){
  if(noise.test(line)||/^[-=*_\s]+$/.test(line)||/^-\s*[$₹£€]?\s*\d/.test(line)){pending=null;last=null;continue;}
  const priced=splitPrice(line),body=priced?.body??line,q=quantity(body);
  const continuation=/^\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|ea|pcs)?\s*[@x×]/i.test(body);
  if(continuation&&q.quantityKnown&&!q.name){
   const row=pending?{...quantity(pending),raw:pending}:last;
   if(row){row.qty=q.qty;row.unit=q.unit;row.quantityKnown=true;if(priced)row.amount=priced.amount;row.raw+='\n'+line;if(pending&&priced&&validName(row.name))rows.push(row);last=row;}
   pending=null;continue;
  }
  if(priced&&pending&&/^\d{4,14}\s/.test(pending)&&!q.itemNumber){const joined=quantity(pending+' '+body);if(validName(joined.name)){const row={...joined,amount:priced.amount,raw:pending+'\n'+line};rows.push(row);last=row;pending=null;continue;}}
  if(priced&&!body&&pending){const row={...quantity(pending),amount:priced.amount,raw:pending+'\n'+line};if(validName(row.name)){rows.push(row);last=row;}pending=null;continue;}
  if(priced){pending=null;if(validName(q.name)){const row={...q,amount:priced.amount,raw:line};rows.push(row);last=row;}else last=null;}
  else {pending=validName(q.name)?line:null;last=pending?null:last;}
  if(rows.length>=200)break;
 }
 return rows;
}
export function pantryReceipt(text){return parseReceipt(text).slice(0,200).map(row=>({...row,pick:false,confidence:'review'}));}
export function expenseReceipt(text){return parseReceipt(text).map(({name,amount,raw})=>({name,amount,raw}));}
