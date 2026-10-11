/** Claims WhatsApp drafts and held schedules. No provider send. */

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
  if (status === 'scheduled_blocked') return 'מתוזמן וחסום — לא יישלח אוטומטית';
  if (status === 'cancelled') return 'בוטל לפני שליחה';
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
};

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
