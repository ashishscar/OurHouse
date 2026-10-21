// Consume only model content deltas, not reasoning or provider diagnostics.
// Progress reports counts; no receipt text is emitted until final validation.
export async function receiptStream(stream,onProgress){
 const reader=stream.getReader(),decoder=new TextDecoder();let buffer='',text='',finish='',inArray=false,linesDone=false,inString=false,escaped=false,token='',lastString='',count=0,lastCount=0;
 function delta(value){
  if(typeof value!=='string')return;text+=value;if(text.length>40000)throw Error('RESULT');
  for(const c of value){if(escaped){escaped=false;continue;}if(inString&&c==='\\'){escaped=true;continue;}if(c==='"'){if(inString){if(inArray)count++;else lastString=token;}inString=!inString;token='';}else if(inString){if(token.length<16)token+=c;}else if(c==='['&&!linesDone&&lastString==='lines')inArray=true;else if(c===']'&&inArray){inArray=false;linesDone=true;}}
  if(count>lastCount){lastCount=count;onProgress?.(count);}
 }
 function event(line){if(!line.startsWith('data:'))return;const data=line.slice(5).trim();if(!data||data==='[DONE]')return;const record=JSON.parse(data),choice=record.choices?.[0];if(record.error)throw Error('PROVIDER');if(choice?.finish_reason)finish=choice.finish_reason;delta(choice?.delta?.content??record.response);}
 try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>150000)throw Error('RESULT');let end;while((end=buffer.indexOf('\n'))>=0){event(buffer.slice(0,end).trimEnd());buffer=buffer.slice(end+1);}}buffer+=decoder.decode();if(buffer.trim())event(buffer.trimEnd());if(finish&&finish!=='stop')throw Error('TRUNCATED');return text;}
 finally{await reader.cancel().catch(()=>{});}
}
