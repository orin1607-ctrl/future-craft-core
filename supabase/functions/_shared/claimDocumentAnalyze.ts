/**
 * Claim document analysis from extracted text (PDF text layer or OCR).
 * Pure functions, shared by the browser reader and the server-side reader.
 * Only facts found in the text are used. Moved unchanged from src/features/claims/claimDocumentRead.ts.
 */
import { extractDalIds, extractDates, extractPlates } from '../claims-gmail/matchIncoming.ts';
import { classifyDocumentText } from './claimDocumentLabel.ts';

export type DocumentReadStatus = 'pending' | 'processing' | 'ready' | 'unreadable' | 'failed';
export type DocumentReadSource = 'pdf_text' | 'ocr' | 'none' | '';

export type DocumentRead = {
  read_status: DocumentReadStatus;
  read_sha: string;
  read_source: DocumentReadSource;
  read_claim_id: string;
  read_summary: string;
  read_text: string;
  read_evidence: string;
  read_doc_type: string;
  read_claim_nums: string;
  read_claim_src: string;
  read_plates: string;
  read_plate_src: string;
  read_dates: string;
  read_date_src: string;
  read_amounts: string;
  read_amount_src: string;
  read_id_numbers: string;
  read_id_src: string;
  read_license_numbers: string;
  read_license_src: string;
  read_invoice_numbers: string;
  read_invoice_src: string;
  read_names: string;
  read_name_src: string;
  read_insurer_decision: string;
  read_missing: string;
  read_recommendation: string;
};

export const MIN_TEXT_CHARS = 20;
export const TEXT_LIMIT = 4000;
export const NOT_IN_DOC = 'לא מופיע במסמך';

export function normalizeDocText(raw: string) {
  return String(raw || '')
    .replace(/\r/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function linesOf(text: string) {
  return normalizeDocText(text)
    .split(/\n|(?<=\.)\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function joinFound(values: string[], empty: string) {
  const clean = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return clean.length ? clean.join(', ') : empty;
}

const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
const CURRENCY = '(?:₪|ש"ח|ש״ח|\\bnis\\b)';
const AMOUNT_LABEL = '(?:סכום|הערכת\\s*(?:ה)?נזק|סה"כ(?:\\s*לתשלום)?|סה״כ(?:\\s*לתשלום)?|סהכ|לתשלום|amount|total|damage)';

// Hebrew PDFs often come out in visual order ("3,850 הערכת נזק:"), so labels and currency are matched on both sides.
const AMOUNT_PATTERNS = [
  new RegExp(`${NUM}\\s*${CURRENCY}`, 'gi'),
  new RegExp(`${CURRENCY}\\s*${NUM}`, 'gi'),
  new RegExp(`${AMOUNT_LABEL}\\s*[:\\-]?\\s*${NUM}`, 'gi'),
  new RegExp(`${NUM}\\s*${AMOUNT_LABEL}\\s*:?`, 'gi'),
];

function extractAmounts(text: string) {
  const found: string[] = [];
  for (const re of AMOUNT_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const value = match[1];
      // A zero ("ירידת ערך: 0 ₪") or a bare year is not a money amount worth surfacing.
      if (!/[1-9]/.test(value) || /^(19|20)\d{2}$/.test(value)) continue;
      found.push(value);
    }
  }
  return [...new Set(found)].slice(0, 5);
}

/** Lines that carry an amount (both reading orders), and the amounts in them. */
function amountsFromText(text: string) {
  const lines = linesOf(text).filter((line) => extractAmounts(line).length);
  return { amounts: [...new Set(lines.flatMap(extractAmounts))].slice(0, 5), source: lines.slice(0, 3).join(' | ').slice(0, 240) };
}

const CLAIM_LABEL = '(?:מספר\\s*(?:ה)?תביעה|תביעה\\s*(?:מספר|מס[\'׳.]?)|claim\\s*(?:no\\.?|number|#)?)';
const CLAIM_TOKEN = '([A-Z0-9][A-Z0-9\\-/]{3,24})';

type Labeled = { values: string[]; source: string };

/**
 * Values that appear right next to a label, in either reading order ("label: value" or "value :label").
 * Only labelled values are taken, so a vehicle number, an ID number and a licence number never mix.
 */
function labeledValues(text: string, label: string, value: string, accept: (v: string, line: string) => boolean = () => true): Labeled {
  const found: string[] = [];
  let source = '';
  for (const line of linesOf(text)) {
    const hits: string[] = [];
    for (const re of [new RegExp(`${label}\\s*[:\\-]?\\s*${value}`, 'gi'), new RegExp(`${value}\\s*[:\\-]?\\s*${label}`, 'gi')]) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(line))) {
        const v = match[1].trim().replace(/\s+/g, ' ');
        if (v && accept(v, line)) hits.push(v);
      }
    }
    if (hits.length && !source) source = line.slice(0, 240);
    found.push(...hits);
  }
  return { values: [...new Set(found)].slice(0, 5), source };
}

