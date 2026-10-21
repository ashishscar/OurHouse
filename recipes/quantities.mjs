const fractions=[['⅛',1/8],['¼',1/4],['⅓',1/3],['⅜',3/8],['½',1/2],['⅝',5/8],['⅔',2/3],['¾',3/4],['⅞',7/8]];
const fractional=new Set(['cup','tsp','tbsp','pcs','packet','bunch','muthi']);
const matchFraction=value=>fractions.find(([,n])=>Math.abs(value-n)<0.000051);
const smallRound=(value,places)=>Number(value.toFixed(places))||Number(value.toPrecision(2));

// Apply only to a newly selected suggestion, never to existing saved recipes.
export function tidyIngredient(ingredient){
 let {qty,unit}=ingredient;
 if(qty===null||qty===undefined)return {...ingredient,qty:null};
 if(typeof qty!=='number'||!Number.isFinite(qty)||qty<0)throw Error('Check the ingredient amount.');
 if(qty===0)return {...ingredient};
 if((unit==='kg'||unit==='L')&&qty<1){qty*=1000;unit=unit==='kg'?'g':'ml';}
 if(unit==='g'||unit==='ml')qty=qty>=10?Math.round(qty):smallRound(qty,qty>=1?1:2);
 else if(fractional.has(unit)){
  const whole=Math.floor(qty),fraction=matchFraction(qty-whole);
  qty=fraction?whole+fraction[1]:smallRound(qty,2);
 }else qty=smallRound(qty,2);
 return {...ingredient,qty,unit};
}
export function formatAmount(qty,unit){
 if(qty===null||qty===undefined)return '';
 if(fractional.has(unit)){
  const whole=Math.floor(qty),fraction=matchFraction(qty-whole);
  if(fraction)return (whole?whole+' ':'')+fraction[0];
 }
 // Preserve manually entered/saved precision. Suggestions are tidied separately.
 return String(qty);
}
export function parseAmount(text){
 const value=String(text).trim();if(!value)return null;
 const normalized=value.replace(/([0-9])([⅛¼⅓⅜½⅝⅔¾⅞])/g,'$1 $2').replace(/[⅛¼⅓⅜½⅝⅔¾⅞]/g,s=>String(fractions.find(([glyph])=>glyph===s)[1]));
 let qty;
 if(/^\d+(?:\.\d+)?$/.test(normalized))qty=Number(normalized);
 else if(/^\d+\s+0\.\d+$/.test(normalized))qty=normalized.split(/\s+/).reduce((a,n)=>a+Number(n),0);
 else {const parts=normalized.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);if(parts&&Number(parts[3])>0)qty=Number(parts[1]||0)+Number(parts[2])/Number(parts[3]);}
 if(!Number.isFinite(qty)||qty<0||qty>1e9)throw Error('Use an ingredient amount such as 1, ½, 1/3 or 0.5.');
 return qty;
}
export function readAmount(input){
 // Displaying ⅓ must not change an older stored 0.3333 when its row is untouched.
 if(input.dataset.initialAmount===input.value&&input.dataset.originalAmount!==undefined)return JSON.parse(input.dataset.originalAmount);
 return parseAmount(input.value);
}
