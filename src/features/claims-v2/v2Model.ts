import type { ClaimRecord } from '@/features/claims/claimsConstants';

/** Display groups for every claim field the current edit form writes (same keys as FC_MAP). */
export const FIELD_GROUPS: Array<{ key: string; title: string; fields: Array<[string, string]> }> = [
  { key: 'claim', title: 'פרטי התביעה', fields: [
    ['claimNum', 'מספר תביעה'], ['claimKind', 'סוג תביעה'], ['eventDate', 'תאריך אירוע'], ['createdAt', 'תאריך פתיחה'],
    ['status', 'סטטוס'], ['assigned_to_name', 'עובד מטפל'], ['policyNum', 'מספר פוליסה'],
    ['lastTreatmentAt', 'טיפול אחרון'], ['nextDate', 'טיפול הבא'], ['nextAction', 'פעולה הבאה'],
    ['lastStatusNote', 'הערה אחרונה'], ['source', 'מקור'], ['updatedByName', 'עודכן ע״י'], ['updatedAt', 'עודכן בתאריך'],
  ] },
  { key: 'client', title: 'לקוח', fields: [['clientName', 'שם לקוח'], ['clientPhone', 'טלפון'], ['clientEmail', 'אימייל'], ['company_name', 'חברה / לקוח עסקי']] },
  { key: 'vehicle', title: 'רכב', fields: [['plate', 'מספר רישוי'], ['carModel', 'דגם'], ['vehicle_id', 'רכב במערכת']] },
  { key: 'insurer', title: 'חברת ביטוח', fields: [['insCompany', 'חברת ביטוח'], ['insEmail', 'אימייל ביטוח'], ['insRepName', 'נציג'], ['insRepPhone', 'טלפון נציג'], ['insRepEmail', 'אימייל נציג']] },
  { key: 'surveyor', title: 'שמאי', fields: [['surveyor', 'שם שמאי'], ['survPhone', 'טלפון שמאי'], ['survEmail', 'אימייל שמאי']] },
  { key: 'third', title: 'צד ג׳', fields: [['thirdParty', 'צד ג׳'], ['thirdPlate', 'רכב צד ג׳'], ['thirdPhone', 'טלפון צד ג׳'], ['thirdEmail', 'אימייל צד ג׳']] },
  { key: 'fin', title: 'כספי', fields: [['finAmount', 'סכום תביעה (₪)'], ['finApproved', 'סכום שאושר (₪)'], ['finPaid', 'סכום ששולם (₪)'], ['finPayDate', 'תאריך תשלום'], ['finRef', 'אסמכתא']] },
  { key: 'legal', title: 'טיפול משפטי', fields: [['legalReason', 'סיבת העברה'], ['legalLawyer', 'עורך דין'], ['legalFirm', 'משרד'], ['legalPhone', 'טלפון'], ['legalEmail', 'אימייל'], ['legalDate', 'תאריך העברה'], ['legalNotes', 'הערות משפטיות']] },
  { key: 'notes', title: 'הערות פנימיות', fields: [['notes', 'הערות']] },
];

/** Keys that are system bookkeeping, not information for the reader. */
const HIDDEN_KEYS = new Set(['id', 'data', 'row_data', 'assigned_to', 'created_by', 'eventFormSignature', 'channels', 'full_name', 'trim']);

export function extraFields(c: ClaimRecord): Array<[string, string]> {
  const known = new Set(FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f[0])));
  return Object.entries(c)
    .filter(([k, v]) => !known.has(k) && !HIDDEN_KEYS.has(k) && typeof v === 'string' && v.trim() !== '' && v.length < 400)
    .map(([k, v]) => [k, String(v)]);
}

export function fieldValue(c: ClaimRecord, key: string): string {
  const v = String(c[key] ?? '').trim();
  if (key === 'vehicle_id') return v ? 'משויך לרכב במערכת' : '';
  if (/Date$|At$/.test(key) && v) return fmtDay(v);
  return v;
}

function parse(v: unknown): Date | null {
  const s = String(v || '').trim();
  if (!s) return null;
  const he = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (he) {
    const y = Number(he[3].length === 2 ? `20${he[3]}` : he[3]);
    const d = new Date(y, Number(he[2]) - 1, Number(he[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDay(v: unknown): string {
  const d = parse(v);
  if (!d) return String(v || '');
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtWhen(v: unknown, now = Date.now()): string {
  const d = parse(v);
  if (!d) return String(v || '—');
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const hm = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `היום ${hm}`;
  if (diff === -1) return `אתמול ${hm}`;
  if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function fmtFull(v: unknown): string {
  const d = parse(v);
  if (!d) return String(v || '—');
  return `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtBytes(n?: number) {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

/** Days from today to a claim date (ISO or dd/mm/yyyy), same meaning as the current dashboard. */
export function daysFromToday(v: string): number | null {
  const s = String(v || '').trim();
  if (!s) return null;
  let d: Date | null = null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const he = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (iso) d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  else if (he) d = new Date(he[3].length === 2 ? 2000 + Number(he[3]) : Number(he[3]), Number(he[2]) - 1, Number(he[1]), 12);
  else { const x = new Date(s); d = Number.isNaN(x.getTime()) ? null : x; }
  if (!d) return null;
  const t = new Date(); t.setHours(12, 0, 0, 0); d.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}
