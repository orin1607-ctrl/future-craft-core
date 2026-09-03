/** Claim-row work alerts + customer-request helpers. Reuses existing tasks / followups / notifications. No new tables. */

import { claimNeedsReturn, type ClaimRecord } from './claimsConstants';

export const CUSTOMER_REQUEST_KINDS: Array<{ key: string; label: string }> = [
  { key: 'send_doc', label: 'לשלוח מסמך' },
  { key: 'complete_form', label: 'להשלים טופס' },
  { key: 'schedule_surveyor', label: 'לתאם שמאי' },
  { key: 'present_car', label: 'להעמיד רכב לבדיקה' },
  { key: 'contact', label: 'ליצור קשר' },
  { key: 'other', label: 'פעולה אחרת' },
];

export const CUSTOMER_REQUEST_STATUSES: Array<{ key: string; label: string }> = [
  { key: 'pending', label: 'ממתין' },
  { key: 'sent', label: 'נשלח' },
  { key: 'done', label: 'בוצע' },
  { key: 'cancelled', label: 'בוטל' },
];

export type ClaimAlert = { key: string; label: string; tone: 'need' | 'wait' | 'info' };

export function customerKindLabel(key: string) {
  return CUSTOMER_REQUEST_KINDS.find((x) => x.key === key)?.label || key || 'בקשה ללקוח';
}

export function customerStatusLabel(key: string) {
  return CUSTOMER_REQUEST_STATUSES.find((x) => x.key === key)?.label || key || 'ממתין';
}

export function customerStatusOf(t: ClaimRecord): string {
  if (t.audience !== 'customer') return '';
  if (t.customerStatus) return t.customerStatus;
  if (t.done === 'true') return 'done';
  return 'pending';
}

export function isOpenCustomerTask(t: ClaimRecord): boolean {
  if (t.audience !== 'customer') return false;
  const st = customerStatusOf(t);
  return st === 'pending' || st === 'sent';
}

const REQUEST_TYPES: Array<{ re: RegExp; type: string; label: string }> = [
  { re: /אי[\s-]?הגשת|אי הגשת תביעה/, type: 'no_claim_form', label: 'טופס אי-הגשת תביעה' },
  { re: /רישיון נהיגה/, type: 'driver_license', label: 'רישיון נהיגה' },
  { re: /רישיון רכב/, type: 'vehicle_license', label: 'רישיון רכב' },
  { re: /הודעה על תאונה|טופס אירוע/, type: 'accident_notice', label: 'טופס הודעה על תאונה' },
  { re: /עותק.{0,12}פוליסה|פוליסת הביטוח|(?:נא |חסר.{0,12}|העביר.{0,18}|צרף.{0,18}|השלמ.{0,18})פוליסה/, type: 'policy', label: 'פוליסה' },
  { re: /אישור משטרה/, type: 'police', label: 'אישור משטרה' },
  { re: /דוח שמאי|שמאות/, type: 'surveyor_report', label: 'דוח שמאי' },
  { re: /חשבונית מוסך|חשבונית/, type: 'garage_invoice', label: 'חשבונית מוסך' },
  { re: /תמונ(?:ות|ה) נזק/, type: 'damage_photos', label: 'תמונות נזק' },
];

function requestHay(text: string) {
  return String(text || '')
    .split(/כמפורט בתקנון החברה|PERSONAL_MAIL_NR/)[0]
    .slice(0, 2500);
}

export function detectMailRequests(text: string): Array<{ type: string; label: string; kind: 'doc' | 'sign' | 'generic' }> {
  const hay = requestHay(text);
  const out: Array<{ type: string; label: string; kind: 'doc' | 'sign' | 'generic' }> = [];
  const sign = /לחתום|חתום על|ולהחזיר|החזרה חתומ/;
  for (const req of REQUEST_TYPES) {
    if (req.re.test(hay)) out.push({ type: req.type, label: req.label, kind: sign.test(hay) ? 'sign' : 'doc' });
  }
  if (!out.length && sign.test(hay)) {
    out.push({ type: 'sign_return', label: 'לחתום ולהחזיר את המסמך המצורף', kind: 'sign' });
  }
  if (!out.length && /השלמת מסמכים|מסמכים חסרים|נא להעביר|נא לצרף|אודה להשלמת|חוסרים/.test(hay)) {
    out.push({ type: 'docs_generic', label: 'השלמת מסמכים לפי הבקשה במייל', kind: 'generic' });
  }
  return out;
}

export function mailLooksInbound(fromAddr: string, ownMailbox: string) {
  const from = String(fromAddr || '').toLowerCase();
  const own = String(ownMailbox || '').toLowerCase();
  if (!from) return true;
  return !own || !from.includes(own);
}

/** Show treatment on imported mail: real inbound, or a document request even when From is our mailbox (self TEST). */
export function mailShowsTreatment(fromAddr: string, ownMailbox: string, text: string) {
  if (mailLooksInbound(fromAddr, ownMailbox)) return true;
  return detectMailRequests(text).length > 0;
}

