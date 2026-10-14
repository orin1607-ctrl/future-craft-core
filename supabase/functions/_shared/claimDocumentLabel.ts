/**
 * Hebrew labels for a read claim document: type, sender, title, short description, status.
 * Pure functions over the stored read_* fields in doc_meta — no new columns, no network.
 * Only facts found in the document text are used. Unknown stays unknown.
 * Shared by the claims gallery (Vite) and the claims chat (Deno).
 */

export const UNKNOWN_DOC_TYPE = 'מסמך לא מזוהה – נדרשת בדיקה';
/** Shown when a document has no read at all — a fact, not a guess. */
export const NOT_READ_LABEL = 'טרם נקרא';
const NOT_IN_DOC = 'לא מופיע במסמך';
const LEGACY_UNKNOWN = 'לא זוהה סוג מתוכן המסמך';

// The phrase that appears earliest in the document decides; list order breaks ties.
const DOC_TYPE_RULES: Array<[string, RegExp]> = [
  ['מסמך משפטי', /כתב\s*תביעה|בית\s*(?:ה)?משפט|ייפוי\s*כוח|יפוי\s*כח|מכתב\s*התראה|lawsuit|\bcourt\b|power\s*of\s*attorney/i],
  ['טופס תביעה', /טופס\s*(?:הודעה\s*על\s*)?(?:תביעה|תאונה)|הודעה\s*על\s*תאונ|claim\s*form|accident\s*report\s*form/i],
  ['רישיון רכב', /רי?שיון\s*(?:ה)?רכב|vehicle\s*(?:license|licence|registration)/i],
  ['דוח שמאי', /דו["״']?ח\s*(?:ה)?שמא|חוות\s*דעת\s*שמא|שמאות|שמאי|surveyor|survey\s*report|loss\s*adjust/i],
  ['הצעת מחיר', /הצעת\s*מחיר|quotation|\bquote\b|\bestimate\b/i],
  ['דרישת תשלום', /דרישת\s*תשלום|דרישה\s*לתשלום|payment\s*demand|demand\s*for\s*payment/i],
  ['אישור תשלום', /אישור\s*(?:על\s*)?(?:ה)?תשלום|אישור\s*העברה|payment\s*(?:approval|confirmation)|remittance/i],
  ['חשבונית', /חשבונ|invoice|receipt|קבלה\s*מס/i],
  ['אישור כיסוי ביטוחי', /אישור\s*כיסוי|כיסוי\s*ביטוחי|תעודת\s*ביטוח|אישור\s*ביטוח|certificate\s*of\s*insurance|coverage\s*confirmation/i],
  ['אישור מוסך', /אישור\s*(?:ה)?מוסך|מוסך\s*מורשה|garage\s*(?:approval|confirmation)/i],
];

// Only when nothing more specific was found: insurer letterheads appear on most claim documents.
const INSURER_LETTER: [string, RegExp] = ['מכתב חברת ביטוח', /חברת\s*(?:ה)?ביטוח|מחלקת\s*(?:ה)?תביעות|insurance\s*company|claims\s*department/i];

const REPAIR_CONTEXT = /תיקון|מוסך|פחחות|צבע|repair|garage|body\s*shop/i;

// Insurer names, matched as whole Hebrew words (no letter on either side).
const HE = 'א-ת';
const INSURERS: Array<[string, RegExp]> = [
  ['הראל', new RegExp(`(?:^|[^${HE}])הראל(?:[^${HE}]|$)|\\bharel\\b`, 'i')],
  ['מגדל', new RegExp(`(?:^|[^${HE}])מגדל(?:[^${HE}]|$)|\\bmigdal\\b`, 'i')],
  ['כלל ביטוח', /כלל\s*(?:חברה\s*ל)?ביטוח|\bclal\b/i],
  ['הפניקס', /הפניקס|\bphoenix\b/i],
  ['מנורה מבטחים', /מנורה|\bmenora\b/i],
  ['איילון', /איילון|\bayalon\b/i],
  ['שומרה', /שומרה|\bshomera\b/i],
  ['ביטוח ישיר', /ביטוח\s*ישיר|\bdirect\s*insurance\b/i],
  ['הכשרה', /הכשרה\s*(?:חברה\s*ל)?ביטוח|\bhachshara\b/i],
  ['ליברה', /ליברה|\blibra\b/i],
  ['שירביט', /שירביט|\bshirbit\b/i],
  ['AIG', /\bAIG\b/],
  ['שלמה ביטוח', /שלמה\s*(?:חברה\s*ל)?ביטוח/],
  ['ווישור', /ווישור|\bwesure\b/i],
];

type Meta = Record<string, string> | null | undefined;

function asMeta(meta: Meta): Record<string, string> {
  return meta && typeof meta === 'object' ? meta : {};
}

function known(value: string | undefined) {
  const v = String(value || '').trim();
  if (!v || v === NOT_IN_DOC || v.startsWith('לא ')) return '';
  return v;
}

function first(list: string | undefined) {
  return known(list).split(', ')[0]?.trim() || '';
}

function earliestRule(text: string) {
  let best = '';
  let bestAt = Infinity;
  for (const [label, re] of DOC_TYPE_RULES) {
    const at = text.search(re);
    if (at >= 0 && at < bestAt) {
      best = label;
      bestAt = at;
    }
  }
  return best;
}

/** Document type from its text, or UNKNOWN_DOC_TYPE. */
export function classifyDocumentText(text: string) {
  const clean = String(text || '');
  if (!clean.trim()) return UNKNOWN_DOC_TYPE;
  const found = earliestRule(clean) || (INSURER_LETTER[1].test(clean) ? INSURER_LETTER[0] : '');
  if (!found) return UNKNOWN_DOC_TYPE;
  if (found === 'חשבונית' && REPAIR_CONTEXT.test(clean)) return 'חשבונית תיקון';
  return found;
}

/** Sender or insurer named in the document, with the line it came from. */
export function senderFromText(text: string): { sender: string; source: string } {
  const lines = String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines.slice(0, 8);
  for (const pool of [header, lines]) {
    for (const line of pool) {
      const hit = INSURERS.find(([, re]) => re.test(line));
      if (hit) return { sender: hit[0], source: line.slice(0, 200) };
    }
  }
  const fromLine = lines.find((l) => /^(?:מאת|from)\s*[:-]/i.test(l));
  if (fromLine) {
    const sender = fromLine.replace(/^(?:מאת|from)\s*[:-]\s*/i, '').slice(0, 80).trim();
    if (sender) return { sender, source: fromLine.slice(0, 200) };
  }
  return { sender: '', source: '' };
}

export type DocumentLabel = {
  status: 'ready' | 'pending' | 'processing' | 'failed' | 'review' | '';
  statusLabel: string;
  docType: string;
  title: string;
  description: string;
  sender: string;
  senderSource: string;
  date: string;
  amount: string;
  needsReview: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  ready: 'נקרא',
  pending: 'ממתין לקריאה',
  processing: 'בעיבוד',
  failed: 'הקריאה נכשלה',
  review: 'דורש בדיקה',
};

/** Hebrew label for a document from its stored read. Returns null when the document was never read. */
export function documentLabel(meta: Meta): DocumentLabel | null {
  const row = asMeta(meta);
  const readStatus = row.read_status;
  if (!readStatus) return null;
  const empty = { docType: '', title: '', description: '', sender: '', senderSource: '', date: '', amount: '' };
  if (readStatus === 'pending' || readStatus === 'processing' || readStatus === 'failed') {
    return { ...empty, status: readStatus, statusLabel: STATUS_LABELS[readStatus], needsReview: readStatus === 'failed' };
  }
  if (readStatus === 'unreadable') {
    return {
      ...empty,
      status: 'review',
      statusLabel: STATUS_LABELS.review,
      description: 'הקובץ אינו קריא. יש לפתוח ולבדוק ידנית.',
      needsReview: true,
    };
  }
  if (readStatus !== 'ready') return null;

  const text = String(row.read_text || '');
  const stored = known(row.read_doc_type);
  const docType = stored && stored !== LEGACY_UNKNOWN ? stored : classifyDocumentText(text);
  const { sender, source: senderSource } = senderFromText(text);
  const plate = first(row.read_plates);
  const claimNum = first(row.read_claim_nums);
  const date = first(row.read_dates);
  const amount = first(row.read_amounts);

  if (docType === UNKNOWN_DOC_TYPE) {
    return {
      status: 'review',
      statusLabel: STATUS_LABELS.review,
      docType,
      title: UNKNOWN_DOC_TYPE,
      description: 'לא זוהה סוג המסמך מתוך התוכן. יש לפתוח ולבדוק.',
      sender,
      senderSource,
      date,
      amount,
      needsReview: true,
    };
  }

  const subject = plate ? `רכב ${plate}` : claimNum ? `תביעה ${claimNum}` : sender;
  const title = subject ? `${docType} – ${subject}` : docType;
  const description = [
    sender ? `${docType} מאת ${sender}` : docType,
    date ? `תאריך ${date}` : '',
    amount ? `סכום ${amount}` : '',
  ].filter(Boolean).join(' · ');

  return {
    status: 'ready',
    statusLabel: STATUS_LABELS.ready,
    docType,
    title,
    description,
    sender,
    senderSource,
    date,
    amount,
    needsReview: false,
  };
}

/** Display name: manual title first, then the read title, then the original file name. */
export function documentDisplayTitle(file: { original_name?: string; doc_meta?: Meta }) {
  const meta = asMeta(file.doc_meta);
  const manual = String(meta.staff_title || '').trim();
  if (manual) return manual;
  const label = documentLabel(meta);
  if (label?.title) return label.title;
  return String(file.original_name || 'מסמך');
}
