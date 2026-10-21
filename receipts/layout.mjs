// Receipt coordinates, not product names, determine whether overlap is repeated.
export function sectionPlan(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('This photo has invalid dimensions.');
 const scale=Math.min(2,1800/width),w=Math.round(width*scale),h=Math.round(height*scale),size=2000,overlap=240,sections=[];
 for(let top=0;top<h;top+=size-overlap){sections.push({left:0,top,width:w,height:Math.min(size,h-top),scale});if(top+size>=h)break;if(sections.length>=24)throw Error('This receipt is too long for one photo. Take closer photos of shorter sections.');}
 return {width:w,height:h,scale,sections};
}
function wordsOf(data){
 if(data.words?.length)return data.words;
 return (data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>l.words||[])));
}
export function receiptLines(pages){
 const words=[],fallback=[];
 for(let i=0;i<pages.length;i++){
  const {data,section}=pages[i],found=wordsOf(data),lower=i?section.top+120:0,upper=i===pages.length-1?Infinity:section.top+section.height-120;
  if(!found.length){fallback.push(...String(data.text||'').split(/\r?\n/).filter(s=>s.trim()).map(text=>({text:text.trim(),confidence:null,bbox:null})));continue;}
  for(const word of found){const b=word.bbox,text=String(word.text||'').trim();if(!b||!text)continue;const y=(b.y0+b.y1)/2+section.top;if(y<lower||y>=upper)continue;words.push({text,confidence:Number.isFinite(word.confidence)?word.confidence:null,bbox:{x0:b.x0,y0:b.y0+section.top,x1:b.x1,y1:b.y1+section.top}});}
 }
 const rows=[];
 for(const word of words.sort((a,b)=>(a.bbox.y0+a.bbox.y1)/2-(b.bbox.y0+b.bbox.y1)/2||a.bbox.x0-b.bbox.x0)){
  const b=word.bbox,y=(b.y0+b.y1)/2,h=b.y1-b.y0,last=rows.at(-1);
  if(last&&Math.abs(last.y-y)<=Math.max(5,Math.min(last.height,h)*.5)){last.words.push(word);last.y=(last.y*(last.words.length-1)+y)/last.words.length;last.height=Math.max(last.height,h);}
  else rows.push({y,height:h,words:[word]});
 }
 return [...rows.map(row=>{const ordered=row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0),known=ordered.filter(w=>w.confidence!==null);return {text:ordered.map(w=>w.text).join(' '),confidence:known.length?Math.round(known.reduce((n,w)=>n+w.confidence,0)/known.length):null,bbox:{x0:Math.min(...ordered.map(w=>w.bbox.x0)),y0:Math.min(...ordered.map(w=>w.bbox.y0)),x1:Math.max(...ordered.map(w=>w.bbox.x1)),y1:Math.max(...ordered.map(w=>w.bbox.y1))}};}),...fallback];
}