// Israeli ID: 8–9 digits next to an ID label.
const ID_LABEL = '(?:ת\\.?\\s?ז\\.?|ת["״]ז|תעודת\\s*זהות|מס[\'׳.]?\\s*זהות|מספר\\s*זהות|\\bID\\s*(?:no\\.?|number)?)';
// Driving licence number — never a vehicle licence ("רישיון רכב"), whose number is a plate.
const LICENSE_LABEL = '(?:מספר\\s*(?:ה)?רישיון(?:\\s*(?:ה)?נהיגה)?|רישיון\\s*נהיגה\\s*(?:מספר|מס[\'׳.]?)|מס[\'׳.]?\\s*רישיון(?:\\s*נהיגה)?|(?:driving\\s*)?licen[cs]e\\s*(?:no\\.?|number|#))';
const INVOICE_LABEL = '(?:חשבונית(?:\\s*מס)?(?:\\s*קבלה)?\\s*(?:מספר|מס[\'׳.]?)|מספר\\s*חשבונית|invoice\\s*(?:no\\.?|number|#))';
const NAME_LABEL = '(?:שם\\s*(?:בעל\\s*(?:ה)?רישיון|המבוטח|הלקוח|הנהג|מלא|השמאי)|holder\\s*name|full\\s*name|(?:^|\\s)שם)';
const HE_OR_EN_NAME = '([א-תA-Za-z][א-תA-Za-z\'"׳״.\\-]*(?:\\s+[א-תA-Za-z][א-תA-Za-z\'"׳״.\\-]*){0,3})';

export function extractIdNumbers(text: string) {
  return labeledValues(text, ID_LABEL, '(\\d{8,9})');
}

export function extractLicenseNumbers(text: string) {
  return labeledValues(text, LICENSE_LABEL, '(\\d{5,9})', (_v, line) => !/רישיון\s*(?:ה)?רכב|vehicle\s*licen/i.test(line));
}

export function extractInvoiceNumbers(text: string) {
  return labeledValues(text, INVOICE_LABEL, '([A-Z0-9][A-Z0-9\\-/]{1,19})', (v) => /\d/.test(v));
}

export function extractNames(text: string) {
  // Labels like "שם" are matched only as "label: value" in logical order; Hebrew-only lines keep that order.
  const found: string[] = [];
  let source = '';
  const re = new RegExp(`${NAME_LABEL}\\s*:\\s*${HE_OR_EN_NAME}`, 'gi');
  for (const line of linesOf(text)) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    const hits: string[] = [];
    while ((match = re.exec(line))) hits.push(match[1].trim());
    if (hits.length && !source) source = line.slice(0, 240);
    found.push(...hits);
  }
  return { values: [...new Set(found)].slice(0, 5), source };
}

/** DAL ids, and insurer claim numbers that appear next to a claim-number label (either order). */
function claimNumbersFromText(text: string) {
  const found: string[] = [];
  let source = '';
  for (const line of linesOf(text)) {
    const hits = [...extractDalIds(line)];
    for (const re of [new RegExp(`${CLAIM_LABEL}\\s*[:\\-]?\\s*${CLAIM_TOKEN}`, 'gi'), new RegExp(`${CLAIM_TOKEN}\\s*${CLAIM_LABEL}\\s*:?`, 'gi')]) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(line))) if (/\d/.test(match[1])) hits.push(match[1].toUpperCase());
    }
    if (hits.length && !source) source = line.slice(0, 240);
    found.push(...hits);
  }
  return { claimNums: [...new Set(found)].slice(0, 5), source };
}

function decisionFromText(text: string) {
  const hit = linesOf(text).find((line) => /אושר|נדחה|שולם|אישור תשלום|approved|declined|rejected|\bpaid\b/i.test(line));
  return hit ? hit.slice(0, 240) : 'לא נמצאה החלטת מבטח במסמך';
}

function missingFromText(text: string) {
  const hits = linesOf(text).filter((line) => /חסר|missing|נדרש לצרף|please attach/i.test(line));
  return joinFound(hits.map((line) => line.slice(0, 180)), 'לא צוינו מסמכים חסרים במסמך');
}

function lineMatching(text: string, re: RegExp) {
  return linesOf(text).find((line) => re.test(line))?.slice(0, 240) || '';
}

