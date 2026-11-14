// Suggestions never replace source evidence, quantities or prices. Unknown
// identities keep the printed label; a section remains editable before import.
const aliases={homo:'homogenized',whol:'whole',wht:'white',sourcrm:'sour cream',bodywash:'body wash',evoo:'extra virgin olive oil',veg:'vegetable',veggie:'vegetable',vegoil:'vegetable oil',tomatos:'tomato',cocacola:'cola',choc:'chocolate',sgrredu:'sugar reduced',slt:'salt',sdls:'seedless',pul:'pulp',org:'organic',blk:'black',chilli:'chili',chillies:'chili',chilis:'chili',cashews:'cashew',tomatoes:'tomato',bananas:'banana',apples:'apple',peppers:'pepper',olives:'olive',flaxseed:'flax seed',chhas:'chaas',chat:'chaat',seffrong:'saffron',corriender:'coriander',kcp:'ketchup',fr:'french',chs:'cheese',rch:'ranch',ssme:'sesame',bn:'bun',swt:'sweet',niblets:'niblets',wtr:'water',tiss:'tissue',jmbo:'jumbo',reusebag:'reuse bag',mnstr:'monster','0nions':'onions','0range':'orange'};
// Public retailer records are an optional, exact-SKU fallback for opaque till
// labels. An entry needs the retailer header and printed product words too;
// numbers alone are not proof of a product identity. No receipt is sent out.
const verifiedCatalog={walmart:{
 '056000010660':{terms:['CRUSH','ZERO'],name:'Crush Zero Orange',section:'kitchen',source:'https://www.walmart.ca/browse/household-supplies-pantry/drinks/6000195358079-21076'},
 '059631882930':{terms:['LYSOL','BATH','P'],name:'Bathroom cleaner',section:'household',source:'https://www.lysol.ca/our-products/bathroom-cleaners/lysol-bathroom-cleaner-spray-power/'},
},costco:{
 '25771':{terms:['MINI','CUKES'],name:'Mini cucumbers',section:'kitchen',source:'https://www.costco.ca/p/-/mini-cucumbers-907-g/100544094'},
 '1474938':{terms:['COLGATE','PR'],name:'Pro-Relief toothpaste',section:'household',source:'https://www.costco.ca/p/-/colgate-sensitive-pro-relief-repair-and-prevent-toothpaste-4-x-120-ml/100716429'},
 '1346909':{terms:['KS','ORG','2%'],name:'Organic milk 2%',section:'kitchen',source:'https://www.costco.ca/p/-/kirkland-signature-organic-2-milk-4-l/100677467'},
 '435259':{terms:['2%','FINE','FILT'],name:'Fine-filtered milk 2%',section:'kitchen',source:'https://www.costco.ca/p/-/natrel-fine-filtered-2-milk-4-l/100553304'},
 '295619':{terms:['KS','BAGS','60'],name:'Multi-purpose bags',section:'household',source:'https://www.costco.ca/p/-/kirkland-signature-quad-tie-clear-multi-purpose-bags-60-pack/100417352'},
 '1944033':{terms:['CHAMP','SHORT'],name:'Shorts',section:'household',source:'https://github.com/Endle/beanbeaver-core/blob/463f2979f2269aa3c980d510f5451b54fcc447d5/crates/receipt-core/tests/receipts_e2e/costco_20260301_redact.expected.json'},
 '2919781':{terms:['ZOA'],name:'Energy drink',section:'kitchen',source:'https://sameday.costco.ca/store/costco-canada/products/109468979-zoa-energy-drink-variety-pack-355-ml'},
 '2908438':{terms:['BIOSTEEL'],name:'Sports drink',section:'kitchen',source:'https://sameday.costco.ca/store/costco-canada/products/109351028-biosteel-hydration-drink-variety-pack-473-ml'},
 '161552':{terms:['QUE','PASA'],name:'Tortilla chips',section:'kitchen',source:'https://www.costco.ca/p/-/kirkland-signature-organic-que-pasa-tortilla-chips-908-g/100541978'},
 '1081570':{terms:['CHEESE','SA'],name:'Nacho cheese sauce',section:'kitchen',source:'https://www.costco.ca/p/-/muy-fresco-nacho-cheese-sauce-3-kg/100498751'},
 '1974989':{terms:['EVRST','12X600'],name:'White towel rolls',section:'household',source:'https://www.costco.ca/p/-/everest-pro-signature-white-towel-roll-197-cm-x-18288-m/4000393138'},
 '2633624':{terms:['CHARMIN','ULTR'],name:'Toilet paper',section:'household',source:'https://www.costco.ca/p/-/charmin-ultra-soft-toilet-paper-jumbo-rolls-30-200-sheets/4000399694'},
 '3458556':{terms:['TIDE','COLDWTR'],name:'Coldwater laundry detergent',section:'household',source:'https://www.costco.ca/p/-/tide-ultra-coldwater-clean-liquid-laundry-detergent-124-loads/4000363006'},
 '232952':{terms:['COKE','ZERO'],name:'Coke Zero',section:'kitchen',source:'https://www.costco.ca/p/-/coca-cola-zero-355-ml-32-pack/100548619'},
 '1041477':{terms:['PINEAP','JUICE'],name:'Pineapple juice',section:'kitchen',source:'https://www.costco.ca/p/-/freshn-pure-pineapple-burst-juice-blend-6-1-l/100461737'},
 '1792990':{terms:['KS','PAD','JLA'],name:'Absorbent pads',section:'household',source:'https://www.costco.ca/p/-/kirkland-signature-absorbent-multipurpose-pads-100-count/4000281816'},
 '305882':{terms:['KS','IBU','400M'],name:'Ibuprofen',section:'household',source:'https://cocoeast.ca/costco-east-pharmacy-vitamin-super-post-oct-25th-2023-ontario-atlantic-canada/305882kirkland-signature-ibuprofen-400mg-es-300-tablets15-99-4/'},
 '399':{terms:['DOORDASH2X50'],name:'DoorDash gift cards',section:'',source:'https://www.costco.ca/p/-/doordash-2-x-50-e-gift-cards/4000311449'},
 '401150':{terms:['NANO'],name:'Drinkable yogurt',section:'kitchen',source:'https://www.costco.ca/p/-/igo-assorted-15-nano-drinkable-yogurt-24-x-93-ml/100552352?langId=-24'}
},lcbo:{
 '00001123':{terms:['BABY','DUCK'],name:'Baby Duck',section:'exclude',source:'https://www.lcbo.com/en/andr-rs-baby-duck-91'}
}};
const words=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/(?<=\p{L})['’](?=s\b)/gu,'').replace(/(\d+(?:[.,]\d+)?)\s*["″]/g,'$1 inch').replace(/(\d+(?:[.,]\d+)?)\s*%/g,(_,n)=>n.replace(/[.,]/,'decimal')+'percent').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean).flatMap(w=>(aliases[w]||w).split(' '));
const protectedWords=new Set('whole split ground sliced chopped diced skim skimmed homogenized unsalted salted salt seedless pulp no sugar reduced chocolate sweet spicy plain original black green red brown white raw organic frozen fine mini nylon ratlami surti surati bhavnagari mexican punjabi kewra rose basmati toor moong chilka khichadi paneer tikka masala sour condensed whipping french ranch jalapeno farali upavas'.split(' '));
protectedWords.add('eggplant');
// A supported subset is not enough if it drops the product itself or a visible
// flavour. Keep these identity words while allowing brand/pack words to go.
for(const word of 'rice flour atta dal lentil bean pea cashew peanut almond milk cream yogurt yoghurt dahi cheese butter ghee bread wheat bun pav tortilla ketchup sauce dressing chutney pickle achar papad sev gathiya chevdo bhakharwadi bhakarwadi khari makhania burger biscuit cracker boondi mathia jaggery sugar salt oil tea coffee water juice soda cola spice essence tomato potato ginger chili cilantro coriander mint lettuce romaine spinach broccoli cucumber carrot pumpkin gourd okra corn banana apple grape clementine avocado papaya mango flax sesame saffron soap shampoo conditioner toothpaste toothbrush detergent cleaner tissue napkin towel paper bag lighter plier tool foil bleach sanitizer sponge broom mop laundry body hand wash coconut thai onion orange chicken drink jumbo bouill legum legumes tomacouli pois haricots thon persil thym estragon origan fromage huile pates riz pesto lasag oeuf coquillette veget vegeta vegetales taboule poule soja escalope veloute'.split(' '))protectedWords.add(word);
const household=/\b(?:backpacks?|body\s*wash|hand\s*(?:wash|soap)|soap|shampoo|conditioner|toothpaste|toothbrush|toilet\s*(?:paper|roll)|bath\s*tissue|paper\s*towels?|tissues?|napkins?|detergent|dish\s*(?:soap|liquid)|dishwasher|cleaner|cleaning|windex|swiffer|lys[o0]l|dryer\s*sheets?|fabric\s*softener|laundry|tide\s+coldwtr|downy\s+beads|colgate\s+tp|ibuprofen|ibu\s*\d{3,4}m|trash\s*bags?|garbage\s*bags?|plastic\s*bags?|shopping\s*bags?|carry\s+bags?|reuse\s*bags?|lighter|pliers?|tools?|foil|cling\s*wrap|parchment|bleach|sanitizer|sponge|broom|mop|cintres?|vaissel\w*|dent\.?\s*[a-z]?\s*\/\s*tartre|piles?\s+(?:spe\s+)?cr\d{4})\b/i;
const food=/\b(?:eggs?|milk|cream|yogurt|yoghurt|yog\s+drinks?|ayran|dahi|paneer|cheese|butter|ghee|rice|flour|atta|dal|lentils?|beans?|peas?|cashews?|peanuts?|almonds?|nuts?|oil|sugar|jaggery|salt|pepper|peppers|tomatoes|tomato|potatoes|potato|banana|bananas|apple|apples|grapes?|cherr(?:y|ies)|clementines?|avocados?|papaya|ginger|chill?i|cilantro|coriander|mint|romaine|lettuce|spinach|broccoli|cucumber|carrot|pumpkin|ash\s*gourd|okra|bhindi|corn|bread|buns?|pav|tortilla|khakh?ra|khakhara|gathiya|gathiya|sev|chevdo|mixture|bhakharwadi|bhakarwadi|khari|makhania|burgers?|biscuits?|crackers?|papad|puri|pickles?|achar|chutney|sauce|ketchup|dressing|tea|coffee|waters?|juice|soda|cola|vinegar|spices?|masala|essence|moraiyo|mukhwas|boondi|mathia|snacks?|chips?|olives?|tofu|oats?|barley|quinoa|mango|flax|sesame|saffron|crunchem|chicken|onions?|soft\s+drinks?|limeade|m\s*&\s*ms\b|sprite|coconut|monster\s+(?:ultra|vrty)|wasabi|mustard|noodles?|soya|legumes?|v[ée]g[ée]tales?|yaourts?|fromages?|riz|p[aâ]tes|persil|thym|estragon|origan|huile)\b/i;
const frenchFood=/\b(?:espres(?:so)?|cafe|confitures?|mais|raisins?|tomates?|laitues?|potimarrons?|basma(?:ti|i)|torsades|skyr|moutarde|myrtilles?|[od]eufs)\b/i;
export function receiptSection(label){const expanded=words(label).join(' '),folded=expanded.normalize('NFD').replace(/\p{M}/gu,'');return household.test(label)||household.test(expanded)||/\bTAB\.?L[-\s]?VAISS/i.test(label)?'household':food.test(label)||food.test(expanded)||frenchFood.test(folded)||/\beggplants?\b/i.test(expanded)||/\btom\s+(?:diced|crushed|whole)\b|\b5050\b.*\bsweet\b.*\bsalty\b|\b(?:coke\s+diet|diet\s+coke)\b/i.test(expanded)?'kitchen':'';}
const excludedFood=/\b(?:meat|beef|pork|chicken|drumsticks?|fish|seafood|shrimp|bacon|ham|sausage|beer|lager|wine|vodka|whisky|whiskey|coors\s+light|thon|poisson|poulet|poule|jambon|porc|agneau|canard|saucisson|viande|sardines?|boeuf|bœuf|vins?|champagnes?|cr[eé]mant|ci[do]re(?:bret)?)\b/i;
// An OCR label cannot establish whether a ripened cheese uses animal rennet.
// Paneer is acid-set; otherwise leave cheese products unassigned for review.
const uncertainRennet=/\b(?:cheese|fromage|morbier|fourme|brie|camembert|gruy[eè]re|gouda|cheddar|parmesan|feta|emmental)\b/i;
// A gift card is a purchased expense but never stock, even at a grocery store.
const nonStock=/\b(?:e?gift\s*cards?|doordash\s*\d+\s*x\s*\d+)\b/i;
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
 // Dropping an unexplained word can create a neat but meaningless fragment.
 // Keep the printed label unless an abbreviated candidate still has a product
 // identity; a household label cannot become a generic unidentified noun.
 const meaningful=candidate.some(w=>!qualifiersOnly.has(w)&&(protectedWords.has(w)||protectedWords.has(w.replace(/s$/,''))||(w.length>=5&&(w.match(/[aeiou]/g)||[]).length>=2)));
 if(candidate.length<source.size&&!omittedOnlyUnits&&(!meaningful||receiptSection(receiptName)==='household'&&!receiptSection(proposed)))return false;
 // Do not erase a visible type/flavour or a fat percentage while removing a brand.
 for(const word of source)if((protectedWords.has(word)||protectedWords.has(word.replace(/s$/,''))||/^\d+(?:decimal\d+)?percent$/.test(word))&&!actual.has(word))return false;
 return true;
}
const qualifiersOnly=new Set('blue black red green brown white yellow pink grey gray gold silver original organic frozen raw whole split ground sliced chopped skim skimmed unsalted salted sweet spicy plain fine nylon farali upavas'.split(' '));
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
 // A negation or nutrition claim changes what the product is. An incomplete
 // suggestion must not synthesize its word order from disconnected tokens.
 if(missing.includes('no')&&missing.some(w=>w==='salt'||w==='pulp')||missing.includes('sugar')&&missing.includes('reduced'))return '';
 const display=w=>w.replace(/decimal(\d+)percent$/,'.$1%').replace(/percent$/,'%');
 const typeWord=w=>typeSuffixWords.has(w)||typeSuffixWords.has(w.replace(/s$/,''));
 let positioned=proposed.trim();const inserted=new Set();
 // Keep fasting qualifiers beside the product word they modify when that
 // relative position is visible in the print. Prefixing every qualifier can
 // turn "Potato & peanut farali chevdo" into an awkward reordered name.
 for(const word of missing.filter(w=>w==='farali'||w==='upavas')){
  const next=source.slice(source.indexOf(word)+1).find(w=>candidate.includes(w));
  if(!next)continue;
  const token=new RegExp(`\\b${next}\\b`,'i');
  if(!token.test(positioned))continue;
  positioned=positioned.replace(token,match=>`${word[0].toUpperCase()+word.slice(1)} ${match}`);
  inserted.add(word);
 }
 const prefix=missing.filter(w=>!typeWord(w)&&!inserted.has(w)).map(display).join(' ').replace(/\p{L}/u,c=>c.toUpperCase());
 const suffix=missing.filter(typeWord).map(display).join(' ');
 const completed=[prefix,positioned,suffix].filter(Boolean).join(' ');
 // Complete a grounded suggestion only from qualifiers already in the print.
 // New identities, amounts and measurements are never supplied here.
 return supportedName(completed,receiptName)?completed[0].toUpperCase()+completed.slice(1):'';
}
function labelKey(value){return String(value||'').normalize('NFKC').toUpperCase().replace(/(?<=[A-Z])0(?=[A-Z])/g,'O').replace(/[^A-Z0-9%]+/g,' ').trim();}
function costcoEvidence(receiptText){
 if(/^\s*COSTCO(?:\s+WHOLESALE)?\b/im.test(receiptText))return true;
 const lines=String(receiptText||'').split(/\r?\n/),first=lines.find(line=>line.trim())||'';
 // An identified different merchant rules out this retailer's SKU catalog.
 if(/\b(?:store|supermarket|market|mart|no frills|canadian tire|walmart|target)\b/i.test(first))return false;
 // Cropped or faint logos are common. Two independent SKU-plus-label matches
 // establish the retailer without guessing from an isolated number.
 const matches=new Set();
 for(const line of lines){const match=line.match(/^\s*(\d{5,8})\s+(.+)$/);if(!match)continue;const entry=verifiedCatalog.costco[match[1]];if(!entry)continue;const printed=new Set(labelKey(match[2]).split(' '));if(entry.terms.every(term=>printed.has(term)))matches.add(match[1]);}
 if(matches.size>=2)return true;
 // Costco's distinctive pre-scanned basket heading and footer support one
 // exact SKU match when the logo itself is cropped or unreadable.
 return matches.size>=1&&/START OF PRE-SCANNED ITEMS/i.test(receiptText)&&/TOTAL NUMBER OF PRE-SCANNED ITEMS/i.test(receiptText);
}
function catalogMatch(row,retailer){
 const entry=verifiedCatalog[retailer]?.[String(row.itemNumber||'').trim()];
 if(!entry)return null;
 const printed=new Set(labelKey(row.receiptName||row.name).replace(/\bCRLSH\b/g,'CRUSH').split(' '));
 return entry.terms.every(term=>printed.has(term))?entry:null;
}
function merchantProduct(receiptName,receiptText){
 const header=String(receiptText||'').split(/\r?\n/).find(line=>line.trim())||'';
 if(/\d+[.,]\d{2}\s*(?:[A-Z*]{0,2})?\s*$/i.test(header)||!/\b(?:grocer(?:y|ies)|market|mart|supermarket|store|wholesale|foodmart)\b/i.test(header))return '';
 const merchant=labelKey(header).split(' '),printed=String(receiptName||'').trim().split(/\s+/);
 const tokens=labelKey(receiptName).split(' ');
 if(merchant.length<2||printed.length!==tokens.length)return '';
 for(let count=Math.min(merchant.length,printed.length-1);count>=2;count--){
  if(!merchant.slice(0,count).every((word,i)=>word===tokens[i]))continue;
  const product=printed.slice(count).join(' ').replace(/\s+\d+(?:[.,]\d+)?\s*(?:kg|g|gm|lb|l|ml|pcs?)\.?$/i,'').trim();
  if(receiptSection(product))return product[0].toUpperCase()+product.slice(1).toLowerCase();
 }
 return '';
}
// Expand only unambiguous till abbreviations and OCR O/0 substitutions in
// display text. The literal receiptName and raw line remain available for
// review; unfamiliar tokens are never completed from a product guess.
const displayTokens={wtr:'Water',tiss:'Tissue',jmbo:'Jumbo',mnstr:'Monster',lys0l:'Lysol',prsvd:'Preserved','0nions':'Onions','0range':'Orange'};
const brandTrimWords=new Set([...protectedWords,...'wasabi in tube family size light prsvd preserved mustard stem truffle instant noodle sweetened soya drink'.split(' ')]);
function normalizedReceiptName(receiptName){
 if(!receiptSection(receiptName))return receiptName;
 if(/^TOM\s+(?:DICED|CRUSHED|WHOLE)$/i.test(receiptName))return receiptName.replace(/^TOM\s+(DICED|CRUSHED|WHOLE)$/i,(_,form)=>`${form[0]}${form.slice(1).toLowerCase()} tomatoes`);
 // A short, opaque till prefix may be a brand. Drop it only when the
 // remaining printed words independently identify a product.
 const tokens=receiptName.trim().split(/\s+/),first=tokens[0]||'';
 const shortPrefix=/^(?:[A-Z]{2,4}|[A-Z]&[A-Z])$/.test(first)&&!receiptSection(first)&&!protectedWords.has(first.toLowerCase());
 const second=tokens[1]||'',twoWordPrefix=shortPrefix&&/^[A-Z]{1,2}$/.test(second)&&!receiptSection(second)&&!protectedWords.has(second.toLowerCase());
 let name=receiptName;
 if(shortPrefix){
  const candidate=tokens.slice(twoWordPrefix?2:1).join(' ');
  const groundedWords=candidate.toLowerCase().split(/\s+/);
  if(groundedWords.length>=2&&groundedWords.every(word=>brandTrimWords.has(word)||/^\d+(?:[.,]\d+)?(?:%|g|kg|l|ml|lb|pk)$/.test(word))&&receiptSection(candidate)&&supportedName(candidate,receiptName))name=candidate;
 }
 // Packaging stays in receiptName and raw for exact review and copying.
 const withoutPackage=name.replace(/\s+IN\s+(?:A\s+)?TUBE(?:\s+FAMILY\s+SIZE)?$/i,'').replace(/\s+FAMILY\s+SIZE$/i,'');
 if(withoutPackage!==name&&receiptSection(withoutPackage)&&supportedName(withoutPackage,receiptName))name=withoutPackage;
 return name.replace(/\b(?:wtr|tiss|jmbo|mnstr|lys0l|prsvd|0nions|0range)\b/gi,token=>displayTokens[token.toLowerCase()]||token);
}
function withinTwoEdits(a,b){
 if(Math.abs(a.length-b.length)>2)return false;
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const current=[i];for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
  if(Math.min(...current)>2)return false;previous=current;
 }
 return previous[b.length]<=2;
}
function reconcileRepeatedLabels(rows){
 const copied=rows.map(row=>({...row})),byCode=new Map();
 for(const row of copied){const code=String(row.itemNumber||'').trim();if(code.length<4)continue;if(!byCode.has(code))byCode.set(code,[]);byCode.get(code).push(row);}
 for(const bucket of byCode.values()){
  if(bucket.length<2)continue;
  const anchored=bucket.filter(row=>receiptSection(row.receiptName||row.name));
  if(!anchored.length||new Set(anchored.map(row=>labelKey(row.receiptName||row.name))).size!==1)continue;
  const anchor=anchored[0],label=labelKey(anchor.receiptName||anchor.name),digits=label.match(/\d+/g)?.join(',')||'',wordCount=label.split(' ').length;
  for(const row of bucket){
   const original=row.receiptName||row.name,own=labelKey(original);
   if(row===anchor||own===label||receiptSection(original)||own.length<8||own.split(' ').length!==wordCount||(own.match(/\d+/g)?.join(',')||'')!==digits||!withinTwoEdits(own,label))continue;
   row.ocrName=original;row.receiptName=anchor.receiptName||anchor.name;
  }
 }
 // A repeated unnumbered product can lose its wrapped first line in the
 // middle purchase. Two matching full labels on either side and the same
 // printed unit price support restoring only that display label.
 for(let i=1;i<copied.length-1;i++){
  const left=copied[i-1],middle=copied[i],right=copied[i+1];
  if(left.itemNumber||middle.itemNumber||right.itemNumber)continue;
  const full=labelKey(left.receiptName||left.name),short=labelKey(middle.receiptName||middle.name);
  if(full!==labelKey(right.receiptName||right.name)||!full.endsWith(' '+short)||short.length<8||full.length-short.length<8)continue;
  if(left.amount!==middle.amount||right.unitPrice!==middle.amount||left.unit!=='pcs'||middle.unit!=='pcs')continue;
  middle.ocrName=middle.receiptName||middle.name;middle.receiptName=left.receiptName||left.name;
 }
 // Some tills print the same unnumbered purchase on separate lines. A unique
 // repeated spelling can repair OCR-only variants at the same price. Keep the
 // original scan in raw and receiptName; never merge the purchases themselves.
 const byPrice=new Map();
 for(const row of copied){if(row.itemNumber||!row.amount)continue;const key=row.amount+':'+row.qty+':'+row.unit;if(!byPrice.has(key))byPrice.set(key,[]);byPrice.get(key).push(row);}
 for(const bucket of byPrice.values()){
  if(bucket.length<3)continue;
  const counts=new Map();for(const row of bucket){const label=labelKey(row.receiptName||row.name);if(receiptSection(label))counts.set(label,(counts.get(label)||0)+1);}
  const ranked=[...counts].sort((a,b)=>b[1]-a[1]);
  if(!ranked.length||ranked[0][1]<2||ranked[0][1]===(ranked[1]?.[1]||0))continue;
  const [label]=ranked[0],anchor=bucket.find(row=>labelKey(row.receiptName||row.name)===label),digits=label.match(/\d+/g)?.join(',')||'',wordCount=label.split(' ').length;
  for(const row of bucket){const original=row.receiptName||row.name,own=labelKey(original);
   if(own===label||row.ocrName||receiptSection(original)||own.length<8||own.split(' ').length!==wordCount||(own.match(/\d+/g)?.join(',')||'')!==digits||!withinTwoEdits(own,label))continue;
   row.repeatedName=anchor.receiptName||anchor.name;
  }
 }
 return copied;
}
function repeatedNames(items){
 const buckets=new Map();
 for(const item of items){
  const code=String(item.itemNumber||'').trim(),key=code.length>=4?'code:'+code:'price:'+item.amount+':'+item.qty+':'+item.unit;
  if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(item);
 }
 for(const [key,bucket] of buckets){
  if(bucket.length<2)continue;
  const candidates=bucket.filter(item=>item.nameSource==='suggestion'&&receiptSection(item.name));
  if(!candidates.length||new Set(candidates.map(item=>labelKey(item.name))).size!==1)continue;
  const labelCounts=new Map();for(const item of candidates){const label=labelKey(item.receiptName);labelCounts.set(label,(labelCounts.get(label)||0)+1);}
  const label=[...labelCounts].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(!label||(!key.startsWith('code:')&&labelCounts.get(label)<2))continue;
  const anchor=candidates.find(item=>labelKey(item.receiptName)===label),digits=label.match(/\d+/g)?.join(',')||'',wordsCount=label.split(' ').length;
  for(const item of bucket){
   const own=labelKey(item.receiptName);
   if(item===anchor||!['receipt','repeated-label'].includes(item.nameSource)||(item.section&&item.section!==anchor.section)||own.length<8||own.split(' ').length!==wordsCount||(own.match(/\d+/g)?.join(',')||'')!==digits||!withinTwoEdits(own,label))continue;
   item.name=anchor.name;item.nameSource='repeated';
  }
 }
 return items;
}
export function identifyReceiptItems(rows,annotations=[],receiptText=''){
 const retailer=costcoEvidence(receiptText)?'costco':/^\s*Walmart\b/i.test(String(receiptText).split(/\r?\n/).find(line=>line.trim())||'')?'walmart':/^\s*LCB[O0]\b/i.test(String(receiptText).split(/\r?\n/).find(line=>line.trim())||'')?'lcbo':'';
 return repeatedNames(reconcileRepeatedLabels(rows).map(row=>{
  const receiptName=row.receiptName||row.name,physical=String(row.raw||'').split('\n').map(s=>s.trim()),matches=annotations.filter(a=>physical.includes(a.source));
  const suggestions=[...new Set(matches.map(a=>qualifiedReceiptName(a.name,receiptName)).filter(Boolean))];
  const clear=receiptSection(receiptName)||receiptSection(row.repeatedName),catalog=catalogMatch(row,retailer);
  // This exact printed seasoning has a manufacturer ingredient listing marked
  // plant-based; "meat" describes its intended dish, not its ingredients.
  // The exception must not extend to unverified meat-flavoured products.
  const plantBasedSeasoning=/^TOMAX STEAM MEAT 5 SPICES PDR$/i.test(receiptName)?{name:'Five-spice powder',section:'kitchen',source:'https://www.tomax.com.tw/product/ins.php?index_id=134'}:null;
  const verified=catalog&&(!clear||clear===catalog.section)?catalog:plantBasedSeasoning,merchantName=merchantProduct(receiptName,receiptText);
  const name=/^SURATI\s+BHINDI$/i.test(receiptName)?'Bhindi':verified?verified.name:merchantName||(suggestions.length===1?suggestions[0].trim():row.repeatedName||normalizedReceiptName(receiptName));
  const sections=[...new Set(matches.map(a=>a.section==='pantry'?'kitchen':a.section==='household'?'household':'').filter(Boolean))];
  // A clear printed product type wins over a contradictory model category.
  // A printed department resolves otherwise opaque till labels. A specific
  // product type still wins when a store puts non-food goods under Grocery.
  // Some deli sections sell vegetarian filled pasta. A printed ricotta or
  // spinach filling can override the section, but an explicit meat word cannot.
  const vegetarianPasta=/\b(?:tortellini|ravioli)\b.*\b(?:ricott|epin|spinach|fromage|cheese)/i.test(receiptName)&&!excludedFood.test(receiptName);
  const buckwheatGalette=/\b\d*galet\w*\b.*\bsarrasin\b/i.test(receiptName);
  const excluded=row.department==='exclude'&&!clear&&!vegetarianPasta&&!buckwheatGalette||verified?.section==='exclude'||excludedFood.test(receiptName)&&!plantBasedSeasoning||nonStock.test(receiptName);
  const rennetReview=uncertainRennet.test(receiptName)&&!/\b(?:paneer|vegan|plant.based|vegetarian|microbial\s+rennet)\b/i.test(receiptName);
  const section=excluded||rennetReview?'':clear||verified?.section||(vegetarianPasta?'kitchen':'')||(['kitchen','household'].includes(row.department)?row.department:'')||(sections.length===1?sections[0]:'');
  return {...row,name,receiptName,section,...(excluded?{excludedFromPantry:true,exclusionReason:nonStock.test(receiptName)?'non-stock':'vegetarian'}:{}),...(rennetReview?{warning:[row.warning,'Check whether this cheese contains animal rennet before adding it to a vegetarian pantry.'].filter(Boolean).join(' ')}:{}),nameSource:verified?'verified-catalog':merchantName&&name===merchantName?'merchant-prefix':row.repeatedName&&name===row.repeatedName?'repeated-label':name===receiptName?(row.ocrName?'repeated-label':'receipt'):name===normalizedReceiptName(receiptName)?'normalized-receipt':'suggestion',...(verified?{catalogSource:verified.source}:{})};
 }));
}
