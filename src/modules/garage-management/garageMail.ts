import { supabase } from '@/integrations/supabase/client';
import type { GarageCase, GarageCaseData, GarageMediaCategoryId } from './garageBook';
import { approvedFinalAmount, getCase, listCases, updateCase } from './garageBook';
import {
  GARAGE_MAILBOX,
  garageMailIsClaimsMailbox,
  matchGarageMail,
  type GarageMatchCase,
  type GarageMatchMail,
  type GarageMatchResult,
} from './garageMailMatch';
import { compareSentAndReturned, detectPricedOrder, type PriceCompare, type PriceDetection } from './garagePriceFromMail';

export { GARAGE_MAILBOX, CLAIMS_MAILBOX } from './garageMailMatch';

export const GARAGE_GMAIL_PENDING_MESSAGE =
  'תיבת המוסך yoni191177@gmail.com עדיין לא מחוברת לסריקה אוטומטית של ניהול המוסך. לא משתמשים בתיבת Claims (yoni122222@gmail.com). התכתבות שנשמרה בתיק וקבצים ב-garage-media נשארים.';

export type GarageMailCard = {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  subject: string;
  from_addr: string;
  to_addr: string;
  sent_at: string;
  body_text: string;
  direction: 'incoming' | 'outgoing';
  source: 'import' | 'mailto' | 'upload';
  file_names?: string[];
  unread?: boolean;
};

