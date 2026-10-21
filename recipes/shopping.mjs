import {parseAmount} from './quantities.mjs';
const amount='(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*[⅛¼⅓⅜½⅝⅔¾⅞]|\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?|\\.\\d+|[⅛¼⅓⅜½⅝⅔¾⅞])';
const units='(?:kg|g|ml|l|pcs|pc|pieces?|packets?|bunch(?:es)?|muthi|tsp|tbsp|cups?)';
const prefix=new RegExp('^('+amount+')\\s*('+units+')?\\s+(.+)$','i');
const suffix=new RegExp('^(.+?)\\s+('+amount+')\\s*('+units+')?$','i');
const normalize=unit=>({l:'L',pc:'pcs',piece:'pcs',pieces:'pcs',packets:'packet',bunches:'bunch',cups:'cup'}[unit?.toLowerCase()]||unit?.toLowerCase()||'pcs');
export function shoppingEntry(text,explicit='',unit='pcs'){
 let name=String(text).trim(),qty=null;if(!name)throw Error('Add an item name.');
 const read=value=>{let parsed;try{parsed=parseAmount(String(value).replace(/^\./,'0.'));}catch{}if(!Number.isFinite(parsed)||parsed<=0)throw Error('Use a quantity such as 2, ½ or 1/3, or leave it blank.');return parsed;};
 if(String(explicit).trim())qty=read(explicit);
 else {const first=name.match(prefix),last=name.match(suffix);if(first){qty=read(first[1]);unit=normalize(first[2]);name=first[3].trim();}else if(last){name=last[1].trim();qty=read(last[2]);unit=normalize(last[3]);}}
 if(!name||name.length>160)throw Error('Use an item name up to 160 characters.');
 if(!new Set(['pcs','g','kg','ml','L','packet','bunch','muthi','tsp','tbsp','cup']).has(unit))throw Error('Choose a measuring unit.');
 return {name,qty,unit};
}
