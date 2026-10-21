/* Device snapshots are a reading aid, never authorization or a write queue. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./expense-ledger.js'),require('./receipt-schema.js'));else root.ExpenseCache=factory(root.ExpenseLedger,root.ReceiptSchema);})(typeof globalThis!=='undefined'?globalThis:this,function(Ledger,Receipts){
  const PREFIX='roomio-expense-cache:v1:',MAX_CHARS=262144,MAX_SCOPES=4,MAX_AGE=7*24*60*60*1000;
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  function scope(actor,house){if(typeof actor!=='string'||!actor||typeof house!=='string'||!house)throw Error('A signed-in account and house are required');return JSON.stringify([actor,house]);}
  function key(actor,house){return PREFIX+scope(actor,house);}
  function groupsValid(groups){
    try{
      if(!object(groups))return false;
      for(const group of Object.values(groups)){
        if(!object(group)||!object(group.meta)||typeof group.meta.name!=='string'||!object(group.meta.people)||!Object.values(group.meta.people).every(p=>object(p)&&typeof p.name==='string'))return false;
        if(group.entries!=null&&!object(group.entries))return false;
        for(const entry of Object.values(group.entries||{})){
          Ledger.validate(entry);Receipts.references(entry.receipts||[]);
          for(const history of Object.values(entry.history||{})){if(!object(history)||!object(history.value))return false;Ledger.validate(history.value);Receipts.references(history.value.receipts||[]);}
        }
      }
      return true;
    }catch{return false;}
  }
  function parse(raw){return JSON.parse(raw,(k,v)=>{if(['__proto__','prototype','constructor'].includes(k))throw Error('Invalid snapshot key');return v;});}
  function valid(record,actor,house,now){return object(record)&&record.version===1&&record.actor===actor&&record.house===house&&Number.isSafeInteger(record.receivedAt)&&record.receivedAt>0&&record.receivedAt<=now&&now-record.receivedAt<=MAX_AGE&&groupsValid(record.groups);}
  function remove(storage,actor,house){try{storage.removeItem(key(actor,house));return true;}catch{return false;}}
  function load(storage,actor,house,now=Date.now()){
    try{const raw=storage.getItem(key(actor,house));if(!raw)return null;if(raw.length>MAX_CHARS)throw Error('Oversized snapshot');const record=parse(raw);if(!valid(record,actor,house,now))throw Error('Invalid snapshot');return record;}catch{remove(storage,actor,house);return null;}
  }
  function keys(storage){return Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(k=>k?.startsWith(PREFIX));}
  function clearActor(storage,actor){try{for(const k of keys(storage)){let pair;try{pair=JSON.parse(k.slice(PREFIX.length));}catch{continue;}if(pair[0]===actor)storage.removeItem(k);}return true;}catch{return false;}}
  function save(storage,actor,house,groups,receivedAt=Date.now()){
    try{
      if(!groupsValid(groups)||!Number.isSafeInteger(receivedAt)||receivedAt<=0||receivedAt>Date.now())return false;
      const current=key(actor,house),previous=load(storage,actor,house,Math.max(receivedAt,Date.now()));
      if(previous&&previous.receivedAt>receivedAt)return false;
      const raw=JSON.stringify({version:1,actor,house,receivedAt,groups});if(raw.length>MAX_CHARS)return false;
      // Write atomically before pruning; failure cannot erase the last usable snapshot.
      storage.setItem(current,raw);
      const older=keys(storage).filter(k=>k!==current).map(k=>{let at=0;try{at=JSON.parse(storage.getItem(k)).receivedAt||0;}catch{}return {key:k,at};}).sort((a,b)=>b.at-a.at);
      for(const item of older.slice(MAX_SCOPES-1))try{storage.removeItem(item.key);}catch{}
      return true;
    }catch{return false;}
  }
  return {scope,key,load,save,remove,clearActor,MAX_CHARS,MAX_SCOPES,MAX_AGE};
});