export type GaragePriceReview = {
  status: 'none' | 'waiting_for_price' | 'new_material' | 'priced_order_received' | 'worker_approved';
  detectedAmount: number | null;
  sentAmount: number | null;
  compare?: PriceCompare['status'];
  compareMessage?: string;
  detectionLabel?: string;
  sourceMailId?: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

export type GarageMailPending = {
  id: string;
  gmail_message_id: string;
  subject: string;
  from_addr: string;
  sent_at: string;
  reason: string;
  candidates: string[];
  body_text?: string;
  filenames?: string[];
};

export function caseToMatchRow(c: Pick<GarageCase, 'id' | 'case_number' | 'vehicle_plate_snapshot' | 'customer_name_snapshot' | 'case_data'>): GarageMatchCase {
  const data = c.case_data || {};
  return {
    id: c.id,
    case_number: c.case_number,
    plate: c.vehicle_plate_snapshot,
    customer_name: c.customer_name_snapshot,
    order_number: data.workOrderNumber || undefined,
    case_ref: data.workOrderRef || undefined,
    threads: [...new Set((data.correspondence || []).map((m) => m.gmail_thread_id).filter(Boolean) as string[])],
  };
}

export function routeIncomingGarageMail(mail: GarageMatchMail, cases: Array<Pick<GarageCase, 'id' | 'case_number' | 'vehicle_plate_snapshot' | 'customer_name_snapshot' | 'case_data'>>): GarageMatchResult {
  return matchGarageMail(mail, cases.map(caseToMatchRow));
}

export function classifyGarageMailCategory(input: { subject?: string; filename?: string; priced?: boolean }): GarageMediaCategoryId {
  const hay = `${input.subject || ''} ${input.filename || ''}`.toLowerCase();
  if (input.priced || /מתומחר|אישור מחיר|approved/.test(hay)) return 'customer_approvals';
  if (/הזמנה|order|po[-_ ]/.test(hay)) return 'customer_order';
  if (/\.pdf$|חשבונית|invoice/.test(hay)) return 'parts_invoices';
  if (/\.(jpe?g|png|webp)$/.test(hay) || /תמונ/.test(hay)) return 'quote_photos';
  return 'other';
}

export function mailPriceReview(
  data: GarageCaseData,
  detection: PriceDetection,
  mailId?: string,
): GaragePriceReview {
  const sent = Number(data.finalApprovedAmount) || Number(data.workOrderAmount) || approvedFinalAmount(data) || null;
  const sentOk = sent && sent > 0 ? sent : null;
  const compare = compareSentAndReturned(sentOk, detection.amount);
  return {
    status: detection.amount || detection.likelyPricedOrder ? 'priced_order_received' : 'new_material',
    detectedAmount: detection.amount,
    sentAmount: sentOk,
    compare: compare.status,
    compareMessage: compare.message,
    detectionLabel: detection.label,
    sourceMailId: mailId,
  };
}

export function applyMatchedMail(
  data: GarageCaseData,
  mail: GarageMatchMail & { sentAt?: string; to?: string; body?: string; filenames?: string[] },
  match: GarageMatchResult,
  actorName?: string,
): { data: GarageCaseData; timelineText: string } {
  void actorName;
  const cards = Array.isArray(data.correspondence) ? data.correspondence.slice() : [];
  const mid = mail.messageId;
  if (!cards.some((c) => c.gmail_message_id === mid)) {
    cards.push({
      id: mid,
      gmail_message_id: mid,
      gmail_thread_id: mail.threadId || mid,
      subject: mail.subject || '',
      from_addr: mail.from || '',
      to_addr: mail.to || GARAGE_MAILBOX,
      sent_at: mail.sentAt || new Date().toISOString(),
      body_text: mail.body || '',
      direction: 'incoming',
      source: 'import',
      file_names: mail.filenames || [],
      unread: true,
    });
  }
  const detection = detectPricedOrder({ subject: mail.subject, body: mail.body, filenames: mail.filenames });
  const review = mailPriceReview({ ...data, correspondence: cards }, detection, mid);
  const timeline: NonNullable<GarageCaseData['timeline']> = Array.isArray(data.timeline) ? data.timeline.slice() : [];
  const now = new Date().toISOString();
  timeline.push({ at: now, text: `התקבל מייל חדש · ${mail.subject || 'ללא נושא'} · שויך לתיק` });
  if ((mail.filenames || []).length) {
    timeline.push({ at: now, text: `קובץ התקבל במייל · ${(mail.filenames || []).join(', ')}` });
  }
  if (detection.likelyPricedOrder || detection.amount) {
    timeline.push({ at: now, text: detection.amount ? `הזמנה מתומחרת / מחיר זוהה: ${detection.amount} ₪ · ממתין לאישור עובד` : 'ייתכן אישור מחיר — דורש בדיקה ידנית' });
    if (review.compare === 'mismatch') {
      timeline.push({ at: now, text: `נמצא פער במחיר · ${review.compareMessage || ''}` });
    }
  }
  return {
    data: {
      ...data,
      correspondence: cards,
      unreadMail: true,
      waitingForApproval: data.waitingForApproval,
      priceReview: review,
      timeline,
    },
    timelineText: timeline[timeline.length - 1]?.text || '',
  };
}

export function approveDetectedPrice(
  data: GarageCaseData,
  actorName?: string,
): GarageCaseData {
  const review = data.priceReview;
  const amount = Number(review?.detectedAmount);
  if (!Number.isFinite(amount) || amount <= 0) return data;
  const now = new Date().toISOString();
  const timeline = Array.isArray(data.timeline) ? data.timeline.slice() : [];
  timeline.push({
    at: now,
    text: `העובד אישר את המחיר · ${amount.toLocaleString('he-IL')} ₪${actorName ? (` · ${actorName}`) : ''}`,
  });
  return {
    ...data,
    quoteApproved: true,
    workOrderSaved: true,
    workOrderAmount: amount,
    finalApprovedAmount: amount,
    waitingForApproval: false,
    priceReview: {
      ...(review || { status: 'worker_approved', detectedAmount: amount, sentAmount: amount }),
      status: 'worker_approved',
      detectedAmount: amount,
      reviewedAt: now,
      reviewedBy: actorName || '',
    },
    timeline,
  };
}

export function markCorrespondenceRead(data: GarageCaseData): GarageCaseData {
  return {
    ...data,
    unreadMail: false,
    correspondence: (data.correspondence || []).map((row) => ({ ...row, unread: false })),
  };
}

export function outgoingMailtoCard(input: {
  to: string;
  subject: string;
  body: string;
  caseNumber?: string;
}): GarageMailCard {
  const id = `mailto-${Date.now()}`;
  return {
    id,
    gmail_message_id: id,
    gmail_thread_id: id,
    subject: input.subject,
    from_addr: GARAGE_MAILBOX,
    to_addr: input.to,
    sent_at: new Date().toISOString(),
    body_text: input.body,
    direction: 'outgoing',
    source: 'mailto',
  };
}

export function priceStatusLabel(data: GarageCaseData): string {
  const review = data.priceReview;
  if (review?.status === 'worker_approved' || data.quoteApproved) return 'מחיר נבדק ואושר על ידי העובד';
  if (review?.status === 'priced_order_received') return 'התקבל אישור / הזמנה מתומחרת';
  if (data.unreadMail || review?.status === 'new_material') return 'התקבל חומר חדש';
  if (data.quoteSent || data.waitingForApproval) return 'ממתין לאישור מחיר';
  return '';
}

function asGarageScanMail(row: Record<string, unknown>): (GarageMatchMail & { sentAt?: string; to?: string; body?: string; filenames?: string[] }) | null {
  const messageId = String(row.gmail_message_id || row.messageId || row.id || '').trim();
  if (!messageId) return null;
  const filenames = Array.isArray(row.file_names)
    ? row.file_names.map(String)
    : Array.isArray(row.filenames)
      ? row.filenames.map(String)
      : [];
  return {
    messageId,
    threadId: String(row.gmail_thread_id || row.threadId || ''),
    subject: String(row.subject || ''),
    body: String(row.body_text || row.body || row.snippet || ''),
    from: String(row.from_addr || row.from || ''),
    to: String(row.to_addr || row.to || GARAGE_MAILBOX),
    filenames,
    sentAt: String(row.sent_at || row.sentAt || new Date().toISOString()),
  };
}

export async function probeGarageGmail(): Promise<{ pending: boolean; error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('garage-gmail', { body: { action: 'status' } });
    if (error || !data || typeof data !== 'object') {
      return { pending: true, error: GARAGE_GMAIL_PENDING_MESSAGE };
    }
    const row = data as Record<string, unknown>;
    const mailbox = String(row.mailbox || row.email || '');
    if (mailbox && garageMailIsClaimsMailbox(mailbox)) {
      return { pending: true, error: 'החיבור מצביע לתיבת Claims. לא משתמשים בה לניהול המוסך.' };
    }
    if (row.connected === true || row.ok === true) {
      return { pending: false, error: '' };
    }
    return { pending: true, error: GARAGE_GMAIL_PENDING_MESSAGE };
  } catch {
    return { pending: true, error: GARAGE_GMAIL_PENDING_MESSAGE };
  }
}

