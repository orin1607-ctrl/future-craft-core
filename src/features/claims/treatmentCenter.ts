/** Treatment Center helpers on existing claims_tasks.row_data. No new tables. */

import { CLAIM_DOC_TYPES, type ClaimRecord } from './claimsConstants';
import { detectMailRequests } from './claimWorkAlerts';

export const TREATMENT_ITEM = 'treatment_item';

export function isTreatmentItem(t: ClaimRecord): boolean {
  return t.treatmentItem === 'true' || t.kind === TREATMENT_ITEM;
}

export function isOpenTreatment(t: ClaimRecord): boolean {
  return isTreatmentItem(t) && t.done !== 'true' && t.workStatus !== 'done';
}

export function treatmentLabelOf(t: ClaimRecord): string {
  const name = t.action || requestTypeLabel(t.requestType) || 'טיפול';
  if (t.done === 'true' || t.workStatus === 'done') return name;
  if (t.replyReceived === 'true') return `מייל חדש — ${name}`;
  if (t.workStatus === 'doc_received' || t.workStatus === 'ready_to_send' || t.docState === 'ready') {
    return `התקבל — לבדיקה: ${name}`;
  }
  if (t.workStatus === 'waiting_doc' || t.docState === 'missing' || t.docState === 'awaiting_signature') {
    return `חסר: ${name}`;
  }
  if (t.workStatus === 'waiting_reply') return `ממתין לתגובה — ${name}`;
  if (t.workStatus === 'needs_retry') return `נדרש מחדש: ${name}`;
  return name;
}

export function treatmentStatusHe(t: ClaimRecord): string {
  if (t.done === 'true' || t.workStatus === 'done') return 'טופל / סגור';
  if (t.replyReceived === 'true') return 'התקבלה תגובה';
  if (t.workStatus === 'doc_received' || t.docState === 'ready') return 'התקבל — לבדיקה';
  if (t.workStatus === 'waiting_doc' || t.docState === 'missing') return 'ממתין ללקוח';
  if (t.workStatus === 'waiting_reply') return 'ממתין לתגובה';
  if (t.workStatus === 'needs_retry') return 'נדרש מחדש';
  if (t.workStatus === 'ready_to_send') return 'מוכן לשליחה';
  return 'פתוח';
}

export function requestTypeLabel(type?: string) {
  if (!type) return '';
  const hit = CLAIM_DOC_TYPES.find((t) => t.staffType === type || t.key === type || (t.aliases || []).includes(type));
  return hit?.label || type;
}

export function docKeyForRequestType(type?: string) {
  if (!type) return '';
  const hit = CLAIM_DOC_TYPES.find((t) => t.staffType === type || t.key === type);
  return hit?.key || '';
}

export function inferTreatmentRequest(action: string, note = '') {
  const found = detectMailRequests(`${action}\n${note}`);
  const doc = found.find((x) => x.kind === 'doc' || x.kind === 'sign' || x.kind === 'generic');
  if (doc) return doc;
  if (/רישיון נהיגה/.test(action + note)) return { type: 'driver_license', label: 'רישיון נהיגה', kind: 'doc' as const };
  if (/דוח שמאי|שמאות/.test(action + note)) return { type: 'surveyor_report', label: 'דוח שמאי', kind: 'doc' as const };
  return { type: '', label: action.trim() || 'טיפול', kind: 'other' as const };
}

export function filesForTreatment(t: ClaimRecord, files: Array<{ id: string; doc_meta?: unknown; doc_kind?: string; original_name?: string; gmail_message_id?: string }>) {
  const ready = String(t.readyFileId || '');
  const reqType = t.requestType || '';
  const hit = CLAIM_DOC_TYPES.find((d) => d.staffType === reqType || d.key === reqType);
  const typeKeys = new Set([reqType, hit?.staffType || '', hit?.key || ''].filter(Boolean));
  return files.filter((f) => {
    if (ready && f.id === ready) return true;
    const meta = (f.doc_meta && typeof f.doc_meta === 'object') ? f.doc_meta as Record<string, string> : {};
    if (typeKeys.size && (typeKeys.has(meta.staff_type || '') || typeKeys.has(f.doc_kind || ''))) return true;
    if (t.gmailMessageId && f.gmail_message_id === t.gmailMessageId) return true;
    return false;
  });
}

export type RecurringMailRow = {
  id: string;
  status: string;
  mail_kind?: string;
  purpose?: string;
  treatment_task_id?: string;
  mail_to?: string;
};

export function recurringForTreatment<T extends RecurringMailRow>(rows: T[], taskId: string): T[] {
  if (!taskId) return [];
  return rows.filter((r) => (
    (r.mail_kind === 'email_repeat' || r.purpose === 'recurring_send')
    && r.treatment_task_id === taskId
  ));
}

export function liveRecurringForTreatment<T extends RecurringMailRow>(rows: T[], taskId: string): T[] {
  return recurringForTreatment(rows, taskId).filter((r) => r.status === 'scheduled');
}

export function openTreatments(tasks: ClaimRecord[]) {
  return tasks.filter(isOpenTreatment);
}

export function completedTreatments(tasks: ClaimRecord[]) {
  return tasks.filter((t) => isTreatmentItem(t) && !isOpenTreatment(t));
}
