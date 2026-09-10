import type { CaseStatus, GarageCase, PartState } from './types';
import { ANGLE_KEYS, VAT_RATE } from './types';

export const STATUS_META: Record<CaseStatus, { label: string; badge: string }> = {
  open: { label: 'נפתח', badge: 'b-slate' },
  inspecting: { label: 'בבדיקה', badge: 'b-blue' },
  quote_draft: { label: 'בהכנה', badge: 'b-amber' },
  quote_ready: { label: 'טרם נשלחה', badge: 'b-amber' },
  awaiting_approval: { label: 'ממתין לאישור', badge: 'b-blue' },
  approved: { label: 'אושרה', badge: 'b-green' },
  intake: { label: 'קבלה', badge: 'b-slate' },
  in_work: { label: 'בעבודה', badge: 'b-purple' },
  done: { label: 'הסתיימה', badge: 'b-teal' },
  closed: { label: 'נסגר', badge: 'b-gray' },
};

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function nowLabel() {
  const d = new Date();
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export function todayLabel() {
  return new Date().toLocaleDateString('he-IL');
}

export function formatMoney(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${n.toLocaleString('he-IL')} ₪`;
}

export function quoteTotals(c: Pick<GarageCase, 'works' | 'partsLines'>) {
  const works = c.works.reduce((s, w) => s + (Number(w.price) || 0), 0);
  const parts = c.partsLines.reduce((s, p) => s + (p.supplier === 'us' ? Number(p.price) || 0 : 0), 0);
  const subtotal = works + parts;
  const vat = Math.round(subtotal * VAT_RATE);
  const total = subtotal + vat;
  return { works, parts, vat, total, subtotal };
}

export function nextCaseNumber(cases: { number: string }[]) {
  const nums = cases.map((c) => c.number).filter((n) => /^\d+$/.test(n)).map(Number);
  const max = nums.length ? Math.max(...nums) : 1053;
  return String(max + 1);
}

export function requiredAnglesDone(c: Pick<GarageCase, 'angles'>) {
  return ANGLE_KEYS.filter((a) => Boolean(c.angles[a.id])).length;
}

export function partClass(state: PartState) {
  if (state === 'damaged') return 'part damaged';
  if (state === 'fix') return 'part fix';
  return 'part';
}

export function stateLabel(state: PartState) {
  if (state === 'damaged') return 'נזק קיים';
  if (state === 'fix') return 'מיועד לתיקון';
  return 'תקין';
}

export function stateBadge(state: PartState) {
  if (state === 'damaged') return 'b-orange';
  if (state === 'fix') return 'b-blue';
  return 'b-green';
}

export interface NextAction {
  label: string;
  path: string;
  progress?: string;
}

export function nextAction(c: GarageCase): NextAction {
  const angles = requiredAnglesDone(c);
  if (angles < 4) {
    return { label: `השלם צילום 4 זוויות (${angles}/4)`, path: 'inspect', progress: `${angles}/4` };
  }
  if (!c.works.length) {
    return { label: 'בנה הצעת מחיר', path: 'quote' };
  }
  if (c.status === 'quote_draft' || c.status === 'quote_ready') {
    return { label: 'שלח הצעת מחיר', path: 'quote/send' };
  }
  if (c.status === 'awaiting_approval' || c.status === 'approved') {
    if (!c.orders.length) return { label: 'קלוט הזמנת עבודה', path: 'order' };
    if (!c.intake) return { label: 'קבל רכב לעבודה', path: 'intake' };
  }
  if (c.status === 'intake' || (c.intake && !['done', 'closed', 'in_work'].includes(c.status))) {
    return { label: 'התחל עבודה', path: 'inspect' };
  }
  if (c.status === 'in_work') {
    return { label: 'סיום עבודה', path: 'complete' };
  }
  if (c.status === 'done') {
    return { label: 'סגור תיק', path: 'complete' };
  }
  return { label: 'סקירת תיק', path: '' };
}

export function matchesQuery(hay: string, q: string) {
  return hay.toLowerCase().includes(q.trim().toLowerCase());
}
