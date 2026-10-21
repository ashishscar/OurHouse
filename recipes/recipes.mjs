// Recipe interchange is local. Only explicit online searches contact Wikibooks.
import {assertVegetarian} from './vegetarian.mjs';
export const licenseURL='https://creativecommons.org/licenses/by-sa/4.0/';
const fractions={'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875};
const units={g:'g',grams:'g',gram:'g',kg:'kg',kilograms:'kg',ml:'ml',l:'L',litres:'L',liters:'L',cup:'cup',cups:'cup',tsp:'tsp',teaspoon:'tsp',teaspoons:'tsp',tbsp:'tbsp',tablespoon:'tbsp',tablespoons:'tbsp',pcs:'pcs',piece:'pcs',pieces:'pcs',bunch:'bunch',bunches:'bunch',packet:'packet',packets:'packet',muthi:'muthi'};
const clean=(s,max)=>{if(typeof s!=='string'||s.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))throw Error('Recipe text is too long or contains invalid characters.');return s.trim();};
export function safeURL(s){if(!s)return '';try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function parseIngredient(line){
 const original=clean(line,120).replace(/^[-*•]\s*/,''),converted=original.replace(/(\d)([½¼¾⅓⅔⅛⅜⅝⅞])/g,'$1 $2').replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g,m=>String(fractions[m]));
 const match=converted.match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\s+0\.\d+)?|\d+\/\d+)\s+(.+)$/);if(!match)return {name:original,qty:null,unit:'pcs'};
 const parts=match[1].split(/\s+/),quantity=parts.reduce((n,p)=>{const [a,b]=p.split('/').map(Number);return n+(b?a/b:a);},0),rest=match[2],word=rest.match(/^([a-zA-Z]+)\.?\s+(.+)$/),unit=word&&units[word[1].toLowerCase()];
 // Keep ambiguous ranges/measurements as written instead of inventing a conversion.
 return Number.isFinite(quantity)&&quantity<=1e9?{name:unit?word[2]:rest,qty:Math.round(quantity*10000)/10000,unit:unit||'pcs'}:{name:original,qty:null,unit:'pcs'};
}
export function normalizeRecipe(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose one recipe to import.');
 if(['roomio-recipe','ourhouse-recipe'].includes(value.format)&&value.version!==1)throw Error('Unsupported recipe file version.');
 const r=['roomio-recipe','ourhouse-recipe'].includes(value.format)?value.recipe:value;
 if(!r||typeof r!=='object')throw Error('This recipe file is invalid.');
 const name=clean(r.name||'',100);if(!name)throw Error('Add the recipe name on the first line.');
 const items=r.ingredients||r.recipeIngredient||[];if(!Array.isArray(items)||items.length>200)throw Error('A recipe can have up to 200 ingredients.');
 const ingredients=items.map(item=>{if(typeof item==='string')return parseIngredient(item);if(!item||typeof item!=='object')throw Error('Invalid ingredient');const n=clean(item.name||'',120),qty=item.qty??null,unit=clean(item.unit||'pcs',24);if(!n||qty!==null&&(typeof qty!=='number'||!Number.isFinite(qty)||qty<0||qty>1e9)||!Object.values(units).includes(unit))throw Error('Check ingredient quantities and units.');return {name:n,qty,unit};});
 let instructions=r.instructions??r.recipeInstructions??'';if(Array.isArray(instructions))instructions=instructions.map((s,i)=>`${i+1}. ${typeof s==='string'?s:s.text||''}`).join('\n');
 const out={name,servings:Number(r.servings??parseFloat(r.recipeYield)??1)||1,ingredients,instructions:clean(instructions,20000),notes:clean(r.notes||'',5000)};
 if(!Number.isFinite(out.servings)||out.servings<1||out.servings>50)throw Error('Use 1–50 servings.');
 if(r.source){const src=r.source,url=safeURL(src.url),licenseUrl=safeURL(src.licenseUrl);if(!url||!licenseUrl)throw Error('Recipe source and license links must use HTTPS.');out.source={provider:clean(src.provider||'Recipe source',80),title:clean(src.title||name,150),url,authors:clean(src.authors||'Source contributors',200),license:clean(src.license||'See source',80),licenseUrl,modified:true};}
 return assertVegetarian(out);
}
export function parseRecipe(text){
 text=clean(text,100000);if(!text)throw Error('Paste a recipe or choose a recipe file.');
 if(/^[\[{]/.test(text)){let data;try{data=JSON.parse(text);}catch{throw Error('The JSON recipe file is not valid.');}return normalizeRecipe(data);}
 const lines=text.replace(/\r/g,'').split('\n'),first=lines.findIndex(l=>l.trim());let name=lines[first].replace(/^#+\s*|^Recipe:\s*/ig,'').trim(),section='',ingredients=[],steps=[],notes=[],servings=1,source={};
 for(const raw of lines.slice(first+1)){const line=raw.trim();if(!line||/^Adapted in (?:OurHouse|Roomio); changes may have been made\.$/.test(line))continue;const portions=line.match(/^(?:serves|servings|yield)\s*:\s*(\d+)\b/i);if(portions){servings=Number(portions[1]);continue;}const credit=line.match(/^(Source|Authors|License|License URL)\s*:\s*(.*)$/i);if(credit){const field=credit[1].toLowerCase(),v=credit[2];if(field==='source')source.url=v;else if(field==='authors')source.authors=v;else if(field==='license url')source.licenseUrl=v;else source.license=v;continue;}
 if(/^(?:ingredients|you(?:’|')?ll need)\s*:?$/i.test(line)){section='ingredients';continue;}if(/^(?:instructions|method|directions|steps|procedure)\s*:?$/i.test(line)){section='steps';continue;}if(/^notes\s*:?$/i.test(line)){section='notes';continue;}
 if(section==='ingredients')ingredients.push(line);else if(section==='steps')steps.push(line);else if(section==='notes')notes.push(line);else if(/^[-*•]\s|^\d+(?:[½¼¾]|[./\s])|^[½¼¾⅓⅔]/.test(line))ingredients.push(line);else notes.push(line);
 }
 if(!ingredients.length&&!steps.length&&!notes.length)throw Error('Include the recipe ingredients or instructions after its name.');
 // Unstructured message text is preserved in Notes for human review, never sent to AI.
 return normalizeRecipe({name,servings,ingredients,instructions:steps.join('\n'),notes:notes.join('\n'),...(source.url?{source:{...source,provider:'Shared recipe',title:name,licenseUrl:source.licenseUrl||source.url}}:{})});
}
export const exportRecipe=recipe=>JSON.stringify({format:'ourhouse-recipe',version:1,recipe:normalizeRecipe(recipe)},null,2);
export function messageRecipe(recipe){const r=normalizeRecipe(recipe);return [r.name,`Servings: ${r.servings}`,'','Ingredients',...r.ingredients.map(i=>`- ${i.qty===null?'':i.qty+' '+i.unit+' '}${i.name}`),'','Instructions',r.instructions,'','Notes',r.notes,...(r.source?['',`Source: ${r.source.url}`,`Authors: ${r.source.authors}`,`License: ${r.source.license}`,`License URL: ${r.source.licenseUrl}`,'Adapted in OurHouse; changes may have been made.']:[])].join('\n').trim();}
export function wikiRecipe(payload,DOM){const parsed=payload?.parse;if(!parsed||!parsed.title?.startsWith('Cookbook:')||typeof parsed.text!=='string'||parsed.text.length>1500000)throw Error('This recipe is unavailable. Try another result.');
 if(!parsed.categories?.some(c=>/^(Vegetarian|Vegan)_recipes$/i.test(c.category||'')))throw Error('Only recipes labelled vegetarian or vegan by the source can be suggested.');
 const doc=new DOM().parseFromString(parsed.text,'text/html');doc.querySelectorAll('script,style,iframe,img,svg,.mw-editsection,.reference').forEach(n=>n.remove());
 const ingredients=[],steps=[];let section='';
 for(const node of doc.querySelector('.mw-parser-output')?.children||[]){const heading=node.matches('h2')?node:node.querySelector('h2');if(heading){const title=heading.textContent.trim();section=/^ingredients/i.test(title)?'ingredients':/^(procedure|method|directions|preparation|instructions)/i.test(title)?'steps':'';continue;}
  if(section){const entries=node.matches('ul,ol')?[...node.children].filter(n=>n.tagName==='LI').map(n=>n.textContent.trim()):node.matches('p')?[node.textContent.trim()]:[];for(const line of entries.filter(Boolean)){if(section==='ingredients')ingredients.push(line);else steps.push(line);}}
 }
 if(!ingredients.length||!steps.length)throw Error('This page has no complete recipe to extract. Choose another result or paste a recipe.');
 const servings=[...doc.querySelectorAll('.infobox tr')].find(tr=>/servings/i.test(tr.querySelector('th')?.textContent||''))?.querySelector('td')?.textContent||'';
 return normalizeRecipe({name:parsed.title.slice(9).slice(0,100),servings:parseInt(servings)||1,ingredients:ingredients.slice(0,200),instructions:steps.map((s,i)=>`${i+1}. ${s}`).join('\n'),notes:servings?'Check the extracted quantities and serving size before saving.':'Source serving size was not specified. Set the serving size before saving.',source:{provider:'Wikibooks Cookbook',title:parsed.title.slice(9),url:'https://en.wikibooks.org/w/index.php?oldid='+parsed.revid,authors:'Wikibooks contributors (see source page history)',license:'CC BY-SA 4.0',licenseUrl:licenseURL}});
}
