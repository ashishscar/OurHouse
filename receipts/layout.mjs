import {parseReceipt} from './parser.mjs';
// Matching is restricted to the shared physical boundary, never the whole receipt.
export function sectionPlan(width,height,{ai=false,horizontalCrop=null}={}){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('This photo has invalid dimensions.');
 let sourceLeft=0,sourceWidth=width;
 if(ai&&horizontalCrop){
  if(!Number.isFinite(horizontalCrop.left)||!Number.isFinite(horizontalCrop.width)||horizontalCrop.left<0||horizontalCrop.width<1||horizontalCrop.left+horizontalCrop.width>width)throw Error('Invalid receipt paper bounds.');
  sourceLeft=Math.floor(horizontalCrop.left);sourceWidth=Math.min(width,Math.ceil(horizontalCrop.left+horizontalCrop.width))-sourceLeft;
 }
 // Choose resolution from the paper, before resizing. Scaling the entire photo
 // first permanently discarded letters on narrow receipts in a wide scene.
 const scale=Math.min(ai?1:2,(ai?1400:1800)/sourceWidth),w=Math.round(sourceWidth*scale),h=Math.round(height*scale),size=ai?1200:1800,overlap=ai?240:300,sections=[];
 for(let top=0;top<h;top+=size-overlap){sections.push({left:sourceLeft*scale,top,width:w,height:Math.min(size,h-top),scale});if(top+size>=h)break;if(sections.length>=64)throw Error('This receipt is too long for one photo. Take closer photos of shorter sections.');}
 return {width:w,height:h,scale,sections};
}
// A conservative horizontal paper bound removes dark scenery, never receipt
// top/bottom rows. Uncertain/low-contrast photos keep the entire frame.
export function receiptPaperBounds({data,width,height}){
 const neutral=(i)=>Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])<45;
 const light=i=>(data[i]+data[i+1]+data[i+2])/3,levels=[];
 for(let i=0;i<data.length;i+=16)if(neutral(i))levels.push(light(i));
 if(levels.length<width*height/16)return null;levels.sort((a,b)=>a-b);const threshold=Math.max(115,levels[Math.floor(levels.length*.85)]*.83),bounds=[];
 for(let y=Math.floor(height*.1);y<height*.9;y+=2){let start=-1,last=-1,best=null;for(let x=0;x<width;x++){const i=(y*width+x)*4;if(neutral(i)&&light(i)>threshold){if(start<0)start=x;last=x;}if(start>=0&&(x-last>5||x===width-1)){const n=last-start+1;if(n>width*.25&&start<width*.7&&last>width*.3&&(!best||n>best[1]-best[0]))best=[start,last+1];start=-1;}}if(best)bounds.push(best);}
 if(bounds.length<height*.24)return null;
 const left=Math.max(0,Math.floor(Math.min(...bounds.map(b=>b[0]))-width*.07)),right=Math.min(width,Math.ceil(Math.max(...bounds.map(b=>b[1]))+width*.07));
 return right-left<width*.9?{left,width:right-left}:null;
}
function wordsOf(data){
 if(data.words?.length)return data.words;
 return (data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])));
}
export function receiptLines(pages){
 const words=[],fallback=[];
 const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]||0;
 function slopeOf(data){
  const lines=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[])),slopes=[];
  for(const line of lines){const points=(line.words||[]).filter(w=>w.bbox&&String(w.text).length>=2).map(w=>({x:(w.bbox.x0+w.bbox.x1)/2,y:w.bbox.y1}));if(points.length<3)continue;const mx=points.reduce((n,p)=>n+p.x,0)/points.length,my=points.reduce((n,p)=>n+p.y,0)/points.length,den=points.reduce((n,p)=>n+(p.x-mx)**2,0),s=points.reduce((n,p)=>n+(p.x-mx)*(p.y-my),0)/den;if(den>10000&&Math.abs(s)<.15)slopes.push(s);}
  return slopes.length>=3?median(slopes):0;
 }
 for(let i=0;i<pages.length;i++){
  const {data,section}=pages[i],found=wordsOf(data),lower=i?section.top+150:0,upper=i===pages.length-1?Infinity:section.top+section.height-150,slope=slopeOf(data);
  if(!found.length){fallback.push(...String(data.text||'').split(/\r?\n/).filter(s=>s.trim()).map(text=>({text:text.trim(),confidence:null,bbox:null})));continue;}
  for(const word of found){const b=word.bbox,text=String(word.text||'').trim();if(!b||!text)continue;const y=(b.y0+b.y1)/2+section.top-slope*((b.x0+b.x1)/2-section.width/2);if(y<lower||y>=upper)continue;words.push({text,y,confidence:Number.isFinite(word.confidence)?word.confidence:null,bbox:{x0:b.x0,y0:b.y0+section.top,x1:b.x1,y1:b.y1+section.top}});}
 }
 const rows=[];
 for(const word of words.sort((a,b)=>a.y-b.y||a.bbox.x0-b.bbox.x0)){
  const b=word.bbox,y=word.y,h=b.y1-b.y0,last=rows.at(-1);
  if(last&&Math.abs(last.y-y)<=Math.max(5,Math.min(last.height,h)*.65)){last.words.push(word);last.y=(last.y*(last.words.length-1)+y)/last.words.length;last.height=Math.max(last.height,h);}
  else rows.push({y,height:h,words:[word]});
 }
 return [...rows.map(row=>{const ordered=row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0),known=ordered.filter(w=>w.confidence!==null);return {text:ordered.map(w=>w.text).join(' '),confidence:known.length?Math.round(known.reduce((n,w)=>n+w.confidence,0)/known.length):null,bbox:{x0:Math.min(...ordered.map(w=>w.bbox.x0)),y0:Math.min(...ordered.map(w=>w.bbox.y0)),x1:Math.max(...ordered.map(w=>w.bbox.x1)),y1:Math.max(...ordered.map(w=>w.bbox.y1))}};}),...fallback];
}

