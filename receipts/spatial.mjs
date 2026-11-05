// Assemble quadrilateral OCR boxes into receipt rows without changing literal text.
const pricePattern=/^\s*\*?\s*(?:[-−]\s*)?\$?\s*\d+[.,]\d{2}(?:\s*[-−])?\s*[A-Z*]{0,3}\s*$/i;
const ratePattern=/(\d+(?:[.,]\d{1,3})?)\s*(?:kg|lbs?|g|ml|l|each|pcs?)?\s*@\s*\$?\s*(\d+[.,]\d{2})(?:\s*(?:per\s*(?:1\s*)?(?:kg|lbs?|g|ml|l)|\/(?:kg|lbs?|g|ml|l)|ea\.?))?\s*$/i;
const priorRatePattern=/(\d+(?:[.,]\d{1,3})?)\s*(?:kg|lbs?|g|ml|l|each|pcs?)?\s*@\s*\$?\s*(\d+[.,]\d{2})\s*$/i;
const moneyValue=s=>{const m=String(s).match(/\d+[.,]\d{2}/);return m?Math.round(Number(m[0].replace(',','.'))*100):null};
const median=values=>{const x=[...values].sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
const distance2=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function normBox(index,text,q,score=0.95){
 const left=[(q[0][0]+q[3][0])/2,(q[0][1]+q[3][1])/2],right=[(q[1][0]+q[2][0])/2,(q[1][1]+q[2][1])/2];
 const dx=right[0]-left[0];return {index,text,x:(left[0]+right[0])/2,y:(left[1]+right[1])/2,slope:Math.abs(dx)>1?(right[1]-left[1])/dx:0,h:Math.max(1,(distance2(q[0],q[3])+distance2(q[1],q[2]))/2),width:distance2(left,right),score,money:pricePattern.test(text)};
}
const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width/2,b.x+b.width/2)-Math.max(a.x-a.width/2,b.x-b.width/2));
const rowDistance=(a,b)=>{const anchor=a.width>=b.width?a:b,other=a.width>=b.width?b:a;return Math.abs(other.y-anchor.y-anchor.slope*(other.x-anchor.x))/Math.max(1,(a.h+b.h)/2)};
const label=row=>row.members.slice().sort((a,b)=>a.x-b.x).map(b=>b.text).join(' ');
const projected=(b,xref,slope=b.slope)=>b.y+slope*(xref-b.x);
const validRecord=r=>{
 if(!Array.isArray(r.texts)||!Array.isArray(r.boxes)||!Array.isArray(r.scores)||r.texts.length!==r.boxes.length||r.boxes.length!==r.scores.length||r.texts.length>3000)throw Error('Invalid OCR fields');
 for(let i=0;i<r.texts.length;i++){const q=r.boxes[i];if(typeof r.texts[i]!=='string'||!r.texts[i].trim()||!Number.isFinite(r.scores[i])||!Array.isArray(q)||q.length!==4||q.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('Invalid OCR box');}
};
export function assembleSpatial(record,{threshold=1.5,margin=0.25}={}){
 validRecord(record);if(!(threshold>0)||!Number.isFinite(threshold)||margin<0||!Number.isFinite(margin))throw Error('Invalid spatial thresholds');
 const boxes=record.texts.map((text,i)=>normBox(i,text,record.boxes[i],record.scores[i]));
 const fragments=new Set(boxes.filter(b=>/^\d{1,3}$/.test(b.text.trim())).map(b=>b.index));
 const anchors=boxes.filter(b=>!b.money&&!fragments.has(b.index)&&Math.abs(b.slope)<1),prices=boxes.filter(b=>b.money);
 if(!anchors.length)return {lines:boxes.map(b=>b.text),observations:[],unmatched:prices.map(b=>b.index),ambiguous:[],assignments:[]};
 const xref=median(anchors.map(a=>a.x-a.width/2)),rows=[];
 for(const a of anchors.slice().sort((a,b)=>projected(a,xref)-projected(b,xref))){
  let best=null;
  for(let i=0;i<rows.length;i++){const row=rows[i];if(row.members.some(b=>overlap(a,b)>0.15*Math.min(a.width,b.width)))continue;const d=rowDistance(row.rep,a);if(d<0.65&&(!best||d<best.d))best={i,d};}
  if(best){const row=rows[best.i];row.members.push(a);if(a.width>row.rep.width)row.rep=a;}
  else rows.push({rep:a,members:[a],prices:[]});
 }
 const ignored=[];const kept=[];
 for(const row of rows){if(/^\d{4,14}\/?$/.test(label(row)))ignored.push(...row.members.map(b=>b.index));else kept.push(row);}
 kept.sort((a,b)=>projected(a.rep,xref)-projected(b.rep,xref));
 const coarse=median(anchors.map(a=>a.slope));prices.sort((a,b)=>projected(a,xref,coarse)-projected(b,xref,coarse));
 const n=kept.length,m=prices.length,weights=Array.from({length:n},()=>Array(m).fill(null)),distances=Array.from({length:n},()=>Array(m).fill(null));
 for(let i=0;i<n;i++){
  const row=kept[i],a=row.rep,text=label(row),rate=text.match(ratePattern),preceding=i?label(kept[i-1]):'',prior=preceding.match(priorRatePattern);
  const rateTotal=rate?Math.round(Number(rate[1].replace(',','.'))*moneyValue(rate[2])):null;
  const priorTotal=prior?Math.round(Number(prior[1].replace(',','.'))*moneyValue(prior[2])):null;
  const hasAmount=/\d+[.,]\d{2}\s*[A-Z*]{0,3}$/.test(text)&&!text.includes('@');
  for(let j=0;j<m;j++){
   const price=prices[j],negative=/[-−]/.test(price.text),promotion=/^(?:\d+\s+FOR\b|DISCOUNT\b|SAVINGS?\b|COUPON\b|(?:\d+\s+)?(?:TPD\s*\/|\/\s*\d))/i.test(text.trim());
   if(negative&&!promotion)continue;
   // A sale notice is receipt metadata. A nearby positive amount still
   // belongs to a printed product row, even when the columns are slanted.
   if(!negative&&/^FINAL\s+SALE\b/i.test(text))continue;
   const labelRight=Math.max(...row.members.map(b=>b.x+b.width/2)),priceLeft=price.x-price.width/2;
   const descriptionDecimal=/^\d{3,14}\s+\D/.test(text)&&hasAmount&&!/[$₹£€]/.test(text)&&priceLeft-labelRight>a.h;
   if(hasAmount&&!descriptionDecimal&&!(negative&&promotion))continue;
   const slope=(a.slope+price.slope)/2,d=Math.abs(price.y-a.y-slope*(price.x-a.x))/Math.max(1,(a.h+price.h)/2);
   if(d>(negative&&promotion?3:threshold))continue;
   let w=(negative?4:3)-d,observed=moneyValue(price.text);
   if(!negative&&rateTotal!==null&&observed!==null){if(Math.abs(observed-rateTotal)>3)continue;w+=2;}
   if(!negative&&priorTotal!==null&&observed!==null&&Math.abs(observed-priorTotal)<=3){const previous=kept[i-1].rep,previousD=Math.abs(price.y-previous.y-(previous.slope+price.slope)/2*(price.x-previous.x))/Math.max(1,(previous.h+price.h)/2);if(previousD>threshold)w+=2;}
   weights[i][j]=w;distances[i][j]=d;
  }
 }
 const reward=(Math.min(n,m)+1)*(Math.max(threshold,3)+8);for(let i=0;i<n;i++)for(let j=0;j<m;j++)if(weights[i][j]!==null)weights[i][j]+=reward;
 const forward=Array.from({length:n+1},()=>Array(m+1).fill(0)),backward=Array.from({length:n+1},()=>Array(m+1).fill(0));
 for(let i=0;i<n;i++)for(let j=0;j<m;j++)forward[i+1][j+1]=Math.max(forward[i][j+1],forward[i+1][j],weights[i][j]!==null?forward[i][j]+weights[i][j]:-1);
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)backward[i][j]=Math.max(backward[i+1][j],backward[i][j+1],weights[i][j]!==null?weights[i][j]+backward[i+1][j+1]:-1);
 const best=forward[n][m],path=new Map();let i=n,j=m;
 while(i&&j){const w=weights[i-1][j-1];if(w!==null&&Math.abs(forward[i][j]-(forward[i-1][j-1]+w))<1e-8){path.set(j-1,i-1);i--;j--;}else if(forward[i-1][j]>=forward[i][j-1])i--;else j--;}
 const unmatched=[],ambiguous=[],assignments=[];
 for(let j=0;j<m;j++){
  const p=prices[j];if(!path.has(j)){unmatched.push(p.index);continue;}const i=path.get(j),alternatives=[];
  for(let k=0;k<n;k++)if(k!==i&&weights[k][j]!==null)alternatives.push(forward[k][j]+weights[k][j]+backward[k+1][j+1]);
  for(let k=0;k<=n;k++)alternatives.push(forward[k][j]+backward[k][j+1]);
  const globalMargin=best-Math.max(...alternatives);if(globalMargin<margin){ambiguous.push(p.index);continue;}
  kept[i].prices.push(p);assignments.push({price:p.index,anchors:kept[i].members.map(a=>a.index),distance:distances[i][j],global_margin:globalMargin});
 }
 const output=[];
 for(const row of kept){const a=row.rep,text=[...row.members,...row.prices].sort((a,b)=>a.x-b.x).map(b=>b.text).join(' '),observation={text,anchors:row.members.map(b=>b.index),prices:row.prices.map(b=>b.index)},labelText=label(row);
  if(row.prices.length===1&&/^\d{3,14}\s+\D/.test(labelText)&&/\d+[.,]\d{2}$/.test(labelText)&&!labelText.includes('@')&&!/[$₹£€]/.test(labelText)&&! /[-−]/.test(row.prices[0].text)){const amount=row.prices[0].text.match(/\d+[.,]\d{2}/)?.[0];if(amount)observation.price={body:labelText,amount:amount.replace(',','.')};}
  output.push([projected(a,xref),text,observation]);
 }
 for(const id of [...unmatched,...ambiguous,...[...fragments].sort((a,b)=>a-b)]){const b=boxes[id];output.push([projected(b,xref,coarse),b.text,{text:b.text,unassigned:true,box:id}]);}
 output.sort((a,b)=>a[0]-b[0]||a[1].localeCompare(b[1]));
 return {lines:output.map(x=>x[1]),observations:output.map(x=>x[2]),unmatched,ambiguous,assignments,xref,ignored_identifier_boxes:ignored,numeric_fragments:[...fragments].sort((a,b)=>a-b)};
}

