/**
 * Field edits of one claim from the claims chat — the same fields and storage as the claim edit form
 * (FC_MAP in ClaimsScreen / saveClaim in claimsService): row_data keys, plus the plate / client_name /
 * company_name columns that saveClaim keeps in sync. Pure functions; no I/O.
 *
 * Not editable here on purpose: status (its own tool, with history and notifications), next action / date
 * (tasks and reminders), free-text notes (would overwrite text), id and system fields.
 */

export type FieldKind = 'text' | 'date' | 'email' | 'phone' | 'plate' | 'money' | 'kind' | 'idnum' | 'license';

export type ClaimEditField = {
  label: string;
  kind: FieldKind;
  /** Column kept in sync with row_data by saveClaim. */
  column?: 'plate' | 'client_name' | 'company_name';
  /** Second row_data key holding the same value (the accident notice form reads it), kept equal on save. */
  mirror?: string;
  /** Why a change needs extra care (shown before approval). */
  risk?: string;
};

export const CLAIM_KINDS = ['תביעה במסגרת פוליסת הלקוח', 'תביעת צד ג׳'] as const;

const MAIL_MATCH = 'משמש לשיוך מיילים נכנסים לתיק. שינוי עלול לשייך מיילים אחרת.';

export const CLAIM_EDIT_FIELDS: Record<string, ClaimEditField> = {
  claimNum: { label: 'מספר תביעה בחברת הביטוח', kind: 'text', risk: MAIL_MATCH },
  eventDate: { label: 'תאריך אירוע', kind: 'date', risk: 'משמש יחד עם מספר הרכב לשיוך מיילים.' },
  plate: { label: 'מספר רכב', kind: 'plate', column: 'plate', risk: MAIL_MATCH },
  carModel: { label: 'דגם רכב', kind: 'text' },
  claimKind: { label: 'סוג תביעה', kind: 'kind' },
  policyNum: { label: 'מספר פוליסה', kind: 'text' },
  insCompany: { label: 'חברת ביטוח', kind: 'text', column: 'company_name' },
  insEmail: { label: 'אימייל חברת הביטוח', kind: 'email', risk: 'מיילים מהתיק יישלחו לכתובת החדשה.' },
  insRepName: { label: 'נציג ביטוח – שם', kind: 'text' },
  insRepPhone: { label: 'נציג ביטוח – טלפון', kind: 'phone' },
  insRepEmail: { label: 'נציג ביטוח – אימייל', kind: 'email' },
  clientName: { label: 'שם לקוח', kind: 'text', column: 'client_name', risk: 'השם מקשר את התיק לכרטיס הלקוח.' },
  clientPhone: { label: 'טלפון לקוח', kind: 'phone' },
  clientEmail: { label: 'אימייל לקוח', kind: 'email' },
  // Third party — the same row_data keys as the accident notice form (ACCIDENT_NOTICE_FIELDS, section ד).
  // Driver, vehicle owner and insured are separate people and separate fields.
  thirdParty: { label: 'צד ג׳ – שם הנהג', kind: 'text', mirror: 'thirdDriver' },
  thirdId: { label: 'צד ג׳ – ת.ז. הנהג', kind: 'idnum' },
  thirdLicense: { label: 'צד ג׳ – מספר רישיון נהיגה', kind: 'license' },
  thirdPhone: { label: 'צד ג׳ – טלפון', kind: 'phone' },
  thirdEmail: { label: 'צד ג׳ – אימייל', kind: 'email' },
  thirdAddress: { label: 'צד ג׳ – כתובת', kind: 'text' },
  thirdPlate: { label: 'צד ג׳ – מספר רכב', kind: 'plate' },
  thirdMakeModel: { label: 'צד ג׳ – יצרן ודגם', kind: 'text' },
  thirdOwner: { label: 'צד ג׳ – שם בעל הרכב', kind: 'text' },
  thirdInsured: { label: 'צד ג׳ – שם המבוטח', kind: 'text' },
  thirdInsCompany: { label: 'צד ג׳ – חברת ביטוח', kind: 'text' },
  thirdPolicy: { label: 'צד ג׳ – מספר פוליסה', kind: 'text' },
  thirdClaimNum: { label: 'צד ג׳ – מספר תביעה', kind: 'text' },
  surveyor: { label: 'שם שמאי', kind: 'text' },
  survPhone: { label: 'טלפון שמאי', kind: 'phone' },
  survEmail: { label: 'אימייל שמאי', kind: 'email' },
  finAmount: { label: 'סכום תביעה (₪)', kind: 'money' },
  finApproved: { label: 'סכום שאושר (₪)', kind: 'money' },
  finPaid: { label: 'סכום ששולם (₪)', kind: 'money' },
  finPayDate: { label: 'תאריך תשלום', kind: 'date' },
  finRef: { label: 'אסמכתת תשלום', kind: 'text' },
  legalReason: { label: 'סיבת העברה למשפטי', kind: 'text' },
  legalLawyer: { label: 'עורך דין', kind: 'text' },
  legalFirm: { label: 'משרד עורכי דין', kind: 'text' },
  legalPhone: { label: 'טלפון עורך דין', kind: 'phone' },
  legalEmail: { label: 'אימייל עורך דין', kind: 'email' },
  legalDate: { label: 'תאריך העברה למשפטי', kind: 'date' },
};

