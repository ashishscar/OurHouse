import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const payload=(name,ingredient='rice',categories=[{category:'Vegan_recipes'}])=>({parse:{title:'Cookbook:'+name,revid:42,categories,text:'<div class="mw-parser-output"><h2>Ingredients</h2><ul><li>1 cup '+ingredient+'</li></ul><h2>Procedure</h2><ol><li>Cook until tender.</li></ol></div>'}});
test('online suggestions check categories and full recipes before displaying, and revalidate selection',{timeout:10000},async()=>{
 const dom=new JSDOM('<div id="sheet-dish" class="show"></div><input id="recipeOnlineEnabled" type="checkbox" checked><p id="recipeOnlineStatus"></p><div id="recipeOnlineResults"></div><input id="dName"><input id="dServes"><textarea id="dInstructions"></textarea><textarea id="dNotes"></textarea><div id="ingRows"></div><div id="dRecipeSource"></div><div id="recipeShareActions"></div>',{url:'https://roomio.test',runScripts:'outside-only'}),w=dom.window,calls=[],pending=[];
 let fail=false,holdParse=false,parseReply,changed=false;
 try{w.AbortSignal=AbortSignal;w.fetch=async(url,options)=>{calls.push({url,options});const q=new URL(url).searchParams;
  if(q.get('action')==='query'){
   if(fail)return {ok:false};
   return new Promise(resolve=>pending.push(resolve));
  }
  const id=q.get('pageid'),data=id==='2'?payload('Rice',changed?'eggs':'rice'):id==='3'?payload('Vegetable soup','chicken stock'):payload('Unlabelled rice','rice',[]);
  if(holdParse)return new Promise(resolve=>parseReply=()=>resolve({ok:true,json:async()=>data}));
  return {ok:true,json:async()=>data};
 };w.addIngRow=i=>{const n=w.document.createElement('span');n.textContent=i.name;w.document.getElementById('ingRows').append(n);};w.checkBanned=()=>{};w.confirm=()=>true;w.eval(readFileSync(new URL('../public/roomio-recipes.js',import.meta.url),'utf8'));const ui=w.RoomioRecipes,$=id=>w.document.getElementById(id);
 const reply=items=>{for(const resolve of pending.splice(0))resolve({ok:true,json:async()=>({query:{search:items}})});};
 ui.search('d');ui.search('da');ui.search('dal');await delay(550);assert.equal(calls.length,2);assert.ok(calls.every(c=>new URL(c.url).searchParams.get('srsearch').includes('incategory:')));assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.referrerPolicy,'no-referrer');
 ui.search('rice');reply([{pageid:1,title:'Cookbook:Stale Dal'}]);await delay(550);assert.equal($('recipeOnlineResults').textContent,'');reply([{pageid:2,title:'Cookbook:Rice'},{pageid:3,title:'Cookbook:Vegetable soup'},{pageid:4,title:'Cookbook:Unlabelled rice'}]);await delay(30);
 assert.equal($('recipeOnlineResults').textContent,'Rice');assert.equal($('dName').value,'');
 await ui.choose(2);assert.equal($('dName').value,'Rice');assert.equal($('dInstructions').value,'1. Cook until tender.');assert.match(ui.fields().source.url,/oldid=42/);
 holdParse=true;const slow=ui.choose(2);$('dNotes').value='My new note';parseReply();await slow;assert.equal($('dNotes').value,'My new note');assert.match($('recipeOnlineStatus').textContent,/draft changed/);
 const unit=w.document.createElement('select');unit.innerHTML='<option>g</option><option>kg</option>';$('ingRows').append(unit);const unitChange=ui.choose(2);unit.value='kg';parseReply();await unitChange;assert.match($('recipeOnlineStatus').textContent,/draft changed/);unit.remove();
 holdParse=false;changed=true;await ui.choose(2);assert.match($('recipeOnlineStatus').textContent,/Vegetarian dishes only/);assert.equal($('dNotes').value,'My new note');
 fail=true;ui.search('soup');await delay(550);await delay(10);assert.match($('recipeOnlineStatus').textContent,/Could not reach/);const count=calls.length;ui.search('chicken');await delay(550);assert.equal(calls.length,count);assert.match($('recipeOnlineStatus').textContent,/Vegetarian dishes only/);
 $('recipeOnlineEnabled').checked=false;ui.search('private variation');await delay(550);assert.equal(calls.length,count);
 }finally{w.RoomioRecipes?.clear();w.close();}
});