// Overlap is reconciled between adjacent sections only, never by product name.
export function mergeTranscriptions(pages){
 const result=[];let uncertain=false,conflicts=false,previous=null;
 const key=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
 for(const page of pages){const lines=page.lines||[],candidates=[];let overlap=0,max=18;
  if(previous?.section&&page.section){const shared=previous.section.top+previous.section.height-page.section.top;max=Math.max(1,Math.ceil(previous.lines.length*Math.max(0,shared)/previous.section.height)+1);}
  for(let n=Math.min(max,result.length,lines.length);n>=1;n--)if(result.slice(-n).every((line,i)=>key(line)===key(lines[i])))candidates.push(n);
  if(candidates.length===1)overlap=candidates[0];else if(candidates.length>1){overlap=Math.min(...candidates);uncertain=true;}
  // Models may put a line total on the product row in one section and on its
  // rate continuation in the next. Align complete product sequences as well.
  if(result.length&&!overlap){
   const left=parseReceipt(result.join('\n')),right=parseReceipt(lines.join('\n')),matches=[];
   const near=(a,b)=>{if(a===b)return true;if(a.length<12||a.length!==b.length)return false;return [...a].filter((c,i)=>c!==b[i]).length===1;};
   const productKey=row=>key(row.name.replace(/\bH?MRJ\b/gi,'').replace(/\b\d{3,14}\b/g,''));
   const same=(a,b)=>near(productKey(a),productKey(b))&&a.amount===b.amount&&(!a.itemNumber||!b.itemNumber||a.itemNumber===b.itemNumber)&&(!a.quantityKnown||!b.quantityKnown||a.qty===b.qty&&a.unit===b.unit);
   for(let n=Math.min(max,left.length,right.length);n>=2;n--)if(left.slice(-n).every((row,i)=>same(row,right[i])))matches.push(n);
   if(matches.length===1){
    const n=matches[0],anchors=right.slice(0,n).map(r=>key(r.name)+':'+r.amount);
    if(new Set(anchors).size>=2){let offset=0,found=true;const text=lines.join('\n');for(const row of right.slice(0,n)){const at=text.indexOf(row.raw,offset);if(at<0){found=false;break;}offset=at+row.raw.length;}if(found)overlap=text.slice(0,offset).split('\n').length;}
   }
  }
  // A partially read last product or a disagreeing amount must not prevent
  // matching the other complete products at this physical boundary. Require
  // two different name+amount anchors and one unambiguous alignment. Repeated
  // identical products alone cannot establish a safe boundary.
  if(result.length&&!overlap){
   const left=parseReceipt(result.join('\n')),right=parseReceipt(lines.join('\n')),matches=[];
   const productKey=row=>key(row.name.replace(/\bH?MRJ\b/gi,'').replace(/\b\d{3,14}\b/g,''));
   // Physical line density is only an estimate: wrapped rates and a clipped
   // product can shift it by two products. Keep that allowance at the boundary.
   const boundaryMax=Math.min(18,max+2);
   for(let start=Math.max(0,left.length-boundaryMax);start<left.length;start++){
    let n=0;const anchors=new Set();
    while(start+n<left.length&&n<Math.min(boundaryMax,right.length)&&productKey(left[start+n])===productKey(right[n])){if(left[start+n].amount===right[n].amount)anchors.add(productKey(right[n])+':'+right[n].amount);n++;}
    if(n>=2&&anchors.size>=2&&left.length-start-n<=2)matches.push({start,n});
   }
   if(matches.length===1){const {start,n}=matches[0],text=lines.join('\n');let offset=0,found=true;
    for(const row of right.slice(0,n)){const at=text.indexOf(row.raw,offset);if(at<0){found=false;break;}offset=at+row.raw.length;}
    if(found){overlap=text.slice(0,offset).split('\n').length;for(let i=0;i<n;i++){const a=left[start+i],b=right[i];if(a.amount!==b.amount||a.quantityKnown&&b.quantityKnown&&(a.qty!==b.qty||a.unit!==b.unit))conflicts=true;}uncertain=uncertain||conflicts;}
   }
  }
  if(result.length&&!overlap&&parseReceipt(result.join('\n')).length&&parseReceipt(lines.join('\n')).length)uncertain=true;
  result.push(...lines.slice(overlap));previous=page;
 }
 return {lines:result,uncertain,conflicts};
}
