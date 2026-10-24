// Recognize a complete printed count heading. Never infer a count from stock,
// prices, basket subsets or an incomplete line.
function oneEdit(a,b){
 if(Math.abs(a.length-b.length)>1)return false;
 let i=0,j=0,edits=0;
 while(i<a.length&&j<b.length){
  if(a[i]===b[j]){i++;j++;continue;}
  if(++edits>1)return false;
  if(a.length>=b.length)i++;
  if(b.length>=a.length)j++;
 }
 return edits+(i<a.length||j<b.length?1:0)<=1;
}
export function printedReceiptCount(line){
 if(typeof line!=='string'||line.length>160)return null;
 let m=line.trim().match(/^([a-z]{5,7})\s+of\s+(products|items)\s*[:=]?\s*(\d{1,4})\s*$/i);
 if(m&&oneEdit(m[1].toLowerCase(),'number'))return{label:'Number of '+m[2].toLowerCase(),value:m[3],printed:line,headingCorrected:m[1].toLowerCase()!=='number'};
 m=line.trim().match(/^(items?\s+(?:sold|count))\s*[:=]?\s*(\d{1,4})\s*$/i);
 return m?{label:m[1],value:m[2],printed:line,headingCorrected:false}:null;
}