test('search results follow Swaminarayan and Vegan modes and label editable adaptations',{timeout:5000},async()=>{
 const dom=new JSDOM('<div id="sheet-dish" class="show"></div><input id="recipeOnlineEnabled" type="checkbox" checked><p id="recipeOnlineStatus"></p><div id="recipeOnlineResults"></div><input id="dName"><input id="dServes"><textarea id="dInstructions"></textarea><textarea id="dNotes"></textarea><div id="ingRows"></div><div id="dRecipeSource"></div><div id="recipeShareActions"></div>',{url:'https://roomio.test',runScripts:'outside-only'}),w=dom.window,queries=[];let mode='swaminarayan';
 try{w.AbortSignal=AbortSignal;w.RoomioFamily={getDiet:()=>mode};w.fetch=async(url)=>{const q=new URL(url).searchParams;if(q.get('action')==='query'){queries.push(q.get('srsearch'));return {ok:true,json:async()=>({query:{search:[{pageid:2,title:'Cookbook:Paneer rice'},{pageid:3,title:'Cookbook:Garlic soup'},{pageid:4,title:'Cookbook:Rice'}]}})}}
  const id=q.get('pageid'),data=id==='2'?payload('Paneer rice','paneer'):id==='3'?payload('Garlic soup','onion'):payload('Rice','rice');return {ok:true,json:async()=>data};};w.eval(readFileSync(new URL('../public/roomio-recipes.js',import.meta.url),'utf8'));const ui=w.RoomioRecipes,$=id=>w.document.getElementById(id);
 ui.search('rice');await delay(600);assert.match($('recipeOnlineResults').textContent,/Paneer rice/);assert.doesNotMatch($('recipeOnlineResults').textContent,/Garlic soup/);assert.match($('recipeOnlineStatus').textContent,/Swaminarayan recipes/);
 mode='vegan';ui.modeChanged();assert.equal($('recipeOnlineResults').textContent,'');queries.length=0;ui.search('rice');await delay(600);assert.equal(queries.length,1);assert.match(queries[0],/Vegan recipes/);assert.match($('recipeOnlineResults').textContent,/firm tofu rice · adapted/);assert.match($('recipeOnlineResults').textContent,/Garlic soup/);assert.match($('recipeOnlineStatus').textContent,/Vegan recipes/);
 }finally{w.RoomioRecipes?.clear();w.close();}
});

test('choosing an online recipe tidies ingredient amounts before filling the editable draft',async()=>{
 const dom=new JSDOM('<div id="sheet-dish" class="show"></div><input id="recipeOnlineEnabled" type="checkbox" checked><p id="recipeOnlineStatus"></p><div id="recipeOnlineResults"></div><input id="dName"><input id="dServes"><textarea id="dInstructions"></textarea><textarea id="dNotes"></textarea><div id="ingRows"></div><div id="dRecipeSource"></div><div id="recipeShareActions"></div>',{url:'https://roomio.test',runScripts:'outside-only'}),w=dom.window,filled=[];
 try{w.fetch=async()=>({ok:true,json:async()=>({parse:{title:'Cookbook:Vegetable rice',revid:42,categories:[{category:'Vegan_recipes'}],text:'<div class="mw-parser-output"><h2>Ingredients</h2><ul><li>250.123456 g rice</li><li>1/3 cup lentils</li><li>0.5 L water</li></ul><h2>Method</h2><p>Cook until tender.</p></div>'}})});w.AbortSignal=AbortSignal;w.addIngRow=i=>filled.push(i);w.checkBanned=()=>{};w.confirm=()=>true;w.eval(readFileSync(new URL('../public/roomio-recipes.js',import.meta.url),'utf8'));await w.RoomioRecipes.choose(42);assert.deepEqual(filled.map(i=>[i.qty,i.unit]),[[250,'g'],[1/3,'cup'],[500,'ml']]);assert.equal(w.document.getElementById('dName').value,'Vegetable rice');assert.match(w.RoomioRecipes.fields().source.url,/oldid=42/);
 }finally{w.RoomioRecipes?.clear();w.close();}
});
