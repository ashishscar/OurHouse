import {parseReceiptFields} from './parser.mjs';
import {identifyReceiptItems} from './identity.mjs';

// Compact, trainable receipt protocol. A product row is
// [printed label, printed amount, printed quantity line, short name, p|h|u].
// d/s/t/x/c are discounts, subtotal, total, tax and whole-receipt item count.
// Never infer stock from a monetary field or infer a missing measurement.
export const RECEIPT_ROW_KINDS=Object.freeze(['p','h','u','d','s','t','x','c']);
export function validateReceiptRows(value){
 if(typeof value==='string'){
  if(value.length>40000)throw Error('Invalid receipt rows');
  value=JSON.parse(value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
 }
 if(!value||!Array.isArray(value.rows)||value.rows.length>180)throw Error('Invalid receipt rows');
 const rows=value.rows.map(row=>{
  if(!Array.isArray(row)||row.length!==5||row.some(v=>typeof v!=='string')||!RECEIPT_ROW_KINDS.includes(row[4]))throw Error('Invalid receipt row');
  const [label,price,rate,name,kind]=row;
  if(!label.trim()||label.length>160||rate.length>160||name.length>80||/[\u0000-\u001f<>]/.test(label+rate+name)||!(kind==='c'?/^\d{1,4}$/:/^\d{1,7}\.\d{2}$/).test(price))throw Error('Invalid receipt row fields');
  if(['p','h','u'].includes(kind))parseReceiptFields({label,amount:price,quantityLine:rate});
  else if(rate||name)throw Error('Receipt metadata cannot name a product');
  return [label.trim(),price,rate.trim(),name.trim(),kind];
 });
 return {rows};
}
export function receiptRowsToDraft(value){
 const {rows}=validateReceiptRows(value),items=[],metadata=[];
 for(const [label,price,rate,name,kind]of rows){
  if(!['p','h','u'].includes(kind)){metadata.push({label,amount:price,kind});continue;}
  const source=label.trim()+' $'+price+(rate?'\n'+rate:''),row=parseReceiptFields({label,amount:price,quantityLine:rate});
  const section=kind==='p'?'pantry':kind==='h'?'household':'unknown';
  items.push(...identifyReceiptItems([row],[{source:source.split('\n')[0],name,section}]).map(row=>({...row,pick:false,confidence:'review'})));
 }
 return {items,metadata};
}
