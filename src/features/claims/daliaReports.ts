// Garage reports for Dalia, computed only from real case data (garage_cases.case_data).
// Money is never mixed: money actually received (recorded payments), balances still open, approved
// amounts, quote totals and open work orders are separate figures. Nothing is estimated or invented —
// when a figure cannot be computed from the data, the report says so.

import {
  approvedFinalAmount,
  closeCaseGaps,
  garageCaseListStatus,
  hasApprovedPrice,
  type GarageCase,
  type GarageCaseData,
} from '@/modules/garage-management/garageBook';

export type ReportType = 'financial' | 'company' | 'cases' | 'quotes' | 'activity';
export type ReportPeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';
export type ReportStatusFilter = 'open' | 'closed' | 'all';
export type CaseListFilter =
  | 'all' | 'open' | 'in_work' | 'waiting_approval' | 'ready_delivery' | 'ready_close' | 'closed' | 'missing_order' | 'with_extras';

export interface ReportFilters {
  type?: ReportType;
  company?: string | null; // null = all companies
  period?: { key: ReportPeriodKey; from?: string; to?: string };
  status?: ReportStatusFilter;
  caseList?: CaseListFilter;
  jobType?: string | null;
  worker?: string | null;
  detail?: 'summary' | 'details';
}

export interface ReportCard { label: string; value: string; hint?: string }
export interface ReportRow { id: string; title: string; subtitle?: string; caseId?: string; amount?: string }
export interface ReportResult {
  title: string;
  periodLabel: string;
  cards: ReportCard[];
  rows: ReportRow[];
  notes: string[];
  /** Short spoken/printed one-line summary (dynamic). */
  headline: string;
  empty: boolean;
}

const ILS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
export const money = (n: number) => ILS.format(Math.round(n || 0));
const dateHe = (d: Date) => d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });

type Payment = { amount?: unknown; payment_date?: unknown; created_at?: unknown; date?: unknown; payment_method_label?: unknown; method?: unknown };

export function periodRange(period: ReportFilters['period'], now = new Date()): { from: Date | null; to: Date | null; label: string } {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = start(now);
  const key = period?.key || 'all';
  if (key === 'today') return { from: today, to: new Date(today.getTime() + 86400000), label: `היום (${dateHe(today)})` };
  if (key === 'yesterday') {
    const y = new Date(today.getTime() - 86400000);
    return { from: y, to: today, label: `אתמול (${dateHe(y)})` };
  }
  if (key === 'week') {
    // Israeli week: Sunday–Saturday
    const from = new Date(today.getTime() - today.getDay() * 86400000);
    return { from, to: new Date(today.getTime() + 86400000), label: `השבוע (מ-${dateHe(from)})` };
  }
  if (key === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: new Date(today.getTime() + 86400000), label: `החודש (מ-${dateHe(from)})` };
  }
  if (key === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from, to: new Date(today.getTime() + 86400000), label: `השנה (מ-${dateHe(from)})` };
  }
  if (key === 'custom' && period?.from) {
    const from = new Date(period.from);
    const to = period.to ? new Date(new Date(period.to).getTime() + 86400000) : new Date(today.getTime() + 86400000);
    return { from, to, label: `${dateHe(from)} – ${dateHe(new Date(to.getTime() - 86400000))}` };
  }
  return { from: null, to: null, label: 'כל התקופה' };
}

const inRange = (iso: unknown, r: { from: Date | null; to: Date | null }) => {
  if (!r.from) return true;
  const t = new Date(String(iso || '')).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= r.from.getTime() && (!r.to || t < r.to.getTime());
};

