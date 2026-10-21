import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';
import {COVER_RATIO,geometry,move,zoomAt} from '../photos/framing.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
test('portrait, landscape, panoramic and small photos fill the cover without stretching or exposing empty edges',()=>{
 for(const [w,h] of [[600,1200],[1600,900],[3000,200],[20,20],[1,1]])for(const zoom of [1,1.73,4])for(const [x,y] of [[0,0],[1,1],[.3,.8]]){
  const g=geometry(w,h,342,{zoom,x,y});assert.ok(g.width>=342-1e-8&&g.height>=g.frameHeight-1e-8);assert.ok(g.sx>=0&&g.sy>=0);assert.ok(g.sx+g.sw<=w+1e-8&&g.sy+g.sh<=h+1e-8);near(g.sw/g.sh,COVER_RATIO);near(g.width/g.height,w/h);
 }
});
test('dragging reaches both image edges; saved framing selects the same source rectangle on phone and desktop',()=>{
 const start={zoom:2,x:.5,y:.5};const first=move(600,1200,342,start,1e6,1e6),last=move(600,1200,342,start,-1e6,-1e6);assert.equal(first.x,0);assert.equal(first.y,0);assert.equal(last.x,1);assert.equal(last.y,1);
 const a=geometry(600,1200,342,{zoom:1.6,x:.7,y:.82}),b=geometry(600,1200,920,{zoom:1.6,x:.7,y:.82});for(const key of ['sx','sy','sw','sh'])near(a[key],b[key]);
});
test('zoom preserves the source point under the gesture and clamps invalid or extreme controls safely',()=>{
 const f={zoom:1.3,x:.5,y:.5},g=geometry(1600,900,600,f),next=zoomAt(1600,900,600,f,2.4,240,120),after=geometry(1600,900,600,next);near((240-g.left)/g.scale,(240-after.left)/after.scale);near((120-g.top)/g.scale,(120-after.top)/after.scale);
 const bounded=geometry(600,1200,300,{zoom:Infinity,x:-10,y:10});assert.equal(bounded.sx,0);near(bounded.sy+bounded.sh,1200);assert.throws(()=>geometry(0,1200,300,{}));
});
function harness({delayImage=false}={}){
 const dom=new JSDOM('<!doctype html><button id="old">Previous cover</button>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,draws=[],revoked=[],images=[];let disconnected=0;
 w.Image=class{naturalWidth=600;naturalHeight=1200;set src(value){if(value){images.push(this);if(!delayImage)queueMicrotask(()=>this.onload?.());}}};
 w.URL.createObjectURL=()=> 'blob:synthetic-cover';w.URL.revokeObjectURL=url=>revoked.push(url);
 w.ResizeObserver=class{observe(){}disconnect(){disconnected++;}};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.HTMLElement.prototype.getBoundingClientRect=()=>({width:600,height:225,left:0,top:0});
 w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(...args){draws.push(args);}});w.HTMLCanvasElement.prototype.toBlob=function(cb){queueMicrotask(()=>cb(new w.Blob(['synthetic pixels'],{type:'image/jpeg'})));};
 w.eval(readFileSync(new URL('../public/ourhouse-cover.js',import.meta.url),'utf8'));
 return{w,draws,revoked,images,disconnected:()=>disconnected,close:()=>dom.window.close()};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
test('preview stays editable until Save, returns the original source for later adjustment, and exports the exact visible crop',async()=>{
 const h=harness();try{const source=new h.w.Blob(['synthetic source'],{type:'image/jpeg'}),pending=h.w.OurHouseCover.open(source);await tick();const d=h.w.document;assert.ok(d.querySelector('dialog[open]'));assert.equal(h.draws.length,0);
 d.querySelector('[aria-label="Zoom in"]').click();d.querySelector('#coverCrop').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));d.querySelector('#coverSave').click();const result=await pending;
 assert.equal(result.source,source);assert.equal(result.v,2);assert.equal(result.cover.type,'image/jpeg');assert.equal(result.framing.zoom,1.15);assert.ok(result.framing.y>.5);assert.equal(h.draws.length,1);const expected=geometry(600,1200,1200,result.framing);const args=h.draws[0];near(args[1],expected.sx);near(args[2],expected.sy);near(args[3],expected.sw);near(args[4],expected.sh);assert.deepEqual(args.slice(5),[0,0,1200,450]);assert.equal(d.querySelector('dialog'),null);assert.equal(h.disconnected(),1);assert.equal(h.revoked.length,1);
 }finally{h.close();}
});
test('Cancel and account-switch cancellation discard preview changes and release temporary photo resources',async()=>{
 for(const useButton of [true,false]){const h=harness();try{const pending=h.w.OurHouseCover.open(new h.w.Blob(['fixture']));await tick();const d=h.w.document;d.querySelector('[aria-label="Zoom in"]').click();if(useButton)d.querySelector('#coverCancel').click();else h.w.OurHouseCover.cancel();assert.equal(await pending,null);assert.equal(h.draws.length,0);assert.equal(d.querySelector('dialog'),null);assert.equal(h.disconnected(),1);assert.equal(h.revoked.length,1);}finally{h.close();}}
});
test('a photo finishing decoding after cancellation cannot reopen a stale account preview',async()=>{
 const h=harness({delayImage:true});try{const pending=h.w.OurHouseCover.open(new h.w.Blob(['fixture']));h.w.OurHouseCover.cancel();h.images[0].onload();assert.equal(await pending,null);assert.equal(h.w.document.querySelector('dialog'),null);assert.equal(h.draws.length,0);assert.equal(h.revoked.length,1);}finally{h.close();}
});
