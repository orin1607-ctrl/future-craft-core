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

function extractAmounts(text: string) {
  const found: string[] = [];
  const labeled = /(?:סכום|amount|total|סה"כ|סהכ)\s*[:\-]?\s*(\d[\d,]*(?:\.\d{1,2})?)/gi;
  const shekel = /(\d[\d,]*(?:\.\d{1,2})?)\s*(?:₪|ש"ח|ש״ח|nis)/gi;
  let match: RegExpExecArray | null;
  while ((match = labeled.exec(text))) found.push(match[1]);
  while ((match = shekel.exec(text))) found.push(match[1]);
  return [...new Set(found)].slice(0, 5);
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
  const claimLine = lineMatching(clean, /DAL-\d{4}-\d{4}/i);
  const plateLine = lineMatching(clean, /רכב|לוחית|plate/i);
  const dateLine = lineMatching(clean, /תאריך|\bdate\b/i);
  const amountLine = lineMatching(clean, /סכום|amount|₪|\bnis\b/i);
  const claimNums = extractDalIds(claimLine);
  const plates = extractPlates(plateLine);
  const dates = extractDates(dateLine);
  const amounts = extractAmounts(amountLine);
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
    read_insurer_decision: 'לא נמצאה החלטת מבטח במסמך',
    read_missing: 'לא צוינו מסמכים חסרים במסמך',
    read_recommendation: 'המלצה למשתמש בלבד: לא לנהל את התביעה לפי הקובץ הזה עד שיוצג מסמך קריא. אין שינוי סטטוס ואין שליחה.',
  };
}