function evidenceFromText(text: string, decision: string) {
  if (decision && !decision.startsWith('לא נמצאה')) return decision.slice(0, 240);
  const claimLine = linesOf(text).find((line) => /DAL-\d{4}-\d{4}/i.test(line));
  if (claimLine) return claimLine.slice(0, 240);
  return normalizeDocText(text).slice(0, 180);
}

function recommendationFor(decision: string, missing: string) {
  const parts = ['המלצה למשתמש בלבד, ללא שינוי סטטוס וללא שליחת הודעה.'];
  if (!decision.startsWith('לא נמצאה')) parts.push(`במסמך מופיע: "${decision.slice(0, 160)}".`);
  if (!missing.startsWith('לא צוינו')) parts.push('כדאי שהמשתמש יבדוק את המסמכים שצוינו כחסרים.');
  return parts.join(' ');
}

export function analyzeDocumentText(
  text: string,
  source: 'pdf_text' | 'ocr',
  claimId: string,
  sha: string,
): DocumentRead {
  const clean = normalizeDocText(text).slice(0, TEXT_LIMIT);
  const { claimNums, source: claimLine } = claimNumbersFromText(clean);
  // The first "רכב" line is often a heading ("רישיון רכב"): take the first labelled line that holds a plate.
  const plateLine = linesOf(clean).find((line) => /רכב|לוחית|plate/i.test(line) && extractPlates(line).length)?.slice(0, 240) || '';
  const dateLine = lineMatching(clean, /תאריך|\bdate\b/i);
  const { amounts, source: amountLine } = amountsFromText(clean);
  const plates = extractPlates(plateLine);
  const dates = extractDates(dateLine);
  const ids = extractIdNumbers(clean);
  const licenses = extractLicenseNumbers(clean);
  const invoices = extractInvoiceNumbers(clean);
  const names = extractNames(clean);
  const decision = decisionFromText(clean);
  const missing = missingFromText(clean);
  const evidence = evidenceFromText(clean, decision);
  return {
    read_status: 'ready',
    read_sha: sha,
    read_source: source,
    read_claim_id: claimId,
    read_summary: clean.slice(0, 220),
    read_text: clean,
    read_evidence: evidence,
    read_doc_type: classifyDocumentText(clean),
    read_claim_nums: joinFound(claimNums, NOT_IN_DOC),
    read_claim_src: claimLine,
    read_plates: joinFound(plates, NOT_IN_DOC),
    read_plate_src: plates.length ? plateLine : '',
    read_dates: joinFound(dates, NOT_IN_DOC),
    read_date_src: dates.length ? dateLine : '',
    read_amounts: joinFound(amounts, NOT_IN_DOC),
    read_amount_src: amounts.length ? amountLine : '',
    read_id_numbers: joinFound(ids.values, NOT_IN_DOC),
    read_id_src: ids.source,
    read_license_numbers: joinFound(licenses.values, NOT_IN_DOC),
    read_license_src: licenses.source,
    read_invoice_numbers: joinFound(invoices.values, NOT_IN_DOC),
    read_invoice_src: invoices.source,
    read_names: joinFound(names.values, NOT_IN_DOC),
    read_name_src: names.source,
    read_insurer_decision: decision,
    read_missing: missing,
    read_recommendation: recommendationFor(decision, missing),
  };
}

export function unreadableDocumentRead(claimId: string, sha: string, reason: string): DocumentRead {
  return {
    read_status: 'unreadable',
    read_sha: sha,
    read_source: 'none',
    read_claim_id: claimId,
    read_summary: reason,
    read_text: '',
    read_evidence: '',
    read_doc_type: NOT_IN_DOC,
    read_claim_nums: NOT_IN_DOC,
    read_claim_src: '',
    read_plates: NOT_IN_DOC,
    read_plate_src: '',
    read_dates: NOT_IN_DOC,
    read_date_src: '',
    read_amounts: NOT_IN_DOC,
    read_amount_src: '',
    read_id_numbers: NOT_IN_DOC,
    read_id_src: '',
    read_license_numbers: NOT_IN_DOC,
    read_license_src: '',
    read_invoice_numbers: NOT_IN_DOC,
    read_invoice_src: '',
    read_names: NOT_IN_DOC,
    read_name_src: '',
    read_insurer_decision: 'לא נמצאה החלטת מבטח במסמך',
    read_missing: 'לא צוינו מסמכים חסרים במסמך',
    read_recommendation: 'המלצה למשתמש בלבד: לא לנהל את התביעה לפי הקובץ הזה עד שיוצג מסמך קריא. אין שינוי סטטוס ואין שליחה.',
  };
}
