import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLAIM_DOC_TYPES, CLAIM_KINDS, CLOSE_REASONS, DOCS_ORDER, MANDATORY_STATUSES, STATUS_MANUAL, STATUS_UNCHANGED, STATUSES, claimHasNextAction, claimNeedsReturn, displayClaimNum, docsOrderLabel, docsOrderOf, isClosedStatus, mailClaimLabel, workClaimNum, type ClaimDocType, type ClaimRecord, type ClaimsActor, type ClaimsVehicleHit } from './claimsConstants';
import { CUSTOMER_REQUEST_KINDS, CUSTOMER_REQUEST_STATUSES, FOLLOWUP_DAY_PRESETS, RECURRING_DAY_PRESETS, buildClaimRowAlerts, customerKindLabel, customerStatusLabel, customerStatusOf, detectMailRequests, followupDaysPreset, followupWaitDaysFromRow, inferRecipientKind, isDocMailRequest, isScheduledOnceMail, mailLooksInbound, mailShowsTreatment, normalizeFollowupDays, normalizeRecurringDays, recipientKindLabel, recurringDaysPreset, recurringLabel, type ClaimAlert } from './claimWorkAlerts';
import { createClaimsApi, type ClaimsApi, type MailFollowupRow } from './claimsService';
import ClaimAccidentForm from './ClaimAccidentForm';
import { EMPTY_INTAKE, intakeFromClaim, mergeIntakeToClaim, type IntakeDraft } from './claimIntakeModel';
import './claims.css';

const ST_CSS: Record<string, string> = {
  'חדש': 's-new', 'ממתין לטיפול': 's-wait', 'בטיפול': 's-act',
  'ממתין לחברת ביטוח': 's-wait', 'ממתין לשמאי': 's-wait', 'ממתין למסמכים': 's-doc',
  'ממתין לתשלום': 's-pay', 'אושר לתשלום': 's-done', 'תשלום חלקי': 's-wait',
  'שולם': 's-done', 'נדחה': 's-rej', 'הועבר לטיפול משפטי': 's-leg',
  'בטיפול משפטי': 's-leg', 'הסתיים': 's-done',
};

function claimInsCompany(c: ClaimRecord): string {
  return String(c.insCompany || '').trim();
}

function claimInsCompanyLabel(c: ClaimRecord): string {
  return claimInsCompany(c) || '—';
}

