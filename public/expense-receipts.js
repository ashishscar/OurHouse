(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./receipt-schema.js'));else root.ExpenseReceipts=factory(root.ReceiptSchema);})(typeof globalThis!=='undefined'?globalThis:this,function(Schema){
 async function prepare(file){
  if(!file||file.size<=0||file.size>15*1024*1024)throw Error('Choose a receipt photo under 15 MB or a PDF under 512 KB.');
  let blob=file,name=file.name||'Receipt';
  if(file.type==='application/pdf'){
   if(file.size>Schema.MAX_BYTES)throw Error('This PDF is over 512 KB. Choose a smaller PDF or attach photos of its pages.');
  }else{
   if(!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))throw Error('Choose a photo (JPEG, PNG, WebP or HEIC) or a PDF.');
   let image,url;
   try{
    if(typeof createImageBitmap==='function'){try{image=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}}
    if(!image){url=URL.createObjectURL(file);image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This photo could not be opened. Try JPEG or PNG.'));img.src=url;});}
    const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
    if(!width||!height)throw Error('This photo could not be opened.');
    const ratio=Math.min(1,4096/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo preparation is unavailable. Try a PDF or another browser.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.88,.76,.64,.52]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=Schema.MAX_BYTES)break;}
    if(!blob||blob.size>Schema.MAX_BYTES)throw Error('This receipt photo is too large. Attach closer photos of separate sections.');
    name=name.replace(/\.[^.]+$/,'')+'.jpg';
   }finally{if(image?.close)image.close();if(url)URL.revokeObjectURL(url);}
  }
  const bytes=new Uint8Array(await blob.arrayBuffer());if(!Schema.signature(bytes,blob.type))throw Error('The receipt file format does not match its contents.');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {id:'r_'+sha256,sha256,size:bytes.length,mime:blob.type,name:name.replace(/[\x00-\x1f\x7f]/g,'').slice(0,120)||'Receipt',data:btoa(binary)};
 }
 async function request(scope,token,file){
  const query=new URLSearchParams(scope);const response=await fetch('/api/expenses/receipt?'+query,{method:file?'POST':'GET',headers:{authorization:'Bearer '+token,...(file?{'content-type':'application/json'}:{})},...(file?{body:JSON.stringify(file)}:{}),signal:AbortSignal.timeout(30000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Receipt could not be opened. Try again.');return result;
 }
 async function blob(record){Schema.reference(record);const bytes=Uint8Array.from(atob(record.data),c=>c.charCodeAt(0));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(bytes.length!==record.size||hash!==record.sha256||!Schema.signature(bytes,record.mime))throw Error('The saved receipt could not be read.');return new Blob([bytes],{type:record.mime});}
 return {prepare,request,blob};
});
