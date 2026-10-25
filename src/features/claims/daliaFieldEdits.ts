// Free-speech corrections for every Dalia questionnaire: "תשני את הטלפון ל-050…", "שנת הייצור היא 2022 ולא
// 2021", "תתקני את שם הלקוח", "תמחקי את ההערה האחרונה", "תמחקי את הרכב מהטיוטה", several in one sentence.
//
// One registry knows each field of the real forms: the words that name it, its type, how a spoken value is
// validated, and how it is written into the draft. Nothing here saves anything — the questionnaire's own
// confirmation still decides when the draft is written.
import type { VoiceData } from './daliaVoiceEngine';
import {
  extractName,
  extractPhone,
  extractPlate,
  parseCustomerType,
  parseDate,
  parseFuel,
  parseHebrewNumber,
  parsePaymentMethod,
  parseYear,
  splitMakeModel,
} from './daliaVoiceParse';

type Parsed = { ok: true; set: (d: VoiceData) => void; shown: string } | { ok: false; why: string };

export interface FieldSpec {
  key: string;
  /** Shown in summaries and confirmations. */
  label: string;
  /** Words that name the field in a sentence (most specific fields are listed first). */
  match: RegExp;
  /** Is this field part of the current draft? (only those can be corrected) */
  relevant: (d: VoiceData) => boolean;
  parse: (raw: string, now: Date) => Parsed;
  /** "תמחקי את …" — clears the field (null = the field cannot be removed, only changed). */
  remove: ((d: VoiceData) => string) | null;
  /** Fields saved as a whole record: corrections after the record was saved go through its own screen. */
  savedIn?: (d: VoiceData) => boolean;
}

