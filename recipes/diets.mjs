import {vegetarianIssues,assertVegetarian} from './vegetarian.mjs';
export const diets={swaminarayan:{label:'Swaminarayan',description:'Vegetarian · no onion or garlic. Dairy allowed.'},vegetarian:{label:'Vegetarian',description:'No eggs, meat, fish or seafood. Dairy allowed.'},vegan:{label:'Vegan',description:'Plant-based · no eggs, dairy, honey or animal ingredients.'}};
export const dietMode=value=>Object.hasOwn(diets,value)?value:'vegetarian';
const allium=/\b(?:onions?|garlic|shallots?|scallions?|leeks?|chives?)\b|(?:प्याज|प्याज़|लहसुन|ડુંગળી|પ્યાજ|કાંદા|લસણ)/giu;
const dairy=/\b(?:milk|cream|butter|ghee|paneer|yogurt|yoghurt|curd|cheese|cheddar|mozzarella|parmesan|whey|casein|caseinate|lactose|buttermilk|kefir|honey|beeswax|propolis|royal jelly)\b|(?:दूध|दही|घी|मक्खन|पनीर|शहद|દૂધ|દહીં|ઘી|પનીર|મધ)/giu;
const textFields=r=>[r?.name,...Object.values(r?.ingredients||{}).map(i=>typeof i==='string'?i:i?.name),r?.instructions,r?.notes];
function modeText(text,mode){let s=String(text||'').normalize('NFKC');if(mode==='swaminarayan')return s.replace(/\b(?:no|without)\s+(?:onions?|garlic)(?:\s+(?:and|or)\s+(?:onions?|garlic))?\b|\b(?:onion|garlic)[ -]free\b/gi,' ');
 return s.replace(/\b(?:coconut|almond|oat|soy|soya|cashew|rice|pea|hemp|plant[ -]based|vegan)\s+(?:milk|cream|butter|yogurt|yoghurt|curd|cheese|cheddar|mozzarella|parmesan)(?:\s+powder)?\b|\b(?:peanut|cocoa|shea) butter\b|\bcream of tartar\b|\bbutter beans\b|\b(?:dairy|milk|honey)[ -]free\b|\b(?:no|without)\s+(?:dairy|milk|honey)\b/gi,' ');
}
export function dietIssues(recipe,mode='vegetarian'){mode=dietMode(mode);const issues=vegetarianIssues(recipe);if(mode!=='vegetarian')for(const text of textFields(recipe))for(const m of modeText(text,mode).matchAll(mode==='vegan'?dairy:allium))issues.push(m[0].toLowerCase());return [...new Set(issues)];}
export function assertDiet(recipe,mode='vegetarian'){assertVegetarian(recipe);const issues=dietIssues(recipe,mode);if(issues.length)throw Object.assign(Error(diets[dietMode(mode)].label+' recipes only. Remove or replace: '+issues.join(', ')+'.'),{status:400,code:'DIET_ONLY'});return recipe;}
export const matchesDiet=(recipe,mode)=>!!recipe&&!dietIssues(recipe,mode).length;
export function assertCompleteDiet(recipe,mode){assertDiet(recipe,mode);if(!Object.values(recipe?.ingredients||{}).some(i=>String(typeof i==='string'?i:i?.name||'').trim()))throw Object.assign(Error('Add the ingredients before saving or planning this dish.'),{status:400,code:'RECIPE_INGREDIENTS_REQUIRED'});return recipe;}
export const plannable=(r,mode)=>matchesDiet(r,mode)&&Object.values(r.ingredients||{}).some(i=>String(typeof i==='string'?i:i?.name||'').trim());
const content=d=>JSON.stringify(d&&[d.name,d.ingredients,d.instructions,d.notes]);
export function validateDietChanges(before,after){const mode=dietMode(after?.settings?.diet);
 for(const [id,d] of Object.entries(after?.dishes||{}))if(d&&content(d)!==content(before?.dishes?.[id]))assertCompleteDiet(d,mode);
 for(const [week,days] of Object.entries(after?.weeks||{}))for(const [day,value] of Object.entries(days||{}))for(const id of value?.dishes||[])if(!(before?.weeks?.[week]?.[day]?.dishes||[]).includes(id)&&after?.dishes?.[id])assertCompleteDiet(after.dishes[id],mode);
}
const replacements={milk:'unsweetened soy milk',cream:'oat cream',butter:'vegan butter',ghee:'vegetable oil',paneer:'firm tofu',yogurt:'unsweetened soy yogurt',yoghurt:'unsweetened soy yogurt',curd:'unsweetened soy yogurt',cheese:'vegan cheese',cheddar:'vegan cheddar',mozzarella:'vegan mozzarella',parmesan:'vegan parmesan',honey:'maple syrup'};
// Adapt only known ingredient substitutions. Preserve quantities, credit and original records.
// Recipes needing a different technique or an unknown product must be edited by a person.
export function adaptRecipe(input,mode='vegetarian'){
 mode=dietMode(mode);assertVegetarian(input);const recipe=JSON.parse(JSON.stringify(input)),changes=[];
 if(matchesDiet(recipe,mode))return {recipe,changes};
 if(mode==='vegan'){
  const replace=text=>String(text||'').replace(/\b(?:(?:coconut|almond|oat|soy|soya|cashew|rice|pea|hemp|plant[ -]based|vegan)\s+(?:milk|cream|butter|yogurt|yoghurt|curd|cheese|cheddar|mozzarella|parmesan)|(?:peanut|cocoa|shea) butter|cream of tartar|butter beans|milk|cream|butter|ghee|paneer|yogurt|yoghurt|curd|cheese|cheddar|mozzarella|parmesan|honey)\b/gi,word=>{const next=replacements[word.toLowerCase()];if(!next)return word;changes.push(word+' → '+next);return next;});
  for(const field of ['name','instructions','notes'])recipe[field]=replace(recipe[field]);
  recipe.ingredients=recipe.ingredients.map(i=>({...i,name:replace(i.name)}));
 }else if(mode==='swaminarayan'){
  // Omission is safe to draft only when the method doesn't depend on preparing the removed ingredient.
  if([recipe.name,recipe.instructions,recipe.notes].some(t=>[...modeText(t,mode).matchAll(allium)].length))throw Error('This recipe needs its cooking steps edited for Swaminarayan mode. Choose a matching recipe or edit it manually.');
  recipe.ingredients=recipe.ingredients.filter(i=>{if(![...String(i.name).matchAll(allium)].length)return true;
   const rest=String(i.name).replace(allium,'').replace(/\b(?:red|white|yellow|green|spring|fresh|dried|powder|granules|cloves?|paste|chopped|sliced|minced|diced|finely|roughly|and|or|to taste|optional)\b|[\d\s,.()/-]/gi,'');
   if(rest)throw Error('This mixed ingredient needs a confirmed onion-free and garlic-free alternative.');changes.push('Aromatic omitted');return false;});
 }
 assertCompleteDiet(recipe,mode);
 recipe.notes=[recipe.notes,`${diets[mode].label} adaptation: review ingredient labels, quantities, flavour and cooking times before saving.`].filter(Boolean).join('\n');
 if(recipe.source)recipe.source.modified=true;
 return {recipe,changes:[...new Set(changes)]};
}
