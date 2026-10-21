(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ReceiptSchema=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const MAX_BYTES=512*1024,MAX_FILES=5;
 const MIME=['image/jpeg','image/png','image/webp','application/pdf'];
 function reference(r){
  if(!r||!/^r_[a-f0-9]{64}$/.test(r.id)||r.sha256!==r.id.slice(2)||!MIME.includes(r.mime)||!Number.isInteger(r.size)||r.size<1||r.size>MAX_BYTES||typeof r.name!=='string'||!r.name.trim()||r.name.length>120||/[\x00-\x1f\x7f]/.test(r.name)||typeof r.uploadedBy!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(r.uploadedBy)||!Number.isSafeInteger(r.createdAt)||r.createdAt<0)throw Error('Invalid receipt attachment');
  return {id:r.id,sha256:r.sha256,mime:r.mime,size:r.size,name:r.name,uploadedBy:r.uploadedBy,createdAt:r.createdAt};
 }
 function references(list){if(!Array.isArray(list)||list.length>MAX_FILES||new Set(list.map(r=>r?.id)).size!==list.length)throw Error('Attach up to five distinct receipts');if(list.some(r=>Object.keys(r||{}).some(k=>!['id','sha256','mime','size','name','uploadedBy','createdAt'].includes(k))))throw Error('Receipt references must contain metadata only');return list.map(reference);}
 function signature(bytes,mime){
  const head=String.fromCharCode(...bytes.slice(0,12));
  if(mime==='application/pdf')return head.startsWith('%PDF-');
  if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  return mime==='image/webp'&&head.startsWith('RIFF')&&head.slice(8,12)==='WEBP';
 }
 return {MAX_BYTES,MAX_FILES,MIME,reference,references,signature};
});