/** Hebrew or English names the user may say, mapped to the form field. */
const FIELD_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(CLAIM_EDIT_FIELDS).flatMap(([key, f]) => [[key.toLowerCase(), key], [f.label, key]]),
);
Object.assign(FIELD_ALIASES, {
  'מספר תביעה': 'claimNum',
  'תאריך תאונה': 'eventDate',
  'תאריך האירוע': 'eventDate',
  'רכב': 'plate',
  'מספר רישוי': 'plate',
  'ביטוח': 'insCompany',
  'פוליסה': 'policyNum',
  'שמאי': 'surveyor',
  'צד ג': 'thirdParty',
  'צד ג׳': 'thirdParty',
  thirddriver: 'thirdParty',
  'נהג צד ג׳': 'thirdParty',
  'הנהג הפוגע': 'thirdParty',
  'רכב צד ג׳': 'thirdPlate',
  'חברת הביטוח של צד ג׳': 'thirdInsCompany',
  'פוליסת צד ג׳': 'thirdPolicy',
  'בעל הרכב צד ג׳': 'thirdOwner',
  'מבוטח צד ג׳': 'thirdInsured',
});

export function resolveField(name: string): string | null {
  const raw = String(name || '').trim();
  if (CLAIM_EDIT_FIELDS[raw]) return raw;
  const geresh = raw.replace(/['"`]/g, '׳').replace(/\s+/g, ' ');
  return FIELD_ALIASES[raw] || FIELD_ALIASES[raw.toLowerCase()] || FIELD_ALIASES[geresh] || null;
}

/** The value now in the claim for a field (its mirror key when the field itself is empty). */
export function currentFieldValue(rowData: Record<string, unknown>, field: string) {
  const own = String(rowData?.[field] ?? '');
  const mirror = CLAIM_EDIT_FIELDS[field]?.mirror;
  return own || (mirror ? String(rowData?.[mirror] ?? '') : '');
}

function normalizeValue(kind: FieldKind, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!v) return { ok: false, error: 'ערך ריק — לא מעדכנים שדה לריק דרך הצ׳אט' };
  if (v.length > 200) return { ok: false, error: 'הערך ארוך מדי' };
  switch (kind) {
    case 'date': {
      let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      let y: number, mo: number, d: number;
      if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else {
        m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
        if (!m) return { ok: false, error: 'תאריך לא תקין (נדרש יום/חודש/שנה)' };
        d = +m[1]; mo = +m[2]; y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      }
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1990 || y > 2100) {
        return { ok: false, error: 'תאריך לא קיים' };
      }
      return { ok: true, value: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? { ok: true, value: v.toLowerCase() } : { ok: false, error: 'כתובת מייל לא תקינה' };
    case 'phone': {
      const digits = v.replace(/[^\d+]/g, '');
      return /^\+?\d{9,13}$/.test(digits) ? { ok: true, value: v } : { ok: false, error: 'מספר טלפון לא תקין' };
    }
    case 'plate': {
      const digits = v.replace(/\D/g, '');
      return /^\d{7,8}$/.test(digits) ? { ok: true, value: v } : { ok: false, error: 'מספר רכב חייב להכיל 7 או 8 ספרות' };
    }
    case 'idnum': {
      const digits = v.replace(/\D/g, '');
      return /^\d{8,9}$/.test(digits) && digits.length >= v.replace(/[\s-]/g, '').length
        ? { ok: true, value: digits } : { ok: false, error: 'מספר תעודת זהות חייב להכיל 8 או 9 ספרות' };
    }
    case 'license': {
      const digits = v.replace(/\D/g, '');
      return /^\d{5,9}$/.test(digits) && digits.length >= v.replace(/[\s-]/g, '').length
        ? { ok: true, value: digits } : { ok: false, error: 'מספר רישיון נהיגה חייב להכיל 5 עד 9 ספרות' };
    }
    case 'money': {
      const n = Number(v.replace(/[₪,\s]/g, ''));
      return Number.isFinite(n) && n >= 0 ? { ok: true, value: String(n) } : { ok: false, error: 'סכום לא תקין' };
    }
    case 'kind':
      return (CLAIM_KINDS as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: `סוג תביעה חייב להיות: ${CLAIM_KINDS.join(' / ')}` };
    default:
      return { ok: true, value: v };
  }
}

export type FieldChange = { field: string; label: string; before: string; after: string; risk?: string };

export type FieldEditPlan = {
  changes: FieldChange[];
  unchanged: string[];
  errors: string[];
};

/** Validates the requested changes against the current claim. Never invents a value. */
export function planClaimFieldEdit(rowData: Record<string, unknown>, requested: Array<{ field: string; value: string }>): FieldEditPlan {
  const plan: FieldEditPlan = { changes: [], unchanged: [], errors: [] };
  const seen = new Set<string>();
  for (const req of requested || []) {
    const key = resolveField(req?.field);
    if (!key) { plan.errors.push(`השדה "${String(req?.field || '')}" לא קיים בטופס התביעה או שאינו ניתן לעריכה מהצ׳אט`); continue; }
    if (seen.has(key)) { plan.errors.push(`השדה "${CLAIM_EDIT_FIELDS[key].label}" התבקש יותר מפעם אחת`); continue; }
    seen.add(key);
    const def = CLAIM_EDIT_FIELDS[key];
    const norm = normalizeValue(def.kind, req.value);
    if (!norm.ok) { plan.errors.push(`${def.label}: ${norm.error}`); continue; }
    const before = currentFieldValue(rowData, key);
    if (before === norm.value) { plan.unchanged.push(def.label); continue; }
    plan.changes.push({ field: key, label: def.label, before, after: norm.value, ...(def.risk ? { risk: def.risk } : {}) });
  }
  return plan;
}

/**
 * The update for claims_records: only the changed row_data keys merged onto the latest row_data,
 * the synced columns, and finBalance when money fields change (as saveClaim does).
 * Returns stale fields when the claim changed since the preview.
 */
export function applyClaimFieldEdit(
  latestRowData: Record<string, unknown>,
  changes: FieldChange[],
  meta: { nowHe: string; actorName: string },
) {
  const stale = changes.filter((c) => currentFieldValue(latestRowData, c.field) !== c.before).map((c) => c.label);
  if (stale.length) return { ok: false as const, stale };
  const rowData: Record<string, unknown> = { ...latestRowData };
  const columns: Record<string, string | null> = {};
  for (const c of changes) {
    rowData[c.field] = c.after;
    const mirror = CLAIM_EDIT_FIELDS[c.field]?.mirror;
    if (mirror) rowData[mirror] = c.after;
    const col = CLAIM_EDIT_FIELDS[c.field]?.column;
    if (col === 'plate') columns.plate = c.after;
    if (col === 'client_name') columns.client_name = c.after;
    // Same rule as saveClaim: company_name column = row_data.company_name || insCompany.
    if (col === 'company_name') columns.company_name = String(rowData.company_name ?? '') || c.after;
  }
  if (changes.some((c) => c.field === 'finApproved' || c.field === 'finPaid')) {
    rowData.finBalance = String((Number(rowData.finApproved) || 0) - (Number(rowData.finPaid) || 0));
  }
  rowData.updatedAt = meta.nowHe;
  rowData.lastActivityAt = meta.nowHe;
  rowData.updatedByName = meta.actorName;
  return { ok: true as const, rowData, columns };
}

/** One line per change for the approval card. */
export function describeChanges(changes: FieldChange[]) {
  return changes.map((c) => `${c.label} — ערך נוכחי: ${c.before || '(ריק)'} · ערך חדש: ${c.after}`);
}
