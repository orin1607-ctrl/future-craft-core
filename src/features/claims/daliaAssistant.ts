// Dalia's general assistant over the garage data: a free sentence → a structured request → an answer from
// the real records the signed-in user may see (RLS + shop scope through GarageVoiceActions).
//
// Only a fixed list of read operations, plus three narrow actions that always ask for confirmation
// (update a customer's phone, open a case, a delete / archive REQUEST that never deletes). The parser never
// builds database queries; the executor only calls GarageVoiceActions and the existing report engine.
import { closeCaseGaps, customerDisplayName, garageCaseListStatus, normalizePlate } from '@/modules/garage-management/garageBook';
import type { GarageCase, GarageCustomer, GarageVehicle, GarageVoiceActions } from '@/modules/garage-management/garageVoiceActions';
import {
  CASE_LIST_LABELS,
  caseMatchesList,
  caseRow,
  computeReport,
  isClosed,
  money,
  payableTotal,
  periodRange,
  type CaseListFilter,
  type ReportFilters,
  type ReportRow,
} from './daliaReports';
import { extractCompanyName, extractPhone, extractPlate, parseCaseListIntent, parsePeriod } from './daliaVoiceParse';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type Ref =
  | { by: 'this' }
  | { by: 'number'; digits: string }
  | { by: 'plate'; plate: string }
  | { by: 'phone'; phone: string }
  | { by: 'name'; name: string }
  | { by: 'none' };

export type DetailField = 'quote' | 'final' | 'parts' | 'works' | 'order' | 'extras' | 'paid' | 'balance' | 'approvedBy' | 'readyToClose' | 'summary';
export type Period = NonNullable<ReportFilters['period']>;

export type AssistantRequest =
  | { kind: 'case.last_opened'; who: 'me' | 'shop' | 'ask' }
  | { kind: 'case.last_closed' }
  | { kind: 'case.closed_when'; ref: Ref }
  | { kind: 'case.longest_open' }
  | { kind: 'case.list'; list: CaseListFilter }
  | { kind: 'cases.count'; what: 'opened' | 'closed'; period: Period }
  | { kind: 'cases.opened_in'; period: Period }
  | { kind: 'cases.for_customer'; ref: Ref }
  | { kind: 'case.find'; ref: Ref }
  | { kind: 'case.detail'; field: DetailField; ref: Ref }
  | { kind: 'case.open'; ref: Ref }
  | { kind: 'money.received'; period: Period | null; company: string | null }
  | { kind: 'money.owed'; company: string | null }
  | { kind: 'money.open_cases' }
  | { kind: 'quotes.count'; period: Period; approvedOnly: boolean }
  | { kind: 'vehicles.entered'; period: Period }
  | { kind: 'customer.top_paying'; period: Period }
  | { kind: 'orders.unsettled' }
  | { kind: 'customer.last' }
  | { kind: 'customer.vehicles'; ref: Ref }
  | { kind: 'customer.find'; ref: Ref }
  | { kind: 'vehicle.history'; ref: Ref }
  | { kind: 'customer.update_phone'; ref: Ref; phone: string | null }
  | { kind: 'case.delete_request'; ref: Ref }
  | { kind: 'case.archive_request'; ref: Ref; restore: boolean }
  | { kind: 'case.status_request'; ref: Ref };

const THIS = /(?:^|\s)(?:ה)?(?:זה|הזה|הזאת|הזו|הנוכחי|הנוכחית)(?=$|[\s,.?!])|(?:^|\s)שלו(?=$|[\s,.?!])/;