const text = (minLen = 2) => (raw: string): string | null => {
  const t = raw.replace(/^["'״׳]|["'״׳]$/g, '').trim();
  return t.length >= minLen && /[א-תA-Za-z0-9]/.test(t) ? t : null;
};
const ok = (set: (d: VoiceData) => void, shown: string): Parsed => ({ ok: true, set, shown });
const bad = (why: string): Parsed => ({ ok: false, why });
const money = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

const customerFields = (d: VoiceData) => !!(d.customerName || d.customerPhone || d.customerType || d.companyName) || d.customerSaved !== undefined;
const vehicleFields = (d: VoiceData) => !!(d.plate || d.make || d.model || d.year || d.vehicleMode || d.prospectVehicleMode || d.licenseRead);

export const FIELD_SPECS: FieldSpec[] = [
  {
    key: 'companyName',
    label: 'שם החברה',
    match: /שם (ה)?חברה|שם העסק|החברה/,
    relevant: customerFields,
    parse: (raw) => { const v = text()(raw.replace(/^חברת\s+/, '')); return v ? ok((d) => { d.companyName = v; d.customerType = 'business'; }, v) : bad('לא נשמע שם חברה'); },
    remove: null,
    savedIn: (d) => !!d.customerSaved,
  },
  {
    key: 'customerName',
    label: 'שם הלקוח',
    match: /שם (ה)?לקוח|השם|(^|\s)שם(\s|$)/,
    relevant: customerFields,
    parse: (raw) => { const v = extractName(raw) || text()(raw); return v ? ok((d) => { d.customerName = v; }, v) : bad('לא נשמע שם'); },
    remove: null,
    savedIn: (d) => !!d.customerSaved,
  },
  {
    key: 'customerPhone',
    label: 'טלפון',
    match: /טלפון|פלאפון|נייד|סלולרי|מספר (ה)?טלפון/,
    relevant: customerFields,
    parse: (raw) => { const v = extractPhone(raw); return v ? ok((d) => { d.customerPhone = v; }, v) : bad('מספר הטלפון לא תקין'); },
    remove: (d) => { d.customerPhone = ''; return 'הטלפון הוסר'; },
    savedIn: (d) => !!d.customerSaved,
  },
  {
    key: 'customerType',
    label: 'סוג לקוח',
    match: /סוג (ה)?לקוח|פרטי|עסקי/,
    relevant: customerFields,
    parse: (raw) => { const t = parseCustomerType(raw) || (/עסקי/.test(raw) ? 'business' : /פרטי/.test(raw) ? 'private' : null); return t ? ok((d) => { d.customerType = t; if (t === 'business' && !d.companyName) d.companyName = d.customerName; }, t === 'business' ? 'עסקי' : 'פרטי') : bad('פרטי או עסקי?'); },
    remove: null,
    savedIn: (d) => !!d.customerSaved,
  },
  {
    key: 'businessId',
    label: 'ח.פ / עוסק',
    match: /ח\.?\s?פ|עוסק|מספר חברה/,
    relevant: (d) => customerFields(d) && d.customerType === 'business',
    parse: (raw) => { const v = raw.replace(/\D/g, ''); return v.length >= 5 ? ok((d) => { d.businessId = v; }, v) : bad('מספר ח.פ / עוסק לא תקין'); },
    remove: (d) => { d.businessId = ''; return 'ח.פ הוסר'; },
    savedIn: (d) => !!d.customerSaved,
  },
  {
    key: 'address',
    label: 'כתובת',
    match: /כתובת|רחוב|עיר מגורים/,
    relevant: customerFields,
    parse: (raw) => { const v = text(3)(raw); return v ? ok((d) => { d.customerAddress = v; }, v) : bad('לא נשמעה כתובת'); },
    remove: (d) => { d.customerAddress = ''; return 'הכתובת הוסרה'; },
    savedIn: (d) => !!d.customerSaved,
  },
  {
    key: 'contactPerson',
    label: 'איש קשר',
    match: /איש(ת)? קשר|אנשי קשר/,
    relevant: customerFields,
    parse: (raw) => { const v = extractName(raw) || text()(raw); return v ? ok((d) => { d.contactPerson = v; }, v) : bad('לא נשמע שם איש הקשר'); },
    remove: (d) => { d.contactPerson = ''; return 'איש הקשר הוסר'; },
  },
  {
    key: 'notes',
    label: 'הערה',
    match: /הערה|הערות/,
    relevant: (d) => customerFields(d) || !!d.customerNotes?.length,
    parse: (raw) => { const v = text(2)(raw); return v ? ok((d) => { d.customerNotes = [...(d.customerNotes || []), v]; }, v) : bad('לא נשמע תוכן ההערה'); },
    remove: (d) => { const last = (d.customerNotes || []).pop(); return last ? `נמחקה ההערה: ${last}` : 'אין הערות למחוק'; },
  },
  {
    key: 'plate',
    label: 'מספר רישוי',
    match: /מספר (ה)?רישוי|מספר (ה)?רכב|לוחית|רישוי/,
    relevant: vehicleFields,
    parse: (raw) => { const v = extractPlate(raw); return v ? ok((d) => { d.plate = v; d.vehicleId = undefined; d.vehicleLabel = undefined; d.vehicleKnown = undefined; }, v) : bad('מספר הרישוי לא תקין (7 או 8 ספרות)'); },
    remove: null,
    savedIn: (d) => !!d.vehicleSaved,
  },
  {
    key: 'year',
    label: 'שנת ייצור',
    match: /שנת (ה)?ייצור|שנת (ה)?רכב|(^|\s)שנה(\s|$)|שנת(\s|$)|השנה/,
    relevant: vehicleFields,
    parse: (raw, now) => {
      const y = parseYear(raw, now) ?? (() => { const n = parseHebrewNumber(raw); return n && n >= 1950 && n <= now.getFullYear() + 1 ? n : null; })();
      return y ? ok((d) => { d.year = y; }, String(y)) : bad(`שנה לא תקינה (1950–${now.getFullYear() + 1})`);
    },
    remove: (d) => { d.year = null; return 'השנה הוסרה'; },
    savedIn: (d) => !!d.vehicleSaved,
  },
  {
    key: 'model',
    label: 'יצרן ודגם',
    match: /דגם|יצרן|סוג (ה)?רכב|תוצרת/,
    relevant: vehicleFields,
    parse: (raw) => {
      const v = text()(raw.replace(/(19|20)\d{2}/, ''));
      if (!v) return bad('לא נשמע יצרן או דגם');
      const { make, model } = splitMakeModel(v);
      return ok((d) => { if (make) d.make = make; d.model = model || (make ? d.model : v); }, [make, model].filter(Boolean).join(' ') || v);
    },
    remove: null,
    savedIn: (d) => !!d.vehicleSaved,
  },
  {
    key: 'color',
    label: 'צבע',
    match: /צבע/,
    relevant: vehicleFields,
    parse: (raw) => { const v = text()(raw); return v ? ok((d) => { d.color = v; }, v) : bad('לא נשמע צבע'); },
    remove: (d) => { d.color = ''; return 'הצבע הוסר'; },
    savedIn: (d) => !!d.vehicleSaved,
  },
  {
    key: 'vin',
    label: 'מספר שלדה',
    match: /שלדה|vin/i,
    relevant: vehicleFields,
    parse: (raw) => { const v = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); return v.length >= 6 ? ok((d) => { d.vin = v; }, v) : bad('מספר שלדה לא תקין'); },
    remove: (d) => { d.vin = ''; return 'מספר השלדה הוסר'; },
    savedIn: (d) => !!d.vehicleSaved,
  },
  {
    key: 'vehicle',
    label: 'הרכב',
    match: /(^|\s)(את\s)?ה?רכב(\s|$)/,
    relevant: vehicleFields,
    parse: () => bad('אפשר לתקן פרט של הרכב (מספר רישוי, דגם, שנה) או למחוק את הרכב מהטיוטה'),
    remove: (d) => {
      Object.assign(d, {
        plate: undefined, make: undefined, model: undefined, year: undefined, color: undefined, vin: undefined,
        vehicleId: undefined, vehicleLabel: undefined, vehicleKnown: undefined, noVehicle: undefined,
        licenseRead: undefined, licenseVerified: undefined, vehicleMode: undefined, prospectVehicleMode: undefined, otherVehicle: undefined,
      });
      return 'הרכב הוסר מהטיוטה — נמלא רכב אחר';
    },
    savedIn: (d) => !!d.vehicleSaved,
  },
  {
    key: 'km',
    label: 'קילומטראז\'',
    match: /קילומטראז|קילומטר|ק"מ|ק״מ|מד אוץ/,
    relevant: (d) => d.km !== undefined,
    parse: (raw) => { const n = parseHebrewNumber(raw); return n !== null && n >= 0 && n <= 3_000_000 ? ok((d) => { d.km = String(Math.round(n)); }, String(Math.round(n))) : bad('קילומטראז\' לא תקין'); },
    remove: null,
  },
  {
    key: 'fuel',
    label: 'דלק',
    match: /דלק/,
    relevant: (d) => d.fuel !== undefined,
    parse: (raw) => { const f = parseFuel(raw); return f ? ok((d) => { d.fuel = f; }, f) : bad('מצב דלק: ריק, רבע, חצי, שלושה רבעים או מלא'); },
    remove: null,
  },
  {
    key: 'keys',
    label: 'מפתחות',
    match: /מפתח/,
    relevant: (d) => d.keys !== undefined,
    parse: (raw) => { const n = parseHebrewNumber(raw.replace(/מפתח(ות)?/g, '')); return n !== null && n >= 0 && n <= 20 ? ok((d) => { d.keys = String(Math.round(n)); }, String(Math.round(n))) : bad('מספר מפתחות לא תקין'); },
    remove: null,
  },
  {
    key: 'complaint',
    label: 'תלונת הלקוח',
    match: /תלונה|תקלה|הבעיה|סיבת (ה)?כניסה/,
    relevant: (d) => d.complaint !== undefined,
    parse: (raw) => { const v = text()(raw); return v ? ok((d) => { d.complaint = v; }, v) : bad('לא נשמעה התלונה'); },
    remove: (d) => { d.complaint = ''; return 'התלונה הוסרה'; },
  },
  {
    key: 'requestedWork',
    label: 'עבודה מבוקשת',
    match: /עבודה מבוקשת|העבודה המבוקשת/,
    relevant: (d) => d.requestedWork !== undefined,
    parse: (raw) => { const v = text()(raw); return v ? ok((d) => { d.requestedWork = v; }, v) : bad('לא נשמעה העבודה'); },
    remove: (d) => { d.requestedWork = ''; return 'העבודה המבוקשת הוסרה'; },
  },
  {
    key: 'condition',
    label: 'מצב הרכב',
    match: /מצב (ה)?רכב|נזקים/,
    relevant: (d) => d.condition !== undefined,
    parse: (raw) => { const v = text()(raw); return v ? ok((d) => { d.condition = v; }, v) : bad('לא נשמע מצב הרכב'); },
    remove: (d) => { d.condition = ''; return 'מצב הרכב הוסר'; },
  },
  {
    key: 'orderNote',
    label: 'הזמנה / אישור עבודה',
    match: /הזמנה|אישור עבודה/,
    relevant: (d) => d.orderNote !== undefined,
    parse: (raw) => {
      if (/אין|לא קיימת|בלי/.test(raw)) return ok((d) => { d.orderNote = 'אין הזמנה או אישור עבודה'; }, 'אין');
      const digits = raw.replace(/\D/g, '');
      return ok((d) => { d.orderNote = `קיימת הזמנה / אישור עבודה${digits ? ` (מספר ${digits})` : ''} — לצרף במסך התיק`; }, digits ? `מספר ${digits}` : 'קיימת');
    },
    remove: (d) => { d.orderNote = 'אין הזמנה או אישור עבודה'; return 'ההזמנה הוסרה'; },
  },
  {
    key: 'extraText',
    label: 'תיאור התוספת',
    match: /תיאור (ה)?תוספת|מה התגלה|התוספת/,
    relevant: (d) => d.scope === 'supplement',
    parse: (raw) => { const v = text()(raw); return v ? ok((d) => { d.extraText = v; }, v) : bad('לא נשמע תיאור'); },
    remove: null,
  },
  {
    key: 'extraKind',
    label: 'סוג התוספת',
    match: /סוג (ה)?תוספת|חלק או עבודה/,
    relevant: (d) => d.scope === 'supplement',
    parse: (raw) => {
      const k = /גם וגם|שניהם/.test(raw) ? 'both' : /חלק/.test(raw) ? 'part' : /עבודה/.test(raw) ? 'work' : null;
      return k ? ok((d) => { d.extraKind = k; }, k === 'both' ? 'חלק + עבודה' : k === 'part' ? 'חלק' : 'עבודה') : bad('חלק, עבודה או גם וגם?');
    },
    remove: null,
  },
  {
    key: 'extraPrice',
    label: 'מחיר התוספת',
    match: /מחיר (ה)?תוספת|מחיר/,
    relevant: (d) => d.scope === 'supplement',
    parse: (raw) => { const n = parseHebrewNumber(raw.replace(/שקל(ים)?|ש"ח|₪/g, '')); return n !== null && n >= 0 ? ok((d) => { d.extraPrice = n; }, money(n)) : bad('מחיר לא תקין'); },
    remove: (d) => { d.extraPrice = null; return 'המחיר הוסר'; },
  },
  {
    key: 'payAmount',
    label: 'סכום התשלום',
    match: /סכום|הסכום/,
    relevant: (d) => d.payAmount !== undefined,
    parse: (raw) => { const n = parseHebrewNumber(raw.replace(/שקל(ים)?|ש"ח|₪/g, '')); return n !== null && n > 0 ? ok((d) => { d.payAmount = n; }, money(n)) : bad('סכום לא תקין'); },
    remove: null,
  },
  {
    key: 'payMethod',
    label: 'אמצעי תשלום',
    match: /אמצעי (ה)?תשלום|אשראי|מזומן|העברה|ביט|צ'ק|צ׳ק/,
    relevant: (d) => d.payAmount !== undefined || !!d.payMethod,
    parse: (raw) => { const m = parsePaymentMethod(raw); return m ? ok((d) => { d.payMethod = m; }, m.label) : bad('אמצעי תשלום: מזומן, אשראי, העברה, ביט או צ׳ק'); },
    remove: null,
  },
  {
    key: 'supplierName',
    label: 'שם הספק',
    match: /שם (ה)?ספק|הספק/,
    relevant: (d) => !!(d.supplierName || d.supplierLabel || d.supplierToCreate),
    parse: (raw) => { const v = text()(raw); return v ? ok((d) => { d.supplierName = v; d.supplierToCreate = d.supplierId ? d.supplierToCreate : v; d.supplierLabel = v; }, v) : bad('לא נשמע שם ספק'); },
    remove: null,
  },
  {
    key: 'invoiceNumber',
    label: 'מספר חשבונית',
    match: /מספר (ה)?חשבונית|חשבונית מספר/,
    relevant: (d) => d.invoiceNumber !== undefined,
    parse: (raw) => { const v = raw.replace(/[^\dA-Za-z-]/g, ''); return v.length >= 2 ? ok((d) => { d.invoiceNumber = v; }, v) : bad('מספר חשבונית לא תקין'); },
    remove: null,
  },
  {
    key: 'invoiceTotal',
    label: 'סכום החשבונית',
    match: /סכום (ה)?חשבונית|סה"כ|סה״כ/,
    relevant: (d) => d.invoiceTotal !== undefined,
    parse: (raw) => { const n = parseHebrewNumber(raw.replace(/שקל(ים)?|ש"ח|₪/g, '')); return n !== null && n > 0 ? ok((d) => { d.invoiceTotal = n; }, money(n)) : bad('סכום לא תקין'); },
    remove: null,
  },
  {
    key: 'invoiceDate',
    label: 'תאריך החשבונית',
    match: /תאריך/,
    relevant: (d) => d.invoiceDate !== undefined,
    parse: (raw, now) => { const v = parseDate(raw, now); return v ? ok((d) => { d.invoiceDate = v; }, v) : bad('תאריך לא תקין'); },
    remove: null,
  },
];

export type FieldEdit =
  | { kind: 'set'; spec: FieldSpec; raw: string }
  | { kind: 'remove'; spec: FieldSpec }
  | { kind: 'ask'; spec: FieldSpec };

const EDIT_VERB = /^(?:לא[,\s]+)?(?:תתקני|תקני|תתקן|תקן|לתקן|תשני|שני|לשנות|תעדכני|עדכני|לעדכן|תחליפי|החליפי|להחליף|תמחקי|מחקי|למחוק|תורידי|הורידי|להוריד|תוסיפי|הוסיפי|להוסיף|טעות ב|טעיתי ב)\s*/;
const REMOVE_VERB = /^(?:תמחקי|מחקי|למחוק|תורידי|הורידי|להוריד)/;
const ADD_VERB = /^(?:תוסיפי|הוסיפי|להוסיף)/;
/** "שנת הייצור היא 2022 ולא 2021" / "הטלפון צריך להיות 050…" — a correction without an edit verb. */
const STATEMENT = /\s(?:הוא|היא|צריך להיות|צריכה להיות|זה)\s.+\sולא\s/;

/** "לא לא, …" / "רגע, …" / "סליחה, …" / "טעיתי, …" before a correction. */
const FILLER = /^(?:(?:לא|רגע|שנייה|שניה|סליחה|טעות|טעיתי|בעצם|אופס|אה)[,.!\s]+)+/;
/** "השם הוא יוסי לוי" / "הטלפון הנכון הוא 050…" / "השנה זה 2020" — a field stated with its new value, no edit verb. */
const DECLARE = /^ו?(?:[א-ת.'"״׳]+\s){1,3}(?:(?:הנכון|הנכונה|האמיתי|האמיתית)\s+)?(?:הוא|היא|זה|זו|יהיה|תהיה|צריך להיות|צריכה להיות)\s+\S/;

export function stripFillers(sentence: string): string {
  return sentence.trim().replace(FILLER, '').trim();
}

/** True when the sentence is a correction of the current draft (and not an answer to the open question). */
export function looksLikeCorrection(sentence: string): boolean {
  const t = sentence.trim();
  const bare = stripFillers(t);
  return EDIT_VERB.test(t) || EDIT_VERB.test(bare) || STATEMENT.test(` ${bare}`) || DECLARE.test(bare) || CONTRAST.test(bare);
}
/** "הלקוח עסקי לא פרטי" / "השנה 2022 לא 2021" — a short "X, not Y" (only a field of this draft counts). */
const CONTRAST = /^(?:\S+\s+){1,2}\S+\s+ו?לא\s+\S+$/;

/** Splits "תשני את הטלפון ל-050… ואת הדגם למאזדה 3, והשנה 2022" into one clause per field. */
function clauses(sentence: string): string[] {
  return sentence
    .split(/\s*(?:,|;|\sוגם\s|\sואת\s|\sוגם את\s|\sו(?=(?:ה|את\s)?(?:שם|טלפון|כתובת|דגם|יצרן|שנ|צבע|מספר|איש|הערה|רכב|קילומטר|דלק|מפתח|סכום|מחיר|אמצעי|תאריך|ח\.?פ))\s*)/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** The value said after the field name: "ל-0501234567", "הוא 2022 ולא 2021", "למאזדה 3". */
function valueAfter(clause: string, spec: FieldSpec): string {
  const m = clause.match(spec.match);
  let rest = m ? clause.slice((m.index || 0) + m[0].length) : clause;
  rest = rest
    .replace(/^\s*(?:של\s+ה?(?:לקוח|רכב|חברה|ספק|חשבונית|תשלום|תוספת)\s*)?/, '')
    .replace(/^\s*(?:הנכון|הנכונה|האמיתי|האמיתית)\s+/, '')
    .replace(/^\s*(?:ל-|ל־|ל(?=\d)|ל\s+|הוא\s+|היא\s+|יהיה\s+|תהיה\s+|צריך להיות\s+|צריכה להיות\s+|זה\s+|זו\s+|=|:|ב-|ב(?=\d))\s*/, '')
    .trim();
  // "2022 ולא 2021" / "2022 לא 2021" → 2022
  rest = rest.replace(/(?:^|\s+)ו?לא\s+\S+$/, '').trim();
  // the field word is itself the value: "הלקוח עסקי לא פרטי"
  if (!rest && m && spec.key === 'customerType') return m[0];
  // a leading Hebrew "ל" glued to a word: "למאזדה 3" → "מאזדה 3" (only when the field was named right before it)
  if (/^ל[א-ת]/.test(rest) && m) rest = rest.slice(1);
  return rest;
}

/** Turns a correction sentence into field edits for the fields that exist in this draft. */
export function parseFieldEdits(sentence: string, d: VoiceData): { edits: FieldEdit[]; unknown: string[] } {
  const edits: FieldEdit[] = [];
  const unknown: string[] = [];
  let lastVerb: 'set' | 'remove' | 'add' = 'set';
  for (const raw of clauses(stripFillers(sentence))) {
    const verbMatch = raw.match(EDIT_VERB);
    if (verbMatch) lastVerb = REMOVE_VERB.test(raw) ? 'remove' : ADD_VERB.test(raw) ? 'add' : 'set';
    const clause = raw.replace(EDIT_VERB, '').replace(/^(?:את\s+)/, '').trim();
    // only fields of THIS draft — "מחיר" in a quote line is not the supplement price of another form
    const spec = FIELD_SPECS.find((f) => f.match.test(clause) && f.relevant(d));
    if (!spec || edits.some((e) => e.spec.key === spec.key)) {
      if (clause) unknown.push(clause);
      continue;
    }
    if (lastVerb === 'remove' && spec.remove) {
      edits.push({ kind: 'remove', spec });
      continue;
    }
    const value = valueAfter(clause, spec);
    edits.push(value ? { kind: 'set', spec, raw: value } : { kind: 'ask', spec });
  }
  return { edits, unknown };
}

export interface EditResult {
  changed: string[];
  errors: string[];
  /** A field named without a value — its new value is asked next. */
  ask?: FieldSpec;
  /** Fields of a record that is already saved — changed through that record's own screen. */
  saved: string[];
}

/** Applies the edits to the draft (never to the database). */
export function applyFieldEdits(d: VoiceData, edits: FieldEdit[], now = new Date()): EditResult {
  const out: EditResult = { changed: [], errors: [], saved: [] };
  for (const e of edits) {
    if (e.spec.savedIn?.(d)) {
      out.saved.push(e.spec.label);
      continue;
    }
    if (e.kind === 'remove') {
      out.changed.push(e.spec.remove!(d));
      continue;
    }
    if (e.kind === 'ask') {
      if (!out.ask) out.ask = e.spec;
      continue;
    }
    const p = e.spec.parse(e.raw, now);
    if (p.ok) {
      p.set(d);
      out.changed.push(`${e.spec.label}: ${p.shown}`);
    } else {
      out.errors.push(`${e.spec.label}: ${(p as { why: string }).why}`);
    }
  }
  return out;
}

export function fieldByKey(key: string): FieldSpec | undefined {
  return FIELD_SPECS.find((f) => f.key === key);
}