// Only attach an orphan printed amount to a nearby product when the printed
// rate proves it, or one product occupies the same baseline with no rival.
export function resolveOrphanPrices(record,assembly){
 validRecord(record);
 const boxes=record.texts.map((text,i)=>normBox(i,text,record.boxes[i],record.scores[i]));
 const lines=[...assembly.lines],resolved=[];
 const spatialDistance=(price,observation)=>{
  const anchor=observation.anchors.map(i=>boxes[i]).sort((a,b)=>b.width-a.width)[0];
  const slope=(anchor.slope+price.slope)/2;
  return Math.abs(price.y-anchor.y-slope*(price.x-anchor.x))/Math.max(1,(anchor.h+price.h)/2);
 };
 for(const index of assembly.ambiguous){
  const price=boxes[index],match=price.text.match(/^\s*\$?(\d+[.,]\d{2})\s*$/);if(!match)continue;
  const cents=moneyValue(match[1]),arithmetic=[];
  for(let i=0;i<lines.length;i++){
   const observation=assembly.observations[i];if(!observation.anchors?.length||observation.prices?.length)continue;
   const d=spatialDistance(price,observation);if(d>1.5)continue;
   const rate=lines[i].match(/\b(\d{1,3})\s*@\s*\$?(\d+[.,]\d{2})\b/i);
   if(rate&&Math.round(Number(rate[1])*moneyValue(rate[2]))===cents)arithmetic.push({i,reason:'printed-rate',d});
  }
  let chosen=arithmetic.length===1?arithmetic[0]:null;
  if(!chosen){const spatial=[];
   for(let i=0;i<lines.length;i++){
    const observation=assembly.observations[i];if(!observation.anchors?.length||observation.prices?.length||!/[A-Za-z]{3}/.test(lines[i])||/^\d{1,2}\s*[-–]|BONUS|SUBTOTAL|TOTAL|TAX|HST|GST|PTS\b/i.test(lines[i])||/\b\d{1,3}\s*@\s*\$?\d+[.,]\d{2}\b/i.test(lines[i]))continue;
    const d=spatialDistance(price,observation),right=Math.max(...observation.anchors.map(k=>boxes[k].x+boxes[k].width/2));
    if(d<=0.65&&price.x-price.width/2>right)spatial.push({i,reason:'unique-spatial-product',d});
   }
   if(spatial.length===1)chosen=spatial[0];
  }
  if(!chosen)continue;
  lines[chosen.i]+=' '+match[1];
  const orphan=assembly.observations.findIndex(x=>x.box===index);if(orphan>=0)lines[orphan]='';
  resolved.push({box:index,target:chosen.i,reason:chosen.reason,distance:Math.round(chosen.d*1000)/1000});
 }
 return {lines:lines.filter(Boolean),resolved,remaining_ambiguous:assembly.ambiguous.length-resolved.length};
}