function refOf(t: string, entity: 'case' | 'customer' | 'vehicle'): Ref {
  // "לפי מספר הרכב" names the search key, not a value (and "מספר" is not a company)
  t = t.replace(/(?:לפי|עם|ב)\s*מספר\s*(?:ה)?(?:רכב|רישוי|תיק|טלפון)/g, ' ').replace(/\s+/g, ' ').trim();
  const num = t.match(/(?:תיק|כרטיס)\s*(?:עבודה\s*)?(?:מספר\s*)?(?:[A-Z]{2,6}-?(?:\d{4}-)?)?(\d{2,})/i) || t.match(/\b[A-Z]{2,6}-(?:\d{4}-)?(\d{2,})/i);
  if (num) return { by: 'number', digits: num[1] };
  const phone = extractPhone(t);
  if (phone) return { by: 'phone', phone };
  const plate = extractPlate(t);
  if (plate) return { by: 'plate', plate };
  if (THIS.test(t)) return { by: 'this' };
  const company = extractCompanyName(t);
  if (company && !/^(הרכב|התיק|הלקוח|החברה)$/.test(company)) return { by: 'name', name: company };
  const named = t.match(/(?:ללקוח|של הלקוח|הלקוח|לחברת|של חברת|של)\s+([א-ת][א-ת"'׳״-]+(?:\s[א-ת][א-ת"'׳״-]+)?)/);
  const owns = !named && t.match(/(?:יש|שייכים|רשומים)\s+ל([א-ת][א-ת"'׳״-]+(?:\s[א-ת][א-ת"'׳״-]+)?)$/);
  if (owns && entity === 'customer' && !/^(לקוח|לנו|לי|במוסך)$/.test(owns[1])) return { by: 'name', name: owns[1] };
  if (named && entity !== 'vehicle' && !/^(הרכב|התיק|הלקוח|החברה|זה|הזה)$/.test(named[1])) return { by: 'name', name: named[1] };
  return { by: 'none' };
}

const norm = (text: string) => String(text || '')
  .replace(/^\s*דליה[,.!\s]*/, '')
  .replace(/[?!.]+$/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** Free sentence → a request about the garage data, or null when it is not one (the caller decides then). */
export function parseAssistantRequest(text: string, now = new Date()): AssistantRequest | null {
  const t = norm(text);
  if (!t) return null;
  const period = (parsePeriod(t, now) || { key: 'all' }) as Period;
  const periodOr = (fallback: Period['key']): Period => (parsePeriod(t, now) as Period | null) || { key: fallback };
  const caseWord = /תיק|תיקים|כרטיס עבודה/.test(t);

  // --- sensitive: delete / archive / status — identify, explain, never delete by voice ---
  if (/(?:^|\s)(?:תמחקי|מחקי|למחוק|מחיקת|תמחק)(?=$|\s)/.test(t) && caseWord) return { kind: 'case.delete_request', ref: refOf(t, 'case') };
  if (/ארכיון|לארכב|תארכבי|ארכבי|להסתיר|תסתירי|הסתירי/.test(t) && caseWord) return { kind: 'case.archive_request', ref: refOf(t, 'case'), restore: /לשחזר|שחזרי|תשחזרי|מהארכיון|להחזיר/.test(t) };
  if (/סטטוס/.test(t) && /(?:תשני|שני|לשנות|תעדכני|עדכני|לעדכן)/.test(t)) return { kind: 'case.status_request', ref: refOf(t, 'case') };

  // --- update a customer's phone (confirmed before writing) ---
  if (/(?:תעדכני|עדכני|לעדכן|תשני|שני|לשנות|תחליפי|החליפי)/.test(t) && /טלפון|פלאפון|נייד/.test(t) && /לקוח|של|ל(?=[א-ת])/.test(t)) {
    const phone = extractPhone(t);
    const withoutPhone = phone ? t.replace(/[\d-\s]{9,}/, ' ') : t;
    return { kind: 'customer.update_phone', ref: refOf(withoutPhone, 'customer'), phone };
  }

  // --- money ---
  if (/(?:איזה|מי|איזו)\s.*לקוח.*(?:הכי הרבה כסף|הכניס הכי הרבה|שילם הכי הרבה|הכי רווחי)/.test(t)) return { kind: 'customer.top_paying', period };
  if (/(?:כסף|סכום|כמה)\s.*(?:בתיקים (?:ה)?פתוחים|בתיקים שעדיין פתוחים|תיקים פתוחים)/.test(t) && /כסף|סכום/.test(t)) return { kind: 'money.open_cases' };
  if (/חייבים לנו|עדיין חייבים|חוב(?:ות)? (?:של )?לקוחות|לא שולם|יתרות פתוחות|כמה חייבים/.test(t) && !THIS.test(t) && !/תיק (?:מספר|\d)/.test(t)) return { kind: 'money.owed', company: extractCompanyName(t) };
  if (/כמה\s+רכבים\s+(?:נכנסו|התקבלו|קיבלנו)/.test(t)) return { kind: 'vehicles.entered', period: periodOr('week') };
  if (/כמה\s.*(?:כסף|נכנס|התקבל|קיבלנו|הכנסות|הכנסנו|גבינו)/.test(t) && !/הצעו?ת/.test(t)) return { kind: 'money.received', period: (parsePeriod(t, now) as Period | null) || null, company: extractCompanyName(t) };

  // --- quotes / vehicles / orders counts ---
  if (/כמה\s+הצעות/.test(t)) return { kind: 'quotes.count', period, approvedOnly: /אושרו|מאושרות|אישרו/.test(t) };
  if (/הזמנות?\s.*(?:לא סודרו|לא סודר|לא שולמו|פתוחות|עדיין)/.test(t)) return { kind: 'orders.unsettled' };

  // --- cases: last opened / closed, when, oldest, counts ---
  const lastWord = /(?:ה)?אחרון|(?:ה)?אחרונה/.test(t);
  if (caseWord && lastWord && /סגר|נסגר/.test(t)) return { kind: 'case.last_closed' };
  if (caseWord && /מתי/.test(t) && /סגר|נסגר/.test(t)) return { kind: 'case.closed_when', ref: refOf(t, 'case') };
  if (caseWord && lastWord && !/לקוח (?:ה)?אחרון/.test(t)) {
    const who = /שפתחתי|אני פתחתי|פתחתי/.test(t) ? 'me' : /שפתחת|פתחת(?=$|\s)/.test(t) ? 'ask' : 'shop';
    return { kind: 'case.last_opened', who };
  }
  if (caseWord && /הכי הרבה זמן|הכי ישן|הכי ותיק|הוותיק ביותר|הכי מזמן/.test(t)) return { kind: 'case.longest_open' };
  if (/כמה\s+תיקים/.test(t) && /סגרנו|נסגרו|נסגר|סגרתם/.test(t)) return { kind: 'cases.count', what: 'closed', period: periodOr('month') };
  if (/כמה\s+תיקים/.test(t) && /פתחנו|נפתחו|נפתח|פתחתם/.test(t)) return { kind: 'cases.count', what: 'opened', period: periodOr('month') };
  if (caseWord && /שנפתחו|שפתחנו|נפתחו/.test(t) && parsePeriod(t, now)) return { kind: 'cases.opened_in', period };

  // --- a case's details (this / number / plate / customer) ---
  const detail: DetailField | null =
    /מי אישר/.test(t) ? 'approvedBy'
      : /מוכן לסגירה|אפשר לסגור|מוכן למסירה/.test(t) && !/תיקים/.test(t) ? 'readyToClose'
        : /מחיר (?:ה)?סופי|סכום (?:ה)?סופי|המחיר הסופי/.test(t) ? 'final'
          : /הצע(?:ת|ה)\s*(?:ה)?מחיר/.test(t) && /כמה|מה|סכום|היתה|הייתה/.test(t) ? 'quote'
            : /(?:איזה|אילו|מה ה)\s*חלקים/.test(t) ? 'parts'
              : /(?:איזה|אילו|מה ה)\s*עבודות/.test(t) && !/סוגי/.test(t) ? 'works'
                : /(?:יש|האם יש|קיימת|קיים)\s.*הזמנה/.test(t) ? 'order'
                  : /(?:יש|האם יש|קיימת)\s.*תוספת/.test(t) ? 'extras'
                    : /כמה\s.*(?:שילם|שולם|שילמו)/.test(t) ? 'paid'
                      : /כמה נשאר|נשאר לו לשלם|נשאר לשלם|יתרה|כמה הוא חייב|כמה הם חייבים/.test(t) ? 'balance'
                        : null;
  if (detail) return { kind: 'case.detail', field: detail, ref: refOf(t, 'case') };

  // --- lists ---
  if (/חסרה להם הזמנה|חסרות להם הזמנות|בלי הזמנה|ללא הזמנה|חסרי הזמנה/.test(t)) return { kind: 'case.list', list: 'missing_order' };
  if (/(?:איזה|אילו)\s+רכב(?:ים)?\s.*(?:בעבודה|עכשיו בעבודה|נמצא בעבודה)/.test(t)) return { kind: 'case.list', list: 'in_work' };
  // "כמה רכבים יש כרגע במוסך" = the vehicles in the garage now = open cases
  if (/כמה רכבים (?:יש )?(?:לנו )?(?:כרגע |עכשיו )?(?:יש )?במוסך|כמה רכבים יש (?:לנו )?(?:כרגע|עכשיו)/.test(t)) return { kind: 'case.list', list: 'open' };
  const list = parseCaseListIntent(t);
  if (list && !extractCompanyName(t)) return { kind: 'case.list', list };

  // --- customers / vehicles ---
  if (/(?:מי|מה|מיהו)\s.*לקוח (?:ה)?אחרון|הלקוח האחרון|לקוח אחרון שפתחנו/.test(t)) return { kind: 'customer.last' };
  if (/היסטורי|כל העבודות (?:של|על|ב)|עבודות שעשינו (?:ל|על)/.test(t) && /רכב/.test(t)) return { kind: 'vehicle.history', ref: refOf(t, 'vehicle') };
  if (/כמה רכבים (?:יש )?ל|(?:כל )?(?:ה)?רכבים של/.test(t)) return { kind: 'customer.vehicles', ref: refOf(t, 'customer') };
  if (/(?:תמצאי|מצאי|חפשי|תחפשי|תביאי)\s.*לקוח/.test(t) && (/טלפון/.test(t) || extractPhone(t))) return { kind: 'customer.find', ref: refOf(t, 'customer') };
  if (caseWord && /(?:איזה|אילו|מה)\s.*(?:פתחנו|יש|נפתח).*(?:ללקוח|לחברת|של הלקוח)|(?:כל )?(?:ה)?תיקים של/.test(t)) return { kind: 'cases.for_customer', ref: refOf(t, 'customer') };
  if (caseWord && /(?:תמצאי|מצאי|חפשי|תחפשי)/.test(t) && /מספר (?:ה)?רכב|לפי רכב|לפי מספר/.test(t)) return { kind: 'case.find', ref: refOf(t, 'case') };
  if (caseWord && /(?:תפתחי|פתחי|תביאי|הביאי|תציגי|הציגי)/.test(t) && refOf(t, 'case').by !== 'none') return { kind: 'case.open', ref: refOf(t, 'case') };
  return null;
}

/** Back-compat helper used by the router: a structured request that this module answers. */
export const isAssistantRequest = (text: string, now = new Date()) => parseAssistantRequest(text, now) !== null;

// ---------------------------------------------------------------------------
// Execution (read-only + confirmed actions)
// ---------------------------------------------------------------------------

export interface AssistantFocus { caseId?: string; customerId?: string; vehicleId?: string }

export interface AssistantDeps {
  actions: GarageVoiceActions;
  now: Date;
  focus: AssistantFocus;
}

export type AssistantAnswer =
  | { kind: 'answer'; say: string; display?: string; rows?: { title: string; rows: ReportRow[] }; focus?: AssistantFocus; openCaseId?: string; openChoice?: { caseId: string; label: string } }
  /** A short question; `resume` is the same request once it is answered. */
  | { kind: 'clarify'; say: string; display?: string; options: Array<[string, string]>; pending: AssistantRequest; need: 'who' | 'case' | 'customer' | 'phone' | 'company' | 'period' }
  /** A write that waits for an explicit yes. */
  | { kind: 'confirm'; say: string; display: string; action: PendingAction }
  | { kind: 'notAllowed'; say: string };

export type PendingAction =
  | { type: 'update_phone'; customerId: string; customerLabel: string; phone: string }
  | { type: 'delete_choice'; caseId: string; caseLabel: string };

const dayHe = (iso?: string | null) => {
  const d = new Date(String(iso || ''));
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};
const caseTitle = (c: GarageCase) => [c.case_number || 'תיק', c.customer_name_snapshot, c.vehicle_plate_snapshot ? `רכב ${c.vehicle_plate_snapshot}` : ''].filter(Boolean).join(' · ');
const caseLine = (c: GarageCase) => [caseTitle(c), garageCaseListStatus(c.case_data, c.status), `נפתח ${dayHe(c.created_at)}`, c.opened_by_name ? `ע"י ${c.opened_by_name}` : ''].filter(Boolean).join(' · ');
const byCreatedDesc = (a: GarageCase, b: GarageCase) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
const paidOf = (c: GarageCase) => {
  const cd = c.case_data as Record<string, unknown>;
  const total = Number(cd.totalPaid);
  if (Number.isFinite(total) && total > 0) return total;
  const list = Array.isArray(cd.payments) ? (cd.payments as Array<{ amount?: number }>) : [];
  return list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
};
const quoteTotals = (c: GarageCase) => {
  const cd = c.case_data;
  const works = (cd.quoteWorks || []).reduce((s, w) => s + (Number(w.price) || 0) * (Number(w.qty) || 1), 0);
  const parts = (cd.quoteParts || []).reduce((s, p) => (p.supplier === 'customer' ? s : s + (Number(p.price) || 0) * (Number(p.qty) || 1)), 0);
  return { net: works + parts, gross: Math.round((works + parts) * 1.18), lines: (cd.quoteWorks || []).length + (cd.quoteParts || []).length };
};

const MONEY_ROLES = ['super_admin', 'fleet_manager'];
const ASK_CASE = 'על איזה תיק? אפשר לומר מספר תיק או מספר רכב.';
const ASK_CUSTOMER = 'על איזה לקוח? אפשר לומר שם או טלפון.';

function matchCases(all: GarageCase[], ref: Ref, focus: AssistantFocus): GarageCase[] {
  if (ref.by === 'this') {
    if (focus.caseId) return all.filter((c) => c.id === focus.caseId);
    if (focus.vehicleId) return all.filter((c) => c.vehicle_id === focus.vehicleId).sort(byCreatedDesc);
    if (focus.customerId) return all.filter((c) => c.customer_id === focus.customerId).sort(byCreatedDesc);
    return [];
  }
  if (ref.by === 'number') {
    const exact = all.filter((c) => (c.case_number || '').replace(/\D/g, '').endsWith(ref.digits.padStart(4, '0')));
    return exact.length ? exact : all.filter((c) => (c.case_number || '').replace(/\D/g, '').endsWith(ref.digits));
  }
  if (ref.by === 'plate') return all.filter((c) => normalizePlate(c.vehicle_plate_snapshot || '') === ref.plate).sort(byCreatedDesc);
  if (ref.by === 'name') {
    const words = ref.name.split(/\s+/).filter((w) => w.length >= 2);
    return all.filter((c) => words.every((w) => (c.customer_name_snapshot || '').includes(w))).sort(byCreatedDesc);
  }
  return [];
}

/** One case for a details question: the referenced one, or the newest open one of a vehicle / customer. */
function oneCase(list: GarageCase[]): GarageCase | 'many' | null {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const sameVehicle = list.every((c) => c.vehicle_id === list[0].vehicle_id);
  const open = list.filter((c) => !isClosed(c));
  if (sameVehicle || list.every((c) => c.customer_id === list[0].customer_id)) return (open[0] || list[0]);
  return 'many';
}

async function findCustomers(a: GarageVoiceActions, ref: Ref, focus: AssistantFocus, all: () => Promise<GarageCase[]>): Promise<GarageCustomer[]> {
  if (ref.by === 'this') {
    let id = focus.customerId;
    if (!id && focus.caseId) id = (await all()).find((c) => c.id === focus.caseId)?.customer_id;
    if (!id) return [];
    const c = await a.getCustomer(id);
    return c ? [c] : [];
  }
  if (ref.by === 'phone') return a.searchCustomers(ref.phone.replace(/\D/g, ''));
  if (ref.by === 'name') return a.searchCustomers(ref.name);
  if (ref.by === 'plate') {
    const v = await a.findVehicleByPlate(ref.plate);
    const c = v ? await a.getCustomer(v.customer_id) : null;
    return c ? [c] : [];
  }
  if (ref.by === 'number') {
    const k = matchCases(await all(), ref, focus)[0];
    const c = k ? await a.getCustomer(k.customer_id) : null;
    return c ? [c] : [];
  }
  return [];
}

const listAnswer = (say: string, title: string, cases: GarageCase[], amount?: (c: GarageCase) => number, display?: string): AssistantAnswer => ({
  kind: 'answer',
  say,
  display,
  rows: { title, rows: cases.map((c) => caseRow(c, amount ? amount(c) : undefined)) },
  focus: cases.length === 1 ? { caseId: cases[0].id, customerId: cases[0].customer_id, vehicleId: cases[0].vehicle_id } : undefined,
});

export async function runAssistantRequest(req: AssistantRequest, deps: AssistantDeps): Promise<AssistantAnswer> {
  const a = deps.actions;
  let cache: GarageCase[] | null = null;
  const all = async () => (cache = cache || (await a.listAllCases()));
  const now = deps.now;
  const focusOf = (c: GarageCase): AssistantFocus => ({ caseId: c.id, customerId: c.customer_id, vehicleId: c.vehicle_id });
  const needMoneyRole = () => !!a.actorRole && !MONEY_ROLES.includes(a.actorRole);

  switch (req.kind) {
    case 'case.last_opened': {
      const cases = (await all()).slice().sort(byCreatedDesc);
      const shopLast = cases[0];
      const mine = a.actorId ? cases.find((c) => c.opened_by === a.actorId) : undefined;
      if (!shopLast) return { kind: 'answer', say: 'לא נמצאו תיקים במערכת.' };
      if (req.who === 'ask' && mine && mine.id !== shopLast.id) {
        return { kind: 'clarify', say: 'התיק האחרון שאתה פתחת, או האחרון שנפתח במוסך?', display: `שלך: ${caseLine(mine)}\nבמוסך: ${caseLine(shopLast)}`, options: [['👤 שאני פתחתי', 'שאני פתחתי'], ['🏢 האחרון במוסך', 'האחרון במוסך']], pending: req, need: 'who' };
      }
      if (req.who === 'me' && !a.actorId) return { kind: 'answer', say: 'אין לי את פרטי המשתמש המחובר, ולכן אני מציגה את התיק האחרון שנפתח במוסך.', display: caseLine(shopLast), focus: focusOf(shopLast), openChoice: { caseId: shopLast.id, label: shopLast.case_number } };
      const c = req.who === 'me' ? mine : (req.who === 'ask' ? (mine || shopLast) : shopLast);
      if (!c) return { kind: 'answer', say: 'לא מצאתי תיק שאתה פתחת.', display: `התיק האחרון במוסך: ${caseLine(shopLast)}`, focus: focusOf(shopLast), openChoice: { caseId: shopLast.id, label: shopLast.case_number } };
      const whose = req.who === 'me' || (req.who === 'ask' && mine) ? 'שאתה פתחת' : 'שנפתח במוסך';
      return { kind: 'answer', say: `התיק האחרון ${whose} הוא ${c.case_number}, של ${c.customer_name_snapshot || 'לקוח ללא שם'}, מ-${dayHe(c.created_at)}.`, display: caseLine(c), focus: focusOf(c), openChoice: { caseId: c.id, label: c.case_number } };
    }
    case 'case.last_closed': {
      const closed = (await all()).filter(isClosed);
      const dated = closed.filter((c) => c.case_data.caseClosedAt).sort((x, y) => String(y.case_data.caseClosedAt).localeCompare(String(x.case_data.caseClosedAt)));
      if (!closed.length) return { kind: 'answer', say: 'אין עדיין תיקים סגורים.' };
      if (!dated.length) return { kind: 'answer', say: 'יש תיקים סגורים, אבל תאריך הסגירה לא נשמר בהם, ולכן אי אפשר לדעת איזה נסגר אחרון.', display: `${closed.length} תיקים סגורים ללא תאריך סגירה.` };
      const c = dated[0];
      const undated = closed.length - dated.length;
      return { kind: 'answer', say: `התיק האחרון שנסגר הוא ${c.case_number}, של ${c.customer_name_snapshot || 'לקוח ללא שם'}, ב-${dayHe(c.case_data.caseClosedAt)}.`, display: [caseLine(c), `נסגר: ${dayHe(c.case_data.caseClosedAt)}`, undated ? `${undated} תיקים סגורים נוספים בלי תאריך סגירה — לא נכללו.` : ''].filter(Boolean).join('\n'), focus: focusOf(c), openChoice: { caseId: c.id, label: c.case_number } };
    }
    case 'case.closed_when': {
      const list = matchCases(await all(), req.ref, deps.focus);
      if (req.ref.by === 'none' || (req.ref.by === 'this' && !list.length)) return { kind: 'clarify', say: ASK_CASE, options: [], pending: req, need: 'case' };
      const closed = list.filter(isClosed);
      if (!list.length) return { kind: 'answer', say: 'לא מצאתי תיק מתאים.' };
      if (!closed.length) return { kind: 'answer', say: 'התיק הזה עדיין לא נסגר.', display: list.slice(0, 5).map(caseLine).join('\n'), focus: focusOf(list[0]) };
      const c = closed[0];
      return c.case_data.caseClosedAt
        ? { kind: 'answer', say: `התיק ${c.case_number} נסגר ב-${dayHe(c.case_data.caseClosedAt)}.`, display: caseLine(c), focus: focusOf(c), openChoice: { caseId: c.id, label: c.case_number } }
        : { kind: 'answer', say: `התיק ${c.case_number} סגור, אבל תאריך הסגירה לא נשמר בו.`, display: caseLine(c), focus: focusOf(c) };
    }
    case 'case.longest_open': {
      const open = (await all()).filter((c) => !isClosed(c) && c.created_at).sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
      if (!open.length) return { kind: 'answer', say: 'אין תיקים פתוחים.' };
      const c = open[0];
      const days = Math.floor((now.getTime() - new Date(String(c.created_at)).getTime()) / 86400000);
      return { kind: 'answer', say: `התיק שפתוח הכי הרבה זמן הוא ${c.case_number}, של ${c.customer_name_snapshot || 'לקוח ללא שם'}, פתוח ${days} ימים.`, display: caseLine(c), rows: { title: 'תיקים פתוחים מהוותיק לחדש', rows: open.slice(0, 30).map((x) => caseRow(x)) }, focus: focusOf(c), openChoice: { caseId: c.id, label: c.case_number } };
    }
    case 'case.list': {
      const list = (await all()).filter((c) => caseMatchesList(c, req.list)).sort(byCreatedDesc);
      return listAnswer(`${CASE_LIST_LABELS[req.list]}: ${list.length}.`, `${CASE_LIST_LABELS[req.list]} (${list.length})`, list);
    }
    case 'cases.count': {
      const range = periodRange(req.period, now);
      const inR = (iso?: string | null) => { if (!range.from) return true; const t = new Date(String(iso || '')).getTime(); return Number.isFinite(t) && t >= range.from.getTime() && (!range.to || t < range.to.getTime()); };
      const base = await all();
      if (req.what === 'closed') {
        const closed = base.filter(isClosed);
        const counted = closed.filter((c) => c.case_data.caseClosedAt && inR(c.case_data.caseClosedAt));
        const undated = closed.filter((c) => !c.case_data.caseClosedAt).length;
        return listAnswer(`${range.label}: נסגרו ${counted.length} תיקים.`, `תיקים שנסגרו · ${range.label}`, counted, undefined, undated ? `${undated} תיקים סגורים בלי תאריך סגירה לא נספרו.` : undefined);
      }
      const opened = base.filter((c) => inR(c.created_at));
      return listAnswer(`${range.label}: נפתחו ${opened.length} תיקים.`, `תיקים שנפתחו · ${range.label}`, opened);
    }
    case 'cases.opened_in': {
      const range = periodRange(req.period, now);
      const opened = (await all()).filter((c) => { const t = new Date(String(c.created_at || '')).getTime(); return range.from ? t >= range.from.getTime() && (!range.to || t < range.to.getTime()) : true; }).sort(byCreatedDesc);
      return listAnswer(`${range.label}: נפתחו ${opened.length} תיקים.`, `תיקים שנפתחו · ${range.label}`, opened);
    }
    case 'cases.for_customer': {
      if (req.ref.by === 'none') return { kind: 'clarify', say: ASK_CUSTOMER, options: [], pending: req, need: 'customer' };
      const customers = await findCustomers(a, req.ref, deps.focus, all);
      const base = await all();
      const list = customers.length
        ? base.filter((c) => customers.some((cu) => cu.id === c.customer_id)).sort(byCreatedDesc)
        : matchCases(base, req.ref, deps.focus);
      if (!list.length) return { kind: 'answer', say: customers.length ? 'ללקוח הזה אין תיקים.' : 'לא מצאתי לקוח או תיקים מתאימים.' };
      const who = customers.length === 1 ? customerDisplayName(customers[0]) : (req.ref.by === 'name' ? req.ref.name : 'הלקוח');
      return listAnswer(`ל${who} יש ${list.length} תיקים, ${list.filter((c) => !isClosed(c)).length} מהם פתוחים.`, `התיקים של ${who} (${list.length})`, list);
    }
    case 'case.find':
    case 'case.open': {
      if (req.ref.by === 'none') return { kind: 'clarify', say: ASK_CASE, options: [], pending: req, need: 'case' };
      const list = matchCases(await all(), req.ref, deps.focus);
      if (!list.length) return req.ref.by === 'this' ? { kind: 'clarify', say: ASK_CASE, options: [], pending: req, need: 'case' } : { kind: 'answer', say: 'לא מצאתי תיק מתאים.' };
      if (list.length === 1 || req.kind === 'case.open') {
        const c = oneCase(list);
        if (c && c !== 'many') {
          return req.kind === 'case.open'
            ? { kind: 'answer', say: `פותחת את התיק ${c.case_number}.`, display: caseLine(c), focus: focusOf(c), openCaseId: c.id }
            : { kind: 'answer', say: `מצאתי את התיק ${c.case_number}.`, display: caseLine(c), focus: focusOf(c), openChoice: { caseId: c.id, label: c.case_number } };
        }
      }
      return listAnswer(`מצאתי ${list.length} תיקים.`, `תוצאות (${list.length})`, list);
    }
    case 'case.detail': {
      const base = await all();
      if (req.ref.by === 'none' && !deps.focus.caseId) return { kind: 'clarify', say: ASK_CASE, options: [], pending: req, need: 'case' };
      const ref: Ref = req.ref.by === 'none' ? { by: 'this' } : req.ref;
      const list = matchCases(base, ref, deps.focus);
      if (!list.length) return ref.by === 'this' ? { kind: 'clarify', say: ASK_CASE, options: [], pending: { ...req, ref: { by: 'none' } }, need: 'case' } : { kind: 'answer', say: 'לא מצאתי תיק מתאים.' };
      const c = oneCase(list);
      if (c === 'many' || !c) return { ...listAnswer(`מצאתי ${list.length} תיקים. על איזה מהם?`, `תיקים (${list.length})`, list), kind: 'answer' };
      const cd = c.case_data;
      const f = focusOf(c);
      const base2 = { focus: f, openChoice: { caseId: c.id, label: c.case_number } };
      const q = quoteTotals(c);
      switch (req.field) {
        case 'quote':
          return q.lines
            ? { kind: 'answer', say: `הצעת המחיר בתיק ${c.case_number} היא ${money(q.net)} לפני מע"מ, ${money(q.gross)} כולל מע"מ.`, display: [caseLine(c), `${(cd.quoteWorks || []).length} עבודות, ${(cd.quoteParts || []).length} חלקים`, cd.quoteApproved ? 'ההצעה אושרה' : cd.quoteSent ? 'ההצעה נשלחה, ממתינה לאישור' : 'ההצעה טרם נשלחה'].join('\n'), ...base2 }
            : { kind: 'answer', say: `בתיק ${c.case_number} עוד אין הצעת מחיר.`, display: caseLine(c), ...base2 };
        case 'final': {
          const total = payableTotal(cd);
          return total
            ? { kind: 'answer', say: `המחיר לתשלום בתיק ${c.case_number} הוא ${money(total)}.`, display: [caseLine(c), cd.finalApprovedAmount ? 'לפי הסכום הסופי שאושר' : cd.workOrderAmount ? 'לפי סכום ההזמנה' : 'לפי הצעת המחיר כולל מע"מ'].join('\n'), ...base2 }
            : { kind: 'answer', say: `בתיק ${c.case_number} עוד אין מחיר סופי או הצעה.`, display: caseLine(c), ...base2 };
        }
        case 'parts': {
          const parts = cd.quoteParts || [];
          return { kind: 'answer', say: parts.length ? `בתיק ${c.case_number} רשומים ${parts.length} חלקים.` : `בתיק ${c.case_number} לא רשומים חלקים.`, display: [caseLine(c), ...parts.map((p) => `• ${p.name || 'חלק'} × ${p.qty || 1} — ${money((Number(p.price) || 0) * (Number(p.qty) || 1))}`)].join('\n'), ...base2 };
        }
        case 'works': {
          const works = cd.quoteWorks || [];
          return { kind: 'answer', say: works.length ? `בתיק ${c.case_number} רשומות ${works.length} עבודות.` : `בתיק ${c.case_number} לא רשומות עבודות.`, display: [caseLine(c), ...works.map((w) => `• ${w.part || w.type || 'עבודה'} — ${money((Number(w.price) || 0) * (Number(w.qty) || 1))}`)].join('\n'), ...base2 };
        }
        case 'order':
          return cd.workOrderSaved
            ? { kind: 'answer', say: `כן. בתיק ${c.case_number} יש הזמנת עבודה${cd.workOrderAmount ? ` על ${money(Number(cd.workOrderAmount))}` : ''}.`, display: [caseLine(c), cd.workOrderNumber ? `מספר הזמנה: ${cd.workOrderNumber}` : '', cd.workOrderDate ? `תאריך: ${cd.workOrderDate}` : ''].filter(Boolean).join('\n'), ...base2 }
            : { kind: 'answer', say: `לא. בתיק ${c.case_number} אין הזמנת עבודה רשומה.`, display: [caseLine(c), cd.quoteApproved ? 'ההצעה אושרה, אבל הזמנה לא נשמרה.' : ''].filter(Boolean).join('\n'), ...base2 };
        case 'extras': {
          const ex = cd.extraApprovals || [];
          return { kind: 'answer', say: ex.length ? `כן. בתיק ${c.case_number} יש ${ex.length} תוספות עבודה.` : `לא. בתיק ${c.case_number} אין תוספות עבודה.`, display: [caseLine(c), ...ex.map((x) => `• ${x.text || 'תוספת'} — ${money(Number(x.price) || 0)} · ${x.status === 'approved' || x.approvedAt ? 'אושרה' : 'ממתינה לאישור'}`)].join('\n'), ...base2 };
        }
        case 'paid': {
          if (needMoneyRole()) return { kind: 'notAllowed', say: 'אין לך הרשאה לנתוני תשלומים.' };
          const paid = paidOf(c);
          return { kind: 'answer', say: paid ? `בתיק ${c.case_number} שולמו ${money(paid)}.` : `בתיק ${c.case_number} לא נרשמו תשלומים.`, display: caseLine(c), ...base2 };
        }
        case 'balance': {
          if (needMoneyRole()) return { kind: 'notAllowed', say: 'אין לך הרשאה לנתוני תשלומים.' };
          const total = payableTotal(cd);
          const paid = paidOf(c);
          if (!total) return { kind: 'answer', say: `בתיק ${c.case_number} עוד אין סכום לתשלום, ולכן אי אפשר לחשב יתרה.`, display: caseLine(c), ...base2 };
          const bal = Math.max(0, total - paid);
          return { kind: 'answer', say: bal ? `בתיק ${c.case_number} נשאר לשלם ${money(bal)}.` : `התיק ${c.case_number} שולם במלואו.`, display: `${caseLine(c)}\nלתשלום: ${money(total)} · שולם: ${money(paid)}`, ...base2 };
        }
        case 'approvedBy': {
          const hit = (cd.timeline || []).filter((e) => /אישר|אושר|אישור/.test(String(e.text || '')) && /הצע/.test(String(e.text || ''))).pop();
          if (!cd.quoteApproved) return { kind: 'answer', say: `ההצעה בתיק ${c.case_number} עוד לא אושרה.`, display: caseLine(c), ...base2 };
          return hit
            ? { kind: 'answer', say: 'פרטי האישור מוצגים על המסך.', display: `${caseLine(c)}\n${dayHe(hit.at)} · ${hit.text}`, ...base2 }
            : { kind: 'answer', say: `ההצעה בתיק ${c.case_number} אושרה, אבל לא נשמר בתיק מי אישר אותה.`, display: caseLine(c), ...base2 };
        }
        case 'readyToClose': {
          const gaps = closeCaseGaps(cd);
          if (isClosed(c)) return { kind: 'answer', say: `התיק ${c.case_number} כבר סגור.`, display: caseLine(c), ...base2 };
          return gaps.length
            ? { kind: 'answer', say: `התיק ${c.case_number} עוד לא מוכן לסגירה. חסרים ${gaps.length} דברים.`, display: [caseLine(c), ...gaps.map((g) => `• ${g}`)].join('\n'), ...base2 }
            : { kind: 'answer', say: `כן. התיק ${c.case_number} מוכן לסגירה.`, display: caseLine(c), ...base2 };
        }
        default:
          return { kind: 'answer', say: `מצאתי את התיק ${c.case_number}.`, display: caseLine(c), ...base2 };
      }
    }
    case 'money.received': {
      if (needMoneyRole()) return { kind: 'notAllowed', say: 'אין לך הרשאה לנתוני כספים.' };
      // a missing period is asked (never guessed); an unknown company is "not found", never ₪0
      if (!req.period) return { kind: 'clarify', say: 'לאיזו תקופה? היום, אתמול, השבוע, החודש או השנה.', options: [['היום', 'היום'], ['השבוע', 'השבוע'], ['החודש', 'החודש']], pending: req, need: 'period' };
      if (req.company && !(await all()).some((c) => req.company!.split(/\s+/).every((w) => (c.customer_name_snapshot || '').includes(w)))) {
        return { kind: 'answer', say: `לא מצאתי תיקים של ${req.company}, ולכן אין נתוני תשלומים ממנה.` };
      }
      const r = computeReport(await all(), { type: req.company ? 'company' : 'financial', company: req.company, period: req.period, detail: 'details' }, now);
      const card = r.cards.find((x) => x.label === 'התקבל בפועל');
      const rows = r.rows.filter((x) => !String(x.subtitle || '').startsWith('יתרה'));
      return { kind: 'answer', say: `התקבל בפועל ${card?.value || money(0)}, ${r.periodLabel}${req.company ? `, מ${req.company}` : ''}.`, display: [card?.hint || '', ...r.notes].filter(Boolean).join('\n'), rows: { title: `תשלומים שהתקבלו · ${r.periodLabel}`, rows } };
    }
    case 'money.owed': {
      if (needMoneyRole()) return { kind: 'notAllowed', say: 'אין לך הרשאה לנתוני כספים.' };
      const base = await all();
      const scoped = req.company ? base.filter((c) => req.company!.split(/\s+/).every((w) => (c.customer_name_snapshot || '').includes(w))) : base;
      const owed = scoped.map((c) => ({ c, bal: Math.max(0, payableTotal(c.case_data) - paidOf(c)) })).filter((x) => x.bal > 0).sort((x, y) => y.bal - x.bal);
      const total = owed.reduce((s, x) => s + x.bal, 0);
      return { kind: 'answer', say: `עדיין חייבים לנו ${money(total)} ב-${owed.length} תיקים${req.company ? `, של ${req.company}` : ''}.`, display: 'יתרה = הסכום לתשלום בתיק פחות התשלומים שנרשמו. זה לא כסף שהתקבל.', rows: { title: `יתרות פתוחות (${owed.length})`, rows: owed.map((x) => caseRow(x.c, x.bal)) } };
    }
    case 'money.open_cases': {
      if (needMoneyRole()) return { kind: 'notAllowed', say: 'אין לך הרשאה לנתוני כספים.' };
      const open = (await all()).filter((c) => !isClosed(c));
      const withTotal = open.map((c) => ({ c, total: payableTotal(c.case_data) })).filter((x) => x.total > 0);
      const sum = withTotal.reduce((s, x) => s + x.total, 0);
      return { kind: 'answer', say: `בתיקים הפתוחים יש ${money(sum)} לתשלום, ב-${withTotal.length} תיקים.`, display: `${open.length - withTotal.length} תיקים פתוחים עוד בלי סכום (אין הצעה, הזמנה או מחיר מאושר). זה סכום לתשלום, לא כסף שהתקבל.`, rows: { title: `סכומים בתיקים פתוחים (${withTotal.length})`, rows: withTotal.map((x) => caseRow(x.c, x.total)) } };
    }
    case 'quotes.count': {
      const r = computeReport(await all(), { type: 'quotes', period: req.period, detail: 'details' }, now);
      const get = (label: string) => r.cards.find((x) => x.label === label);
      const approved = Number(get('אושרו')?.value || 0);
      const total = r.rows.length;
      return req.approvedOnly
        ? { kind: 'answer', say: `${r.periodLabel}: ${approved} הצעות מחיר אושרו.`, display: r.notes.join('\n'), rows: { title: `הצעות מחיר · ${r.periodLabel}`, rows: r.rows } }
        : { kind: 'answer', say: `${r.periodLabel}: ${total} הצעות מחיר. ${approved} אושרו, ${get('ממתינות לאישור')?.value || 0} ממתינות.`, display: r.notes.join('\n'), rows: { title: `הצעות מחיר · ${r.periodLabel}`, rows: r.rows } };
    }
    case 'vehicles.entered': {
      const r = computeReport(await all(), { type: 'activity', period: req.period, detail: 'details' }, now);
      const n = r.cards.find((x) => x.label === 'רכבים שנכנסו')?.value || '0';
      return { kind: 'answer', say: `${r.periodLabel}: נכנסו ${n} רכבים.`, rows: { title: `תיקים שנפתחו · ${r.periodLabel}`, rows: r.rows } };
    }
    case 'customer.top_paying': {
      if (needMoneyRole()) return { kind: 'notAllowed', say: 'אין לך הרשאה לנתוני כספים.' };
      const range = periodRange(req.period, now);
      const sums = new Map<string, number>();
      for (const c of await all()) {
        const list = Array.isArray((c.case_data as Record<string, unknown>).payments) ? ((c.case_data as Record<string, unknown>).payments as Array<{ amount?: number; payment_date?: string; created_at?: string }>) : [];
        for (const p of list) {
          const t = new Date(String(p.payment_date || p.created_at || '')).getTime();
          if (range.from && !(t >= range.from.getTime() && (!range.to || t < range.to.getTime()))) continue;
          const k = c.customer_name_snapshot || 'ללא שם';
          sums.set(k, (sums.get(k) || 0) + (Number(p.amount) || 0));
        }
      }
      const top = [...sums.entries()].sort((x, y) => y[1] - x[1]);
      if (!top.length) return { kind: 'answer', say: `לא נרשמו תשלומים ${range.label}, ולכן אין לקוח מוביל.` };
      return { kind: 'answer', say: `הלקוח שהכניס הכי הרבה ${range.label} הוא ${top[0][0]}, עם ${money(top[0][1])}.`, display: top.slice(0, 5).map(([k, v], i) => `${i + 1}. ${k} — ${money(v)}`).join('\n') };
    }
    case 'orders.unsettled': {
      const list = (await all()).filter((c) => c.case_data.workOrderSaved && !['paid', 'settled'].includes(String(c.case_data.paymentStatus || '')));
      return listAnswer(`${list.length} הזמנות עבודה עדיין לא סודרו.`, `הזמנות שלא סודרו (${list.length})`, list, (c) => Number(c.case_data.workOrderAmount) || 0, 'לא סודר = יש הזמנת עבודה, ומצב התשלום אינו "שולם" או "הוסדר".');
    }
    case 'customer.last': {
      if (!a.listCustomers) return { kind: 'answer', say: 'אין לי כאן גישה לרשימת הלקוחות.' };
      const list = (await a.listCustomers()).filter((c) => c.created_at).sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
      if (!list.length) return { kind: 'answer', say: 'לא נמצאו לקוחות.' };
      const c = list[0];
      return { kind: 'answer', say: `הלקוח האחרון שנפתח הוא ${customerDisplayName(c)}, מ-${dayHe(c.created_at)}.`, display: [customerDisplayName(c), c.phone || '', c.customer_number ? `לקוח #${c.customer_number}` : ''].filter(Boolean).join(' · '), focus: { customerId: c.id } };
    }
    case 'customer.vehicles': {
      if (req.ref.by === 'none') return { kind: 'clarify', say: ASK_CUSTOMER, options: [], pending: req, need: 'customer' };
      const customers = await findCustomers(a, req.ref, deps.focus, all);
      if (!customers.length) return req.ref.by === 'this' ? { kind: 'clarify', say: ASK_CUSTOMER, options: [], pending: req, need: 'customer' } : { kind: 'answer', say: 'לא מצאתי לקוח מתאים.' };
      if (customers.length > 1) return { kind: 'answer', say: `מצאתי ${customers.length} לקוחות מתאימים. על איזה מהם?`, display: customers.slice(0, 6).map((c, i) => `${i + 1}. ${customerDisplayName(c)} · ${c.phone || ''}`).join('\n') };
      const cu = customers[0];
      const vehicles: GarageVehicle[] = await a.listVehicles(cu.id);
      return { kind: 'answer', say: `ל${customerDisplayName(cu)} יש ${vehicles.length} רכבים.`, display: vehicles.map((v) => `• ${[v.plate, v.make, v.model, v.year || ''].filter(Boolean).join(' ')}`).join('\n') || 'אין רכבים רשומים.', focus: { customerId: cu.id } };
    }
    case 'customer.find': {
      if (req.ref.by === 'none') return { kind: 'clarify', say: 'מה מספר הטלפון?', options: [], pending: req, need: 'phone' };
      const customers = await findCustomers(a, req.ref, deps.focus, all);
      if (!customers.length) return { kind: 'answer', say: 'לא מצאתי לקוח עם הפרטים האלה.' };
      return { kind: 'answer', say: customers.length === 1 ? `מצאתי: ${customerDisplayName(customers[0])}.` : `מצאתי ${customers.length} לקוחות.`, display: customers.slice(0, 8).map((c) => [customerDisplayName(c), c.phone || '', c.customer_number ? `לקוח #${c.customer_number}` : ''].filter(Boolean).join(' · ')).join('\n'), focus: customers.length === 1 ? { customerId: customers[0].id } : undefined };
    }
    case 'vehicle.history': {
      const ref = req.ref.by === 'none' ? { by: 'this' } as Ref : req.ref;
      let list = matchCases(await all(), ref, deps.focus);
      if (ref.by === 'this' && deps.focus.vehicleId) list = (await all()).filter((c) => c.vehicle_id === deps.focus.vehicleId);
      if (!list.length) return { kind: 'clarify', say: 'על איזה רכב? אפשר לומר מספר רכב.', options: [], pending: { ...req, ref: { by: 'none' } }, need: 'case' };
      const sorted = list.slice().sort(byCreatedDesc);
      const lines = sorted.map((c) => {
        const works = (c.case_data.quoteWorks || []).map((w) => w.part || w.type).filter(Boolean).join(', ');
        return `• ${c.case_number} · ${dayHe(c.created_at)} · ${garageCaseListStatus(c.case_data, c.status)}${works ? ` · ${works}` : ''}`;
      });
      return { kind: 'answer', say: `לרכב ${sorted[0].vehicle_plate_snapshot || ''} יש ${sorted.length} תיקים בהיסטוריה.`, display: lines.join('\n'), rows: { title: `היסטוריית הרכב ${sorted[0].vehicle_plate_snapshot || ''}`, rows: sorted.map((c) => caseRow(c)) }, focus: { vehicleId: sorted[0].vehicle_id, customerId: sorted[0].customer_id } };
    }
    case 'customer.update_phone': {
      if (req.ref.by === 'none' && !deps.focus.customerId && !deps.focus.caseId) return { kind: 'clarify', say: ASK_CUSTOMER, options: [], pending: req, need: 'customer' };
      const customers = await findCustomers(a, req.ref.by === 'none' ? { by: 'this' } : req.ref, deps.focus, all);
      if (!customers.length) return { kind: 'answer', say: 'לא מצאתי את הלקוח.' };
      if (customers.length > 1) return { kind: 'answer', say: `מצאתי ${customers.length} לקוחות מתאימים. צריך לבחור לקוח אחד.`, display: customers.slice(0, 6).map((c) => `${customerDisplayName(c)} · ${c.phone || ''}`).join('\n') };
      if (!req.phone) return { kind: 'clarify', say: 'מה מספר הטלפון החדש?', options: [], pending: { ...req, ref: { by: 'name', name: customerDisplayName(customers[0]) } }, need: 'phone' };
      if (!a.updateCustomerDetails) return { kind: 'answer', say: 'עדכון טלפון לא זמין כאן. אפשר לעדכן מכרטיס הלקוח.' };
      const cu = customers[0];
      const dupes = (await a.searchCustomers(req.phone.replace(/\D/g, ''))).filter((x) => x.id !== cu.id);
      return {
        kind: 'confirm',
        say: 'לעדכן את מספר הטלפון של הלקוח? הפרטים מוצגים על המסך.',
        display: [`לקוח: ${customerDisplayName(cu)}`, `טלפון נוכחי: ${cu.phone || 'אין'}`, `טלפון חדש: ${req.phone}`, dupes.length ? `שימו לב: המספר כבר רשום אצל ${customerDisplayName(dupes[0])}.` : ''].filter(Boolean).join('\n'),
        action: { type: 'update_phone', customerId: cu.id, customerLabel: customerDisplayName(cu), phone: req.phone },
      };
    }
    case 'case.delete_request':
    case 'case.archive_request':
    case 'case.status_request': {
      if (req.ref.by === 'none' && !deps.focus.caseId) return { kind: 'clarify', say: ASK_CASE, options: [], pending: req, need: 'case' };
      const list = matchCases(await all(), req.ref.by === 'none' ? { by: 'this' } : req.ref, deps.focus);
      const c = oneCase(list);
      if (!c || c === 'many') return list.length ? listAnswer(`מצאתי ${list.length} תיקים. על איזה מהם?`, `תיקים (${list.length})`, list) : { kind: 'answer', say: 'לא מצאתי תיק מתאים.' };
      if (req.kind === 'case.delete_request') {
        return { kind: 'confirm', say: 'למחוק את התיק לגמרי, או רק להסתיר אותו מהרשימה?', display: caseLine(c), action: { type: 'delete_choice', caseId: c.id, caseLabel: caseTitle(c) } };
      }
      if (req.kind === 'case.archive_request') {
        return { kind: 'answer', say: 'במערכת אין עדיין ארכיון או הסתרה של תיקים, ולכן לא שיניתי דבר. אפשר לסגור תיק לפי כללי המוסך.', display: caseLine(c), focus: focusOf(c), openChoice: { caseId: c.id, label: c.case_number } };
      }
      return { kind: 'answer', say: 'סטטוס התיק משתנה לפי שלבי העבודה: קבלת רכב, עבודה, סיום וסגירה. אפשר לפתוח את התיק או להתחיל את השלב הבא.', display: `${caseLine(c)}\nהשלב הבא: ${garageNextActionSafe(c)}`, focus: focusOf(c), openChoice: { caseId: c.id, label: c.case_number } };
    }
  }
}

function garageNextActionSafe(c: GarageCase): string {
  const cd = c.case_data;
  if (cd.caseClosed) return 'התיק סגור';
  if (!cd.intakeDone) return 'קבלת רכב';
  if (!cd.workFinished) return 'סיום עבודה';
  return 'סגירת תיק';
}

/** A clarification answer completes the pending request ("שאני פתחתי", "תיק 42", "050…", "אלדן"). */
export function completeRequest(pending: AssistantRequest, need: 'who' | 'case' | 'customer' | 'phone' | 'company' | 'period', answer: string, now = new Date()): AssistantRequest | null {
  const t = norm(answer);
  if (need === 'period' && pending.kind === 'money.received') {
    const period = parsePeriod(t, now) as Period | null;
    return period ? { ...pending, period } : null;
  }
  if (need === 'who' && pending.kind === 'case.last_opened') {
    if (/אני|שלי|שאני|פתחתי/.test(t)) return { ...pending, who: 'me' };
    if (/מוסך|כללי|האחרון|כולם/.test(t)) return { ...pending, who: 'shop' };
    return null;
  }
  if (need === 'phone') {
    const phone = extractPhone(t);
    if (!phone) return null;
    if (pending.kind === 'customer.update_phone') return { ...pending, phone };
    if (pending.kind === 'customer.find') return { ...pending, ref: { by: 'phone', phone } };
    return null;
  }
  // bare digits: a case number (up to 5 digits) or a licence plate (7–8)
  const ref = refOf(/^\d{2,5}$/.test(t) ? `תיק ${t}` : t, need === 'case' ? 'case' : 'customer');
  const finalRef: Ref = ref.by === 'none' && t.length >= 2 && /[א-ת]/.test(t) ? { by: 'name', name: t } : ref;
  if (finalRef.by === 'none') return null;
  if ('ref' in pending) return { ...pending, ref: finalRef } as AssistantRequest;
  return null;
}