function parseDay(s: string): Date | null {
  if (!s) return null;
  const iso = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  const he = String(s).match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (he) {
    const y = he[3].length === 2 ? 2000 + Number(he[3]) : Number(he[3]);
    return new Date(y, Number(he[2]) - 1, Number(he[1]), 12);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysFromToday(s: string): number | null {
  const d = parseDay(s);
  if (!d) return null;
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  d.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

function returnNeededLabel(c: ClaimRecord): string {
  if (isClosedStatus(c.status, c.archived)) return 'אין צורך בחזרה';
  return claimNeedsReturn(c) ? 'כן' : '—';
}

function RowAlerts({ alerts }: { alerts: ClaimAlert[] }) {
  if (!alerts.length) return <span style={{ color: 'var(--t3)' }}>—</span>;
  return (
    <div className="row-alerts" data-testid="claim-row-alerts">
      {alerts.map((a) => (
        <span key={a.key} className={`row-alert tone-${a.tone}`} data-testid={`claim-alert-${a.key}`}>{a.label}</span>
      ))}
    </div>
  );
}

const FC_MAP: Record<string, string> = {
  fc_name: 'clientName', fc_phone: 'clientPhone', fc_email: 'clientEmail',
  fc_plate: 'plate', fc_model: 'carModel', fc_co: 'insCompany', fc_coEmail: 'insEmail',
  fc_claimNum: 'claimNum', fc_insRepName: 'insRepName', fc_insRepPhone: 'insRepPhone',
  fc_insRepEmail: 'insRepEmail', fc_surv: 'surveyor', fc_survPhone: 'survPhone',
  fc_survEmail: 'survEmail', fc_amount: 'finAmount', fc_approved: 'finApproved',
  fc_paid: 'finPaid', fc_payDate: 'finPayDate', fc_ref: 'finRef',
  fc_nextAction: 'nextAction', fc_nextDate: 'nextDate', fc_notes: 'notes',
  fc_legalReason: 'legalReason', fc_legalLawyer: 'legalLawyer', fc_legalFirm: 'legalFirm',
  fc_legalPhone: 'legalPhone', fc_legalEmail: 'legalEmail', fc_legalDate: 'legalDate',
  fc_legalNotes: 'legalNotes',
  fc_kind: 'claimKind', fc_eventDate: 'eventDate', fc_policyNum: 'policyNum',
  fc_thirdParty: 'thirdParty', fc_thirdPlate: 'thirdPlate', fc_thirdPhone: 'thirdPhone', fc_thirdEmail: 'thirdEmail',
};

function stBadge(s: string) {
  return <span className={`st ${ST_CSS[s] || 's-def'}`}>{s}</span>;
}
function fmt(v: unknown) {
  return `${(Number(v) || 0).toLocaleString('he-IL')}₪`;
}
function fmtWhen(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('he-IL');
}
function fmtDay(s: string) {
  if (!s) return '—';
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s))) {
    return d.toLocaleDateString('he-IL');
  }
  const m = String(s).match(/^(\d{1,2}[./]\d{1,2}[./]\d{2,4})/);
  return m ? m[1] : s;
}
function fuStatusHe(s: string) {
  const map: Record<string, string> = {
    scheduled: 'מתוזמן',
    completed: 'הושלם',
    cancelled: 'בוטל / נעצר',
    failed: 'נכשל',
    pending: 'ממתין',
    sending: 'בתהליך',
    dry_run_sent: 'Dry Run — לא נשלח',
  };
  return map[s] || s;
}
function isScheduledOnce(fu: { purpose?: string }) {
  return isScheduledOnceMail(fu.purpose);
}
function fmtClock(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}
function toLocalInput(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function val(_form: HTMLFormElement | HTMLElement | null, id: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  return (el?.value || '').trim();
}
function setVal(id: string, v: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (el) el.value = v || '';
}

type CachedCustLink = { id: string; url: string; expiresAt: string };
function custLinkCacheKey(claimId: string) {
  return `dalia-claims-cust-link:${claimId}`;
}
function readCustLinkCache(claimId: string): CachedCustLink | null {
  try {
    const raw = localStorage.getItem(custLinkCacheKey(claimId));
    if (!raw) return null;
    const v = JSON.parse(raw) as CachedCustLink;
    if (!v?.id || !v?.url) return null;
    if (v.expiresAt && new Date(v.expiresAt).getTime() <= Date.now()) return null;
    return v;
  } catch {
    return null;
  }
}
function writeCustLinkCache(claimId: string, v: CachedCustLink) {
  localStorage.setItem(custLinkCacheKey(claimId), JSON.stringify(v));
}
function clearCustLinkCache(claimId: string) {
  localStorage.removeItem(custLinkCacheKey(claimId));
}
function customerUploadUrl(token: string) {
  const origin = window.location.origin;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${origin}${base && base !== '/' ? base : ''}/claims-upload?t=${token}`;
}

function fmtBytes(n: number) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const PACKAGE_LIMIT = 18 * 1024 * 1024;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
function normalizeMailAddr(raw: string) {
  return String(raw || '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00ad\u200b-\u200d\ufeff]/g, '')
    .replace(/\uFF20/g, '@')
    .replace(/[\uFF0E\uFF61]/g, '.')
    .trim();
}
function mailAddrsOk(raw: string, required: boolean) {
  const parts = normalizeMailAddr(raw).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return !required;
  return parts.every((p) => EMAIL_RE.test(p));
}
function mailAddrParts(raw: string) {
  return normalizeMailAddr(raw).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}
function MailAddrChips({ id, testId, value, disabled, placeholder, onChange }: {
  id: string; testId: string; value: string; disabled?: boolean; placeholder?: string; onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const parts = mailAddrParts(value);
  const commit = (raw: string) => {
    const add = mailAddrParts(raw);
    if (!add.length) return;
    const next = [...parts];
    for (const a of add) {
      if (!next.some((x) => x.toLowerCase() === a.toLowerCase())) next.push(a);
    }
    onChange(next.join(', '));
    setDraft('');
  };
  return (
    <div className="mail-chips" data-testid={`${testId}-wrap`}>
      {parts.map((p) => (
        <span key={p} className="mail-chip">
          <span dir="ltr">{p}</span>
          <button type="button" disabled={disabled} aria-label={`הסר ${p}`} onClick={() => onChange(parts.filter((x) => x !== p).join(', '))}>×</button>
        </span>
      ))}
      <input
        id={id}
        data-testid={testId}
        className="mail-chip-input"
        dir="ltr"
        inputMode="email"
        autoComplete="email"
        disabled={disabled}
        value={draft}
        placeholder={parts.length ? 'הוסף כתובת' : (placeholder || '')}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); commit(draft); }
          if (e.key === 'Backspace' && !draft && parts.length) onChange(parts.slice(0, -1).join(', '));
        }}
        onBlur={() => { if (draft.trim()) commit(draft); }}
      />
    </div>
  );
}
function emailsFromHeader(raw: string) {
  return (String(raw || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((e) => e.toLowerCase());
}
function sourceHe(src: string) {
  if (src === 'gmail') return 'התקבל במייל';
  if (src === 'customer') return 'הועלה על ידי הלקוח';
  if (src === 'staff') return 'הועלה על ידינו';
  return src || '—';
}
const WORK_STATUS: Array<{ key: string; label: string }> = [
  { key: 'open', label: 'פתוח' },
  { key: 'waiting_doc', label: 'ממתין למסמך' },
  { key: 'doc_received', label: 'מסמך התקבל' },
  { key: 'ready_to_send', label: 'מוכן לשליחה' },
  { key: 'sent', label: 'נשלח' },
  { key: 'waiting_reply', label: 'ממתין לתשובה' },
  { key: 'done', label: 'הושלם' },
];
function workStatusHe(k: string) {
  return WORK_STATUS.find((x) => x.key === k)?.label || k || 'פתוח';
}
function docStateHe(k: string) {
  if (k === 'ready') return 'המסמך קיים – מוכן לשליחה';
  if (k === 'missing') return 'חסר מסמך';
  if (k === 'awaiting_signature') return 'ממתין לגרסה חתומה';
  if (k === 'needs_review') return 'דורש בדיקת עובד';
  return k || '';
}
const OWN_MAILBOX = 'yoni122222@gmail.com';
function quotedOriginal(im: Record<string, unknown>) {
  return `\n\n---------- הודעה מקורית ----------\nFrom: ${im.from_addr || ''}\nTo: ${im.to_addr || ''}\nDate: ${im.sent_at || ''}\nSubject: ${im.subject || ''}\n\n${im.body_text || ''}`;
}
function withMailPrefix(subj: string, prefix: string) {
  const s = String(subj || '').trim();
  if (!s) return prefix.trim();
  if (s.toLowerCase().startsWith(prefix.toLowerCase())) return s;
  return `${prefix}${s}`;
}
function FollowupDaysPicker({ days, onChange, disabled, testPrefix }: { days: number; onChange: (n: number) => void; disabled?: boolean; testPrefix: string }) {
  const preset = followupDaysPreset(days);
  return (
    <div className="fu-days" data-testid={`${testPrefix}-picker`}>
      {FOLLOWUP_DAY_PRESETS.map((n) => (
        <button type="button" key={n} className={preset === n ? 'on' : ''} disabled={disabled} data-testid={`${testPrefix}-${n}`} onClick={() => onChange(n)}>{n} ימים</button>
      ))}
      <button type="button" className={preset === 'other' ? 'on' : ''} disabled={disabled} data-testid={`${testPrefix}-other`} onClick={() => onChange(preset === 'other' ? days : 6)}>אחר</button>
      {preset === 'other' ? (
        <input type="number" min={1} max={30} className="fi" data-testid={`${testPrefix}-other-input`} disabled={disabled} value={days} onChange={(e) => onChange(normalizeFollowupDays(e.target.value))} style={{ width: 64 }} />
      ) : null}
    </div>
  );
}
function RecurringDaysPicker({ days, onChange, disabled, testPrefix }: { days: number; onChange: (n: number) => void; disabled?: boolean; testPrefix: string }) {
  const preset = recurringDaysPreset(days);
  return (
    <div className="fu-days" data-testid={`${testPrefix}-picker`}>
      {RECURRING_DAY_PRESETS.map((n) => (
        <button type="button" key={n} className={preset === n ? 'on' : ''} disabled={disabled} data-testid={`${testPrefix}-${n}`} onClick={() => onChange(n)}>{n === 1 ? 'כל יום' : n === 2 ? 'כל יומיים' : 'כל 3 ימים'}</button>
      ))}
      <button type="button" className={preset === 'other' ? 'on' : ''} disabled={disabled} data-testid={`${testPrefix}-other`} onClick={() => onChange(preset === 'other' ? days : 8)}>אחר</button>
      {preset === 'other' ? (
        <input type="number" min={1} max={30} className="fi" data-testid={`${testPrefix}-other-input`} disabled={disabled} value={days} onChange={(e) => onChange(normalizeRecurringDays(e.target.value))} style={{ width: 64 }} />
      ) : null}
    </div>
  );
}
const DOC_CATS: Array<{ key: string; label: string }> = [
  { key: 'surveyor', label: 'דוח שמאי' },
  { key: 'license', label: 'רישיון רכב' },
  { key: 'photos', label: 'תמונות' },
  { key: 'third', label: 'מסמכי צד ג\'' },
  { key: 'insurance', label: 'מסמכי ביטוח' },
  { key: 'other', label: 'מסמכים נוספים' },
];

type ClaimFile = {
  id: string;
  doc_request_id: string | null;
  original_name: string;
  source: string;
  created_at: string;
  uploaded_by_name?: string;
  mime_type?: string;
  byte_size?: number;
  gmail_message_id?: string | null;
  doc_kind?: string;
  doc_meta?: Record<string, string> | null;
};

type DocRequest = { id: string; label: string; status: string; received_at?: string; doc_key?: string };

function typeMatchesRequest(t: ClaimDocType, r: DocRequest) {
  const key = String(r.doc_key || '');
  if (key && (key === t.key || (t.staffType && key === t.staffType))) return true;
  const names = [t.label, t.key, ...t.aliases];
  return names.includes(r.label);
}

function filesForDocType(t: ClaimDocType, files: ClaimFile[], requests: DocRequest[]) {
  const ids = new Set(requests.filter((r) => typeMatchesRequest(t, r)).map((r) => r.id));
  return files.filter((f) => {
    if (t.docKind && f.doc_kind === t.docKind) return true;
    if ((t.extraDocKinds || []).includes(String(f.doc_kind || ''))) return true;
    const st = fileMeta(f).staff_type;
    if (t.staffType && st === t.staffType) return true;
    if (st && st === t.key) return true;
    if (f.doc_request_id && ids.has(f.doc_request_id)) return true;
    return false;
  });
}

function docTypeStatus(t: ClaimDocType, files: ClaimFile[], requests: DocRequest[], hasLink: boolean) {
  const matched = filesForDocType(t, files, requests);
  const reqs = requests.filter((r) => typeMatchesRequest(t, r));
  const requested = reqs.some((r) => r.status === 'requested');
  const received = reqs.some((r) => r.status === 'received');
  const fromCustomer = matched.some((f) => f.source === 'customer');
  if (fromCustomer || received) return { key: 'received', label: 'התקבל' };
  if (matched.length) return { key: 'exists', label: 'קיים' };
  if (requested && hasLink) return { key: 'waiting', label: 'ממתין ללקוח' };
  if (requested) return { key: 'needed', label: 'נדרש מהלקוח' };
  return { key: 'missing', label: 'חסר' };
}

function extraDocRequests(requests: DocRequest[]) {
  return requests.filter((r) => !CLAIM_DOC_TYPES.some((t) => typeMatchesRequest(t, r)));
}

function catalogInRequests(requests: DocRequest[], t: ClaimDocType) {
  return requests.some((r) => typeMatchesRequest(t, r) && r.status === 'requested');
}

function classifyDoc(f: ClaimFile) {
  const n = `${f.original_name || ''}`.toLowerCase();
  const mime = `${f.mime_type || ''}`.toLowerCase();
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(n)) return 'photos';
  if (/שמאי|survey|apprais|שמאות/i.test(n)) return 'surveyor';
  if (/רישיון|license|rishayon/i.test(n)) return 'license';
  if (/צד.?ג|third/i.test(n)) return 'third';
  if (/ביטוח|policy|insurance|פוליסה/i.test(n)) return 'insurance';
  return 'other';
}

function isImageFile(f: ClaimFile) {
  const n = `${f.original_name || ''}`;
  const mime = `${f.mime_type || ''}`.toLowerCase();
  return mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|tiff?)$/i.test(n);
}

function fileMeta(f: ClaimFile): Record<string, string> {
  return f.doc_meta && typeof f.doc_meta === 'object' ? f.doc_meta : {};
}

function effectiveKind(f: ClaimFile) {
  if (f.doc_kind && f.doc_kind !== 'general') return f.doc_kind;
  return 'general';
}

const STAFF_DOC_TYPES: Array<{ key: string; label: string }> = (() => {
  const rows: Array<{ key: string; label: string }> = [{ key: '', label: 'לא סווג / מסמך כללי' }];
  const seen = new Set(['']);
  for (const t of CLAIM_DOC_TYPES) {
    if (!t.staffType || seen.has(t.staffType)) continue;
    seen.add(t.staffType);
    rows.push({ key: t.staffType, label: t.label });
  }
  for (const extra of [
    { key: 'accident_notice', label: 'טופס הודעה על תאונה' },
    { key: 'policy', label: 'פוליסה' },
    { key: 'police', label: 'אישור משטרה' },
    { key: 'other', label: 'מסמך אחר' },
  ]) {
    if (seen.has(extra.key)) continue;
    seen.add(extra.key);
    rows.push(extra);
  }
  return rows;
})();
const DOC_FILE_STATUSES: Array<{ key: string; label: string }> = [
  { key: '', label: '—' },
  { key: 'received', label: 'התקבל' },
  { key: 'missing', label: 'חסר' },
  { key: 'pending', label: 'ממתין' },
  { key: 'ok', label: 'תקין' },
  { key: 'sent', label: 'נשלח' },
  { key: 'needs_update', label: 'נדרש עדכון' },
];

function kindHe(k: string) {
  const map: Record<string, string> = {
    surveyor_report: 'דוח שמאי',
    surveyor_photo: 'תמונת שמאי',
    surveyor_attachment: 'קובץ דוח שמאי',
    garage_invoice: 'חשבונית מוסך',
  };
  return map[k] || '';
}

function fileLabel(f: ClaimFile) {
  const t = fileMeta(f).staff_title;
  return t || f.original_name;
}
function staffTypeLabel(key: string) {
  return STAFF_DOC_TYPES.find((x) => x.key === key)?.label || 'לא סווג / מסמך כללי';
}
const TRACK_STATUSES: Array<{ key: string; label: string }> = [
  { key: 'sent', label: 'נשלח' },
  { key: 'waiting_reply', label: 'ממתין לתשובה' },
  { key: 'reply_received', label: 'התקבלה תשובה' },
  { key: 'needs_action', label: 'דורש טיפול נוסף' },
  { key: 'done', label: 'הושלם' },
];
function trackLabel(k: string) {
  return TRACK_STATUSES.find((x) => x.key === k)?.label || k || '—';
}
function statusLabel(key: string) {
  return DOC_FILE_STATUSES.find((x) => x.key === key)?.label || '—';
}
function suggestedStaffType(f: ClaimFile) {
  if (f.doc_kind === 'surveyor_report' || f.doc_kind === 'surveyor_attachment') return 'surveyor_report';
  if (f.doc_kind === 'garage_invoice') return 'garage_invoice';
  if (f.doc_kind === 'surveyor_photo') return 'damage_photos';
  return '';
}

function DocStaffFields({ file, allFiles, onSave }: { file: ClaimFile; allFiles: ClaimFile[]; onSave: (patch: Record<string, string | boolean>) => void }) {
  const m = fileMeta(file);
  const sid = `dst_${file.id}`;
  return (
    <div data-testid={`doc-staff-${file.id}`} style={{ background: 'var(--bg2)', border: '1px dashed var(--br2)', borderRadius: 7, padding: 8, marginTop: 6 }}>
      <div className="fg"><label className="fl">שם לתצוגה</label><input className="fi" id={`${sid}_title`} defaultValue={m.staff_title || ''} placeholder={file.original_name} /></div>
      <div className="fg"><label className="fl">סוג</label>
        <select className="fse" id={`${sid}_type`} defaultValue={m.staff_type || ''}>
          {STAFF_DOC_TYPES.map((t) => <option key={t.key || 'none'} value={t.key}>{t.label}{!t.key && suggestedStaffType(file) ? ` · הצעה: ${staffTypeLabel(suggestedStaffType(file))}` : ''}</option>)}
        </select>
      </div>
      <div className="fg"><label className="fl">סטטוס מסמך</label>
        <select className="fse" id={`${sid}_st`} defaultValue={m.doc_status || ''}>
          {DOC_FILE_STATUSES.map((s) => <option key={s.key || 'none'} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <div className="fg"><label className="fl">קשור למסמך (ידני)</label>
        <select className="fse" id={`${sid}_rel`} defaultValue={m.related_file_id || ''}>
          <option value="">— ללא קישור —</option>
          {allFiles.filter((x) => x.id !== file.id).slice(0, 80).map((x) => (
            <option key={x.id} value={x.id}>{fileLabel(x)}</option>
          ))}
        </select>
      </div>
      <div className="fg"><label className="fl">הערה פנימית</label><textarea className="fta" id={`${sid}_note`} defaultValue={m.staff_note || ''} style={{ minHeight: 56 }} /></div>
      <label className="pick-row" style={{ margin: '6px 0' }}>
        <input type="checkbox" id={`${sid}_imp`} defaultChecked={m.important === 'true'} />
        <span>מסמך חשוב / מזוהה בתיק</span>
      </label>
      <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 6 }}>הערה פנימית לא נשלחת ללקוח או לחברת הביטוח. קישור לגרסה חתומה הוא ידני בלבד — אין ניחוש.</div>
      <button type="button" className="btn btn-p btn-sm" onClick={() => {
        const title = (document.getElementById(`${sid}_title`) as HTMLInputElement | null)?.value || '';
        const staff_type = (document.getElementById(`${sid}_type`) as HTMLSelectElement | null)?.value || '';
        const doc_status = (document.getElementById(`${sid}_st`) as HTMLSelectElement | null)?.value || '';
        const staff_note = (document.getElementById(`${sid}_note`) as HTMLTextAreaElement | null)?.value || '';
        const related_file_id = (document.getElementById(`${sid}_rel`) as HTMLSelectElement | null)?.value || '';
        const important = (document.getElementById(`${sid}_imp`) as HTMLInputElement | null)?.checked === true;
        onSave({ staff_title: title, staff_type, doc_status, staff_note, important, related_file_id });
      }}>שמור פרטי מסמך</button>
    </div>
  );
}

function StaffUploadZone({ testId, inputId, busy, compact, addLabel, onFiles }: {
  testId: string; inputId: string; busy: boolean; compact?: boolean; addLabel?: string; onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const label = addLabel || (compact ? '＋ צרף קובץ מהמכשיר' : '＋ הוסף מסמך');
  return (
    <div className="docs-up" data-testid={`${testId}-wrap`}>
      <button type="button" className="btn btn-p btn-sm" data-testid={compact ? 'mail-attach-device' : 'docs-add-btn'} disabled={busy} onClick={() => document.getElementById(inputId)?.click()}>{label}</button>
      <label
        className={`docs-drop ${over ? 'over' : ''} ${compact ? 'compact' : ''}`}
        data-testid={testId}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (busy) return;
          onFiles(Array.from(e.dataTransfer.files || []));
        }}
      >
        <input
          id={inputId}
          data-testid={`${testId}-input`}
          type="file"
          hidden
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.pdf,.jpg,.jpeg,.png,.webp,.heic"
          disabled={busy}
          onChange={(e) => {
            onFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
        {busy ? 'מעלה…' : 'גרור קבצים לכאן או לחץ להעלאה'}
      </label>
      <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
        {compact
          ? 'נשמר במסמכי התביעה כ«הועלה על ידינו». ביטול סימון לשליחה לא מוחק את הקובץ.'
          : 'PDF או תמונה. נשמר פרטית בתיק זה בלבד. מקור: הועלה על ידינו. לא דורס מסמך קיים.'}
      </div>
    </div>
  );
}

function surveyorBundle(files: ClaimFile[]) {
  const photos = files.filter((f) => f.doc_kind === 'surveyor_photo');
  const reports = files.filter((f) => f.doc_kind === 'surveyor_report');
  const taggedAtt = files.filter((f) => f.doc_kind === 'surveyor_attachment');
  const gmailIds = new Set([...photos, ...reports, ...taggedAtt].map((f) => f.gmail_message_id).filter(Boolean) as string[]);
  const related = files.filter((f) => (
    f.gmail_message_id
    && gmailIds.has(f.gmail_message_id)
    && f.doc_kind !== 'surveyor_photo'
    && f.doc_kind !== 'surveyor_report'
    && f.doc_kind !== 'surveyor_attachment'
    && !isImageFile(f)
  ));
  const byId = new Map<string, ClaimFile>();
  [...taggedAtt, ...related].forEach((f) => byId.set(f.id, f));
  return { reports, photos, attachments: [...byId.values()] };
}

function invoiceFiles(files: ClaimFile[]) {
  return files.filter((f) => f.doc_kind === 'garage_invoice');
}

function correspondenceThreads(imports: Array<Record<string, unknown>>) {
  const sorted = [...imports].sort((a, b) => {
    const ta = new Date(String(a.sent_at || '')).getTime() || 0;
    const tb = new Date(String(b.sent_at || '')).getTime() || 0;
    return ta - tb;
  });
  const groups: Array<{ thread: string; mails: typeof sorted }> = [];
  const idx = new Map<string, number>();
  for (const im of sorted) {
    const thread = String(im.gmail_thread_id || im.gmail_message_id || im.id);
    if (!idx.has(thread)) {
      idx.set(thread, groups.length);
      groups.push({ thread, mails: [] });
    }
    groups[idx.get(thread)!].mails.push(im);
  }
  return groups.sort((a, b) => {
    const last = (g: typeof a) => Math.max(0, ...g.mails.map((m) => new Date(String(m.sent_at || '')).getTime() || 0));
    return last(b) - last(a);
  });
}

const CARD_TAB_GROUPS: Array<{ key: string; label: string; tabs: Array<{ key: string; label: string }> }> = [
  { key: 'info', label: 'מידע', tabs: [{ key: 'claim', label: 'תביעה' }, { key: 'client', label: 'לקוח' }, { key: 'vehicle', label: 'רכב' }] },
  { key: 'docs', label: 'מסמכים', tabs: [{ key: 'docs', label: 'כל המסמכים' }, { key: 'surveyor', label: 'דוח שמאי' }, { key: 'invoice', label: 'חשבונית מוסך' }] },
  { key: 'mail', label: 'דואר ותקשורת', tabs: [{ key: 'gin', label: 'התכתבויות' }, { key: 'mailfu', label: 'מעקב מייל' }] },
  { key: 'work', label: 'טיפול ומעקב', tabs: [{ key: 'treat', label: 'טיפול' }, { key: 'tasks', label: 'משימות' }, { key: 'rems', label: 'תזכורות' }] },
  { key: 'hist', label: 'היסטוריה', tabs: [{ key: 'timeline', label: 'היסטוריה' }] },
];

function cardGroupOf(tab: string) {
  return CARD_TAB_GROUPS.find((g) => g.tabs.some((t) => t.key === tab)) || CARD_TAB_GROUPS[0];
}

function InCardPreview({ file, onClose }: { file: { url: string; name: string; mime: string } | null; onClose: () => void }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    wrapRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [file?.url]);
  if (!file) return null;
  const img = (file.mime || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name);
  return (
    <div ref={wrapRef} className="doc-preview-wrap" data-testid="doc-preview">
      <div className="doc-preview-bar">
        <b data-testid="doc-preview-name">{file.name}</b>
        <button className="btn btn-g btn-sm" onClick={() => window.open(file.url, '_blank')}>חלון נפרד</button>
        <button className="btn btn-g btn-sm" onClick={onClose}>סגור תצוגה</button>
      </div>
      {img
        ? <img className="doc-preview-img" src={file.url} alt={file.name} />
        : <iframe className="doc-preview-frame" title={file.name} src={file.url} />}
    </div>
  );
}

type ToastItem = { id: number; msg: string; type: string };

export function ClaimsScreen({ actor }: { actor: ClaimsActor }) {
  const apiRef = useRef<ClaimsApi>(createClaimsApi(actor));
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<'ok' | 'pend' | 'err'>('ok');
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [notifs, setNotifs] = useState<ClaimRecord[]>([]);
  const [view, setView] = useState('dashboard');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [stFil, setStFil] = useState('');
  const [insCoFil, setInsCoFil] = useState('');
  const [handlerFil, setHandlerFil] = useState('');
  const [curId, setCurId] = useState<string | null>(null);
  const [cardTab, setCardTab] = useState('comm');
  const [cardMore, setCardMore] = useState(false);
  const [sbOpen, setSbOpen] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [gHits, setGHits] = useState<ClaimRecord[]>([]);
  const [gOpen, setGOpen] = useState(false);
  const [vehHits, setVehHits] = useState<ClaimsVehicleHit[]>([]);
  const [vehId, setVehId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [comm, setComm] = useState<ClaimRecord[]>([]);
  const [hist, setHist] = useState<ClaimRecord[]>([]);
  const [tasks, setTasks] = useState<ClaimRecord[]>([]);
  const [allTasks, setAllTasks] = useState<ClaimRecord[]>([]);
  const [reportHtml, setReportHtml] = useState('');
  const [inactive, setInactive] = useState<{ days: number; rows: ClaimRecord[] } | null>(null);
  const [sumText, setSumText] = useState('');
  const [exportText, setExportText] = useState('');
  const [tpl, setTpl] = useState<Record<string, { name: string; subject?: string; body: string }>>({});
  const [curTpl, setCurTpl] = useState('');
  const [reminders, setReminders] = useState<ClaimRecord[]>([]);
  const [mailFollowups, setMailFollowups] = useState<MailFollowupRow[]>([]);
  const [dashFollowups, setDashFollowups] = useState<Array<{ id: string; claim_id: string; status: string; mail_to: string; mail_subject: string; next_run_at: string; recipient_kind: string }>>([]);
  const [pendingCustTaskId, setPendingCustTaskId] = useState<string | null>(null);
  const [suggestDraftBody, setSuggestDraftBody] = useState('');
  const [fuEditId, setFuEditId] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Array<{ id: string; full_name: string; company_name: string }>>([]);
  const [docs, setDocs] = useState<{ requests: DocRequest[]; files: ClaimFile[] }>({ requests: [], files: [] });
  const [hasUploadLink, setHasUploadLink] = useState(false);
  const [uploadLinkMeta, setUploadLinkMeta] = useState<{ id?: string; created_at?: string; expires_at?: string } | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askKeys, setAskKeys] = useState<string[]>([]);
  const [askBusy, setAskBusy] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{ connected?: boolean; email?: string | null; canConnect?: boolean }>({});
  const [gmailList, setGmailList] = useState<Array<Record<string, unknown>>>([]);
  const [gmailImports, setGmailImports] = useState<Array<Record<string, unknown>>>([]);
  const [mailListLoading, setMailListLoading] = useState(false);
  const [gmailBusy, setGmailBusy] = useState('');
  const [sentPreview, setSentPreview] = useState<null | {
    listed?: number;
    resultSizeEstimate?: number;
    truncated?: boolean;
    summary?: Record<string, number>;
    rows?: Array<Record<string, unknown>>;
    note?: string;
  }>(null);
  const [docEditId, setDocEditId] = useState<string | null>(null);
  const [docsUploading, setDocsUploading] = useState(false);
  const [gmailPending, setGmailPending] = useState<Array<Record<string, unknown>>>([]);
  const [gmailSends, setGmailSends] = useState<Array<Record<string, unknown>>>([]);
  const [pendingPick, setPendingPick] = useState<Record<string, string>>({});
  const inboxScanAt = useRef(0);
  const cardLoadGen = useRef(0);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkReconstructable, setLinkReconstructable] = useState(false);
  const [customDoc, setCustomDoc] = useState('');
  const [sendIds, setSendIds] = useState<string[]>([]);
  const [mailKind, setMailKind] = useState<'draft' | 'insurer' | 'legal'>('draft');
  const [mailPreviewOn, setMailPreviewOn] = useState(false);
  const [mailConfirmOn, setMailConfirmOn] = useState(false);
  const [mailAck, setMailAck] = useState(false);
  const [mailSending, setMailSending] = useState(false);
  const [mailTo, setMailTo] = useState('');
  const [mailCc, setMailCc] = useState('');
  const [mailSubj, setMailSubj] = useState('');
  const [mailBodyDraft, setMailBodyDraft] = useState('');
  const [toHint, setToHint] = useState('');
  const [mailThreadId, setMailThreadId] = useState('');
  const [suggestMissing, setSuggestMissing] = useState<string[]>([]);
  const [trackDue, setTrackDue] = useState('');
  const [followupWanted, setFollowupWanted] = useState(false);
  const [followupDays, setFollowupDays] = useState(3);
  const [scheduleWanted, setScheduleWanted] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [recurringWanted, setRecurringWanted] = useState(false);
  const [recurringDays, setRecurringDays] = useState(1);
  const [fuWaitDays, setFuWaitDays] = useState(3);
  const [fuRepeatDays, setFuRepeatDays] = useState(1);
  const [fuKind, setFuKind] = useState<'email_once' | 'email_repeat'>('email_once');
  const [fuFileIds, setFuFileIds] = useState<string[]>([]);
  const [fuEditPurpose, setFuEditPurpose] = useState('');
  const mailIdemp = useRef('');
  const [listMode, setListMode] = useState<'active' | 'archive'>('active');
  const [workFil, setWorkFil] = useState('');
  const [docsOrderFil, setDocsOrderFil] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkModal, setBulkModal] = useState<null | 'assign' | 'archive' | 'delete'>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [treatAction, setTreatAction] = useState('');
  const [treatSendOk, setTreatSendOk] = useState(false);
  const [treatBusy, setTreatBusy] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');
  const bumpMailDraft = () => {
    setMailPreviewOn(false);
    setMailConfirmOn(false);
    setMailAck(false);
    mailIdemp.current = `send-${curId || 'x'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };
  const [extSummary, setExtSummary] = useState('');
  const [pkgInfo, setPkgInfo] = useState<{ packageBytes: number; overLimit: boolean; suggestion: string; split?: Array<{ index: number; bytes: number; tooLargeSingle?: boolean; file_ids: string[]; names: string[] }> } | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<Record<string, string>>({});
  const [openGal, setOpenGal] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<{ id: string; url: string; name: string; mime: string } | null>(null);
  const [mineOnly, setMineOnly] = useState(actor.role !== 'super_admin');
  const [intakeDraft, setIntakeDraft] = useState<IntakeDraft>({ ...EMPTY_INTAKE });
  const [intakeLinkMsg, setIntakeLinkMsg] = useState('');
  const [dashTasks, setDashTasks] = useState<ClaimRecord[]>([]);
  const [dashRems, setDashRems] = useState<ClaimRecord[]>([]);
  const toastN = useRef(0);
  const isSuperAdmin = actor.role === 'super_admin';

  const toast = (msg: string, type = 'ok') => {
    const id = ++toastN.current;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  const loadAll = useCallback(async () => {
    setSync('pend');
    try {
      const [cr, nr, tr, rr, pr, fu] = await Promise.all([
        apiRef.current.getClaims(),
        apiRef.current.getNotifications(),
        apiRef.current.getTasks(null),
        apiRef.current.getReminders(null),
        apiRef.current.invokeGmail('list_pending'),
        apiRef.current.listScheduledMailFollowups(),
      ]);
      setClaims(cr.data || []);
      setNotifs(nr.data || []);
      setDashTasks(tr.data || []);
      setDashRems(rr.data || []);
      if (pr.success) setGmailPending((pr.data as Array<Record<string, unknown>>) || []);
      if (fu.success) setDashFollowups(fu.data || []);
      if (!cr.success && cr.error) toast(`טעינת תביעות נכשלה: ${cr.error}`, 'err');
      if (actor.role === 'super_admin') {
        const a = await apiRef.current.listAssignees();
        setAssignees(a.data || []);
      }
      setSync('ok');
    } catch {
      setSync('err');
    }
  }, []);

  const loadPending = async () => {
    const r = await apiRef.current.invokeGmail('list_pending');
    if (r.success) setGmailPending((r.data as Array<Record<string, unknown>>) || []);
  };

  const runInboxScan = async (silent = false) => {
    const now = Date.now();
    if (silent && inboxScanAt.current && now - inboxScanAt.current < 10 * 60 * 1000) return;
    if (!silent) setGmailBusy('סורק תיבת Gmail…');
    try {
      const r = await apiRef.current.invokeGmail('scan_inbox');
      if (!r.success) {
        if (!silent) toast(String(r.error || 'סריקה נכשלה'), 'err');
        return;
      }
      inboxScanAt.current = now;
      const auto = Array.isArray(r.auto) ? r.auto as Array<{ claim_id?: string; message_id?: string }> : [];
      let imported = 0;
      for (const item of auto) {
        if (!item.claim_id || !item.message_id) continue;
        const ir = await apiRef.current.importGmailMessage(item.claim_id, item.message_id);
        if (ir.success) {
          imported += 1;
          await apiRef.current.cancelScheduledMailFollowups(item.claim_id);
        }
      }
      await loadAll();
      await loadPending();
      const reviewN = Array.isArray(r.needs_review) ? (r.needs_review as unknown[]).length : 0;
      if (!silent) toast(`סריקה: ${imported} שויכו אוטומטית · ${reviewN} דורשים בדיקת שיוך`, reviewN && !imported ? 'inf' : 'ok');
    } finally {
      if (!silent) setGmailBusy('');
    }
  };

  const runSentPreview = async () => {
    setGmailBusy('סריקת מיילים יוצאים (תצוגה בלבד)…');
    try {
      const r = await apiRef.current.invokeGmail('preview_sent');
      if (!r.success) {
        toast(String(r.error || 'סריקה נכשלה'), 'err');
        return;
      }
      if (r.realEmailSend === true || r.import === true || r.mailboxMutated === true) {
        toast('סריקה נחסמה — אין Import ואין שליחה', 'err');
        return;
      }
      setSentPreview({
        listed: Number(r.listed || 0),
        resultSizeEstimate: Number(r.resultSizeEstimate || 0),
        truncated: r.truncated === true,
        summary: (r.summary && typeof r.summary === 'object') ? r.summary as Record<string, number> : {},
        rows: Array.isArray(r.rows) ? r.rows as Array<Record<string, unknown>> : [],
        note: String(r.note || 'SCAN/PREVIEW בלבד. אין Import.'),
      });
      setModal('moSentPreview');
      const s = (r.summary && typeof r.summary === 'object') ? r.summary as Record<string, number> : {};
      toast(`תצוגה: ${s.attachments || 0} קבצים · ${s.certain_new || 0} חדשים ודאיים · אין Import`, 'ok');
    } finally {
      setGmailBusy('');
    }
  };

  useEffect(() => {
    apiRef.current = createClaimsApi(actor);
    if (!document.getElementById('claims-heebo')) {
      const l = document.createElement('link');
      l.id = 'claims-heebo';
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap';
      document.head.appendChild(l);
    }
    (async () => {
      await loadAll();
      setReady(true);
    })();
  }, [actor.id, loadAll]);

  useEffect(() => {
    if (modal !== 'moTreat') return;
    const t = window.setTimeout(() => {
      const statusEl = document.getElementById('tr_status') as HTMLSelectElement | null;
      if (statusEl && !statusEl.value) setVal('tr_status', STATUS_UNCHANGED);
      if (!val(null, 'tr_next')) setVal('tr_next', cur?.nextDate || '');
    }, 50);
    return () => window.clearTimeout(t);
  }, [modal, treatAction, curId]);

  useEffect(() => {
    if (!ready) return;
    void runInboxScan(true);
  }, [ready]);

  const unread = notifs.filter((n) => n.read !== 'true').length;
  const cur = claims.find((c) => c.id === curId) || null;
  const tabGroup = cardGroupOf(cardTab);
  const snapNewMail = Boolean(cur && (
    notifs.some((n) => n.claimId === cur.id && n.read !== 'true' && (n.type === 'gmail_auto' || n.type === 'gmail_review'))
    || gmailPending.some((p) => String(p.assigned_claim_id || '') === cur.id && !p.imported_at)
  ));
  const snapMissingDoc = Boolean(cur && (
    docs.requests.some((d) => d.status === 'missing' || d.status === 'requested')
    || tasks.some((t) => t.docState === 'missing')
  ));
  const snapOpenTask = Boolean(cur && tasks.length > 0);
  const snapRem = Boolean(cur && reminders.length > 0);
  const snapFollow = Boolean(cur && mailFollowups.length > 0);
  const alertCtx = useMemo(() => ({
    tasks: dashTasks,
    notifs,
    gmailPending,
    scheduledFollowups: dashFollowups,
  }), [dashTasks, notifs, gmailPending, dashFollowups]);
  const activeClaims = useMemo(() => claims.filter((c) => c.archived !== 'true'), [claims]);
  const archiveClaims = useMemo(() => claims.filter((c) => c.archived === 'true'), [claims]);
  const workset = mineOnly ? activeClaims.filter((c) => c.assigned_to === actor.id) : activeClaims;
  const cnt = (f: (x: ClaimRecord) => boolean) => workset.filter(f).length;

  const showView = (name: string, f = '') => {
    setSbOpen(false);
    setView(name);
    setFilter(f);
    setWorkFil('');
    setSelectedIds([]);
    if (name === 'claims' && !f) { setStFil(''); setListMode('active'); }
    else if (f) setStFil(f);
    if (name === 'tasks') {
      apiRef.current.getTasks(null).then((r) => setAllTasks((r.data || []).filter((t) => t.done !== 'true')));
    }
    if (name === 'gmail') {
      apiRef.current.invokeGmail('status').then((r) => setGmailStatus({
        connected: r.connected === true,
        email: typeof r.email === 'string' ? r.email : null,
        canConnect: r.canConnect === true,
      }));
      apiRef.current.invokeGmail('list_pending').then((r) => {
        if (r.success) setGmailPending((r.data as Array<Record<string, unknown>>) || []);
      });
    }
    if (name === 'reports') {
      apiRef.current.getReportData().then((r) => {
        if (!r.success) return;
        const s = r.summary;
        const html = [
          `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:10px;margin-bottom:18px">`,
          [['b', 'תיקים פתוחים', s.open], ['p', 'בטיפול משפטי', s.legal],
            ['b', 'סכום תביעות', fmt(s.totalAmt)], ['y', 'סכום אושר', fmt(s.totalAppr)],
            ['g', 'שולם', fmt(s.totalPaid)], ['r', 'יתרה', fmt(s.balance)]]
            .map((x) => `<div style="background:var(--bg2);border:1px solid var(--br);border-radius:var(--r);padding:13px"><div style="font-size:10px;color:var(--t3);font-weight:700;margin-bottom:4px">${x[1]}</div><div style="font-size:20px;font-weight:800">${x[2]}</div></div>`).join(''),
          `</div>`,
          `<div class="sdiv"><div class="sdiv-t">לפי חברת ביטוח</div><div class="sdiv-l"></div></div>`,
          `<div class="tw"><table><thead><tr><th>חברת ביטוח</th><th>תיקים</th><th>סכום</th><th>שולם</th><th>משפטי</th></tr></thead><tbody>`,
          Object.entries(r.byCompany || {}).sort((a, b) => b[1].count - a[1].count)
            .map((e) => `<tr><td>${e[0]}</td><td>${e[1].count}</td><td>${fmt(e[1].amt)}</td><td>${fmt(e[1].paid)}</td><td>${e[1].legal || 0}</td></tr>`).join(''),
          `</tbody></table></div>`,
        ].join('');
        setReportHtml(html);
      });
    }
  };

  const asMailRows = (v: unknown): Array<Record<string, unknown>> => (
    Array.isArray(v) ? v as Array<Record<string, unknown>> : []
  );

  const refreshMailLists = async (id: string, gen?: number) => {
    const live = () => gen === undefined || gen === cardLoadGen.current;
    if (live()) setMailListLoading(true);
    try {
      const gi = await apiRef.current.invokeGmail('list_imports', { claim_id: id });
      if (live()) setGmailImports(asMailRows(gi.data));
    } catch {
      if (live()) setGmailImports([]);
    }
    try {
      const gs = await apiRef.current.invokeGmail('list_sends', { claim_id: id });
      if (live()) setGmailSends(asMailRows(gs.data));
    } catch {
      if (live()) setGmailSends([]);
    }
    if (live()) setMailListLoading(false);
  };

  const loadCardData = async (id: string) => {
    const gen = ++cardLoadGen.current;
    const live = () => gen === cardLoadGen.current;
    const mailP = refreshMailLists(id, gen);
    const restP = Promise.all([
      apiRef.current.getCommLog(id).then((c) => { if (live()) setComm(c.data || []); }).catch(() => { if (live()) setComm([]); }),
      apiRef.current.getHistory(id).then((h) => { if (live()) setHist(h.data || []); }).catch(() => { if (live()) setHist([]); }),
      apiRef.current.getTasks(id).then((t) => { if (live()) setTasks((t.data || []).filter((x) => x.done !== 'true' || x.audience === 'customer')); }).catch(() => { if (live()) setTasks([]); }),
      apiRef.current.getReminders(id).then((rem) => { if (live()) setReminders(rem.data || []); }).catch(() => { if (live()) setReminders([]); }),
      apiRef.current.listMailFollowups(id).then(async (fu) => {
        const stop = await apiRef.current.stopRecurringIfReplied(id).catch(() => ({ stopped: [] as string[] }));
        if (stop.stopped?.length) {
          const again = await apiRef.current.listMailFollowups(id);
          if (live()) setMailFollowups(again.data || []);
          const h = await apiRef.current.getHistory(id).catch(() => ({ data: [] as ClaimRecord[] }));
          if (live() && h.data) setHist(h.data);
        } else if (live()) setMailFollowups(fu.data || []);
      }).catch(() => { if (live()) setMailFollowups([]); }),
      apiRef.current.invokeDocs('list_docs', { claim_id: id }).then((d) => {
        if (!live()) return;
        setDocs({
          requests: (d.requests as DocRequest[]) || [],
          files: (d.files as ClaimFile[]) || [],
        });
      }).catch(() => { if (live()) setDocs({ requests: [], files: [] }); }),
    ]);
    const lk = await apiRef.current.invokeDocs('get_link', { claim_id: id }).catch(() => ({} as Record<string, unknown>));
    if (!live()) return;
    const link = lk?.link as { id?: string; expires_at?: string; revoked_at?: string | null; created_at?: string; reconstructable?: boolean } | undefined;
    const active = Boolean(link && !link.revoked_at && link.expires_at && new Date(link.expires_at).getTime() > Date.now());
    const reconstructable = Boolean(active && link?.reconstructable);
    setHasUploadLink(active);
    setLinkReconstructable(reconstructable);
    setUploadLinkMeta(active ? { id: link?.id, created_at: link?.created_at, expires_at: link?.expires_at } : null);
    const cached = readCustLinkCache(id);
    if (!active) {
      setLinkUrl('');
    } else if (cached && cached.id && link?.id && cached.id === link.id) {
      setLinkUrl(cached.url);
    } else if (reconstructable) {
      const rv = await apiRef.current.invokeDocs('reveal_link', { claim_id: id });
      if (!live()) return;
      if (rv.success !== false && rv.token) {
        const url = customerUploadUrl(String(rv.token));
        writeCustLinkCache(id, { id: String(link?.id || rv.id || ''), url, expiresAt: String(link?.expires_at || rv.expiresAt || '') });
        setLinkUrl(url);
      } else {
        setLinkUrl('');
      }
    } else {
      setLinkUrl('');
    }
    await Promise.all([mailP, restP]);
  };

  const saveAskSelection = async (claimId: string, keys: string[]) => {
    const extras = extraDocRequests(docs.requests).map((r) => ({ label: r.label, doc_key: r.doc_key || 'custom' }));
    const r = await apiRef.current.invokeDocs('save_doc_requests', {
      claim_id: claimId,
      items: [
        ...CLAIM_DOC_TYPES.filter((x) => keys.includes(x.key)).map((x) => ({ label: x.label, doc_key: x.key })),
        ...extras,
      ],
    });
    if (r.success === false) return { success: false as const, error: String(r.error || 'שמירת הבקשה נכשלה') };
    await loadCardData(claimId);
    return { success: true as const };
  };

  const copyCustomerLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast('הקישור הועתק');
      return true;
    } catch {
      toast('לא ניתן להעתיק — העתיקו ידנית', 'err');
      return false;
    }
  };

  const ensureCustomerLinkUrl = async (claimId: string) => {
    if (linkUrl) return linkUrl;
    const r = await apiRef.current.invokeDocs('reveal_link', { claim_id: claimId });
    if (r.success !== false && r.token) {
      const url = customerUploadUrl(String(r.token));
      writeCustLinkCache(claimId, {
        id: String(r.id || uploadLinkMeta?.id || ''),
        url,
        expiresAt: String(r.expiresAt || uploadLinkMeta?.expires_at || ''),
      });
      setLinkUrl(url);
      setLinkReconstructable(true);
      return url;
    }
    return '';
  };

  const shareCustomerLink = async (claimId: string, clientName: string, claimLabel: string) => {
    const url = await ensureCustomerLinkUrl(claimId);
    if (!url) {
      toast('אין קישור להעתקה במכשיר זה — הנפיקו קישור חדש', 'err');
      return;
    }
    const text = `שלום${clientName ? ` ${clientName}` : ''}, לצורך תביעה ${claimLabel} נבקש להעלות מסמכים בקישור:\n${url}`;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function') {
      try {
        const payload: ShareData = { title: `מסמכים לתביעה ${claimLabel}`, text, url };
        if (!nav.canShare || nav.canShare(payload)) {
          await nav.share(payload);
          return;
        }
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }
    await copyCustomerLink(url);
    toast('שיתוף מערכת לא זמין — הקישור הועתק');
  };

  const mintCustomerLink = async (claimId: string, rotate = false) => {
    if (hasUploadLink && (linkUrl || linkReconstructable) && !rotate) {
      const url = await ensureCustomerLinkUrl(claimId);
      if (url) {
        toast('יש קישור פעיל — לא נוצר קישור חדש');
        return url;
      }
    }
    if (hasUploadLink && !linkUrl && !linkReconstructable && !rotate) {
      const ok = window.confirm('יש קישור פעיל ישן שאי אפשר לשחזר ממכשיר זה. יצירת קישור חדש תבטל את הישן. להמשיך?');
      if (!ok) return '';
    }
    if (hasUploadLink && (linkUrl || linkReconstructable) && rotate) {
      const ok = window.confirm('יצירת קישור חדש תבטל את הקישור הפעיל. הלקוח יצטרך את הכתובת החדשה. להמשיך?');
      if (!ok) return '';
    }
    const r = await apiRef.current.invokeDocs('create_link', { claim_id: claimId });
    if (!r.success || !r.token) {
      toast(String(r.error || 'יצירת קישור נכשלה'), 'err');
      return '';
    }
    const url = customerUploadUrl(String(r.token));
    const expiresAt = String(r.expiresAt || '');
    const id = String(r.id || '');
    writeCustLinkCache(claimId, { id, url, expiresAt });
    setLinkUrl(url);
    setLinkReconstructable(true);
    await copyCustomerLink(url);
    await loadCardData(claimId);
    return url;
  };

  const revokeCustomerLink = async (claimId: string) => {
    await apiRef.current.invokeDocs('revoke_link', { claim_id: claimId });
    clearCustLinkCache(claimId);
    setLinkUrl('');
    setLinkReconstructable(false);
    await loadCardData(claimId);
    toast('הקישור בוטל');
  };

  const refreshPackage = async (claimId: string, ids: string[]) => {
    const r = await apiRef.current.invokeGmail('package_preview', { claim_id: claimId, file_ids: ids });
    setPkgInfo({
      packageBytes: Number(r.packageBytes || 0),
      overLimit: r.overLimit === true,
      suggestion: String(r.suggestion || ''),
      split: Array.isArray(r.split) ? r.split as Array<{ index: number; bytes: number; tooLargeSingle?: boolean; file_ids: string[]; names: string[] }> : [],
    });
    return r;
  };

  const toggleSendId = (id: string) => {
    bumpMailDraft();
    setSendIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (curId) void refreshPackage(curId, next);
      return next;
    });
  };

  const setSendGroup = (ids: string[], on: boolean) => {
    bumpMailDraft();
    setSendIds((prev) => {
      const set = new Set(prev);
      ids.forEach((id) => { if (on) set.add(id); else set.delete(id); });
      const next = [...set];
      if (curId) void refreshPackage(curId, next);
      return next;
    });
  };

  const openSendModal = async (kind: 'draft' | 'insurer' | 'legal', seed?: {
    to?: string; cc?: string; subject?: string; body?: string; file_ids?: string[]; thread_id?: string; missing?: string[];
  }) => {
    if (!cur) return;
    setMailKind(kind);
    setSendIds(seed?.file_ids || []);
    setPkgInfo({ packageBytes: 0, overLimit: false, suggestion: '', split: [] });
    setMailPreviewOn(false);
    setMailConfirmOn(false);
    setMailAck(false);
    setMailSending(false);
    setMailThreadId(seed?.thread_id || '');
    setSuggestMissing(seed?.missing || []);
    setTrackDue('');
    setFollowupWanted(false);
    setFollowupDays(3);
    setScheduleWanted(false);
    setScheduleDate('');
    setScheduleTime('');
    setRecurringWanted(false);
    setRecurringDays(1);
    mailIdemp.current = `send-${cur.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const ext = await apiRef.current.exportExternalSummary(cur.id);
    setExtSummary(ext.text || '');
    setVal('mail_cc', '');
    setVal('mail_to', '');
    setMailTo('');
    setMailCc('');
    setToHint(kind === 'legal' ? (cur.legalEmail || '') : (kind === 'insurer' ? (cur.insEmail || '') : (cur.insEmail || cur.clientEmail || '')));
    if (kind === 'insurer') {
      setMailSubj(mailClaimLabel(cur));
      setMailBodyDraft(ext.text || '');
      setVal('mail_subj', mailClaimLabel(cur));
      setVal('mail_body', ext.text || '');
    } else if (kind === 'legal') {
      setMailSubj(`העברה לטיפול משפטי – ${displayClaimNum(cur)} – ${cur.clientName}`);
      setMailBodyDraft(ext.text || '');
      setVal('mail_subj', `העברה לטיפול משפטי – ${displayClaimNum(cur)} – ${cur.clientName}`);
      setVal('mail_body', ext.text || '');
    } else {
      const num = displayClaimNum(cur);
      const subj = mailClaimLabel(cur);
      const body = `שלום,\n\nבהמשך לתביעה ${num === 'טרם התקבל' ? '' : `מספר ${num}`}\nלקוח: ${cur.clientName}\nרכב: ${cur.plate || '—'}\n\nבברכה,\nדליה ניהול תביעות`;
      setMailSubj(subj);
      setMailBodyDraft(body);
      setVal('mail_subj', subj);
      setVal('mail_body', body);
    }
    if (seed?.to) { setMailTo(seed.to); setVal('mail_to', seed.to); }
    if (seed?.cc !== undefined) { setMailCc(seed.cc); setVal('mail_cc', seed.cc); }
    if (seed?.subject) { setMailSubj(seed.subject); setVal('mail_subj', seed.subject); }
    if (seed?.body) { setMailBodyDraft(seed.body); setVal('mail_body', seed.body); }
    if (seed?.file_ids?.length && cur.id) void refreshPackage(cur.id, seed.file_ids);
    setModal('moMail');
  };

  const openMailCompose = (im: Record<string, unknown>, mode: 'reply' | 'replyAll' | 'forward') => {
    const from = emailsFromHeader(String(im.from_addr || ''))[0] || '';
    const toAddrs = emailsFromHeader(String(im.to_addr || ''));
    const ccAddrs = emailsFromHeader(String(im.cc_addr || ''));
    const quoted = quotedOriginal(im);
    if (mode === 'forward') {
      void openSendModal('draft', {
        to: '',
        cc: '',
        subject: withMailPrefix(String(im.subject || ''), 'Fwd: '),
        body: `שלום,\n\n${quoted}`,
        file_ids: [],
        thread_id: '',
      });
      return;
    }
    const others = [...toAddrs, ...ccAddrs].filter((e) => e !== OWN_MAILBOX && e !== from);
    void openSendModal('draft', {
      to: from,
      cc: mode === 'replyAll' ? [...new Set(others)].join(', ') : '',
      subject: withMailPrefix(String(im.subject || ''), 'Re: '),
      body: `שלום,\n\n${quoted}`,
      file_ids: [],
      thread_id: String(im.gmail_thread_id || ''),
    });
  };

  useEffect(() => {
    if (modal !== 'moMail' || !curId) return;
    const images = docs.files.filter((f) => isImageFile(f));
    if (images.length) void loadGalleryThumbs(curId, images);
  }, [modal, curId, docs.files]);

  const loadGalleryThumbs = async (claimId: string, files: ClaimFile[]) => {
    const images = files.filter((f) => isImageFile(f));
    const ids = images.map((f) => f.id);
    if (!ids.length) return;
    for (let i = 0; i < ids.length; i += 80) {
      const slice = ids.slice(i, i + 80);
      const r = await apiRef.current.invokeDocs('signed_urls', { claim_id: claimId, file_ids: slice });
      const urls = (r.urls && typeof r.urls === 'object') ? r.urls as Record<string, string> : {};
      setGalleryUrls((prev) => {
        const next = { ...prev };
        Object.entries(urls).forEach(([id, url]) => { if (url) next[id] = url; });
        return next;
      });
    }
  };

  const openInCard = async (claimId: string, f: ClaimFile) => {
    const r = await apiRef.current.invokeDocs('signed_url', { claim_id: claimId, file_id: f.id });
    if (!r.url) { toast('לא ניתן לפתוח את הקובץ', 'err'); return; }
    setPreviewFile({ id: f.id, url: String(r.url), name: f.original_name, mime: f.mime_type || '' });
  };

  const markDocKind = async (claimId: string, fileId: string, kind: string, meta?: Record<string, string>) => {
    const r = await apiRef.current.invokeDocs('set_doc_kind', { claim_id: claimId, file_id: fileId, doc_kind: kind, doc_meta: meta || {} });
    if (!r.success) { toast(String(r.error || 'סיווג נכשל'), 'err'); return; }
    await loadCardData(claimId);
    toast(kind === 'general' ? 'הוסר הסימון' : `סומן כ${kindHe(kind) || kind}`);
  };

  const saveDocStaff = async (file: ClaimFile, patch: Record<string, string | boolean>) => {
    if (!curId) return;
    const r = await apiRef.current.invokeDocs('update_doc_meta', { claim_id: curId, file_id: file.id, ...patch });
    if (!r.success) { toast(String(r.error || 'שמירה נכשלה'), 'err'); return; }
    await loadCardData(curId);
  };

  const uploadStaffFiles = async (claimId: string, files: File[], selectForSend = false, extra?: { doc_kind?: string; staff_type?: string }) => {
    if (!files.length) return [];
    setDocsUploading(true);
    const ids: string[] = [];
    const fails: string[] = [];
    let reused = 0;
    try {
      for (const file of files) {
        const up = await apiRef.current.staffUpload(claimId, '', file, extra);
        if (!up.success) { fails.push(`${file.name}: ${up.error || 'שגיאה'}`); continue; }
        if (up.reused) reused += 1;
        if (up.file_id) ids.push(up.file_id);
      }
      await loadCardData(claimId);
      if (selectForSend && ids.length) {
        setSendIds((prev) => {
          const next = [...new Set([...prev, ...ids])];
          void refreshPackage(claimId, next);
          return next;
        });
      }
      if (ids.length) setDocEditId(ids[ids.length - 1]);
      if (fails.length) toast(`הועלו ${ids.length} · נכשלו ${fails.length} · ${fails[0]}`, 'err');
      else if (reused && reused === ids.length) toast('הקובץ כבר קיים בתיק — לא נוצר עותק');
      else toast(`הועלו ${ids.length} מסמכים · הועלה על ידינו`);
    } finally {
      setDocsUploading(false);
    }
    return ids;
  };

  useEffect(() => {
    if (!curId) return;
    if (cardTab === 'surveyor' || cardTab === 'invoice') {
      const tagged = cardTab === 'surveyor' ? surveyorBundle(docs.files).photos : invoiceFiles(docs.files).filter(isImageFile);
      const show = tagged.length ? tagged : (cardTab === 'surveyor' ? docs.files.filter(isImageFile) : tagged);
      if (show.length) void loadGalleryThumbs(curId, show);
      return;
    }
    if (cardTab === 'docs') {
      const preview = docs.files.filter((f) => isImageFile(f)).slice(0, 80);
      if (preview.length) void loadGalleryThumbs(curId, preview);
    }
    if (cardTab === 'tasks') {
      const ready = docs.files.filter((f) => isImageFile(f) && tasks.some((t) => t.readyFileId === f.id));
      if (ready.length) void loadGalleryThumbs(curId, ready);
    }
  }, [cardTab, curId, docs.files, tasks]);

  const openMailFollowupModal = async (edit?: MailFollowupRow | null, mode?: 'followup' | 'recurring') => {
    setFuEditId(edit?.id || null);
    setFuEditPurpose(edit?.purpose || '');
    setFuFileIds(edit?.file_ids || []);
    const editRepeat = edit?.mail_kind === 'email_repeat';
    setFuKind(editRepeat || mode === 'recurring' ? 'email_repeat' : 'email_once');
    setFuRepeatDays(normalizeRecurringDays(edit?.repeat_every_days || (mode === 'recurring' ? 1 : 1)));
    if (edit && isScheduledOnce(edit) && edit.next_run_at) {
      const d = new Date(edit.next_run_at);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        setScheduleDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        setScheduleTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
    }
    setModal('moMailFu');
    const c = cur;
    const who = edit
      ? inferRecipientKind(edit.mail_to, c, edit.recipient_kind)
      : 'insurer';
    const tplKey = who === 'client' ? 'client_reminder' : 'status_request';
    const filled = c ? await apiRef.current.fillTemplate(tplKey, {
      ...c,
      claimNum: workClaimNum(c),
      clientName: c.clientName || '',
      plate: c.plate || '',
      eventDate: c.eventDate || '',
      status: c.status || '',
    }) : { subject: '', body: '' };
    setTimeout(() => {
      const toOf = (w: string) => {
        if (w === 'client') return c?.clientEmail || '';
        if (w === 'insurer') return c?.insEmail || c?.insRepEmail || '';
        return '';
      };
      if (edit) {
        const days = followupWaitDaysFromRow(edit);
        const repeat = normalizeRecurringDays(edit.repeat_every_days || days);
        setFuWaitDays(days);
        setFuRepeatDays(repeat);
        setVal('fu_who', who);
        setVal('fu_to', edit.mail_to);
        setVal('fu_subj', edit.mail_subject);
        setVal('fu_body', edit.mail_body);
        setVal('fu_kind', edit.mail_kind === 'email_repeat' ? 'email_repeat' : 'email_once');
        setVal('fu_repeat', String(repeat));
        setVal('fu_when', toLocalInput(edit.next_run_at) || toLocalInput(new Date(Date.now() + days * 86400000).toISOString()));
        setVal('fu_stop', toLocalInput(edit.stop_at));
        setVal('fu_attach', edit.attach_mode || 'none');
      } else {
        const recurring = mode === 'recurring';
        setFuWaitDays(3);
        setFuRepeatDays(1);
        setVal('fu_who', 'insurer');
        setVal('fu_to', toOf('insurer'));
        setVal('fu_subj', filled.subject || '');
        setVal('fu_body', filled.body || '');
        setVal('fu_kind', recurring ? 'email_repeat' : 'email_once');
        setVal('fu_repeat', recurring ? '1' : '3');
        setVal('fu_when', toLocalInput(new Date(Date.now() + (recurring ? 2 * 60_000 : 3 * 86400000)).toISOString()));
        setVal('fu_stop', '');
        setVal('fu_attach', 'none');
      }
    }, 0);
  };

  const openCustomerRequest = () => {
    setModal('moCustReq');
    setTimeout(() => {
      setVal('cr_kind', 'send_doc');
      setVal('cr_text', '');
      setVal('cr_due', '');
      setVal('cr_channel', 'email');
      setVal('cr_when', '');
    }, 0);
  };

  const markPendingCustomerSent = async () => {
    if (!pendingCustTaskId || !curId) return;
    const t = [...tasks, ...dashTasks].find((x) => x.id === pendingCustTaskId);
    if (!t) { setPendingCustTaskId(null); return; }
    await apiRef.current.saveTask({
      ...t,
      customerStatus: 'sent',
      sentAt: new Date().toISOString(),
      done: 'false',
    });
    setPendingCustTaskId(null);
    await loadCardData(curId);
    await loadAll();
  };

  const openCard = async (id: string, tab = 'claim') => {
    setCurId(id);
    setCardTab(tab);
    setCardMore(false);
    setModal('moCard');
    setLinkUrl('');
    setPreviewFile(null);
    await loadCardData(id);
  };

  const startGmailImport = async () => {
    if (!cur) return;
    setCardTab('gin');
    setCardMore(false);
    setGmailBusy('טוען מיילים…');
    const r = await apiRef.current.invokeGmail('list_messages', { claim_id: cur.id });
    setGmailBusy('');
    if (!r.success) { toast(String(r.error || 'Gmail לא מחובר'), 'err'); return; }
    setGmailList((r.messages as Array<Record<string, unknown>>) || []);
  };

  const collectClaimForm = (): Record<string, string> => {
    const data: Record<string, string> = {
      id: (document.getElementById('fc_id') as HTMLInputElement)?.value || '',
      status: val(null, 'fc_status'),
      vehicle_id: vehId,
      company_name: companyName,
    };
    Object.entries(FC_MAP).forEach(([fid, key]) => {
      data[key] = val(null, fid);
    });
    return data;
  };

  const openNew = () => {
    Object.keys(FC_MAP).forEach((fid) => setVal(fid, ''));
    setVal('fc_id', '');
    setVal('fc_status', 'חדש');
    setVal('fc_kind', CLAIM_KINDS[0]);
    setIntakeDraft({ ...EMPTY_INTAKE });
    setVehId('');
    setCompanyName('');
    setVehHits([]);
    setModal('moClaim');
  };

  const startEdit = (id: string) => {
    const c = claims.find((x) => x.id === id);
    if (!c) return;
    Object.entries(FC_MAP).forEach(([fid, key]) => setVal(fid, c[key] || ''));
    setVal('fc_id', c.id);
    setVal('fc_status', c.status || 'חדש');
    setIntakeDraft(intakeFromClaim(c));
    setVehId(c.vehicle_id || '');
    setCompanyName(c.company_name || '');
    setModal('moClaim');
  };

  const doSaveClaim = async () => {
    const data = mergeIntakeToClaim(collectClaimForm(), intakeDraft);
    if (!data.clientName) { toast('נא להזין שם לקוח', 'err'); return; }
    setSync('pend');
    const r = await apiRef.current.saveClaim(data);
    if (r.success) {
      setModal(null);
      await loadAll();
      toast('תיק נשמר ✅');
    } else {
      setSync('err');
      toast(`שגיאה: ${r.error || ''}`, 'err');
    }
  };

  const searchVehicles = async (q: string) => {
    const r = await apiRef.current.searchVehicles(q);
    setVehHits(r.data || []);
  };

  const pickVehicle = (v: ClaimsVehicleHit) => {
    setVehId(v.id);
    setCompanyName(v.company_name || '');
    setIntakeDraft((d) => ({ ...d, plate: v.license_plate || d.plate, carMake: v.manufacturer || d.carMake, carModel: v.model || d.carModel }));
    setVehHits([]);
  };

  const saveStatus = async (newSt: string, note: string) => {
    if (!cur) return;
    if (MANDATORY_STATUSES.includes(newSt) && !note) {
      setModal('moMandNote');
      setVal('mandNote', '');
      (document.getElementById('mandNoteTitle') as HTMLElement | null);
      return;
    }
    setSync('pend');
    const r = await apiRef.current.saveClaim({ ...cur, status: newSt });
    if (r.success) {
      if (note) {
        await apiRef.current.saveCommEntry({ claimId: cur.id, type: 'note', body: note, note: `סטטוס: ${newSt}` });
      }
      setModal('moCard');
      await loadAll();
      await openCard(cur.id);
      toast(`סטטוס עודכן: ${newSt}`);
    }
  };

  const pendingStatus = useRef('');

  const openTreat = (action: string, opts?: { sendOk?: boolean }) => {
    setTreatAction(action);
    setTreatSendOk(!!opts?.sendOk);
    setVal('tr_status', STATUS_UNCHANGED);
    setVal('tr_manual', '');
    setVal('tr_note', '');
    setVal('tr_next', cur?.nextDate || '');
    setModal('moTreat');
  };

  const afterSignificant = async (claimId: string, action: string, opts?: { sendOk?: boolean }) => {
    openTreat(action, opts);
    void apiRef.current.markTreatmentPending(claimId, action)
      .then(() => loadAll())
      .catch(() => undefined);
  };

  const submitTreat = async () => {
    if (!curId) return;
    const statusChoice = val(null, 'tr_status') || STATUS_UNCHANGED;
    const nextDate = val(null, 'tr_next');
    const manualNote = val(null, 'tr_manual');
    const note = val(null, 'tr_note');
    const chosenStatus = statusChoice === STATUS_UNCHANGED ? (cur?.status || '') : statusChoice === STATUS_MANUAL ? (cur?.status || '') : statusChoice;
    const closed = isClosedStatus(chosenStatus, cur?.archived);
    if (statusChoice === STATUS_MANUAL && !manualNote) { toast('נא לכתוב עדכון ידני', 'err'); return; }
    if (!closed && !nextDate) { toast('חובה להגדיר תאריך טיפול הבא', 'err'); return; }
    setTreatBusy(true);
    try {
      const r = await apiRef.current.saveTreatmentUpdate({
        claimId: curId,
        action: treatAction || cur?.treatmentPendingAction || 'עדכון טיפול',
        statusChoice,
        manualNote,
        nextDate,
        note,
      });
      if (!r.success) { toast(String(r.error || 'שמירת עדכון טיפול נכשלה'), 'err'); return; }
      toast('עדכון טיפול נשמר');
      setModal('moCard');
      setTreatBusy(false);
      void loadAll().then(() => { if (curId) return loadCardData(curId); });
    } catch (e) {
      toast(`שמירת עדכון טיפול נכשלה: ${String((e as Error).message || e)}`, 'err');
    } finally {
      setTreatBusy(false);
    }
  };

  const insCompanies = useMemo(() => {
    const set = new Set<string>();
    for (const c of claims) {
      const co = claimInsCompany(c);
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [claims]);

  const handlerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of claims) {
      if (c.assigned_to) map.set(c.assigned_to, c.assigned_to_name || c.assigned_to);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'he'));
  }, [claims]);

  const matchesRowFilters = (c: ClaimRecord) => {
    if (mineOnly && c.assigned_to !== actor.id) return false;
    if (search && JSON.stringify(c).toLowerCase().indexOf(search.toLowerCase()) === -1) return false;
    if (stFil && c.status !== stFil) return false;
    if (filter && c.status !== filter) return false;
    if (insCoFil && claimInsCompany(c) !== insCoFil) return false;
    if (handlerFil && c.assigned_to !== handlerFil) return false;
    if (docsOrderFil && docsOrderOf(c) !== docsOrderFil) return false;
    const delta = daysFromToday(c.nextDate || '');
    if (workFil === 'today') return delta === 0;
    if (workFil === 'overdue') return isClosedStatus(c.status, c.archived) ? false : (delta !== null && delta < 0);
    if (workFil === 'later') return delta !== null && delta > 0;
    if (workFil === 'waiting_reply') return c.status === 'ממתין לחברת ביטוח';
    if (workFil === 'waiting_docs') return c.status === 'ממתין למסמכים';
    if (workFil === 'unassigned') return !c.assigned_to;
    if (workFil === 'no_next') return !claimHasNextAction(c);
    if (workFil === 'docs_needs_sort') return docsOrderOf(c) === 'needs_sort';
    if (workFil === 'open_tasks') return dashTasks.some((t) => t.claimId === c.id && t.done !== 'true');
    if (workFil === 'reminders') return dashRems.some((r) => r.claimId === c.id);
    return true;
  };

  const list = useMemo(() => {
    const pool = listMode === 'archive' ? archiveClaims : activeClaims;
    return pool.filter(matchesRowFilters);
  }, [activeClaims, archiveClaims, listMode, search, stFil, filter, insCoFil, handlerFil, docsOrderFil, workFil, mineOnly, actor.id, dashTasks, dashRems]);

  const dashRows = useMemo(
    () => activeClaims.filter(matchesRowFilters),
    [activeClaims, search, stFil, filter, insCoFil, handlerFil, docsOrderFil, workFil, mineOnly, actor.id, dashTasks, dashRems],
  );

  const visibleRows = view === 'dashboard' ? dashRows : list;
  const visibleIds = visibleRows.map((c) => c.id);
  const selectedVisible = selectedIds.filter((id) => visibleIds.includes(id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const toggleSelect = (id: string, on?: boolean) => {
    setSelectedIds((prev) => {
      const has = prev.includes(id);
      const nextOn = on === undefined ? !has : on;
      if (nextOn) return has ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };
  const toggleSelectAllVisible = (on: boolean) => {
    setSelectedIds((prev) => {
      if (on) return [...new Set([...prev, ...visibleIds])];
      return prev.filter((id) => !visibleIds.includes(id));
    });
  };

  const applyDashFilter = (key: string, ins?: string) => {
    setSbOpen(false);
    setView('dashboard');
    setListMode('active');
    setFilter('');
    setStFil('');
    setWorkFil(key);
    setSelectedIds([]);
    if (ins !== undefined) setInsCoFil(ins);
    else if (key === '') setInsCoFil('');
    if (key !== 'docs_needs_sort') setDocsOrderFil('');
  };

  const insCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of workset) {
      const co = claimInsCompany(c);
      if (co) m.set(co, (m.get(co) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'he'));
  }, [workset]);

  const dashCounts = useMemo(() => {
    return {
      all: workset.length,
      today: workset.filter((c) => daysFromToday(c.nextDate || '') === 0).length,
      overdue: workset.filter((c) => { const d = daysFromToday(c.nextDate || ''); return !isClosedStatus(c.status, c.archived) && d !== null && d < 0; }).length,
      later: workset.filter((c) => { const d = daysFromToday(c.nextDate || ''); return d !== null && d > 0; }).length,
      openTasks: dashTasks.filter((t) => t.done !== 'true' && (!mineOnly || workset.some((c) => c.id === t.claimId))).length,
      reminders: dashRems.filter((r) => !mineOnly || workset.some((c) => c.id === r.claimId)).length,
      newMail: notifs.filter((x) => x.type === 'gmail_auto' && x.read !== 'true').length,
      review: gmailPending.filter((p) => !p.imported_at && String(p.decision) !== 'auto').length,
      waitingReply: workset.filter((c) => c.status === 'ממתין לחברת ביטוח').length,
      waitingDocs: workset.filter((c) => c.status === 'ממתין למסמכים').length,
      unassigned: workset.filter((c) => !c.assigned_to).length,
      noNext: workset.filter((c) => !claimHasNextAction(c)).length,
      docsNeedsSort: workset.filter((c) => docsOrderOf(c) === 'needs_sort').length,
    };
  }, [workset, dashTasks, dashRems, notifs, gmailPending, mineOnly]);

  const renderListFilterControls = () => (
    <>
      <input className="fi" placeholder="🔎 חיפוש..." style={{ width: 180 }} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="claims-search" />
      <select className="fse" value={stFil} onChange={(e) => setStFil(e.target.value)} style={{ fontSize: 11.5 }} data-testid="claims-status-filter">
        <option value="">כל הסטטוסים</option>
        {STATUSES.map((s) => <option key={s}>{s}</option>)}
      </select>
      <select className="fse" value={insCoFil} onChange={(e) => setInsCoFil(e.target.value)} style={{ fontSize: 11.5 }} data-testid="claims-ins-filter">
        <option value="">כל חברות הביטוח</option>
        {insCompanies.map((co) => <option key={co} value={co}>{co}</option>)}
      </select>
      <select className="fse" value={handlerFil} onChange={(e) => setHandlerFil(e.target.value)} style={{ fontSize: 11.5 }} data-testid="claims-handler-filter">
        <option value="">כל העובדים המטפלים</option>
        {handlerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      <select className="fse" value={docsOrderFil} onChange={(e) => { setDocsOrderFil(e.target.value); setSelectedIds([]); }} style={{ fontSize: 11.5 }} data-testid="claims-docs-order-filter">
        <option value="">כל מצב המסמכים</option>
        {DOCS_ORDER.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
      </select>
    </>
  );

  const renderBulkBar = () => (
    <div className="bulk-bar" data-testid="claims-bulk-bar">
      <label className="bulk-all">
        <input type="checkbox" data-testid="claims-select-all" checked={allVisibleSelected} onChange={(e) => toggleSelectAllVisible(e.target.checked)} />
        סמן הכל בתוצאות המוצגות ({visibleIds.length})
      </label>
      {selectedVisible.length > 0 && (
        <div className="bulk-acts">
          <span data-testid="claims-selected-count">{selectedVisible.length} נבחרו</span>
          {isSuperAdmin ? <button className="btn btn-p btn-sm" data-testid="claims-bulk-assign" onClick={() => setBulkModal('assign')}>שייך לעובד תביעות</button> : null}
          <button className="btn btn-g btn-sm" data-testid="claims-bulk-archive" onClick={() => setBulkModal('archive')}>העבר לארכיון</button>
          <button className="btn btn-sm" data-testid="claims-bulk-delete" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={() => { setDeleteTyped(''); setBulkModal('delete'); }}>מחיקה (soft)</button>
          <button className="btn btn-g btn-sm" onClick={() => setSelectedIds([])}>בטל בחירה</button>
        </div>
      )}
    </div>
  );

  const claimTableHead = (
    <thead><tr>
      <th></th>
      <th>מספר תביעה</th><th>לקוח</th><th>רכב</th><th>חברת ביטוח</th>
      <th>סטטוס טיפול</th><th>עובד מטפל</th>
      <th>טיפול אחרון</th><th>טיפול הבא</th><th>נדרש טיפול</th><th>מצב מסמכים</th>
      {view === 'claims' ? <th></th> : null}
    </tr></thead>
  );

  const renderClaimRow = (c: ClaimRecord, extra?: boolean) => (
    <tr key={c.id} onClick={() => openCard(c.id)} data-testid={`claim-row-${c.id}`}>
      <td onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" data-testid={`claim-check-${c.id}`} checked={selectedIds.includes(c.id)} onChange={(e) => toggleSelect(c.id, e.target.checked)} />
      </td>
      <td style={{ fontWeight: 800, color: 'var(--ac3)', fontSize: 11 }}>{displayClaimNum(c)}</td>
      <td>
        <div style={{ fontWeight: 600 }}>{c.clientName}</div>
        {c.clientPhone && extra ? <div style={{ fontSize: 10, color: 'var(--t3)' }}>{c.clientPhone}</div> : null}
        {c.source === 'Customer Accident Intake' ? <div className="lbl-pill">טופס לקוח</div> : null}
        {docsOrderOf(c) === 'needs_sort' ? <div className="lbl-pill legacy">תיק ישן / דורש סידור</div> : null}
        {c.duplicateSuspect === 'true' ? <div className="lbl-pill" style={{ color: '#b45309' }}>חשד לכפילות</div> : null}
      </td>
      <td>{c.plate || '—'}</td>
      <td>{claimInsCompanyLabel(c)}</td>
      <td>{stBadge(c.status)}</td>
      <td style={{ fontSize: 11 }}>{c.assigned_to_name || '—'}</td>
      <td style={{ fontSize: 10, color: 'var(--t3)' }}>{fmtDay(c.lastTreatmentAt || '')}</td>
      <td style={{ fontSize: 10, color: 'var(--yn2)' }}>{fmtDay(c.nextDate || '')}</td>
      <td onClick={(e) => e.stopPropagation()}><RowAlerts alerts={buildClaimRowAlerts(c, alertCtx)} /></td>
      <td style={{ fontSize: 10 }}>{docsOrderLabel(docsOrderOf(c)) || '—'}</td>
      {extra ? <td onClick={(e) => e.stopPropagation()}><button className="btn btn-g btn-sm" onClick={() => startEdit(c.id)}>✏️</button></td> : null}
    </tr>
  );
  const myTasks = dashTasks.filter((t) => t.done !== 'true' && customerStatusOf(t) !== 'done' && customerStatusOf(t) !== 'cancelled' && (!mineOnly || workset.some((c) => c.id === t.claimId))).slice(0, 8);
  const myRems = dashRems.filter((r) => !mineOnly || workset.some((c) => c.id === r.claimId)).slice(0, 8);

  if (!ready) {
    return (
      <div className="claims-root" style={{ position: 'relative' }}>
        <div className="ls">
          <div className="ls-logo"><span>דליה</span> ניהול תביעות</div>
          <div className="ls-bar"><div className="ls-fill" style={{ width: '70%' }} /></div>
          <div className="ls-step">טוען נתונים...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="claims-root" style={{ position: 'relative' }}>
      {notifOpen && (
        <div className="notif-panel" style={{ display: 'block' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--br)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700 }}>🔔 התראות</span>
            <button className="btn btn-g btn-sm" onClick={() => { apiRef.current.markAllNotificationsRead(); setNotifs((n) => n.map((x) => ({ ...x, read: 'true' }))); }}>סמן הכל כנקרא</button>
          </div>
          {notifs.length === 0 ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--t3)' }}>אין התראות</div>
            : notifs.map((n) => (
              <div key={n.id} className={`notif-item ${n.read === 'true' ? '' : 'unread'}`} onClick={() => {
                apiRef.current.markNotificationRead(n.id);
                setNotifs((xs) => xs.map((x) => x.id === n.id ? { ...x, read: 'true' } : x));
                setNotifOpen(false);
                if (n.type === 'gmail_review' || !n.claimId) showView('gmail');
                else void openCard(n.claimId, n.type === 'gmail_auto' ? 'gin' : 'claim');
              }}>
                <div style={{ whiteSpace: 'pre-line' }}>{n.message}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{n.createdAt}</div>
              </div>
            ))}
        </div>
      )}

      <div className="app">
        <div className="tb">
          <button type="button" className="sb-open-btn" data-testid="claims-sb-open" aria-label="פתח תפריט תביעות" onClick={() => setSbOpen(true)}>☰ תפריט</button>
          <div className="tb-logo"><span className="tba">דליה</span><span className="tbb">ניהול תביעות</span></div>
          <button className="btn btn-p btn-sm tb-new" data-testid="claims-open-new" onClick={openNew}>＋ תיק חדש</button>
          <div className="tb-sep" />
          <div className="tb-nav">
            {[
              ['dashboard', '📊 דשבורד'],
              ['claims', '📋 תיקים'],
              ['gmail', '📧 Gmail'],
              ['tasks', '✅ משימות'],
              ['reports', '📈 דוחות'],
            ].map(([k, l]) => (
              <button key={k} className={`tbn ${view === k ? 'act' : ''}`} onClick={() => showView(k)}>
                {l}{k === 'claims' ? <span className="nb b">{workset.length}</span> : null}
              </button>
            ))}
            <button className="tbn" onClick={async () => {
              const r = await apiRef.current.getTemplates();
              setTpl(r.data || {});
              const first = Object.keys(r.data || {})[0] || '';
              setCurTpl(first);
              if (first && r.data?.[first]) {
                setVal('tpl_subj', r.data[first].subject || '');
                setVal('tpl_body', r.data[first].body || '');
              }
              setModal('moTemplates');
            }}>📝 תבניות</button>
          </div>
          <div className="tb-r">
            <div style={{ position: 'relative' }}>
              <input className="fi" placeholder="🔎 חיפוש גלובלי..." style={{ width: 200, padding: '5px 10px', fontSize: 11.5 }}
                onChange={async (e) => {
                  const q = e.target.value;
                  if (q.length < 2) { setGOpen(false); return; }
                  const r = await apiRef.current.globalSearch(q);
                  setGHits(r.data || []);
                  setGOpen(true);
                }} />
              {gOpen && (
                <div className="veh-drop" style={{ position: 'absolute', left: 0, top: '110%', width: 320, zIndex: 600 }}>
                  {gHits.map((c) => (
                    <div key={c.id} className="veh-item" onClick={() => { setGOpen(false); openCard(c.id); }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{c.clientName}</b>{stBadge(c.status)}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{displayClaimNum(c)} · {c.plate} · {c.insCompany}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="bell-btn" onClick={() => setNotifOpen((v) => !v)}>🔔{unread > 0 && <span className="bell-badge">{unread}</span>}</button>
            <button className="sync-btn" onClick={() => loadAll()}>
              <div className={`sdot ${sync === 'pend' ? 'pend' : sync === 'err' ? 'err' : ''}`} />
              <span>{sync === 'pend' ? 'מסנכרן...' : sync === 'err' ? 'שגיאה' : 'מסונכרן'}</span>
            </button>
            <button className="btn btn-g btn-sm" data-testid="claims-intake-link" onClick={async () => {
              const r = await apiRef.current.invokeIntake('create_link');
              if (!r.success || !r.token) { toast(String(r.error || 'יצירת קישור נכשלה'), 'err'); return; }
              const origin = window.location.origin;
              const base = import.meta.env.BASE_URL || '/';
              const url = `${origin}${base && base !== '/' ? base.replace(/\/$/, '') : ''}/claims-intake?t=${r.token}`;
              try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
              setIntakeLinkMsg(url);
              toast('הקישור הועתק — אפשר להדביק ב-WhatsApp');
            }}>שלח טופס דיווח ללקוח</button>
          </div>
        </div>
        {intakeLinkMsg ? <div style={{ fontSize: 11, padding: '6px 12px', wordBreak: 'break-all' }} data-testid="claims-intake-url">{intakeLinkMsg}</div> : null}

        <div className="body">
          <div className={`sb-ov ${sbOpen ? 'open' : ''}`} data-testid="claims-sb-overlay" onClick={() => setSbOpen(false)} />
          <div className={`sb ${sbOpen ? 'open' : ''}`} data-testid="claims-sb">
            <div className="sb-mhead">
              <span>תפריט תביעות</span>
              <button type="button" className="mcl" data-testid="claims-sb-close" aria-label="סגור תפריט תביעות" onClick={() => setSbOpen(false)}>✕</button>
            </div>
            <div className="sb-sec">
              <div className="sb-lbl">ניווט</div>
              <button className={`sb-i ${view === 'dashboard' && !filter ? 'act' : ''}`} onClick={() => showView('dashboard')}><span className="ic">📊</span>דשבורד</button>
              <button className={`sb-i ${view === 'claims' && !filter && listMode === 'active' ? 'act' : ''}`} data-testid="claims-nav-all" onClick={() => showView('claims')}><span className="ic">📋</span>{mineOnly ? 'התביעות שלי' : 'כל התיקים'}<span className="sb-bd b">{workset.length}</span></button>
              <button className={`sb-i ${view === 'claims' && listMode === 'archive' ? 'act' : ''}`} data-testid="claims-nav-archive" onClick={() => { setListMode('archive'); setView('claims'); setFilter(''); setStFil(''); setSbOpen(false); }}><span className="ic">📦</span>תיקים בארכיון<span className="sb-bd">{archiveClaims.length}</span></button>
              <button className={`sb-i ${view === 'gmail' ? 'act' : ''}`} onClick={() => showView('gmail')}><span className="ic">📧</span>Gmail{gmailPending.filter((p) => !p.imported_at && p.decision === 'needs_review').length ? <span className="sb-bd r">{gmailPending.filter((p) => !p.imported_at && p.decision === 'needs_review').length}</span> : null}</button>
              <button className={`sb-i ${view === 'tasks' ? 'act' : ''}`} onClick={() => showView('tasks')}><span className="ic">✅</span>משימות</button>
              <button className={`sb-i ${view === 'reports' ? 'act' : ''}`} onClick={() => showView('reports')}><span className="ic">📈</span>דוחות</button>
              <button className="sb-i" data-testid="claims-nav-templates" onClick={async () => {
                setSbOpen(false);
                const r = await apiRef.current.getTemplates();
                setTpl(r.data || {});
                const first = Object.keys(r.data || {})[0] || '';
                setCurTpl(first);
                if (first && r.data?.[first]) {
                  setVal('tpl_subj', r.data[first].subject || '');
                  setVal('tpl_body', r.data[first].body || '');
                }
                setModal('moTemplates');
              }}><span className="ic">📝</span>תבניות</button>
            </div>
            <div className="sb-div" />
            <div className="sb-sec">
              <div className="sb-lbl">לפי סטטוס</div>
              {[
                ['חדש', '🆕', 'sb-bd b'],
                ['בטיפול', '⚙️', 'sb-bd b'],
                ['ממתין לחברת ביטוח', '🏢', 'sb-bd y'],
                ['ממתין לשמאי', '🔍', 'sb-bd y'],
                ['ממתין למסמכים', '📄', 'sb-bd r'],
                ['ממתין לתשלום', '💰', 'sb-bd y'],
                ['בטיפול משפטי', '⚖️', 'sb-bd'],
                ['הסתיים', '✅', 'sb-bd'],
              ].map(([st, ic, bd]) => (
                <button key={st} className={`sb-i ${filter === st ? 'act' : ''}`} onClick={() => showView('claims', st)}>
                  <span className="ic">{ic}</span>{st === 'ממתין לחברת ביטוח' ? 'חברת ביטוח' : st === 'ממתין לשמאי' ? 'שמאי' : st === 'ממתין למסמכים' ? 'מסמכים' : st === 'ממתין לתשלום' ? 'לתשלום' : st === 'בטיפול משפטי' ? 'משפטי' : st}
                  {st !== 'הסתיים' && <span className={bd}>{cnt((x) => x.status === st)}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="main">
            {view === 'dashboard' && (
              <>
                <div className="ph">
                  <div><div className="ph-t">{isSuperAdmin && !mineOnly ? 'דשבורד' : 'התביעות שלי'}<div className="ph-bar" /></div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {actor.full_name}</div>
                  </div>
                  <div className="ph-a">
                    {isSuperAdmin && (
                      <button className={`btn btn-sm ${mineOnly ? 'btn-p' : 'btn-g'}`} onClick={() => setMineOnly((v) => !v)}>{mineOnly ? 'התביעות שלי' : 'כל התביעות'}</button>
                    )}
                    {renderListFilterControls()}
                    <button className="btn btn-g btn-sm" data-testid="claims-scan-inbox" onClick={() => { void runInboxScan(false); showView('gmail'); }}>📬 סרוק מיילים</button>
                    <button className="btn btn-g btn-sm" data-testid="claims-preview-sent" onClick={() => { void runSentPreview(); showView('gmail'); }}>📤 סריקת יוצאים (תצוגה)</button>
                  </div>
                </div>
                <div className="dcg">
                  {([
                    ['b', dashCounts.all, 'כל התביעות', 'dash-all', () => applyDashFilter('')],
                    ['y', dashCounts.today, 'דורשות טיפול היום', 'dash-today', () => applyDashFilter('today')],
                    ['r', dashCounts.overdue, 'טיפול באיחור', 'dash-overdue', () => applyDashFilter('overdue')],
                    ['b', dashCounts.later, 'טיפול בהמשך', 'dash-later', () => applyDashFilter('later')],
                    ['p', dashCounts.openTasks, 'משימות פתוחות', 'dash-open-tasks', () => { applyDashFilter('open_tasks'); showView('tasks'); }],
                    ['y', dashCounts.reminders, 'תזכורות', 'dash-reminders', () => applyDashFilter('reminders')],
                    ['p', dashCounts.newMail, 'מיילים חדשים', 'dash-new-mail', () => {
                      const n = notifs.find((x) => x.type === 'gmail_auto' && x.read !== 'true' && x.claimId);
                      if (n?.claimId) void openCard(n.claimId, 'gin');
                      else showView('gmail');
                    }],
                    ['y', dashCounts.review, 'דורשים בדיקת שיוך', 'dash-needs-review', () => showView('gmail')],
                    ['y', dashCounts.waitingReply, 'ממתינים לתשובה', 'dash-waiting-reply', () => applyDashFilter('waiting_reply')],
                    ['r', dashCounts.waitingDocs, 'ממתינים למסמכים', 'dash-waiting-docs', () => applyDashFilter('waiting_docs')],
                    ['r', dashCounts.unassigned, 'ללא עובד מטפל', 'dash-unassigned', () => applyDashFilter('unassigned')],
                    ['y', dashCounts.noNext, 'ללא פעולה הבאה', 'dash-no-next', () => applyDashFilter('no_next')],
                    ['y', dashCounts.docsNeedsSort, 'דורשים סידור מסמכים', 'dash-docs-sort', () => { setDocsOrderFil('needs_sort'); applyDashFilter('docs_needs_sort'); }],
                  ] as Array<[string, number, string, string, () => void]>).map(([color, n, label, tid, onClick]) => (
                    <button type="button" key={tid} className="dc" data-testid={tid} style={{ cursor: 'pointer', textAlign: 'right' }} onClick={onClick}>
                      <div className={`dc-bar ${color}`} /><div className={`dc-n ${color}`}>{n}</div><div className="dc-l">{label}</div>
                    </button>
                  ))}
                </div>
                <div className="sdiv"><div className="sdiv-t">חברות ביטוח</div><div className="sdiv-l" /></div>
                <div className="dcg" data-testid="dash-ins-companies">
                  {insCounts.length === 0 ? <div style={{ color: 'var(--t3)', fontSize: 12 }}>אין חברות ביטוח בתיקים</div>
                    : insCounts.map(([co, n]) => (
                      <button type="button" key={co} className="dc" data-testid={`dash-ins-${co}`} style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => applyDashFilter('', co)}>
                        <div className="dc-bar b" /><div className="dc-n b">{n}</div><div className="dc-l">{co}</div>
                      </button>
                    ))}
                </div>
                <div className="sdiv"><div className="sdiv-t">{workFil || insCoFil || docsOrderFil ? 'תוצאות מסוננות' : (mineOnly ? 'התביעות שלי' : 'כל התביעות')}</div><div className="sdiv-l" /></div>
                {renderBulkBar()}
                <div className="tw" data-testid="claims-dash-table"><table>
                  {claimTableHead}
                  <tbody>
                    {dashRows.length === 0 ? <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--t3)', padding: 24 }}>אין תיקים</td></tr>
                      : dashRows.map((x) => renderClaimRow(x))}
                  </tbody>
                </table></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 16 }}>
                  <div>
                    <div className="sdiv"><div className="sdiv-t">משימות לביצוע</div><div className="sdiv-l" /></div>
                    {myTasks.length === 0 ? <div style={{ color: 'var(--t3)', fontSize: 12 }}>אין משימות פתוחות</div>
                      : myTasks.map((t) => {
                        const c = claims.find((x) => x.id === t.claimId);
                        return (
                        <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px', marginBottom: 7, cursor: 'pointer' }} onClick={() => t.claimId && openCard(t.claimId)}>
                          <div style={{ fontWeight: 800 }}>{c?.clientName || 'ללא שם לקוח'}</div>
                          <div style={{ fontSize: 11, color: 'var(--t3)' }}>{c ? displayClaimNum(c) : ''}{c?.insCompany ? ` · ${c.insCompany}` : ''}{c?.assigned_to_name ? ` · ${c.assigned_to_name}` : ''}</div>
                          <div style={{ fontWeight: 600 }}>{t.action}</div>
                          <div style={{ fontSize: 11, color: 'var(--yn2)' }}>{t.dueDate ? `📅 ${t.dueDate}` : ''}{t.workStatus ? ` · ${workStatusHe(t.workStatus)}` : ''}</div>
                        </div>
                        );
                      })}
                  </div>
                  <div>
                    <div className="sdiv"><div className="sdiv-t">תזכורות</div><div className="sdiv-l" /></div>
                    {myRems.length === 0 ? <div style={{ color: 'var(--t3)', fontSize: 12 }}>אין תזכורות</div>
                      : myRems.map((r) => {
                        const c = claims.find((x) => x.id === r.claimId);
                        return (
                        <div key={r.id} style={{ background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px', marginBottom: 7, cursor: 'pointer' }} onClick={() => r.claimId && openCard(r.claimId)}>
                          <div style={{ fontWeight: 800 }}>{c?.clientName || r.note || r.claimId}</div>
                          <div style={{ fontWeight: 600 }}>{r.date} {r.time || ''}</div>
                          <div style={{ fontSize: 12, color: 'var(--t2)' }}>{r.note || ''}{c ? ` · ${displayClaimNum(c)}` : ''}</div>
                        </div>
                        );
                      })}
                  </div>
                </div>
              </>
            )}

            {view === 'claims' && (
              <>
                <div className="ph">
                  <div><div className="ph-t" data-testid="claims-list-heading">{listMode === 'archive' ? 'תיקים בארכיון' : (filter || stFil || workFil || insCoFil || (mineOnly ? 'התביעות שלי' : 'כל התיקים'))}<div className="ph-bar" /></div></div>
                  <div className="ph-a">
                    {isSuperAdmin && (
                      <button className={`btn btn-sm ${mineOnly ? 'btn-p' : 'btn-g'}`} onClick={() => setMineOnly((v) => !v)}>{mineOnly ? 'שלי' : 'הכול'}</button>
                    )}
                    {renderListFilterControls()}
                  </div>
                </div>
                {renderBulkBar()}
                <div className="tw" data-testid="claims-list-table"><table>
                  {claimTableHead}
                  <tbody>
                    {list.length === 0 ? <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--t3)', padding: 28 }}>לא נמצאו תיקים</td></tr>
                      : list.map((c) => renderClaimRow(c, true))}
                  </tbody>
                </table></div>
              </>
            )}

            {view === 'gmail' && (
              <>
                <div className="ph">
                  <div><div className="ph-t">📧 Gmail – חיבור תיבת דליה<div className="ph-bar" /></div></div>
                  <div className="ph-a">
                    <button className="btn btn-p btn-sm" data-testid="claims-scan-inbox-gmail" onClick={() => void runInboxScan(false)}>📬 סרוק מיילים נכנסים</button>
                    <button className="btn btn-g btn-sm" data-testid="claims-preview-sent-gmail" onClick={() => void runSentPreview()}>📤 סריקת יוצאים (תצוגה)</button>
                  </div>
                </div>
                <div className="gmail-card">
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {gmailStatus.connected ? `מחובר: ${gmailStatus.email || 'yoni122222@gmail.com'}` : 'לא מחובר עדיין'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
                    העובד לא נכנס לתיבת Gmail. ייבוא רק מתוך תיק מורשה.
                    <br />שליחה ידנית מתוך תיק: Preview → SEND → אשר ושלח שולחת מייל אמיתי מתיבת דליה. אין allowlist של TEST.
                    <br />מעקב מתוזמן נשאר Dry Run ואינו שולח לבד.
                    <br />קליטת מיילים נכנסים: סריקה מתוך Claims בלבד, חלון 3 הימים האחרונים. אין Scheduler חדש ואין שינוי OAuth.
                    <br />סריקת יוצאים: תצוגה בלבד — אין Import המוני ואין שליחה.
                    <br />Token נשמר בשרת בלבד. ביטול: super_admin כאן, וגם בהרשאות Google.
                  </div>
                  {gmailBusy ? <div style={{ marginTop: 8, fontSize: 12 }}>{gmailBusy}</div> : null}
                  {isSuperAdmin && gmailStatus.connected && (
                    <button className="btn btn-sm" style={{ marginTop: 10, background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={async () => {
                      const r = await apiRef.current.invokeGmail('revoke');
                      if (!r.success) { toast(String(r.error || 'שגיאה'), 'err'); return; }
                      setGmailStatus({ connected: false, email: null, canConnect: true });
                      toast('החיבור בוטל');
                    }}>בטל חיבור Gmail</button>
                  )}
                  {!gmailStatus.connected && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--yn2)' }}>
                      חיבור OAuth מתבצע במסך האישור המקומי של הבעלים (לא מפה). אחרי האישור רענן דף זה.
                    </div>
                  )}
                </div>
                <div className="sdiv"><div className="sdiv-t">דורש בדיקת שיוך ({gmailPending.filter((p) => !p.imported_at && p.decision !== 'auto').length})</div><div className="sdiv-l" /></div>
                {gmailPending.filter((p) => !p.imported_at && String(p.decision) !== 'auto').length === 0
                  ? <div style={{ color: 'var(--t3)', fontSize: 12, marginBottom: 12 }}>אין מיילים שממתינים לשיוך ידני</div>
                  : gmailPending.filter((p) => !p.imported_at && String(p.decision) !== 'auto').map((p) => {
                    const pid = String(p.id || '');
                    return (
                      <div key={pid} className="gmail-card" data-testid="claims-pending-mail">
                        <div style={{ fontWeight: 800, marginBottom: 4 }}>{String(p.subject || '(ללא נושא)')}</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>{String(p.from_addr || '')} · {String(p.sent_at || '')}</div>
                        <div style={{ fontSize: 12, margin: '6px 0', color: 'var(--yn2)' }}>{String(p.reason || 'דורש בדיקת שיוך')}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <select className="fse" value={pendingPick[pid] || ''} onChange={(e) => setPendingPick((prev) => ({ ...prev, [pid]: e.target.value }))}>
                            <option value="">בחירת תביעה…</option>
                            {workset.map((c) => (
                              <option key={c.id} value={c.id}>{displayClaimNum(c)} · {c.clientName} · {c.plate || '—'}</option>
                            ))}
                          </select>
                          <button className="btn btn-p btn-sm" onClick={async () => {
                            const claimId = pendingPick[pid];
                            if (!claimId) { toast('בחרו תביעה', 'err'); return; }
                            setGmailBusy('משייך ומייבא…');
                            const a = await apiRef.current.invokeGmail('assign_pending', { pending_id: pid, claim_id: claimId });
                            if (!a.success) { setGmailBusy(''); toast(String(a.error || 'שיוך נכשל'), 'err'); return; }
                            const ir = await apiRef.current.importGmailMessage(claimId, String(a.message_id || p.gmail_message_id));
                            setGmailBusy('');
                            if (!ir.success) { toast(String(ir.error || 'ייבוא נכשל'), 'err'); return; }
                            await apiRef.current.cancelScheduledMailFollowups(claimId);
                            toast('המייל שויך ידנית ונקלט בתיק');
                            await loadPending();
                            await loadAll();
                            await openCard(claimId, 'gin');
                          }}>שייך ידנית</button>
                        </div>
                      </div>
                    );
                  })}
              </>
            )}

            {view === 'tasks' && (
              <>
                <div className="ph"><div><div className="ph-t">משימות פתוחות<div className="ph-bar" /></div></div></div>
                {allTasks.length === 0 ? <div className="empty"><div style={{ fontSize: 28 }}>✅</div><div>אין משימות פתוחות</div></div>
                  : allTasks.map((t) => {
                    const c = claims.find((x) => x.id === t.claimId);
                    return (
                      <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 7, padding: '11px 13px', marginBottom: 7, cursor: 'pointer' }} onClick={() => openCard(t.claimId)}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{c?.clientName || 'ללא שם לקוח'}</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                          מספר תביעה: {c ? displayClaimNum(c) : '—'}
                          {c?.insCompany ? ` · ${c.insCompany}` : ''}
                          {c?.assigned_to_name ? ` · מטפל: ${c.assigned_to_name}` : ''}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{t.action}</div>
                        <div style={{ fontSize: 11, color: 'var(--yn2)' }}>{t.dueDate ? `📅 ${t.dueDate}` : ''}{t.workStatus ? ` · ${workStatusHe(t.workStatus)}` : ''}</div>
                      </div>
                    );
                  })}
              </>
            )}

            {view === 'reports' && (
              <>
                <div className="ph"><div><div className="ph-t">דוחות ניהול<div className="ph-bar" /></div></div>
                  <div className="ph-a">
                    {[7, 14, 30, 60].map((d) => (
                      <button key={d} className="btn btn-g btn-sm" onClick={async () => {
                        const r = await apiRef.current.getInactiveClaims(d);
                        setInactive({ days: d, rows: r.data || [] });
                      }}>{d} ימים</button>
                    ))}
                  </div>
                </div>
                {inactive && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="sdiv"><div className="sdiv-t">תיקים ללא פעילות – {inactive.days} ימים ({inactive.rows.length})</div><div className="sdiv-l" /></div>
                    <div className="tw"><table><thead><tr><th>מספר תביעה</th><th>לקוח</th><th>רכב</th><th>סטטוס</th><th>פעילות אחרונה</th></tr></thead>
                      <tbody>
                        {inactive.rows.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t3)', padding: 20 }}>אין תיקים ללא פעילות</td></tr>
                          : inactive.rows.map((c) => (
                            <tr key={c.id} onClick={() => openCard(c.id)}>
                              <td style={{ fontWeight: 800, color: 'var(--ac3)', fontSize: 11 }}>{displayClaimNum(c)}</td>
                              <td>{c.clientName}</td><td>{c.plate || '—'}</td>
                              <td>{stBadge(c.status)}</td>
                              <td style={{ fontSize: 11, color: 'var(--rd2)' }}>{c.lastActivityAt || c.updatedAt || '—'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table></div>
                  </div>
                )}
                <div dangerouslySetInnerHTML={{ __html: reportHtml }} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* NEW/EDIT */}
      <div className={`ov ${modal === 'moClaim' ? 'open' : ''}`} data-testid="claims-new-modal" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
        <div className="modal">
          <div className="mh"><div className="mh-t" id="mClaimT">{val(null, 'fc_id') ? 'עריכת תיק' : 'פתיחת תיק חדש'}</div><button className="mcl" onClick={() => setModal(null)}>✕</button></div>
          <div className="mb">
            <ClaimAccidentForm
              mode="staff"
              value={intakeDraft}
              onChange={(d) => { setIntakeDraft(d); setVal('fc_kind', d.claimKind || CLAIM_KINDS[0]); }}
              stepKey="all"
              staffSlot={(
                <>
                  <div className="sdiv"><div className="sdiv-t">פנימי לעובד</div><div className="sdiv-l" /></div>
                  <div className="fg2">
                    <div className="fg full">
                      <label className="fl">שיוך לרכב ב-Oren Car (חיפוש בלבד — לא יוצר רכב)</label>
                      <input className="fi" placeholder="הקלד מספר רישוי, דגם או חברה..." onChange={(e) => searchVehicles(e.target.value)} />
                      {vehId && <div className="lbl-pill" style={{ marginTop: 6 }}>משויך לרכב ✓ · {companyName || '—'}</div>}
                      {vehHits.length > 0 && (
                        <div className="veh-drop" style={{ marginTop: 6 }}>
                          {vehHits.map((v) => (
                            <div key={v.id} className="veh-item" onClick={() => pickVehicle(v)}>
                              <b>{v.license_plate}</b> · {[v.manufacturer, v.model].filter(Boolean).join(' ')} · {v.company_name || '—'}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="fg"><label className="fl">סטטוס</label>
                      <select className="fse fi" id="fc_status">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                    </div>
                    <div className="fg"><label className="fl">אימייל ביטוח</label><input className="fi" id="fc_coEmail" type="email" /></div>
                    <div className="fg"><label className="fl">נציג – שם</label><input className="fi" id="fc_insRepName" /></div>
                    <div className="fg"><label className="fl">נציג – טלפון</label><input className="fi" id="fc_insRepPhone" /></div>
                    <div className="fg"><label className="fl">נציג – אימייל</label><input className="fi" id="fc_insRepEmail" type="email" /></div>
                    <div className="fg"><label className="fl">אימייל צד ג׳</label><input className="fi" id="fc_thirdEmail" type="email" /></div>
                  </div>
                  <div className="sdiv"><div className="sdiv-t">שמאי</div><div className="sdiv-l" /></div>
                  <div className="fg2">
                    <div className="fg"><label className="fl">שם שמאי</label><input className="fi" id="fc_surv" /></div>
                    <div className="fg"><label className="fl">טלפון שמאי</label><input className="fi" id="fc_survPhone" /></div>
                    <div className="fg"><label className="fl">אימייל שמאי</label><input className="fi" id="fc_survEmail" type="email" /></div>
                  </div>
                  <div className="sdiv"><div className="sdiv-t">כספי</div><div className="sdiv-l" /></div>
                  <div className="fg3">
                    <div className="fg"><label className="fl">סכום תביעה (₪)</label><input className="fi" id="fc_amount" type="number" /></div>
                    <div className="fg"><label className="fl">סכום אושר (₪)</label><input className="fi" id="fc_approved" type="number" /></div>
                    <div className="fg"><label className="fl">סכום שולם (₪)</label><input className="fi" id="fc_paid" type="number" /></div>
                    <div className="fg"><label className="fl">תאריך תשלום</label><input className="fi" id="fc_payDate" type="date" /></div>
                    <div className="fg"><label className="fl">אסמכתא</label><input className="fi" id="fc_ref" /></div>
                  </div>
                  <div className="sdiv"><div className="sdiv-t">פעולה הבאה</div><div className="sdiv-l" /></div>
                  <div className="fg2">
                    <div className="fg"><label className="fl">פעולה</label><input className="fi" id="fc_nextAction" /></div>
                    <div className="fg"><label className="fl">תאריך יעד</label><input className="fi" id="fc_nextDate" type="date" /></div>
                    <div className="fg full"><label className="fl">הערות פנימיות</label><textarea className="fta" id="fc_notes" /></div>
                  </div>
                  <div className="sdiv"><div className="sdiv-t">⚖️ טיפול משפטי</div><div className="sdiv-l" /></div>
                  <div className="fg2">
                    <div className="fg"><label className="fl">סיבת העברה</label><select className="fse fi" id="fc_legalReason"><option>דחיית תביעה</option><option>תשלום חלקי</option><option>אי תגובה</option><option>מחלוקת כספית</option><option>מחלוקת אחריות</option><option>עיכוב חריג</option><option>אחר</option></select></div>
                    <div className="fg"><label className="fl">שם עורך דין</label><input className="fi" id="fc_legalLawyer" /></div>
                    <div className="fg"><label className="fl">משרד</label><input className="fi" id="fc_legalFirm" /></div>
                    <div className="fg"><label className="fl">טלפון</label><input className="fi" id="fc_legalPhone" /></div>
                    <div className="fg"><label className="fl">אימייל</label><input className="fi" id="fc_legalEmail" type="email" /></div>
                    <div className="fg"><label className="fl">תאריך העברה</label><input className="fi" id="fc_legalDate" type="date" /></div>
                    <div className="fg full"><label className="fl">הערות משפטיות</label><textarea className="fta" id="fc_legalNotes" /></div>
                  </div>
                </>
              )}
            />
            <input type="hidden" id="fc_id" />
            <input type="hidden" id="fc_kind" />
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal(null)}>ביטול</button><button className="btn btn-p" onClick={doSaveClaim}>💾 שמור</button></div>
        </div>
      </div>

      {/* CARD */}
      <div className={`ov ${modal === 'moCard' && cur ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
        {cur && (
          <div className="modal" style={{ maxWidth: 940 }}>
            <div className="mh">
              <div>
                <div className="card-title-name">{cur.clientName || '—'}</div>
                <div className="card-title-num">מספר תביעה: {displayClaimNum(cur)}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="btn btn-g btn-sm" data-testid="claims-edit-btn" onClick={() => startEdit(cur.id)}>ערוך</button>
                <button className="mcl" onClick={() => setModal(null)}>✕</button>
              </div>
            </div>
            <div className="card-snap" data-testid="claims-card-snapshot">
              <div className="card-snap-grid">
                {([
                  ['שם לקוח', cur.clientName || '—'],
                  ['מספר תביעה', displayClaimNum(cur)],
                  ['חברת ביטוח', cur.insCompany || '—'],
                  ['רכב', cur.plate || '—'],
                  ['עובד מטפל', cur.assigned_to_name || 'ללא מטפל'],
                  ['סטטוס', cur.status || '—'],
                  ['טיפול אחרון', fmtDay(cur.lastTreatmentAt || '')],
                  ['טיפול הבא', fmtDay(cur.nextDate || '')],
                  ['נדרשת פעולה', returnNeededLabel(cur)],
                ] as Array<[string, string]>).map(([k, v]) => (
                  <div key={k}><div className="card-snap-k">{k}</div><div className="card-snap-v">{k === 'סטטוס' ? stBadge(v) : v}</div></div>
                ))}
              </div>
              <div className="card-flags">
                {cur.claimKind ? <div className="lbl-pill">{cur.claimKind}</div> : null}
                {docsOrderOf(cur) === 'needs_sort' ? <div className="lbl-pill legacy">תיק ישן / דורש סידור מסמכים</div> : null}
                {docsOrderOf(cur) === 'organized' ? <div className="lbl-pill" style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,.35)', background: 'rgba(34,197,94,.1)' }}>תיק מסודר</div> : null}
                {cur.source === 'Customer Accident Intake' ? <div className="lbl-pill">טופס לקוח</div> : null}
                {cur.duplicateSuspect === 'true' ? <div className="lbl-pill" style={{ color: '#b45309' }}>חשד לכפילות</div> : null}
                {snapNewMail ? <div className="lbl-pill flag-on" data-testid="snap-new-mail">מייל חדש</div> : null}
                {snapMissingDoc ? <div className="lbl-pill flag-warn" data-testid="snap-missing-doc">מסמך חסר</div> : null}
                {snapOpenTask ? <div className="lbl-pill flag-on" data-testid="snap-open-task">משימה פתוחה</div> : null}
                {snapRem ? <div className="lbl-pill flag-on" data-testid="snap-reminder">תזכורת</div> : null}
                {snapFollow ? <div className="lbl-pill flag-on" data-testid="snap-followup">מעקב מייל</div> : null}
              </div>
              {cur ? <div className="card-flags" style={{ marginTop: 8 }}><RowAlerts alerts={buildClaimRowAlerts(cur, alertCtx)} /></div> : null}
            </div>
            <div className="ab ab-regroup">
              <div className="ab-primary">
                <button className="ab-btn ab-mail ab-pri" data-testid="claims-send-mail" onClick={() => { setCardMore(false); void openSendModal('draft'); }}>מייל חדש</button>
                <button className="ab-btn ab-task ab-pri" data-testid="claims-cust-request" onClick={() => { setCardMore(false); openCustomerRequest(); }}>בקשה ללקוח</button>
                <button className="ab-btn ab-status ab-pri" data-testid="claims-treat-open" onClick={() => { setCardMore(false); openTreat(cur.treatmentPendingAction || treatAction || 'עדכון טיפול', { sendOk: treatSendOk }); }}>עדכון טיפול</button>
                <button className="ab-btn ab-sum ab-pri" data-testid="claims-open-docs" onClick={() => { setCardMore(false); setCardTab('docs'); }}>מסמכים</button>
              </div>
              <div className="ab-more-wrap">
                <button type="button" className={`ab-btn ab-sum ${cardMore ? 'act' : ''}`} data-testid="claims-card-more" onClick={() => setCardMore((v) => !v)}>עוד</button>
                {cardMore ? <div className="ab-more-ov" data-testid="claims-card-more-ov" onClick={() => setCardMore(false)} /> : null}
                {cardMore ? (
                  <div className="ab-more-panel" data-testid="claims-card-more-panel">
                    <button className="ab-btn ab-phone" onClick={() => { setCardMore(false); setModal('moCall'); }}>שיחה</button>
                    <button className="ab-btn ab-wa" onClick={() => { setCardMore(false); setVal('wa_msg', `שלום, בהמשך לתביעה ${displayClaimNum(cur)}`); setModal('moWA'); }}>WhatsApp</button>
                    <button className="ab-btn ab-mail" data-testid="claims-send-insurer" onClick={() => { setCardMore(false); void openSendModal('insurer'); }}>שליחה לחברת ביטוח</button>
                    <button className="ab-btn ab-status" data-testid="claims-send-legal" onClick={() => { setCardMore(false); void openSendModal('legal'); }}>טיפול משפטי</button>
                    <button className="ab-btn ab-sum" data-testid="claims-sum-internal" onClick={async () => { setCardMore(false); const r = await apiRef.current.exportClaimSummary(cur.id); setSumText(r.text || ''); setModal('moSum'); }}>סיכום פנימי</button>
                    <button className="ab-btn ab-sum" data-testid="claims-sum-external" onClick={async () => {
                      setCardMore(false);
                      const mailBody = gmailImports.map((im) => String(im.body_text || '')).filter((t) => t.trim().length > 2).join('\n\n');
                      const r = await apiRef.current.exportExternalSummary(cur.id, { mailBody, docNames: docs.files.map((f) => f.original_name) });
                      setExportText(r.text || '');
                      setModal('moExport');
                    }}>סיכום חיצוני</button>
                    <button className="ab-btn ab-task" onClick={() => { setCardMore(false); setModal('moTask'); }}>משימה</button>
                    <button className="ab-btn ab-rem" onClick={() => { setCardMore(false); setModal('moRem'); }}>תזכורת</button>
                    <button className="ab-btn ab-mail" data-testid="claims-mail-followup" onClick={() => { setCardMore(false); openMailFollowupModal(null); }}>מעקב מייל</button>
                    <button className="ab-btn ab-mail" data-testid="claims-gmail-import" onClick={() => { void startGmailImport(); }}>ייבוא Gmail</button>
                    {isSuperAdmin ? <button className="ab-btn ab-status" data-testid="claims-assign-btn" onClick={() => { setCardMore(false); setModal('moAssign'); }}>הקצה לעובד מטפל</button> : null}
                    <button className="ab-btn ab-status" data-testid="claims-status-btn" onClick={() => { setCardMore(false); setVal('sf_st', cur.status); setVal('sf_note', ''); setModal('moStatus'); }}>סטטוס</button>
                    <button className="ab-btn" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={() => { setCardMore(false); setModal('moClose'); }}>סגור תיק</button>
                    {cur.archived === 'true'
                      ? <button className="ab-btn ab-sum" data-testid="claims-restore-archive" onClick={async () => {
                        setCardMore(false);
                        const r = await apiRef.current.restoreClaim(cur.id);
                        if (!r.success) { toast(String(r.error || 'שחזור נכשל'), 'err'); return; }
                        await loadAll();
                        toast('שוחזר מארכיון');
                      }}>שחזר מארכיון</button>
                      : <button className="ab-btn ab-sum" data-testid="claims-archive" onClick={() => { setCardMore(false); setModal('moArchive'); }}>העבר לארכיון</button>}
                    <button className="ab-btn" data-testid="claims-delete" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={() => { setCardMore(false); setDeleteTyped(''); setModal('moDelete'); }}>מחק תיק</button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mb">
              {cur.treatmentPending === 'true' ? (
                <div data-testid="treatment-pending-banner" className="treat-pending" style={{ background: 'rgba(234,179,8,.12)', border: '1px solid var(--yn2)', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 12 }}>
                  {treatSendOk ? <div style={{ fontWeight: 800, marginBottom: 4 }}>המייל נשלח בהצלחה — נדרש עדכון טיפול (לא נשלח שוב)</div> : null}
                  נדרש עדכון טיפול: {cur.treatmentPendingAction || treatAction || 'פעולה משמעותית'}
                  <button type="button" className="btn btn-p btn-sm" data-testid="treatment-pending-open" style={{ marginInlineStart: 8 }} onClick={() => openTreat(cur.treatmentPendingAction || treatAction || 'עדכון טיפול', { sendOk: treatSendOk })}>השלם עדכון טיפול</button>
                </div>
              ) : null}
              <div className="tabs tab-groups" data-testid="claims-tab-groups">
                {CARD_TAB_GROUPS.map((g) => (
                  <button key={g.key} type="button" className={`tab ${tabGroup.key === g.key ? 'act' : ''}`} data-testid={`claims-tab-group-${g.key}`} onClick={() => { setCardMore(false); setCardTab(g.tabs[0].key); if (g.key === 'mail' && cur) void refreshMailLists(cur.id); }}>{g.label}</button>
                ))}
              </div>
              {tabGroup.tabs.length > 1 ? (
                <div className="tabs tab-subs" data-testid="claims-tab-subs">
                  {tabGroup.tabs.map((t) => (
                    <button key={t.key} type="button" className={`tab ${cardTab === t.key ? 'act' : ''}`} data-testid={`claims-tab-sub-${t.key}`} onClick={() => { setCardMore(false); setCardTab(t.key); }}>{t.label}</button>
                  ))}
                </div>
              ) : null}
              {cardTab === 'claim' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 11 }}>
                  {[['מספר תביעה', displayClaimNum(cur)], ['סוג', cur.claimKind || '—'], ['תאריך אירוע', cur.eventDate || '—'], ['תאריך פתיחה', cur.createdAt || '—'],
                    ['סטטוס טיפול', cur.status], ['מטפל', cur.assigned_to_name || '—'], ['חברת ביטוח', cur.insCompany || '—'],
                    ['מספר פוליסה', cur.policyNum || '—'], ['שמאי', cur.surveyor || '—'],
                    ['טיפול אחרון', fmtDay(cur.lastTreatmentAt || '')], ['טיפול הבא', fmtDay(cur.nextDate || '')],
                    ['נדרשת פעולה', returnNeededLabel(cur)],
                    ['מצב מסמכים', docsOrderLabel(docsOrderOf(cur)) || '—'],
                    ['פעולה הבאה', cur.nextAction || '—'], ['עודכן ע״י', cur.updatedByName || '—']].map((f) => (
                      <div key={f[0]}><div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{f[0]}</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{f[1]}</div></div>
                    ))}
                </div>
              )}
              {cardTab === 'client' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 11 }}>
                  {[['שם לקוח', cur.clientName], ['טלפון', cur.clientPhone || '—'], ['אימייל', cur.clientEmail || '—']].map((f) => (
                    <div key={f[0]}><div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{f[0]}</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{f[1]}</div></div>
                  ))}
                </div>
              )}
              {cardTab === 'vehicle' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 11 }}>
                  {[['מספר רישוי', cur.plate || '—'], ['דגם', cur.carModel || '—'], ['חברה/לקוח', cur.company_name || '—'], ['רכב במערכת', cur.vehicle_id ? 'משויך' : 'לא משויך']].map((f) => (
                    <div key={f[0]}><div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{f[0]}</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{f[1]}</div></div>
                  ))}
                </div>
              )}
              {cardTab === 'treat' && (
                <>
                  <div className="work-entry-bar" data-testid="work-entry-bar">
                    <button type="button" className="btn btn-p btn-sm" onClick={() => openTreat(cur.treatmentPendingAction || treatAction || 'עדכון טיפול', { sendOk: treatSendOk })}>עדכון טיפול</button>
                    <button type="button" className="btn btn-g btn-sm" data-testid="work-cust-request" onClick={() => openCustomerRequest()}>בקשה ללקוח</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => setCardTab('tasks')}>משימות ({tasks.length})</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => setCardTab('rems')}>תזכורות ({reminders.length})</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => setCardTab('mailfu')}>מעקב מייל ({mailFollowups.length})</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 11, marginBottom: 12 }}>
                    {([['סטטוס טיפול', cur.status], ['טיפול אחרון', fmtDay(cur.lastTreatmentAt || '')], ['טיפול הבא', fmtDay(cur.nextDate || '')], ['נדרשת פעולה', returnNeededLabel(cur)], ['הערות טיפול', cur.notes || '—']] as Array<[string, string]>)
                      .concat(cur.claimKind === 'תביעת צד ג׳' ? [['צד ג׳', cur.thirdParty || '—'], ['רכב צד ג׳', cur.thirdPlate || '—']] : [])
                      .map((f) => (
                      <div key={f[0]}><div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{f[0]}</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{f[1]}</div></div>
                    ))}
                  </div>
                  <div className="fg" style={{ marginBottom: 12 }}>
                    <label className="fl">מצב סדר מסמכים</label>
                    <select className="fse fi" data-testid="docs-order-select" value={docsOrderOf(cur) || ''} onChange={async (e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const r = await apiRef.current.setDocsOrderStatus(cur.id, v);
                      if (!r.success) { toast(String(r.error || 'שמירה נכשלה'), 'err'); return; }
                      await loadAll();
                      await loadCardData(cur.id);
                      toast('מצב המסמכים עודכן');
                    }}>
                      <option value="">— לא סומן —</option>
                      {DOCS_ORDER.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                  </div>
                  <div className="sdiv"><div className="sdiv-t">תקשורת והערות</div><div className="sdiv-l" /></div>
                  {comm.length === 0 ? <div className="empty">אין תקשורת מתועדת</div>
                    : comm.map((e) => (
                      <div key={e.id} className={`comm-item ${e.type || ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700 }}>{e.type}</span>
                          <span style={{ fontSize: 10, color: 'var(--t3)' }}>{e.at} · {e.by || ''}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>{e.body || e.note || ''}</div>
                      </div>
                    ))}
                </>
              )}
              {cardTab === 'surveyor' && (() => {
                const pack = surveyorBundle(docs.files);
                const report = pack.reports[0];
                const meta = report ? fileMeta(report) : {};
                const untaggedPhotos = pack.photos.length === 0 ? docs.files.filter(isImageFile) : [];
                return (
                  <div>
                    <div className="sdiv"><div className="sdiv-t">דוח שמאי · {docs.files.length} קבצים בתיק</div><div className="sdiv-l" /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 11, marginBottom: 12 }}>
                      {[['מספר רכב', cur.plate || '—'], ['מספר תביעה', displayClaimNum(cur)], ['תאריך אירוע', cur.eventDate || '—'],
                        ['שם שמאי', meta.surveyorName || cur.surveyor || '—'], ['תאריך הדוח', meta.reportDate || '—'], ['מספר דוח', meta.reportNumber || '—']].map((f) => (
                        <div key={f[0]}><div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{f[0]}</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{f[1]}</div></div>
                      ))}
                    </div>
                    {pack.reports.length === 0 && pack.photos.length === 0 && pack.attachments.length === 0 && untaggedPhotos.length === 0 ? (
                      <div className="spec-empty">אין דוח שמאי מסומן בתיק. העלה את הדוח כאן, או סמן מסמך קיים כלשונית «מסמכים» כדוח שמאי. הקובץ נשמר פעם אחת בלבד.</div>
                    ) : null}
                    {pack.reports.length === 0 && pack.photos.length === 0 && untaggedPhotos.length > 0 ? (
                      <div className="spec-empty">אין קובץ שסומן כדוח שמאי. מוצגות {untaggedPhotos.length} תמונות שכבר שמורות בתיק (לשונית מסמכים) — בלי שינוי סיווג ובלי עותק חדש.</div>
                    ) : null}
                    {pack.reports.length === 0 && pack.photos.length > 0 ? (
                      <div className="spec-empty">אין קובץ דוח PDF מסומן. מוצגות {pack.photos.length} תמונות שמאי שכבר יובאו לתיק — בלי עותק חדש.</div>
                    ) : null}
                    {pack.reports.map((f) => (
                      <div key={f.id} className="gal-box" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{f.original_name} <span className="kind-pill surveyor">דוח שמאי</span></div>
                          <div style={{ fontSize: 11, color: 'var(--t3)' }}>{sourceHe(f.source)} · {fmtBytes(Number(f.byte_size || 0))}</div>
                        </div>
                        <button className="btn btn-p btn-sm" onClick={() => void openInCard(cur.id, f)}>פתח בתיק</button>
                      </div>
                    ))}
                    <InCardPreview file={previewFile} onClose={() => setPreviewFile(null)} />
                    {report ? (
                      <div key={`${report.id}:${meta.surveyorName}:${meta.reportDate}:${meta.reportNumber}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8, margin: '10px 0 14px' }}>
                        <input className="fi" id="surv_meta_name" defaultValue={meta.surveyorName || cur.surveyor || ''} placeholder="שם שמאי בדוח" />
                        <input className="fi" id="surv_meta_date" type="date" defaultValue={meta.reportDate || ''} />
                        <input className="fi" id="surv_meta_num" defaultValue={meta.reportNumber || ''} placeholder="מספר דוח" />
                        <button className="btn btn-g btn-sm" onClick={() => void markDocKind(cur.id, report.id, 'surveyor_report', {
                          surveyorName: val(null, 'surv_meta_name'),
                          reportDate: val(null, 'surv_meta_date'),
                          reportNumber: val(null, 'surv_meta_num'),
                        })}>שמור פרטי דוח</button>
                      </div>
                    ) : null}
                    {pack.photos.length ? (
                      <>
                        <div className="sdiv"><div className="sdiv-t">תמונות הדוח ({pack.photos.length})</div><div className="sdiv-l" /></div>
                        <div className="gal-grid">
                          {pack.photos.map((f) => (
                            <button key={f.id} className="gal-item" title={f.original_name} onClick={() => void openInCard(cur.id, f)}>
                              {galleryUrls[f.id] ? <img src={galleryUrls[f.id]} alt={f.original_name} /> : <span>{f.original_name}</span>}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {untaggedPhotos.length ? (
                      <>
                        <div className="sdiv"><div className="sdiv-t">תמונות בתיק ({untaggedPhotos.length})</div><div className="sdiv-l" /></div>
                        <div className="gal-grid">
                          {untaggedPhotos.map((f) => (
                            <button key={f.id} className="gal-item" title={f.original_name} onClick={() => void openInCard(cur.id, f)}>
                              {galleryUrls[f.id] ? <img src={galleryUrls[f.id]} alt={f.original_name} /> : <span>{f.original_name}</span>}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {pack.attachments.length ? (
                      <>
                        <div className="sdiv"><div className="sdiv-t">קבצים שהגיעו עם הדוח</div><div className="sdiv-l" /></div>
                        {pack.attachments.map((f) => (
                          <div key={f.id} className="gal-box" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <div>
                              <div style={{ fontWeight: 600 }}>{f.original_name}</div>
                              <div style={{ fontSize: 10, color: 'var(--t3)' }}>{fmtBytes(Number(f.byte_size || 0))}</div>
                            </div>
                            <button className="btn btn-g btn-sm" onClick={() => void openInCard(cur.id, f)}>פתח בתיק</button>
                          </div>
                        ))}
                      </>
                    ) : null}
                    <label className="btn btn-p btn-sm" style={{ marginTop: 10 }}>העלאת דוח שמאי
                      <input type="file" hidden accept="application/pdf,image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const up = await apiRef.current.staffUpload(cur.id, '', file, { doc_kind: (file.type || '').startsWith('image/') ? 'surveyor_photo' : 'surveyor_report' });
                        if (!up.success) { toast(up.error || 'העלאה נכשלה', 'err'); return; }
                        await loadCardData(cur.id);
                        toast('דוח שמאי הועלה');
                      }} />
                    </label>
                  </div>
                );
              })()}
              {cardTab === 'invoice' && (() => {
                const list = invoiceFiles(docs.files);
                return (
                  <div>
                    <div className="sdiv"><div className="sdiv-t">חשבונית מוסך</div><div className="sdiv-l" /></div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>קיצור דרך לאותו קובץ שמופיע גם במסמכים. אין שכפול קובץ.</div>
                    {list.length === 0 ? (
                      <div className="spec-empty">לא נמצאה חשבונית מוסך בתיק</div>
                    ) : list.map((f) => {
                      const meta = fileMeta(f);
                      return (
                        <div key={f.id} className="gal-box">
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 800 }}>{f.original_name} <span className="kind-pill invoice">חשבונית מוסך</span></div>
                              <div style={{ fontSize: 11, color: 'var(--t3)' }}>{sourceHe(f.source)} · {fmtBytes(Number(f.byte_size || 0))}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-p btn-sm" onClick={() => void openInCard(cur.id, f)}>צפייה בתיק</button>
                              <button className="btn btn-g btn-sm" onClick={async () => {
                                const r = await apiRef.current.invokeDocs('signed_url', { claim_id: cur.id, file_id: f.id });
                                if (r.url) window.open(String(r.url), '_blank');
                              }}>הורדה</button>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 11, marginTop: 10 }}>
                            {[['תאריך חשבונית', meta.invoiceDate || '—'], ['סכום', meta.invoiceAmount || '—'], ['שם המוסך', meta.garageName || '—']].map((row) => (
                              <div key={row[0]}><div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 700 }}>{row[0]}</div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{row[1]}</div></div>
                            ))}
                          </div>
                          <div key={`meta-${f.id}-${meta.invoiceDate}-${meta.invoiceAmount}-${meta.garageName}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8, marginTop: 10 }}>
                            <input className="fi" id={`inv_date_${f.id}`} type="date" defaultValue={meta.invoiceDate || ''} />
                            <input className="fi" id={`inv_amt_${f.id}`} defaultValue={meta.invoiceAmount || ''} placeholder="סכום" />
                            <input className="fi" id={`inv_gar_${f.id}`} defaultValue={meta.garageName || ''} placeholder="שם המוסך" />
                            <button className="btn btn-g btn-sm" onClick={() => void markDocKind(cur.id, f.id, 'garage_invoice', {
                              invoiceDate: val(null, `inv_date_${f.id}`),
                              invoiceAmount: val(null, `inv_amt_${f.id}`),
                              garageName: val(null, `inv_gar_${f.id}`),
                            })}>שמור פרטי חשבונית</button>
                          </div>
                        </div>
                      );
                    })}
                    <InCardPreview file={previewFile} onClose={() => setPreviewFile(null)} />
                    {cur.plate ? <div style={{ fontSize: 12, color: 'var(--t3)', margin: '8px 0' }}>רכב בתיק: {cur.plate}{cur.carModel ? ` · ${cur.carModel}` : ''} — המסמך נשמר בתיק התביעה בלבד, לא במודול Vehicles.</div> : null}
                    <StaffUploadZone
                      testId="invoice-drop"
                      inputId="invoice_staff_files"
                      addLabel="＋ הוסף חשבונית"
                      busy={docsUploading}
                      onFiles={(files) => { void uploadStaffFiles(cur.id, files, false, { doc_kind: 'garage_invoice' }); }}
                    />
                  </div>
                );
              })()}
              {cardTab === 'docs' && (
                <div>
                  {(() => {
                    const statuses = CLAIM_DOC_TYPES.map((t) => ({ t, st: docTypeStatus(t, docs.files, docs.requests, hasUploadLink), files: filesForDocType(t, docs.files, docs.requests) }));
                    const present = statuses.filter((x) => x.st.key === 'exists' || x.st.key === 'received').length;
                    const missing = statuses.filter((x) => x.st.key === 'missing').length;
                    const waiting = statuses.filter((x) => x.st.key === 'waiting' || x.st.key === 'needed').length;
                    return (
                      <div className="doc-sum" data-testid="docs-summary">
                        <b>{present} מתוך {CLAIM_DOC_TYPES.length} קיימים</b>
                        <span>{missing} חסרים</span>
                        <span>{waiting} ממתינים ללקוח</span>
                        <span className="doc-sum-hold" data-testid="docs-mandatory-hold">מסמכי חובה: לא הוגדרו (ממתין לאישור ארכיטקטורה)</span>
                      </div>
                    );
                  })()}
                  <div className="cust-ask" data-testid="cust-ask-panel">
                    {hasUploadLink ? (
                      <div className="cust-link-card" data-testid="cust-link-card">
                        <div className="cust-link-title">קישור פעיל ללקוח</div>
                        <div className="cust-link-meta">נוצר: {uploadLinkMeta?.created_at ? new Date(uploadLinkMeta.created_at).toLocaleString('he-IL') : '—'}</div>
                        <div className="cust-link-meta">תוקף עד: {uploadLinkMeta?.expires_at ? new Date(uploadLinkMeta.expires_at).toLocaleString('he-IL') : '—'} · 24 שעות</div>
                        <div className="cust-link-meta">ביקשנו: {docs.requests.filter((r) => r.status === 'requested' || r.status === 'received').map((r) => r.label).join(', ') || '—'}</div>
                        <div className="cust-link-meta">הלקוח העלה: {docs.requests.filter((r) => r.status === 'received').length} מתוך {docs.requests.filter((r) => r.status === 'requested' || r.status === 'received').length}</div>
                        {linkUrl ? (
                          <div className="cust-link-url" data-testid="cust-link-url">{linkUrl}</div>
                        ) : linkReconstructable ? (
                          <div className="cust-link-meta" data-testid="cust-link-url-loading">טוען כתובת קישור מהשרת…</div>
                        ) : (
                          <div className="cust-link-warn" data-testid="cust-link-url-missing">קישור ישן (לפני שחזור מהשרת). העתקה ממכשיר זה דורשת קישור חדש — הישן יבוטל.</div>
                        )}
                        <div className="cust-link-acts">
                          <button type="button" className="btn btn-p btn-sm" data-testid="cust-link-copy" disabled={!linkUrl && !linkReconstructable} onClick={() => { void (async () => { const url = await ensureCustomerLinkUrl(cur.id); if (url) await copyCustomerLink(url); else toast('אין קישור להעתקה — הנפיקו קישור חדש', 'err'); })(); }}>העתק קישור</button>
                          <button type="button" className="btn btn-g btn-sm" data-testid="cust-link-open" disabled={!linkUrl && !linkReconstructable} onClick={() => { void (async () => { const url = await ensureCustomerLinkUrl(cur.id); if (url) window.open(url, '_blank', 'noopener'); else toast('אין קישור לפתיחה — הנפיקו קישור חדש', 'err'); })(); }}>פתח קישור</button>
                          <button type="button" className="btn btn-g btn-sm" data-testid="cust-link-share" disabled={!linkUrl && !linkReconstructable} onClick={() => { void shareCustomerLink(cur.id, cur.clientName || '', displayClaimNum(cur)); }}>שתף קישור</button>
                          <button type="button" className="btn btn-g btn-sm" data-testid="cust-link-wa" disabled={!linkUrl && !linkReconstructable} onClick={() => {
                            void (async () => {
                              const url = await ensureCustomerLinkUrl(cur.id);
                              if (!url) { toast('אין קישור ל-WhatsApp — הנפיקו קישור חדש', 'err'); return; }
                              const msg = `שלום${cur.clientName ? ` ${cur.clientName}` : ''}, לצורך תביעה ${displayClaimNum(cur)} נבקש להעלות מסמכים בקישור:\n${url}`;
                              setModal('moWA');
                              window.setTimeout(() => setVal('wa_msg', msg), 50);
                            })();
                          }}>WhatsApp עם הקישור</button>
                          <button type="button" className="btn btn-sm" data-testid="cust-link-revoke" style={{ background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={() => { void revokeCustomerLink(cur.id); }}>בטל קישור</button>
                          <button type="button" className="btn btn-g btn-sm" data-testid="cust-link-rotate" onClick={async () => { setAskBusy(true); try { await mintCustomerLink(cur.id, true); } finally { setAskBusy(false); } }}>צור קישור חדש</button>
                        </div>
                        <div className="cust-link-note">אין שליחה אוטומטית. שיתוף במכשיר נפתח רק אחרי לחיצה. WhatsApp נפתח רק אחרי לחיצה — בלי Auto Send.</div>
                      </div>
                    ) : (
                      <div className="cust-link-empty" data-testid="cust-link-empty">אין קישור פעיל. סמנו מסמכים ולחצו «צור קישור ללקוח».</div>
                    )}
                    <button type="button" className="btn btn-p" data-testid="cust-ask-open" onClick={() => {
                      setAskKeys(CLAIM_DOC_TYPES.filter((x) => catalogInRequests(docs.requests, x)).map((x) => x.key));
                      setAskOpen((v) => !v);
                    }}>{askOpen ? 'סגור בחירת מסמכים' : 'בקש מסמכים מהלקוח'}</button>
                    {askOpen ? (
                      <div className="cust-ask-box" data-testid="cust-ask-list">
                        <div className="cust-ask-h">סמנו רק מה שחסר מהלקוח. אין שליחה אוטומטית.</div>
                        {CLAIM_DOC_TYPES.map((t) => (
                          <label key={t.key} className="cust-ask-item">
                            <input
                              type="checkbox"
                              data-testid={`cust-ask-pick-${t.key}`}
                              checked={askKeys.includes(t.key)}
                              onChange={(e) => setAskKeys((prev) => e.target.checked ? [...new Set([...prev, t.key])] : prev.filter((k) => k !== t.key))}
                            />
                            <span>{t.label}{t.formLater ? ' · טופס קבוע בהמשך' : ''}{t.group ? ' · כמה קבצים' : ''}</span>
                          </label>
                        ))}
                        <button
                          type="button"
                          className="btn btn-p"
                          data-testid="cust-ask-create"
                          disabled={askBusy}
                          onClick={async () => {
                            if (!askKeys.length && extraDocRequests(docs.requests).length === 0) {
                              toast('סמנו לפחות מסמך אחד', 'err');
                              return;
                            }
                            setAskBusy(true);
                            try {
                              const saved = await saveAskSelection(cur.id, askKeys);
                              if (!saved.success) { toast(saved.error, 'err'); return; }
                              await mintCustomerLink(cur.id, false);
                              setAskOpen(false);
                            } finally {
                              setAskBusy(false);
                            }
                          }}
                        >{hasUploadLink && (linkUrl || linkReconstructable) ? 'שמור בקשה · יש קישור פעיל' : 'צור קישור ללקוח'}</button>
                      </div>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>סמנו מה לבקש מהלקוח. העלאה נשמרת במאגר התביעה בלבד. לא מנחשים סוג לפי שם קובץ.</div>
                  <div className="doc-type-list" data-testid="claim-doc-types">
                    {CLAIM_DOC_TYPES.map((t) => {
                      const matched = filesForDocType(t, docs.files, docs.requests);
                      const st = docTypeStatus(t, docs.files, docs.requests, hasUploadLink);
                      const requested = catalogInRequests(docs.requests, t);
                      const extra = t.key === 'surveyor_photos'
                        ? { doc_kind: 'surveyor_photo' as const }
                        : (t.docKind ? { doc_kind: t.docKind, staff_type: t.staffType || undefined } : { staff_type: t.staffType || undefined });
                      return (
                        <div key={t.key} className="doc-type-row" data-testid={`claim-doc-type-${t.key}`}>
                          <label className="doc-type-ask">
                            <input
                              type="checkbox"
                              data-testid={`claim-doc-ask-${t.key}`}
                              checked={requested}
                              onChange={async (e) => {
                                const want = e.target.checked;
                                const extras = extraDocRequests(docs.requests).map((r) => ({ label: r.label, doc_key: r.doc_key || 'custom' }));
                                const current = CLAIM_DOC_TYPES.filter((x) => catalogInRequests(docs.requests, x)).map((x) => x.key);
                                const keys = want ? [...new Set([...current, t.key])] : current.filter((k) => k !== t.key);
                                await apiRef.current.invokeDocs('save_doc_requests', {
                                  claim_id: cur.id,
                                  items: [
                                    ...CLAIM_DOC_TYPES.filter((x) => keys.includes(x.key)).map((x) => ({ label: x.label, doc_key: x.key })),
                                    ...extras,
                                  ],
                                });
                                await loadCardData(cur.id);
                              }}
                            />
                            <span>בקש מהלקוח</span>
                          </label>
                          <div className="doc-type-main">
                            <div className="doc-type-name">
                              {st.key === 'exists' || st.key === 'received' ? '✓ ' : st.key === 'waiting' || st.key === 'needed' ? '⏳ ' : '○ '}
                              {t.label}
                              {t.group ? ` — ${matched.length} קבצים` : null}
                            </div>
                            <div className={`doc-type-st st-${st.key}`} data-testid={`claim-doc-status-${t.key}`}>{st.label}</div>
                          </div>
                          <div className="doc-type-acts">
                            <label className="btn btn-g btn-sm">העלה מסמך
                              <input
                                type="file"
                                hidden
                                multiple={t.group}
                                accept="application/pdf,image/*"
                                data-testid={`claim-doc-upload-${t.key}`}
                                onChange={async (e) => {
                                  const list = Array.from(e.target.files || []);
                                  e.target.value = '';
                                  if (!list.length) return;
                                  await uploadStaffFiles(cur.id, list, false, extra);
                                }}
                              />
                            </label>
                            {matched.length ? (
                              <button type="button" className="btn btn-p btn-sm" onClick={() => {
                                const first = matched[0];
                                if (t.group) {
                                  setOpenGal((p) => ({ ...p, [`type:${t.key}`]: !p[`type:${t.key}`] }));
                                  void loadGalleryThumbs(cur.id, matched.filter(isImageFile));
                                } else void openInCard(cur.id, first);
                              }}>{t.group ? (openGal[`type:${t.key}`] ? 'הסתר גלריה' : 'פתח גלריה') : 'צפייה'}</button>
                            ) : null}
                            <button type="button" className="btn btn-g btn-sm" disabled title="שמירת טופס קבוע דורשת אישור ארכיטקטורה — אין טבלה/Bucket חדשים">העלה טופס קבוע</button>
                          </div>
                          {t.group && openGal[`type:${t.key}`] && matched.length ? (
                            <div className="gal-grid" data-testid={`claim-doc-gal-${t.key}`}>
                              {matched.filter(isImageFile).map((f) => (
                                <button key={f.id} className="gal-item" title={f.original_name} onClick={() => void openInCard(cur.id, f)}>
                                  {galleryUrls[f.id] ? <img src={galleryUrls[f.id]} alt={f.original_name} /> : <span>{f.original_name}</span>}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
                    <input className="fi" placeholder="מסמך נוסף..." value={customDoc} onChange={(e) => setCustomDoc(e.target.value)} />
                    <button className="btn btn-p btn-sm" onClick={async () => {
                      if (!customDoc.trim()) return;
                      const extras = extraDocRequests(docs.requests).map((r) => ({ label: r.label, doc_key: r.doc_key || 'custom' }));
                      const keys = CLAIM_DOC_TYPES.filter((x) => catalogInRequests(docs.requests, x)).map((x) => x.key);
                      await apiRef.current.invokeDocs('save_doc_requests', {
                        claim_id: cur.id,
                        items: [
                          ...CLAIM_DOC_TYPES.filter((x) => keys.includes(x.key)).map((x) => ({ label: x.label, doc_key: x.key })),
                          ...extras,
                          { label: customDoc.trim(), doc_key: 'custom' },
                        ],
                      });
                      setCustomDoc('');
                      await loadCardData(cur.id);
                    }}>הוסף</button>
                  </div>
                  {extraDocRequests(docs.requests).map((d) => (
                    <div key={d.id} style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px', marginBottom: 7, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{d.label}</div>
                        <div style={{ fontSize: 11, color: d.status === 'received' ? 'var(--gn2)' : 'var(--yn2)' }}>{d.status === 'received' ? `התקבל${d.received_at ? ` · ${new Date(d.received_at).toLocaleString('he-IL')}` : ''}` : d.status === 'missing' ? 'חסר' : 'התבקש'}</div>
                      </div>
                      <label className="btn btn-g btn-sm">העלאה
                        <input type="file" hidden accept="application/pdf,image/*" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const up = await apiRef.current.staffUpload(cur.id, d.id, file);
                          if (!up.success) { toast(up.error || 'העלאה נכשלה', 'err'); return; }
                          await loadCardData(cur.id);
                          toast('מסמך הועלה');
                        }} />
                      </label>
                    </div>
                  ))}
                  <div className="sdiv"><div className="sdiv-t">מאגר מסמכי התביעה</div><div className="sdiv-l" /></div>
                  <StaffUploadZone
                    testId="docs-drop"
                    inputId="docs_staff_files"
                    busy={docsUploading}
                    onFiles={(files) => { if (cur) void uploadStaffFiles(cur.id, files); }}
                  />
                  <InCardPreview file={previewFile} onClose={() => setPreviewFile(null)} />
                  <div className="sdiv"><div className="sdiv-t">קבצים שהתקבלו ({docs.files.length})</div><div className="sdiv-l" /></div>
                  {docs.files.length === 0 ? <div style={{ color: 'var(--t3)' }}>אין קבצים עדיין</div>
                    : Object.entries(docs.files.reduce((acc: Record<string, ClaimFile[]>, f) => {
                      const k = f.source === 'gmail' && f.gmail_message_id ? `gmail:${f.gmail_message_id}` : `one:${f.id}`;
                      (acc[k] = acc[k] || []).push(f);
                      return acc;
                    }, {})).map(([k, group]) => {
                      const isGal = k.startsWith('gmail:');
                      const mid = isGal ? k.slice(6) : '';
                      const imp = gmailImports.find((im) => String(im.gmail_message_id) === mid);
                      const photos = group.filter((f) => classifyDoc(f) === 'photos');
                      const rest = group.filter((f) => classifyDoc(f) !== 'photos');
                      const preview = openGal[k] ? photos : photos.slice(0, 8);
                      return (
                        <div key={k} className="gal-box">
                          {isGal ? (
                            <div>
                              <div style={{ fontWeight: 800, marginBottom: 4 }}>גלריה ממייל · {group.length} קבצים</div>
                              {imp ? <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 6 }}>{String(imp.subject || '')} · {String(imp.from_addr || '')}</div> : null}
                              {imp && String(imp.body_text || '').trim().length > 2 ? (
                                <pre className="mail-body">{String(imp.body_text)}</pre>
                              ) : <div style={{ color: 'var(--yn2)', fontSize: 12 }}>המייל התקבל ללא טקסט בגוף — רק מצורפים.</div>}
                              <button className="btn btn-g btn-sm" style={{ marginBottom: 8 }} onClick={async () => {
                                setOpenGal((p) => ({ ...p, [k]: !p[k] }));
                                if (!openGal[k] && cur) await loadGalleryThumbs(cur.id, photos);
                              }}>{openGal[k] ? 'הסתר גלריה' : `הצג גלריה (${photos.length} תמונות)`}</button>
                            </div>
                          ) : null}
                          {isGal && photos.length ? (
                            <div className="gal-grid">
                              {preview.map((f) => (
                                <button key={f.id} className="gal-item" title={f.original_name} onClick={() => void openInCard(cur.id, f)}>
                                  {galleryUrls[f.id]
                                    ? <img src={galleryUrls[f.id]} alt={f.original_name} />
                                    : <span>{f.original_name}</span>}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {(isGal ? rest : group).map((f) => {
                            const knd = effectiveKind(f);
                            const img = isImageFile(f);
                            return (
                            <div key={f.id} style={{ marginTop: 6 }} data-testid="doc-file-row" data-doc-name={f.original_name}>
                              <div style={{ minWidth: 140, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                                {img ? (
                                  <button type="button" className="pick-thumb" data-testid="doc-thumb" title={f.original_name} onClick={() => void openInCard(cur.id, f)}>
                                    {galleryUrls[f.id] ? <img src={galleryUrls[f.id]} alt={f.original_name} /> : <span>📷</span>}
                                  </button>
                                ) : null}
                                <div>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>
                                  {fileLabel(f)}
                                  {kindHe(knd) ? <span className={`kind-pill ${knd === 'garage_invoice' ? 'invoice' : 'surveyor'}`}>{kindHe(knd)}</span> : null}
                                  {fileMeta(f).staff_type ? <span className="kind-pill">{staffTypeLabel(fileMeta(f).staff_type)}</span> : <span className="kind-pill">לא סווג</span>}
                                  {fileMeta(f).important === 'true' ? <span className="kind-pill surveyor">חשוב</span> : null}
                                  {fileMeta(f).doc_status ? <span className="kind-pill">{statusLabel(fileMeta(f).doc_status)}</span> : null}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{sourceHe(f.source)} · {fmtBytes(Number(f.byte_size || 0))} · {f.original_name}</div>
                                {fileMeta(f).related_file_id ? (() => {
                                  const rel = docs.files.find((x) => x.id === fileMeta(f).related_file_id);
                                  return rel ? <div style={{ fontSize: 11, color: 'var(--t2)' }}>קשור למסמך: {fileLabel(rel)}</div> : null;
                                })() : null}
                                {fileMeta(f).staff_note ? <div style={{ fontSize: 11, color: 'var(--t2)' }}>הערה: {fileMeta(f).staff_note}</div> : null}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {knd !== 'surveyor_report' ? <button className="btn btn-g btn-sm" onClick={() => void markDocKind(cur.id, f.id, 'surveyor_report')}>סמן כדוח שמאי</button> : null}
                                {knd !== 'garage_invoice' ? <button className="btn btn-g btn-sm" onClick={() => void markDocKind(cur.id, f.id, 'garage_invoice')}>סמן כחשבונית מוסך</button> : null}
                                {f.doc_kind && f.doc_kind !== 'general' ? <button className="btn btn-g btn-sm" onClick={() => void markDocKind(cur.id, f.id, 'general')}>בטל סימון</button> : null}
                                <button className="btn btn-g btn-sm" data-testid="doc-view" onClick={() => void openInCard(cur.id, f)}>צפייה</button>
                                <button className="btn btn-g btn-sm" data-testid={`doc-edit-${f.id}`} onClick={() => setDocEditId(docEditId === f.id ? null : f.id)}>שם / סוג</button>
                              </div>
                              </div>
                              {docEditId === f.id ? <DocStaffFields file={f} allFiles={docs.files} onSave={async (patch) => { await saveDocStaff(f, patch); toast('פרטי המסמך נשמרו'); }} /> : null}
                            </div>
                            );
                          })}
                          {!isGal ? null : photos.length && !openGal[k] ? <div style={{ fontSize: 11, color: 'var(--t3)' }}>{photos.length} תמונות מקובצות — לחץ להצגת גלריה</div> : null}
                        </div>
                      );
                    })}
                  <div style={{ marginTop: 14, fontSize: 12, color: 'var(--t3)' }}>ניהול הקישור ללקוח נמצא בראש אזור המסמכים.</div>
                </div>
              )}
              {cardTab === 'gin' && (
                <div>
                  <div className="mail-entry-bar" data-testid="mail-entry-bar">
                    <button type="button" className="btn btn-p btn-sm" onClick={() => { void openSendModal('draft'); }}>מייל חדש</button>
                    <button type="button" className="btn btn-p btn-sm" data-testid="mail-cust-request" onClick={() => openCustomerRequest()}>בקשה ללקוח</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => { void openSendModal('insurer'); }}>לחברת ביטוח</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => { void openSendModal('legal'); }}>טיפול משפטי</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => { void startGmailImport(); }}>ייבוא Gmail</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => openMailFollowupModal(null)}>מעקב מייל</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => setModal('moCall')}>שיחה</button>
                    <button type="button" className="btn btn-g btn-sm" onClick={() => { setVal('wa_msg', `שלום, בהמשך לתביעה ${displayClaimNum(cur)}`); setModal('moWA'); }}>WhatsApp</button>
                  </div>
                  <div className="sdiv" data-testid="mail-correspondence"><div className="sdiv-t">התכתבויות ({gmailImports.length})</div><div className="sdiv-l" /></div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>מסודר כרונולוגית לפי תאריך המייל. Thread אחד מתחת לשני. אין ייבוא נוסף מכאן אלא אם תבחר מייל חדש למטה.</div>
                  {gmailImports.length === 0 ? <div style={{ color: 'var(--t3)' }}>{mailListLoading || gmailBusy ? 'טוען מיילים…' : 'אין מיילים יובאים בתיק'}</div>
                    : correspondenceThreads(gmailImports).map((group) => (
                      <div key={group.thread} className="thread-box">
                        <div className="thread-h">Thread · {group.thread} · {group.mails.length} מיילים</div>
                        {group.mails.map((im) => {
                          const mid = String(im.gmail_message_id || '');
                          const attached = docs.files.filter((f) => f.gmail_message_id && f.gmail_message_id === mid);
                          const photos = attached.filter((f) => isImageFile(f));
                          const rest = attached.filter((f) => !isImageFile(f));
                          return (
                            <div key={String(im.id)} className="gmail-card">
                              <div style={{ fontWeight: 800, marginBottom: 6 }}>{String(im.subject || '(ללא נושא)')}</div>
                              {mailShowsTreatment(String(im.from_addr || ''), OWN_MAILBOX, `${im.subject || ''}\n${im.body_text || ''}`) ? (
                                <div className="mail-need" data-testid={`mail-need-${im.id}`}>
                                  <div className="row-alert tone-need">נדרש טיפול</div>
                                  {(() => {
                                    const detected = detectMailRequests(`${im.subject || ''}\n${im.body_text || ''}`);
                                    const mailTasks = tasks.filter((t) => t.gmailMessageId === mid);
                                    if (!detected.length && !mailTasks.length) return <div style={{ fontSize: 12, marginTop: 6 }}>מייל נכנס שויך לתיק. אין שליחה אוטומטית — הכינו טיוטה ידנית.</div>;
                                    return (
                                      <div style={{ marginTop: 6 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>זוהתה בקשה:</div>
                                        {detected.map((d) => {
                                          if (!isDocMailRequest(d.kind)) {
                                            return (
                                              <div key={d.type} style={{ fontSize: 12, marginBottom: 3 }}>
                                                {d.label}
                                              </div>
                                            );
                                          }
                                          const readyTask = mailTasks.find((t) => t.action === d.label && t.docState === 'ready');
                                          const missingTask = mailTasks.find((t) => t.action === d.label && (t.docState === 'missing' || t.docState === 'needs_review'));
                                          const typeHit = docs.files.some((f) => {
                                            const st = fileMeta(f).staff_type;
                                            const kind = String(f.doc_kind || '');
                                            if (d.label.includes('שמאי') && (kind === 'surveyor_report' || kind === 'surveyor_attachment')) return true;
                                            if (d.label.includes('חשבונית') && kind === 'garage_invoice') return true;
                                            if (d.label.includes('תמונ') && (kind === 'surveyor_photo' || st === 'damage_photos')) return true;
                                            if (st && staffTypeLabel(st) === d.label) return true;
                                            if (st && CLAIM_DOC_TYPES.some((t) => t.staffType === st && (t.label === d.label || (t.aliases || []).includes(d.label)))) return true;
                                            return false;
                                          });
                                          return (
                                            <div key={d.type} style={{ fontSize: 12, marginBottom: 3 }}>
                                              {d.label}
                                              {' · '}
                                              {readyTask || typeHit ? <span style={{ color: 'var(--gn2)' }}>קיים בתיק — ניתן לצרף לתגובה</span> : missingTask || !typeHit ? <span style={{ color: 'var(--rd2)' }}>נדרש טיפול / חסר מסמך</span> : <span style={{ color: 'var(--yn2)' }}>לבדיקת עובד</span>}
                                            </div>
                                          );
                                        })}
                                        {!detected.length ? mailTasks.map((t) => (
                                          <div key={t.id} style={{ fontSize: 12, marginBottom: 3 }}>{t.action}</div>
                                        )) : null}
                                        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>אין Auto-send. רק טיוטה לאישור ידני.</div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : null}
                              <div className="mail-meta">
                                <div><b>תאריך</b>{fmtWhen(String(im.sent_at || ''))}</div>
                                <div><b>From</b>{String(im.from_addr || '—')}</div>
                                <div><b>To</b>{String(im.to_addr || '—')}</div>
                                <div><b>CC</b>{String(im.cc_addr || '—')}</div>
                                <div><b>Thread</b>{String(im.gmail_thread_id || '—')}</div>
                                <div><b>Message</b>{mid || '—'}</div>
                              </div>
                              {String(im.body_text || '').trim().length > 2
                                ? <pre className="mail-body">{String(im.body_text)}</pre>
                                : <div style={{ color: 'var(--yn2)', fontSize: 12, margin: '6px 0' }}>גוף המייל ריק</div>}
                              <div className="fg" style={{ marginTop: 8 }}>
                                <label className="fl">הערה פנימית למייל זה</label>
                                <textarea className="fta" data-testid={`mail-note-${im.id}`} defaultValue={String(im.staff_note || '')} id={`imnote_${im.id}`} style={{ minHeight: 48 }} />
                                <div style={{ fontSize: 10, color: 'var(--t3)', margin: '4px 0' }}>פנימית בלבד — לא נשלחת החוצה.</div>
                                <button type="button" className="btn btn-g btn-sm" onClick={async () => {
                                  const note = (document.getElementById(`imnote_${im.id}`) as HTMLTextAreaElement | null)?.value || '';
                                  const r = await apiRef.current.invokeGmail('update_import_note', { claim_id: cur.id, import_id: im.id, staff_note: note });
                                  if (!r.success) { toast(String(r.error || 'שמירה נכשלה'), 'err'); return; }
                                  toast('הערה פנימית נשמרה');
                                  await loadCardData(cur.id);
                                }}>שמור הערה</button>
                                <button type="button" className="btn btn-p btn-sm" data-testid={`suggest-reply-${im.id}`} style={{ marginInlineStart: 6 }} onClick={async () => {
                                  const r = await apiRef.current.invokeGmail('suggest_reply', { claim_id: cur.id, import_id: im.id });
                                  if (!r.success) { toast(String(r.error || 'לא ניתן להכין תגובה'), 'err'); return; }
                                  const sug = (r.suggestion && typeof r.suggestion === 'object') ? r.suggestion as { ok?: boolean; reason?: string; missing?: string[]; attachments?: Array<{ id: string; original_name?: string }>; requested?: string[] } : {};
                                  const draft = (r.draft && typeof r.draft === 'object') ? r.draft as { to?: string; subject?: string; body?: string; file_ids?: string[]; thread_id?: string } : {};
                                  if (r.autoSend === true) { toast('שליחה אוטומטית חסומה', 'err'); return; }
                                  const detected = detectMailRequests(`${im.subject || ''}\n${im.body_text || ''}`);
                                  await apiRef.current.logHistory(cur.id, detected.length ? 'זוהתה בקשה' : 'נוצרה טיוטת תגובה', [sug.reason, (sug.requested || detected.map((d) => d.label)).join(', ')].filter(Boolean).join(' · '), 'mail_draft');
                                  if (detected.length && !sug.reason) await apiRef.current.logHistory(cur.id, 'נוצרה טיוטת תגובה', draft.subject || '', 'mail_draft');
                                  if (sug.missing?.length) toast(`חסר מסמך: ${sug.missing.join(', ')}`, 'err');
                                  else toast(String(sug.reason || 'תגובה מוצעת — לא נשלח'));
                                  setSuggestDraftBody(String(draft.body || ''));
                                  await openSendModal('draft', {
                                    to: String(draft.to || ''),
                                    subject: String(draft.subject || ''),
                                    body: String(draft.body || ''),
                                    file_ids: Array.isArray(draft.file_ids) ? draft.file_ids : [],
                                    thread_id: String(draft.thread_id || ''),
                                    missing: sug.missing || [],
                                  });
                                }}>תגובה מוצעת</button>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                  <button type="button" className="btn btn-p btn-sm" data-testid={`mail-reply-${im.id}`} onClick={() => openMailCompose(im, 'reply')}>השב</button>
                                  {(() => {
                                    const from = emailsFromHeader(String(im.from_addr || ''))[0] || '';
                                    const others = [...emailsFromHeader(String(im.to_addr || '')), ...emailsFromHeader(String(im.cc_addr || ''))]
                                      .filter((e) => e !== OWN_MAILBOX && e !== from);
                                    return others.length ? (
                                      <button type="button" className="btn btn-g btn-sm" data-testid={`mail-reply-all-${im.id}`} onClick={() => openMailCompose(im, 'replyAll')}>השב לכולם</button>
                                    ) : null;
                                  })()}
                                  <button type="button" className="btn btn-g btn-sm" data-testid={`mail-forward-${im.id}`} onClick={() => openMailCompose(im, 'forward')}>העבר</button>
                                </div>
                              </div>
                              {tasks.filter((t) => t.gmailMessageId === mid).length ? (
                                <div data-testid={`mail-tasks-${im.id}`} style={{ fontSize: 12, margin: '8px 0', background: 'var(--bg2)', border: '1px dashed var(--br2)', borderRadius: 7, padding: 8 }}>
                                  <div style={{ fontWeight: 700, marginBottom: 4 }}>משימות שנוצרו מהמייל</div>
                                  {tasks.filter((t) => t.gmailMessageId === mid).map((t) => (
                                    <div key={t.id} style={{ marginBottom: 4 }}>
                                      {t.action} · {workStatusHe(t.workStatus || 'open')} · {docStateHe(t.docState)}
                                      <button type="button" className="btn btn-g btn-sm" style={{ marginInlineStart: 6 }} onClick={() => setCardTab('tasks')}>למשימה</button>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {attached.length ? (
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 700, margin: '8px 0 4px' }}>קבצים מצורפים ({attached.length})</div>
                                  {rest.map((f) => (
                                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                                      <span style={{ fontSize: 12 }}>{f.original_name}</span>
                                      <button className="btn btn-g btn-sm" onClick={() => void openInCard(cur.id, f)}>צפייה</button>
                                    </div>
                                  ))}
                                  {photos.length ? (
                                    <button className="btn btn-g btn-sm" style={{ marginBottom: 6 }} onClick={async () => {
                                      const gk = `mail:${mid}`;
                                      setOpenGal((p) => ({ ...p, [gk]: !p[gk] }));
                                      if (!openGal[gk]) await loadGalleryThumbs(cur.id, photos);
                                    }}>{openGal[`mail:${mid}`] ? 'הסתר תמונות' : `הצג תמונות (${photos.length})`}</button>
                                  ) : null}
                                  {openGal[`mail:${mid}`] ? (
                                    <div className="gal-grid">
                                      {photos.map((f) => (
                                        <button key={f.id} className="gal-item" title={f.original_name} onClick={() => void openInCard(cur.id, f)}>
                                          {galleryUrls[f.id] ? <img src={galleryUrls[f.id]} alt={f.original_name} /> : <span>{f.original_name}</span>}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : <div style={{ fontSize: 11, color: 'var(--t3)' }}>אין קבצים מצורפים שמורים למייל זה</div>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  <div className="sdiv"><div className="sdiv-t">יומן שליחות ({gmailSends.length})</div><div className="sdiv-l" /></div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>מספרי שליחה לפי References לקבצים — אין עותק נוסף של הקבצים. הערות פנימיות לא מופיעות כאן כחלק מהמייל.</div>
                  {gmailSends.length === 0 ? <div style={{ color: 'var(--t3)', marginBottom: 12 }}>אין שליחות מתועדות בתיק</div>
                    : gmailSends.map((s) => {
                      const names = Array.isArray(s.file_names) ? s.file_names as string[] : [];
                      return (
                        <div key={String(s.id)} className="gmail-card" data-testid={`send-journal-${s.id}`}>
                          <div style={{ fontWeight: 800, marginBottom: 4 }}>שליחה #{String(s.send_no || '—')} · {trackLabel(String(s.track_status || s.status || ''))}</div>
                          <div className="mail-meta">
                            <div><b>תיק</b>{String(s.claim_id || cur.id)}</div>
                            <div><b>תאריך</b>{fmtWhen(String(s.sent_at || ''))}</div>
                            <div><b>שולח</b>{String(s.from_addr || '—')}</div>
                            <div><b>נמען</b>{String(s.to_addr || '—')}</div>
                            <div><b>Subject</b>{String(s.subject || '—')}</div>
                            <div><b>Message ID</b>{String(s.gmail_message_id || '—')}</div>
                            <div><b>Thread</b>{String(s.gmail_thread_id || '—')}</div>
                            <div><b>סטטוס</b>{String(s.status || '—')}</div>
                          </div>
                          <div style={{ fontSize: 12, margin: '6px 0' }}><b>מסמכים שנשלחו:</b> {names.length ? names.join(', ') : 'ללא מצורפים'}</div>
                          {s.track_due ? <div style={{ fontSize: 11, color: 'var(--yn2)' }}>תזכורת אם אין תשובה עד {fmtWhen(String(s.track_due))}</div> : null}
                          <select className="fse" value={String(s.track_status || 'sent')} onChange={async (e) => {
                            const r = await apiRef.current.invokeGmail('update_send_track', { claim_id: cur.id, send_id: s.id, track_status: e.target.value });
                            if (!r.success) { toast(String(r.error || 'עדכון נכשל'), 'err'); return; }
                            toast('סטטוס מעקב עודכן');
                            await loadCardData(cur.id);
                          }}>
                            {TRACK_STATUSES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  <InCardPreview file={previewFile} onClose={() => setPreviewFile(null)} />
                  <div className="sdiv"><div className="sdiv-t">ייבוא Gmail — מייל חדש בלבד</div><div className="sdiv-l" /></div>
                  <div style={{ fontSize: 12, color: 'var(--yn2)', marginBottom: 8 }}>אין לשלוח מייל. אין לייבא שוב מייל שכבר בתיק. הקבצים הקיימים לא יועתקו.</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <button className="btn btn-p btn-sm" onClick={async () => {
                      setGmailBusy('טוען מיילים…');
                      const r = await apiRef.current.invokeGmail('list_messages', { claim_id: cur.id });
                      setGmailBusy('');
                      if (!r.success) { toast(String(r.error || 'שגיאה'), 'err'); return; }
                      setGmailList((r.messages as Array<Record<string, unknown>>) || []);
                    }}>בחירת מייל</button>
                  </div>
                  {gmailBusy ? <div style={{ fontSize: 12 }}>{gmailBusy}</div> : null}
                  {gmailList.map((m) => (
                    <div key={String(m.id)} className="gmail-card">
                      <div style={{ fontWeight: 700 }}>{String(m.subject || '(ללא נושא)')}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>{String(m.from || '')} · {String(m.date || '')}</div>
                      <div style={{ fontSize: 12, margin: '6px 0' }}>{String(m.snippet || '')}</div>
                      <button className="btn btn-p btn-sm" onClick={async () => {
                        setGmailBusy('מייבא את המייל וכל המצורפים…');
                        const r = await apiRef.current.importGmailMessage(cur.id, String(m.id));
                        setGmailBusy('');
                        if (!r.success) { toast(String(r.error || 'ייבוא נכשל'), 'err'); return; }
                        await apiRef.current.cancelScheduledMailFollowups(cur.id);
                        const found = Number(r.found || r.total || 0);
                        const imported = Number(r.imported || 0);
                        const failed = Number(r.failed || 0);
                        const fails = Array.isArray(r.failures) ? r.failures as Array<{ filename?: string; reason?: string }> : [];
                        toast(`Found: ${found} · Imported: ${imported} · Failed: ${failed}${fails.length ? ` · ${fails.map((x) => `${x.filename}: ${x.reason}`).join(' | ')}` : ''}`, failed ? 'err' : 'ok');
                        await loadAll();
                        await loadCardData(cur.id);
                      }}>ייבא את המייל וכל המצורפים</button>
                    </div>
                  ))}
                </div>
              )}
              {cardTab === 'tasks' && (
                <>
                  <button className="btn btn-p btn-sm" style={{ marginBottom: 10 }} data-testid="tasks-cust-request" onClick={() => openCustomerRequest()}>בקשה ללקוח</button>
                  <button className="btn btn-g btn-sm" style={{ marginBottom: 10, marginInlineStart: 6 }} onClick={() => setModal('moTask')}>＋ משימה פנימית</button>
                  {tasks.length === 0 ? <div style={{ color: 'var(--t3)' }}>אין משימות פתוחות</div>
                    : tasks.map((t) => {
                      const ready = docs.files.find((f) => f.id === t.readyFileId);
                      const mailImp = gmailImports.find((im) => String(im.gmail_message_id) === t.gmailMessageId);
                      return (
                        <div key={t.id} data-testid={`task-card-${t.id}`} style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px', marginBottom: 7 }}>
                          <div style={{ fontWeight: 600 }}>{t.action}</div>
                          {t.audience === 'customer' ? (
                            <div className="cust-task-meta" data-testid={`cust-task-${t.id}`}>
                              <div className={`row-alert tone-${customerStatusOf(t) === 'done' ? 'info' : customerStatusOf(t) === 'cancelled' ? 'info' : 'wait'}`}>{customerStatusLabel(customerStatusOf(t))}</div>
                              <div style={{ fontSize: 12, marginTop: 6 }}>{t.requestText || t.note || ''}</div>
                              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                                {t.channel === 'whatsapp' ? 'WhatsApp' : 'מייל'}
                                {t.dueDate ? ` · יעד ${t.dueDate}` : ''}
                                {t.scheduledAt ? ` · תזמון ${fmtWhen(t.scheduledAt)}` : ''}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--t3)' }}>נוצר: {t.createdAt || '—'} · {t.createdBy || t.owner || '—'}</div>
                              {t.sentAt ? <div style={{ fontSize: 11, color: 'var(--t3)' }}>נשלח: {fmtWhen(t.sentAt)}</div> : null}
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                {CUSTOMER_REQUEST_STATUSES.map((st) => (
                                  <button key={st.key} type="button" className="btn btn-g btn-sm" data-testid={`cust-st-${t.id}-${st.key}`} onClick={async () => {
                                    await apiRef.current.saveTask({
                                      ...t,
                                      customerStatus: st.key,
                                      done: st.key === 'done' || st.key === 'cancelled' ? 'true' : 'false',
                                      sentAt: st.key === 'sent' ? (t.sentAt || new Date().toISOString()) : (t.sentAt || ''),
                                      completedAt: st.key === 'done' ? new Date().toISOString() : (t.completedAt || ''),
                                      cancelledAt: st.key === 'cancelled' ? new Date().toISOString() : (t.cancelledAt || ''),
                                    });
                                    toast(`סטטוס: ${st.label}`);
                                    await loadCardData(cur.id);
                                    await loadAll();
                                  }}>{st.label}</button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {t.source ? <div style={{ fontSize: 11, color: 'var(--t3)' }}>מקור: {t.source}</div> : null}
                          {t.createdAt ? <div style={{ fontSize: 11, color: 'var(--t3)' }}>תאריך: {t.createdAt}</div> : null}
                          {t.dueDate ? <div style={{ fontSize: 11, color: 'var(--yn2)' }}>📅 {t.dueDate}</div> : null}
                          {t.owner ? <div style={{ fontSize: 11, color: 'var(--t3)' }}>👤 {t.owner}</div> : null}
                          {t.docState ? <div data-testid={`task-docstate-${t.id}`} style={{ fontSize: 12, fontWeight: 700, margin: '6px 0', color: t.docState === 'ready' ? 'var(--gn2)' : t.docState === 'missing' ? 'var(--rd2)' : 'var(--yn2)' }}>{docStateHe(t.docState)}</div> : null}
                          {t.replyReceived === 'true' ? <div style={{ fontSize: 11, color: 'var(--ac3)' }}>התקבלה תשובה באותו Thread — המשימה לא נסגרה אוטומטית</div> : null}
                          {ready ? (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }}>
                              {isImageFile(ready) ? (
                                <button type="button" className="pick-thumb" onClick={() => void openInCard(cur.id, ready)}>
                                  {galleryUrls[ready.id] ? <img src={galleryUrls[ready.id]} alt="" /> : <span>📷</span>}
                                </button>
                              ) : null}
                              <span style={{ fontSize: 12 }}>{fileLabel(ready)} · {sourceHe(ready.source)}</span>
                              <button type="button" className="btn btn-p btn-sm" onClick={() => void openSendModal('draft', { file_ids: [ready.id], thread_id: t.gmailThreadId || '' })}>בחר לשליחה</button>
                            </div>
                          ) : null}
                          {t.docState === 'missing' || t.docState === 'awaiting_signature' ? (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
                              <button type="button" className="btn btn-g btn-sm" onClick={() => setCardTab('docs')}>בקש מהלקוח</button>
                            </div>
                          ) : null}
                          {mailImp ? (
                            <button type="button" className="btn btn-g btn-sm" data-testid={`task-goto-mail-${t.id}`} onClick={() => setCardTab('gin')}>למייל המקורי</button>
                          ) : null}
                          <div className="fg" style={{ marginTop: 8 }}>
                            <label className="fl">סטטוס טיפול</label>
                            <select className="fse" data-testid={`task-status-${t.id}`} defaultValue={t.workStatus || 'open'} id={`tws_${t.id}`} onChange={async (e) => {
                              const next = e.target.value;
                              await apiRef.current.saveTask({ ...t, workStatus: next, done: next === 'done' ? 'true' : 'false' });
                              toast('סטטוס עודכן');
                              await loadCardData(cur.id);
                              if (next === 'done') await afterSignificant(cur.id, `הושלמה משימה: ${t.action}`);
                            }}>
                              {WORK_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                          </div>
                          <div className="fg">
                            <label className="fl">הערה פנימית למשימה</label>
                            <textarea className="fta" id={`tnote_${t.id}`} defaultValue={t.note || ''} style={{ minHeight: 48 }} />
                            <div style={{ fontSize: 10, color: 'var(--t3)', margin: '4px 0' }}>פנימית בלבד — לא נשלחת החוצה.</div>
                            <button type="button" className="btn btn-g btn-sm" onClick={async () => {
                              const note = (document.getElementById(`tnote_${t.id}`) as HTMLTextAreaElement | null)?.value || '';
                              await apiRef.current.saveTask({ ...t, note });
                              toast('הערה פנימית נשמרה');
                              await loadCardData(cur.id);
                            }}>שמור הערה</button>
                          </div>
                        </div>
                      );
                    })}
                </>
              )}
              {cardTab === 'rems' && (
                <>
                  <button className="btn btn-p btn-sm" style={{ marginBottom: 10 }} onClick={() => setModal('moRem')}>＋ תזכורת</button>
                  {reminders.length === 0 ? <div style={{ color: 'var(--t3)' }}>אין תזכורות</div>
                    : reminders.map((r) => (
                      <div key={r.id} style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 7, padding: '10px 12px', marginBottom: 7 }}>
                        <div style={{ fontWeight: 600 }}>{r.date} {r.time || ''}</div>
                        <div style={{ fontSize: 12, color: 'var(--t2)' }}>{r.note || ''}</div>
                      </div>
                    ))}
                </>
              )}
              {cardTab === 'mailfu' && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--yn2)', marginBottom: 10 }}>
                    מצב Dry Run — אין שליחת מייל אמיתית ואין חיבור Gmail. כאן מוצג בדיוק מה היה אמור להישלח.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <button className="btn btn-p btn-sm" data-testid="claims-followup-new" onClick={() => openMailFollowupModal(null, 'followup')}>＋ מעקב (Follow-up)</button>
                    <button className="btn btn-g btn-sm" data-testid="claims-recurring-new" onClick={() => openMailFollowupModal(null, 'recurring')}>＋ מייל חוזר</button>
                    {isSuperAdmin && (
                      <button className="btn btn-g btn-sm" onClick={async () => {
                        const r = await apiRef.current.dispatchMailNow();
                        if (!r.success) { toast(String(r.error || 'שגיאה'), 'err'); return; }
                        toast(`Dry Run רץ · עובדו ${String(r.processed ?? 0)} · לא נשלח מייל אמיתי`);
                        if (cur) await loadCardData(cur.id);
                      }}>הרץ Dry Run עכשיו</button>
                    )}
                  </div>
                  {mailFollowups.length === 0 ? <div style={{ color: 'var(--t3)' }}>אין מעקב מייל בתיק זה</div>
                    : mailFollowups.map((fu) => {
                      const last = fu.jobs[0];
                      const prev = (last?.preview && typeof last.preview === 'object') ? last.preview : null;
                      const atts = Array.isArray(prev?.attachments) ? prev.attachments as Array<{ name?: string }> : [];
                      return (
                        <div key={fu.id} className="fu-box" data-testid={`fu-box-${fu.id}`} data-scheduled-once={isScheduledOnce(fu) ? 'true' : 'false'}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 700 }} data-testid={`fu-kind-${fu.id}`}>{isScheduledOnce(fu) ? 'מייל מתוזמן' : fu.mail_kind === 'email_repeat' ? `מייל חוזר · ${recurringLabel(fu.repeat_every_days)}` : 'מעקב (Follow-up)'} · {fuStatusHe(fu.status)}</div>
                            <div style={{ fontSize: 11, color: 'var(--t3)' }}>{fu.id}</div>
                          </div>
                          <div className="fu-grid">
                            <div><b>למי</b>{fu.mail_to || '—'}</div>
                            <div><b>נמען</b>{recipientKindLabel(inferRecipientKind(fu.mail_to, cur, fu.recipient_kind))}</div>
                            <div data-testid={`fu-date-${fu.id}`}><b>תאריך</b>{fmtDay(last?.planned_at || fu.next_run_at)}</div>
                            <div data-testid={`fu-time-${fu.id}`}><b>שעה</b>{fmtClock(last?.planned_at || fu.next_run_at)}</div>
                            <div><b>מועד מתוכנן</b>{fmtWhen(last?.planned_at || fu.next_run_at)}</div>
                            <div data-testid={`fu-status-${fu.id}`}><b>סטטוס</b>{fuStatusHe(last?.status || fu.status)}</div>
                            {!isScheduledOnce(fu) ? <div><b>מועד הבא</b>{fu.next_run_at ? fmtWhen(fu.next_run_at) : '—'}</div> : null}
                            <div><b>מי הגדיר</b>{fu.defined_by || '—'}</div>
                            {isScheduledOnce(fu)
                              ? <div data-testid={`fu-once-${fu.id}`}><b>סוג</b>שליחה חד-פעמית מתוזמנת</div>
                              : fu.mail_kind === 'email_repeat'
                                ? <div data-testid={`fu-repeat-${fu.id}`}><b>אם אין תשובה — שלח שוב</b>{recurringLabel(fu.repeat_every_days)}</div>
                                : <div data-testid={`fu-wait-${fu.id}`}><b>אם אין תשובה בתוך</b>{followupWaitDaysFromRow(fu)} ימים</div>}
                          </div>
                          <div className="fu-prev">
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>Preview — מה היה אמור להישלח</div>
                            <div><b>נושא:</b> {(prev?.subject as string) || fu.mail_subject || '—'}</div>
                            <pre>{String((prev?.body as string) || fu.mail_body || '')}</pre>
                            <div><b>מסמכים לצירוף:</b> {fu.file_names?.length ? fu.file_names.join(', ') : fu.attach_mode === 'received' ? (atts.length ? atts.map((a) => a.name).filter(Boolean).join(', ') : 'מסמכים שהתקבלו בתיק (אם יש)') : 'ללא מצורפים'}</div>
                            {last ? <div style={{ marginTop: 6, fontSize: 11 }}><b>סטטוס שליחה:</b> {fuStatusHe(last.status)}{last.fail_reason ? ` · ${last.fail_reason}` : ''}{last.retry_count ? ` · retry ${last.retry_count}` : ''} · realEmailSend={String(prev?.realEmailSend ?? false)}</div> : null}
                            {fu.jobs.length > 1 ? (
                              <div style={{ marginTop: 8, fontSize: 11 }}>
                                <b>ניסיונות:</b>
                                {fu.jobs.slice(0, 8).map((j) => (
                                  <div key={j.id}>{fuStatusHe(j.status)} · {fmtWhen(j.planned_at)}{j.fail_reason ? ` · ${j.fail_reason}` : ''}</div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          {fu.status === 'scheduled' && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                              <button className="btn btn-g btn-sm" onClick={() => openMailFollowupModal(fu)}>עריכה</button>
                              <button className="btn btn-sm" data-testid={`fu-cancel-${fu.id}`} style={{ background: 'rgba(239,68,68,.12)', color: 'var(--rd2)' }} onClick={async () => {
                                const r = await apiRef.current.cancelMailFollowup(fu.id);
                                if (!r.success) { toast(r.error || 'שגיאה', 'err'); return; }
                                if (cur && fu.mail_kind === 'email_repeat') {
                                  await apiRef.current.logHistory(cur.id, 'מייל חוזר נעצר', `${fu.mail_to} · ${recurringLabel(fu.repeat_every_days)}`, 'mail_recurring');
                                }
                                toast(isScheduledOnce(fu) ? 'התזמון בוטל. המייל לא יישלח.' : fu.mail_kind === 'email_repeat' ? 'החזרה נעצרה. ההיסטוריה נשמרה.' : 'המעקב נעצר. ההיסטוריה נשמרה.');
                                if (cur) await loadCardData(cur.id);
                                await loadAll();
                              }}>{isScheduledOnce(fu) ? 'בטל שליחה' : fu.mail_kind === 'email_repeat' ? 'עצור חזרה' : 'עצור מעקב'}</button>
                            </div>
                          )}
                          {fu.status === 'failed' && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button className="btn btn-p btn-sm" onClick={async () => {
                                const r = await apiRef.current.retryMailFollowup(fu.id);
                                if (!r.success) { toast(String(r.error || 'לא ניתן Retry'), 'err'); return; }
                                toast('Retry הוגדר — Dry Run בלבד, לא נשלח מייל אמיתי');
                                if (cur) await loadCardData(cur.id);
                              }}>Retry (Dry Run)</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </>
              )}
              {cardTab === 'timeline' && (
                hist.length === 0 ? <div className="empty">אין היסטוריה עדיין</div>
                  : hist.map((h) => (
                    <div key={h.id} style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 600 }}>{h.action}</div>
                      {h.note ? <div style={{ fontSize: 11.5, color: 'var(--t2)' }}>{h.note}</div> : null}
                      <div style={{ fontSize: 10, color: 'var(--t3)' }}>{h.at} · {h.by}</div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ASSIGN */}
      <div className={`ov ${modal === 'moAssign' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">👤 הקצה לעובד מטפל</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>מטפל נוכחי: {cur?.assigned_to_name || 'לא הוקצה'}</div>
            <div className="fg"><label className="fl">עובד מטפל</label>
              <select className="fse fi" id="as_user" data-testid="claims-assign-user">
                <option value="">— בחר עובד מטפל —</option>
                {assignees.map((a) => <option key={a.id} value={a.id}>{a.full_name}{a.company_name ? ` · ${a.company_name}` : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" data-testid="claims-assign-save" onClick={async () => {
              const uid = val(null, 'as_user');
              if (!uid || !cur) { toast('בחר עובד', 'err'); return; }
              const r = await apiRef.current.assignClaim(cur.id, uid);
              if (!r.success) { toast(r.error || 'שגיאה', 'err'); return; }
              await loadAll();
              setModal('moCard');
              await loadCardData(cur.id);
              toast('התביעה הוקצתה');
            }}>הקצה</button>
          </div>
        </div>
      </div>

      <div className={`ov ${bulkModal ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh">
            <div className="mh-t">{bulkModal === 'assign' ? 'שיוך מרובה לעובד תביעות' : bulkModal === 'archive' ? 'העברה לארכיון' : 'מחיקה רכה'}</div>
            <button className="mcl" onClick={() => !bulkBusy && setBulkModal(null)}>✕</button>
          </div>
          <div className="mb">
            <div style={{ fontWeight: 700, marginBottom: 8 }} data-testid="bulk-count">נבחרו {selectedVisible.length} תיקים</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>הפעולה תתבצע רק על התיקים המסומנים בתוצאות המוצגות. לא נוצרים תיקים חדשים.</div>
            {bulkModal === 'assign' && (
              <div className="fg"><label className="fl">עובד תביעות</label>
                <select className="fse fi" id="bulk_as_user" data-testid="claims-bulk-assign-user">
                  <option value="">— בחר עובד —</option>
                  {assignees.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              </div>
            )}
            {bulkModal === 'archive' && <div>התיקים יועברו לארכיון הקיים. אפשר לשחזר אחר כך.</div>}
            {bulkModal === 'delete' && (
              <div>
                <div style={{ color: 'var(--rd2)', fontWeight: 700, marginBottom: 8 }}>אין Hard Delete. זו מחיקה רכה בלבד.</div>
                <div className="fg"><label className="fl">הקלידו «מחק» לאישור</label>
                  <input className="fi" data-testid="bulk-delete-confirm" value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <div className="mf">
            <button className="btn btn-g" disabled={bulkBusy} onClick={() => setBulkModal(null)}>ביטול</button>
            <button className="btn btn-p" data-testid="claims-bulk-confirm" disabled={bulkBusy || selectedVisible.length === 0} onClick={async () => {
              const ids = [...selectedVisible];
              if (!ids.length) { toast('לא נבחרו תיקים', 'err'); return; }
              setBulkBusy(true);
              try {
                if (bulkModal === 'assign') {
                  const uid = val(null, 'bulk_as_user');
                  if (!uid) { toast('בחר עובד', 'err'); return; }
                  let ok = 0;
                  for (const id of ids) {
                    const r = await apiRef.current.assignClaim(id, uid);
                    if (r.success) ok += 1;
                  }
                  toast(`שויכו ${ok} מתוך ${ids.length} תיקים`);
                } else if (bulkModal === 'archive') {
                  let ok = 0;
                  for (const id of ids) {
                    const r = await apiRef.current.archiveClaim(id);
                    if (r.success) ok += 1;
                  }
                  toast(`הועברו לארכיון ${ok} מתוך ${ids.length}`);
                } else if (bulkModal === 'delete') {
                  if (deleteTyped !== 'מחק') { toast('נדרש להקליד «מחק»', 'err'); return; }
                  let ok = 0;
                  for (const id of ids) {
                    const r = await apiRef.current.softDeleteClaim(id, 'מחק');
                    if (r.success) ok += 1;
                  }
                  toast(`נמחקו (soft) ${ok} מתוך ${ids.length}`);
                }
                setBulkModal(null);
                setSelectedIds([]);
                setDeleteTyped('');
                await loadAll();
              } finally {
                setBulkBusy(false);
              }
            }}>{bulkBusy ? 'מבצע…' : 'אישור'}</button>
          </div>
        </div>
      </div>

      {/* STATUS */}
      <div className={`ov ${modal === 'moStatus' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">🔄 עדכון סטטוס</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg" style={{ marginBottom: 10 }}><label className="fl">סטטוס חדש</label>
              <select className="fse fi" id="sf_st">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            <div className="fg"><label className="fl">הערה</label><input className="fi" id="sf_note" placeholder="מה השתנה?" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={() => {
              const st = val(null, 'sf_st');
              const note = val(null, 'sf_note');
              if (MANDATORY_STATUSES.includes(st) && !note) {
                pendingStatus.current = st;
                setModal('moMandNote');
                return;
              }
              saveStatus(st, note);
            }}>עדכן</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moMandNote' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t" id="mandNoteTitle">נדרשת הערה</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb"><div className="fg"><label className="fl">הערה / סיבה *</label><textarea className="fta" id="mandNote" /></div></div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={() => {
              const note = val(null, 'mandNote');
              if (!note) { toast('נא להזין הסבר', 'err'); return; }
              saveStatus(pendingStatus.current || val(null, 'sf_st'), note);
            }}>אשר שינוי</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moCall' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">📞 רישום שיחת טלפון</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg2">
              <div className="fg"><label className="fl">טלפון</label><input className="fi" id="call_phone" defaultValue={cur?.clientPhone} /></div>
              <div className="fg full"><label className="fl">סיכום *</label><textarea className="fta" id="call_sum" /></div>
              <div className="fg full"><label className="fl">המשך טיפול</label><input className="fi" id="call_next" /></div>
            </div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={async () => {
              const sum = val(null, 'call_sum'); if (!sum) { toast('נא להזין סיכום', 'err'); return; }
              await apiRef.current.saveCommEntry({ claimId: curId || '', type: 'call', contactName: cur?.clientName || '', phone: val(null, 'call_phone'), body: sum, note: val(null, 'call_next') });
              toast('שיחה תועדה');
              if (curId) await afterSignificant(curId, 'תועדה שיחת טלפון');
            }}>💾 שמור שיחה</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moWA' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">💬 שליחת WhatsApp</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg"><label className="fl">טלפון</label><input className="fi" id="wa_phone" defaultValue={cur?.clientPhone} /></div>
            <div className="fg"><label className="fl">הודעה</label><textarea className="fta" id="wa_msg" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" style={{ background: '#15803d' }} onClick={async () => {
              const phone = val(null, 'wa_phone'); const msg = val(null, 'wa_msg');
              if (!phone || !msg) { toast('נא להזין טלפון והודעה', 'err'); return; }
              const p = phone.replace(/[^0-9]/g, '');
              const intl = p.startsWith('0') ? `972${p.slice(1)}` : p;
              window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, '_blank');
              await apiRef.current.saveCommEntry({ claimId: curId || '', type: 'wa', phone, body: msg, direction: 'out', contactName: cur?.clientName || '' });
              await markPendingCustomerSent();
              toast('WhatsApp נפתח ותועד. אין שליחה אוטומטית מספק.');
              if (curId) await afterSignificant(curId, 'תועד WhatsApp');
              if (curId) await afterSignificant(curId, 'תועד WhatsApp');
            }}>💬 שלח + תעד</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moMail' ? 'open' : ''}`} data-testid="mo-mail">
        <div className="modal modal-md">
          <div className="mh"><div className="mh-t">{mailKind === 'insurer' ? '🏢 שליחה לחברת הביטוח' : mailKind === 'legal' ? '⚖️ שליחה לטיפול משפטי' : '📧 שליחת תיק במייל'}</div><button className="mcl" onClick={() => { if (!mailSending) setModal('moCard'); }}>✕</button></div>
          <div className="mb">
            <div style={{ fontSize: 12, color: 'var(--yn2)', marginBottom: 10 }}>{scheduleWanted ? 'שליחה מתוזמנת — המייל לא יישלח עכשיו. יישמר כמתוזמן ויישלח אוטומטית במועד שנבחר. Dry Run כרגע: אין שליחה חיה עד אישור נפרד.' : 'שליחה ידנית אמיתית מתיבת דליה. אין allowlist של TEST. אין בחירת נמען אוטומטית ואין צירוף אוטומטי של מסמכים. שליחה רק אחרי Preview ואישור SEND מפורש. הערות פנימיות / משימות / היסטוריה לא יוצאות. Follow-up אוטומטי חי כבוי — נשמר אישור בלבד.'}</div>
            {suggestMissing.length ? (
              <div data-testid="suggest-missing" style={{ background: 'rgba(239,68,68,.08)', border: '1px solid var(--rd2)', borderRadius: 7, padding: 10, marginBottom: 10, fontSize: 12 }}>
                חסר מסמך: {suggestMissing.join(', ')}. לא צוּרף מסמך דומה בניחוש.
                <button type="button" className="btn btn-g btn-sm" style={{ marginInlineStart: 8 }} onClick={() => { setModal('moCard'); setCardTab('docs'); }}>לבקשת מסמכים מהלקוח</button>
              </div>
            ) : null}
            {mailThreadId ? <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>תגובה לאותו Thread: {mailThreadId}</div> : null}
            <div className="fg"><label className="fl">From</label><input className="fi" data-testid="mail-from" value={gmailStatus.email || 'yoni122222@gmail.com'} readOnly /></div>
            <div className="fg">
              <label className="fl">To *</label>
              <MailAddrChips
                id="mail_to"
                testId="mail-to"
                value={mailTo}
                disabled={mailSending}
                placeholder="name@example.com"
                onChange={(v) => { bumpMailDraft(); setMailTo(v); setVal('mail_to', v); }}
              />
              {toHint ? (
                <button type="button" className="btn btn-g btn-sm" style={{ marginTop: 6 }} disabled={mailSending} onClick={() => { bumpMailDraft(); const next = mailAddrParts(mailTo).includes(toHint) ? mailTo : [...mailAddrParts(mailTo), toHint].join(', '); setMailTo(next); setVal('mail_to', next); }}>העתק כתובת ששמורה בתיק ({toHint})</button>
              ) : <div style={{ fontSize: 10, color: 'var(--t3)' }}>אין כתובת שמורה בתיק — חובה להקליד.</div>}
              {mailTo && !mailAddrsOk(mailTo, true) ? (
                <div style={{ fontSize: 11, color: 'var(--rd2)', marginTop: 6 }}>הכתובת לא נקראת כאימייל תקין. הקלידו באנגלית משמאל לימין, בלי רווחים.</div>
              ) : null}
            </div>
            <div className="fg">
              <label className="fl">CC</label>
              <MailAddrChips
                id="mail_cc"
                testId="mail-cc"
                value={mailCc}
                disabled={mailSending}
                placeholder="אופציונלי"
                onChange={(v) => { bumpMailDraft(); setMailCc(v); setVal('mail_cc', v); }}
              />
            </div>
            <div className="fg"><label className="fl">Subject</label><input className="fi" id="mail_subj" data-testid="mail-subj" disabled={mailSending} value={mailSubj} onChange={(e) => { bumpMailDraft(); setMailSubj(e.target.value); setVal('mail_subj', e.target.value); }} /></div>
            {(mailKind === 'insurer' || mailKind === 'legal') && (
              <div className="fg">
                <label className="fl">Body — סיכום חיצוני בלבד</label>
                <textarea className="fta" data-testid="mail-body" disabled={mailSending} style={{ minHeight: 140 }} value={extSummary} onChange={(e) => { bumpMailDraft(); setExtSummary(e.target.value); setVal('mail_body', e.target.value); }} />
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>היסטוריית עובדים, הערות פנימיות ומשימות לא נכללות.</div>
              </div>
            )}
            {mailKind === 'draft' ? (
              <div className="fg"><label className="fl">Body</label><textarea className="fta" id="mail_body" data-testid="mail-body" disabled={mailSending} style={{ minHeight: 100 }} value={mailBodyDraft} onChange={(e) => { bumpMailDraft(); setMailBodyDraft(e.target.value); setVal('mail_body', e.target.value); }} /></div>
            ) : <input type="hidden" id="mail_body" value={extSummary} readOnly />}
            <div className="sdiv" data-testid="mail-schedule-block"><div className="sdiv-t">שליחה מתוזמנת</div><div className="sdiv-l" /></div>
            <label className="pick-row" style={{ margin: '6px 0', alignItems: 'flex-start' }}>
              <input type="checkbox" data-testid="mail-schedule" disabled={mailSending} checked={scheduleWanted} onChange={(e) => { setScheduleWanted(e.target.checked); if (e.target.checked) { setFollowupWanted(false); setRecurringWanted(false); } }} />
              <span style={{ whiteSpace: 'normal', overflow: 'visible', fontWeight: 700 }}>שליחה מתוזמנת — מייל אחד בתאריך ובשעה שייבחרו. לא Follow-up ולא מייל חוזר.</span>
            </label>
            {scheduleWanted ? (
              <div data-testid="mail-schedule-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '0 0 10px' }}>
                <div className="fg" style={{ margin: 0 }}><label className="fl">תאריך שליחה</label><input className="fi" data-testid="mail-schedule-date" type="date" disabled={mailSending} value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} /></div>
                <div className="fg" style={{ margin: 0 }}><label className="fl">שעת שליחה</label><input className="fi" data-testid="mail-schedule-time" type="time" disabled={mailSending} value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} /></div>
              </div>
            ) : null}
            {scheduleWanted && scheduleDate && scheduleTime ? (
              <div data-testid="mail-schedule-summary" style={{ background: 'rgba(37,99,235,.08)', border: '1px solid var(--bl2, #2563eb)', borderRadius: 7, padding: 10, marginBottom: 10, fontSize: 12 }}>
                מייל מתוזמן אל <b>{mailTo || '—'}</b> בתאריך <b>{scheduleDate}</b> בשעה <b>{scheduleTime}</b>. סטטוס אחרי שמירה: מתוזמן. לא יישלח עכשיו.
              </div>
            ) : null}
            <div className="sdiv" data-testid="mail-recurring-block"><div className="sdiv-t">מייל חוזר</div><div className="sdiv-l" /></div>
            <label className="pick-row" style={{ margin: '6px 0', alignItems: 'flex-start' }}>
              <input type="checkbox" data-testid="mail-recurring" disabled={mailSending || scheduleWanted} checked={recurringWanted} onChange={(e) => { setRecurringWanted(e.target.checked); if (e.target.checked) { setFollowupWanted(false); setScheduleWanted(false); } }} />
              <span style={{ whiteSpace: 'normal', overflow: 'visible', fontWeight: 700 }}>אם אין תשובה — שלח שוב כל X ימים. לא Follow-up ולא מייל מתוזמן חד-פעמי.</span>
            </label>
            <div data-testid="mail-recurring-picker-wrap" style={{ margin: '0 0 8px' }}>
              <RecurringDaysPicker days={recurringDays} disabled={mailSending || !recurringWanted || scheduleWanted} testPrefix="mail-recurring-days" onChange={setRecurringDays} />
            </div>
            {recurringWanted && !scheduleWanted ? (
              <div data-testid="mail-recurring-summary" style={{ background: 'rgba(37,99,235,.08)', border: '1px solid var(--bl2, #2563eb)', borderRadius: 7, padding: 10, marginBottom: 10, fontSize: 12 }}>
                מייל חוזר אל <b>{mailTo || '—'}</b> · {recurringLabel(recurringDays)}. ייעצר כשתתקבל תשובה. Dry Run — אין שליחה חיה.
              </div>
            ) : null}
            <div className="fg"><label className="fl">אם אין תשובה עד</label><input className="fi" data-testid="mail-track-due" type="date" disabled={mailSending || scheduleWanted || recurringWanted} value={trackDue} onChange={(e) => setTrackDue(e.target.value)} /></div>
            <label className="pick-row" style={{ margin: '6px 0', alignItems: 'flex-start' }}>
              <input type="checkbox" data-testid="mail-followup" disabled={mailSending || scheduleWanted || recurringWanted} checked={followupWanted} onChange={(e) => { setFollowupWanted(e.target.checked); if (e.target.checked) { setScheduleWanted(false); setRecurringWanted(false); } }} />
              <span style={{ whiteSpace: 'normal', overflow: 'visible' }}>אם אין תשובה בתוך
                <FollowupDaysPicker days={followupDays} disabled={mailSending || !followupWanted || scheduleWanted} testPrefix="mail-followup-days" onChange={setFollowupDays} />
                — אשר Follow-up מראש (לא נשלח חי כרגע)
              </span>
            </label>
            <div style={{ fontSize: 10, color: 'var(--yn2)', marginBottom: 8 }}>Follow-up הוא מעקב אם אין תשובה. שליחה מתוזמנת היא מייל אחד במועד שנבחר. מייל חוזר שולח שוב כל X ימים עד שתתקבל תשובה — שלושתם נפרדים.</div>
            <div className="sdiv"><div className="sdiv-t">מסמכי התביעה לצירוף</div><div className="sdiv-l" /></div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>מקור אחד: מסמכי התביעה. אין מאגר נפרד למייל. רק מה שמסומן יישלח. אין צירוף אוטומטי.</div>
            {curId ? (
              <StaffUploadZone
                testId="mail-docs-drop"
                inputId="mail_staff_files"
                busy={docsUploading || mailSending}
                compact
                onFiles={(files) => { void uploadStaffFiles(curId, files, true); }}
              />
            ) : null}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <button className="btn btn-g btn-sm" data-testid="mail-clear-files" onClick={() => setSendGroup(docs.files.map((f) => f.id), false)}>נקה בחירה</button>
              <button className="btn btn-g btn-sm" data-testid="mail-pick-surveyor-photos" onClick={() => setSendGroup(docs.files.filter((f) => f.doc_kind === 'surveyor_photo').map((f) => f.id), true)}>כל תמונות השמאי</button>
              <button className="btn btn-g btn-sm" data-testid="mail-pick-surveyor-reports" onClick={() => setSendGroup(docs.files.filter((f) => f.doc_kind === 'surveyor_report' || f.doc_kind === 'surveyor_attachment').map((f) => f.id), true)}>כל דוחות השמאי</button>
              <button className="btn btn-g btn-sm" data-testid="mail-pick-garage" onClick={() => setSendGroup(docs.files.filter((f) => f.doc_kind === 'garage_invoice' || fileMeta(f).staff_type === 'garage_invoice').map((f) => f.id), true)}>כל מסמכי המוסך</button>
              <button className="btn btn-g btn-sm" data-testid="mail-pick-images" onClick={() => setSendGroup(docs.files.filter((f) => isImageFile(f)).map((f) => f.id), true)}>כל התמונות</button>
              <button className="btn btn-g btn-sm" data-testid="mail-pick-identified" onClick={() => setSendGroup(docs.files.filter((f) => fileMeta(f).important === 'true').map((f) => f.id), true)}>מסמכים מזוהים</button>
            </div>
            {(() => {
              const identified = docs.files.filter((f) => fileMeta(f).important === 'true');
              if (!identified.length) return null;
              return (
                <div className="pick-cat" data-testid="mail-identified">
                  <div className="pick-cat-h">מסמכים מזוהים ({identified.length})</div>
                  <div className="pick-list pick-list-mail">
                    {identified.map((f) => (
                      <div key={`id-${f.id}`} className="pick-row">
                        <input type="checkbox" disabled={mailSending} checked={sendIds.includes(f.id)} onChange={() => toggleSendId(f.id)} />
                        <span>{fileLabel(f)} · {staffTypeLabel(fileMeta(f).staff_type || '')}</span>
                        <span className="pick-sz">{fmtBytes(Number(f.byte_size || 0))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            {DOC_CATS.map((cat) => {
              const group = docs.files.filter((f) => classifyDoc(f) === cat.key);
              if (!group.length) return null;
              const allOn = group.every((f) => sendIds.includes(f.id));
              return (
                <div key={cat.key} className="pick-cat">
                  <label className="pick-cat-h">
                    <input type="checkbox" checked={allOn} onChange={(e) => setSendGroup(group.map((f) => f.id), e.target.checked)} />
                    {cat.label} ({group.length})
                  </label>
                  <div className="pick-list pick-list-mail">
                    {group.map((f) => (
                      <div key={f.id} className="pick-row" data-testid={`mail-file-row-${f.id}`}>
                        <input type="checkbox" data-testid={`mail-file-${f.id}`} disabled={mailSending} checked={sendIds.includes(f.id)} onChange={() => toggleSendId(f.id)} />
                        {isImageFile(f) ? (
                          <button type="button" className="pick-thumb" data-testid={`mail-file-thumb-${f.id}`} title="תצוגה — לא מסמן לשליחה" onClick={() => { if (curId) void openInCard(curId, f); }}>
                            {galleryUrls[f.id] ? <img src={galleryUrls[f.id]} alt={f.original_name} /> : <span>📷</span>}
                          </button>
                        ) : (
                          <span className="pick-thumb" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}>PDF</span>
                        )}
                        <span>{fileLabel(f)}{fileMeta(f).staff_type ? ` · ${staffTypeLabel(fileMeta(f).staff_type)}` : ''} · {sourceHe(f.source)}</span>
                        <span className="pick-sz">{fmtBytes(Number(f.byte_size || 0))}</span>
                        <button type="button" className="btn btn-g btn-sm" data-testid={`mail-file-preview-${f.id}`} onClick={() => { if (curId) void openInCard(curId, f); }}>תצוגה</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <InCardPreview file={previewFile} onClose={() => setPreviewFile(null)} />
            <div className="sdiv"><div className="sdiv-t">נבחרו לשליחה ({sendIds.length})</div><div className="sdiv-l" /></div>
            <div data-testid="mail-selected-list" style={{ fontSize: 12, marginBottom: 8 }}>
              {sendIds.length === 0 ? <div style={{ color: 'var(--t3)' }}>לא נבחר אף קובץ</div> : (
                <div>
                  {docs.files.filter((f) => sendIds.includes(f.id)).map((f) => (
                    <div key={f.id} className="pick-row" data-testid={`mail-selected-${f.id}`}>
                      {isImageFile(f) && galleryUrls[f.id] ? <img className="pick-thumb" src={galleryUrls[f.id]} alt="" /> : null}
                      <span>{fileLabel(f)}</span>
                      <span className="pick-sz">{fmtBytes(Number(f.byte_size || 0))}</span>
                      <button type="button" className="btn btn-g btn-sm" onClick={() => toggleSendId(f.id)}>בטל</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={`pkg-bar ${pkgInfo?.overLimit ? 'over' : ''}`} data-testid="mail-pkg">
              גודל כולל: {fmtBytes(pkgInfo?.packageBytes || sendIds.reduce((s, id) => s + Number(docs.files.find((f) => f.id === id)?.byte_size || 0), 0))}
              {' / '}{fmtBytes(PACKAGE_LIMIT)}
              {' · '}{sendIds.length} קבצים
              {pkgInfo?.overLimit ? (
                <div className="pkg-warn" data-testid="mail-oversize">
                  הקבצים גדולים מדי לשליחה במייל. SEND חסום. לא יושמטו קבצים בשקט. אפשר לבחור פחות קבצים, לפצל למספר מיילים, או קישור מאובטח — לא אוטומטית.
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(pkgInfo.split || []).map((g) => (
                      <button key={g.index} className="btn btn-g btn-sm" type="button" disabled={g.tooLargeSingle} onClick={() => {
                        setSendIds(g.file_ids);
                        if (curId) void refreshPackage(curId, g.file_ids);
                        setMailPreviewOn(false);
                        setMailConfirmOn(false);
                      }}>קבוצה {g.index} · {g.names.length} קבצים · {fmtBytes(g.bytes)}{g.tooLargeSingle ? ' — קובץ בודד גדול מדי' : ''}</button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            {mailPreviewOn && (
              <div className="fu-prev" style={{ marginTop: 12 }} data-testid="mail-preview">
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Preview לפני שליחה</div>
                <div><b>From:</b> {gmailStatus.email || 'yoni122222@gmail.com'}</div>
                <div><b>To:</b> {mailTo || '—'}</div>
                <div><b>CC:</b> {mailCc || '—'}</div>
                <div><b>Subject:</b> {mailSubj || '—'}</div>
                <div><b>Body:</b></div>
                <pre className="mail-body">{mailKind === 'draft' ? mailBodyDraft : extSummary}</pre>
                <div style={{ fontWeight: 800, margin: '8px 0 4px' }}>Attachments שנבחרו ({sendIds.length})</div>
                {sendIds.length === 0 ? <div>אין קבצים נבחרים</div> : (
                  <ul style={{ margin: 0, paddingInlineStart: 18 }} data-testid="mail-preview-files">
                    {docs.files.filter((f) => sendIds.includes(f.id)).map((f) => (
                      <li key={f.id}>{fileLabel(f)} · {fmtBytes(Number(f.byte_size || 0))}</li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: 8 }}><b>גודל כולל:</b> {fmtBytes(pkgInfo?.packageBytes || sendIds.reduce((s, id) => s + Number(docs.files.find((f) => f.id === id)?.byte_size || 0), 0))}</div>
              </div>
            )}
            {mailConfirmOn && (
              <div className="fu-prev" style={{ marginTop: 12, borderColor: 'var(--yn2)' }} data-testid="mail-confirm">
                <div style={{ fontWeight: 800, marginBottom: 8 }}>אישור שליחה — פעולה זו שולחת מייל אמיתי מתיבת דליה</div>
                <div><b>To:</b> {mailTo}</div>
                <div><b>CC:</b> {mailCc || '—'}</div>
                <div><b>Subject:</b> {mailSubj}</div>
                <div><b>קבצים שנשלחים:</b></div>
                {sendIds.length === 0 ? <div>אין קבצים</div> : (
                  <ul style={{ margin: '4px 0 8px', paddingInlineStart: 18 }} data-testid="mail-confirm-files">
                    {docs.files.filter((f) => sendIds.includes(f.id)).map((f) => (
                      <li key={f.id}>{fileLabel(f)} · {fmtBytes(Number(f.byte_size || 0))}</li>
                    ))}
                  </ul>
                )}
                <div><b>גודל:</b> {fmtBytes(pkgInfo?.packageBytes || 0)}</div>
                <label className="pick-row" style={{ marginTop: 10 }}>
                  <input type="checkbox" data-testid="mail-ack" checked={mailAck} onChange={(e) => setMailAck(e.target.checked)} />
                  <span>אני מאשר לשלוח את המייל הזה מתוך התיק, לנמענים ולקבצים שמופיעים ב-Preview.</span>
                </label>
              </div>
            )}
          </div>
          <div className="mf">
            <button className="btn btn-g" disabled={mailSending} onClick={() => { setMailConfirmOn(false); setMailAck(false); setModal('moCard'); }}>ביטול</button>
            {scheduleWanted ? (
              <button className="btn btn-p" data-testid="mail-schedule-save" disabled={mailSending} onClick={async () => {
                if (!curId || !cur) return;
                const to = normalizeMailAddr(mailTo);
                const cc = normalizeMailAddr(mailCc);
                const bodyText = mailKind === 'draft' ? mailBodyDraft : extSummary;
                if (!mailAddrsOk(to, true)) { toast('כתובת To לא תקינה', 'err'); return; }
                if (cc && !mailAddrsOk(cc, false)) { toast('כתובת CC לא תקינה', 'err'); return; }
                if (!mailSubj.trim()) { toast('חסר Subject', 'err'); return; }
                if (!bodyText.trim()) { toast('חסר Body', 'err'); return; }
                if (!scheduleDate || !scheduleTime) { toast('נא לבחור תאריך ושעה לתזמון', 'err'); return; }
                const when = new Date(`${scheduleDate}T${scheduleTime}`);
                if (Number.isNaN(when.getTime())) { toast('מועד לא תקין', 'err'); return; }
                if (when.getTime() < Date.now() - 30000) { toast('תאריך ושעת השליחה חייבים להיות בעתיד', 'err'); return; }
                const whenIso = when.toISOString();
                const selected = docs.files.filter((f) => sendIds.includes(f.id));
                setMailSending(true);
                try {
                  const r = await apiRef.current.upsertMailFollowup({
                    claim_id: curId,
                    mail_kind: 'email_once',
                    mail_to: to,
                    mail_cc: cc,
                    mail_subject: mailSubj,
                    mail_body: bodyText,
                    attach_mode: 'none',
                    next_run_at: whenIso,
                    purpose: 'scheduled_send',
                    recipient_kind: 'other',
                    file_ids: selected.map((f) => f.id),
                    file_names: selected.map((f) => f.original_name),
                  });
                  if (!r.success) { toast(String(r.error || 'שמירת התזמון נכשלה'), 'err'); return; }
                  await apiRef.current.logHistory(curId, 'הוגדר מייל מתוזמן', `${to} · ${fmtDay(whenIso)} ${fmtClock(whenIso)}`, 'mail_scheduled');
                  toast('מייל מתוזמן נשמר. Dry Run — אין שליחה חיה עד אישור נפרד.');
                  setScheduleWanted(false);
                  setCardTab('mailfu');
                  setModal('moCard');
                  await loadCardData(curId);
                  await loadAll();
                } finally {
                  setMailSending(false);
                }
              }}>שמור תזמון</button>
            ) : null}
            {recurringWanted && !scheduleWanted ? (
              <button className="btn btn-p" data-testid="mail-recurring-save" disabled={mailSending} onClick={async () => {
                if (!curId || !cur) return;
                const to = normalizeMailAddr(mailTo);
                const cc = normalizeMailAddr(mailCc);
                const bodyText = mailKind === 'draft' ? mailBodyDraft : extSummary;
                if (!mailAddrsOk(to, true)) { toast('כתובת To לא תקינה', 'err'); return; }
                if (cc && !mailAddrsOk(cc, false)) { toast('כתובת CC לא תקינה', 'err'); return; }
                if (!mailSubj.trim()) { toast('חסר Subject', 'err'); return; }
                if (!bodyText.trim()) { toast('חסר Body', 'err'); return; }
                const days = normalizeRecurringDays(recurringDays);
                const whenIso = new Date(Date.now() + Math.max(60_000, 2 * 60_000)).toISOString();
                const selected = docs.files.filter((f) => sendIds.includes(f.id));
                const existing = mailFollowups.find((f) => f.status === 'scheduled' && f.mail_kind === 'email_repeat' && f.mail_to === to);
                setMailSending(true);
                try {
                  const r = await apiRef.current.upsertMailFollowup({
                    id: existing?.id,
                    claim_id: curId,
                    mail_kind: 'email_repeat',
                    mail_to: to,
                    mail_cc: cc,
                    mail_subject: mailSubj,
                    mail_body: bodyText,
                    attach_mode: 'none',
                    repeat_every_days: String(days),
                    next_run_at: whenIso,
                    recipient_kind: 'other',
                    purpose: 'recurring_send',
                    file_ids: selected.map((f) => f.id),
                    file_names: selected.map((f) => f.original_name),
                  });
                  if (!r.success) { toast(String(r.error || 'שמירת המייל החוזר נכשלה'), 'err'); return; }
                  await apiRef.current.logHistory(curId, existing ? 'עודכן מייל חוזר' : 'הוגדר מייל חוזר', `${to} · ${recurringLabel(days)}`, 'mail_recurring');
                  toast(`מייל חוזר נשמר · ${recurringLabel(days)}. Dry Run — ייעצר כשתתקבל תשובה.`);
                  setRecurringWanted(false);
                  setCardTab('mailfu');
                  setModal('moCard');
                  await loadCardData(curId);
                  await loadAll();
                } finally {
                  setMailSending(false);
                }
              }}>שמור מייל חוזר</button>
            ) : null}
            <button className="btn btn-g" data-testid="mail-preview-btn" disabled={mailSending} onClick={async () => {
              if (curId) await refreshPackage(curId, sendIds);
              setMailConfirmOn(false);
              setMailAck(false);
              const to = normalizeMailAddr(mailTo);
              const cc = normalizeMailAddr(mailCc);
              if (to !== mailTo) setMailTo(to);
              const bodyText = mailKind === 'draft' ? mailBodyDraft : extSummary;
              if (!mailAddrsOk(to, true)) { setMailPreviewOn(false); toast('כתובת To לא תקינה — SEND חסום', 'err'); return; }
              if (cc && !mailAddrsOk(cc, false)) { setMailPreviewOn(false); toast('כתובת CC לא תקינה — SEND חסום', 'err'); return; }
              if (!mailSubj.trim()) { setMailPreviewOn(false); toast('חסר Subject', 'err'); return; }
              if (!bodyText.trim()) { setMailPreviewOn(false); toast('חסר Body', 'err'); return; }
              const r = await apiRef.current.invokeGmail('validate_claim_send', {
                claim_id: curId,
                to,
                cc,
                subject: mailSubj,
                body: bodyText,
                file_ids: sendIds,
              });
              if (r.error === 'internal_content_blocked') { setMailPreviewOn(false); toast('התוכן כולל חומר פנימי — לא לשלוח', 'err'); return; }
              if (r.error === 'package_too_large') { setMailPreviewOn(false); toast('הקבצים גדולים מדי לשליחה במייל — SEND חסום. לא יושמטו קבצים.', 'err'); return; }
              if (r.error === 'cc_invalid' || r.error === 'to_required') { setMailPreviewOn(false); toast('כתובת To/CC לא תקינה — SEND חסום', 'err'); return; }
              if (r.success === false && r.error) { setMailPreviewOn(false); toast(String(r.error), 'err'); return; }
              if (suggestDraftBody && bodyText !== suggestDraftBody && curId) {
                void apiRef.current.logHistory(curId, 'טיוטה נערכה', mailSubj, 'mail_draft');
              }
              setMailPreviewOn(true);
            }}>👁 Preview</button>
            {!scheduleWanted && !recurringWanted && !mailConfirmOn ? (
              <button className="btn btn-p" data-testid="mail-send-btn" disabled={mailSending || !mailPreviewOn || pkgInfo?.overLimit === true || !mailAddrsOk(mailTo, true) || !mailAddrsOk(mailCc, false)} title={!mailAddrsOk(mailTo, true) ? 'כתובת To לא תקינה' : !mailPreviewOn ? 'קודם Preview' : pkgInfo?.overLimit ? 'קבצים גדולים מדי' : ''} onClick={() => {
                if (!mailPreviewOn) { toast('קודם Preview', 'err'); return; }
                if (pkgInfo?.overLimit) { toast('הקבצים גדולים מדי לשליחה במייל', 'err'); return; }
                if (!mailAddrsOk(mailTo, true)) { toast('כתובת To לא תקינה', 'err'); return; }
                if (!mailAddrsOk(mailCc, false)) { toast('כתובת CC לא תקינה', 'err'); return; }
                setMailConfirmOn(true);
              }}>SEND</button>
            ) : !scheduleWanted && !recurringWanted ? (
              <button className="btn btn-rd" data-testid="mail-confirm-send" disabled={mailSending || !mailAck || pkgInfo?.overLimit === true} onClick={async () => {
                if (mailSending) return;
                if (!mailAck) { toast('יש לאשר במפורש לפני שליחה', 'err'); return; }
                if (pkgInfo?.overLimit) { toast('הקבצים גדולים מדי לשליחה במייל', 'err'); return; }
                const to = normalizeMailAddr(mailTo);
                const cc = normalizeMailAddr(mailCc);
                const bodyText = mailKind === 'draft' ? mailBodyDraft : extSummary;
                if (!mailAddrsOk(to, true)) { toast('כתובת To לא תקינה', 'err'); return; }
                if (!mailAddrsOk(cc, false)) { toast('כתובת CC לא תקינה', 'err'); return; }
                if (!mailSubj.trim()) { toast('חסר Subject', 'err'); return; }
                if (!bodyText.trim()) { toast('חסר Body', 'err'); return; }
                setMailSending(true);
                try {
                  const r = await apiRef.current.invokeGmail('send_claim', {
                    confirm: true,
                    claim_id: curId,
                    to,
                    cc,
                    subject: mailSubj,
                    body: bodyText,
                    file_ids: sendIds,
                    idempotency_key: mailIdemp.current,
                    thread_id: mailThreadId || undefined,
                    track_due: trackDue || undefined,
                    followup_approved: followupWanted,
                    followup_days: followupWanted ? followupDays : undefined,
                  });
                  if (!r.success || r.realEmailSend !== true || !r.gmail_message_id) {
                    if (r.error === 'already_sent') toast('המייל כבר נשלח — אין שליחה כפולה', 'err');
                    else if (r.error === 'send_in_progress') toast('שליחה כבר בתהליך', 'err');
                    else if (r.error === 'package_too_large') toast('הקבצים גדולים מדי לשליחה במייל — לא נשלח ולא הושמטו קבצים', 'err');
                    else if (r.error === 'confirm_required') toast('נדרש אישור מפורש', 'err');
                    else if (r.error === 'internal_content_blocked') toast('התוכן כולל חומר פנימי — לא נשלח', 'err');
                    else toast(String(r.error || 'שליחה נכשלה — Gmail לא החזיר Message ID'), 'err');
                    return;
                  }
                  toast(`נשלח · שליחה #${String(r.send_no || '')} · msgid ${String(r.gmail_message_id || '')} · thread ${String(r.gmail_thread_id || '')}`);
                  setMailSending(false);
                  setMailConfirmOn(false);
                  setMailAck(false);
                  await markPendingCustomerSent();
                  if (curId) void afterSignificant(curId, 'נשלח מייל עם מסמכים', { sendOk: true });
                  if (curId && (r.gmail_thread_id || mailThreadId)) {
                    const thread = String(r.gmail_thread_id || mailThreadId || '');
                    for (const t of tasks) {
                      if (t.gmailThreadId === thread && t.done !== 'true') {
                        void apiRef.current.saveTask({ ...t, workStatus: 'waiting_reply', done: 'false' });
                      }
                    }
                  }
                  if (curId && trackDue) {
                    void apiRef.current.saveReminder({
                      claimId: curId,
                      date: trackDue,
                      note: `אם אין תשובה לשליחה #${String(r.send_no || '')} עד ${trackDue} — להזכיר`,
                      owner: actor.full_name,
                      sent: 'false',
                    });
                  }
                  if (curId && followupWanted) {
                    const whenIso = new Date(Date.now() + followupDays * 86400000).toISOString();
                    const fu = await apiRef.current.upsertMailFollowup({
                      claim_id: curId,
                      mail_kind: 'email_once',
                      mail_to: to,
                      mail_subject: mailSubj,
                      mail_body: bodyText,
                      attach_mode: 'none',
                      next_run_at: whenIso,
                      wait_days: followupDays,
                      recipient_kind: 'other',
                    });
                    if (!fu.success) toast(`המייל נשלח, אך שמירת המעקב נכשלה: ${String(fu.error || '')}`, 'err');
                    else toast('מעקב נשמר בתיק (Dry Run — לא יישלח מייל אוטומטי אמיתי עד אישור)');
                  }
                } finally {
                  setMailSending(false);
                }
              }}>{mailSending ? 'שולח…' : 'אשר ושלח'}</button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moCustReq' ? 'open' : ''}`} data-testid="mo-cust-req">
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">בקשה / משימה ללקוח</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>נשמר בתיק כמשימה ללקוח. מייל יוצא במנגנון הקיים (או מתוזמן Dry Run). WhatsApp נפתח ידנית ב-wa.me — אין ספק חדש ואין שליחה אוטומטית.</div>
            <div className="fg"><label className="fl">סוג בקשה</label>
              <select className="fse fi" id="cr_kind" data-testid="cr-kind">
                {CUSTOMER_REQUEST_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">טקסט הבקשה *</label><textarea className="fta" id="cr_text" data-testid="cr-text" style={{ minHeight: 90 }} placeholder="מה הלקוח צריך לבצע" /></div>
            <div className="fg"><label className="fl">תאריך יעד</label><input className="fi" id="cr_due" data-testid="cr-due" type="date" /></div>
            <div className="fg"><label className="fl">ערוץ</label>
              <select className="fse fi" id="cr_channel" data-testid="cr-channel">
                <option value="email">מייל</option>
                <option value="whatsapp">WhatsApp (ידני, מנגנון קיים)</option>
              </select>
            </div>
            <div className="fg"><label className="fl">תזמון שליחה (ריק = עכשיו)</label><input className="fi" id="cr_when" data-testid="cr-when" type="datetime-local" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" data-testid="cr-save" onClick={async () => {
              if (!cur || !curId) return;
              const kind = val(null, 'cr_kind') || 'other';
              const text = val(null, 'cr_text');
              if (!text) { toast('נא להזין את טקסט הבקשה', 'err'); return; }
              const channel = val(null, 'cr_channel') || 'email';
              const due = val(null, 'cr_due');
              const when = val(null, 'cr_when');
              const label = customerKindLabel(kind);
              const row: Record<string, string> = {
                claimId: curId,
                audience: 'customer',
                customerKind: kind,
                action: label,
                requestText: text,
                note: text,
                channel,
                customerStatus: 'pending',
                dueDate: due,
                scheduledAt: when ? new Date(when).toISOString() : '',
                createdBy: actor.full_name,
                owner: actor.full_name,
                done: 'false',
              };
              if (channel === 'email' && when) {
                const to = cur.clientEmail || '';
                if (!to) { toast('אין כתובת מייל ללקוח בתיק', 'err'); return; }
                const whenIso = new Date(when).toISOString();
                if (Number.isNaN(Date.parse(whenIso))) { toast('מועד לא תקין', 'err'); return; }
                const fu = await apiRef.current.upsertMailFollowup({
                  claim_id: curId,
                  mail_to: to,
                  mail_subject: `תביעה ${displayClaimNum(cur)} – ${label}`,
                  mail_body: text,
                  mail_kind: 'email_once',
                  attach_mode: 'none',
                  next_run_at: whenIso,
                  recipient_kind: 'client',
                });
                if (!fu.success) { toast(String(fu.error || 'תזמון המייל נכשל'), 'err'); return; }
                row.mailFollowupId = String(fu.id || '');
                await apiRef.current.saveTask(row);
                toast('משימה ללקוח נשמרה · מייל מתוזמן (Dry Run — לא נשלח)');
                setCardTab('tasks');
                setModal('moCard');
                await loadCardData(curId);
                await loadAll();
                return;
              }
              const saved = await apiRef.current.saveTask(row);
              setPendingCustTaskId(String(saved.id || ''));
              if (channel === 'whatsapp') {
                if (when) {
                  await apiRef.current.saveReminder({
                    claimId: curId,
                    date: when.slice(0, 10),
                    note: `תזכורת לשלוח WhatsApp ללקוח: ${text}`,
                    owner: actor.full_name,
                    sent: 'false',
                  });
                  toast('נשמרה משימה + תזכורת. אין שליחת WhatsApp אוטומטית במערכת.');
                  setCardTab('tasks');
                  setModal('moCard');
                  await loadCardData(curId);
                  await loadAll();
                  return;
                }
                setVal('wa_phone', cur.clientPhone || '');
                setVal('wa_msg', text);
                setModal('moWA');
                toast('משימה נשמרה — שליחת WhatsApp ידנית בחלון הבא');
                return;
              }
              await openSendModal('draft', {
                to: cur.clientEmail || '',
                subject: `תביעה ${displayClaimNum(cur)} – ${label}`,
                body: text,
              });
              toast('משימה נשמרה — המייל לא נשלח עד אישור ידני');
            }}>שמור / המשך לשליחה</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moTask' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">✅ הוספת משימה</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg"><label className="fl">פעולה *</label><input className="fi" id="task_action" /></div>
            <div className="fg"><label className="fl">אחראי</label><input className="fi" id="task_owner" defaultValue={actor.full_name} /></div>
            <div className="fg"><label className="fl">תאריך יעד</label><input className="fi" id="task_date" type="date" /></div>
            <div className="fg"><label className="fl">הערה</label><input className="fi" id="task_note" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={async () => {
              const action = val(null, 'task_action'); if (!action) { toast('נא להזין פעולה', 'err'); return; }
              await apiRef.current.saveTask({ claimId: curId || '', action, owner: val(null, 'task_owner'), dueDate: val(null, 'task_date'), note: val(null, 'task_note'), done: 'false' });
              toast('משימה נוספה');
              if (curId) await openCard(curId);
            }}>💾 שמור</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moRem' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">🔔 תזכורת</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg"><label className="fl">תאריך</label><input className="fi" id="rem_date" type="date" /></div>
            <div className="fg"><label className="fl">הערה</label><input className="fi" id="rem_note" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" onClick={async () => {
              await apiRef.current.saveReminder({ claimId: curId || '', date: val(null, 'rem_date'), note: val(null, 'rem_note'), owner: actor.full_name, sent: 'false' });
              toast('תזכורת נוספה');
              setModal('moCard');
            }}>💾 שמור</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moMailFu' ? 'open' : ''}`} data-testid="mo-mail-fu">
        <div className="modal modal-md">
          <div className="mh"><div className="mh-t">{fuEditPurpose === 'scheduled_send' ? '📅 עריכת מייל מתוזמן' : fuKind === 'email_repeat' ? '📬 מייל חוזר' : '📬 מעקב מייל / Follow-up'}</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div style={{ fontSize: 11, color: 'var(--yn2)', marginBottom: 10 }}>{fuEditPurpose === 'scheduled_send' ? 'עריכת מייל מתוזמן חד-פעמי. לא Follow-up. Dry Run — אין שליחה חיה עד אישור נפרד.' : fuKind === 'email_repeat' ? 'מייל חוזר: אם אין תשובה — שלח שוב לפי התדירות. ייעצר כשתתקבל תשובה. לא Follow-up ולא מייל מתוזמן חד-פעמי. Dry Run.' : 'Dry Run בלבד. Follow-up הוא מעקב אם אין תשובה — לא שולח כל X ימים.'}</div>
            <div className="fg"><label className="fl">נמען</label>
              <select className="fse fi" id="fu_who" data-testid="fu-who" onChange={async (e) => {
                const w = e.target.value;
                const c = cur;
                if (w === 'client') setVal('fu_to', c?.clientEmail || '');
                else if (w === 'insurer') setVal('fu_to', c?.insEmail || c?.insRepEmail || '');
                const tplKey = w === 'client' ? 'client_reminder' : 'status_request';
                if (c && !fuEditId) {
                  const filled = await apiRef.current.fillTemplate(tplKey, {
                    ...c,
                    claimNum: workClaimNum(c),
                    clientName: c.clientName || '',
                    plate: c.plate || '',
                    status: c.status || '',
                  });
                  if (filled.subject) setVal('fu_subj', filled.subject);
                  if (filled.body) setVal('fu_body', filled.body);
                }
              }}>
                <option value="insurer">חברת הביטוח</option>
                <option value="client">לקוח</option>
                <option value="other">כתובת אחרת</option>
              </select>
            </div>
            <div className="fg"><label className="fl">כתובת נמען *</label><input className="fi" id="fu_to" data-testid="fu-to" type="text" inputMode="email" autoComplete="off" /></div>
            <div className="fg"><label className="fl">מועד שליחה *</label><input className="fi" id="fu_when" data-testid="fu-when" type="datetime-local" /></div>
            {fuEditPurpose !== 'scheduled_send' ? (
            <>
            <div className="fg"><label className="fl">סוג</label>
              <select className="fse fi" id="fu_kind" data-testid="fu-kind" value={fuKind} onChange={(e) => setFuKind(e.target.value === 'email_repeat' ? 'email_repeat' : 'email_once')}>
                <option value="email_once">מעקב — אם אין תשובה</option>
                <option value="email_repeat">מייל חוזר לפי תדירות</option>
              </select>
            </div>
            {fuKind === 'email_repeat' ? (
              <div className="fg"><label className="fl">אם אין תשובה — שלח שוב</label>
                <RecurringDaysPicker days={fuRepeatDays} testPrefix="rec-days" onChange={setFuRepeatDays} />
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>ייעצר אוטומטית כשתתקבל תשובה בתיק. Dry Run.</div>
              </div>
            ) : (
            <div className="fg"><label className="fl">אם אין תשובה בתוך</label>
              <FollowupDaysPicker
                days={fuWaitDays}
                testPrefix="fu-days"
                onChange={(n) => {
                  setFuWaitDays(n);
                  setVal('fu_repeat', String(n));
                  setVal('fu_when', toLocalInput(new Date(Date.now() + n * 86400000).toISOString()));
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>מעקב בלבד. לא שולח מייל כל X ימים.</div>
              <input className="fi" id="fu_repeat" type="hidden" value={fuWaitDays} readOnly />
            </div>
            )}
            </>
            ) : <input type="hidden" id="fu_kind" value="email_once" readOnly />}
            {fuEditPurpose !== 'scheduled_send' ? (
            <div className="fg"><label className="fl">עצור אחרי (אופציונלי)</label><input className="fi" id="fu_stop" type="datetime-local" /></div>
            ) : null}
            <div className="fg"><label className="fl">צירוף מסמכים מדויק מתיק זה</label>
              <select className="fse fi" id="fu_attach">
                <option value="none">רק הקבצים שיסומנו למטה</option>
                <option value="received">מסמכים שהתקבלו בתיק</option>
              </select>
              <div className="pick-list pick-list-mail" data-testid="fu-file-picker" style={{ marginTop: 6 }}>
                {docs.files.length === 0 ? <div style={{ color: 'var(--t3)', fontSize: 12, padding: 6 }}>אין מסמכים בתיק זה</div>
                  : docs.files.map((f) => (
                    <label key={f.id} className="pick-row">
                      <input type="checkbox" checked={fuFileIds.includes(f.id)} onChange={(e) => {
                        setFuFileIds((prev) => e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id));
                      }} />
                      <span>{f.original_name}</span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="fg"><label className="fl">נושא</label><input className="fi" id="fu_subj" /></div>
            <div className="fg"><label className="fl">תוכן</label><textarea className="fta" id="fu_body" style={{ minHeight: 120 }} /></div>
            {isSuperAdmin && (
              <label style={{ display: 'flex', gap: 8, fontSize: 12, marginTop: 8 }}>
                <input type="checkbox" id="fu_closed" /> אפשר גם בתיק סגור (super_admin)
              </label>
            )}
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" data-testid="fu-save" onClick={async () => {
              const to = val(null, 'fu_to');
              const when = val(null, 'fu_when');
              if (!to || !when) { toast('נמען ומועד חובה', 'err'); return; }
              const whenIso = new Date(when).toISOString();
              if (Number.isNaN(Date.parse(whenIso))) { toast('מועד לא תקין', 'err'); return; }
              const stop = val(null, 'fu_stop');
              const kind = fuEditPurpose === 'scheduled_send' ? 'email_once' : fuKind;
              const who = val(null, 'fu_who') || 'other';
              const selectedFiles = docs.files.filter((f) => fuFileIds.includes(f.id));
              const repeatDays = kind === 'email_repeat' ? normalizeRecurringDays(fuRepeatDays) : 0;
              const existingRepeat = !fuEditId && kind === 'email_repeat'
                ? mailFollowups.find((f) => f.status === 'scheduled' && f.mail_kind === 'email_repeat' && f.mail_to === to)
                : null;
              const r = await apiRef.current.upsertMailFollowup({
                id: fuEditId || existingRepeat?.id || undefined,
                claim_id: curId,
                mail_to: to,
                mail_subject: val(null, 'fu_subj'),
                mail_body: val(null, 'fu_body'),
                mail_kind: kind,
                attach_mode: val(null, 'fu_attach') || 'none',
                repeat_every_days: kind === 'email_repeat' ? String(repeatDays) : '',
                wait_days: fuEditPurpose === 'scheduled_send' || kind === 'email_repeat' ? '' : fuWaitDays,
                next_run_at: whenIso,
                stop_at: stop ? new Date(stop).toISOString() : '',
                allow_on_closed: isSuperAdmin && !!(document.getElementById('fu_closed') as HTMLInputElement | null)?.checked,
                recipient_kind: who,
                purpose: fuEditPurpose || (kind === 'email_repeat' ? 'recurring_send' : undefined),
                file_ids: selectedFiles.map((f) => f.id),
                file_names: selectedFiles.map((f) => f.original_name),
              });
              if (!r.success) { toast(r.error || 'שגיאה', 'err'); return; }
              if (curId && fuEditPurpose === 'scheduled_send') {
                await apiRef.current.logHistory(curId, fuEditId ? 'עודכן מייל מתוזמן' : 'הוגדר מייל מתוזמן', `${to} · ${fmtDay(whenIso)} ${fmtClock(whenIso)}`, 'mail_scheduled');
              } else if (curId && kind === 'email_repeat') {
                await apiRef.current.logHistory(curId, (fuEditId || existingRepeat) ? 'עודכן מייל חוזר' : 'הוגדר מייל חוזר', `${to} · ${recurringLabel(repeatDays)}`, 'mail_recurring');
              }
              toast(fuEditPurpose === 'scheduled_send'
                ? (fuEditId ? 'המייל המתוזמן עודכן (Dry Run)' : 'מייל מתוזמן נשמר (Dry Run)')
                : kind === 'email_repeat'
                  ? ((fuEditId || existingRepeat) ? 'המייל החוזר עודכן (Dry Run)' : 'מייל חוזר נשמר (Dry Run)')
                  : (fuEditId ? 'המעקב עודכן' : 'מעקב מייל הוגדר (Dry Run)'));
              setFuEditPurpose('');
              setFuEditId(null);
              setCardTab('mailfu');
              setModal('moCard');
              if (curId) await loadCardData(curId);
              await loadAll();
            }}>{fuEditPurpose === 'scheduled_send' ? '💾 שמור תזמון' : fuKind === 'email_repeat' ? '💾 שמור מייל חוזר' : '💾 שמור מעקב'}</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moTreat' ? 'open' : ''}`} data-testid="treat-ops-v3">
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">עדכון טיפול</div>
            <button className="mcl" data-testid="treat-back" onClick={() => setModal('moCard')}>✕</button>
          </div>
          <div className="mb">
            {treatSendOk ? <div data-testid="treat-send-ok" style={{ background: 'rgba(34,197,94,.12)', border: '1px solid var(--gn2)', borderRadius: 7, padding: 8, marginBottom: 10, fontSize: 12 }}>המייל נשלח בהצלחה. עדכון הטיפול לא שולח שוב.</div> : null}
            <div style={{ fontSize: 12, marginBottom: 8 }}><b>פעולה:</b> {treatAction || cur?.treatmentPendingAction || '—'}</div>
            <div style={{ fontSize: 12, marginBottom: 10 }}><b>סטטוס נוכחי:</b> {cur?.status || '—'}</div>
            <div className="fg"><label className="fl">עדכון סטטוס</label>
              <select className="fse fi" id="tr_status" data-testid="treat-status" defaultValue={STATUS_UNCHANGED}>
                <option value={STATUS_UNCHANGED}>הסטטוס ללא שינוי</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value={STATUS_MANUAL}>אחר / עדכון ידני</option>
              </select>
            </div>
            <div className="fg"><label className="fl">עדכון ידני</label><textarea className="fta" id="tr_manual" data-testid="treat-manual" placeholder="אם נבחר אחר" /></div>
            <div className="fg"><label className="fl">הערה</label><input className="fi" id="tr_note" data-testid="treat-note" /></div>
            <div className="fg"><label className="fl">תאריך טיפול הבא</label>
              <input className="fi" id="tr_next" data-testid="treat-next" type="date" />
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>חובה בתיק פעיל. לא נדרש אם הסטטוס הסתיים / שולם / נדחה או שהתיק בארכיון.</div>
            </div>
          </div>
          <div className="mf">
            <button className="btn btn-g" disabled={treatBusy} onClick={() => setModal('moCard')}>חזור לתיק</button>
            <button className="btn btn-p" data-testid="treat-save" disabled={treatBusy} onClick={() => void submitTreat()}>{treatBusy ? 'שומר…' : 'שמור וסיים'}</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moArchive' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">העבר לארכיון</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb" style={{ fontSize: 13, lineHeight: 1.6 }}>התיק יצא מרשימת התיקים הפעילים. מסמכים, מיילים, היסטוריה ומשימות לא יימחקו.</div>
          <div className="mf">
            <button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-p" data-testid="archive-confirm" onClick={async () => {
              if (!curId) return;
              const r = await apiRef.current.archiveClaim(curId);
              if (!r.success) { toast(String(r.error || 'ארכיון נכשל'), 'err'); return; }
              setModal(null);
              await loadAll();
              toast('התיק הועבר לארכיון');
            }}>העבר לארכיון</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moSentPreview' ? 'open' : ''}`}>
        <div className="modal modal-md">
          <div className="mh"><div className="mh-t">סריקת מיילים יוצאים — תצוגה בלבד</div><button className="mcl" onClick={() => setModal(null)}>✕</button></div>
          <div className="mb" data-testid="sent-preview-body">
            <div style={{ fontSize: 12, color: 'var(--yn2)', fontWeight: 700, marginBottom: 8 }}>{sentPreview?.note || 'SCAN/PREVIEW בלבד. אין Import.'}</div>
            <div style={{ fontSize: 12, marginBottom: 10 }}>
              נסרקו {sentPreview?.listed || 0} מתוך {sentPreview?.resultSizeEstimate || 0}
              {sentPreview?.truncated ? ' (חלקי — 40 האחרונים)' : ''}
            </div>
            <div className="dcg" style={{ marginBottom: 12 }}>
              {([
                ['רלוונטיים', sentPreview?.summary?.relevant_messages],
                ['התאמות ודאיות', sentPreview?.summary?.certain_claim_matches],
                ['קבצים', sentPreview?.summary?.attachments],
                ['כבר בתיק', sentPreview?.summary?.already_in_claim],
                ['חדשים ודאיים', sentPreview?.summary?.certain_new],
                ['Review', sentPreview?.summary?.needs_review],
                ['לא ניתן לשייך', sentPreview?.summary?.unmatched],
              ] as Array<[string, number | undefined]>).map(([label, n]) => (
                <div key={label} className="dc">
                  <div className="dc-bar y" /><div className="dc-n y">{n || 0}</div><div className="dc-l">{label}</div>
                </div>
              ))}
            </div>
            {(sentPreview?.rows || []).slice(0, 20).map((row) => {
              const match = (row.match && typeof row.match === 'object') ? row.match as { decision?: string; reason?: string; claimId?: string } : {};
              const atts = Array.isArray(row.attachments) ? row.attachments as Array<{ filename?: string; status?: string; reason?: string }> : [];
              return (
                <div key={String(row.message_id)} className="gmail-card" style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{String(row.subject || '(ללא נושא)')}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{String(row.to || '')} · {String(row.date || '')}</div>
                  <div style={{ fontSize: 12, margin: '4px 0', color: match.decision === 'auto' ? 'var(--gn2)' : 'var(--yn2)' }}>
                    {match.decision === 'auto' ? `התאמה ודאית: ${match.claimId}` : match.reason || 'דורש Review'}
                  </div>
                  {atts.map((a, i) => (
                    <div key={`${a.filename}-${i}`} style={{ fontSize: 11 }}>{a.filename} · {a.status} · {a.reason}</div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="mf">
            <button className="btn btn-g" onClick={() => setModal(null)}>סגור</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moDelete' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">מחק תיק</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div data-testid="delete-warning" style={{ color: 'var(--rd2)', fontWeight: 700, marginBottom: 8 }}>אתה עומד למחוק את התיק. האם אתה בטוח?</div>
            <div style={{ fontSize: 12, marginBottom: 8 }}>מחיקה רכה בלבד — המסמכים, המיילים וההיסטוריה נשמרים. הקלד «מחק» לאישור.</div>
            <input className="fi" data-testid="delete-typed" value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} placeholder="מחק" />
          </div>
          <div className="mf">
            <button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-rd" data-testid="delete-confirm" disabled={deleteTyped !== 'מחק'} onClick={async () => {
              if (!curId || deleteTyped !== 'מחק') return;
              const r = await apiRef.current.softDeleteClaim(curId, deleteTyped);
              if (!r.success) { toast(String(r.error || 'מחיקה נכשלה'), 'err'); return; }
              setModal(null);
              setCurId('');
              await loadAll();
              toast('התיק הוסתר (soft delete)');
            }}>מחק תיק</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moClose' ? 'open' : ''}`}>
        <div className="modal modal-sm">
          <div className="mh"><div className="mh-t">🔒 סגירת תיק</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb">
            <div className="fg"><label className="fl">סטטוס סגירה *</label>
              <select className="fse fi" id="cl_status"><option value="הסתיים">הסתיים</option><option value="שולם">שולם</option><option value="נדחה">נדחה</option><option value="הועבר לטיפול משפטי">הועבר לטיפול משפטי</option></select>
            </div>
            <div className="fg"><label className="fl">סיבת סגירה *</label>
              <select className="fse fi" id="cl_reason"><option value="">— בחר סיבה —</option>{CLOSE_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
            </div>
            <div className="fg"><label className="fl">הערת סגירה</label><textarea className="fta" id="cl_note" /></div>
          </div>
          <div className="mf"><button className="btn btn-g" onClick={() => setModal('moCard')}>ביטול</button>
            <button className="btn btn-rd" onClick={async () => {
              const reason = val(null, 'cl_reason'); if (!reason) { toast('נא לבחור סיבת סגירה', 'err'); return; }
              const r = await apiRef.current.closeClaim(curId || '', reason, val(null, 'cl_note'), val(null, 'cl_status'));
              if (r.success) { setModal(null); await loadAll(); toast(`תיק נסגר: ${reason}`); }
            }}>🔒 סגור תיק</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moSum' || modal === 'moExport' ? 'open' : ''}`}>
        <div className="modal modal-md">
          <div className="mh"><div className="mh-t">{modal === 'moExport' ? '📄 סיכום חיצוני — מותר להעברה (ניתן להעתיק ולערוך לפני צירוף)' : '📄 היסטוריה פנימית — לא לשלוח החוצה'}</div><button className="mcl" onClick={() => setModal('moCard')}>✕</button></div>
          <div className="mb"><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Heebo,sans-serif', fontSize: 12, lineHeight: 1.8, color: 'var(--t2)' }}>{modal === 'moExport' ? exportText : sumText}</pre></div>
          <div className="mf">
            <button className="btn btn-g" onClick={() => navigator.clipboard.writeText(modal === 'moExport' ? exportText : sumText).then(() => toast('הועתק'))}>📋 העתק</button>
            <button className="btn btn-g" onClick={() => setModal('moCard')}>סגור</button>
          </div>
        </div>
      </div>

      <div className={`ov ${modal === 'moTemplates' ? 'open' : ''}`}>
        <div className="modal modal-md">
          <div className="mh"><div className="mh-t">📝 תבניות הודעות</div><button className="mcl" onClick={() => setModal(null)}>✕</button></div>
          <div className="mb">
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
              {Object.keys(tpl).map((k) => (
                <button key={k} className="btn btn-g btn-sm" onClick={async () => {
                  setCurTpl(k);
                  const claimId = val(null, 'tpl_claim');
                  const c = claimId ? claims.find((x) => x.id === claimId) : null;
                  if (c) {
                    const r = await apiRef.current.fillTemplate(k, { ...c, claimNum: workClaimNum(c) });
                    setVal('tpl_subj', r.subject || '');
                    setVal('tpl_body', r.body || '');
                  } else {
                    setVal('tpl_subj', tpl[k].subject || '');
                    setVal('tpl_body', tpl[k].body || '');
                  }
                }}>{tpl[k].name}</button>
              ))}
            </div>
            <div className="fg"><label className="fl">תיק לשיוך</label>
              <select className="fse fi" id="tpl_claim" onChange={async () => { if (curTpl) {
                const c = claims.find((x) => x.id === val(null, 'tpl_claim'));
                if (c) { const r = await apiRef.current.fillTemplate(curTpl, { ...c, claimNum: workClaimNum(c) }); setVal('tpl_subj', r.subject || ''); setVal('tpl_body', r.body || ''); }
              } }}>
                <option value="">— ללא תיק ספציפי —</option>
                {claims.map((c) => <option key={c.id} value={c.id}>{c.id} – {c.clientName} – {c.plate || ''}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">נושא</label><input className="fi" id="tpl_subj" /></div>
            <div className="fg"><label className="fl">תוכן</label><textarea className="fta" id="tpl_body" style={{ minHeight: 130 }} /></div>
          </div>
          <div className="mf">
            <button className="btn btn-g" onClick={() => setModal(null)}>סגור</button>
            <button className="btn btn-g btn-sm" onClick={() => navigator.clipboard.writeText(val(null, 'tpl_body')).then(() => toast('הועתק'))}>📋 העתק</button>
          </div>
        </div>
      </div>

      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.type === 'err' ? '❌ ' : t.type === 'inf' ? 'ℹ️ ' : '✅ '}{t.msg}</div>)}
      </div>
    </div>
  );
}
