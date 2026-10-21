import test from 'node:test';import assert from 'node:assert/strict';import {shoppingEntry} from '../recipes/shopping.mjs';
test('quick shopping accepts names, prefix/suffix quantities and cooking fractions without truncating product names',()=>{
 for(const [text,expected] of [['Rice',{name:'Rice',qty:null,unit:'pcs'}],['2 kg rice',{name:'rice',qty:2,unit:'kg'}],['rice 2kg',{name:'rice',qty:2,unit:'kg'}],['½ cup lentils',{name:'lentils',qty:.5,unit:'cup'}],['Water 1/3 L',{name:'Water',qty:1/3,unit:'L'}],['1 ½ cups oats',{name:'oats',qty:1.5,unit:'cup'}],['2 apples',{name:'apples',qty:2,unit:'pcs'}],['7up',{name:'7up',qty:null,unit:'pcs'}],['Milk 2%',{name:'Milk 2%',qty:null,unit:'pcs'}]])assert.deepEqual(shoppingEntry(text),expected);
 assert.deepEqual(shoppingEntry('Rice','1/2','kg'),{name:'Rice',qty:.5,unit:'kg'});
 for(const amount of ['0','-2','NaN','Infinity','2x'])assert.throws(()=>shoppingEntry('Rice',amount,'kg'));
});