export async function scanGarageMailbox(input: {
  currentCaseId?: string;
  actorName?: string;
}): Promise<{
  ok: boolean;
  pending?: boolean;
  error?: string;
  matched: Array<{ mail: GarageMatchMail; match: GarageMatchResult }>;
  needs_review: Array<{ mail: GarageMatchMail; match: GarageMatchResult }>;
  appliedThisCase: GarageCaseData | null;
}> {
  const empty = {
    ok: true,
    pending: true as const,
    error: GARAGE_GMAIL_PENDING_MESSAGE,
    matched: [] as Array<{ mail: GarageMatchMail; match: GarageMatchResult }>,
    needs_review: [] as Array<{ mail: GarageMatchMail; match: GarageMatchResult }>,
    appliedThisCase: null as GarageCaseData | null,
  };
  const probe = await probeGarageGmail();
  if (probe.pending) {
    return { ...empty, error: probe.error };
  }
  const { data, error } = await supabase.functions.invoke('garage-gmail', { body: { action: 'scan_inbox' } });
  if (error || !data || typeof data !== 'object') {
    return empty;
  }
  const payload = data as Record<string, unknown>;
  const rawMessages = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(payload.imports)
      ? payload.imports
      : [];
  const cases = await listCases();
  const matched: Array<{ mail: GarageMatchMail; match: GarageMatchResult }> = [];
  const needs_review: Array<{ mail: GarageMatchMail; match: GarageMatchResult }> = [];
  let appliedThisCase: GarageCaseData | null = null;

  for (const raw of rawMessages) {
    if (!raw || typeof raw !== 'object') continue;
    const mail = asGarageScanMail(raw as Record<string, unknown>);
    if (!mail) continue;
    if (garageMailIsClaimsMailbox(mail.to || '') || garageMailIsClaimsMailbox(mail.from || '')) continue;
    const match = routeIncomingGarageMail(mail, cases);
    if (match.decision !== 'auto' || !match.caseId) {
      needs_review.push({ mail, match });
      continue;
    }
    matched.push({ mail, match });
    const loaded = await getCase(match.caseId);
    if (!loaded) continue;
    const applied = applyMatchedMail(loaded.case_data || {}, mail, match, input.actorName);
    const saved = await updateCase(match.caseId, { case_data: applied.data });
    if (match.caseId === input.currentCaseId) {
      appliedThisCase = saved.case_data || applied.data;
    }
  }

  return { ok: true, pending: false, matched, needs_review, appliedThisCase };
}
