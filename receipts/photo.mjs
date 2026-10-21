import {sectionPlan,receiptPaperBounds} from './layout.mjs';
// Draw one high-resolution strip at a time: a long receipt never gets squeezed
// into a tiny full-page image or allocated as one enormous output canvas.
export async function prepareReceipt(file,signal,options={}){
 if(!file||file.size>15*1024*1024||file.type&&!file.type.startsWith('image/'))throw Error('Choose a receipt image under 15 MB.');
 const image=new Image(),url=URL.createObjectURL(file);
 const release=()=>{image.onload=image.onerror=null;image.src='';URL.revokeObjectURL(url);};
 try{await ReceiptScanner.deadline(new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('This photo could not be opened. Try a JPEG or PNG.'));image.src=url;}),12000,signal,release);
  const source={width:image.naturalWidth||image.width,height:image.naturalHeight||image.height};if(source.width*source.height>40000000)throw Error('This photo is too large to process safely. Use closer photos of shorter receipt sections.');const plan=sectionPlan(source.width,source.height,options);
  if(options.ai){const sample=document.createElement('canvas');sample.width=256;sample.height=Math.max(1,Math.round(source.height*256/source.width));if(sample.height<=2048){const ctx=sample.getContext('2d',{willReadFrequently:true});if(ctx){ctx.drawImage(image,0,0,sample.width,sample.height);const bound=receiptPaperBounds(ctx.getImageData(0,0,sample.width,sample.height));if(bound){const left=Math.max(0,Math.floor(bound.left*plan.width/256)),right=Math.min(plan.width,Math.ceil((bound.left+bound.width)*plan.width/256));for(const section of plan.sections){section.left=left;section.width=right-left;}}}}sample.width=sample.height=1;}
  return {source,plan,release,async page(index){
   if(signal?.aborted)throw Error('Scan cancelled.');const section=plan.sections[index],canvas=document.createElement('canvas');canvas.width=section.width;canvas.height=section.height;
   const context=canvas.getContext('2d');if(!context)throw Error('Photo processing is unavailable on this device.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,section.left/plan.scale,section.top/plan.scale,section.width/plan.scale,section.height/plan.scale,0,0,canvas.width,canvas.height);
   const blob=await ReceiptScanner.deadline(new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Photo processing failed.')),options.ai?'image/jpeg':'image/png',0.9)),10000,signal);canvas.width=canvas.height=1;return blob;
  }};
 }catch(error){release();throw error;}
}
