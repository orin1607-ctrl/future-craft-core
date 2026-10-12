/** Claims WhatsApp drafts and manual schedules. No provider send. */
import { TEMPLATES } from './claimsConstants';
import { nextManualSendSlot, waPhoneError } from '../../../supabase/functions/_shared/claimWhatsAppCore.ts';

export {
  findHeldDuplicate,
  isWaReady,
  israelDateTimeParts,
  israelLocalToUtc,
  nextManualSendSlot,
  normalizeWaPhone,
  waMeHref,
  waPhoneError,
  type WaScheduleRow,
} from '../../../supabase/functions/_shared/claimWhatsAppCore.ts';

export const WA_TEMPLATE_KEYS = ['wa_status', 'wa_docs', 'wa_payment'] as const;

export type WaDeliveryStatus = 'opened_not_sent' | 'scheduled_blocked' | 'cancelled';

const SENT_WORDS = new Set(['sent', 'delivered', 'submitted', 'success']);

export function fillWaPlaceholders(body: string, claim: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(claim[key] ?? ''));
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
