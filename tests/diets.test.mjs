import test from 'node:test';import assert from 'node:assert/strict';
import {diets,dietIssues,matchesDiet,assertCompleteDiet,validateDietChanges,adaptRecipe} from '../recipes/diets.mjs';
const recipe=(ingredients,extra={})=>({name:'Family curry',servings:4,ingredients:ingredients.map(name=>({name,qty:1,unit:'cup'})),instructions:'Simmer gently.',notes:'',...extra});
test('three kitchen modes share the vegetarian rule and distinguish alliums and animal products',()=>{
 assert.deepEqual(Object.keys(diets),['swaminarayan','vegetarian','vegan']);
 for(const mode of Object.keys(diets))for(const ingredient of ['chicken','fish sauce','egg whites','gelatin'])assert.equal(matchesDiet(recipe([ingredient]),mode),false,mode+ingredient);
 for(const ingredient of ['onion','garlic paste','onion powder','shallots','spring onion','પ્યાજ','लहसुन']){assert.equal(matchesDiet(recipe([ingredient]),'swaminarayan'),false,ingredient);assert.equal(matchesDiet(recipe([ingredient]),'vegetarian'),true,ingredient);}
 for(const ingredient of ['paneer','milk','ghee','yogurt','honey','whey','casein','घी','દૂધ'])assert.equal(matchesDiet(recipe([ingredient]),'vegan'),false,ingredient);
 for(const ingredient of ['soy milk','coconut cream','vegan butter','peanut butter','cream of tartar','butter beans','maple syrup'])assert.equal(matchesDiet(recipe([ingredient]),'vegan'),true,ingredient);
 assert.equal(matchesDiet(recipe(['paneer','garlic']),'vegetarian'),true);assert.equal(matchesDiet(recipe(['paneer']),'swaminarayan'),true);
 assert.equal(matchesDiet(recipe(['lentils'],{notes:'No onion and garlic. Garlic-free.'}),'swaminarayan'),true);
 for(const key of ['name','instructions','notes'])assert.ok(dietIssues(recipe(['lentils'],{[key]:'Add garlic paste'}),'swaminarayan').includes('garlic'));
});
test('supported vegan adaptations update ingredient names and method together without modifying the original or source credit',()=>{
 const input=recipe(['paneer','milk','ghee','coconut milk'],{name:'Paneer curry',instructions:'Fry paneer in ghee. Stir in milk.',source:{url:'https://example.org/recipe',license:'CC BY-SA 4.0'}}),copy=structuredClone(input),out=adaptRecipe(input,'vegan');
 assert.deepEqual(input,copy);assert.equal(out.recipe.ingredients[0].name,'firm tofu');assert.equal(out.recipe.ingredients[0].qty,1);assert.equal(out.recipe.ingredients[3].name,'coconut milk');assert.match(out.recipe.instructions,/firm tofu in vegetable oil/);assert.match(out.recipe.notes,/review ingredient labels/);assert.equal(out.recipe.source.url,input.source.url);assert.equal(out.recipe.source.modified,true);assert.ok(out.changes.length);assert.equal(matchesDiet(out.recipe,'vegan'),true);
 assert.throws(()=>adaptRecipe(recipe(['whey']),'vegan'),/Vegan recipes only/);assert.throws(()=>adaptRecipe(recipe(['chicken']),'vegan'),/Vegetarian dishes only/);
});
test('Swaminarayan adaptation omits simple optional aromatics and refuses to invent different cooking techniques',()=>{
 const input=recipe(['lentils','garlic, optional']);const out=adaptRecipe(input,'swaminarayan');assert.equal(out.recipe.ingredients.length,1);assert.equal(input.ingredients.length,2);assert.equal(matchesDiet(out.recipe,'swaminarayan'),true);
 assert.throws(()=>adaptRecipe(recipe(['lentils','onion'],{instructions:'Fry onion until golden. Add lentils.'}),'swaminarayan'),/cooking steps edited/);
 assert.throws(()=>adaptRecipe(recipe(['lentils','onion and tomato paste']),'swaminarayan'),/mixed ingredient/);
});
test('mode changes retain old recipes but block new incompatible edits and newly planned meals',()=>{
 const before={settings:{diet:'vegetarian'},dishes:{dairy:recipe(['paneer']),allium:recipe(['garlic']),plant:recipe(['lentils'])},weeks:{}};
 const vegan={...before,settings:{diet:'vegan'}};assert.doesNotThrow(()=>validateDietChanges(before,vegan));
 assert.throws(()=>validateDietChanges(vegan,{...vegan,dishes:{...vegan.dishes,dairy:recipe(['paneer'],{notes:'Changed'})}}),/Vegan recipes only/);
 assert.throws(()=>validateDietChanges(vegan,{...vegan,weeks:{week:{mon:{dishes:['dairy']}}}}),/Vegan recipes only/);
 assert.doesNotThrow(()=>validateDietChanges(vegan,{...vegan,dishes:{...vegan.dishes,dairy:adaptRecipe(before.dishes.dairy,'vegan').recipe}}));
 const swami={...before,settings:{diet:'swaminarayan'}};assert.throws(()=>validateDietChanges(swami,{...swami,weeks:{week:{mon:{dishes:['allium']}}}}),/Swaminarayan recipes only/);assert.doesNotThrow(()=>assertCompleteDiet(before.dishes.dairy,'swaminarayan'));
});
