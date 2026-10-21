// Receipt coordinates, not product names, determine whether overlap is repeated.
export function sectionPlan(width,height,{ai=false}={}){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('This photo has invalid dimensions.');
 const scale=Math.min(ai?1:2,1800/width),w=Math.round(width*scale),h=Math.round(height*scale),size=ai?1400:1800,overlap=300,sections=[];
 for(let top=0;top<h;top+=size-overlap){sections.push({left:0,top,width:w,height:Math.min(size,h-top),scale});if(top+size>=h)break;if(sections.length>=64)throw Error('This receipt is too long for one photo. Take closer photos of shorter sections.');}
 return {width:w,height:h,scale,sections};
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
 const result=[];let uncertain=false,previous=null;
 const key=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
 for(const page of pages){const lines=page.lines||[],candidates=[];let overlap=0,max=18;
  if(previous?.section&&page.section){const shared=previous.section.top+previous.section.height-page.section.top;max=Math.max(1,Math.ceil(previous.lines.length*Math.max(0,shared)/previous.section.height)+1);}
  for(let n=Math.min(max,result.length,lines.length);n>=1;n--)if(result.slice(-n).every((line,i)=>key(line)===key(lines[i])))candidates.push(n);
  if(candidates.length===1)overlap=candidates[0];else if(candidates.length>1){overlap=Math.min(...candidates);uncertain=true;}
  if(result.length&&!overlap)uncertain=true;
  result.push(...lines.slice(overlap));previous=page;
 }
 return {lines:result,uncertain};
}
