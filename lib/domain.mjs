import {diets} from '../recipes/diets.mjs';
import Ledger from './expense-ledger.cjs';
import Receipts from './receipt-schema.cjs';
export const clone=v=>JSON.parse(JSON.stringify(v));
export class AppError extends Error {constructor(message,status=400,code='INVALID'){super(message);this.status=status;this.code=code;}}
export const fail=(m,status=400,code='INVALID')=>{throw new AppError(m,status,code)};
export const name=(s,max=80)=>{if(typeof s!=='string'||!s.trim()||s.trim().length>max||/[\x00-\x1f\x7f]/.test(s))fail('Enter a valid name');return s.trim()};
export const safeKey=s=>typeof s==='string'&&/^[A-Za-z0-9_:-]{1,128}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);
export const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
export const initialData=()=>({dishes:{},weeks:{},grocery:{},pantry:{},bills:{},duties:{list:[],types:[],memberOrder:[],extraPeople:{}},waterBills:{},expenseGroups:{},settings:{people:4,sattvik:false,autoGrocery:true,currency:'C$'}});
export function diff(before,after,path=[]){
 if(same(before,after))return [];
 if(before&&after&&!Array.isArray(before)&&!Array.isArray(after)&&typeof before==='object'&&typeof after==='object')return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(k=>diff(before[k],after[k],[...path,k]));
 return [{path:path.join('/'),before:before??null,value:after??null}];
}
export function at(obj,path){return path.split('/').reduce((v,k)=>v?.[k],obj)??null;}
export function set(obj,path,value){const keys=path.split('/');let node=obj;for(const k of keys.slice(0,-1))node=node[k]??={};if(value===null)delete node[keys.at(-1)];else node[keys.at(-1)]=clone(value);}
export function validateData(data,members){
 for(const bucket of ['grocery','pantry','dishes','weeks','expenseGroups']){if(!data[bucket]||typeof data[bucket]!=='object'||Array.isArray(data[bucket])||Object.keys(data[bucket]).length>2000)fail('Household collection limit exceeded');}
 const nonneg=n=>n===null||n===undefined||typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9;
 for(const bucket of ['grocery','pantry'])for(const item of Object.values(data[bucket])){name(item.name,120);if(!nonneg(item.qty)||!nonneg(item.threshold)||typeof item.unit!=='string'||item.unit.length>24)fail('Check item quantity and measuring unit');}
 for(const recipe of Object.values(data.dishes)){name(recipe.name,120);for(const [key,max] of [['instructions',20000],['notes',5000]])if(recipe[key]!=null&&(typeof recipe[key]!=='string'||recipe[key].length>max))fail('Recipe instructions or notes are too long');if(!Number.isFinite(recipe.servings)||recipe.servings<=0||recipe.servings>1000||!Array.isArray(recipe.ingredients)||recipe.ingredients.length>200)fail('Check recipe portions and ingredients');for(const item of recipe.ingredients){name(item.name,120);if(!nonneg(item.qty)||typeof item.unit!=='string'||item.unit.length>24)fail('Check ingredient measurements');}}
 const names=new Set();for(const recipe of Object.values(data.dishes)){if(recipe.deletedAt||recipe.mergedInto)continue;const key=recipe.name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');if(names.has(key))fail('A recipe with this name already exists. Edit that recipe instead.');names.add(key);}
 for(const week of Object.values(data.weeks))for(const [key,day] of Object.entries(week)){if(key.startsWith('_'))continue;if(!day||typeof day!=='object')fail('Invalid meal plan');if(day.dishes&&(!Array.isArray(day.dishes)||day.dishes.length>30||day.dishes.some(k=>!safeKey(k))))fail('Invalid planned recipes');if(day.people!=null&&(!Number.isFinite(day.people)||day.people<1||day.people>1000))fail('Check planned portions');}
 if(data.settings?.diet!=null&&!Object.hasOwn(diets,data.settings.diet))fail('Choose a supported kitchen mode');
 if(!data.settings||!Number.isInteger(data.settings.people)||data.settings.people<1||data.settings.people>50||typeof data.settings.currency!=='string'||data.settings.currency.length>5||data.settings.sattvik!==false)fail('Check household settings');
 for(const group of Object.values(data.expenseGroups)){
  const meta=group.meta;if(!meta)fail('Save the expense group first');name(meta.name);Ledger.precision(meta.currency);if(!meta.people||Object.keys(meta.people).length>200||!Object.values(meta.people).some(p=>p.active))fail('Choose people for this expense group');
  for(const [k,p] of Object.entries(meta.people)){if(!safeKey(k))fail('Invalid group person');name(p.name,60);if(typeof p.active!=='boolean')fail('Invalid group person status');}
  for(const entry of Object.values(group.entries||{})){Ledger.validate(entry);const people=entry.type==='payment'?[entry.from,entry.to]:[...Object.keys(entry.paid),...Object.keys(entry.shares)];if(people.some(k=>!Object.hasOwn(meta.people,k)))fail('Expense participants must belong to this group');if(entry.receipts)Receipts.references(entry.receipts);if(entry.method==='itemized'&&!entry.deleted){const result=Ledger.itemize(entry.items,entry.charges||{},entry.currency);if(result.amount!==entry.amount||Object.keys({...result.shares,...entry.shares}).some(k=>(result.shares[k]||0)!==(entry.shares[k]||0)))fail('Itemized receipt does not match its split');}}
  Ledger.balances(group.entries||{});
 }
 if(JSON.stringify(data).length>2e6)fail('This prototype household has reached its storage limit',413);
}