export type AlertContext = {
  tasks: ClaimRecord[];
  notifs: ClaimRecord[];
  gmailPending: Array<Record<string, unknown>>;
  scheduledFollowups: Array<{ claim_id: string; status?: string }>;
};

export function buildClaimRowAlerts(c: ClaimRecord, ctx: AlertContext): ClaimAlert[] {
  const out: ClaimAlert[] = [];
  const add = (key: string, label: string, tone: ClaimAlert['tone']) => {
    if (!out.some((x) => x.key === key)) out.push({ key, label, tone });
  };

  const claimTasks = ctx.tasks.filter((t) => t.claimId === c.id);
  const unreadMail = ctx.notifs.some((n) => n.claimId === c.id && n.read !== 'true' && (n.type === 'gmail_auto' || n.type === 'gmail_review'));
  const pendingAssigned = ctx.gmailPending.some((p) => String(p.assigned_claim_id || '') === c.id && !p.imported_at);
  const mailTasks = claimTasks.filter((t) => t.gmailMessageId && t.done !== 'true');
  const insurerDoc = mailTasks.some((t) => t.requestKind === 'doc' || t.docState === 'missing' || t.docState === 'needs_review');
  const missingDoc = claimTasks.some((t) => t.docState === 'missing' && t.done !== 'true');
  const openCust = claimTasks.filter(isOpenCustomerTask);
  const scheduled = ctx.scheduledFollowups.some((f) => f.claim_id === c.id && (!f.status || f.status === 'scheduled'));

  if (unreadMail || pendingAssigned) add('new_mail', 'מייל חדש', 'need');
  if (mailTasks.length) add('need_reply', 'נדרש מענה', 'need');
  if (insurerDoc) add('insurer_doc', 'חברת הביטוח ביקשה מסמך', 'need');
  if (missingDoc) add('missing_doc', 'חסר מסמך', 'need');
  if (openCust.some((t) => customerStatusOf(t) === 'sent')) add('wait_client', 'ממתין ללקוח', 'wait');
  if (scheduled) add('mail_scheduled', 'מייל מתוזמן', 'info');
  if (openCust.length) add('cust_task', 'משימה ללקוח', 'wait');

  if (out.length) add('needs_action', 'נדרש טיפול', 'need');
  else if (claimNeedsReturn(c)) add('diary', 'טיפול לפי יומן', 'info');

  return out;
}

export function customerTaskHistoryAction(prev: ClaimRecord | null, next: ClaimRecord): { action: string; note: string } {
  const kind = customerKindLabel(next.customerKind || next.action || '');
  const text = next.requestText || next.note || '';
  const who = next.createdBy || next.owner || '';
  if (!prev) {
    return {
      action: next.audience === 'customer' ? 'משימה ללקוח נוצרה' : `משימה נוספה: ${next.action || ''}`,
      note: [kind, text, next.channel ? `ערוץ: ${next.channel}` : '', next.scheduledAt ? `תזמון: ${next.scheduledAt}` : '', who ? `נוצר ע״י: ${who}` : ''].filter(Boolean).join(' · '),
    };
  }
  const prevSt = customerStatusOf(prev) || (prev.done === 'true' ? 'done' : 'pending');
  const nextSt = customerStatusOf(next) || (next.done === 'true' ? 'done' : 'pending');
  if (prevSt !== nextSt) {
    const map: Record<string, string> = {
      sent: 'משימה נשלחה',
      done: 'טיפול הושלם',
      cancelled: 'סטטוס השתנה',
      pending: 'סטטוס השתנה',
    };
    return {
      action: next.audience === 'customer' ? (map[nextSt] || 'סטטוס השתנה') : (next.done === 'true' ? `משימה הושלמה: ${next.action || ''}` : `משימה עודכנה: ${next.action || ''}`),
      note: `סטטוס: ${customerStatusLabel(prevSt)} → ${customerStatusLabel(nextSt)}${text ? ` · ${text}` : ''}`,
    };
  }
  return {
    action: next.audience === 'customer' ? 'משימה ללקוח עודכנה' : `משימה עודכנה: ${next.action || ''}`,
    note: text,
  };
}

export function inferRecipientKind(mailTo: string, claim: { clientEmail?: string; insEmail?: string; insRepEmail?: string } | null, stored?: string) {
  const to = String(mailTo || '').trim().toLowerCase();
  const client = String(claim?.clientEmail || '').trim().toLowerCase();
  const ins = String(claim?.insEmail || '').trim().toLowerCase();
  const rep = String(claim?.insRepEmail || '').trim().toLowerCase();
  if (stored === 'client' || stored === 'insurer' || stored === 'other') return stored;
  if (to && client && to === client) return 'client';
  if (to && ((ins && to === ins) || (rep && to === rep))) return 'insurer';
  return 'other';
}

export function recipientKindLabel(kind: string) {
  if (kind === 'client') return 'לקוח';
  if (kind === 'insurer') return 'חברת הביטוח';
  return 'נמען אחר';
}
