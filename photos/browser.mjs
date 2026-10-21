import {framing,geometry,move,zoomAt} from './framing.mjs';
let active=null;
const loadImage=url=>new Promise((resolve,reject)=>{
 const image=new Image(),timer=setTimeout(()=>{image.src='';reject(Error('This photo took too long to open. Try a smaller photo.'));},10000);
 image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(Error('This photo could not be opened. Try JPG, PNG or WebP.'));};image.src=url;
});
async function open(source,value){
 cancel();
 let resolve,reject;const result=new Promise((yes,no)=>{resolve=yes;reject=no;});
 const job={url:URL.createObjectURL(source),dialog:null,resolve,reject,closed:false};active=job;
 const finish=(value,error)=>{if(job.closed)return;job.closed=true;job.cleanup?.();if(active===job)active=null;job.dialog?.close();job.dialog?.remove();URL.revokeObjectURL(job.url);error?reject(error):resolve(value);};job.finish=finish;
 try{
  const image=await loadImage(job.url);if(job.closed)return result;
  let frame=framing(value),busy=false;const points=new Map();
  const dialog=document.createElement('dialog');job.dialog=dialog;dialog.className='cover-editor';dialog.setAttribute('aria-labelledby','coverEditorTitle');
  dialog.innerHTML=`<div class="cover-editor-body"><div class="cover-editor-heading"><span class="klabel">Your personal cover</span><h2 id="coverEditorTitle">Make it yours</h2><p id="coverEditorHelp">Drag the photo to frame it. Pinch or use the zoom controls to show more or less.</p></div><div class="cover-crop" id="coverCrop" tabindex="0" role="group" aria-label="Cover photo preview" aria-describedby="coverEditorHelp coverKeyboardHelp"><img alt="" draggable="false"><span class="cover-crop-grid" aria-hidden="true"></span></div><p class="cover-preview-label">This is how your cover will appear</p><div class="cover-zoom"><button type="button" class="btn grey" aria-label="Zoom out">−</button><label for="coverZoom">Zoom <output id="coverZoomValue">100%</output><input id="coverZoom" type="range" min="1" max="4" step="0.01" value="1"></label><button type="button" class="btn grey" aria-label="Zoom in">+</button></div><div class="cover-reset-row"><button type="button" class="btn grey" id="coverReset">Reset framing</button><span id="coverKeyboardHelp" class="finehint">Arrow keys move the photo. + / − zoom.</span></div><p class="cover-error" role="alert" id="coverError"></p><div class="cover-editor-actions"><button type="button" class="btn grey" id="coverCancel">Cancel</button><button type="button" class="btn primary" id="coverSave">Save cover</button></div><p class="cover-private-note">Only you · saved on this device</p></div>`;
  const q=s=>dialog.querySelector(s),stage=q('#coverCrop'),preview=q('img'),slider=q('#coverZoom'),output=q('#coverZoomValue'),save=q('#coverSave'),error=q('#coverError');
  preview.src=job.url;
  const width=()=>stage.getBoundingClientRect().width;
  const render=()=>{if(job.closed)return;const w=width();if(!w)return;const g=geometry(image.naturalWidth,image.naturalHeight,w,frame);Object.assign(preview.style,{width:g.width+'px',height:g.height+'px',transform:`translate3d(${g.left}px,${g.top}px,0)`});slider.value=String(frame.zoom);output.value=Math.round(frame.zoom*100)+'%';slider.setAttribute('aria-valuetext',output.value);};
  const zoom=(value,x,y)=>{if(busy)return;frame=zoomAt(image.naturalWidth,image.naturalHeight,width(),frame,value,x,y);render();};
  const pan=(dx,dy)=>{if(busy)return;frame=move(image.naturalWidth,image.naturalHeight,width(),frame,dx,dy);render();};
  slider.addEventListener('input',()=>zoom(Number(slider.value)));
  q('[aria-label="Zoom out"]').addEventListener('click',()=>zoom(frame.zoom-.15));q('[aria-label="Zoom in"]').addEventListener('click',()=>zoom(frame.zoom+.15));
  q('#coverReset').addEventListener('click',()=>{if(busy)return;frame=framing();render();});
  q('#coverCancel').addEventListener('click',()=>finish(null));
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();},true);
  stage.addEventListener('keydown',e=>{const step=e.shiftKey?36:12;const arrows={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};if(arrows[e.key]){e.preventDefault();e.stopPropagation();pan(...arrows[e.key]);}else if(['+','=','-'].includes(e.key)){e.preventDefault();e.stopPropagation();zoom(frame.zoom+(e.key==='-'?-.15:.15));}});
  const position=e=>{const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  const pair=()=>{const [a,b]=[...points.values()];return b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(b.x-a.x,b.y-a.y)}:null;};
  stage.addEventListener('pointerdown',e=>{if(busy||e.button>0)return;e.preventDefault();stage.focus({preventScroll:true});stage.setPointerCapture(e.pointerId);points.set(e.pointerId,position(e));stage.classList.add('is-dragging');});
  stage.addEventListener('pointermove',e=>{const last=points.get(e.pointerId);if(!last||busy)return;e.preventDefault();const before=pair(),next=position(e);points.set(e.pointerId,next);const after=pair();if(before&&after){if(before.d>0)zoom(frame.zoom*after.d/before.d,before.x,before.y);pan(after.x-before.x,after.y-before.y);}else pan(next.x-last.x,next.y-last.y);});
  const end=e=>{points.delete(e.pointerId);if(!points.size)stage.classList.remove('is-dragging');};for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,end);
  // Keep cover gestures separate from the app's sheet and screen gestures.
  for(const event of ['pointerdown','pointermove','pointerup','pointercancel'])dialog.addEventListener(event,e=>e.stopPropagation());
  const observer=new ResizeObserver(render);job.cleanup=()=>observer.disconnect();
  save.addEventListener('click',async()=>{
   if(busy||job.closed)return;busy=true;save.disabled=true;save.textContent='Saving…';stage.setAttribute('aria-busy','true');error.textContent='';
   try{
    const g=geometry(image.naturalWidth,image.naturalHeight,1200,frame),canvas=document.createElement('canvas');canvas.width=1200;canvas.height=450;const context=canvas.getContext('2d');if(!context)throw Error('Photo processing is unavailable');
    context.fillStyle='#ffffff';context.fillRect(0,0,1200,450);context.drawImage(image,g.sx,g.sy,g.sw,g.sh,0,0,1200,450);
    const cover=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Photo processing timed out. Please try again.')),10000);canvas.toBlob(blob=>{clearTimeout(timer);blob?resolve(blob):reject(Error('Could not prepare this cover'));},'image/jpeg',.9);});
    if(job.closed)return;finish({v:2,source,cover,framing:frame});
   }catch(e){if(job.closed)return;error.textContent=e.message||'Could not save this cover. Try again.';busy=false;save.disabled=false;save.textContent='Save cover';stage.removeAttribute('aria-busy');}
  });
  document.body.append(dialog);dialog.showModal();observer.observe(stage);render();stage.focus({preventScroll:true});
 }catch(error){job.finish(null,error);}
 return result;
}
function cancel(){active?.finish(null);}
window.OurHouseCover={open,cancel};
