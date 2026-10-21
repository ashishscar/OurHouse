// One permanent dietary policy for recipes. Runs on the device before encryption.
// Dairy, honey, onion and garlic are allowed; eggs and animal-derived ingredients are not.
const animal = /\b(?:meat|poultry|beef|veal|pork|ham|bacon|lamb|mutton|goat meat|venison|rabbit|chicken|turkey|duck|goose|quail|sausage|salami|pepperoni|prosciutto|chorizo|fish|seafood|shellfish|salmon|tuna|cod|haddock|trout|tilapia|sardines?|anchov(?:y|ies)|mackerel|herring|bonito|shrimp|prawns?|crab|lobster|crayfish|crawfish|scallops?|mussels?|clams?|oysters?|squid|octopus|calamari|caviar|roe|surimi|eggs?|egg yolks?|egg whites?|yolks?|albumen|albumin|gelatin|gelatine|isinglass|lard|suet|tallow|animal rennet|rennet|omelette|omelet|frittata|meringue|non[ -]vegetarian|non[ -]veg|keema|kheema|boti|tandoori chicken|dashi|worcestershire(?: sauce)?|fish sauce|oyster sauce|shrimp paste|belacan|katsuobushi|carmine|cochineal|e120|e441|shellac)\b|(?:अंड[ाेे]|मांस|मछली|मुर्ग[ाी]|ઈંડ[ાું]|અંડ[ાું]|માંસ|માછલી)/giu;
const substitutes = /\b(?:vegan|vegetarian|plant[ -]based|meatless|mock)\s+(?:(?:chicken|beef|pork|fish|oyster|egg)\s+)?(?:meat|poultry|beef|pork|ham|bacon|lamb|chicken|turkey|duck|sausage|salami|pepperoni|chorizo|fish|seafood|shrimp|prawns?|crab|eggs?|yolks?|gelatin|gelatine|rennet|dashi|worcestershire|fish sauce|oyster sauce)(?:\s+(?:sauce|stock|broth|substitute|replacement))?\b/gi;
function remaining(text){return String(text||'').normalize('NFKC')
 .replace(/\b(?:oyster|chicken of the woods)\s+mushrooms?\b|\bbeefsteak tomatoes?\b|\begg[ -]?plants?\b/gi,' ')
 .replace(/\b(?:vegan|egg[ -]free) mayonnaise\b|\bmicrobial rennet\b/gi,' ')
 .replace(/\b(?:egg|meat|fish|gelatin|gelatine|rennet)[ -]free\b/gi,' ')
 .replace(/\b(?:no|without)\s+(?:any\s+)?(?:eggs?|meat|fish|gelatin|gelatine|rennet)\b/gi,' ')
 .replace(/\bvegetarian\s+(?:chicken\s+)?eggs?\b/gi,'eggs')
 .replace(substitutes,' ');}
export function vegetarianIssues(recipe){
 const texts=[recipe?.name,...Object.values(recipe?.ingredients||{}).map(i=>typeof i==='string'?i:i?.name),recipe?.instructions,recipe?.notes];
 const issues=[];
 for(const text of texts){const rest=remaining(text);for(const match of rest.matchAll(animal))issues.push(match[0]);
  // These ingredients need an explicit plant/vegetarian qualifier.
  const ambiguous=rest.match(/\b(?:(?<!vegetable |vegetarian |vegan |mushroom )broth|(?<!vegetable |vegetarian |vegan |mushroom )stock|(?<!vegan |egg-free |egg free )mayonnaise|(?<!vegetarian |vegan )parmesan)\b/gi);if(ambiguous)issues.push(...ambiguous);
 }
 return [...new Set(issues.map(s=>s.toLowerCase()))];
}
export function assertVegetarian(recipe){const issues=vegetarianIssues(recipe);if(issues.length)throw Object.assign(Error('Vegetarian dishes only. Remove or replace: '+issues.join(', ')+'. Eggs, meat, fish and seafood are excluded.'),{status:400,code:'VEGETARIAN_ONLY'});return recipe;}
export function assertCompleteVegetarian(recipe){assertVegetarian(recipe);if(!Object.values(recipe?.ingredients||{}).some(i=>String(typeof i==='string'?i:i?.name||'').trim()))throw Object.assign(Error('Add the vegetarian ingredients before saving or planning this dish.'),{status:400,code:'RECIPE_INGREDIENTS_REQUIRED'});return recipe;}
export const isVegetarian=recipe=>!!recipe&&!vegetarianIssues(recipe).length;
export const isPlannable=recipe=>isVegetarian(recipe)&&Object.values(recipe.ingredients||{}).some(i=>String(typeof i==='string'?i:i?.name||'').trim());
const recipeContent=d=>JSON.stringify(d&&[d.name,d.ingredients,d.instructions,d.notes]);
export function validateVegetarianChanges(before,after){
 // Old records remain recoverable. Only new/edited recipe content and newly planned meals are checked.
 for(const [id,d] of Object.entries(after?.dishes||{}))if(d&&recipeContent(d)!==recipeContent(before?.dishes?.[id]))assertCompleteVegetarian(d);
 for(const [week,days] of Object.entries(after?.weeks||{}))for(const [day,value] of Object.entries(days||{})){
  const previous=before?.weeks?.[week]?.[day]?.dishes||[];
  for(const id of value?.dishes||[])if(!previous.includes(id)&&after?.dishes?.[id])assertCompleteVegetarian(after.dishes[id]);
 }
}
