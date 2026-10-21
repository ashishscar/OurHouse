import {pantryReceipt,auditReceipt} from './parser.mjs';
import {receiptLines,mergeTranscriptions} from './layout.mjs';
import {identifyReceiptItems} from './identity.mjs';
export function documentFrom(pages,source,{ai=false,elapsedMs=0}={}){
 const merged=ai?mergeTranscriptions(pages):null,lines=ai?merged.lines.map(text=>({text,confidence:null,bbox:null})):receiptLines(pages),text=lines.map(line=>line.text).join('\n');
 const annotations=ai?pages.flatMap(page=>(page.labels||[]).map(label=>({...label,source:page.lines?.[label.line]})).filter(label=>typeof label.source==='string')):[];
 const items=identifyReceiptItems(pantryReceipt(text),annotations),audit=auditReceipt(text,items);
 return {schema:'ourhouse.receipt.v1',engine:ai?(pages.every(page=>page.native)?'on-device':pages.some(page=>page.native)?'mixed-receipt-readers':'cloudflare-receipt-ai'):'on-device',source,sections:pages.length,elapsedMs,ocr:{text,lines,sections:pages.map(page=>({section:page.section,lines:page.lines||receiptLines([page]).map(l=>l.text),labels:page.labels||[]}))},items,audit,warnings:[...audit.warnings,...(merged?.conflicts?['Overlapping sections disagree on an amount or quantity. The first read was kept; compare the flagged receipt with the photo.']:merged?.uncertain?['Section overlaps could not all be matched. Check repeated or missing products.']:[]),...(lines.some(line=>line.confidence!==null&&line.confidence<60)?['Some text is uncertain. Compare it with the photo.']:[]),...(items.length>=500?['The 500-product review limit was reached. Scan the remaining receipt separately.']:[])]};
}
