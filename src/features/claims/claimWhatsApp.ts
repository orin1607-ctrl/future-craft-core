/** Claims WhatsApp drafts and manual schedules. No provider send. */
import { TEMPLATES } from './claimsConstants';

export const WA_TEMPLATE_KEYS = ['wa_status', 'wa_docs', 'wa_payment'] as const;

export type WaDeliveryStatus = 'opened_not_sent' | 'scheduled_blocked' | 'cancelled';

const SENT_WORDS = new Set(['sent', 'delivered', 'submitted', 'success']);

export function fillWaPlaceholders(body: string, claim: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(claim[key] ?? ''));
}

export function normalizeWaPhone(raw: string) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  return digits;
}

export function waPhoneError(raw: string) {
  const digits = normalizeWaPhone(raw);
  if (digits.length < 11 || digits.length > 15 || !digits.startsWith('972')) return 'מספר WhatsApp לא תקין';
  return '';
}

export function waMeHref(phone: string, message: string) {
  const digits = normalizeWaPhone(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function waStatusLabel(status: string) {
  if (status === 'opened_not_sent') return 'נפתח ב-WhatsApp — לא סומן כנשלח';
  if (status === 'scheduled_blocked') return 'מתוזמן לשליחה ידנית — לא נשלח';
  if (status === 'cancelled') return 'בוטל לפני שליחה';
  if (status === 'marked_sent_by_user') return 'סומן ידנית כנשלח';
  return 'לא נשלח';
}

export function waCountsAsSent(status: string) {
  return SENT_WORDS.has(String(status || '').toLowerCase());
}

export function israelLocalToUtc(date: string, time: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false as const, error: 'נא לבחור תאריך ושעה' };
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(guess).map((p) => [p.type, p.value]));
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  const run = new Date(guess.getTime() - (shown - guess.getTime()));
  if (Number.isNaN(run.getTime())) return { ok: false as const, error: 'מועד לא תקין' };
  if (run.getTime() < now.getTime() + 60_000) return { ok: false as const, error: 'המועד חייב להיות בעתיד לפי שעון ישראל' };
  const label = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(run);
  return { ok: true as const, runAtIso: run.toISOString(), israelLabel: label };
}

export type WaScheduleRow = {
  id?: string;
  waStatus?: string;
  phone?: string;
  body?: string;
  plannedAt?: string;
  contactName?: string;
  claimId?: string;
};

export function israelDateTimeParts(instant: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour.padStart(2, '0')}:${parts.minute.padStart(2, '0')}` };
}

function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const noon = new Date(Date.UTC(year, month - 1, day + days, 10, 0, 0));
  return israelDateTimeParts(noon).date;
}

function israelWeekday(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(new Date(Date.UTC(year, month - 1, day, 10, 0, 0)));
}

export function nextManualSendSlot(now = new Date(), preferredDate = '') {
  if (/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) {
    const preferred = israelLocalToUtc(preferredDate, '09:00', now);
    if (preferred.ok) return { date: preferredDate, time: '09:00' };
  }
  const today = israelDateTimeParts(now).date;
  for (let add = 0; add < 8; add += 1) {
    const date = addCalendarDays(today, add);
    const weekday = israelWeekday(date);
    if (weekday === 'Fri' || weekday === 'Sat') continue;
    const slot = israelLocalToUtc(date, '09:00', now);
    if (slot.ok) return { date, time: '09:00' };
  }
  const fallback = addCalendarDays(today, 1);
  return { date: fallback, time: '09:00' };
}

export type WaSuggestContact = { full_name: string; role: string; phone: string };

export function suggestWaPlan(
  claim: Record<string, string>,
  contacts: WaSuggestContact[],
  now = new Date(),
) {
  const status = String(claim.status || '');
  const templateKey = /מסמכ/.test(status) ? 'wa_docs' : /תשלום|יתרה/.test(status) ? 'wa_payment' : 'wa_status';
  const role = /שמאי/.test(status) ? 'surveyor' : /ביטוח/.test(status) ? 'insurer' : 'client';
  const roleLabel = role === 'surveyor' ? 'שמאי' : role === 'insurer' ? 'חברת ביטוח' : 'לקוח';
  const match = contacts.find((c) => c.role === role && c.phone && !waPhoneError(c.phone))
    || contacts.find((c) => c.role === 'client' && c.phone && !waPhoneError(c.phone));
  const phone = match?.phone || claim.clientPhone || claim.phoneMobile || '';
  const contactName = match?.full_name || claim.clientName || '';
  const tpl = TEMPLATES[templateKey];
  const body = fillWaPlaceholders(tpl?.body || '', { ...claim, claimNum: claim.claimNum || claim.id || '' });
  const slot = nextManualSendSlot(now, claim.nextDate || '');
  const reason = `לפי הסטטוס «${status || 'לא צוין'}» הוצע נוסח ${tpl?.name || ''} אל ${roleLabel}${contactName ? ` (${contactName})` : ''}, ב־${slot.date} בשעה ${slot.time}.`;
  return { templateKey, phone, contactName, body, date: slot.date, time: slot.time, reason };
}

export function isWaReady(row: WaScheduleRow, now = new Date()) {
  if (row.waStatus !== 'scheduled_blocked') return false;
  const at = Date.parse(String(row.plannedAt || ''));
  return Number.isFinite(at) && at <= now.getTime();
}

export function findHeldDuplicate(rows: WaScheduleRow[], phone: string, body: string, plannedAt: string, exceptId = '') {
  const target = normalizeWaPhone(phone);
  return rows.some((row) => (
    row.waStatus === 'scheduled_blocked'
    && row.id !== exceptId
    && normalizeWaPhone(row.phone || '') === target
    && String(row.body || '').trim() === body.trim()
    && String(row.plannedAt || '') === plannedAt
  ));
}
