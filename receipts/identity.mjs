// Suggestions never replace source evidence, quantities or prices. Unknown
// identities keep the printed label; a section remains editable before import.
const aliases={homo:'homogenized',whol:'whole',wht:'white',sourcrm:'sour cream',bodywash:'body wash',evoo:'extra virgin olive oil',veg:'vegetable',veggie:'vegetable',blk:'black',chilli:'chili',chillies:'chili',chilis:'chili',cashews:'cashew',tomatoes:'tomato',bananas:'banana',apples:'apple',peppers:'pepper',olives:'olive',flaxseed:'flax seed',chhas:'chaas',chat:'chaat',seffrong:'saffron',corriender:'coriander',kcp:'ketchup',fr:'french',chs:'cheese',rch:'ranch',ssme:'sesame',bn:'bun',swt:'sweet',niblets:'niblets'};
const words=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/(\d+(?:[.,]\d+)?)\s*["″]/g,'$1 inch').replace(/(\d+(?:[.,]\d+)?)\s*%/g,(_,n)=>n.replace(/[.,]/,'decimal')+'percent').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean).flatMap(w=>(aliases[w]||w).split(' '));
const protectedWords=new Set('whole split ground sliced chopped skim skimmed homogenized unsalted salted sweet spicy plain original black green red brown white raw organic frozen fine mini nylon ratlami surti surati bhavnagari mexican punjabi kewra rose basmati toor moong chilka khichadi paneer tikka masala sour condensed whipping french ranch jalapeno'.split(' '));
// A supported subset is not enough if it drops the product itself or a visible
// flavour. Keep these identity words while allowing brand/pack words to go.
for(const word of 'rice flour atta dal lentil bean pea cashew peanut almond milk cream yogurt yoghurt dahi cheese butter ghee bread wheat bun pav tortilla ketchup sauce dressing chutney pickle achar papad sev gathiya chevdo bhakharwadi bhakarwadi khari makhania boondi mathia jaggery sugar salt oil tea coffee water juice soda cola spice essence tomato potato ginger chili cilantro coriander mint lettuce romaine spinach broccoli cucumber carrot pumpkin gourd okra corn banana apple grape clementine avocado papaya mango flax sesame saffron soap shampoo conditioner toothpaste toothbrush detergent cleaner tissue napkin towel paper bag lighter plier tool foil bleach sanitizer sponge broom mop laundry body hand wash coconut thai'.split(' '))protectedWords.add(word);
const household=/\b(?:body\s*wash|hand\s*(?:wash|soap)|soap|shampoo|conditioner|toothpaste|toothbrush|toilet\s*(?:paper|roll)|bath\s*tissue|paper\s*towels?|tissues?|napkins?|detergent|dish\s*(?:soap|liquid)|dishwasher|cleaner|cleaning|windex|swiffer|dryer\s*sheets?|fabric\s*softener|laundry|trash\s*bags?|garbage\s*bags?|plastic\s*bags?|shopping\s*bags?|lighter|pliers?|tools?|foil|cling\s*wrap|parchment|bleach|sanitizer|sponge|broom|mop)\b/i;
const food=/\b(?:milk|cream|yogurt|yoghurt|dahi|paneer|cheese|butter|ghee|rice|flour|atta|dal|lentils?|beans?|peas?|cashews?|peanuts?|almonds?|nuts?|oil|sugar|salt|pepper|peppers|tomatoes|tomato|potatoes|potato|banana|bananas|apple|apples|grapes?|clementines?|avocados?|papaya|ginger|chill?i|cilantro|coriander|mint|romaine|lettuce|spinach|broccoli|cucumber|carrot|pumpkin|ash\s*gourd|okra|corn|bread|buns?|pav|tortilla|khakh?ra|khakhara|gathiya|gathiya|sev|chevdo|mixture|bhakharwadi|bhakarwadi|papad|puri|pickles?|achar|chutney|sauce|ketchup|dressing|tea|coffee|waters?|juice|soda|cola|spice|masala|essence|moraiyo|mukhwas|boondi|mathia|snacks?|chips?|olives?|tofu|oats?|barley|quinoa|mango|flax|sesame|saffron)\b/i;
export function receiptSection(label){const expanded=words(label).join(' ');return household.test(label)||household.test(expanded)?'household':food.test(label)||food.test(expanded)?'kitchen':'';}
export function supportedName(proposed,receiptName){
 if(typeof proposed!=='string'||!proposed.trim()||proposed.length>80||/[\u0000-\u001f<>$₹£€@]/.test(proposed))return false;
 const source=new Set(words(receiptName)),candidate=words(proposed),actual=new Set(candidate);
 if(!candidate.length||candidate.some(w=>!source.has(w)&&!['and','with','of'].includes(w)))return false;
 // Removing a leading token from an entirely opaque till abbreviation does
 // not establish that the token was a brand. Preserve the printed label.
 const readable=candidate.some(w=>protectedWords.has(w)||protectedWords.has(w.replace(/s$/,''))||(w.length>=5&&(w.match(/[aeiou]/g)||[]).length>=2));
 const packToken=w=>/^(?:\d+(?:decimal\d+)?(?:g|gm|kg|lb|oz|ml|l|lt|litre|liter|pc|pcs|pk|pack))$/.test(w);
 const omittedOnlyUnits=[...source].every(w=>actual.has(w)||['each','ea','pc','pcs','unit'].includes(w)||packToken(w));
 if(candidate.length<source.size&&!readable&&!omittedOnlyUnits)return false;
 // Do not erase a visible type/flavour or a fat percentage while removing a brand.
 for(const word of source)if((protectedWords.has(word)||protectedWords.has(word.replace(/s$/,''))||/^\d+(?:decimal\d+)?percent$/.test(word))&&!actual.has(word))return false;
 return true;
}
const qualifiersOnly=new Set('blue black red green brown white yellow pink grey gray gold silver original organic frozen raw whole split ground sliced chopped skim skimmed unsalted salted sweet spicy plain fine nylon'.split(' '));
// Product types follow their flavour/ingredient in a completed display name
// (for example, mango chutney). Qualifiers such as organic stay in front.
const typeSuffixWords=new Set('rice flour atta dal lentil bean pea cashew peanut almond milk cream yogurt yoghurt dahi cheese butter ghee bread bun pav tortilla ketchup sauce dressing chutney pickle achar papad sev gathiya chevdo bhakharwadi bhakarwadi khari makhania boondi mathia jaggery sugar salt oil tea coffee water juice soda cola spice essence soap shampoo conditioner toothpaste toothbrush detergent cleaner tissue napkin towel bag lighter plier tool foil bleach sanitizer sponge broom mop'.split(' '));
export function qualifiedReceiptName(proposed,receiptName){
 if(typeof proposed!=='string')return '';
 const source=words(receiptName),candidate=words(proposed),actual=new Set(candidate);
 // Reordering every word of an opaque brand-only label does not make it a
 // shorter or clearer product name. Keep its printed order for review.
 if(!receiptSection(receiptName)&&candidate.length===source.length&&candidate.every(w=>source.includes(w))&&source.join(' ')!==candidate.join(' '))return receiptName;
 // A colour/adjective does not identify an opaque brand-only receipt label.
 if(candidate.length&&candidate.every(w=>qualifiersOnly.has(w))&&source.join(' ')!==candidate.join(' '))return '';
 if(supportedName(proposed,receiptName))return proposed.trim();
 if(!receiptSection(proposed)||!candidate.length||candidate.some(w=>!source.includes(w)&&!['and','with','of'].includes(w)))return '';
 const missing=[...new Set(source.filter(w=>(protectedWords.has(w)||protectedWords.has(w.replace(/s$/,''))||/^\d+(?:decimal\d+)?percent$/.test(w))&&!actual.has(w)))].sort((a,b)=>Number(/percent$/.test(b))-Number(/percent$/.test(a)));
 const display=w=>w.replace(/decimal(\d+)percent$/,'.$1%').replace(/percent$/,'%');
 const typeWord=w=>typeSuffixWords.has(w)||typeSuffixWords.has(w.replace(/s$/,''));
 const prefix=missing.filter(w=>!typeWord(w)).map(display).join(' ').replace(/\p{L}/u,c=>c.toUpperCase());
 const suffix=missing.filter(typeWord).map(display).join(' ');
 const completed=[prefix,proposed.trim(),suffix].filter(Boolean).join(' ');
 // Complete a grounded suggestion only from qualifiers already in the print.
 // New identities, amounts and measurements are never supplied here.
 return supportedName(completed,receiptName)?completed[0].toUpperCase()+completed.slice(1):'';
}
export function identifyReceiptItems(rows,annotations=[]){
 return rows.map(row=>{
  const receiptName=row.receiptName||row.name,physical=String(row.raw||'').split('\n').map(s=>s.trim()),matches=annotations.filter(a=>physical.includes(a.source));
  const suggestions=[...new Set(matches.map(a=>qualifiedReceiptName(a.name,receiptName)).filter(Boolean))];
  const name=suggestions.length===1?suggestions[0].trim():receiptName;
  const clear=receiptSection(receiptName),sections=[...new Set(matches.map(a=>a.section==='pantry'?'kitchen':a.section==='household'?'household':'').filter(Boolean))];
  // A clear printed product type wins over a contradictory model category.
  const section=clear||(sections.length===1?sections[0]:'');
  return {...row,name,receiptName,section,nameSource:name===receiptName?'receipt':'suggestion'};
 });
}
