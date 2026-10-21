import {parseReceipt,pantryReceipt,expenseReceipt} from './parser.mjs';
import {receiptLines} from './layout.mjs';
import {prepareReceipt} from './photo.mjs';
function documentFrom(pages,source){const lines=receiptLines(pages),text=lines.map(line=>line.text).join('\n'),items=pantryReceipt(text);return {schema:'ourhouse.receipt.v1',engine:'on-device',source,sections:pages.length,ocr:{text,lines},items,warnings:[...(lines.some(line=>line.confidence!==null&&line.confidence<60)?['Some text is uncertain. Compare it with the photo.']:[]),...(items.length>=200?['The 200-product review limit was reached. Check the remaining receipt.']:[])]};}
window.OurHouseReceipts={parse:parseReceipt,pantry:pantryReceipt,expenses:expenseReceipt,prepare:prepareReceipt,documentFrom};
