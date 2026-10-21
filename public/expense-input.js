/* Editing syntax only. Ledger and server validation remain authoritative. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExpenseInput=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function valid(value,{precision=2,signed=false}={}){
    if(typeof value!=='string'||value.length>18)return false;
    const pattern=new RegExp('^'+(signed?'-?':'')+'[0-9]*'+(precision?'(?:\\.[0-9]{0,'+precision+'})?':'')+'$');
    return pattern.test(value);
  }
  function install(doc,optionsFor,onReject){
    const states=new WeakMap();
    const options=el=>el&&el.tagName==='INPUT'&&!el.readOnly?optionsFor(el):null;
    const keep=el=>states.set(el,{value:el.value,start:el.selectionStart,end:el.selectionEnd});
    const reject=(el,opts)=>{if(onReject)onReject(el,opts);};
    const editable=(value,opts)=>valid(value,{...opts,precision:4});
    const focus=event=>{const el=event.target,opts=options(el);if(opts&&editable(el.value,opts))keep(el);};
    const before=event=>{
      const el=event.target,opts=options(el);if(!opts)return;
      if(editable(el.value,opts))keep(el);
      if(!event.inputType?.startsWith('insert')||event.data==null)return;
      const start=el.selectionStart??el.value.length,end=el.selectionEnd??start;
      const candidate=el.value.slice(0,start)+event.data+el.value.slice(end);
      if(!valid(candidate,opts)){event.preventDefault();reject(el,opts);}
    };
    const paste=event=>{
      const el=event.target,opts=options(el);if(!opts)return;
      const data=event.clipboardData?.getData('text/plain');if(data==null)return;
      const start=el.selectionStart??el.value.length,end=el.selectionEnd??start;
      if(!valid(el.value.slice(0,start)+data+el.value.slice(end),opts)){event.preventDefault();reject(el,opts);}
    };
    const input=event=>{
      const el=event.target,opts=options(el);if(!opts)return;
      if(valid(el.value,opts)){keep(el);return;}
      const previous=states.get(el);
      // A currency change may leave extra decimals. Let deletion correct it,
      // without rounding money or discarding the existing amount.
      if(event.inputType?.startsWith('delete')&&previous&&el.value.length<previous.value.length&&editable(el.value,opts)){keep(el);return;}
      el.value=previous?.value||'';
      if(previous)el.setSelectionRange(previous.start,previous.end);
      reject(el,opts);
      // Capture runs before inline preview/draft handlers, which see restored text.
    };
    doc.addEventListener('focusin',focus,true);
    doc.addEventListener('beforeinput',before,true);
    doc.addEventListener('paste',paste,true);
    doc.addEventListener('input',input,true);
    return ()=>{doc.removeEventListener('focusin',focus,true);doc.removeEventListener('beforeinput',before,true);doc.removeEventListener('paste',paste,true);doc.removeEventListener('input',input,true);};
  }
  return {valid,install};
});
