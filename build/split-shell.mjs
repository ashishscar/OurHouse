import ts from 'typescript';
import {transform} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';

// Keep classic-script global bindings: existing event handlers and the family
// adapter share them. Only dormant UI functions move to optional chunks.
export async function splitShell(html,directory){
 const hash=text=>createHash('sha256').update(text).digest('hex').slice(0,16);
 const emit=(label,extension,text)=>{const file='/assets/'+label+'-'+hash(text)+'.'+extension;writeFileSync(path.join(directory,file),text);return file;};
 mkdirSync(path.join(directory,'assets'),{recursive:true});
 html=await replaceAsync(html,/<style>([\s\S]*?)<\/style>/g,async(_,css)=>'<link rel="stylesheet" href="'+emit('app','css',(await transform(css,{loader:'css',minify:true})).code)+'">');
 const match=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].length>100000);if(!match)throw Error('App core script was not found');
 let code=match[1];
 const source=ts.createSourceFile('app-core.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[],features={};
 const retained=new Set(['expensePending','expenseDraftKey','rememberExpenseDraft','forgetExpenseDraft','installExpenseDraftRecovery','captureExpenseDraft','expenseReceiptToken','clearExpenseReceiptView','queueExpenseChange','sendExpenseWrite','expenseAttachmentBusy']);
 const ranges=[['expenses',code.indexOf('function openExpenses()'),code.indexOf('function initAppShell()')],['water',code.indexOf('function openWaterBillSheet()'),code.indexOf('/* ---------- 18c.')]];
 for(const [feature,start,end] of ranges){
  if(start<0||end<=start)throw Error('Feature boundary changed: '+feature);
  const nodes=source.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.getStart(source)>=start&&node.end<=end&&!retained.has(node.name.text));
  if(nodes.length<10)throw Error('Feature functions were not found: '+feature);
  const body=nodes.map(node=>node.getText(source)).join('\n');
  features[feature]=emit(feature,'js',(await transform(body,{loader:'js',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,legalComments:'none',target:'es2022'})).code);
  for(const node of nodes){const name=node.name.text;edits.push({start:node.getStart(source),end:node.end,text:`function ${name}(){return window.OurHouseFeatures.run('${feature}','${name}',Array.from(arguments));}`});}
 }
 for(const edit of edits.sort((a,b)=>b.start-a.start))code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);
 const compiled=await transform(code,{loader:'js',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:true,legalComments:'none',target:'es2022'});
 const core=emit('app-core','js',compiled.code);
 html=html.replace(match[0],'<script type="application/json" id="ourhouse-feature-map">'+JSON.stringify(features)+'</script><script src="/ourhouse-features.js"></script><script src="'+core+'"></script>');
 html=html.replace(/<script src="/g,'<script defer src="');
 return {html,features,core,coreBytes:Buffer.byteLength(compiled.code)};
}
async function replaceAsync(text,pattern,replace){const matches=[...text.matchAll(pattern)];for(const match of matches.reverse())text=text.slice(0,match.index)+await replace(...match)+text.slice(match.index+match[0].length);return text;}
