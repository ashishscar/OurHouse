import {validateReceiptRows} from './structured.mjs';
import {parseReceiptFields} from './parser.mjs';

const product=row=>['p','h','u'].includes(row[4]);
const norm=text=>text.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
function similarity(a,b){
 a=norm(a);b=norm(b);if(a===b)return 1;
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const current=[i];for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));previous=current;}
 return 1-previous[b.length]/Math.max(a.length,b.length,1);
}
// Order-constrained alignment preserves repeated purchases; equal prices alone
// never identify a product. Keep the threshold fixed before candidate evaluation.
export function alignReceiptRows(expected,predicted){
 const n=expected.length,m=predicted.length,score=Array.from({length:n+1},()=>Array(m+1).fill(0)),direction=Array.from({length:n+1},()=>Array(m+1).fill(''));
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
  const same=similarity(expected[i-1][0],predicted[j-1][0]);
  let best=score[i-1][j],move='up';if(score[i][j-1]>best){best=score[i][j-1];move='left';}
  const match=score[i-1][j-1]+2+same+(expected[i-1][1]===predicted[j-1][1]?.1:0);
  if(same>=.6&&match>best){best=match;move='match';}score[i][j]=best;direction[i][j]=move;
 }
 const pairs=[];let i=n,j=m;
 while(i&&j){const move=direction[i][j];if(move==='match'){pairs.push([--i,--j]);}else if(move==='up')i--;else j--;}
 return pairs.reverse();
}
function stock(row){const item=parseReceiptFields({label:row[0],amount:row[1],quantityLine:row[2]});return {qty:item.qty,unit:item.unit};}
const cents=value=>Math.round(Number(value)*100);
function subtotal(rows){const s=rows.filter(row=>row[4]==='s');return s.length===1?cents(s[0][1]):null;}
function net(rows){return rows.reduce((sum,row)=>sum+(product(row)?cents(row[1]):row[4]==='d'?-cents(row[1]):0),0);}
function metadata(rows){return rows.filter(row=>!product(row)).map(row=>row.map((value,index)=>index===1?value:norm(value)));}
function wholeReceipt(value){
 if(typeof value==='string'){if(value.length>200000)throw Error('Receipt too large');value=JSON.parse(value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
 if(!value||!Array.isArray(value.rows)||value.rows.length>1000)throw Error('Invalid whole receipt');
 const rows=[];for(let start=0;start<value.rows.length;start+=180)rows.push(...validateReceiptRows({rows:value.rows.slice(start,start+180)}).rows);
 return rows;
}
export function evaluateReceipt(expectedValue,predictedValue){
 const expected=wholeReceipt(expectedValue);let predicted=[],valid=true;
 try{predicted=wholeReceipt(predictedValue);}catch{valid=false;}
 const e=expected.filter(product),p=predicted.filter(product),pairs=alignReceiptRows(e,p);
 const metrics={valid,expected:e.length,predicted:p.length,matched:pairs.length,missing:e.length-pairs.length,extra:p.length-pairs.length,
  labelExact:0,amountExact:0,stockExact:0,nameExact:0,categoryExact:0,allFieldsExact:0};
 const errors=[];
 for(const[i,j]of pairs){const a=e[i],b=p[j],aStock=stock(a),bStock=stock(b),checks={labelExact:norm(a[0])===norm(b[0]),amountExact:a[1]===b[1],
  stockExact:aStock.unit===bStock.unit&&Math.abs(aStock.qty-bStock.qty)<.0001,nameExact:norm(a[3]||a[0])===norm(b[3]||b[0]),categoryExact:a[4]===b[4]};
  for(const[key,value]of Object.entries(checks))metrics[key]+=Number(value);
  if(Object.values(checks).every(Boolean))metrics.allFieldsExact++;else errors.push({expectedIndex:i,predictedIndex:j,checks});
 }
 const target=subtotal(expected),metadataExact=valid&&JSON.stringify(metadata(expected))===JSON.stringify(metadata(predicted));
 return {...metrics,precision:p.length?pairs.length/p.length:0,recall:e.length?pairs.length/e.length:1,
  referenceNet:net(expected),predictedNet:valid?net(predicted):null,printedSubtotal:target,
  reconciled:valid&&target!==null&&net(predicted)===target,metadataExact,
  exactExtraction:valid&&e.length===p.length&&metrics.allFieldsExact===e.length&&metadataExact&&net(predicted)===net(expected),errors};
}

// Diagnostic only: isolate malformed rows without repairing them or allowing a
// partially valid receipt to pass the strict result above. Reports remain private.
export function diagnoseReceiptRows(expectedValue,predictedValue){
 let value=predictedValue;
 try{
  if(typeof value==='string'){if(value.length>200000)throw Error();value=JSON.parse(value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
  if(!value||!Array.isArray(value.rows)||value.rows.length>1000)throw Error();
 }catch{return {jsonValid:false,rejectedRowIndices:[],validRowsOnly:null};}
 const accepted=[],rejectedRowIndices=[];
 value.rows.forEach((row,index)=>{try{accepted.push(...validateReceiptRows({rows:[row]}).rows);}catch{rejectedRowIndices.push(index);}});
 return {jsonValid:true,totalRows:value.rows.length,rejectedRowIndices,validRowsOnly:evaluateReceipt(expectedValue,{rows:accepted}),
  note:'Rejected rows are omitted only from this diagnostic. The strict receipt result remains authoritative; this is not an accepted extraction.'};
}
