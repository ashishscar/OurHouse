// Read long receipts with a bounded worker pool. Results retain physical
// section order even when OCR finishes out of order.
export async function readLocalSections(indices,{createWorker,readPage,onProgress,signal,concurrency=1}){
 if(!Array.isArray(indices)||indices.some(i=>!Number.isInteger(i)||i<0)||typeof createWorker!=='function'||typeof readPage!=='function'||!Number.isInteger(concurrency)||concurrency<1||concurrency>2)throw Error('Invalid local receipt reader');
 const results=new Map(),workers=[];let cursor=0,failed=null;
 const run=async()=>{
  try{
   if(signal?.aborted)throw Error('Scan cancelled.');
   const worker=await createWorker();workers.push(worker);
   while(cursor<indices.length&&!failed){
    if(signal?.aborted)throw Error('Scan cancelled.');
    const index=indices[cursor++];onProgress?.(index,results.size,indices.length);
    const result=await readPage(worker,index);
    if(signal?.aborted)throw Error('Scan cancelled.');
    results.set(index,result);
    onProgress?.(index,results.size,indices.length);
   }
  }catch(error){failed??=error;}
 };
 try{
  await Promise.all(Array.from({length:Math.min(concurrency,indices.length)},run));
  if(failed)throw failed;
  return indices.map(index=>results.get(index));
 }finally{await Promise.allSettled(workers.map(worker=>worker?.terminate?.()));}
}
