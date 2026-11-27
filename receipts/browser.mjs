import {parseReceipt,pantryReceipt,expenseReceipt,auditReceipt} from './parser.mjs';
import {prepareReceipt} from './photo.mjs';
import {documentFrom} from './document.mjs';
import {receiptLines} from './layout.mjs';
import {readLocalSections} from './local.mjs';
window.OurHouseReceipts={parse:parseReceipt,pantry:pantryReceipt,expenses:expenseReceipt,prepare:prepareReceipt,documentFrom,receiptLines,readLocalSections};
