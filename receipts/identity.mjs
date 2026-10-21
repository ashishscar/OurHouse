// Suggestions never replace source evidence, quantities or prices. Unknown
// identities keep the printed label; a section remains editable before import.
const aliases={homo:'homogenized',whol:'whole',wht:'white',sourcrm:'sour cream',bodywash:'body wash',evoo:'extra virgin olive oil',veg:'vegetable',veggie:'vegetable',blk:'black',chilli:'chili',chillies:'chili',chilis:'chili',cashews:'cashew',tomatoes:'tomato',bananas:'banana',apples:'apple',peppers:'pepper',olives:'olive',flaxseed:'flax seed',chhas:'chaas',chat:'chaat',seffrong:'saffron',kcp:'ketchup',fr:'french',chs:'cheese',rch:'ranch',ssme:'sesame',bn:'bun',swt:'sweet',niblets:'niblets'};
const words=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/(\d)\s*%/g,'$1percent').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean).flatMap(w=>(aliases[w]||w).split(' '));
const protectedWords=new Set('whole split ground sliced chopped skim skimmed homogenized unsalted salted sweet spicy plain original black green red brown white raw organic frozen fine nylon ratlami surti surati bhavnagari mexican punjabi kewra rose basmati toor moong chilka khichadi paneer tikka masala sour condensed whipping french ranch jalapeno'.split(' '));
// A supported subset is not enough if it drops the product itself or a visible
// flavour. Keep these identity words while allowing brand/pack words to go.
for(const word of 'rice flour atta dal lentil bean pea cashew peanut almond milk cream yogurt yoghurt dahi cheese butter ghee bread wheat bun pav tortilla ketchup sauce dressing chutney pickle achar papad sev gathiya chevdo bhakharwadi bhakarwadi khari makhania boondi mathia jaggery sugar salt oil tea coffee water juice soda cola spice essence tomato potato ginger chili cilantro coriander mint lettuce romaine broccoli cucumber carrot pumpkin gourd corn banana apple grape clementine avocado papaya mango flax sesame saffron soap shampoo conditioner toothpaste toothbrush detergent cleaner tissue napkin towel paper bag lighter plier tool foil bleach sanitizer sponge broom mop laundry body hand wash coconut thai'.split(' '))protectedWords.add(word);
const household=/\b(?:body\s*wash|hand\s*(?:wash|soap)|soap|shampoo|conditioner|toothpaste|toothbrush|toilet\s*(?:paper|roll)|bath\s*tissue|paper\s*towels?|tissues?|napkins?|detergent|dish\s*(?:soap|liquid)|dishwasher|cleaner|cleaning|windex|swiffer|dryer\s*sheets?|fabric\s*softener|laundry|trash\s*bags?|garbage\s*bags?|plastic\s*bags?|shopping\s*bags?|lighter|pliers?|tools?|foil|cling\s*wrap|parchment|bleach|sanitizer|sponge|broom|mop)\b/i;
const food=/\b(?:milk|cream|yogurt|yoghurt|dahi|paneer|cheese|butter|ghee|rice|flour|atta|dal|lentils?|beans?|peas?|cashews?|peanuts?|almonds?|nuts?|oil|sugar|salt|pepper|peppers|tomatoes|tomato|banana|bananas|apple|apples|grapes?|clementines?|avocados?|papaya|ginger|chill?i|cilantro|coriander|mint|romaine|lettuce|broccoli|cucumber|carrot|pumpkin|ash\s*gourd|corn|bread|buns?|pav|tortilla|khakh?ra|khakhara|gathiya|gathiya|sev|chevdo|mixture|bhakharwadi|bhakarwadi|papad|puri|pickles?|achar|chutney|sauce|ketchup|dressing|tea|coffee|water|juice|soda|cola|spice|masala|essence|moraiyo|mukhwas|boondi|mathia|snacks?|chips?|olives?|tofu|oats?|barley|quinoa|mango|flax|sesame|saffron)\b/i;
export function receiptSection(label){return household.test(label)?'household':food.test(label)?'kitchen':'';}
export function supportedName(proposed,receiptName){
 if(typeof proposed!=='string'||!proposed.trim()||proposed.length>80||/[\u0000-\u001f<>$₹£€@]/.test(proposed))return false;
 const source=new Set(words(receiptName)),candidate=words(proposed),actual=new Set(candidate);
 if(!candidate.length||candidate.some(w=>!source.has(w)&&!['and','with','of'].includes(w)))return false;
 // Do not erase a visible type/flavour or a fat percentage while removing a brand.
 for(const word of source)if((protectedWords.has(word)||protectedWords.has(word.replace(/s$/,''))||/^\d+(?:percent)$/.test(word))&&!actual.has(word))return false;
 return true;
}
export function identifyReceiptItems(rows,annotations=[]){
 return rows.map(row=>{
  const receiptName=row.receiptName||row.name,physical=String(row.raw||'').split('\n').map(s=>s.trim()),matches=annotations.filter(a=>physical.includes(a.source));
  const suggestions=[...new Set(matches.map(a=>a.name).filter(name=>supportedName(name,receiptName)))];
  const name=suggestions.length===1?suggestions[0].trim():receiptName;
  const clear=receiptSection(receiptName),sections=[...new Set(matches.map(a=>a.section==='pantry'?'kitchen':a.section==='household'?'household':'').filter(Boolean))];
  // A clear printed product type wins over a contradictory model category.
  const section=clear||(sections.length===1?sections[0]:'');
  return {...row,name,receiptName,section,nameSource:name===receiptName?'receipt':'suggestion'};
 });
}
