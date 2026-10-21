import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCompleteVegetarian,isVegetarian,isPlannable,validateVegetarianChanges} from '../recipes/vegetarian.mjs';
import {parseRecipe,exportRecipe,messageRecipe} from '../recipes/recipes.mjs';
const recipe=(ingredient,name='Family soup')=>({name,ingredients:[{name:ingredient,qty:1,unit:'cup'}],instructions:'Simmer gently.',notes:''});
test('vegetarian policy excludes eggs, animal foods and hidden animal-derived ingredients',()=>{
 for(const food of ['chicken','beef','bacon','mutton','salmon','prawns','oyster sauce','fish sauce','anchovies','bonito','lard','gelatin','animal rennet','egg whites','albumen','shrimp paste','Worcestershire sauce','imitation crab','parmesan','stock','broth','mayonnaise','vegetarian eggs','ઈંડા','अंडा','માછલી'])assert.equal(isVegetarian(recipe(food)),false,food);
 for(const field of ['name','instructions','notes'])assert.equal(isVegetarian({...recipe('lentils'),[field]:'Add chicken stock'}),false,field);
 assert.equal(isVegetarian(recipe('vegan sauce with chicken')),false);
 assert.equal(isVegetarian(recipe('vegetable stock with fish sauce')),false);
});
test('dairy, vegetables, alliums and explicit plant substitutes remain available',()=>{
 for(const food of ['paneer','milk','butter','cream','yogurt','cheese','ghee','honey','onion','garlic','eggplant','chickpeas','nutmeg','oyster mushrooms','beefsteak tomatoes','vegetable stock','mushroom broth','vegan mayonnaise','egg-free mayonnaise','vegetarian parmesan','microbial rennet','vegan chicken','plant-based sausage','vegetarian fish sauce','vegan egg replacement'])assert.equal(isVegetarian(recipe(food)),true,food);
 assert.equal(isVegetarian({...recipe('lentils'),notes:'No eggs. Without meat. Egg-free recipe.'}),true);
});
test('message and JSON imports and exports all enforce the dietary policy',()=>{
 assert.throws(()=>parseRecipe('Soup\nIngredients\n- chicken stock\nInstructions\nSimmer.'),/Vegetarian dishes only/);
 assert.throws(()=>parseRecipe('Soup\nAdd fish sauce and simmer.'),/Vegetarian dishes only/);
 assert.throws(()=>parseRecipe(JSON.stringify({format:'ourhouse-recipe',version:1,recipe:recipe('eggs')})),/Vegetarian dishes only/);
 assert.throws(()=>exportRecipe(recipe('gelatin')),/Vegetarian dishes only/);
 assert.throws(()=>messageRecipe(recipe('pork')),/Vegetarian dishes only/);
 assert.equal(parseRecipe(exportRecipe(recipe('paneer'))).ingredients[0].name,'paneer');
});
test('new/edited recipes and meal plans are checked without deleting or blocking access to old records',()=>{
 const before={dishes:{old:recipe('chicken'),veg:recipe('lentils'),draft:{name:'Dal',ingredients:[]}},weeks:{},pantry:{}};
 assert.doesNotThrow(()=>validateVegetarianChanges(before,{...before,pantry:{salt:{name:'salt'}}}));
 assert.throws(()=>validateVegetarianChanges(before,{...before,dishes:{...before.dishes,added:recipe('eggs')}}),/Vegetarian dishes only/);
 assert.throws(()=>validateVegetarianChanges(before,{...before,dishes:{...before.dishes,veg:recipe('fish sauce')}}),/Vegetarian dishes only/);
 assert.throws(()=>validateVegetarianChanges(before,{...before,weeks:{week:{mon:{dishes:['old']}}}}),/Vegetarian dishes only/);
 assert.throws(()=>validateVegetarianChanges(before,{...before,weeks:{week:{mon:{dishes:['draft']}}}}),/Add the vegetarian ingredients/);
 assert.doesNotThrow(()=>validateVegetarianChanges(before,{...before,dishes:{...before.dishes,old:recipe('paneer')},weeks:{week:{mon:{dishes:['old','veg']}}}}));
 assert.doesNotThrow(()=>validateVegetarianChanges(before,{...before,dishes:{veg:before.dishes.veg}}));
 assert.throws(()=>assertCompleteVegetarian({name:'Dal',ingredients:[]}),/Add the vegetarian ingredients/);
 assert.equal(isPlannable({name:'Dal',ingredients:[]}),false);
 assert.equal(isPlannable(recipe('lentils')),true);
});
