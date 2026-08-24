import type { CallResult } from '@/features/telemarketing/types';

export type LeadColor = 'red' | 'yellow' | 'green';

export const LEAD_COLOR_LABEL: Record<LeadColor, string> = {
  red: 'אדום — סגור',
  yellow: 'צהוב — בתהליך',
  green: 'ירוק — הצלחה',
};

export const LEAD_STATUSES = {
  red: [
    { id: 'not_interested', label: 'לא מעוניין' },
    { id: 'not_relevant', label: 'לא רלוונטי' },
    { id: 'do_not_call', label: 'ביקש לא לחזור' },
    { id: 'business_closed', label: 'עסק נסגר' },
    { id: 'bad_number', label: 'מספר לא תקין' },
    { id: 'other_closed', label: 'סגירה אחרת' },
  ],
  yellow: [
    { id: 'no_answer', label: 'לא ענה' },
    { id: 'try_again', label: 'לנסות שוב' },
    { id: 'talking', label: 'דיברנו / בתהליך' },
    { id: 'thinking', label: 'רוצה לחשוב' },
    { id: 'follow_up', label: 'Follow-up פתוח' },
    { id: 'wants_info', label: 'ביקש חומר / פרטים' },
    { id: 'initial_interest', label: 'עניין ראשוני' },
    { id: 'waiting_manager', label: 'צריך לדבר עם מנהל' },
    { id: 'waiting_reply', label: 'מחכה לתשובה' },
  ],
  green: [
    { id: 'meeting_booked', label: 'קבע פגישה' },
    { id: 'quote_progress', label: 'ביקש הצעה ומתקדם' },
    { id: 'process_approved', label: 'אישר המשך תהליך' },
    { id: 'deal_closed', label: 'נסגר כלקוח / עסקה' },
    { id: 'other_success', label: 'הצלחה אחרת' },
  ],
} as const;

export type LeadStatus =
  | (typeof LEAD_STATUSES)['red'][number]['id']
  | (typeof LEAD_STATUSES)['yellow'][number]['id']
  | (typeof LEAD_STATUSES)['green'][number]['id'];

export function leadStatusLabel(status: string | null | undefined): string {
  if (!status) return '';
  for (const color of Object.keys(LEAD_STATUSES) as LeadColor[]) {
    const found = LEAD_STATUSES[color].find((s) => s.id === status);
    if (found) return found.label;
  }
  return status;
}

/** Call result stays as-is. Color is a separate display layer. "לא ענה" is never red. */
export function suggestedLeadTraffic(
  result: CallResult | null,
  needsFollowUp: boolean,
): { color: LeadColor; status: LeadStatus } {
  if (result === 'לא מעוניין') return { color: 'red', status: 'not_interested' };
  if (result === 'לא רלוונטי') return { color: 'red', status: 'not_relevant' };
  if (result === 'מספר שגוי') return { color: 'red', status: 'bad_number' };
  if (result === 'רוצה פגישה') return { color: 'green', status: 'meeting_booked' };
  if (result === 'ביקש הצעת מחיר') return { color: 'green', status: 'quote_progress' };
  if (result === 'לא ענה') return { color: 'yellow', status: 'no_answer' };
  if (result === 'לנסות שוב') return { color: 'yellow', status: 'try_again' };
  if (result === 'ביקש מידע') return { color: 'yellow', status: 'wants_info' };
  if (result === 'לחזור אליו' || needsFollowUp) return { color: 'yellow', status: 'follow_up' };
  if (result === 'מעוניין' || result === 'מעוניין מאוד' || result === 'דיברנו') {
    return { color: 'yellow', status: 'initial_interest' };
  }
  return { color: 'yellow', status: 'talking' };
}

export function isExplicitCloseResult(result: CallResult | null): boolean {
  return result === 'לא מעוניין' || result === 'לא רלוונטי' || result === 'מספר שגוי';
}