function payments(cd: GarageCaseData): Payment[] {
  const list = (cd as Record<string, unknown>).payments;
  return Array.isArray(list) ? (list as Payment[]) : [];
}
function paidTotal(cd: GarageCaseData): number {
  const total = Number((cd as Record<string, unknown>).totalPaid);
  if (Number.isFinite(total) && total > 0) return total;
  return payments(cd).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
/** Same payable rule as the garage server tools (help-ai-chat resolveCaseTotalPayable). */
export function payableTotal(cd: GarageCaseData): number {
  const c = cd as Record<string, unknown>;
  const n = (v: unknown) => Number(v) || 0;
  if (n(c.finishAmount) > 0) return n(c.finishAmount);
  if (n(c.finalApprovedAmount) > 0) return n(c.finalApprovedAmount);
  if (n(c.workOrderAmount) > 0) return n(c.workOrderAmount);
  if (n(c.quoteGrandTotal) > 0) return n(c.quoteGrandTotal);
  if (n(c.totalAmount) > 0) return n(c.totalAmount);
  const sub = quoteNet(cd);
  if (sub > 0) return c.vatMode === 'includes_vat' ? sub : Math.round(sub * 1.18);
  return 0;
}
function quoteNet(cd: GarageCaseData): number {
  const works = (cd.quoteWorks || []).reduce((s, w) => s + (Number(w.price) || 0) * (Number(w.qty) || 1), 0);
  const parts = (cd.quoteParts || []).reduce((s, p) => (p.supplier === 'customer' ? s : s + (Number(p.price) || 0) * (Number(p.qty) || 1)), 0);
  return works + parts;
}
const quoteGross = (cd: GarageCaseData) => Math.round(quoteNet(cd) * 1.18);

export function isClosed(c: GarageCase) { return !!c.case_data?.caseClosed; }
export function caseMatchesList(c: GarageCase, f: CaseListFilter): boolean {
  const cd = c.case_data || {};
  switch (f) {
    case 'all': return true;
    case 'open': return !cd.caseClosed;
    case 'closed': return !!cd.caseClosed;
    case 'in_work': return !!cd.workStarted && !cd.workFinished && !cd.caseClosed;
    case 'waiting_approval': return !!(cd.quoteSent || cd.waitingForApproval) && !cd.quoteApproved && !cd.caseClosed;
    case 'ready_delivery': return !!cd.workFinished && !cd.caseClosed;
    case 'ready_close': return !cd.caseClosed && closeCaseGaps(cd).length === 0;
    case 'missing_order': return !cd.caseClosed && !cd.workOrderSaved && !cd.quoteApproved;
    case 'with_extras': return !!(cd.extraApprovals && cd.extraApprovals.length);
  }
}
export const CASE_LIST_LABELS: Record<CaseListFilter, string> = {
  all: 'כל התיקים',
  open: 'תיקים פתוחים',
  in_work: 'רכבים בעבודה',
  waiting_approval: 'ממתינים לאישור',
  ready_delivery: 'מוכנים למסירה',
  ready_close: 'מוכנים לסגירה',
  closed: 'תיקים סגורים',
  missing_order: 'תיקים חסרי הזמנה',
  with_extras: 'תיקים עם תוספות עבודה',
};

export function caseRow(c: GarageCase, amount?: number): ReportRow {
  return {
    id: c.id,
    caseId: c.id,
    title: `${c.case_number || 'תיק'} · ${c.customer_name_snapshot || ''}`.trim(),
    subtitle: [c.vehicle_plate_snapshot ? `רכב ${c.vehicle_plate_snapshot}` : '', garageCaseListStatus(c.case_data, c.status)].filter(Boolean).join(' · '),
    amount: amount !== undefined ? money(amount) : undefined,
  };
}

function companyFilter(cases: GarageCase[], company?: string | null) {
  if (!company) return cases;
  const words = company.split(/\s+/).filter((w) => w.length >= 2);
  return cases.filter((c) => words.every((w) => (c.customer_name_snapshot || '').includes(w)));
}
function jobTypeFilter(cases: GarageCase[], jobType?: string | null) {
  if (!jobType) return cases;
  return cases.filter((c) => (c.case_data.quoteWorks || []).some((w) => `${w.type || ''} ${w.part || ''} ${w.desc || ''}`.includes(jobType)));
}
function workerFilter(cases: GarageCase[], worker?: string | null) {
  if (!worker) return cases;
  return cases.filter((c) => (c.opened_by_name || '').includes(worker));
}

export function computeReport(all: GarageCase[], f: ReportFilters, now = new Date()): ReportResult {
  const range = periodRange(f.period, now);
  const scoped = workerFilter(jobTypeFilter(companyFilter(all, f.company), f.jobType), f.worker);
  const who = f.company ? ` · ${f.company}` : '';
  const notes: string[] = [];
  const type = f.type || 'cases';

  if (type === 'financial' || type === 'company') {
    let received = 0;
    let paymentCount = 0;
    const paidRows: ReportRow[] = [];
    for (const c of scoped) {
      for (const p of payments(c.case_data)) {
        const when = p.payment_date || p.created_at || p.date;
        if (!inRange(when, range)) continue;
        const amt = Number(p.amount) || 0;
        received += amt;
        paymentCount += 1;
        paidRows.push({ ...caseRow(c), id: `${c.id}-${paymentCount}`, amount: money(amt), subtitle: `${String(p.payment_method_label || p.method || '')} · ${when ? dateHe(new Date(String(when))) : ''}` });
      }
    }
    const openCases = scoped.filter((c) => !isClosed(c));
    const balances = scoped
      .map((c) => ({ c, bal: Math.max(0, payableTotal(c.case_data) - paidTotal(c.case_data)) }))
      .filter((x) => x.bal > 0);
    const balanceTotal = balances.reduce((s, x) => s + x.bal, 0);
    const approved = scoped.filter((c) => hasApprovedPrice(c.case_data) && inRange(c.created_at, range));
    const approvedTotal = approved.reduce((s, c) => s + approvedFinalAmount(c.case_data), 0);
    const quoted = scoped.filter((c) => c.case_data.quoteCreated && !c.case_data.quoteApproved && inRange(c.created_at, range));
    const quotedTotal = quoted.reduce((s, c) => s + quoteGross(c.case_data), 0);
    const openOrders = openCases.filter((c) => c.case_data.workOrderSaved);
    const openOrdersTotal = openOrders.reduce((s, c) => s + (Number(c.case_data.workOrderAmount) || 0), 0);
    const monthly = balances.filter((x) => x.c.case_data.paymentStatus === 'invoiced');
    const monthlyTotal = monthly.reduce((s, x) => s + x.bal, 0);
    const cards: ReportCard[] = [
      { label: 'התקבל בפועל', value: money(received), hint: `${paymentCount} תשלומים רשומים · ${range.label}` },
      { label: 'עדיין לא שולם', value: money(balanceTotal), hint: `${balances.length} תיקים עם יתרה (נכון להיום)` },
      { label: 'סכום שאושר', value: money(approvedTotal), hint: `${approved.length} תיקים עם מחיר מאושר` },
      { label: 'הצעות מחיר שטרם אושרו', value: money(quotedTotal), hint: `${quoted.length} הצעות` },
      { label: 'הזמנות עבודה פתוחות', value: money(openOrdersTotal), hint: `${openOrders.length} תיקים פתוחים עם הזמנה` },
      { label: 'צפוי מלקוחות בחיוב חודשי', value: money(monthlyTotal), hint: `${monthly.length} תיקים בסטטוס "חיוב לקוח/חברה"` },
    ];
    if (type === 'company') {
      const opened = scoped.filter((c) => inRange(c.created_at, range));
      const closed = scoped.filter((c) => isClosed(c) && inRange(c.case_data.caseClosedAt, range));
      const vehicles = new Set(opened.map((c) => c.vehicle_id));
      const missingOrder = scoped.filter((c) => caseMatchesList(c, 'missing_order'));
      cards.unshift(
        { label: 'רכבים שנכנסו', value: String(vehicles.size), hint: range.label },
        { label: 'תיקים שנפתחו', value: String(opened.length) },
        { label: 'תיקים שנסגרו', value: String(closed.length) },
        { label: 'תיקים פתוחים כעת', value: String(openCases.length) },
        { label: 'ממתינים להזמנה', value: String(missingOrder.length) },
      );
    }
    notes.push('התקבל בפועל = תשלומים שנרשמו בתיקים בתקופה בלבד. יתרות, אישורים והצעות אינם הכנסה שהתקבלה.');
    if (!paymentCount) notes.push('לא נמצאו תשלומים רשומים בתקופה — אין נתוני תקבולים להציג, ולא הוערך סכום.');
    const rows = f.detail === 'details'
      ? [...paidRows, ...balances.map((x) => ({ ...caseRow(x.c), amount: money(x.bal), subtitle: `יתרה לתשלום · ${caseRow(x.c).subtitle}` }))]
      : [];
    return {
      title: `${type === 'company' ? 'דוח לפי חברה' : 'דוח כספי'}${who}`,
      periodLabel: range.label,
      cards,
      rows,
      notes,
      headline: `התקבל בפועל ${money(received)} ב-${paymentCount} תשלומים, ${range.label}${who}. יתרה פתוחה ${money(balanceTotal)}.`,
      empty: scoped.length === 0,
    };
  }

  if (type === 'quotes') {
    const inP = scoped.filter((c) => c.case_data.quoteCreated && inRange(c.created_at, range));
    const fresh = inP.filter((c) => !c.case_data.quoteSent && !c.case_data.waitingForApproval && !c.case_data.quoteApproved);
    const waiting = inP.filter((c) => (c.case_data.quoteSent || c.case_data.waitingForApproval) && !c.case_data.quoteApproved);
    const approved = inP.filter((c) => c.case_data.quoteApproved);
    const withExtras = inP.filter((c) => (c.case_data.extraApprovals || []).length);
    const sum = (list: GarageCase[]) => money(list.reduce((s, c) => s + quoteGross(c.case_data), 0));
    notes.push('אין במערכת סטטוס "נדחתה" או "בוטלה" להצעות, ולכן הם לא מוצגים.');
    return {
      title: `דוח הצעות מחיר${who}`,
      periodLabel: range.label,
      cards: [
        { label: 'הצעות חדשות', value: String(fresh.length), hint: sum(fresh) },
        { label: 'ממתינות לאישור', value: String(waiting.length), hint: sum(waiting) },
        { label: 'אושרו', value: String(approved.length), hint: sum(approved) },
        { label: 'עם תוספות עבודה', value: String(withExtras.length) },
      ],
      rows: f.detail === 'details' ? inP.map((c) => caseRow(c, quoteGross(c.case_data))) : [],
      notes,
      headline: `${inP.length} הצעות מחיר ${range.label}${who}: ${approved.length} אושרו, ${waiting.length} ממתינות.`,
      empty: inP.length === 0,
    };
  }

  if (type === 'activity') {
    const opened = scoped.filter((c) => inRange(c.created_at, range));
    const closed = scoped.filter((c) => isClosed(c) && inRange(c.case_data.caseClosedAt, range));
    const types = new Map<string, number>();
    opened.forEach((c) => (c.case_data.quoteWorks || []).forEach((w) => {
      const t = String(w.type || 'עבודה');
      types.set(t, (types.get(t) || 0) + 1);
    }));
    const byCompany = new Map<string, number>();
    opened.forEach((c) => byCompany.set(c.customer_name_snapshot || 'ללא שם', (byCompany.get(c.customer_name_snapshot || 'ללא שם') || 0) + 1));
    const byWorker = new Map<string, number>();
    opened.forEach((c) => byWorker.set(c.opened_by_name || 'לא ידוע', (byWorker.get(c.opened_by_name || 'לא ידוע') || 0) + 1));
    notes.push('מקור הגעת לקוח אינו נשמר בתיקי המוסך, ולכן אין חלוקה לפי מקור הגעה.');
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (${v})`).join(', ') || '—';
    return {
      title: `דוח פעילות${who}`,
      periodLabel: range.label,
      cards: [
        { label: 'רכבים שנכנסו', value: String(new Set(opened.map((c) => c.vehicle_id)).size) },
        { label: 'תיקים שנפתחו', value: String(opened.length) },
        { label: 'תיקים שנסגרו', value: String(closed.length) },
        { label: 'סוגי עבודות', value: String(types.size), hint: top(types) },
        { label: 'לפי לקוח/חברה', value: String(byCompany.size), hint: top(byCompany) },
        { label: 'לפי פותח התיק', value: String(byWorker.size), hint: top(byWorker) },
      ],
      rows: f.detail === 'details' ? opened.map((c) => caseRow(c)) : [],
      notes,
      headline: `${opened.length} תיקים נפתחו ו-${closed.length} נסגרו ${range.label}${who}.`,
      empty: opened.length === 0 && closed.length === 0,
    };
  }

  // cases report
  const statusScoped = scoped.filter((c) => {
    if (f.status === 'open') return !isClosed(c);
    if (f.status === 'closed') return isClosed(c);
    return true;
  });
  const periodScoped = statusScoped.filter((c) => inRange(c.created_at, range));
  const listFilter = f.caseList || 'all';
  const listed = periodScoped.filter((c) => caseMatchesList(c, listFilter));
  const count = (k: CaseListFilter) => periodScoped.filter((c) => caseMatchesList(c, k)).length;
  return {
    title: `${CASE_LIST_LABELS[listFilter]}${who}`,
    periodLabel: range.label,
    cards: [
      { label: 'סה"כ בדוח', value: String(listed.length) },
      { label: 'פתוחים', value: String(count('open')) },
      { label: 'רכבים בעבודה', value: String(count('in_work')) },
      { label: 'ממתינים לאישור', value: String(count('waiting_approval')) },
      { label: 'מוכנים למסירה', value: String(count('ready_delivery')) },
      { label: 'מוכנים לסגירה', value: String(count('ready_close')) },
      { label: 'סגורים', value: String(count('closed')) },
      { label: 'חסרי הזמנה', value: String(count('missing_order')) },
      { label: 'עם תוספות', value: String(count('with_extras')) },
    ],
    rows: listed.map((c) => caseRow(c)),
    notes,
    headline: `${listed.length} ${CASE_LIST_LABELS[listFilter]} ${range.label}${who}.`,
    empty: listed.length === 0,
  };
}
