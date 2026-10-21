import test from 'node:test';
import assert from 'node:assert/strict';
import {readReceiptSection,validateTranscription,RECEIPT_CONSENT} from '../receipts/agent.mjs';
import {parseReceipt,auditReceipt} from '../receipts/parser.mjs';
import {mergeTranscriptions,sectionPlan,receiptLines} from '../receipts/layout.mjs';
// Synthetic JPEG header used only with the mocked inference binding.
const image=Buffer.from([255,216,255,192,0,11,8,0,10,0,10,1,1,17,0,255,217]).toString('base64');
const body={house:'synthetic-house',consent:RECEIPT_CONSENT,image};
function setup(){const state={role:'editor',house:'synthetic-house',calls:[],ai:0,over:false};const store={membership:async()=>({house:state.house,role:state.role}),rate:async()=>{},one:async(...args)=>{state.calls.push(args);return {calls:state.over?81:1};}};const env={RECEIPT_AI:{run:async(_model,input)=>{state.ai++;state.input=input;return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({lines:['FLOUR 2kg','3 @ $4.00 *$12.00','TOTAL $12.00','Number of products: 3']})}}]};}}};return {state,store,env};}
test('receipt AI requires consent, membership, matching family and a bounded JPEG before inference',async()=>{
 for(const change of [{consent:''},{house:'foreign-house'},{image:'https://private.invalid/photo'},{image:'/9j/'+ 'A'.repeat(1400000)}]){const {state,store,env}=setup();await assert.rejects(()=>readReceiptSection(store,'synthetic-user',env,{...body,...change}));assert.equal(state.ai,0);}
 const {state,store,env}=setup();state.role='viewer';await assert.rejects(()=>readReceiptSection(store,'synthetic-user',env,body));assert.equal(state.ai,0);
});
test('dedicated AI has no tools or persistence and returns only validated transcription',async()=>{
 const {state,store,env}=setup(),result=await readReceiptSection(store,'synthetic-user',env,body);assert.equal(state.ai,1);assert.equal(state.input.store,false);assert.equal(state.input.tools,undefined);assert.equal(state.input.messages[1].content[1].image_url.url,'data:image/jpeg;base64,'+image);assert.equal(state.calls.length,2);assert.ok(state.calls.every(args=>!args.includes(image)&&!args.includes('synthetic-user')&&!args.includes('synthetic-house')));const items=parseReceipt(result.lines.join('\n'));assert.equal(items[0].qty,6);assert.equal(items[0].unit,'kg');assert.equal(items[0].amount,'12.00');assert.deepEqual(auditReceipt(result.lines.join('\n'),items).warnings,[]);
});
test('usage limits, revoked access, provider errors and truncated output never return a partial AI result',async()=>{
 const limited=setup();limited.state.over=true;await assert.rejects(()=>readReceiptSection(limited.store,'synthetic-user',limited.env,body),e=>e.status===429);assert.equal(limited.state.ai,0);
 const revoked=setup();revoked.env.RECEIPT_AI.run=async()=>{revoked.state.role='viewer';return {response:'{"lines":["RICE 2kg 5.00"]}'};};await assert.rejects(()=>readReceiptSection(revoked.store,'synthetic-user',revoked.env,body),e=>e.status===409);
 const broken=setup();broken.env.RECEIPT_AI.run=async()=>{throw Error('PRIVATE_CANARY');};await assert.rejects(()=>readReceiptSection(broken.store,'synthetic-user',broken.env,body),e=>!e.message.includes('PRIVATE_CANARY')&&e.code==='AI_UNAVAILABLE');
 const truncated=setup();truncated.env.RECEIPT_AI.run=async()=>({choices:[{finish_reason:'length',message:{content:'{"lines":["RICE 2kg 5.00"]}'}}]});await assert.rejects(()=>readReceiptSection(truncated.store,'synthetic-user',truncated.env,body));
 for(const value of [{lines:['']},{lines:['x'.repeat(181)]},{lines:Array(181).fill('RICE')},'not json'])assert.throws(()=>validateTranscription(value));
});
test('multi-line synthetic grocery receipt retains count × pack size, weighted purchases and starred prices',()=>{
 const text='LENTILS 10LB\n2 @ $6.00 $12.00\nFLOUR 2KG\n3 @ $4.00 *$12.00\nDRY FRUIT\n1.5 lb @ $8.00 per lb $12.00\nTOFU 250GM\n4 @ $2.00 $8.00\nGRAINS 500G\n2 @ $3.00\n$6.00\nSPECIAL SALE\nTEA 1LB $5.00\nTOTAL $55.00\nNumber of products: 13';
 const items=parseReceipt(text);assert.equal(items.length,6);assert.equal(items[0].qty,9.071847);assert.equal(items[0].unit,'kg');assert.equal(items[0].quantityDetail,'2 packs × 10 lb');assert.equal(items[1].qty,6);assert.equal(items[2].qty,.680389);assert.equal(items[3].qty,1000);assert.equal(items[4].qty,1000);assert.equal(items[4].packCount,2);assert.equal(items[5].name,'TEA');assert.deepEqual(auditReceipt(text,items).warnings,[]);assert.ok(auditReceipt(text,items.slice(0,-1)).warnings.length>=2);
});
test('AI section overlap removes only matching boundary sequences, preserving repeated purchases within sections',()=>{
 const merged=mergeTranscriptions([{lines:['TOFU 2.00','RICE 3.00','RICE 3.00','OATS 4.00']},{lines:['RICE 3.00','OATS 4.00','MILK 5.00']}]);assert.deepEqual(merged.lines,['TOFU 2.00','RICE 3.00','RICE 3.00','OATS 4.00','MILK 5.00']);assert.equal(merged.uncertain,false);
 const plan=sectionPlan(1000,30000);assert.ok(plan.sections.length>24);assert.equal(plan.sections.at(-1).top+plan.sections.at(-1).height,plan.height);
 assert.equal(parseReceipt(Array.from({length:350},(_,i)=>'PRODUCT '+String.fromCharCode(65+i%26)+' 1kg 1.00').join('\n')).length,350);
});
test('slanted native OCR lines keep distant product and amount columns on the same row',()=>{
 const lines=Array.from({length:15},(_,i)=>({words:[['PRODUCT',40,100],['RICE',200,80],['2kg',330,60],['12.99',1200,100]].map(([text,x,w])=>({text,confidence:95,bbox:{x0:x,x1:x+w,y0:100+i*70-.035*x,y1:130+i*70-.035*x}}))}));
 const result=receiptLines([{section:{top:0,width:1500,height:1500},data:{blocks:[{paragraphs:[{lines}]}]}}]);assert.equal(result.length,15);assert.equal(parseReceipt(result.map(l=>l.text).join('\n')).length,15);
});

