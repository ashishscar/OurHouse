import {parseReceipt,pantryReceipt,expenseReceipt,auditReceipt} from './parser.mjs';
import {receiptLines,mergeTranscriptions} from './layout.mjs';
import {prepareReceipt} from './photo.mjs';
function documentFrom(pages,source,{ai=false,elapsedMs=0}={}){
 const merged=ai?mergeTranscriptions(pages):null,lines=ai?merged.lines.map(text=>({text,confidence:null,bbox:null})):receiptLines(pages),text=lines.map(line=>line.text).join('\n'),items=pantryReceipt(text),audit=auditReceipt(text,items);
 return {schema:'ourhouse.receipt.v1',engine:ai?'cloudflare-receipt-ai':'on-device',source,sections:pages.length,elapsedMs,ocr:{text,lines},items,audit,warnings:[...audit.warnings,...(merged?.uncertain?['Section overlaps could not all be matched. Check repeated or missing products.']:[]),...(lines.some(line=>line.confidence!==null&&line.confidence<60)?['Some text is uncertain. Compare it with the photo.']:[]),...(items.length>=500?['The 500-product review limit was reached. Scan the remaining receipt separately.']:[])]};
}
window.OurHouseReceipts={parse:parseReceipt,pantry:pantryReceipt,expenses:expenseReceipt,prepare:prepareReceipt,documentFrom};
