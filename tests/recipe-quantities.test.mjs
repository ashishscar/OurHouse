import test from 'node:test';
import assert from 'node:assert/strict';
import {tidyIngredient,formatAmount,parseAmount,readAmount} from '../recipes/quantities.mjs';

test('suggestion amounts use rounded weights and practical units without dropping small ingredients',()=>{
 const tidy=(qty,unit)=>tidyIngredient({name:'Ingredient',qty,unit});
 assert.deepEqual(tidy(250.123456,'g'),{name:'Ingredient',qty:250,unit:'g'});
 assert.deepEqual(tidy(.250123456,'kg'),{name:'Ingredient',qty:250,unit:'g'});
 assert.deepEqual(tidy(.3333333,'L'),{name:'Ingredient',qty:333,unit:'ml'});
 assert.equal(tidy(1.23456789,'kg').qty,1.23);
 assert.equal(tidy(.004321,'g').qty,.0043);
 assert.equal(tidy(0,'tsp').qty,0);
 assert.equal(tidy(null,'cup').qty,null);
});
test('common cooking fractions stay accurate and accept familiar keyboard forms',()=>{
 assert.equal(tidyIngredient({name:'Rice',qty:.3333,unit:'cup'}).qty,1/3);
 assert.equal(tidyIngredient({name:'Rice',qty:1.6667,unit:'cup'}).qty,1+2/3);
 assert.equal(formatAmount(1/3,'cup'),'⅓');assert.equal(formatAmount(1.5,'cup'),'1 ½');
 assert.equal(formatAmount(.125,'tsp'),'⅛');assert.equal(formatAmount(250,'g'),'250');
 for(const [text,expected] of [['½',.5],['1/2',.5],['0.5',.5],['1⅓',1+1/3],['1 1/3',1+1/3],['',null],['0',0]])assert.equal(parseAmount(text),expected,text);
 for(const text of ['-1','1/0','a little','2abc','1.2.3','Infinity'])assert.throws(()=>parseAmount(text));
});
test('an untouched fraction display preserves the exact previously saved quantity',()=>{
 const input={value:'⅓',dataset:{initialAmount:'⅓',originalAmount:'0.3333'}};
 assert.equal(readAmount(input),.3333);input.value='½';assert.equal(readAmount(input),.5);
 assert.equal(formatAmount(250.123456,'g'),'250.123456');
 const original={name:'Rice',qty:.3333,unit:'cup'};tidyIngredient(original);assert.equal(original.qty,.3333);
});