test('streamed receipt inference emits bounded progress then one validated result, ignoring reasoning deltas',async()=>{
 const {receiptStream}=await import('../receipts/stream.mjs'),encoder=new TextEncoder(),progress=[];
 const events=[{choices:[{delta:{reasoning_content:'INTERNAL_REASONING'}}]},{choices:[{delta:{content:'{"lines":["TOFU 2.00",'}}]},{choices:[{delta:{content:'"TOTAL 2.00"]}'}}]},{choices:[{delta:{},finish_reason:'stop'}]}];
 const raw=events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n';
 const stream=new ReadableStream({start(c){for(let i=0;i<raw.length;i+=7)c.enqueue(encoder.encode(raw.slice(i,i+7)));c.close();}});
 assert.equal(await receiptStream(stream,n=>progress.push(n)),'{"lines":["TOFU 2.00","TOTAL 2.00"]}');assert.equal(progress.at(-1),2);
 const {state,store,env}=setup();env.RECEIPT_AI.run=async()=>new ReadableStream({start(c){c.enqueue(encoder.encode(raw));c.close();}});const response=await readReceiptSection(store,'synthetic-user',env,{...body,stream:true});const records=(await response.text()).trim().split('\n').map(JSON.parse);assert.equal(records[0].type,'progress');assert.equal(records.at(-1).type,'result');assert.equal(records.at(-1).lines.length,2);assert.ok(!records.some(r=>JSON.stringify(r).includes('INTERNAL_REASONING')));assert.equal(state.calls.length,2);
});
