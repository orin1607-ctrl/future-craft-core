/**
 * Rows the claims chat writes for tasks, reminders, history notes and manual WhatsApp schedules —
 * the same shapes the claims screen writes (claimsService: saveTask, saveReminder, appendHistory,
 * createNotification, saveCommEntry), so the screen shows them like its own. Pure; no I/O.
 */
import {
  addCalendarDays,
  findHeldDuplicate,
  israelDateTimeParts,
  israelLocalToUtc,
  normalizeWaPhone,
  waPhoneError,
  type WaScheduleRow,
} from './claimWhatsAppCore.ts';

export type Row = Record<string, string>;
export type DbRow = { id: string; claim_id: string; row_data: Row; action?: string };

export function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/** Hebrew local time, as the screen's nowHe() shows it (Israel time zone on the server). */
export function nowHe(now = new Date()) {
  return now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** YYYY-MM-DD from YYYY-MM-DD or D/M/YYYY; '' when empty; null when invalid. */
export function normalizeDate(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  let y: number, m: number, d: number;
  let hit = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (hit) { y = +hit[1]; m = +hit[2]; d = +hit[3]; } else {
    hit = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (!hit) return null;
    d = +hit[1]; m = +hit[2]; y = hit[3].length === 2 ? 2000 + +hit[3] : +hit[3];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** History entry, same shape as appendHistory in the claims screen. */
export function historyRow(input: { claimId: string; action: string; note?: string; type: string; before?: string; after?: string; by: string; at: string }): DbRow {
  const id = newId('HIS');
  return {
    id,
    claim_id: input.claimId,
    row_data: {
      id,
      claimId: input.claimId,
      action: input.action,
      note: input.note || '',
      type: input.type,
      valueBefore: input.before || '',
      valueAfter: input.after || '',
      by: input.by,
      at: input.at,
    },
  };
}

export function notificationRow(claimId: string, type: string, message: string, at: string): DbRow {
  const id = newId('NTF');
  return { id, claim_id: claimId, row_data: { id, claimId, type, message, read: 'false', createdAt: at } };
}

// ---------------- Tasks ----------------

const normText = (v: unknown) => String(v ?? '').replace(/[\s"'״׳.,:;!?-]+/g, ' ').trim().toLowerCase();

export function findOpenDuplicateTask(existing: Row[], action: string) {
  const want = normText(action);
  return existing.find((t) => t.done !== 'true' && t.workStatus !== 'done' && normText(t.action) === want) || null;
}

export type TaskInput = { action: unknown; owner?: unknown; dueDate?: unknown; note?: unknown };

export function planTask(claimId: string, input: TaskInput, existing: Row[]) {
  const action = clean(input.action, 200);
  if (!action) return { ok: false as const, error: 'חסר תיאור משימה' };
  const dueDate = normalizeDate(input.dueDate);
  if (dueDate === null) return { ok: false as const, error: 'תאריך יעד לא תקין' };
  const dup = findOpenDuplicateTask(existing, action);
  if (dup) return { ok: false as const, error: `כבר קיימת משימה פתוחה זהה בתיק (${dup.id}). לא נוצרה כפילות.`, duplicateId: dup.id };
  return {
    ok: true as const,
    task: { claimId, action, owner: clean(input.owner, 80), dueDate, note: clean(input.note, 500) },
  };
}

/** Task row + history + notification, as saveTask writes them for a new staff task. */
export function taskRecords(task: { claimId: string; action: string; owner: string; dueDate: string; note: string }, by: string, at: string) {
  const id = newId('TSK');
  const row: Row = {
    id,
    claimId: task.claimId,
    action: task.action,
    owner: task.owner || by,
    dueDate: task.dueDate,
    note: task.note,
    done: 'false',
    createdAt: at,
    createdBy: by,
    source: 'דליה AI',
  };
  const note = [task.note, task.dueDate ? `יעד: ${task.dueDate}` : '', `נוצר ע״י: ${by} (דרך דליה AI)`].filter(Boolean).join(' · ');
  return {
    task: { id, claim_id: task.claimId, row_data: row } as DbRow,
    history: historyRow({ claimId: task.claimId, action: `משימה נוספה: ${task.action}`, note, type: 'task', after: 'false', by, at }),
    notification: notificationRow(task.claimId, 'task', `משימה: ${task.action}`, at),
  };
}

// ---------------- Reminders ----------------

export function planReminder(claimId: string, input: { date: unknown; note: unknown; owner?: unknown }, now = new Date()) {
  const date = normalizeDate(input.date);
  if (!date) return { ok: false as const, error: 'תאריך תזכורת חסר או לא תקין' };
  const today = israelDateTimeParts(now).date;
  if (date < today) return { ok: false as const, error: 'תאריך התזכורת כבר עבר' };
  const note = clean(input.note, 500);
  if (!note) return { ok: false as const, error: 'חסר נוסח לתזכורת' };
  return { ok: true as const, reminder: { claimId, date, note, owner: clean(input.owner, 80) } };
}

/** Reminder row + history, as saveReminder writes them. */
export function reminderRecords(rem: { claimId: string; date: string; note: string; owner: string }, by: string, at: string) {
  const id = newId('REM');
  return {
    reminder: { id, claim_id: rem.claimId, action: 'note', row_data: { id, claimId: rem.claimId, date: rem.date, note: rem.note, owner: rem.owner || by, sent: 'false', createdAt: at } } as DbRow,
    history: historyRow({ claimId: rem.claimId, action: `תזכורת נוספה: ${rem.date}`, note: rem.note, type: 'reminder', by, at }),
  };
}

/** Change date / text, or cancel. A cancelled or already-sent reminder is never brought back. */
export function planReminderUpdate(current: Row, patch: { date?: unknown; note?: unknown; cancel?: unknown }, now = new Date()) {
  if (current.cancelled === 'true') return { ok: false as const, error: 'התזכורת בוטלה בעבר ואינה מופעלת מחדש. אפשר ליצור תזכורת חדשה.' };
  if (current.sent === 'true') return { ok: false as const, error: 'התזכורת כבר הופעלה ואינה ניתנת לשינוי. אפשר ליצור תזכורת חדשה.' };
  const next: Row = { ...current };
  const changes: string[] = [];
  if (patch.cancel === true || patch.cancel === 'true') {
    next.cancelled = 'true';
    next.cancelledAt = now.toISOString();
    changes.push('בוטלה');
    return { ok: true as const, next, changes, cancelled: true };
  }
  if (patch.date !== undefined && String(patch.date).trim()) {
    const date = normalizeDate(patch.date);
    if (!date) return { ok: false as const, error: 'תאריך לא תקין' };
    if (date < israelDateTimeParts(now).date) return { ok: false as const, error: 'התאריך כבר עבר' };
    if (date !== current.date) { changes.push(`תאריך: ${current.date || '(ריק)'} ← ${date}`); next.date = date; }
  }
  if (patch.note !== undefined && String(patch.note).trim()) {
    const note = clean(patch.note, 500);
    if (note !== current.note) { changes.push(`נוסח: ${note}`); next.note = note; }
  }
  if (!changes.length) return { ok: false as const, error: 'אין שינוי לעדכן' };
  return { ok: true as const, next, changes, cancelled: false };
}

// ---------------- WhatsApp (manual, existing schedule) ----------------

/** When to show the manual-send alert: now, a day offset (0 today, 1 tomorrow), or an explicit date. */
export function resolveWaWhen(input: { when?: unknown; date?: unknown; time?: unknown; relative_day?: unknown }, now = new Date()) {
  if (String(input.when || '') === 'now') {
    return { ok: true as const, plannedAt: now.toISOString(), label: 'עכשיו' };
  }
  const time = String(input.time || '09:00').trim();
  if (!/^\d{1,2}:\d{2}$/.test(time)) return { ok: false as const, error: 'שעה לא תקינה (HH:MM)' };
  const hhmm = time.padStart(5, '0');
  let date = '';
  if (input.relative_day !== undefined && input.relative_day !== null && String(input.relative_day) !== '') {
    const n = Number(input.relative_day);
    if (!Number.isInteger(n) || n < 0 || n > 60) return { ok: false as const, error: 'מספר ימים לא תקין' };
    date = addCalendarDays(israelDateTimeParts(now).date, n);
  } else {
    const d = normalizeDate(input.date);
    if (!d) return { ok: false as const, error: 'חסר מועד: ציין when=now, relative_day או date' };
    date = d;
  }
  const at = israelLocalToUtc(date, hhmm, now);
  if (!at.ok) return { ok: false as const, error: at.error };
  return { ok: true as const, plannedAt: at.runAtIso, label: at.israelLabel };
}

export function planWaSchedule(
  claimId: string,
  input: { phone: unknown; body: unknown; contact_name?: unknown },
  when: { plannedAt: string; label: string },
  held: WaScheduleRow[],
) {
  const phone = String(input.phone ?? '').trim();
  const phoneErr = waPhoneError(phone);
  if (!phone || phoneErr) return { ok: false as const, error: phone ? phoneErr : 'חסר מספר WhatsApp לנמען' };
  const body = String(input.body ?? '').trim().slice(0, 2000);
  if (!body) return { ok: false as const, error: 'חסר נוסח הודעה' };
  if (findHeldDuplicate(held, phone, body, when.plannedAt)) {
    return { ok: false as const, error: 'כבר קיימת הודעה ממתינה עם אותו נמען, נוסח ומועד' };
  }
  return {
    ok: true as const,
    wa: { claimId, phone, phoneDigits: normalizeWaPhone(phone), body, contactName: clean(input.contact_name, 80), plannedAt: when.plannedAt, plannedLabel: when.label },
  };
}

/** Same row the WhatsApp modal saves on "schedule" (saveCommEntry) — the existing due list alerts on it. */
export function waScheduleRecords(wa: { claimId: string; phone: string; body: string; contactName: string; plannedAt: string; plannedLabel: string }, by: string, at: string) {
  const id = newId('COM');
  const row: Row = {
    id,
    claimId: wa.claimId,
    type: 'wa',
    phone: wa.phone,
    body: wa.body,
    contactName: wa.contactName,
    direction: 'out',
    waStatus: 'scheduled_blocked',
    provider: 'none',
    delivery: 'not_sent',
    plannedAt: wa.plannedAt,
    plannedLabel: wa.plannedLabel,
    at,
    by,
    source: 'דליה AI',
  };
  return {
    comm: { id, claim_id: wa.claimId, row_data: row } as DbRow,
    history: historyRow({ claimId: wa.claimId, action: 'תוזמנה WhatsApp (לא נשלחה)', note: wa.body, type: 'wa', after: 'scheduled_blocked', by, at }),
  };
}

// ---------------- WhatsApp recipient: whose number is it? ----------------

export type RecipientRole = 'client' | 'surveyor' | 'insurer' | 'third_party' | 'lawyer' | 'other';

const ROLE_LABELS: Record<RecipientRole, string> = {
  client: 'לקוח',
  surveyor: 'שמאי',
  insurer: 'חברת ביטוח',
  third_party: 'צד ג׳',
  lawyer: 'עורך דין',
  other: 'איש קשר',
};

export function normalizeRecipientRole(raw: unknown): RecipientRole | '' {
  const k = String(raw ?? '').trim().toLowerCase();
  if (!k) return '';
  if (k === 'client' || k.includes('לקוח') || k.includes('מבוטח')) return 'client';
  if (k === 'surveyor' || k.includes('שמאי')) return 'surveyor';
  if (k === 'insurer' || k === 'agent' || k.includes('ביטוח') || k.includes('סוכן') || k.includes('נציג')) return 'insurer';
  if (k === 'third_party' || k.includes('צד ג')) return 'third_party';
  if (k === 'lawyer' || k.includes('עו"ד') || k.includes('עו״ד') || k.includes('עורך דין')) return 'lawyer';
  return 'other';
}

export type PhoneOwner = { digits: string; role: RecipientRole; name: string };

/** Phone numbers saved on the claim (its own fields and linked contacts), with who each belongs to. */
export function claimPhoneOwners(
  rowData: Record<string, unknown>,
  contacts: Array<{ full_name?: unknown; role?: unknown; phones?: unknown[] }> = [],
): PhoneOwner[] {
  const out: PhoneOwner[] = [];
  const add = (phone: unknown, role: RecipientRole, name: unknown) => {
    const digits = normalizeWaPhone(String(phone ?? ''));
    if (digits.length >= 11 && !out.some((o) => o.digits === digits && o.role === role)) out.push({ digits, role, name: String(name ?? '').trim() });
  };
  add(rowData.clientPhone, 'client', rowData.clientName);
  add(rowData.phoneMobile, 'client', rowData.clientName);
  add(rowData.survPhone, 'surveyor', rowData.surveyor);
  add(rowData.insRepPhone, 'insurer', rowData.insRepName);
  add(rowData.thirdPhone, 'third_party', rowData.thirdParty);
  add(rowData.legalPhone, 'lawyer', rowData.legalLawyer);
  for (const c of contacts) {
    const role = normalizeRecipientRole(c.role) || 'other';
    for (const p of c.phones || []) add(p, role, c.full_name);
  }
  return out;
}

/**
 * Checks the recipient before a WhatsApp card is shown. Refuses when the number belongs to someone else
 * than the role asked for (e.g. the surveyor's number for a message to the client).
 */
export function checkWaRecipient(owners: PhoneOwner[], phone: string, requestedRole: unknown) {
  const digits = normalizeWaPhone(phone);
  const hits = owners.filter((o) => o.digits === digits);
  const wanted = normalizeRecipientRole(requestedRole);
  const roleLabel = (r: RecipientRole) => ROLE_LABELS[r];
  if (!hits.length) {
    return { ok: true as const, ownerLabel: '', warning: 'המספר אינו שמור בתיק. ודא שזה הנמען הנכון.' };
  }
  if (wanted && wanted !== 'other' && !hits.some((h) => h.role === wanted)) {
    const who = hits.map((h) => `${roleLabel(h.role)}${h.name ? ` (${h.name})` : ''}`).join(', ');
    return { ok: false as const, error: `המספר ${phone} שייך בתיק ל${who}, לא ל${roleLabel(wanted)}. לא הוכן כרטיס.` };
  }
  const owner = hits.find((h) => !wanted || h.role === wanted) || hits[0];
  return { ok: true as const, ownerLabel: `${roleLabel(owner.role)}${owner.name ? ` (${owner.name})` : ''}`, warning: '' };
}

/** Puts the secure link into the message: replaces {link}, otherwise adds it on its own line. */
export function withShareLink(body: string, url: string) {
  if (!url) return body;
  return body.includes('{link}') ? body.split('{link}').join(url) : `${body}\n${url}`;
}
