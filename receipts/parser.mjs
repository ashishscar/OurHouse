// Structured receipt drafts: never use a monetary amount as stock quantity.
import {printedReceiptCount} from './metadata.mjs';
const currency=String.raw`(?:C\$|CA\$|US\$|\$|₹|£|€|Rs\.?)`;
const decimal=String.raw`(?:\d{1,3}(?:[ ,]\d{3})+|\d+)\s*[.,]\s*\d{2}`;
const priceEnd=new RegExp(String.raw`(?:^|\s|\.{2,})(?:\*\s*)?(${currency}\s*)?(?:\*\s*)?(${decimal}|\d+\s*${currency})\.?(?:\s*(?:CAD|USD|INR|GBP|EUR|€|£|₹))?\s*(?:[A-Z*×]{1,4}[\d\[\]]{0,2}|\d{1,2}|[\u3400-\u9fff])?$`,'i');
const bareCurrencyEnd=new RegExp(String.raw`(?:^|\s)(${currency})\s*(\d+)(?:\s*[A-Z*]{1,3})?$`,'i');
const noise=/^(?:(?:(?:sub[\s-]*|grand\s*|sous[\s-]*)?total|tot\.?\s*rounded|tax(?:es)?|hst|gst|pst|qst|vat|cash|change|visa|mastercard|amex|debit|credit|card|balance|thank|receipt|store|tel(?:ephone)?|phone|invoice|qty|quantity|item(?:s)?|amount|discount|savings|coupon|member(?:ship)?|points|in[-\s]*st[ou]re\s+offers|date|time|payment|tender|auth|terminal|transaction|register|cashier|rounding|refund|return|number\s+of\s+(?:products|items)|bob\s+count|special\s+sale|regular\s+price)\b|you(?:r)?\s+(?:saved|discount|price\s+matched)\b|points\s+earned\b|\d{1,2}(?:\.\d+)?%\s*(?:hst|gst|pst|qst|vat)\b|\d{2}-[A-Z]|www\.|https?:)/i;
const unitMap={g:'g',gm:'g',gms:'g',gram:'g',grams:'g',kg:'kg',kgs:'kg',ml:'ml',l:'L',litre:'L',liter:'L',litres:'L',liters:'L',pc:'pcs',pcs:'pcs',ea:'pcs',each:'pcs',pk:'packet',pack:'packet',packs:'packet',packet:'packet',packets:'packet',bunch:'bunch',lb:'kg',lbs:'kg',oz:'g'};
const unitPattern=String.raw`kg|kgs|gms|gm|grams?|ml|litres?|liters?|pcs?|each|ea|packets?|packs?|pk|bunch|lbs?|oz|g|l`;
const measurement=new RegExp(String.raw`\b(\d+(?:[.,]\d{1,3})?)\s*(${unitPattern})\b`,'i');
const ratePattern=new RegExp(String.raw`^\s*(\d+(?:[.,]\d{1,3})?)\s*(${unitPattern})?\s*[@x×]\s*(?:1\s*/\s*)?(?:${currency})?\s*(\d*\s*[.,]\s*\d{2})(?:\s*€)?(?:\s*(?:(?:per|/)\s*(?:1\s*)?(?:${unitPattern})|ea\.?))?(?:\s+(?:H?MRJ|W|EUR|€|E?UF|E?UR|[≥:]UR|CUF))?\s*$`,'i');
const bareDiscount=new RegExp(String.raw`^\s*(?:-\s*(?:${currency})?\s*\d+[.,]\d{2}|(?:${currency})?\s*\d+[.,]\d{2}\s*-)(?:\s*[A-Z*]{1,3})?\s*$`,'i');
const num=s=>Number(String(s).replace(/\s/g,'').replace(',','.'));
const rounded=n=>Math.round(n*1e6)/1e6;
function measured(q,u){u=u.toLowerCase();return {qty:rounded(q*(u==='lb'||u==='lbs'?0.45359237:u==='oz'?28.349523125:1)),unit:unitMap[u]||'pcs'};}
function amount(value){const s=value.replace(/[^\d.,]/g,'');const i=Math.max(s.lastIndexOf('.'),s.lastIndexOf(','));return i<0?s+'.00':s.slice(0,i).replace(/[.,]/g,'')+'.'+s.slice(i+1);}
function splitPrice(line){const m=line.match(priceEnd)||line.match(bareCurrencyEnd);if(!m)return null;return {body:line.slice(0,m.index).trim(),amount:amount(m[2])};}
function repairReconciledRateGlyph(line,knownTotal=null){
 // OCR can read a currency glyph as "s". Correct only a rate whose separate
 // line total proves the intended quantity and unit price in exact cents.
 const match=line.match(/^(\s*(\d{1,3})\s*[@x×]\s*)s(\d+[.,]\d{2})(?=\s|$)/i);
 if(!match)return line;
 const total=knownTotal??splitPrice(line)?.amount;
 if(!total||Number(match[2])*Math.round(num(match[3])*100)!==Math.round(num(total)*100))return line;
 return match[1]+'$'+match[3]+line.slice(match[0].length);
}
function reconciledWeighedRate(readRate,weight,lineTotal){
 // A blurred thermal digit may be repaired only when one and only one
 // replacement cent-rate rounds the printed weight to the printed line total.
 // Keep the original OCR line in raw so the user can inspect the correction.
 const digits=String(readRate).replace(/[.,]/g,'');
 if(!/^\d{3,6}$/.test(digits)||!Number.isFinite(weight)||weight<=0)return null;
 const target=Math.round(Number(lineTotal)*100),candidates=new Set();
 for(let i=0;i<digits.length;i++)for(let replacement=0;replacement<=9;replacement++){
  if(String(replacement)===digits[i])continue;
  const cents=Number(digits.slice(0,i)+replacement+digits.slice(i+1));
  if(cents>0&&Math.round(weight*cents)===target)candidates.add(cents);
 }
 return candidates.size===1?(Array.from(candidates)[0]/100).toFixed(2):null;
}
function printedDepartment(line){
 line=line.replace(/^[\s>»]+/,'').trim();
 const direct=line.match(/^(GROCERY|DAIRY|FROZEN|PRODUCE|BAKERY|DELI|HOME|HOUSEHOLD|PERSONAL\s+CARE|CLEANING)(?:\s+\$?0[.,]00)?\s*$/i);
 if(direct)return /^(?:HOME|HOUSEHOLD|PERSONAL\s+CARE|CLEANING)$/i.test(direct[1])?'household':'kitchen';
 if(splitPrice(line))return '';
 // French supermarket receipts use unpriced department lines. Match the
 // whole heading (allowing two OCR edits on longer labels), never a product
 // substring, so a wrapped product cannot silently change departments.
 const compact=line.toUpperCase().replace(/[^A-Z]/g,'');
 if(/^E[NM]TRETIEN$/.test(compact))return 'household';
 if(/^CHARCUTERIETRAITEURLS$/.test(compact))return 'exclude';
 if(/^CREMERIEFROMAGELS$/.test(compact))return 'cheese-review';
 if(/^LIQUIDE$/.test(compact))return 'kitchen';
 if(/^PERMANENTS$/.test(compact))return 'unknown';
 const french=[['AIDESALACUISINE','kitchen'],['CONDIMENTSSAUCESFROIDES','kitchen'],['CONFITURESMIELPATARTINER','kitchen'],['CONSERVESDELEGUMES','kitchen'],['CONSERVESDEPOISSON','exclude'],['EPICES','kitchen'],['FROMAGELS','kitchen'],['FROMAGECOUPEEMBALLE','kitchen'],['FRUITS','kitchen'],['LEGUMES','kitchen'],['HUILES','kitchen'],['PATES','kitchen'],['RIZ','kitchen'],['SAUCESCHAUDES','kitchen'],['TRAITEURLSUICI','kitchen'],['ULTRAFRAIS','kitchen'],['FRUITSETLEGUMES','kitchen'],['LIQUIDES','kitchen'],['FROMAGEALACOUPE','kitchen'],['POISSONNERIE','exclude'],['CHARCTRAITSAUCSECSL','exclude'],['VOLLSINDUST','exclude'],['BOUCHVOLATELIER','exclude'],['CREMERIELS','kitchen'],['CHARCTTRAITTRADT','kitchen'],['EPICERIE','kitchen'],['CHAMPAGNESMOUSSEUX','exclude'],['VINSAOC','exclude'],['MOBILIER','household'],['PARFUMERIE','household'],['PRODUITSVAISSELLE','household']];
 const edits=(a,b)=>{let prior=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prior[j]+1,prior[j-1]+Number(a[i-1]!==b[j-1]));prior=next;}return prior[b.length];};
 for(const [heading,section] of french)if(compact===heading||heading.length>=6&&Math.abs(compact.length-heading.length)<=2&&edits(compact,heading)<=(heading.length>=8?2:1))return section;
 // Thin thermal print can damage several letters in a long department
 // heading. Require two recognizable category words before discarding it.
 if(/^CONDI/.test(compact)&&compact.includes('SAUCES'))return 'kitchen';
 if(/^CONFI/.test(compact)&&compact.includes('MIEL')&&compact.length>17)return 'kitchen';
 if(/^FROMA/.test(compact)&&compact.includes('COUPE')&&/(?:EMBALL|EMDAL)/.test(compact))return 'kitchen';
 if(compact.length===3&&edits(compact,'RIZ')===1)return 'kitchen';
 const numbered=line.match(/^\d{1,2}\s*[-–]\s*([A-Z0-9]{4,12})(?:\s+[A-Z]{3,14})?\s*:?\s*$/i);
 if(!numbered)return '';
 const label=numbered[1].toUpperCase();
 function oneEdit(a,b){
  if(Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,errors=0;
  while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++errors>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
  return errors+Number(i<a.length||j<b.length)<=1;
 }
 const family=['GROCERY','DAIRY','FROZEN','PRODUCE','BAKERY','HOME','HOUSEHOLD','CLEANING','MEATS','LIQUOR'].find(word=>label===word||word.length>=6&&oneEdit(label,word));
 return family?['MEATS','LIQUOR'].includes(family)?'exclude':['HOME','HOUSEHOLD','CLEANING'].includes(family)?'household':'kitchen':'';
}
function discountPrice(line){const m=line.match(/(?:-\s*[$₹£€]?\s*(\d+[.,]\d{2})|(\d+[.,]\d{2})\s*-)(?:\s*[A-Z*]{1,3})?\s*$/i);return m?amount(m[1]||m[2]):null;}
function separateDeposit(line){const priced=splitPrice(line);return priced&&/^\+?\s*(?:bottle\s+)?deposit(?:\s+\d{1,3})?\s*$/i.test(priced.body)?priced.amount:null;}
function stripDamagedItemCode(name){
 if(/^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}\b/.test(name))return name;
 const match=name.match(/^(?:\(\d{1,3}\)\s*)?([*#]?[\d():.\/!|#-]+[A-Z]?)\s+(?=[A-Z])/i);
 if(!match||(match[1].match(/\d/g)||[]).length<4||!/[(*#:/!|]/.test(match[1])&&!/\d[A-Z]$/i.test(match[1]))return name;
 return name.slice(match[0].length);
}
function repairMeasurementZeros(name){
 // OCR sometimes prints O for zero inside an otherwise numeric pack size.
 // Only repair digits immediately followed by a known unit, never item words.
 return name.replace(/\b([\dOo]{2,5})(?=(?:GMS?|KG|ML|LB|L)\b)/gi,value=>/\d/.test(value)?value.replace(/[Oo]/g,'0'):value);
}
function quantity(body){
 let name=repairMeasurementZeros(body).replace(/^\(SALE\)\s*/i,'').replace(/^(?:H?MRJ|RQ|HQ)\s+(?=(?:\(?\d{5,14}\)?\s+)?[A-Z])/i,'').replace(/^\(\d{1,3}\)\s*(?=\d{3,14}\b)/,'').replace(/^[A-Z]\s+(?=\d{3,14}\s)/,'').replace(/\s+(?:H?MRJ|RQ|HQ|W)\s*$/i,'').replace(/\s+(?:\([TDOI1\u3400-\u9fff]\)?|[TDOI1]\))\s*$/i,''),count=1,known=false;
 // Walmart-style tills put a 12-digit barcode after the printed label.
 // Preserve it as identity evidence, never as part of the display name.
 const trailingCode=name.match(/\s+(\d{11,14})$/)?.[1];
 if(trailingCode)name=name.slice(0,-trailingCode.length).trim();
 const inline=name.match(new RegExp(ratePattern.source.replace('^\\s*','(?:^|\\s)'),'i'));if(inline)name=name.slice(0,inline.index).trim();
 const counted=name.match(/^(\d{1,3})\s+(\d{3}-\d{4}-\d|\d{4,14})\s+/),lead=name.match(/^\s*(\d{1,3})\s*[x×](?![A-Z])\s*/i);
 if(counted){count=Number(counted[1]);name=name.slice(counted[1].length).trim();known=true;}
 if(lead){count=Number(lead[1]);name=name.slice(lead[0].length);known=true;}
 const itemNumber=name.match(/^(\d{4,14}\/\d{1,4}|\d{3}-\d{4}-\d|\d{3,14})\s+/)?.[1]||trailingCode,multi=name.match(new RegExp(String.raw`(?<!\d)(\d{1,3})\s*[x×]\s*(\d+(?:[.,]\d{1,3})?)\s*(${unitPattern})\b`,'i'));
 const candidateWeight=multi?null:name.match(measurement);
 // POS item codes can precede a store prefix such as "PC". The code is an
 // identifier, not a count of pieces, even though "pc" is also a unit.
 const weight=candidateWeight?.index===0&&itemNumber&&candidateWeight[1]===itemNumber?null:candidateWeight;
 if(multi){count*=Number(multi[1]);known=true;}
 const packageUnit=u=>/^(?:pk|packs?|packets?)$/i.test(u||'');
 let value={qty:count,unit:'pcs'};if(weight){value=packageUnit(weight[2])?{qty:count,unit:'packet'}:measured(num(weight[1])*count,weight[2]);name=name.replace(weight[0],' ').trim();known=true;}
 if(multi){value=packageUnit(multi[3])?{qty:count,unit:'packet'}:measured(num(multi[2])*count,multi[3]);name=name.replace(multi[0],' ').trim();}
 // An explicit terminal piece count is stock evidence when it names a piece
 // unit, or when the printed product type is a hanger or dishwasher tablet.
 // Avoid treating arbitrary model numbers ending in X30 as a stock count.
 const piecePack=!weight&&!multi?name.match(/(?:^|[\s.])X(\d{1,3})(?:\s*(CAPS?(?:ULES?)?|TABS?(?:LETS?|LETTES?)?|PCS?))?\s*$/i):null;
 const pieceKind=/\b(?:CINTRES?|HANGERS?|DISHWASHER|TAB(?:LETS?|LETTES?)?)\b|\bTAB\.?L[-\s]?VAISS/i.test(name);
 const pieces=piecePack&&(piecePack[2]||pieceKind)&&Number(piecePack[1])>=2&&Number(piecePack[1])<=200?Number(piecePack[1]):0;
 if(pieces){value={qty:count*pieces,unit:'pcs'};name=name.slice(0,piecePack.index).trim();known=true;}
 name=stripDamagedItemCode(name).replace(/^\s*(?:\d{4,14}\/\d{1,4}|\d{3}-\d{4}-\d|\d{3,14})\s+/,'').replace(/[*#_]/g,' ').replace(/\.{2,}/g,' ').replace(/\s+/g,' ').trim().replace(/\s+(?:H?MRJ|RQ|HQ|W)\s*$/i,'');
 const row={name,...value,quantityKnown:known,packCount:multi?1:count,...(multi?{packSize:num(multi[2])*Number(multi[1]),packUnit:packageUnit(multi[3])?'pcs':multi[3].toLowerCase(),quantityDetail:multi[1]+' × '+multi[2]+' '+multi[3]}:weight?{packSize:num(weight[1]),packUnit:packageUnit(weight[2])?'pcs':weight[2].toLowerCase(),...(packageUnit(weight[2])?{quantityDetail:count+' '+(count===1?'pack':'packs')+' × '+weight[1]+' pieces'}:{})}:pieces?{packSize:pieces,packUnit:'pcs',quantityDetail:count+' '+(count===1?'pack':'packs')+' × '+pieces+' pieces'}:{}),...(itemNumber?{itemNumber}:{})};return inline?applyRate(row,inline):row;
}
function validName(name,explicitPrice=false){const letters=name.replace(/(?<=\p{L})0(?=\p{L})/gu,'O');return name.length>=2&&name.length<=80&&/\p{L}{2}/u.test(letters)&&!/^(.)\1{5,}/u.test(name)&&!noise.test(name)&&!/(?:instant\s+savings|coupon|discount)\b/i.test(name)&&!/(?:[$₹£€]|\bRs\.?\s*\d)/i.test(name)&&(explicitPrice||!/\d+[.,]\d{2}(?:\s|$)/.test(name));}
function applyRate(row,rate){
 const count=num(rate[1]),u=rate[2]?.toLowerCase();
 if(u){Object.assign(row,measured(count,u));row.packCount=['ea','pcs','pc','each'].includes(u)?count:1;row.quantityDetail=rate[1]+' '+u;}
 else {row.packCount=count;if(row.packSize){if(row.unit==='packet'&&row.packUnit==='pcs'){row.qty=count;row.quantityDetail=count+' packs × '+row.packSize+' pieces';}else{Object.assign(row,measured(row.packSize*count,row.packUnit));row.quantityDetail=count+' packs × '+row.packSize+' '+row.packUnit;}}else{row.qty=count;row.unit='pcs';row.quantityDetail=count+' items';}}
 row.quantityKnown=true;row.unitPrice=amount(rate[3]);row.rateQuantity=count;return row;
}
// Structured readers supply the price separately: a decimal in the printed
// label is then evidence, not another price column to guess at.
export function parseReceiptFields({label,amount:price,quantityLine=''}){
 if(typeof label!=='string'||label.length>160||/[\u0000-\u001f<>]/.test(label)||typeof price!=='string'||!/^\d{1,7}\.\d{2}$/.test(price)||typeof quantityLine!=='string'||quantityLine.length>160||/[\u0000-\u001f<>]/.test(quantityLine))throw Error('Invalid receipt fields');
 quantityLine=repairReconciledRateGlyph(quantityLine,price);
 const row={...quantity(label.trim()),amount:price,raw:label.trim()+' $'+price+(quantityLine?'\n'+quantityLine:'')};
 if(!validName(row.name,true))throw Error('Invalid receipt product label');
 if(quantityLine){const rate=quantityLine.match(ratePattern);if(rate)applyRate(row,rate);else row.warning='The printed quantity line was not understood. Check the photo before selecting this product.';}
 if(row.unitPrice!==undefined&&Math.abs(Number(row.amount)-row.rateQuantity*Number(row.unitPrice))>.03)row.warning='The quantity × unit price does not match this product amount. Check the photo before selecting it.';
 return row;
}
export function parseReceipt(text){
 const source=String(text||'').slice(0,200000);
 // French tills often append a VAT code after the euro sign. An OCR reader
 // can turn that sign into (, c, t, 4, or 6. Repair only decimal-adjacent
 // glyphs on a receipt with independent French/euro footer evidence.
 const frenchEuro=/(?:Article\(s\)|TOTAL\s*\[\d{1,4}\]\s*Articles?\b|REDUCTIONS INMEDIATES|RESTE A PAYER|SOUS-TOTAL)/i.test(source)&&source.includes('€');
 const lines=source.split(/\r?\n/).map(x=>{
  const trimmed=x.replace(/\u00a0/g,' ').trim();
  let repaired=frenchEuro?trimmed.replace(/(\d+[.,]\d{2})\s*[ct(46](?=\s+(?:\d+[.,]\d{2}|1[13]\b))/gi,'$1 €').replace(/(\d+[.,]\d{2})\s*\($/,'$1 €'):trimmed;
  // A third OCR glyph after a two-decimal unit price can be a damaged euro
  // sign. Repair it only when count × the first two decimals exactly equals
  // the independently printed line amount.
  const rateGlyph=repaired.match(/^(\d{1,3})\s*([x×])\s*(\d+[.,]\d{2})([046ct(€])\s+(\d+[.,]\d{2})(\s+\S{1,3})?$/i);
  if(rateGlyph&&Math.round(Number(rateGlyph[1])*num(rateGlyph[3])*100)===Math.round(num(rateGlyph[5])*100))repaired=`${rateGlyph[1]} ${rateGlyph[2]} ${rateGlyph[3]}€ ${rateGlyph[5]}${rateGlyph[6]||''}`;
  if(frenchEuro&&/^\d{1,3}\s*[x×]\s*\d+[.,]\d{2}\s*[ct(46]$/i.test(repaired))repaired=repaired.replace(/[ct(46]$/i,'€');
  return repairReconciledRateGlyph(repaired);
 }).filter(Boolean),rows=[];
 let pending=null,pendingDraft=null,last=null,deferredRate=null,beforeDiscount=null,orphanPrice=null,department='';const consumed=new Set();
 // Some tills put a count/rate immediately before the next product. Do not
 // overwrite the previous product when its printed amount cannot match it.
 function finishRate(next,allowPrevious=true){
  if(!deferredRate)return;
  const {rate,line,previous,afterDiscount}=deferredRate,total=num(rate[1])*Number(amount(rate[3]));
  const matches=next&&Math.abs(Number(next.amount)-total)<=.03;
  const previousMatches=allowPrevious&&afterDiscount&&previous&&Math.abs(Number(previous.amount)-total)<=.03;
  if(matches&&previousMatches){for(const row of [previous,next]){row.warning='A quantity line matches two nearby products. Stock was left unchanged; check the photo.';row.unmatchedQuantity=line;}}
  else if(matches){applyRate(next,rate);next.raw=line+'\n'+next.raw;}
  else if(previousMatches){applyRate(previous,rate);previous.raw+='\n'+line;}
  else if(previous){previous.warning=afterDiscount?'A quantity line after a discount could not be assigned safely. Stock was left unchanged; check the photo.':'A nearby quantity × unit price does not match the printed amount. Stock was left unchanged; check the photo.';previous.unmatchedQuantity=line;}
  deferredRate=null;
 }
 function add(row){finishRate(row);if(department)row.department=department;rows.push(row);}
 for(const [lineIndex,originalLine] of lines.entries()){
  let line=originalLine;
  if(consumed.has(lineIndex))continue;
  // A one-character VAT code can sit between a product label and its
  // priced count line. Keep the label only when the next line proves its
  // own amount by exact count × unit-price arithmetic.
  if(/^\d$/.test(line)&&pending){
   const next=splitPrice(lines[lineIndex+1]||''),nextRate=next?.body.match(ratePattern);
   if(nextRate&&Math.round(num(nextRate[1])*num(nextRate[3])*100)===Math.round(Number(next.amount)*100))continue;
  }
  if(orphanPrice&&lineIndex>orphanPrice.lineIndex+1)orphanPrice=null;
  // Some tills print product-like loyalty labels followed by points and an
  // OCR-damaged subtotal. End purchases only for a real points footer: a
  // heading, several points lines, and a nearby printed total. A single
  // points offer between purchases must not truncate the basket.
  if(rows.length&&/^bonus\s+points\b/i.test(line)){
   const tail=lines.slice(lineIndex,Math.min(lines.length,lineIndex+16));
   if(tail.filter(entry=>/\b\d+\s*(?:pts|points)\b/i.test(entry)).length>=3&&tail.some(entry=>/^(?:sub[\s-]*total|grand\s*total|total)\b/i.test(entry.replace(/^[*\s]+/,''))))break;
  }
  // A tilted OCR box can merge a damaged "Offers" label with the product
  // beside it. Keep only the visible product suffix when a separate item
  // code and a following count × price line support a real purchase.
  const mergedOffer=line.match(/^\S*fers\s+(.+?)\s+H?MRJ\s+\d+\s*Pts\s*$/i);
  const nextCode=lines[lineIndex+1]||'',nextRate=lines[lineIndex+2]||'';
  const nextPrice=splitPrice(nextRate),supportedRate=nextPrice?.body.match(ratePattern);
  if(mergedOffer&&/^\(?\d{1,3}\)?\d{7,14}$/.test(nextCode)&&supportedRate&&Math.abs(num(supportedRate[1])*Number(amount(supportedRate[3]))-Number(nextPrice.amount))<=.03){
   const label=mergedOffer[1],draft=quantity(label);
   if(validName(draft.name)){finishRate(undefined,false);pending=label;pendingDraft={...draft,raw:line};last=null;beforeDiscount=null;continue;}
  }
  if(pendingDraft&&/^\(?\d{1,3}\)?\d{7,14}$/.test(line)&&splitPrice(lines[lineIndex+1]||'')?.body.match(ratePattern)){pendingDraft.raw+='\n'+line;continue;}
  // OCR can put the next product on the same physical line as its department.
  const inlineDepartment=line.match(/^(\d{1,2}\s*[-–]\s*[A-Z]{4,12})\s+(.+)$/i);
  if(inlineDepartment&&printedDepartment(inlineDepartment[1])&&splitPrice(inlineDepartment[2])){
   department=printedDepartment(inlineDepartment[1]);line=inlineDepartment[2];
  }
  const nextDepartment=printedDepartment(line);
  if(nextDepartment){finishRate(undefined,false);department=nextDepartment;pending=null;pendingDraft=null;last=null;beforeDiscount=null;continue;}
  // Some bottle tills print the product, SKU/size/deposit, then a count and
  // price including the refundable deposit. Require exact printed arithmetic
  // before joining these three lines; the deposit is already in the item total.
  const bottle=line.match(/^(\d{4,14})\s+0?(\d{3,5})\s*ML\s+DEP\s*\.?\s*(\d{1,2})\s*ea\.?$/i);
  const bottleTotal=(lines[lineIndex+1]||'').match(/^\((\d{1,3})\s*@\s*\$?(\d+[.,]\d{2})\)\s+\$?(\d+[.,]\d{2})$/);
  if(pending&&bottle&&bottleTotal){
   const count=Number(bottleTotal[1]),unitPrice=num(bottleTotal[2]),deposit=Number('0.'+bottle[3].padStart(2,'0')),printed=num(bottleTotal[3]);
   if(count>0&&Math.abs(count*(unitPrice+deposit)-printed)<.005){
    const row={...quantity(pending),amount:amount(bottleTotal[3]),raw:pending+'\n'+line+'\n'+lines[lineIndex+1],itemNumber:bottle[1],qty:count*Number(bottle[2]),unit:'ml',packSize:Number(bottle[2]),packUnit:'ml',packCount:count,quantityKnown:true,quantityDetail:count+' bottles × '+bottle[2]+' ml',unitPrice:amount(bottleTotal[2]),rateQuantity:count,includedDeposit:rounded(count*deposit)};
    if(validName(row.name)){add(row);last=row;pending=null;pendingDraft=null;beforeDiscount=null;consumed.add(lineIndex+1);continue;}
   }
  }
  // Bilingual tills often repeat the preceding product in a second script.
  // Only bind an adjacent unpriced translation when the previous raw line is
  // the just-finished purchase and the next line begins another Latin label.
  // A Chinese-only product followed by a separate price stays available.
  if(last&&/[\u3400-\u9fff]/u.test(line)&&!splitPrice(line)&&last.raw.split('\n').at(-1).trim()===lines[lineIndex-1]&&/[A-Za-z]{2}/.test(lines[lineIndex+1]||'')&&!(splitPrice(lines[lineIndex+1]||'')?.body==='')){last.raw+='\n'+line;continue;}
  // Standalone tax codes are columns, not labels; retain the pending item.
  if(/^(?:H?MRJ|RQ|HQ)$/i.test(line))continue;
  if(rows.length&&/^TOTL\s*\[\d+\]\s*Articles?\b/i.test(line))break;
  if(rows.length&&/^(?:sub[\s-]*total|sous[\s-]*total|grand\s*total|total)\s*$/i.test(line.replace(/^[*\s]+/,'')))break;
  if(/^final\s+sale\b/i.test(line)){finishRate(undefined,false);pending=null;pendingDraft=null;last=null;beforeDiscount=null;continue;}
  if(/^Pes\S{1,3}\s+[mn]anuelle$/i.test(line))continue;
  const weighedRate=line.match(/^(\d+[.,]{1,2}\d{1,3})\s*(kg|g|lb)\s*[@x×]\s*(\d+[.,]\d{2})(?:\s*[(6t€/]\s*\/?\s*(?:kg|g|lb))?\s*$/i);
  if(weighedRate&&last){
   const count=num(weighedRate[1].replace(/[.,]{2}/,'.')),rate=num(weighedRate[3]),total=last.amount;
   if(Number.isFinite(count)&&Math.abs(count*rate-Number(total))<=.03){applyRate(last,[null,String(count),weighedRate[2],weighedRate[3]]);last.raw+='\n'+line;continue;}
   const repaired=reconciledWeighedRate(weighedRate[3],count,total);
   if(repaired){applyRate(last,[null,String(count),weighedRate[2],repaired]);last.raw+='\n'+line;last.rateCorrection={read:weighedRate[3],reconciled:repaired};last.warning='The OCR unit price was reconciled with the printed weight and item amount. Check the photo before selecting it.';continue;}
   last.warning='The printed weight × unit price does not match this product amount. Enter the stock weight from the photo before selecting it.';last.unmatchedQuantity=line;continue;
  }
  if(rows.length&&/^(?:sub[\s-]*total|sous[\s-]*total|grand\s*total|total)\b/i.test(line.replace(/^[*\s]+/,''))&&splitPrice(line))break;
  // A refundable till deposit contributes to the bill but is not stock.
  if(separateDeposit(line)){finishRate(undefined,false);pending=null;pendingDraft=null;last=null;beforeDiscount=null;continue;}
  if(/^(?:bottle\s+)?deposit\s+\d{1,3}$/i.test(line)){
   const next=splitPrice(lines[lineIndex+1]||''),rate=next?.body.match(ratePattern);
   if(rate&&Math.abs(num(rate[1])*num(rate[3])-Number(next.amount))<=.03)consumed.add(lineIndex+1);
   finishRate(undefined,false);pending=null;pendingDraft=null;last=null;beforeDiscount=null;continue;
  }
  const discount=discountPrice(line),positive=discount&&line.replace(/\s*-\s*[$₹£€]?\s*\d+[.,]\d{2}(?:\s*[A-Z*]{1,3})?\s*$/i,'').match(ratePattern);
  // A coupon may be printed between a product and its count/rate. Hold a
  // candidate only across explicit discount metadata, then compare both nearby
  // product totals before assigning stock. Matching both is ambiguous.
  if(discount&&!positive){finishRate(undefined,false);beforeDiscount=bareDiscount.test(line)||/^(?:discount|savings|coupon)\b/i.test(line)?(last&&!last.unitPrice?last:beforeDiscount):null;pending=null;pendingDraft=null;last=null;continue;}
  if(noise.test(line.replace(/^[*\s]+/,''))||/^\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}\s+\$?0[.,]00$/i.test(line)||/^(?:how\s+did\s+we\s+do\b|complete\s+our\s+.*\bsurvey\b|survey\.[\w.-]+|rules\s+and\s+regulations\b|see\s+contest\s+rules\b|\d+\s+of\s+\d+\s+[$₹£€]?\s*\d{2,})/i.test(line)||/^activated$/i.test(line)||/^(?:shop\s+card|remaining\s+balance|acct\b|purchase\b|\d+\s*pts\b|\d+\s+for\b|in[-\s]*st[a-z]{2,4}\s+offers\b.*\b\d+\s*pts\b)/i.test(line)||/\b(?:stamp\s+earn|bonus\s+points|you\s+price\s+matched\s*&\s*saved)\b/i.test(line)||/^[-=*_\s]+$/.test(line)||/^-\s*[$₹£€]?\s*\d/.test(line)){finishRate(undefined,false);pending=null;pendingDraft=null;last=null;beforeDiscount=null;continue;}
  const inlineRate=line.match(/^(.+?)\s+(\d{1,3})\s*[@x×]\s*(\d+[.,]\d{2})\s+(?:E?U[RF]|[≥:]UR)(?:\s+\(?[TD]\)?)?$/i);
  if(inlineRate&&validName(quantity(inlineRate[1]).name)){
   const row={...quantity(inlineRate[1]),amount:amount(inlineRate[3]),raw:line};applyRate(row,[null,inlineRate[2],undefined,inlineRate[3]]);add(row);last=row;pending=null;pendingDraft=null;beforeDiscount=null;continue;
  }
  if(positive){if(last){applyRate(last,positive);last.raw+='\n'+line;}continue;}
  const priced=splitPrice(line),body=priced?.body??line;
  // Some tills print a multi-buy as "3 @3/$6.97". The 6.97 is the
  // combined price for three units, not the unit price. Bind it only when a
  // pending product, printed count and separate line total all agree.
  const multiBuy=priced&&pending&&body.match(/^(?:(\d{4,14})\s+)?(\d{1,3})\s*[@x×]\s*(\d{1,3})\s*\/\s*\$?(\d+[.,]\d{2})(?:\s+[A-Z]{1,2})?$/i);
  if(multiBuy&&Number(multiBuy[2])===Number(multiBuy[3])&&Math.abs(Number(priced.amount)-num(multiBuy[4]))<.005){
   const row={...(pendingDraft||quantity(pending)),amount:priced.amount,raw:pending+'\n'+line,qty:Number(multiBuy[2]),unit:'pcs',packCount:Number(multiBuy[2]),quantityKnown:true,quantityDetail:multiBuy[2]+' items for '+priced.amount,...(multiBuy[1]?{itemNumber:multiBuy[1]}:{})};
   if(validName(row.name)){add(row);last=row;pending=null;pendingDraft=null;beforeDiscount=null;continue;}
  }
  // OCR can list a far-right price before the adjacent percentage and name
  // on a tilted receipt. Join only this exact three-line printed sequence.
  if(priced&&!body&&!pending&&/^\d{1,2}(?:[.,]\d{1,2})?\s*%$/.test(lines[lineIndex+1]||'')&&lineIndex+2<lines.length){
   const qualifier=lines[lineIndex+1],next=lines[lineIndex+2];
   if(!splitPrice(next)&&validName(quantity(next).name)){
    const row={...quantity(qualifier+' '+next),amount:priced.amount,raw:qualifier+'\n'+line+'\n'+next};
    add(row);last=row;pending=null;pendingDraft=null;consumed.add(lineIndex+1);consumed.add(lineIndex+2);continue;
   }
  }
  // Some column readers emit a product's far-right total immediately before
  // its label. Bind it forward only when the following count × unit price
  // reconciles exactly; otherwise keep the OCR text for review.
  if(priced&&!body&&!pending&&lineIndex+2<lines.length){
   const label=lines[lineIndex+1],nextRate=lines[lineIndex+2]?.match(ratePattern),draft=quantity(label);
   if(nextRate&&!splitPrice(label)&&validName(draft.name)&&Math.abs(num(nextRate[1])*num(nextRate[3])-Number(priced.amount))<.005){
    const row={...draft,amount:priced.amount,raw:line+'\n'+label+'\n'+lines[lineIndex+2]};applyRate(row,nextRate);add(row);last=row;consumed.add(lineIndex+1);consumed.add(lineIndex+2);continue;
   }
  }
  // A till can print the amount beside a percentage and wrap the product
  // name onto the next line. Bind that amount only to the adjacent name.
  if(priced&&!body&&pending&&/^\d{1,2}(?:[.,]\d{1,2})?\s*%$/.test(pending)){
   orphanPrice={amount:priced.amount,qualifier:pending,priceLine:line,lineIndex};continue;
  }
  if(orphanPrice){
   const held=orphanPrice;orphanPrice=null;
   if(!priced&&validName(quantity(body).name)){
    const row={...quantity(held.qualifier+' '+body),amount:held.amount,raw:held.qualifier+'\n'+held.priceLine+'\n'+line};
    add(row);last=row;pending=null;pendingDraft=null;continue;
   }
   pending=null;pendingDraft=null;
  }
  // A count @ unit price is a continuation, even when its last decimal looks
  // like a line total. Test the full line before removing the trailing price.
  const rate=body.match(ratePattern)||(!priced?.body?.match(ratePattern)?line.match(ratePattern):null);
  if(rate){
   // Some tills print a priced count/rate immediately before its product
   // label. Bind it forward only when its arithmetic reconciles and the
   // preceding purchase has a different amount.
   const nextLine=lines[lineIndex+1]||'',nextDraft=quantity(nextLine),rateTotal=num(rate[1])*num(rate[3]);
   if(priced&&!rate[2]&&!pending&&/^\d{3,14}\s+[A-Z]/i.test(nextLine)&&Math.abs(Number(priced.amount)-rateTotal)<=.03&&(!last||Math.abs(Number(last.amount)-rateTotal)>.03)&&!splitPrice(nextLine)&&validName(nextDraft.name)){
    const nextRow={...nextDraft,amount:priced.amount,raw:line+'\n'+nextLine};applyRate(nextRow,rate);add(nextRow);last=nextRow;pending=null;pendingDraft=null;beforeDiscount=null;consumed.add(lineIndex+1);continue;
   }
   if(beforeDiscount&&!pending&&!body.match(ratePattern)){finishRate(undefined,false);deferredRate={rate,line,previous:beforeDiscount,afterDiscount:true};beforeDiscount=null;continue;}
   beforeDiscount=null;
   // A separate discount can follow a damaged count/rate line. Retain the
   // adjacent printed count when the item total proves a one-digit OCR error
   // in the unit price; keep that read price and require user review.
   const printedCount=num(rate[1]),printedUnitCents=Math.round(num(rate[3])*100),
    impliedUnitCents=last?.amount&&printedCount>1?Number(last.amount)*100/printedCount:NaN;
   const rateDigits=String(printedUnitCents).padStart(3,'0'),impliedDigits=String(Math.round(impliedUnitCents)).padStart(3,'0');
   const oneDigitError=Number.isInteger(impliedUnitCents)&&rateDigits.length===impliedDigits.length&&
    [...rateDigits].filter((digit,index)=>digit!==impliedDigits[index]).length===1;
   if(!pending&&!body.match(ratePattern)&&last?.raw.split('\n').at(-1).trim()===lines[lineIndex-1]&&
    discountPrice(nextLine)&&oneDigitError&&Math.abs(printedCount*printedUnitCents-Number(last.amount)*100)<=Number(last.amount)*2){
    applyRate(last,rate);last.raw+='\n'+line;
    last.warning='The printed count is attached, but the OCR unit price does not match this product amount. Check the photo before selecting it.';
    continue;
   }
   if(!pending&&!body.match(ratePattern)&&(!last?.amount||Math.abs(Number(last.amount)-num(rate[1])*Number(amount(rate[3])))>.03)){finishRate(undefined,false);deferredRate={rate,line,previous:last};continue;}
   const repeated=!pending&&last?.unitPrice&&priced&&body.match(ratePattern),row=pending?(pendingDraft||{...quantity(pending),raw:pending}):repeated?{...quantity(last.name),itemNumber:last.itemNumber,raw:last.name}:last;
   if(row){applyRate(row,rate);if(priced&&body.match(ratePattern))row.amount=priced.amount;row.raw+='\n'+line;if(pending){if(row.amount&&validName(row.name))add(row);else {pending=row.raw;pendingDraft=row;}}last=row;}
   if(repeated&&row?.amount&&validName(row.name))add(row);
   if(row?.amount){pending=null;pendingDraft=null;}continue;
  }
  beforeDiscount=null;
  if(!priced&&pending&&new RegExp('^'+measurement.source+'$','i').test(line)){pending+=' '+line;continue;}
  // Some tills wrap the pack size below an already priced label. It is stock
  // evidence only while that product remains current and has no package size.
  const packContinuation=!priced&&!pending&&line.match(new RegExp('^'+measurement.source+'$','i'));
  if(packContinuation&&last){
   if(last.packSize||!['pcs','packet'].includes(last.unit)){last.warning='A separate package size conflicts with an existing measurement. Stock was left unchanged; check the photo.';last.unmatchedQuantity=line;}
   else {const size=num(packContinuation[1]),unit=packContinuation[2].toLowerCase(),count=last.packCount||1;Object.assign(last,measured(size*count,unit),{packSize:size,packUnit:unit,quantityKnown:true,quantityDetail:count+' packs × '+size+' '+unit});last.raw+='\n'+line;}
   continue;
  }
  if(!priced&&/^\d{1,2}(?:[.,]\d{1,2})?\s*%$/.test(line)){pending=line;pendingDraft=null;continue;}
  const q=quantity(body);
  if(priced&&pending&&!pendingDraft&&!q.itemNumber&&(/^\d{4,14}\s/.test(pending)||/^\d{1,2}(?:[.,]\d{1,2})?\s*%$/.test(pending)||!validName(q.name))){const joined=quantity(pending+' '+body);if(validName(joined.name)){const row={...joined,amount:priced.amount,raw:pending+'\n'+line};add(row);last=row;pending=null;continue;}}
  if(priced&&!body&&pending){const row={...(pendingDraft||quantity(pending)),amount:priced.amount,raw:pending+'\n'+line};if(validName(row.name)){add(row);last=row;}pending=null;continue;}
  if(priced){
   const heldPending=pending;
   const joined=rows.length>0&&heldPending&&heldPending.split('\n').length===1&&!/[＊*]/.test(heldPending)&&!pendingDraft&&validName(quantity(heldPending).name)&&validName(q.name)?quantity(heldPending+' '+body):null;
   pending=null;pendingDraft=null;
   if(joined&&validName(joined.name)){const row={...joined,amount:priced.amount,raw:heldPending+'\n'+originalLine};add(row);last=row;}
   else if(validName(q.name)){const row={...q,amount:priced.amount,raw:originalLine};add(row);last=row;}else last=null;
  }
  else {
   const heading=/^\d{2}\s*-\s*[A-Z]|\bBOB\s+COUNT\b|\*{4,}/i.test(line);
   const qualifier=/^(?:sweet|salted|unsalted|spicy|plain|original|whole|split|ground|sliced|chopped)$/i.test(line);
   const joined=(rows.length>0||qualifier)&&!heading&&pending&&!/[＊*]/.test(pending)&&!pendingDraft&&pending.split('\n').length<2&&validName(quantity(pending).name)&&(qualifier||validName(q.name))?quantity(pending+' '+line):null;
   pendingDraft=null;pending=heading?null:joined&&validName(joined.name)?pending+'\n'+line:validName(q.name)?line:null;last=pending?null:last;
  }
  if(rows.length>=500)break;
 }
 finishRate();
 return rows.map(row=>{
  const suspectPack=!row.packSize&&/(?:^|\s)(?:[IlS]\d{0,3}(?:KG|G|ML)|\d{1,3}X\d{1,4}[6@])\b/i.test(row.name);
  const implausible=(row.unit==='L'&&row.qty>100)||(row.unit==='kg'&&row.qty>250)||(row.unit==='ml'&&row.qty>100000)||(row.unit==='g'&&row.qty>250000);
  return {...row,...(suspectPack?{quantityKnown:false,warning:'The package size may have been misread. Check the photo and enter the stock quantity before selecting this product.'}:{}),...(row.unitPrice!==undefined&&Math.abs(Number(row.amount)-row.rateQuantity*Number(row.unitPrice)-Number(row.includedDeposit||0))>.03?{warning:'The quantity × unit price does not match this product amount. Check the photo before selecting it.'}:{}),...(implausible?{qty:1,unit:'pcs',quantityKnown:false,warning:'The package size looks implausibly large. Enter the stock quantity from the photo before selecting this product.'}:{})};
 });
}
export function pantryReceipt(text){return parseReceipt(text).slice(0,500).map(row=>({...row,pick:false,confidence:'review'}));}
export function expenseReceipt(text){return parseReceipt(text).map(({name,amount,raw})=>({name,amount,raw}));}
export function auditReceipt(text,items=pantryReceipt(text)){
 const lines=String(text).split(/\r?\n/),footer={},warnings=[];let discounts=0,charges=0,purchaseDone=false;
 for(const [index,raw] of lines.entries()){const line=raw.replace(/^[*\s]+/,''),p=splitPrice(line),discount=discountPrice(line);if(!purchaseDone){const deposit=separateDeposit(line);if(deposit)charges+=Number(deposit);else if(/^(?:bottle\s+)?deposit\s+\d{1,3}$/i.test(line)){const next=splitPrice(lines[index+1]||''),rate=next?.body.match(ratePattern);if(rate&&Math.abs(num(rate[1])*num(rate[3])-Number(next.amount))<=.03)charges+=Number(next.amount);}}if(!purchaseDone&&/^(?:your\s+discount|instant\s+savings)\b/i.test(line)&&p&&!discount)discounts+=Number(p.amount);else if(discount&&!purchaseDone&&!/^(?:cash|change|visa|credit|debit|payment|balance|tax|remaining)\b/i.test(line))discounts+=Number(discount);const totalHeading=/^\s*(?:sub[\s-]*total|sous[\s-]*total|grand\s*total|total)\b/i.test(line)||/^\s*TOTL\s*\[\d+\]\s*Articles?\b/i.test(line);if(p&&totalHeading&&!/^total\s+(?:discount|tax|vat|tva)\b/i.test(line)){const isSubtotal=/^(?:sub|sous)/i.test(line),amounts=line.match(/\d+[.,]\d{2}/g)||[];if(!isSubtotal||!footer.total&&amounts.length===1)footer[isSubtotal?'subtotal':'total']=p.amount;purchaseDone=true;}const count=printedReceiptCount(line);if(count){footer.productCount=Number(count.value);if(count.headingCorrected)footer.productCountEvidence=count;}const partial=line.match(/\bbob\s+count\s*[:=]?\s*(\d{1,4})\b/i);if(partial)footer.partialBasketCount=Number(partial[1]);}
 if(footer.productCount===undefined){for(let i=0;i<lines.length;i++)if(/^\s*number\s+of\s+items\s*$/i.test(lines[i])){const neighbor=[lines[i-1],lines[i+1]].find(value=>/^\s*\d{1,4}\s*$/.test(value||''));if(neighbor){footer.productCount=Number(neighbor.trim());footer.productCountEvidence={printed:lines[i],value:neighbor.trim(),layout:'adjacent'};break;}}}
 if(!footer.subtotal&&!footer.total)warnings.push('No printed total was read. Compare the product list with the whole photo.');
 const itemSum=rounded(items.reduce((n,r)=>n+Number(r.amount||0),0)),packCount=items.reduce((n,r)=>n+(r.packCount||1),0),target=footer.subtotal||footer.total;
 const netSum=rounded(itemSum+charges-discounts);
 if(target&&Math.abs(Number(target)-netSum)>.02)warnings.push('The extracted product amounts after discounts do not match the printed '+(footer.subtotal?'subtotal':'total')+'. Check for missing lines, discounts or tax.');
 if(footer.productCount&&packCount!==footer.productCount)warnings.push('The receipt prints '+footer.productCount+' purchased units; '+packCount+' units were read across '+items.length+' product lines. Review missing or repeated lines.');
 if(items.some(item=>item.warning))warnings.push('Some products need review. Check the flagged items against the photo before adding them.');
 return {itemSum:itemSum.toFixed(2),charges:charges.toFixed(2),discounts:discounts.toFixed(2),netSum:netSum.toFixed(2),packCount,...footer,warnings};
}
