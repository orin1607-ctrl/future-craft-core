// Conversational engine for the garage voice workflows (Dalia's buttons, the in-case shortcuts,
// "פעולה כללית" and "דוחות").
//
// Slot-filling model: every workflow is an ordered list of steps; Dalia asks the first step that still has
// no answer. One answer may fill several steps ("משה כהן 052…"), any step can be corrected ("תקני את
// הטלפון"), and nothing is ever invented — an unreadable answer is asked again.
// Every question Dalia speaks is fixed text (pre-recorded clips). A sentence that carries the worker's
// name or report figures is spoken from the device voice when one exists; otherwise its fixed `alt`
// is played and the full text stays on screen. Writes happen only after an explicit "yes" and only
// through GarageVoiceActions, i.e. the same functions the garage screen uses.

import {
  DALIA_SAFE_ALTERNATIVES,
  DALIA_VOICE_PROMPTS as P,
} from '../../../supabase/functions/_shared/daliaVoicePrompts';
import {
  approvedFinalAmount,
  closeCaseGaps,
  customerDisplayName,
  finishWorkGaps,
  garageCaseListStatus,
  garageNextAction,
  hasApprovedPrice,
  normalizePlate,
  vehicleLabel,
} from '@/modules/garage-management/garageBook';
import type {
  CaseSearchTerms,
  GarageCase,
  GarageCaseData,
  GarageCustomer,
  GarageInvoice,
  GarageSupplier,
  GarageVehicle,
  GarageVoiceActions,
} from '@/modules/garage-management/garageVoiceActions';
import {
  digitRuns,
  extractCompanyName,
  extractName,
  extractPhone,
  extractPlate,
  isNoneAnswer,
  isNoPriceAnswer,
  nameWordsOf,
  parseCaseListIntent,
  parseCustomerType,
  parseDate,
  parseFuel,
  parseHebrewNumber,
  parsePaymentMethod,
  parsePeriod,
  parseReportType,
  parseSpokenLine,
  parseYear,
  parseYesNo,
  pickFromList,
  splitMakeModel,
  stripPrefix,
  workTypeOf,
  type CaseListIntent,
  type SpokenLine,
} from './daliaVoiceParse';
import {
  CASE_LIST_LABELS,
  caseMatchesList,
  caseRow,
  computeReport,
  isClosed,
  type ReportCard,
  type ReportFilters,
  type ReportResult,
  type ReportRow,
  type ReportType,
} from './daliaReports';

export type VoiceWorkflowType =
  | 'new_customer'
  | 'existing_customer'
  | 'intake'
  | 'quote'
  | 'invoices_credits'
  | 'general_expenses'
  | 'find_case'
  | 'close_case'
  | 'resume_action'
  | 'general_action'
  | 'reports'
  | 'context_quote_add_work'
  | 'context_quote_add_part'
  | 'context_quote_supplement'
  | 'context_pay_balance'
  | 'context_pay_record';

export const VOICE_WORKFLOW_LABELS: Record<VoiceWorkflowType, string> = {
  new_customer: 'לקוח חדש',
  existing_customer: 'לקוח קיים',
  intake: 'קבלת רכב לעבודה',
  quote: 'הצעת מחיר',
  invoices_credits: 'חשבוניות וזיכויים',
  general_expenses: 'ספקים וחשבוניות',
  find_case: 'איתור תיק עבודה',
  close_case: 'סגירת תיק עבודה',
  resume_action: 'המשך פעולה אחרונה',
  general_action: 'שיחה כללית',
  reports: 'דוחות',
  context_quote_add_work: 'הוספת עבודה להצעה',
  context_quote_add_part: 'הוספת חלק להצעה',
  context_quote_supplement: 'תוספת להצעה',
  context_pay_balance: 'תשלום יתרה',
  context_pay_record: 'רישום תשלום',
};

type Candidate = { id: string; label: string };
type CandidateKind = 'customer' | 'case' | 'vehicle' | 'supplier';
type IntakeAngle = 'front' | 'rear' | 'right' | 'left' | 'dashboard';
type FinishAngle = 'front' | 'rear' | 'right' | 'left';

export interface VoiceFile {
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

/** Interactive pieces shown under a turn (buttons, lists, upload buttons, report cards). */
export type VoiceUi =
  | { type: 'choices'; options: Array<{ label: string; answer: string }> }
  | { type: 'upload'; label: string; camera: boolean; skipLabel?: string; skipAnswer?: string }
  | { type: 'list'; title: string; summary?: ReportCard[]; rows: ReportRow[]; notes?: string[] }
  | { type: 'report'; result: ReportResult; restartType: ReportType }
  | { type: 'checklist'; title: string; items: Array<{ label: string; state: 'ok' | 'missing' | 'ask' | 'info'; note?: string }> };

export interface VoiceData {
  customerName?: string;
  customerPhone?: string;
  customerType?: 'private' | 'business';
  companyName?: string;
  businessId?: string;
  similar?: Candidate[];
  similarDecision?: 'new' | 'existing';
  customerSaved?: boolean;
  vehicleMode?: 'photo' | 'voice' | 'none';
  licenseRead?: boolean;
  licenseVerified?: boolean;
  plate?: string;
  noVehicle?: boolean;
  make?: string;
  model?: string;
  year?: number | null;
  color?: string;
  vin?: string;
  vehicleSaved?: boolean;
  openWork?: boolean;
  /** The worker asked for a price quote for this customer (now or when the customer is ready). */
  wantQuote?: boolean;
  /** "תרצה שאכין לו גם הצעת מחיר?" was already asked — it is offered once. */
  quoteOffered?: boolean;
  arrivedNow?: boolean;
  complaint?: string;
  requestedWork?: string;
  condition?: string;
  orderNote?: string;
  km?: string;
  fuel?: string;
  keys?: string;
  lights?: string;
  lightsPending?: boolean;
  items?: string;
  itemsPending?: boolean;
  intakeSaved?: boolean;
  angles?: Partial<Record<IntakeAngle, boolean>>;
  photosDeferred?: boolean;
  customerId?: string;
  customerLabel?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  vehicleKnown?: boolean;
  caseId?: string;
  caseNumber?: string;
  caseLabel?: string;
  caseFromContext?: boolean;
  caseTotal?: number;
  casePaid?: number;
  candidates?: Candidate[];
  candidateKind?: CandidateKind;
  customerAction?: 'new_case' | 'open_case' | 'update';
  updateField?: 'contact' | 'note';
  updateValue?: string;
  noOpenCases?: boolean;
  scope?: 'quote' | 'supplement';
  quoteLocked?: boolean;
  works?: SpokenLine[];
  parts?: SpokenLine[];
  pending?: { kind: 'work' | 'part'; line: SpokenLine };
  worksDone?: boolean;
  partsDone?: boolean;
  extraText?: string;
  extraKind?: 'part' | 'work' | 'both';
  extraPrice?: number | null;
  extraCustomerSaid?: 'approved' | 'pending';
  payAmount?: number;
  payMethod?: { method: string; label: string };
  subType?: 'check' | 'prepare' | 'credit' | 'search' | 'purchase' | 'debt' | 'new_supplier';
  chargeTerms?: 'immediate' | 'monthly';
  supplierId?: string;
  supplierName?: string;
  supplierLabel?: string;
  supplierToCreate?: string;
  supplierPhone?: string;
  supplierCategory?: 'parts' | 'services';
  invoicePhotoDone?: boolean;
  invoiceRead?: boolean;
  invoiceVerified?: boolean;
  invoiceFile?: { name: string; type: string; b64: string };
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceTotal?: number;
  purchaseLink?: 'case' | 'general';
  purchaseKind?: 'parts' | 'services';
  purchaseCaseDone?: boolean;
  closeMode?: 'form' | 'voice';
  closeCd?: GarageCaseData;
  cqWorkAnswered?: boolean;
  cqMarkFinishAsked?: boolean;
  cqExtras?: boolean;
  cqIncluded?: boolean;
  cqPayment?: boolean;
  cqPaymentPending?: 'invoiced' | 'paid';
  cqMonthlyAsked?: boolean;
  report?: ReportFilters;
  reportMode?: 'questions' | 'speech';
  reportCompanyAsked?: boolean;
  reportStatusAsked?: boolean;
  reportDetailAsked?: boolean;
  listIntent?: CaseListIntent;
  resumeOf?: VoiceSession;
  /** The flow that was interrupted by a side question / another action — offered again when this one ends. */
  returnTo?: VoiceSession;
  /** After a side answer: waiting for "continue the previous action?". */
  awaitingContinue?: boolean;
  /** Another action was requested mid-flow: waiting for "switch to it?". */
  pendingSwitch?: { type: VoiceWorkflowType; prefill?: string; data?: Partial<VoiceData> };
}

export interface VoiceSession {
  id: string;
  type: VoiceWorkflowType;
  data: VoiceData;
  /** Step ids in the order they were answered — used by "back". */
  filled: string[];
  current?: string;
  updatedAt: string;
}

export interface VoiceTurn {
  /** Spoken sentence. Fixed (pre-recorded) unless `alt` is given. */
  say: string;
  /** Fixed sentence played instead of `say` when `say` cannot be spoken (no device Hebrew voice). */
  alt?: string;
  /** Extra details shown on screen only (lists, summaries, names). */
  display?: string;
  ui?: VoiceUi[];
  expectsAnswer: boolean;
  isConfirmation?: boolean;
  done: boolean;
  outcome?: 'executed' | 'cancelled' | 'failed' | 'info' | 'paused';
  openCaseId?: string;
  /** Keep the session stored so "המשך פעולה אחרונה" can retry (e.g. after a failed save). */
  keepForResume?: boolean;
  /** Free request Dalia's engine could not route — send it to the regular Dalia chat. */
  handoff?: string;
  /** Fixed question spoken right after `say` (e.g. "continue the previous action?" after a side answer). */
  followSay?: string;
}

export interface VoiceContext {
  caseId?: string | null;
  caseNumber?: string | null;
  customerName?: string | null;
  plate?: string | null;
}

export interface VoiceEnv {
  actions: GarageVoiceActions | null;
  now?: () => Date;
  /** First name of the signed-in worker, for personal phrasing only (never for permissions). */
  userName?: string;
  /** Reads a vehicle license / supplier invoice photo through the existing Dalia document reader (preview only). */
  readDocument?: (kind: 'vehicle_license' | 'supplier_invoice', file: VoiceFile) => Promise<Record<string, unknown> | null>;
}

type Ask = { say: string; alt?: string; display?: string; confirm?: boolean; ui?: VoiceUi[] };
type Outcome =
  | { kind: 'next'; display?: string; ui?: VoiceUi[] }
  | { kind: 'reask'; ask: Ask; display?: string }
  | { kind: 'finish'; turn: VoiceTurn }
  | { kind: 'switch'; type: VoiceWorkflowType; data?: Partial<VoiceData>; prefill?: string; intro?: string; introDisplay?: string };

interface Step {
  id: string;
  /** Correction keywords ("תקני את הטלפון"). */
  slots?: RegExp;
  applies?: (d: VoiceData, s: VoiceSession) => boolean;
  done: (d: VoiceData) => boolean;
  ask: (d: VoiceData, s: VoiceSession, env: VoiceEnv) => Ask;
  answer: (text: string, s: VoiceSession, env: VoiceEnv) => Outcome | Promise<Outcome>;
  onFile?: (file: VoiceFile, s: VoiceSession, env: VoiceEnv) => Promise<Outcome>;
  /** Runs instead of asking when the answer is already known from the data (e.g. a blocking gap). */
  auto?: (s: VoiceSession, env: VoiceEnv) => Outcome | null;
  clear: (d: VoiceData) => void;
}

// -----------------------------------------------------------------------------
// Formatting (screen only)
// -----------------------------------------------------------------------------

const money = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;
const numbered = (labels: string[]) => labels.map((l, i) => `${i + 1}. ${l}`).join('\n');

function customerLine(c: GarageCustomer): string {
  return [customerDisplayName(c) || 'ללא שם', c.phone || 'ללא טלפון', c.customer_number ? `לקוח #${c.customer_number}` : '']
    .filter(Boolean).join(' · ');
}
function vehicleLine(v: GarageVehicle): string {
  return [v.plate, vehicleLabel(v)].filter(Boolean).join(' · ');
}
function caseLine(c: GarageCase): string {
  return [c.case_number || 'תיק ללא מספר', c.customer_name_snapshot, c.vehicle_plate_snapshot ? `רכב ${c.vehicle_plate_snapshot}` : '', garageCaseListStatus(c.case_data, c.status)]
    .filter(Boolean).join(' · ');
}
function supplierLine(s: GarageSupplier): string {
  return [s.name, s.phone || '', s.supplier_number || ''].filter(Boolean).join(' · ');
}
function invoiceLine(i: GarageInvoice): string {
  return [
    `חשבונית ${i.invoice_number}`,
    i.supplier_name || '',
    i.vehicle_plate ? `רכב ${i.vehicle_plate}` : '',
    i.total_amount != null ? money(Number(i.total_amount)) : '',
    i.payment_status ? `תשלום: ${i.payment_status}` : '',
    i.credit_status && i.credit_status !== 'none' ? `זיכוי: ${i.credit_status}` : '',
  ].filter(Boolean).join(' · ');
}
function lineText(l: SpokenLine): string {
  const qty = l.qty > 1 ? ` × ${l.qty}` : '';
  return `${l.name}${qty} — ${l.price == null ? 'ללא מחיר' : money(l.price * l.qty)}`;
}

/** Same total the garage server tools use for balances (help-ai-chat resolveCaseTotalPayable). */
export function caseTotalPayable(cd: Record<string, unknown> | null | undefined): number {
  if (!cd) return 0;
  const n = (v: unknown) => Number(v) || 0;
  if (n(cd.finishAmount) > 0) return n(cd.finishAmount);
  if (n(cd.finalApprovedAmount) > 0) return n(cd.finalApprovedAmount);
  if (n(cd.workOrderAmount) > 0) return n(cd.workOrderAmount);
  if (n(cd.quoteGrandTotal) > 0) return n(cd.quoteGrandTotal);
  if (n(cd.totalAmount) > 0) return n(cd.totalAmount);
  const works = Array.isArray(cd.quoteWorks) ? cd.quoteWorks as Array<Record<string, unknown>> : [];
  const parts = Array.isArray(cd.quoteParts) ? cd.quoteParts as Array<Record<string, unknown>> : [];
  const worksSum = works.reduce((s, w) => s + n(w.price) * (n(w.qty) || 1), 0);
  const partsSum = parts.reduce((s, p) => (p.supplier === 'customer' ? s : s + n(p.price) * (n(p.qty) || 1)), 0);
  const sub = n(cd.quotePricedSubtotal) || worksSum + partsSum;
  if (sub > 0) return cd.vatMode === 'includes_vat' ? sub : Math.round(sub * 1.18);
  return 0;
}

function casePaid(cd: Record<string, unknown>): number {
  const payments = Array.isArray(cd.payments) ? cd.payments as Array<{ amount?: unknown }> : [];
  return Number(cd.totalPaid) || payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

// -----------------------------------------------------------------------------
// Turn helpers
// -----------------------------------------------------------------------------

const join = (...parts: Array<string | undefined>) => parts.filter((p) => p && p.trim()).join('\n\n') || undefined;

function finish(say: string, outcome: VoiceTurn['outcome'], extra: Partial<VoiceTurn> = {}): Outcome {
  return { kind: 'finish', turn: { say, expectsAnswer: false, done: true, outcome, ...extra } };
}
function failed(err: unknown, prefix = 'הפעולה לא הושלמה'): Outcome {
  const msg = err instanceof Error ? err.message : String(err || 'שגיאה');
  return finish(DALIA_SAFE_ALTERNATIVES.executedFailed, 'failed', { display: `${prefix}: ${msg}`, keepForResume: true });
}
const reask = (say: string, display?: string, ui?: VoiceUi[]): Outcome => ({ kind: 'reask', ask: { say, display, ui } });
const next = (display?: string, ui?: VoiceUi[]): Outcome => ({ kind: 'next', display, ui });
const choices = (...opts: Array<[string, string?]>): VoiceUi => ({ type: 'choices', options: opts.map(([label, answer]) => ({ label, answer: answer || label })) });
const YES_NO = choices(['כן'], ['לא']);
const upload = (label: string, skip?: [string, string]): VoiceUi => ({ type: 'upload', label, camera: true, skipLabel: skip?.[0], skipAnswer: skip?.[1] });

/** "מאיר, איזה לקוח…" — spoken with the name where a device voice exists; the fixed sentence otherwise. */
function personal(env: VoiceEnv, fixed: string): { say: string; alt?: string } {
  const name = (env.userName || '').trim();
  if (!name) return { say: fixed };
  return { say: `${name}, ${fixed}`, alt: fixed };
}

function needActions(env: VoiceEnv): GarageVoiceActions {
  if (!env.actions) throw new NoActionsError();
  return env.actions;
}
class NoActionsError extends Error {
  constructor() {
    super('no-actions');
  }
}
class SearchError extends Error {}

function timelineEntry(env: VoiceEnv, text: string) {
  return { at: (env.now?.() || new Date()).toISOString(), text, by: env.actions?.actorName || 'דליה AI' };
}

/** Confirmation step answer: only an explicit yes runs `run`. */
async function confirmAnswer(text: string, run: () => Promise<Outcome>): Promise<Outcome> {
  const yn = parseYesNo(text);
  if (yn === 'yes') {
    try {
      return await run();
    } catch (e) {
      if (e instanceof NoActionsError) return finish(P.noActions, 'failed');
      return failed(e);
    }
  }
  if (yn === 'no') return { kind: 'reask', ask: { say: P.notSaved, confirm: true, ui: [YES_NO] } };
  return { kind: 'reask', ask: { say: P.confirmRetry, confirm: true, ui: [YES_NO] } };
}

function confirmStep(
  summary: (d: VoiceData) => string,
  run: (s: VoiceSession, env: VoiceEnv) => Promise<Outcome>,
  applies?: Step['applies'],
  say: string = DALIA_SAFE_ALTERNATIVES.confirm,
  id = 'confirm',
): Step {
  return {
    id,
    applies,
    done: () => false,
    ask: (d) => ({ say, display: summary(d), confirm: true, ui: [YES_NO] }),
    answer: (text, s, env) => confirmAnswer(text, () => run(s, env)),
    clear: () => {},
  };
}

/** Yes/no question that runs `onYes` / `onNo` (each may finish, switch or continue). */
function yesNoGate(id: string, applies: Step['applies'], ask: (d: VoiceData, s: VoiceSession, env: VoiceEnv) => Ask, onYes: (s: VoiceSession, env: VoiceEnv) => Outcome | Promise<Outcome>, onNo: (s: VoiceSession, env: VoiceEnv) => Outcome | Promise<Outcome>, isDone: (d: VoiceData) => boolean): Step {
  return {
    id,
    applies,
    done: isDone,
    ask: (d, s, env) => ({ ...ask(d, s, env), ui: [YES_NO] }),
    answer: async (text, s, env) => {
      const yn = parseYesNo(text);
      if (yn === 'yes') return onYes(s, env);
      if (yn === 'no') return onNo(s, env);
      return reask(P.yesNoRetry, undefined, [YES_NO]);
    },
    clear: () => {},
  };
}

// -----------------------------------------------------------------------------
// Search (the bug fix): every visible case, by number / plate / name / phone; errors ≠ not found
// -----------------------------------------------------------------------------

export function caseSearchTerms(text: string): CaseSearchTerms {
  const phone = extractPhone(text);
  const plate = phone ? null : extractPlate(text);
  const hasNumerals = /\d/.test(text);
  // "מאה עשרים ותשע" is a number in words; "אחת שתיים תשע" is digits spoken one by one
  const numberInWords = !hasNumerals && /מאה|מאות|מאתיים|עשרים|שלושים|ארבעים|חמישים|שישים|שבעים|שמונים|תשעים|אלף|עשרה|עשר(\s|$)/.test(text);
  let digits = phone ? '' : numberInWords ? '' : digitRuns(text).join('');
  if (!digits && !phone) {
    const n = parseHebrewNumber(text.replace(/תיק|מספר/g, ' '));
    if (n !== null && n >= 1 && n < 100000 && Number.isInteger(n)) digits = String(n);
  }
  // a plate is also tried as a case number only when the user said "תיק"
  const numberDigits = plate && !/תיק/.test(text) ? null : (digits.length >= 2 ? digits : null);
  return { plate, numberDigits, nameWords: nameWordsOf(text), phone };
}

/** Real search through the garage actions; tries name words without Hebrew prefixes ("לאלדן") on a miss. */
async function searchCasesFor(env: VoiceEnv, text: string, scope: 'open' | 'notClosed' | 'any'): Promise<GarageCase[]> {
  const a = needActions(env);
  const terms = caseSearchTerms(text);
  const filter = (rows: GarageCase[]) => rows.filter((c) => (scope === 'any' ? true : !c.case_data?.caseClosed));
  let rows: GarageCase[];
  try {
    rows = filter(await a.searchCases(terms));
    if (!rows.length && terms.nameWords?.length) {
      const stripped = terms.nameWords.map(stripPrefix);
      if (stripped.join() !== terms.nameWords.join()) rows = filter(await a.searchCases({ ...terms, nameWords: stripped }));
    }
  } catch (e) {
    throw new SearchError(e instanceof Error ? e.message : String(e));
  }
  // "תיק 42": an exact case-number match beats substrings (0042 ≠ 0420), and open cases come first
  const digits = terms.numberDigits || '';
  if (digits && !terms.plate && !terms.phone && !(terms.nameWords || []).length) {
    const exact = rows.filter((c) => (c.case_number || '').replace(/\D/g, '').endsWith(digits.padStart(4, '0')));
    if (exact.length) rows = exact;
  }
  const open = rows.filter((c) => !c.case_data?.caseClosed);
  if (open.length === 1 && rows.length > 1 && digits && !(terms.nameWords || []).length) return open;
  return [...open, ...rows.filter((c) => c.case_data?.caseClosed)];
}

function caseListUi(title: string, cases: GarageCase[], summary?: ReportCard[]): VoiceUi {
  return { type: 'list', title, summary, rows: cases.map((c) => caseRow(c)) };
}

// -----------------------------------------------------------------------------
// Reusable steps
// -----------------------------------------------------------------------------

function nameStep(id: string, askFn: (d: VoiceData, s: VoiceSession, env: VoiceEnv) => Ask, applies?: Step['applies']): Step {
  return {
    id,
    slots: /(^|\s)ה?שם(\s|$)/,
    applies,
    done: (d) => !!d.customerName,
    ask: askFn,
    answer: (text, s) => {
      const raw = extractName(text);
      const isCompany = /(^|\s)חברת\s|בע"מ|בע״מ/.test(text);
      const name = raw ? raw.replace(/^חברת\s+/, '').trim() : raw;
      if (!name) return reask(P.customerNameRetry);
      s.data.customerName = name;
      const phone = extractPhone(text);
      if (phone && !s.data.customerPhone) s.data.customerPhone = phone;
      if (isCompany && !s.data.customerType) s.data.customerType = 'business';
      return next();
    },
    clear: (d) => { d.customerName = undefined; },
  };
}

function phoneStep(applies?: Step['applies'], after?: (s: VoiceSession, env: VoiceEnv) => Promise<void>): Step {
  return {
    id: 'phone',
    slots: /טלפון|פלאפון|נייד|סלולרי/,
    applies,
    done: (d) => !!d.customerPhone,
    ask: () => ({ say: P.phone }),
    answer: async (text, s, env) => {
      const phone = extractPhone(text);
      if (!phone) return reask(P.phoneInvalid);
      s.data.customerPhone = phone;
      if (after) await after(s, env);
      return next();
    },
    clear: (d) => { d.customerPhone = undefined; d.similar = undefined; d.similarDecision = undefined; },
  };
}

function customerTypeSteps(applies?: Step['applies'], typeSay = P.customerTypeBiz): Step[] {
  return [
    {
      id: 'customerType',
      slots: /סוג( ה)?לקוח|פרטי|עסקי/,
      applies,
      done: (d) => !!d.customerType,
      ask: () => ({ say: typeSay, ui: [choices(['פרטי'], ['עסקי'])] }),
      answer: (text, s) => {
        const t = parseCustomerType(text) || (/עסקי/.test(text) ? 'business' : null);
        if (!t) return reask(P.customerTypeRetry, undefined, [choices(['פרטי'], ['עסקי'])]);
        s.data.customerType = t;
        if (t === 'business' && !s.data.companyName) s.data.companyName = s.data.customerName;
        return next();
      },
      clear: (d) => { d.customerType = undefined; d.companyName = undefined; d.businessId = undefined; },
    },
    {
      id: 'businessId',
      slots: /ח\.?פ|עוסק/,
      applies: (d, s) => (applies ? applies(d, s) : true) && d.customerType === 'business',
      done: (d) => d.businessId !== undefined,
      ask: () => ({ say: P.businessId, ui: [choices(['דלג'])] }),
      answer: (text, s) => {
        if (/דלג|אין|לא יודע|אחר כך/.test(text)) {
          s.data.businessId = '';
          return next();
        }
        const digits = digitRuns(text).join('');
        if (digits.length < 5) return reask(P.businessId, undefined, [choices(['דלג'])]);
        s.data.businessId = digits;
        return next();
      },
      clear: (d) => { d.businessId = undefined; },
    },
  ];
}

function modelStep(applies: Step['applies']): Step {
  return {
    id: 'model',
    slots: /דגם|יצרן|סוג( ה)?רכב/,
    applies,
    done: (d) => d.model !== undefined,
    ask: () => ({ say: P.model }),
    answer: (text, s) => {
      if (/לא יודע|לא ידוע|אין לי מושג/.test(text)) {
        s.data.make = '';
        s.data.model = '';
        return next();
      }
      const year = parseYear(text, new Date());
      const { make, model } = splitMakeModel(text.replace(/(19|20)\d{2}/, '').trim());
      s.data.make = make;
      s.data.model = model;
      if (year && s.data.year === undefined) s.data.year = year;
      return next();
    },
    clear: (d) => { d.make = undefined; d.model = undefined; },
  };
}

function yearStep(applies: Step['applies']): Step {
  return {
    id: 'year',
    slots: /שנה|שנת/,
    applies,
    done: (d) => d.year !== undefined,
    ask: () => ({ say: P.year, ui: [choices(['לא ידוע'])] }),
    answer: (text, s, env) => {
      if (/לא ידוע|לא יודע|דלג/.test(text)) {
        s.data.year = null;
        return next();
      }
      let y = parseYear(text, env.now?.() || new Date());
      if (!y) {
        const n = parseHebrewNumber(text);
        if (n && n >= 1950 && n <= (env.now?.() || new Date()).getFullYear() + 1) y = n;
      }
      if (!y) return reask(P.yearRetry, undefined, [choices(['לא ידוע'])]);
      s.data.year = y;
      return next();
    },
    clear: (d) => { d.year = undefined; },
  };
}

function yesNoStep(id: string, say: string, key: 'arrivedNow', slots: RegExp, applies?: Step['applies']): Step {
  return {
    id,
    slots,
    applies,
    done: (d) => d[key] !== undefined,
    ask: () => ({ say, ui: [YES_NO] }),
    answer: (text, s) => {
      const yn = parseYesNo(text);
      if (!yn) return reask(P.yesNoRetry, undefined, [YES_NO]);
      s.data[key] = yn === 'yes';
      return next();
    },
    clear: (d) => { d[key] = undefined; },
  };
}

function freeTextStep(id: string, key: 'complaint' | 'requestedWork' | 'condition' | 'orderNote', say: string, slots: RegExp, applies?: Step['applies']): Step {
  return {
    id,
    slots,
    applies,
    done: (d) => d[key] !== undefined,
    ask: () => ({ say }),
    answer: (text, s) => {
      if (/^(אין|לא ידוע|לא יודע|לא צוין|לא)$/.test(text.trim())) {
        s.data[key] = '';
        return next();
      }
      if (!/[א-תA-Za-z]{2,}/.test(text)) return reask(P.notUnderstood);
      s.data[key] = text.trim();
      return next();
    },
    clear: (d) => { d[key] = undefined; },
  };
}

/** Optional detail field asked as yes/no first ("האם יש נורות…?" → "אילו?"). */
function detailStep(id: 'lights' | 'items', askSay: string, whichSay: string, slots: RegExp): Step {
  const pendingKey = id === 'lights' ? 'lightsPending' : 'itemsPending';
  return {
    id,
    slots,
    done: (d) => d[id] !== undefined,
    ask: (d) => ({ say: d[pendingKey] ? whichSay : askSay, ui: d[pendingKey] ? undefined : [YES_NO] }),
    answer: (text, s) => {
      const d = s.data;
      if (d[pendingKey]) {
        if (!/[א-תA-Za-z]{2,}/.test(text)) return reask(whichSay);
        d[id] = text.trim();
        d[pendingKey] = false;
        return next();
      }
      const yn = parseYesNo(text);
      const words = text.trim().split(/\s+/);
      if (yn === 'no' || /^(אין|ללא)/.test(text.trim())) {
        d[id] = 'אין';
        return next();
      }
      if (words.length > 1 && /[א-תA-Za-z]{2,}/.test(text) && !(yn === 'yes' && words.length <= 2)) {
        d[id] = text.replace(/^(כן|יש)[,\s]+/, '').trim();
        return next();
      }
      if (yn === 'yes') {
        d[pendingKey] = true;
        return reask(whichSay);
      }
      return reask(P.yesNoRetry, undefined, [YES_NO]);
    },
    clear: (d) => { d[id] = undefined; d[pendingKey] = false; },
  };
}

/** Search + pick an existing customer (name, phone, customer number or plate). */
function customerSearchStep(openSay: (env: VoiceEnv) => Ask): Step {
  return {
    id: 'customer',
    slots: /(^|\s)ה?לקוח(\s|$)/,
    done: (d) => !!d.customerId,
    ask: (d, _s, env) => {
      if (d.candidateKind === 'customer' && d.candidates?.length) {
        return d.candidates.length === 1
          ? { say: P.customerOne, display: d.candidates[0].label, ui: [YES_NO] }
          : { say: P.customerMany, display: numbered(d.candidates.map((c) => c.label)), ui: [choices(...d.candidates.map((c, i) => [`${i + 1}. ${c.label.split(' · ')[0]}`, `מספר ${i + 1}`] as [string, string]))] };
      }
      return openSay(env);
    },
    answer: async (text, s, env) => {
      const d = s.data;
      if (d.candidateKind === 'customer' && d.candidates?.length) {
        const list = d.candidates;
        if (list.length === 1) {
          const yn = parseYesNo(text);
          if (yn === 'yes') return selectCustomer(s, list[0]);
          if (yn === 'no') {
            d.candidates = undefined;
            return reask(P.existingOpen);
          }
        } else {
          const idx = pickFromList(text, list.map((c, i) => `${i + 1}. ${c.label}`));
          if (idx !== null) return selectCustomer(s, list[idx]);
        }
        if (!extractPhone(text) && !extractPlate(text) && text.trim().split(/\s+/).length < 2) {
          return reask(P.pickRetry, numbered(list.map((c) => c.label)));
        }
      }
      if (/לקוח חדש/.test(text)) return { kind: 'switch', type: 'new_customer' };
      const actions = needActions(env);
      const phone = extractPhone(text);
      const plate = extractPlate(text);
      const words = nameWordsOf(text);
      const digits = digitRuns(text).join('');
      const query = phone ? phone.replace(/\D/g, '') : plate || (digits.length >= 3 ? digits : '') || words.join(' ') || text.trim();
      let found: GarageCustomer[];
      try {
        found = await actions.searchCustomers(query);
        if (!found.length && words.length) {
          const stripped = words.map(stripPrefix).join(' ');
          if (stripped !== query) found = await actions.searchCustomers(stripped);
        }
      } catch (e) {
        return reask(P.searchFailed, e instanceof Error ? e.message : undefined);
      }
      d.candidates = undefined;
      if (!found.length) return reask(P.customerNotFound, `חיפוש: ${query}`);
      if (found.length > 6) return reask(P.tooMany, `נמצאו ${found.length} לקוחות עבור "${query}".`);
      d.candidateKind = 'customer';
      d.candidates = found.map((c) => ({ id: c.id, label: customerLine(c) }));
      return next();
    },
    clear: (d) => {
      d.customerId = undefined;
      d.customerLabel = undefined;
      if (d.candidateKind === 'customer') d.candidates = undefined;
    },
  };
}
function selectCustomer(s: VoiceSession, c: Candidate): Outcome {
  s.data.customerId = c.id;
  s.data.customerLabel = c.label;
  s.data.candidates = undefined;
  s.data.candidateKind = undefined;
  return next(`נבחר הלקוח: ${c.label}`);
}

/** Matches cases by plate, case number or customer name (used on already-loaded lists). */
export function matchCases(cases: GarageCase[], text: string): GarageCase[] {
  const terms = caseSearchTerms(text);
  const words = terms.nameWords || [];
  return cases.filter((c) => {
    const p = normalizePlate(c.vehicle_plate_snapshot || '');
    if (terms.plate && p === terms.plate) return true;
    const num = (c.case_number || '').replace(/\D/g, '');
    const digits = terms.numberDigits || '';
    if (digits.length >= 2 && num && (num === digits || num.endsWith(digits.padStart(4, '0')) || num.endsWith(digits))) return true;
    if (words.length && words.every((w) => (c.customer_name_snapshot || '').includes(w) || (c.customer_name_snapshot || '').includes(stripPrefix(w)))) return true;
    return false;
  });
}

/** Search + pick a work case. */
function caseSearchStep(opts: {
  askSay: (env: VoiceEnv, d: VoiceData) => Ask;
  scope: 'open' | 'notClosed' | 'any';
  applies?: Step['applies'];
  optional?: boolean;
  onSelected?: (s: VoiceSession, env: VoiceEnv) => Promise<Outcome | null>;
}): Step {
  const select = async (s: VoiceSession, env: VoiceEnv, c: Candidate & { number?: string }): Promise<Outcome> => {
    const d = s.data;
    d.caseId = c.id;
    d.caseLabel = c.label;
    d.caseNumber = c.number || c.label.split(' · ')[0];
    d.candidates = undefined;
    d.candidateKind = undefined;
    const extra = opts.onSelected ? await opts.onSelected(s, env) : null;
    return extra || next(`נבחר התיק: ${c.label}`);
  };
  return {
    id: 'case',
    slots: /(^|\s)ה?תיק(\s|$)/,
    applies: opts.applies,
    done: (d) => !!d.caseId || (!!opts.optional && !!d.purchaseCaseDone),
    ask: (d, _s, env) => {
      if (d.candidateKind === 'case' && d.candidates?.length) {
        return {
          say: P.casesMany,
          display: numbered(d.candidates.map((c) => c.label)),
          ui: [choices(...d.candidates.map((c, i) => [`${i + 1}. ${c.label.split(' · ').slice(0, 2).join(' · ')}`, `מספר ${i + 1}`] as [string, string]))],
        };
      }
      return opts.askSay(env, d);
    },
    answer: async (text, s, env) => {
      const d = s.data;
      if (opts.optional && /לא שייך|ללא תיק|בלי תיק|הוצאה כללית|^אין$/.test(text.trim())) {
        d.purchaseCaseDone = true;
        return next();
      }
      if (d.candidateKind === 'case' && d.candidates?.length) {
        const list = d.candidates;
        const idx = pickFromList(text, list.map((c, i) => `${i + 1}. ${c.label}`));
        if (idx !== null) return select(s, env, list[idx]);
        if (!extractPlate(text) && digitRuns(text).join('').length < 2 && text.trim().split(/\s+/).length < 2) {
          return reask(P.pickRetry, numbered(list.map((c) => c.label)));
        }
      }
      let found: GarageCase[];
      try {
        found = await searchCasesFor(env, text, opts.scope);
      } catch (e) {
        if (e instanceof NoActionsError) throw e;
        return reask(P.searchFailed, e instanceof Error ? `פרטי התקלה: ${e.message}` : undefined);
      }
      d.candidates = undefined;
      if (!found.length) return reask(P.caseNotFound, `חיפוש: ${text.trim()}`);
      if (found.length === 1) return select(s, env, { id: found[0].id, label: caseLine(found[0]), number: found[0].case_number });
      if (found.length > 6) {
        d.candidateKind = 'case';
        d.candidates = found.slice(0, 6).map((c) => ({ id: c.id, label: caseLine(c) }));
        return reask(P.casesMany, `נמצאו ${found.length} תיקים — מוצגים 6 האחרונים. הרשימה המלאה בכפתור.`, [caseListUi(`תוצאות חיפוש (${found.length})`, found)]);
      }
      d.candidateKind = 'case';
      d.candidates = found.map((c) => ({ id: c.id, label: caseLine(c) }));
      return next();
    },
    clear: (d) => {
      if (d.caseFromContext) return;
      d.caseId = undefined;
      d.caseNumber = undefined;
      d.caseLabel = undefined;
      d.purchaseCaseDone = undefined;
      if (d.candidateKind === 'case') d.candidates = undefined;
    },
  };
}

function plateStep(askFn: (d: VoiceData, s: VoiceSession, env: VoiceEnv) => Ask, opts: { allowNone?: boolean; applies?: Step['applies']; onPlate?: (s: VoiceSession, env: VoiceEnv) => Promise<Outcome | null> } = {}): Step {
  return {
    id: 'plate',
    slots: /מספר( ה)?רכב|לוחית|רישוי/,
    applies: opts.applies,
    done: (d) => !!d.plate || !!d.noVehicle,
    ask: (d, s, env) => {
      const a = askFn(d, s, env);
      return opts.allowNone ? { ...a, ui: [choices(['בלי רכב'])] } : a;
    },
    answer: async (text, s, env) => {
      if (opts.allowNone && /בלי רכב|אין רכב|ללא רכב|^אין$/.test(text.trim())) {
        s.data.noVehicle = true;
        return next();
      }
      const plate = extractPlate(text);
      if (!plate) return reask(P.plateInvalid);
      s.data.plate = plate;
      s.data.noVehicle = false;
      if (opts.onPlate) {
        const out = await opts.onPlate(s, env);
        if (out) return out;
      }
      return next();
    },
    clear: (d) => {
      d.plate = undefined;
      d.noVehicle = undefined;
      d.vehicleKnown = undefined;
      d.vehicleId = undefined;
      d.vehicleLabel = undefined;
      if (!d.caseFromContext && !d.intakeSaved) {
        d.caseId = undefined;
        d.caseNumber = undefined;
      }
    },
  };
}

function customerSummary(d: VoiceData): string[] {
  return [
    d.customerLabel ? `לקוח: ${d.customerLabel}` : '',
    d.customerName ? `שם: ${d.customerName}` : '',
    d.customerPhone ? `טלפון: ${d.customerPhone}` : '',
    d.customerType ? `סוג: ${d.customerType === 'business' ? 'עסקי' : 'פרטי'}` : '',
    d.businessId ? `ח.פ / עוסק: ${d.businessId}` : '',
  ].filter(Boolean);
}
function vehicleSummary(d: VoiceData): string[] {
  if (d.noVehicle) return ['רכב: ללא — יישמר כרטיס לקוח בלבד'];
  return [
    d.vehicleLabel ? `רכב: ${d.vehicleLabel}` : d.plate ? `רכב: ${d.plate}` : '',
    !d.vehicleLabel && (d.make || d.model) ? `יצרן ודגם: ${[d.make, d.model].filter(Boolean).join(' ')}` : '',
    d.year ? `שנה: ${d.year}` : '',
    d.color ? `צבע: ${d.color}` : '',
    d.vin ? `שלדה: ${d.vin}` : '',
    d.arrivedNow !== undefined ? `הרכב במוסך עכשיו: ${d.arrivedNow ? 'כן' : 'לא'}` : '',
    d.complaint !== undefined ? `תלונה / סיבת כניסה: ${d.complaint || 'לא צוינה'}` : '',
  ].filter(Boolean);
}

async function ensureCustomer(s: VoiceSession, env: VoiceEnv, force = false): Promise<{ customer: GarageCustomer; note: string }> {
  const a = needActions(env);
  const d = s.data;
  if (d.customerId) {
    const c = await a.getCustomer(d.customerId);
    if (!c) throw new Error('הלקוח לא נמצא במערכת');
    return { customer: c, note: '' };
  }
  const { customer, duplicates } = await a.createCustomer({
    customer_type: d.customerType || 'private',
    name: d.customerName || '',
    company_name: d.customerType === 'business' ? d.companyName || d.customerName || '' : '',
    phone: d.customerPhone || '',
    business_id: d.businessId || '',
  }, { force });
  d.customerId = customer.id;
  d.customerLabel = customerLine(customer);
  return {
    customer,
    note: duplicates.length ? `לקוח עם אותם פרטים כבר קיים במערכת (${customerLine(customer)}) — נעשה שימוש בכרטיס הקיים.` : '',
  };
}

async function ensureVehicle(s: VoiceSession, env: VoiceEnv, customer: GarageCustomer): Promise<GarageVehicle> {
  const a = needActions(env);
  const d = s.data;
  if (d.vehicleId) {
    const own = (await a.listVehicles(customer.id)).find((v) => v.id === d.vehicleId);
    if (own) return own;
  }
  const plate = d.plate || '';
  const existing = await a.findVehicleByPlate(plate);
  if (existing) {
    if (existing.customer_id !== customer.id) {
      throw new Error(`מספר הרכב ${plate} כבר רשום אצל לקוח אחר במוסך.`);
    }
    d.vehicleId = existing.id;
    return existing;
  }
  const v = await a.createVehicle({ customer_id: customer.id, plate, make: d.make || '', model: d.model || '', year: d.year || null, color: d.color || '', vin: d.vin || '' });
  d.vehicleId = v.id;
  d.vehicleLabel = vehicleLine(v);
  return v;
}

function newCaseData(env: VoiceEnv, d: VoiceData, route: 'quote_first' | 'intake_first', extra: GarageCaseData = {}): GarageCaseData {
  const complaint = d.complaint ? ` תלונת לקוח: ${d.complaint}` : '';
  return {
    route,
    ...extra,
    timeline: [timelineEntry(env, `התיק נפתח בשיחה קולית עם דליה AI.${complaint}`)],
  };
}

// -----------------------------------------------------------------------------
// Workflow: new customer (→ optional vehicle by license photo or speech → optional new work)
// -----------------------------------------------------------------------------

const LICENSE_FIELDS = (p: Record<string, unknown>) => ({
  plate: extractPlate(String(p.plate_number || p.plate || p.vehicle_plate || '')) || undefined,
  make: String(p.make || '').trim() || undefined,
  model: String(p.model || '').trim() || undefined,
  year: parseYear(String(p.year || '')) || undefined,
  color: String(p.color || '').trim() || undefined,
  vin: String(p.vin || '').trim() || undefined,
});

/** A work case is opened when the worker asked for work, or for a quote once a vehicle is attached. */
const workWanted = (d: VoiceData) => !!d.openWork || (!!d.wantQuote && !!d.vehicleSaved);
const QUOTE_OFFER = choices(['📝 כן, הצעת מחיר', 'כן, הצעת מחיר'], ['🔧 פתיחת עבודה בלי הצעה', 'פתיחת עבודה'], ['✔ לא, תודה', 'לא, תודה']);

function vehicleAttachSteps(): Step[] {
  const wantsVehicle = (d: VoiceData) => !!d.customerSaved && (d.vehicleMode === 'photo' || d.vehicleMode === 'voice') && !d.vehicleSaved;
  return [
    {
      id: 'vehicleChoice',
      applies: (d) => !!d.customerSaved,
      done: (d) => !!d.vehicleMode,
      ask: (d) => (d.wantQuote || d.openWork
        ? { say: P.quoteNeedsVehicle, ui: [choices(['📷 צילום רישיון', 'צילום רישיון'], ['🎙️ בדיבור', 'בדיבור'], ['בלי הצעת מחיר'])] }
        : { say: P.vehicleChoice, ui: [choices(['📷 צילום רישיון', 'צילום רישיון'], ['🎙️ בדיבור', 'בדיבור'], ['בלי רכב'])] }),
      answer: (text, s) => {
        if (/בלי הצעת מחיר|בלי הצעה|לא צריך הצעה|בלי עבודה/.test(text)) {
          // the worker dropped the quote / work: the customer stays saved, nothing else is opened
          s.data.wantQuote = false;
          s.data.openWork = false;
          s.data.quoteOffered = true;
          s.data.vehicleMode = 'none';
          return finish(P.customerOnlyCreated, 'executed', { display: s.data.customerLabel ? `כרטיס לקוח: ${s.data.customerLabel}` : undefined });
        }
        if (/בלי|לא עכשיו|אחר כך|לא תודה|^לא$|אין/.test(text.trim())) {
          if (s.data.wantQuote || s.data.openWork) {
            return reask(P.quoteNeedsVehicle, undefined, [choices(['📷 צילום רישיון', 'צילום רישיון'], ['🎙️ בדיבור', 'בדיבור'], ['בלי הצעת מחיר'])]);
          }
          s.data.vehicleMode = 'none';
          return next(); // → the closing offer
        }
        if (/צילום|תמונה|רישיון|לצלם|מצלמה|להעלות/.test(text)) s.data.vehicleMode = 'photo';
        else if (/דיבור|להגיד|בקול|אגיד|אומר|פרטים/.test(text)) s.data.vehicleMode = 'voice';
        else if (extractPlate(text)) {
          s.data.vehicleMode = 'voice';
          s.data.plate = extractPlate(text)!;
        } else return reask(P.choiceRetry, undefined, [choices(['📷 צילום רישיון', 'צילום רישיון'], ['🎙️ בדיבור', 'בדיבור'], ['בלי רכב'])]);
        return next();
      },
      clear: (d) => { d.vehicleMode = undefined; },
    },
    {
      id: 'licensePhoto',
      applies: (d) => wantsVehicle(d) && d.vehicleMode === 'photo' && !d.licenseRead,
      done: (d) => !!d.licenseRead,
      ask: () => ({ say: P.licenseUpload, ui: [upload('רישיון רכב', ['בדיבור במקום', 'בדיבור'])] }),
      answer: (text, s) => {
        if (/דיבור|בקול|אגיד/.test(text)) {
          s.data.vehicleMode = 'voice';
          return next();
        }
        return reask(P.licenseUpload, undefined, [upload('רישיון רכב', ['בדיבור במקום', 'בדיבור'])]);
      },
      onFile: async (file, s, env) => {
        let fields: Record<string, unknown> | null = null;
        try {
          fields = env.readDocument ? await env.readDocument('vehicle_license', file) : null;
        } catch {
          fields = null;
        }
        const f = fields ? LICENSE_FIELDS(fields) : null;
        if (!f || !f.plate) {
          s.data.vehicleMode = 'voice';
          return reask(P.licenseReadFailed);
        }
        Object.assign(s.data, f);
        s.data.licenseRead = true;
        return next();
      },
      clear: (d) => { d.licenseRead = undefined; },
    },
    {
      id: 'licenseVerify',
      applies: (d) => wantsVehicle(d) && !!d.licenseRead,
      done: (d) => !!d.licenseVerified,
      ask: (d) => ({ say: P.licenseReadOk, display: ['פרטים שנקראו מהרישיון (לבדיקה):', ...vehicleSummary(d)].join('\n'), ui: [YES_NO] }),
      answer: (text, s) => {
        const yn = parseYesNo(text);
        if (yn === 'yes') {
          s.data.licenseVerified = true;
          return next();
        }
        if (yn === 'no') {
          // nothing read from the photo is kept without the worker's confirmation
          Object.assign(s.data, { plate: undefined, make: undefined, model: undefined, year: undefined, color: undefined, vin: undefined, licenseRead: false, vehicleMode: 'voice' });
          return next('בסדר, נמלא את פרטי הרכב בדיבור.');
        }
        return reask(P.yesNoRetry, undefined, [YES_NO]);
      },
      clear: (d) => { d.licenseVerified = undefined; },
    },
    plateStep(() => ({ say: P.vehiclePlate }), {
      applies: (d) => wantsVehicle(d) && (d.vehicleMode === 'voice' || !!d.licenseVerified),
      onPlate: async (s, env) => {
        const existing = await needActions(env).findVehicleByPlate(s.data.plate!);
        if (existing && existing.customer_id !== s.data.customerId) {
          s.data.plate = undefined;
          return reask(P.plateTaken, undefined, [choices(['בלי רכב'])]);
        }
        if (existing) {
          s.data.vehicleId = existing.id;
          s.data.vehicleLabel = vehicleLine(existing);
        }
        return null;
      },
    }),
    modelStep((d) => wantsVehicle(d) && !!d.plate && !d.vehicleId),
    yearStep((d) => wantsVehicle(d) && !!d.plate && !d.vehicleId),
    confirmStep(
      (d) => ['פרטי הרכב:', ...vehicleSummary(d), d.customerLabel ? `ללקוח: ${d.customerLabel}` : ''].filter(Boolean).join('\n'),
      async (s, env) => {
        const d = s.data;
        if (d.noVehicle) return finish(P.customerOnlyCreated, 'executed');
        const { customer } = await ensureCustomer(s, env);
        const v = await ensureVehicle(s, env, customer);
        d.vehicleSaved = true;
        d.vehicleLabel = vehicleLine(v);
        return next(`נשמר רכב: ${d.vehicleLabel}`);
      },
      (d) => wantsVehicle(d) && (!!d.plate || !!d.noVehicle),
      P.vehicleConfirm,
      'vehicleConfirm',
    ),
    {
      id: 'quoteOffer',
      applies: (d) => !!d.customerSaved && (!!d.vehicleSaved || d.vehicleMode === 'none') && !d.wantQuote && d.openWork === undefined,
      done: (d) => d.openWork !== undefined || !!d.wantQuote,
      ask: (d) => ({
        say: P.customerDoneOfferQuote,
        display: [d.customerLabel ? `לקוח: ${d.customerLabel}` : '', d.vehicleLabel ? `רכב: ${d.vehicleLabel}` : ''].filter(Boolean).join('\n') || undefined,
        ui: [QUOTE_OFFER],
      }),
      answer: (text, s) => {
        const d = s.data;
        d.quoteOffered = true;
        const t = text.trim();
        const yn = parseYesNo(t);
        const needVehicle = () => {
          if (d.vehicleMode === 'none' && !d.vehicleSaved) d.vehicleMode = undefined; // the vehicle question comes back
          return next();
        };
        if (/הצעת מחיר|הצעה|הצעת/.test(t) && yn !== 'no') {
          d.wantQuote = true;
          return needVehicle();
        }
        if (/פתיחת עבודה|עבודה חדשה|לפתוח עבודה|תיק עבודה|לפתוח תיק/.test(t) && yn !== 'no') {
          d.openWork = true;
          return needVehicle();
        }
        if (yn === 'yes') {
          d.wantQuote = true;
          return needVehicle();
        }
        if (yn === 'no' || /^(נסיים|לסיים|סיימנו|זהו|זה הכל|זה הכול|תודה)/.test(t)) {
          d.openWork = false;
          return finish(P.finishedPolite, 'executed', { display: [d.customerLabel, d.vehicleLabel].filter(Boolean).join('\n') || undefined });
        }
        // another task — keep the customer that was just opened
        const route = routeFreeRequest(t);
        if (route && route.type !== 'new_customer') {
          d.openWork = false;
          return { kind: 'switch', type: route.type, data: route.data, prefill: route.prefill };
        }
        return reask(P.choiceRetry, undefined, [QUOTE_OFFER]);
      },
      clear: (d) => { d.openWork = undefined; d.wantQuote = undefined; },
    },
    freeTextStep('complaint', 'complaint', P.complaint, /תלונה|תקלה|בעיה|סיבת/, (d) => workWanted(d)),
    yesNoStep('arrivedNow', P.arrivedNow, 'arrivedNow', /הגיע|נמצא במוסך/, (d) => workWanted(d)),
    confirmStep(
      (d) => ['סיכום עבודה חדשה:', ...customerSummary(d), ...vehicleSummary(d)].join('\n'),
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        const { customer } = await ensureCustomer(s, env);
        const vehicle = await ensureVehicle(s, env, customer);
        const created = await a.createCase({ customer, vehicle, caseData: newCaseData(env, d, d.arrivedNow ? 'intake_first' : 'quote_first') });
        const opened = `נפתח תיק ${created.case_number || ''} עבור ${customerDisplayName(customer)}, רכב ${vehicle.plate}.`;
        if (d.wantQuote) {
          // the same customer, vehicle and case — the quote asks only for works / parts / prices
          return {
            kind: 'switch',
            type: 'quote',
            intro: P.caseCreatedToQuote,
            introDisplay: opened,
            data: {
              caseId: created.id,
              caseNumber: created.case_number || undefined,
              caseLabel: [created.case_number, customerDisplayName(customer), `רכב ${vehicle.plate}`].filter(Boolean).join(' · '),
              caseFromContext: true,
              scope: 'quote',
            },
          };
        }
        return finish(P.caseCreated, 'executed', { display: opened, openCaseId: created.id });
      },
      (d) => workWanted(d),
      DALIA_SAFE_ALTERNATIVES.confirm,
      'caseConfirm',
    ),
  ];
}

function newCustomerFlow(): Step[] {
  const beforeSave = (d: VoiceData) => !d.customerSaved;
  const findSimilar = async (s: VoiceSession, env: VoiceEnv) => {
    const a = needActions(env);
    const d = s.data;
    const seen = new Map<string, GarageCustomer>();
    try {
      for (const q of [d.customerPhone?.replace(/\D/g, ''), d.customerName].filter(Boolean) as string[]) {
        (await a.searchCustomers(q)).forEach((c) => seen.set(c.id, c));
      }
    } catch {
      return; // a failed duplicate check never blocks — createCustomer checks duplicates again
    }
    const phone = (d.customerPhone || '').replace(/\D/g, '');
    const similar = [...seen.values()].filter((c) =>
      (phone && (c.phone || '').replace(/\D/g, '') === phone) || customerDisplayName(c).trim() === (d.customerName || '').trim());
    d.similar = similar.slice(0, 5).map((c) => ({ id: c.id, label: customerLine(c) }));
  };
  return [
    nameStep('name', (_d, _s, env) => personal(env, P.newCustomerOpen), beforeSave),
    phoneStep(beforeSave, findSimilar),
    {
      id: 'similar',
      applies: (d) => beforeSave(d) && !!d.similar?.length,
      done: (d) => !!d.similarDecision,
      ask: (d) => ({
        say: P.similarFound,
        display: numbered((d.similar || []).map((c) => c.label)),
        ui: [choices(['כן, זה אותו לקוח', 'כן'], ['לא, לקוח חדש', 'לא'])],
      }),
      answer: (text, s) => {
        const d = s.data;
        const list = d.similar || [];
        const yn = parseYesNo(text);
        const idx = list.length > 1 ? pickFromList(text, list.map((c, i) => `${i + 1}. ${c.label}`)) : null;
        if (yn === 'yes' || idx !== null) {
          const chosen = list[idx ?? 0];
          d.similarDecision = 'existing';
          return { kind: 'switch', type: 'existing_customer', data: { customerId: chosen.id, customerLabel: chosen.label } };
        }
        if (yn === 'no') {
          d.similarDecision = 'new';
          return next();
        }
        return reask(P.yesNoRetry, undefined, [YES_NO]);
      },
      clear: (d) => { d.similarDecision = undefined; },
    },
    ...customerTypeSteps(beforeSave),
    confirmStep(
      (d) => ['סיכום לקוח חדש:', ...customerSummary(d)].join('\n'),
      async (s, env) => {
        const { customer, note } = await ensureCustomer(s, env, s.data.similarDecision === 'new');
        s.data.customerSaved = true;
        return next(join(`נשמר כרטיס לקוח: ${customerLine(customer)}`, note));
      },
      beforeSave,
      P.confirmCustomer,
      'customerConfirm',
    ),
    ...vehicleAttachSteps(),
  ];
}

// -----------------------------------------------------------------------------
// Workflow: existing customer
// -----------------------------------------------------------------------------

const CUSTOMER_MENU = choices(['כרטיס לקוח', 'כרטיס'], ['רכבים'], ['תיקי עבודה'], ['עדכון פרטים'], ['עבודה חדשה'], ['זהו']);

function existingCustomerFlow(): Step[] {
  const newCase = (d: VoiceData) => d.customerAction === 'new_case';
  const update = (d: VoiceData) => d.customerAction === 'update';
  return [
    customerSearchStep((env) => personal(env, P.existingOpen)),
    {
      id: 'customerAction',
      done: (d) => !!d.customerAction,
      ask: (d) => ({ say: P.customerMenu, display: d.customerLabel, ui: [CUSTOMER_MENU] }),
      answer: async (text, s, env) => {
        const d = s.data;
        const a = needActions(env);
        if (/^(זהו|סיימתי|לא|תודה|זה הכל|זה הכול)$/.test(text.trim())) return finish(P.okDone, 'info');
        if (/כרטיס/.test(text) && !/רכב/.test(text)) {
          const c = await a.getCustomer(d.customerId!);
          const [vehicles, cases] = await Promise.all([a.listVehicles(d.customerId!), a.listCustomerCases(d.customerId!)]);
          const open = cases.filter((x) => !isClosed(x));
          return reask(P.customerMenuAgain, [
            'כרטיס לקוח:',
            c ? customerLine(c) : d.customerLabel || '',
            c?.email ? `מייל: ${c.email}` : '',
            c?.address ? `כתובת: ${c.address}` : '',
            c?.contact_person ? `איש קשר: ${c.contact_person}` : '',
            c?.business_id ? `ח.פ: ${c.business_id}` : '',
            `רכבים: ${vehicles.length} · תיקים: ${cases.length} (פתוחים: ${open.length})`,
          ].filter(Boolean).join('\n'), [CUSTOMER_MENU]);
        }
        if (/רכב/.test(text) && !/חדש/.test(text)) {
          const vehicles = await a.listVehicles(d.customerId!);
          return reask(P.customerMenuAgain, vehicles.length ? numbered(vehicles.map(vehicleLine)) : 'ללקוח אין רכבים רשומים.', [CUSTOMER_MENU]);
        }
        if (/עדכ|לשנות|לתקן פרט/.test(text)) {
          d.customerAction = 'update';
          return next();
        }
        if (/חדש|לפתוח תיק עבודה|פתחי תיק|עבודה חדשה|תיק עבודה חדש/.test(text) && !/קיים/.test(text)) {
          d.customerAction = 'new_case';
          const vehicles = await a.listVehicles(d.customerId!);
          d.candidateKind = 'vehicle';
          d.candidates = vehicles.map((v) => ({ id: v.id, label: vehicleLine(v) }));
          return next();
        }
        if (/תיק|קיים|פתוח|ישן|אחרון/.test(text)) {
          const cases = await a.listCustomerCases(d.customerId!);
          if (!cases.length) {
            d.noOpenCases = true;
            return reask(P.noCustomerCases, undefined, [CUSTOMER_MENU]);
          }
          if (cases.length === 1 || /אחרון/.test(text)) {
            return finish(P.openingCase, 'info', { display: caseLine(cases[0]), openCaseId: cases[0].id });
          }
          d.customerAction = 'open_case';
          d.candidateKind = 'case';
          d.candidates = cases.slice(0, 6).map((c) => ({ id: c.id, label: caseLine(c) }));
          return next(undefined, cases.length > 6 ? [caseListUi(`כל התיקים של הלקוח (${cases.length})`, cases)] : undefined);
        }
        return reask(P.customerMenuRetry, undefined, [CUSTOMER_MENU]);
      },
      clear: (d) => { d.customerAction = undefined; d.noOpenCases = undefined; d.candidates = undefined; d.candidateKind = undefined; },
    },
    {
      id: 'pickOpenCase',
      applies: (d) => d.customerAction === 'open_case',
      done: () => false,
      ask: (d) => ({
        say: P.casesMany,
        display: numbered((d.candidates || []).map((c) => c.label)),
        ui: [choices(...(d.candidates || []).map((c, i) => [`${i + 1}. ${c.label.split(' · ')[0]}`, `מספר ${i + 1}`] as [string, string]))],
      }),
      answer: (text, s) => {
        const list = s.data.candidates || [];
        const idx = pickFromList(text, list.map((c, i) => `${i + 1}. ${c.label}`));
        if (idx === null) return reask(P.pickRetry, numbered(list.map((c) => c.label)));
        return finish(P.openingCase, 'info', { display: list[idx].label, openCaseId: list[idx].id });
      },
      clear: () => {},
    },
    // update details — only what the existing customer book allows (contact person, notes)
    {
      id: 'updateWhat',
      applies: update,
      done: (d) => !!d.updateField,
      ask: () => ({ say: P.updateWhat, ui: [choices(['איש קשר'], ['הוספת הערה', 'הערה'])] }),
      answer: (text, s) => {
        if (/איש קשר|קשר/.test(text)) s.data.updateField = 'contact';
        else if (/הערה|הערות/.test(text)) s.data.updateField = 'note';
        else return reask(P.updateWhat, undefined, [choices(['איש קשר'], ['הוספת הערה', 'הערה'])]);
        return next();
      },
      clear: (d) => { d.updateField = undefined; },
    },
    {
      id: 'updateValue',
      applies: (d) => update(d) && !!d.updateField,
      done: (d) => !!d.updateValue,
      ask: (d) => ({ say: d.updateField === 'contact' ? P.contactName : P.noteText }),
      answer: (text, s) => {
        const v = s.data.updateField === 'contact' ? extractName(text) : text.trim();
        if (!v || !/[א-תA-Za-z]{2,}/.test(v)) return reask(s.data.updateField === 'contact' ? P.contactName : P.noteText);
        s.data.updateValue = v;
        return next();
      },
      clear: (d) => { d.updateValue = undefined; },
    },
    confirmStep(
      (d) => [`לקוח: ${d.customerLabel}`, d.updateField === 'contact' ? `איש קשר חדש: ${d.updateValue}` : `הערה להוספה: ${d.updateValue}`].join('\n'),
      async (s, env) => {
        const d = s.data;
        await needActions(env).updateCustomerContact(d.customerId!, d.updateField === 'contact' ? { contact_person: d.updateValue } : { appendNote: d.updateValue });
        return finish(P.customerUpdated, 'executed', { display: d.customerLabel });
      },
      (d) => update(d) && !!d.updateValue,
      P.confirmUpdate,
      'updateConfirm',
    ),
    {
      id: 'vehicle',
      slots: /מספר( ה)?רכב|לוחית/,
      applies: newCase,
      done: (d) => !!d.vehicleId || !!d.plate,
      ask: (d) => {
        const list = d.candidateKind === 'vehicle' ? d.candidates || [] : [];
        if (!list.length) return { say: P.vehicleNewPlate };
        if (list.length === 1) return { say: P.vehicleOne, display: list[0].label, ui: [YES_NO] };
        return { say: P.vehicleMany, display: numbered(list.map((c) => c.label)), ui: [choices(...list.map((c, i) => [`${i + 1}. ${c.label}`, `מספר ${i + 1}`] as [string, string]))] };
      },
      answer: (text, s) => {
        const d = s.data;
        const list = d.candidateKind === 'vehicle' ? d.candidates || [] : [];
        const plate = extractPlate(text);
        const choose = (c: Candidate) => {
          d.vehicleId = c.id;
          d.vehicleLabel = c.label;
          d.candidates = undefined;
          d.candidateKind = undefined;
          return next(`נבחר רכב: ${c.label}`);
        };
        if (plate) {
          const same = list.find((c) => normalizePlate(c.label.split(' · ')[0]) === plate);
          if (same) return choose(same);
          d.plate = plate;
          d.candidates = undefined;
          d.candidateKind = undefined;
          return next();
        }
        if (list.length === 1) {
          const yn = parseYesNo(text);
          if (yn === 'yes') return choose(list[0]);
          if (yn === 'no') {
            d.candidates = [];
            return reask(P.vehicleNewPlate);
          }
          return reask(P.yesNoRetry, undefined, [YES_NO]);
        }
        if (list.length > 1) {
          const idx = pickFromList(text, list.map((c, i) => `${i + 1}. ${c.label}`));
          if (idx !== null) return choose(list[idx]);
          return reask(P.pickRetry, numbered(list.map((c) => c.label)));
        }
        return reask(P.plateInvalid);
      },
      clear: (d) => { d.vehicleId = undefined; d.vehicleLabel = undefined; d.plate = undefined; },
    },
    modelStep((d) => newCase(d) && !!d.plate && !d.vehicleId),
    freeTextStep('complaint', 'complaint', P.complaint, /תלונה|תקלה|בעיה|סיבת/, newCase),
    yesNoStep('arrivedNow', P.arrivedNow, 'arrivedNow', /הגיע|נמצא במוסך/, newCase),
    confirmStep(
      (d) => ['סיכום תיק עבודה חדש:', ...customerSummary(d), ...vehicleSummary(d)].join('\n'),
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        const { customer } = await ensureCustomer(s, env);
        const vehicle = await ensureVehicle(s, env, customer);
        const created = await a.createCase({ customer, vehicle, caseData: newCaseData(env, d, d.arrivedNow ? 'intake_first' : 'quote_first') });
        return finish(P.caseCreated, 'executed', {
          display: `נפתח תיק ${created.case_number || ''} עבור ${customerDisplayName(customer)}, רכב ${vehicle.plate}.`,
          openCaseId: created.id,
        });
      },
      newCase,
    ),
  ];
}

// -----------------------------------------------------------------------------
// Workflow: vehicle intake (fields → save → required photos → worker confirmation)
// -----------------------------------------------------------------------------

/** Exactly the photos the intake screen requires before «הרכב התקבל» (confirmIntake in the garage screen). */
export const INTAKE_ANGLES: Array<{ id: IntakeAngle; title: string; say: string }> = [
  { id: 'front', title: 'קדימה', say: P.photoFront },
  { id: 'rear', title: 'אחורה', say: P.photoRear },
  { id: 'right', title: 'צד ימין', say: P.photoRight },
  { id: 'left', title: 'צד שמאל', say: P.photoLeft },
  { id: 'dashboard', title: 'לוח שעונים / מד קילומטראז\'', say: P.photoDashboard },
];
const FINISH_ANGLES: Array<{ id: FinishAngle; title: string; say: string }> = [
  { id: 'front', title: 'סיום קדימה', say: P.finishPhotoFront },
  { id: 'rear', title: 'סיום אחורה', say: P.finishPhotoRear },
  { id: 'right', title: 'סיום צד ימין', say: P.finishPhotoRight },
  { id: 'left', title: 'סיום צד שמאל', say: P.finishPhotoLeft },
];
const missingIntakeAngles = (d: VoiceData) => INTAKE_ANGLES.filter((a) => !d.angles?.[a.id]);

function intakeFlow(): Step[] {
  const newOwner = (d: VoiceData) => !d.vehicleKnown && !d.caseFromContext && !d.intakeSaved;
  const details = (d: VoiceData) => !d.intakeSaved;
  const lookup = async (s: VoiceSession, env: VoiceEnv): Promise<Outcome | null> => {
    const a = needActions(env);
    const d = s.data;
    const vehicle = await a.findVehicleByPlate(d.plate!);
    if (!vehicle) {
      d.vehicleKnown = false;
      return next(`הרכב ${d.plate} לא נמצא במערכת — ייפתחו לקוח, רכב ותיק חדשים.`);
    }
    d.vehicleKnown = true;
    d.vehicleId = vehicle.id;
    d.vehicleLabel = vehicleLine(vehicle);
    d.customerId = vehicle.customer_id;
    const customer = await a.getCustomer(vehicle.customer_id);
    d.customerLabel = customer ? customerLine(customer) : undefined;
    const open = (await a.listCustomerCases(vehicle.customer_id)).filter((c) => c.vehicle_id === vehicle.id && !isClosed(c) && !c.case_data.workFinished);
    if (open.length) {
      const c = open[0];
      if (c.case_data.intakeDone) {
        return finish(P.okNotOpening, 'info', { display: `הרכב כבר התקבל בתיק הפתוח ${c.case_number || ''}.`, openCaseId: c.id });
      }
      if (c.case_data.route === 'quote_first' && !c.case_data.quoteApproved && !c.case_data.intakeUnlocked) {
        return finish(P.intakeBlockedQuoteFirst, 'info', { display: caseLine(c), openCaseId: c.id });
      }
      d.caseId = c.id;
      d.caseNumber = c.case_number;
      d.caseLabel = caseLine(c);
      d.angles = { ...(c.case_data.intakeAngles || {}) };
    }
    return next(join(
      `הרכב נמצא: ${d.vehicleLabel}${d.customerLabel ? ` · ${d.customerLabel}` : ''}`,
      open.length ? `פרטי הקבלה יישמרו בתיק הפתוח ${open[0].case_number || ''}.` : 'ייפתח תיק עבודה חדש לרכב.',
    ));
  };
  return [
    plateStep((_d, _s, env) => personal(env, P.intakeOpen), { applies: (d) => !d.caseFromContext && details(d), onPlate: lookup }),
    nameStep('name', () => ({ say: P.vehicleNotFoundName }), newOwner),
    phoneStep(newOwner),
    ...customerTypeSteps(newOwner),
    modelStep(newOwner),
    freeTextStep('complaint', 'complaint', P.intakeComplaint, /תלונה|תקלה|בעיה|סיבת/, details),
    freeTextStep('requestedWork', 'requestedWork', P.intakeWork, /עבודה מבוקשת|העבודה/, details),
    freeTextStep('condition', 'condition', P.intakeCondition, /מצב( ה)?רכב|פנים/, details),
    {
      id: 'order',
      slots: /הזמנה|אישור עבודה/,
      applies: details,
      done: (d) => d.orderNote !== undefined,
      ask: () => ({ say: P.intakeOrder, ui: [YES_NO] }),
      answer: (text, s) => {
        const yn = parseYesNo(text);
        if (yn === null && !/הזמנה|אישור/.test(text)) return reask(P.yesNoRetry, undefined, [YES_NO]);
        const digits = digitRuns(text).join('');
        s.data.orderNote = yn === 'no' ? 'אין הזמנה או אישור עבודה' : `קיימת הזמנה / אישור עבודה${digits ? ` (מספר ${digits})` : ''} — לצרף במסך התיק`;
        return next();
      },
      clear: (d) => { d.orderNote = undefined; },
    },
    {
      id: 'km',
      slots: /קילומטר|ק"מ|ק״מ|מד אוץ/,
      applies: details,
      done: (d) => d.km !== undefined,
      ask: () => ({ say: P.km }),
      answer: (text, s) => {
        const n = parseHebrewNumber(text);
        // a numeric mileage is required by the intake screen — "לא ידוע" is not accepted
        if (n === null || n < 0 || n > 3_000_000) return reask(P.kmRetry);
        s.data.km = String(Math.round(n));
        return next();
      },
      clear: (d) => { d.km = undefined; },
    },
    {
      id: 'fuel',
      slots: /דלק/,
      applies: details,
      done: (d) => d.fuel !== undefined,
      ask: () => ({ say: P.fuel, ui: [choices(['ריק'], ['רבע'], ['חצי'], ['שלושה רבעים'], ['מלא'])] }),
      answer: (text, s) => {
        const f = parseFuel(text);
        if (!f) return reask(P.fuelRetry, undefined, [choices(['ריק'], ['רבע'], ['חצי'], ['שלושה רבעים'], ['מלא'])]);
        s.data.fuel = f;
        return next();
      },
      clear: (d) => { d.fuel = undefined; },
    },
    {
      id: 'keys',
      slots: /מפתח/,
      applies: details,
      done: (d) => d.keys !== undefined,
      ask: () => ({ say: P.keys }),
      answer: (text, s) => {
        if (/^(אין|אף אחד|אפס)/.test(text.trim())) {
          s.data.keys = '0';
          return next();
        }
        const n = parseHebrewNumber(text.replace(/מפתח(ות)?/g, ''));
        if (n === null || n < 0 || n > 20) return reask(P.keysRetry);
        s.data.keys = String(Math.round(n));
        return next();
      },
      clear: (d) => { d.keys = undefined; },
    },
    { ...detailStep('lights', P.lights, P.lightsWhich, /נור/), applies: details },
    { ...detailStep('items', P.items, P.itemsWhich, /חפצ/), applies: details },
    confirmStep(
      (d) => [
        'סיכום קבלת רכב:',
        d.caseLabel ? `תיק קיים: ${d.caseLabel}` : 'תיק: חדש',
        ...customerSummary(d),
        ...vehicleSummary(d),
        d.requestedWork ? `עבודה מבוקשת: ${d.requestedWork}` : '',
        d.condition ? `מצב הרכב: ${d.condition}` : '',
        d.orderNote ? `הזמנה: ${d.orderNote}` : '',
        `ק"מ: ${d.km || 'לא צוין'}`,
        `דלק: ${d.fuel || 'לא צוין'}`,
        `מפתחות: ${d.keys ?? 'לא צוין'}`,
        `נורות אזהרה: ${d.lights || 'לא צוין'}`,
        `חפצים ברכב: ${d.items || 'לא צוין'}`,
        'אחרי השמירה אבקש את 5 תמונות החובה: קדימה, אחורה, ימין, שמאל ולוח שעונים.',
      ].filter(Boolean).join('\n'),
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        const intake: GarageCaseData = {
          intakeKm: d.km || '',
          intakeFuel: d.fuel || '',
          intakeKeys: d.keys || '',
          intakeLights: d.lights && d.lights !== 'אין' ? d.lights : '',
          intakeItems: d.items && d.items !== 'אין' ? d.items : '',
          intakeInterior: d.condition || '',
        };
        const notes = [
          `פרטי קבלת רכב נרשמו בשיחה קולית עם דליה AI.`,
          d.complaint ? `סיבת כניסה: ${d.complaint}` : '',
          d.requestedWork ? `עבודה מבוקשת: ${d.requestedWork}` : '',
          d.orderNote ? `הזמנה: ${d.orderNote}` : '',
        ].filter(Boolean).join(' ');
        if (d.caseId) {
          const current = await a.getCase(d.caseId);
          if (!current) throw new Error('התיק לא נמצא');
          const ccd = current.case_data;
          if (ccd.route === 'quote_first' && !ccd.quoteApproved && !ccd.intakeUnlocked) {
            return finish(P.intakeBlockedQuoteFirst, 'info', { display: caseLine(current), openCaseId: current.id });
          }
          const timeline = [...(current.case_data.timeline || []), timelineEntry(env, notes)];
          await a.saveCaseData(d.caseId, { ...intake, timeline });
          d.angles = { ...(current.case_data.intakeAngles || {}) };
        } else {
          const { customer } = await ensureCustomer(s, env);
          const vehicle = await ensureVehicle(s, env, customer);
          const created = await a.createCase({
            customer,
            vehicle,
            caseData: { route: 'intake_first', ...intake, flowStage: 'intake', timeline: [timelineEntry(env, notes)] },
          });
          d.caseId = created.id;
          d.caseNumber = created.case_number;
          d.caseLabel = caseLine(created);
          d.angles = {};
        }
        d.intakeSaved = true;
        return next(`נשמרו פרטי הקבלה בתיק ${d.caseNumber || ''}.`, undefined);
      },
      details,
    ),
    {
      id: 'photos',
      applies: (d) => !!d.intakeSaved && missingIntakeAngles(d).length > 0,
      done: () => false,
      ask: (d) => {
        const missing = missingIntakeAngles(d);
        const first = missing[0];
        return {
          say: missing.length === INTAKE_ANGLES.length ? P.intakeSavedPhotos : first.say,
          display: `תמונות חובה שחסרות (${missing.length} מתוך 5): ${missing.map((m) => m.title).join(', ')}`,
          ui: [upload(`צילום: ${first.title}`, ['אחר כך', 'אחר כך'])],
        };
      },
      answer: (text, s) => {
        if (/אחר כך|לא עכשיו|דלג|מאוחר יותר|^לא$/.test(text.trim())) {
          const missing = missingIntakeAngles(s.data);
          return finish(P.photosLater, 'paused', {
            display: `חסרות ${missing.length} תמונות: ${missing.map((m) => m.title).join(', ')}. «הרכב התקבל» יסומן רק אחרי שכולן יצולמו.`,
            keepForResume: true,
            openCaseId: s.data.caseId,
          });
        }
        const first = missingIntakeAngles(s.data)[0];
        return reask(first.say, 'לחץ על כפתור המצלמה כדי לצלם.', [upload(`צילום: ${first.title}`, ['אחר כך', 'אחר כך'])]);
      },
      onFile: async (file, s, env) => {
        const a = needActions(env);
        const d = s.data;
        const angle = missingIntakeAngles(d)[0];
        try {
          await a.uploadCaseMedia(d.caseId!, 'angles', angle.title, file);
          const current = await a.getCase(d.caseId!);
          const angles = { ...(current?.case_data.intakeAngles || {}), ...(d.angles || {}), [angle.id]: true };
          await a.saveCaseData(d.caseId!, { intakeAngles: angles });
          d.angles = angles;
        } catch (e) {
          return reask(P.photoUploadFailed, e instanceof Error ? e.message : undefined, [upload(`צילום: ${angle.title}`, ['אחר כך', 'אחר כך'])]);
        }
        return next(`התקבלה תמונה: ${angle.title}`);
      },
      clear: () => {},
    },
    confirmStep(
      (d) => [`תיק: ${d.caseLabel || d.caseNumber || ''}`, 'כל 5 תמונות החובה התקבלו, והקילומטראז\' נרשם.', 'אישורך מחליף את סימון «אישור העובד» במסך הקבלה.'].join('\n'),
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        const current = await a.getCase(d.caseId!);
        if (!current) throw new Error('התיק לא נמצא');
        const cd = current.case_data;
        // the same checks as confirmIntake in the garage screen — never bypassed
        const ang = cd.intakeAngles || {};
        if (!cd.intakeKm) throw new Error('חסר קילומטראז\' מספרי בתיק');
        const missing = INTAKE_ANGLES.filter((x) => !ang[x.id]);
        if (missing.length) {
          d.angles = { ...ang };
          return reask(missing[0].say, `חסרות תמונות: ${missing.map((m) => m.title).join(', ')}`, [upload(`צילום: ${missing[0].title}`, ['אחר כך', 'אחר כך'])]);
        }
        const route = cd.route === 'intake_first' ? 'intake_first' : 'quote_first';
        await a.saveCaseData(d.caseId!, {
          intakeDone: true,
          flowStage: route === 'intake_first' ? 'quote' : 'work',
          timeline: [...(cd.timeline || []), timelineEntry(env, 'הרכב התקבל · 4 תמונות חוץ + לוח שעונים + ק״מ · אישור עובד (בשיחה עם דליה AI)')],
        });
        return finish(P.intakeDoneSaid, 'executed', { display: `תיק ${current.case_number || ''}: הרכב סומן כהתקבל.`, openCaseId: d.caseId });
      },
      (d) => !!d.intakeSaved && missingIntakeAngles(d).length === 0,
      P.intakeFinalConfirm,
      'intakeFinal',
    ),
  ];
}

// -----------------------------------------------------------------------------
// Workflow: quote, add work/part, supplement (extra work)
// -----------------------------------------------------------------------------

function quoteTotals(d: VoiceData) {
  const lines = [...(d.works || []), ...(d.parts || [])];
  const net = lines.reduce((s, l) => s + (l.price || 0) * l.qty, 0);
  const vat = Math.round(net * 0.18);
  return { net, vat, gross: net + vat, unpriced: lines.filter((l) => l.price == null).length };
}

function lineLoopStep(kind: 'work' | 'part', firstSay: (s: VoiceSession) => string, applies: Step['applies'], single: boolean): Step {
  const listKey = kind === 'work' ? 'works' : 'parts';
  const doneKey = kind === 'work' ? 'worksDone' : 'partsDone';
  const priceSay = kind === 'work' ? P.workPrice : P.partPrice;
  const moreSay = kind === 'work' ? P.moreWorks : P.moreParts;
  return {
    id: listKey,
    slots: kind === 'work' ? /עבודה|עבודות/ : /(^|\s)חלק|חלפים|חלקים/,
    applies,
    done: (d) => !!d[doneKey],
    ask: (d, s) => {
      if (d.pending?.kind === kind) return { say: priceSay, display: d.pending.line.name, ui: [choices(['בלי מחיר'])] };
      const list = d[listKey] || [];
      if (list.length) return { say: moreSay, display: list.map(lineText).join('\n'), ui: [choices(['זהו'])] };
      return { say: firstSay(s), ui: [choices([kind === 'work' ? 'אין עבודות' : 'אין חלקים', 'אין'])] };
    },
    answer: (text, s) => {
      const d = s.data;
      const list = (d[listKey] = d[listKey] || []);
      const push = (line: SpokenLine) => {
        list.push(line);
        d.pending = undefined;
        if (single) d[doneKey] = true;
        return next(`נרשם: ${lineText(line)}`);
      };
      if (d.pending?.kind === kind) {
        if (isNoPriceAnswer(text)) return push({ ...d.pending.line, price: null });
        const n = parseHebrewNumber(text);
        if (n === null || n < 0) return reask(P.priceRetry, d.pending.line.name);
        return push({ ...d.pending.line, price: n });
      }
      if (isNoneAnswer(text)) {
        d[doneKey] = true;
        return next();
      }
      const line = parseSpokenLine(text);
      if (!line) return reask(P.notUnderstood);
      if (line.price === null && !isNoPriceAnswer(text)) {
        d.pending = { kind, line };
        return reask(priceSay, line.name, [choices(['בלי מחיר'])]);
      }
      return push(line);
    },
    clear: (d) => {
      d.pending = undefined;
      const list = d[listKey];
      if (list?.length) list.pop();
      d[doneKey] = false;
    },
  };
}

const QUOTE_MODE = choices(['הצעה חדשה'], ['עדכון הצעה קיימת', 'עדכון הצעה'], ['תוספת עבודה']);
const EXTRA_KIND = choices(['חלק'], ['עבודה'], ['גם וגם']);

function quoteFlow(type: VoiceWorkflowType): Step[] {
  const isQuote = (d: VoiceData) => d.scope === 'quote';
  const isSupp = (d: VoiceData) => d.scope === 'supplement';
  const linesEmpty = (d: VoiceData) => !(d.works?.length || d.parts?.length);
  const checkLock = async (s: VoiceSession, env: VoiceEnv): Promise<Outcome | null> => {
    if (s.data.scope !== 'quote') return null;
    const c = await needActions(env).getCase(s.data.caseId!);
    const cd = c?.case_data || {};
    // an approved / sent quote is never changed silently — changes go through an extra-work record
    if (cd.quoteApproved || cd.quoteSent || cd.waitingForApproval) s.data.quoteLocked = true;
    return null;
  };
  return [
    {
      id: 'quoteMode',
      applies: () => type === 'quote',
      done: (d) => !!d.scope,
      ask: (_d, _s, env) => ({ ...personal(env, P.quoteOpen), ui: [QUOTE_MODE] }),
      answer: (text, s) => {
        if (/תוספת|גילוי|התגלה|גילינו|שבור|נמצא/.test(text)) {
          s.data.scope = 'supplement';
          // "פירקנו את הפגוש וגילינו שגם התומך שבור" — the finding itself
          if (text.trim().split(/\s+/).length > 3) s.data.extraText = text.trim();
        } else if (/הצעה|עבוד|חלק|מחיר|חדשה|עדכון/.test(text)) s.data.scope = 'quote';
        else return reask(P.quoteOpenRetry, undefined, [QUOTE_MODE]);
        return next();
      },
      clear: (d) => { d.scope = undefined; },
    },
    caseSearchStep({ askSay: () => ({ say: P.quoteCase }), scope: 'notClosed', applies: (d) => !d.caseFromContext, onSelected: checkLock }),
    yesNoGate(
      'quoteLocked',
      (d) => isQuote(d) && !!d.quoteLocked,
      () => ({ say: P.quoteLocked }),
      (s) => {
        s.data.scope = 'supplement';
        s.data.quoteLocked = false;
        return next();
      },
      () => finish(P.okDone, 'info', { display: 'ההצעה לא שונתה.' }),
      (d) => !d.quoteLocked,
    ),
    lineLoopStep('work', () => (type === 'context_quote_add_work' ? P.addWork : P.works), (d) => isQuote(d) && !d.quoteLocked && type !== 'context_quote_add_part', type === 'context_quote_add_work'),
    lineLoopStep('part', () => (type === 'context_quote_add_part' ? P.addPart : P.parts), (d) => isQuote(d) && !d.quoteLocked && type !== 'context_quote_add_work', type === 'context_quote_add_part'),
    {
      id: 'emptyQuote',
      applies: (d) => isQuote(d) && !d.quoteLocked && linesEmpty(d),
      done: () => false,
      ask: () => ({ say: P.emptyQuote }),
      answer: (text, s) => {
        const line = parseSpokenLine(text);
        if (!line) return reask(P.emptyQuote);
        const d = s.data;
        const kind = type === 'context_quote_add_part' ? 'part' : 'work';
        if (line.price === null && !isNoPriceAnswer(text)) {
          d.pending = { kind, line };
          if (kind === 'part') d.partsDone = false;
          else d.worksDone = false;
          return next();
        }
        if (kind === 'part') d.parts = [line];
        else d.works = [line];
        return next();
      },
      clear: () => {},
    },
    // supplement path
    {
      id: 'extraText',
      slots: /תוספת|מה התגלה/,
      applies: isSupp,
      done: (d) => !!d.extraText,
      ask: () => ({ say: P.supplementText }),
      answer: (text, s) => {
        const line = parseSpokenLine(text);
        if (!line && !/[א-תA-Za-z]{2,}/.test(text)) return reask(P.notUnderstood);
        s.data.extraText = line?.name || text.trim();
        if (line?.price != null) s.data.extraPrice = line.price;
        return next();
      },
      clear: (d) => { d.extraText = undefined; d.extraPrice = undefined; },
    },
    {
      id: 'extraKind',
      slots: /חלקים או עבודה|סוג התוספת/,
      applies: isSupp,
      done: (d) => !!d.extraKind,
      ask: (d) => ({
        say: /שבור|נשבר|סדוק|פגום|קרוע|נזק/.test(d.extraText || '') ? P.extraKindAbout : P.extraKind,
        display: d.extraText,
        ui: [EXTRA_KIND],
      }),
      answer: (text, s) => {
        if (/גם וגם|שניהם|את שניהם|חלק ועבודה|עבודה וחלק/.test(text)) s.data.extraKind = 'both';
        else if (/חלק|חלפים/.test(text)) s.data.extraKind = 'part';
        else if (/עבודה|החלפה|התקנה/.test(text)) s.data.extraKind = 'work';
        else return reask(P.extraKind, undefined, [EXTRA_KIND]);
        return next();
      },
      clear: (d) => { d.extraKind = undefined; },
    },
    {
      id: 'extraPrice',
      slots: /מחיר|סכום/,
      applies: isSupp,
      done: (d) => d.extraPrice !== undefined,
      ask: () => ({ say: P.supplementPrice, ui: [choices(['בלי מחיר'])] }),
      answer: (text, s) => {
        if (isNoPriceAnswer(text)) {
          s.data.extraPrice = null;
          return next();
        }
        const n = parseHebrewNumber(text);
        if (n === null || n < 0) return reask(P.priceRetry);
        s.data.extraPrice = n;
        return next();
      },
      clear: (d) => { d.extraPrice = undefined; },
    },
    {
      id: 'extraStatus',
      applies: isSupp,
      done: (d) => !!d.extraCustomerSaid,
      ask: () => ({ say: P.supplementStatus, ui: [choices(['רישום פנימי', 'פנימי'], ['הלקוח אישר', 'אישר'])] }),
      answer: (text, s) => {
        if (/פנימי|ממתין|עוד לא|טרם|לא אישר|לא מאושר/.test(text)) s.data.extraCustomerSaid = 'pending';
        else if (/אישר|מאושר|אושר|אישור/.test(text)) s.data.extraCustomerSaid = 'approved';
        else return reask(P.notUnderstood);
        return next();
      },
      clear: (d) => { d.extraCustomerSaid = undefined; },
    },
    confirmStep(
      (d) => {
        if (isSupp(d)) {
          return [
            'סיכום תוספת עבודה:',
            d.caseLabel ? `תיק: ${d.caseLabel}` : '',
            `מה התגלה: ${d.extraText}`,
            `סוג: ${d.extraKind === 'both' ? 'חלק + עבודה' : d.extraKind === 'part' ? 'חלק' : 'עבודה'}`,
            `מחיר: ${d.extraPrice == null ? 'ללא מחיר' : money(d.extraPrice)}`,
            'תירשם כרישום פנימי שממתין לאישור הלקוח, ולא תתווסף לחשבון עד אישור הלקוח במסך התיק.',
            d.extraCustomerSaid === 'approved' ? 'צוין שהלקוח אישר בעל-פה — יירשם כהערה.' : '',
          ].filter(Boolean).join('\n');
        }
        const t = quoteTotals(d);
        return [
          'סיכום הצעת מחיר (טיוטה):',
          d.caseLabel ? `תיק: ${d.caseLabel}` : '',
          d.works?.length ? `עבודות:\n${d.works.map((l) => `${lineText(l)} (${workTypeOf(l.name)})`).join('\n')}` : '',
          d.parts?.length ? `חלקים:\n${d.parts.map(lineText).join('\n')}` : '',
          `סה"כ לפני מע"מ: ${money(t.net)}`,
          `מע"מ 18%: ${money(t.vat)}`,
          `סה"כ כולל מע"מ: ${money(t.gross)}`,
          t.unpriced ? `${t.unpriced} פריטים ללא מחיר — יש להשלים במסך התיק.` : '',
          'המחירים נרשמו לפני מע"מ. ההצעה נשמרת כטיוטה ולא נשלחת ללקוח מכאן.',
        ].filter(Boolean).join('\n');
      },
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        const current = await a.getCase(d.caseId!);
        if (!current) throw new Error('התיק לא נמצא');
        const cd = current.case_data || {};
        const stamp = (env.now?.() || new Date()).getTime();
        if (isSupp(d)) {
          const at = new Date(stamp).toISOString();
          const kindLabel = d.extraKind === 'both' ? 'חלק + עבודה' : d.extraKind === 'part' ? 'חלק' : 'עבודה';
          const item = {
            id: `x${stamp}`,
            text: d.extraText || '',
            works: kindLabel,
            note: d.extraCustomerSaid === 'approved'
              ? 'נרשם בדיבור עם דליה AI. העובד ציין שהלקוח אישר בעל-פה — יש לאשר במסך התיק.'
              : 'נרשם בדיבור עם דליה AI.',
            price: d.extraPrice || 0,
            at,
            sent: false,
            status: 'pending_customer',
            channel: 'internal_discovery',
            sentAt: at,
            sentTo: 'רישום פנימי של המוסך — טרם נמסר/אושר ע״י הלקוח',
            approvedAt: null,
            approvedBy: null,
          };
          await a.saveCaseData(d.caseId!, {
            extraApprovals: [...(cd.extraApprovals || []), item] as GarageCaseData['extraApprovals'],
            timeline: [...(cd.timeline || []), timelineEntry(env, `נרשם בדיבור גילוי פנימי של תוספת עבודה (${kindLabel}): ${d.extraText}${d.extraPrice ? ` בסך ${money(d.extraPrice)}` : ''} — ממתין לאישור לקוח (אינו נכלל בחשבון)`)],
          });
          return finish(P.supplementSaved, 'executed', { display: `התוספת נרשמה בתיק ${current.case_number || ''}.`, openCaseId: d.caseId });
        }
        if (cd.quoteApproved || cd.quoteSent || cd.waitingForApproval) {
          throw new Error('ההצעה בתיק כבר נשלחה או אושרה בינתיים — לא שיניתי אותה. אפשר לרשום תוספת עבודה.');
        }
        const works = (d.works || []).map((l, i) => ({
          id: `w${stamp}${i}`,
          part: l.name,
          type: workTypeOf(l.name),
          qty: l.qty,
          price: l.price ?? 0,
          desc: l.price == null ? 'ללא מחיר — להשלים' : '',
        }));
        const parts = (d.parts || []).map((l, i) => ({
          id: `p${stamp}${i}`,
          name: l.name,
          sku: '',
          qty: l.qty,
          price: l.price ?? 0,
          supplier: 'us',
        }));
        await a.saveCaseData(d.caseId!, {
          quoteWorks: [...(cd.quoteWorks || []), ...works],
          quoteParts: [...(cd.quoteParts || []), ...parts],
          quoteCreated: true,
          timeline: [...(cd.timeline || []), timelineEntry(env, `נוספו להצעת המחיר בדיבור עם דליה AI: ${works.length} עבודות, ${parts.length} חלקים`)],
        });
        const t = quoteTotals(d);
        return finish(P.quoteSaved, 'executed', {
          display: `הצעת המחיר בתיק ${current.case_number || ''} עודכנה: נוספו ${works.length} עבודות ו-${parts.length} חלקים (${money(t.gross)} כולל מע"מ).`,
          openCaseId: d.caseId,
        });
      },
      (d) => isSupp(d) || (isQuote(d) && !d.quoteLocked && !linesEmpty(d)),
    ),
  ];
}

// -----------------------------------------------------------------------------
// Workflow: payment (in-case shortcut)
// -----------------------------------------------------------------------------

function paymentFlow(): Step[] {
  const loadTotals = async (s: VoiceSession, env: VoiceEnv) => {
    const c = await needActions(env).getCase(s.data.caseId!);
    if (c) {
      s.data.caseTotal = caseTotalPayable(c.case_data as Record<string, unknown>);
      s.data.casePaid = casePaid(c.case_data as Record<string, unknown>);
      s.data.caseNumber = c.case_number;
    }
  };
  return [
    caseSearchStep({ askSay: () => ({ say: P.quoteCase }), scope: 'notClosed', applies: (d) => !d.caseFromContext }),
    {
      id: 'payAmount',
      slots: /סכום/,
      done: (d) => !!d.payAmount,
      ask: (d) => ({ say: d.payMethod ? P.paymentAmount : 'מה סכום התשלום, ובאיזה אמצעי (מזומן, אשראי, העברה, צ\'ק)?' }),
      answer: async (text, s, env) => {
        const n = parseHebrewNumber(text);
        const m = parsePaymentMethod(text);
        if (m) s.data.payMethod = m;
        if (n === null || n <= 0) return reask(P.paymentAmount);
        s.data.payAmount = n;
        await loadTotals(s, env);
        return next();
      },
      clear: (d) => { d.payAmount = undefined; },
    },
    {
      id: 'payMethod',
      slots: /אמצעי|אשראי|מזומן|העברה/,
      done: (d) => !!d.payMethod,
      ask: () => ({ say: P.paymentMethod, ui: [choices(['מזומן'], ['אשראי'], ['העברה'], ['ביט'], ['צ\'ק'])] }),
      answer: (text, s) => {
        const m = parsePaymentMethod(text);
        if (!m) return reask(P.paymentMethod, undefined, [choices(['מזומן'], ['אשראי'], ['העברה'], ['ביט'], ['צ\'ק'])]);
        s.data.payMethod = m;
        return next();
      },
      clear: (d) => { d.payMethod = undefined; },
    },
    confirmStep(
      (d) => {
        const after = (d.casePaid || 0) + (d.payAmount || 0);
        return [
          'סיכום תשלום:',
          d.caseLabel || (d.caseNumber ? `תיק ${d.caseNumber}` : ''),
          `סכום: ${money(d.payAmount || 0)} · ${d.payMethod?.label}`,
          d.caseTotal ? `סה"כ לתשלום בתיק: ${money(d.caseTotal)}` : 'סה"כ לתשלום בתיק עדיין לא נקבע.',
          `שולם עד כה: ${money(d.casePaid || 0)} → אחרי התשלום: ${money(after)}`,
          d.caseTotal ? `יתרה אחרי התשלום: ${money(Math.max(0, d.caseTotal - after))}` : '',
        ].filter(Boolean).join('\n');
      },
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        const current = await a.getCase(d.caseId!);
        if (!current) throw new Error('התיק לא נמצא');
        const cd = current.case_data as Record<string, unknown>;
        const payments = Array.isArray(cd.payments) ? [...(cd.payments as Array<Record<string, unknown>>)] : [];
        const now = env.now?.() || new Date();
        const dup = payments.find((p) => Number(p.amount) === d.payAmount && p.payment_method === d.payMethod!.method
          && now.getTime() - new Date(String(p.created_at || 0)).getTime() < 10 * 60 * 1000);
        if (dup) return finish(P.paymentDuplicate, 'info', { display: `תשלום של ${money(d.payAmount!)} ב${d.payMethod!.label} כבר נרשם בתיק.` });
        const entry = {
          id: `pay_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
          amount: d.payAmount,
          payment_method: d.payMethod!.method,
          payment_method_label: d.payMethod!.label,
          reference: '',
          payer_name: current.customer_name_snapshot || 'לקוח',
          payment_date: now.toISOString().split('T')[0],
          created_at: now.toISOString(),
          created_by: a.actorName,
          notes: 'נרשם בדיבור עם דליה AI',
        };
        const totalPaid = casePaid(cd) + (d.payAmount || 0);
        const total = caseTotalPayable(cd);
        await a.saveCaseData(d.caseId!, {
          payments: [...payments, entry],
          totalPaid,
          balanceRemaining: Math.max(0, total - totalPaid),
          timeline: [...((cd.timeline as GarageCaseData['timeline']) || []), timelineEntry(env, `נרשם תשלום בדיבור: ${money(d.payAmount!)} ב${d.payMethod!.label}`)],
        } as GarageCaseData);
        return finish(P.paymentSaved, 'executed', { display: `נרשם תשלום של ${money(d.payAmount!)} ב${d.payMethod!.label} בתיק ${current.case_number || ''}.`, openCaseId: d.caseId });
      },
    ),
  ];
}

// -----------------------------------------------------------------------------
// Workflow: close case — questionnaire on top of the screen's own close rules
// -----------------------------------------------------------------------------

/** The garage screen's own close rules (closeCaseGaps). Returns a finished turn when the case cannot be closed. */
async function checkCloseGaps(s: VoiceSession, env: VoiceEnv): Promise<Outcome | null> {
  const c = await needActions(env).getCase(s.data.caseId!);
  if (!c) return failed(new Error('התיק לא נמצא'));
  s.data.caseNumber = c.case_number;
  s.data.closeCd = c.case_data;
  if (c.case_data.caseClosed) return finish(P.okNotOpening, 'info', { display: `התיק ${c.case_number} כבר סגור.` });
  const gaps = closeCaseGaps(c.case_data);
  if (gaps.length) {
    return finish(P.closeGaps, 'info', {
      display: [`לא ניתן לסגור את תיק ${c.case_number || ''}:`, ...gaps.map((g) => `• ${g}`)].join('\n'),
      openCaseId: c.id,
    });
  }
  return null;
}

function closeChecklist(cd: GarageCaseData, d: VoiceData): VoiceUi {
  const total = caseTotalPayable(cd as Record<string, unknown>);
  const paid = casePaid(cd as Record<string, unknown>);
  const hasOrder = !!(cd.workOrderSaved || cd.quoteApproved);
  const ok = (b: boolean): 'ok' | 'missing' => (b ? 'ok' : 'missing');
  return {
    type: 'checklist',
    title: 'שאלון סגירת תיק',
    items: [
      { label: '1. כל העבודות הסתיימו', state: ok(!!cd.workFinished) },
      { label: '2. אין עבודות/חלקים נוספים שלא נרשמו', state: d.cqExtras === undefined ? 'ask' : 'ok' },
      { label: '3. קיימת הזמנת עבודה תקינה', state: ok(hasOrder), note: cd.workOrderNumber ? `הזמנה ${cd.workOrderNumber}` : cd.quoteApproved ? 'הצעה מאושרת' : undefined },
      { label: '4. ההזמנה מאושרת ומסודרת', state: ok(!!cd.quoteApproved || !!cd.workOrderSaved) },
      { label: '5. יש סכום סופי מוסכם', state: ok(hasApprovedPrice(cd)), note: hasApprovedPrice(cd) ? money(approvedFinalAmount(cd)) : undefined },
      { label: '6. כל העבודות והחלקים נכללו בחיוב', state: d.cqIncluded === undefined ? 'ask' : 'ok' },
      { label: '7. הלקוח שילם', state: total > 0 && paid >= total ? 'ok' : 'info', note: `שולם ${money(paid)} מתוך ${money(total)}` },
      { label: '8. מצב תשלום (כולל לקוח חודשי / אשראי)', state: ok(!!cd.paymentStatus), note: cd.paymentStatus ? { pending: 'ממתין לתשלום', settled: 'הוסדר', invoiced: 'חיוב לקוח/חברה', paid: 'שולם' }[cd.paymentStatus as string] : undefined },
      { label: '9. הרכב נמסר וחתימת המקבל נקלטה', state: ok(!!(cd.deliveryDone && cd.deliveryConfirmed && String(cd.deliveryRecipient || '').trim() && String(cd.deliveryKm || '').trim())) },
      { label: '10. החלטה: לסגור / להשאיר פתוח', state: 'ask' },
    ],
  };
}

function closeCaseFlow(): Step[] {
  const loaded = (d: VoiceData) => !!d.caseId && !!d.closeCd;
  const refresh = async (s: VoiceSession, env: VoiceEnv) => {
    const c = await needActions(env).getCase(s.data.caseId!);
    if (c) s.data.closeCd = c.case_data;
  };
  const onSelected = async (s: VoiceSession, env: VoiceEnv): Promise<Outcome | null> => {
    const c = await needActions(env).getCase(s.data.caseId!);
    if (!c) return failed(new Error('התיק לא נמצא'));
    if (c.case_data.caseClosed) return finish(P.okNotOpening, 'info', { display: `התיק ${c.case_number} כבר סגור.` });
    s.data.closeCd = c.case_data;
    s.data.caseNumber = c.case_number;
    return null;
  };
  const form = (d: VoiceData) => (d.closeMode === 'form' && d.closeCd ? [closeChecklist(d.closeCd, d)] : []);
  const missingFinishAngles = (cd?: GarageCaseData) => FINISH_ANGLES.filter((a) => !cd?.finishAngles?.[a.id]);
  return [
    caseSearchStep({ askSay: (env) => personal(env, P.closeQuery), scope: 'notClosed', applies: (d) => !d.caseFromContext, onSelected }),
    {
      id: 'closeMode',
      applies: loaded,
      done: (d) => !!d.closeMode,
      ask: (d) => ({ say: P.closeMode, display: d.caseLabel, ui: [choices(['📋 שאלון על המסך', 'שאלון'], ['🎙️ בדיבור', 'בדיבור'])] }),
      answer: (text, s) => {
        if (/שאלון|מסך|טופס|תשלחי/.test(text)) s.data.closeMode = 'form';
        else if (/דיבור|בקול|יחד|נעבור/.test(text)) s.data.closeMode = 'voice';
        else return reask(P.choiceRetry, undefined, [choices(['📋 שאלון על המסך', 'שאלון'], ['🎙️ בדיבור', 'בדיבור'])]);
        return next(undefined, form(s.data));
      },
      clear: (d) => { d.closeMode = undefined; },
    },
    // 1. work finished (from the case; can be completed here with the screen's own finish rules)
    {
      id: 'cqWork',
      applies: (d) => loaded(d) && !!d.closeMode && !d.closeCd!.workFinished,
      done: () => false,
      ask: (d) => {
        if (d.cqMarkFinishAsked) {
          const missingPhotos = missingFinishAngles(d.closeCd);
          if (missingPhotos.length) {
            return { say: missingPhotos[0].say, display: `תמונות סיום שחסרות: ${missingPhotos.map((m) => m.title).join(', ')}`, ui: [upload(`צילום: ${missingPhotos[0].title}`, ['אחר כך', 'אחר כך'])] };
          }
          return { say: P.markFinished, display: 'סימון «סיום עבודה / סגירת רכב» כמו במסך התיק.', ui: [YES_NO], confirm: true };
        }
        return { say: P.cqWorkDone, ui: [YES_NO, ...form(d)] };
      },
      answer: async (text, s, env) => {
        const d = s.data;
        const cd = d.closeCd!;
        const yn = parseYesNo(text);
        if (!d.cqMarkFinishAsked) {
          if (yn === 'no') return finish(P.closeNotReady, 'info', { openCaseId: d.caseId });
          if (yn !== 'yes') return reask(P.yesNoRetry, undefined, [YES_NO]);
          const gaps = finishWorkGaps(cd).filter((g) => !/תמונות סיום/.test(g));
          if (gaps.length) {
            return finish(P.finishGapsShown, 'info', { display: gaps.map((g) => `• ${g}`).join('\n'), openCaseId: d.caseId });
          }
          d.cqMarkFinishAsked = true;
          return next();
        }
        if (missingFinishAngles(cd).length) {
          if (/אחר כך|לא עכשיו|דלג|^לא$/.test(text.trim())) {
            return finish(P.photosLater, 'paused', { keepForResume: true, openCaseId: d.caseId });
          }
          const m = missingFinishAngles(cd)[0];
          return reask(m.say, 'לחץ על כפתור המצלמה כדי לצלם.', [upload(`צילום: ${m.title}`, ['אחר כך', 'אחר כך'])]);
        }
        if (yn === 'no') return finish(P.closeNotReady, 'info', { openCaseId: d.caseId });
        if (yn !== 'yes') return reask(P.yesNoRetry, undefined, [YES_NO]);
        try {
          const a = needActions(env);
          await refresh(s, env);
          const fresh = d.closeCd!;
          const gaps = finishWorkGaps(fresh);
          if (gaps.length) return finish(P.finishGapsShown, 'info', { display: gaps.map((g) => `• ${g}`).join('\n'), openCaseId: d.caseId });
          const finalAmount = approvedFinalAmount(fresh);
          await a.saveCaseData(d.caseId!, {
            workFinished: true,
            workFinishedAt: (env.now?.() || new Date()).toISOString(),
            workFinishedBy: a.actorName,
            finalApprovedAmount: finalAmount,
            flowStage: 'closed',
            timeline: [...(fresh.timeline || []), timelineEntry(env, `סיום עבודה / סגירת רכב · מחיר מאושר ${money(finalAmount)} · 4 תמונות סיום (בשיחה עם דליה AI)`)],
          });
          await refresh(s, env);
        } catch (e) {
          return failed(e);
        }
        return next('העבודה סומנה כהסתיימה.', form(d));
      },
      onFile: async (file, s, env) => {
        const a = needActions(env);
        const d = s.data;
        const angle = missingFinishAngles(d.closeCd)[0];
        if (!angle) return next();
        try {
          await a.uploadCaseMedia(d.caseId!, 'finish', angle.title, file);
          const current = await a.getCase(d.caseId!);
          const finishAngles = { ...(current?.case_data.finishAngles || {}), [angle.id]: true };
          await a.saveCaseData(d.caseId!, { finishAngles });
          d.closeCd = { ...(current?.case_data || d.closeCd), finishAngles };
        } catch (e) {
          return reask(P.photoUploadFailed, e instanceof Error ? e.message : undefined, [upload(`צילום: ${angle.title}`, ['אחר כך', 'אחר כך'])]);
        }
        return next(`התקבלה תמונה: ${angle.title}`);
      },
      clear: () => {},
    },
    // 2. extras not recorded
    yesNoGate(
      'cqExtras',
      (d) => loaded(d) && !!d.closeMode && !!d.closeCd!.workFinished,
      (d) => ({ say: P.cqExtras, ui: form(d) }),
      (s) => ({ kind: 'switch', type: 'context_quote_supplement', data: { caseId: s.data.caseId, caseLabel: s.data.caseLabel, caseNumber: s.data.caseNumber, caseFromContext: true, scope: 'supplement' } }),
      (s) => {
        s.data.cqExtras = false;
        return next();
      },
      (d) => d.cqExtras !== undefined,
    ),
    // 3–5. order and agreed amount (from the case)
    {
      id: 'cqOrder',
      applies: (d) => loaded(d) && d.cqExtras !== undefined,
      done: (d) => !!(d.closeCd!.workOrderSaved || d.closeCd!.quoteApproved) && hasApprovedPrice(d.closeCd!),
      ask: (d) => ({ say: P.closeOrderMissing, display: d.caseLabel }),
      auto: (s) => finish(P.closeOrderMissing, 'info', { display: s.data.caseLabel, openCaseId: s.data.caseId }),
      answer: (_t, s) => finish(P.closeOrderMissing, 'info', { openCaseId: s.data.caseId }),
      clear: () => {},
    },
    // 6. everything included in the order / charge
    yesNoGate(
      'cqIncluded',
      (d) => loaded(d) && d.cqExtras !== undefined,
      (d) => ({ say: P.cqAllIncluded, display: `סכום סופי מאושר: ${money(approvedFinalAmount(d.closeCd!))}`, ui: form(d) }),
      (s) => {
        s.data.cqIncluded = true;
        return next();
      },
      (s) => finish(P.closeFixQuote, 'info', { openCaseId: s.data.caseId }),
      (d) => d.cqIncluded !== undefined,
    ),
    // 7–8. payment: fully paid → may mark "שולם"; monthly / credit → operational close with payment tracked
    {
      id: 'cqPayment',
      applies: (d) => loaded(d) && !!d.cqIncluded,
      done: (d) => !!d.cqPayment || ['paid', 'invoiced', 'settled'].includes(String(d.closeCd?.paymentStatus || '')),
      ask: (d) => {
        const cd = d.closeCd!;
        const total = caseTotalPayable(cd as Record<string, unknown>);
        const paid = casePaid(cd as Record<string, unknown>);
        const status = `שולם ${money(paid)} מתוך ${money(total)}`;
        if (total > 0 && paid >= total) return { say: P.cqMarkPaid, display: status, ui: [YES_NO], confirm: true };
        if (d.cqPaymentPending === 'invoiced') return { say: P.cqMarkInvoiced, display: status, ui: [YES_NO], confirm: true };
        return { say: P.cqMonthly, display: status, ui: [YES_NO, ...form(d)] };
      },
      answer: async (text, s, env) => {
        const d = s.data;
        const cd = d.closeCd!;
        const fullyPaid = caseTotalPayable(cd as Record<string, unknown>) > 0 && casePaid(cd as Record<string, unknown>) >= caseTotalPayable(cd as Record<string, unknown>);
        const yn = parseYesNo(text);
        if (yn === null) return reask(P.yesNoRetry, undefined, [YES_NO]);
        const mark = fullyPaid ? 'paid' : d.cqPaymentPending;
        if (mark) {
          if (yn === 'no') return finish(P.keptOpen, 'info', { openCaseId: d.caseId });
          try {
            await needActions(env).saveCaseData(d.caseId!, {
              paymentStatus: mark,
              timeline: [...(cd.timeline || []), timelineEntry(env, mark === 'paid' ? 'מצב תשלום: שולם (לפי התשלומים הרשומים)' : 'מצב תשלום: חיוב לקוח/חברה — סגירה תפעולית, התשלום נשאר במעקב')],
            });
            await refresh(s, env);
          } catch (e) {
            return failed(e);
          }
          d.cqPayment = true;
          return next();
        }
        // never "שולם" before the money was actually received
        if (yn === 'yes') {
          d.cqPaymentPending = 'invoiced';
          return reask(P.cqMarkInvoiced, undefined, [YES_NO]);
        }
        return finish(P.closeUnpaid, 'info', { openCaseId: d.caseId });
      },
      clear: (d) => { d.cqPayment = undefined; d.cqPaymentPending = undefined; },
    },
    // 9. delivery (signature only in the case screen)
    {
      id: 'cqDelivery',
      applies: (d) => loaded(d) && !!d.cqIncluded && (!!d.cqPayment || ['paid', 'invoiced', 'settled'].includes(String(d.closeCd?.paymentStatus || ''))),
      done: (d) => {
        const cd = d.closeCd!;
        return !!(cd.deliveryDone && cd.deliveryConfirmed && String(cd.deliveryRecipient || '').trim() && String(cd.deliveryKm || '').trim());
      },
      ask: () => ({ say: P.closeDeliveryMissing }),
      auto: (s) => finish(P.closeDeliveryMissing, 'info', {
        display: closeCaseGaps(s.data.closeCd || {}).filter((g) => /מסירה|מקבל|קילומטראז|חתימת/.test(g)).map((g) => `• ${g}`).join('\n'),
        openCaseId: s.data.caseId,
      }),
      answer: (_t, s) => finish(P.closeDeliveryMissing, 'info', { openCaseId: s.data.caseId }),
      clear: () => {},
    },
    // 10. decision
    {
      id: 'cqDecision',
      applies: (d) => loaded(d) && !!d.cqIncluded && (!!d.cqPayment || ['paid', 'invoiced', 'settled'].includes(String(d.closeCd?.paymentStatus || ''))),
      done: () => false,
      ask: (d) => ({ say: P.cqDecision, ui: [choices(['🔒 לסגור את התיק', 'לסגור'], ['להשאיר פתוח'], ['להסתיר / לארכב', 'להסתיר']), ...form(d)] }),
      answer: async (text, s, env) => {
        if (/להסתיר|הסתרה|לארכב|ארכוב|למחוק|מחיקה/.test(text)) return reask(P.noArchive, undefined, [choices(['🔒 לסגור את התיק', 'לסגור'], ['להשאיר פתוח'])]);
        if (/פתוח|להשאיר|לא לסגור|^לא$/.test(text.trim())) return finish(P.keptOpen, 'info', { openCaseId: s.data.caseId });
        if (!/סגור|לסגור|סגרי|תסגרי|כן/.test(text)) return reask(P.choiceRetry, undefined, [choices(['🔒 לסגור את התיק', 'לסגור'], ['להשאיר פתוח'])]);
        try {
          const blocked = await checkCloseGaps(s, env);
          if (blocked) return blocked;
          await needActions(env).closeCase(s.data.caseId!, 'נסגר בשיחה קולית עם דליה AI (שאלון סגירה)');
        } catch (e) {
          return failed(e);
        }
        return finish(P.caseClosed, 'executed', { display: `תיק ${s.data.caseNumber || ''} נסגר. התשלום נשאר במעקב לפי מצב התשלום.`, openCaseId: s.data.caseId });
      },
      clear: () => {},
    },
  ];
}

// -----------------------------------------------------------------------------
// Workflow: find case (single case or lists)
// -----------------------------------------------------------------------------

async function listCases(env: VoiceEnv, intent: CaseListIntent, title?: string): Promise<Outcome> {
  let all: GarageCase[];
  try {
    all = await needActions(env).listAllCases();
  } catch (e) {
    if (e instanceof NoActionsError) throw e;
    return reask(P.searchFailed, e instanceof Error ? e.message : undefined);
  }
  const rows = all.filter((c) => caseMatchesList(c, intent));
  const count = (k: CaseListIntent) => all.filter((c) => caseMatchesList(c, k)).length;
  const summary: ReportCard[] = [
    { label: CASE_LIST_LABELS[intent], value: String(rows.length) },
    { label: 'פתוחים', value: String(count('open')) },
    { label: 'בעבודה', value: String(count('in_work')) },
    { label: 'מוכנים למסירה', value: String(count('ready_delivery')) },
    { label: 'סגורים', value: String(count('closed')) },
  ];
  if (!rows.length) return finish(P.noCasesInList, 'info', { ui: [caseListUi(title || CASE_LIST_LABELS[intent], [], summary)] });
  return finish(P.listSummary, 'info', {
    display: `${CASE_LIST_LABELS[intent]}: ${rows.length}`,
    ui: [caseListUi(title || CASE_LIST_LABELS[intent], rows, summary)],
  });
}

function findCaseFlow(): Step[] {
  return [
    {
      id: 'listOrSearch',
      done: (d) => !!d.caseId || !!d.candidates?.length,
      ask: (d, _s, env) => {
        if (d.candidateKind === 'case' && d.candidates?.length) {
          return { say: P.casesMany, display: numbered(d.candidates.map((c) => c.label)), ui: [choices(...d.candidates.map((c, i) => [`${i + 1}. ${c.label.split(' · ').slice(0, 2).join(' · ')}`, `מספר ${i + 1}`] as [string, string]))] };
        }
        return { ...personal(env, P.findOpen), ui: [choices(['📂 כל התיקים הפתוחים', 'תראי לי את כל התיקים הפתוחים'], ['כל התיקים כולל סגורים', 'תראי לי את כל התיקים גם סגורים'])] };
      },
      answer: async (text, s, env) => {
        const intent = parseCaseListIntent(text);
        if (intent) return listCases(env, intent);
        // "התיק האחרון של הלקוח …"
        const last = /אחרון|האחרונה/.test(text);
        const step = caseSearchStep({ askSay: () => ({ say: P.findOpen }), scope: 'any' });
        const out = await step.answer(text, s, env);
        if (last && s.data.candidateKind === 'case' && s.data.candidates?.length) {
          const first = s.data.candidates[0];
          s.data.caseId = first.id;
          s.data.caseLabel = first.label;
          s.data.candidates = undefined;
          s.data.candidateKind = undefined;
          return next(`התיק האחרון: ${first.label}`);
        }
        return out;
      },
      clear: (d) => { d.caseId = undefined; d.caseLabel = undefined; if (d.candidateKind === 'case') d.candidates = undefined; },
    },
    {
      id: 'pickFound',
      applies: (d) => !d.caseId && d.candidateKind === 'case' && !!d.candidates?.length,
      done: (d) => !!d.caseId,
      ask: (d) => ({
        say: P.casesMany,
        display: numbered((d.candidates || []).map((c) => c.label)),
        ui: [choices(...(d.candidates || []).map((c, i) => [`${i + 1}. ${c.label.split(' · ').slice(0, 2).join(' · ')}`, `מספר ${i + 1}`] as [string, string]))],
      }),
      answer: (text, s, env) => caseSearchStep({ askSay: () => ({ say: P.findOpen }), scope: 'any' }).answer(text, s, env),
      clear: () => {},
    },
    {
      id: 'openAsk',
      applies: (d) => !!d.caseId,
      done: () => false,
      ask: (d) => ({ say: P.caseFoundOpen, display: d.caseLabel, ui: [choices(['פתחי את התיק', 'כן'], ['לא'])] }),
      answer: async (text, s, env) => {
        const yn = parseYesNo(text) || (/פתחי|תפתחי|פתח/.test(text) ? 'yes' : null);
        if (yn === 'yes') return finish(P.openingCase, 'info', { display: s.data.caseLabel, openCaseId: s.data.caseId });
        if (yn === 'no') {
          let extra: string | undefined;
          try {
            const c = await needActions(env).getCase(s.data.caseId!);
            if (c) extra = [caseLine(c), `הצעד הבא: ${garageNextAction(c.case_data)}`, caseTotalPayable(c.case_data as Record<string, unknown>) ? `סכום: ${money(caseTotalPayable(c.case_data as Record<string, unknown>))}` : ''].filter(Boolean).join('\n');
          } catch { /* the details are a convenience only */ }
          return finish(P.okNotOpening, 'info', { display: extra || s.data.caseLabel });
        }
        return reask(P.yesNoRetry, undefined, [YES_NO]);
      },
      clear: () => {},
    },
  ];
}

// -----------------------------------------------------------------------------
// Workflow: invoices, charges & credits (no tax documents without a licensed provider)
// -----------------------------------------------------------------------------

const INVOICES_MENU = choices(['חיפוש חשבונית'], ['הכנת חיוב'], ['זיכוי']);

function invoicesFlow(): Step[] {
  const chargeDraft = async (s: VoiceSession, env: VoiceEnv): Promise<string> => {
    const c = await needActions(env).getCase(s.data.caseId!);
    if (!c) throw new Error('התיק לא נמצא');
    const cd = c.case_data as Record<string, unknown>;
    const total = caseTotalPayable(cd);
    const paid = casePaid(cd);
    const works = (c.case_data.quoteWorks || []).map((w) => `${w.part || w.desc || 'עבודה'} × ${w.qty || 1} — ${money((Number(w.price) || 0) * (Number(w.qty) || 1))}`);
    const parts = (c.case_data.quoteParts || []).filter((p) => p.supplier !== 'customer').map((p) => `${p.name || 'חלק'} × ${p.qty || 1} — ${money((Number(p.price) || 0) * (Number(p.qty) || 1))}`);
    const payments = (Array.isArray(cd.payments) ? cd.payments as Array<Record<string, unknown>> : []).map((p) => `${money(Number(p.amount) || 0)} · ${String(p.payment_method_label || '')} · ${String(p.payment_date || '')}`);
    s.data.caseNumber = c.case_number;
    return [
      `טיוטת חיוב — תיק ${c.case_number || ''}`,
      `לקוח: ${c.customer_name_snapshot || ''} · רכב ${c.vehicle_plate_snapshot || ''}`,
      `הזמנה מאושרת: ${c.case_data.workOrderSaved ? `כן${c.case_data.workOrderNumber ? ` (${c.case_data.workOrderNumber})` : ''}` : c.case_data.quoteApproved ? 'הצעה מאושרת' : 'לא'}`,
      ...(works.length ? ['עבודות:', ...works] : []),
      ...(parts.length ? ['חלקים:', ...parts] : []),
      `סה"כ לחיוב: ${total ? money(total) : 'לא נקבע'}`,
      payments.length ? `מקדמות ותשלומים קודמים:\n${payments.join('\n')}` : 'אין תשלומים קודמים רשומים.',
      `יתרה: ${money(Math.max(0, total - paid))}`,
      'לא מחובר ספק חשבוניות מורשה — זו טיוטת נתונים בלבד ולא מסמך מס.',
    ].join('\n');
  };
  return [
    {
      id: 'subType',
      done: (d) => !!d.subType,
      ask: (_d, _s, env) => ({ ...personal(env, P.invoicesOpen), ui: [INVOICES_MENU] }),
      answer: (text, s) => {
        if (/זיכוי|זיכויים|החזר/.test(text)) s.data.subType = 'credit';
        else if (/חיוב|להכין|הכנת|נתוני|טיוטה|ללקוח/.test(text)) s.data.subType = 'prepare';
        else if (/לחפש|חיפוש|לבדוק|בדיקת|חשבונית/.test(text)) s.data.subType = 'check';
        else return reask(P.invoicesSubRetry, undefined, [INVOICES_MENU]);
        return next();
      },
      clear: (d) => { d.subType = undefined; },
    },
    {
      id: 'invoiceLookup',
      applies: (d) => d.subType === 'check' || d.subType === 'credit',
      done: () => false,
      ask: (d) => ({ say: d.subType === 'credit' ? P.creditNoProvider : P.invoiceQuery }),
      answer: async (text, s, env) => {
        let invoices: GarageInvoice[];
        try {
          invoices = await needActions(env).listInvoices();
        } catch (e) {
          return reask(P.searchFailed, e instanceof Error ? e.message : undefined);
        }
        const digits = digitRuns(text).join('');
        const words = nameWordsOf(text).filter((w) => !/^(חשבונית|חשבוניות)$/.test(w));
        const found = invoices.filter((i) => {
          if (digits.length >= 2) {
            if (String(i.invoice_number || '').replace(/\D/g, '').includes(digits)) return true;
            if (normalizePlate(i.vehicle_plate || '') === digits) return true;
            if (String(i.case_number || '').replace(/\D/g, '').endsWith(digits)) return true;
          }
          return words.length > 0 && words.every((w) => String(i.supplier_name || '').includes(w));
        });
        if (!found.length) return reask(P.invoiceNotFound);
        const lines = found.slice(0, 8).map(invoiceLine);
        const header = s.data.subType === 'credit' ? 'מצב זיכוי לפי החשבונית (הפקת זיכוי אינה זמינה בלי ספק חשבוניות מורשה):' : '';
        if (found.length === 1) return finish(P.invoiceFound, 'info', { display: join(header, lines[0]) });
        return finish(P.invoicesFound, 'info', { display: join(header, numbered(lines)) });
      },
      clear: () => {},
    },
    caseSearchStep({
      askSay: () => ({ say: P.chargeCase }),
      scope: 'any',
      applies: (d) => d.subType === 'prepare' && !d.caseFromContext,
    }),
    {
      id: 'chargeTerms',
      applies: (d) => d.subType === 'prepare' && !!d.caseId,
      done: (d) => !!d.chargeTerms,
      ask: () => ({ say: P.chargeTerms, ui: [choices(['תשלום מיידי', 'מיידי'], ['אשראי / חודשי', 'חודשי'])] }),
      answer: async (text, s, env) => {
        let draft: string;
        try {
          draft = await chargeDraft(s, env);
        } catch (e) {
          return failed(e);
        }
        if (/חודש|אשראי|שוטף|חודשי/.test(text)) {
          s.data.chargeTerms = 'monthly';
          return next(draft);
        }
        if (/מיידי|עכשיו|מזומן|היום/.test(text)) {
          return finish(P.chargeShown, 'info', { display: draft, openCaseId: s.data.caseId });
        }
        return reask(P.chargeTerms, undefined, [choices(['תשלום מיידי', 'מיידי'], ['אשראי / חודשי', 'חודשי'])]);
      },
      clear: (d) => { d.chargeTerms = undefined; },
    },
    confirmStep(
      (d) => `תיק ${d.caseNumber || d.caseLabel || ''}: מצב התשלום יסומן "חיוב לקוח/חברה". לא יופק מסמך מס.`,
      async (s, env) => {
        const a = needActions(env);
        const c = await a.getCase(s.data.caseId!);
        if (!c) throw new Error('התיק לא נמצא');
        if (c.case_data.paymentStatus === 'paid') return finish(P.okDone, 'info', { display: 'התיק כבר מסומן כשולם — לא שיניתי.' });
        await a.saveCaseData(s.data.caseId!, {
          paymentStatus: 'invoiced',
          timeline: [...(c.case_data.timeline || []), timelineEntry(env, 'מצב תשלום: חיוב לקוח/חברה (בשיחה עם דליה AI)')],
        });
        return finish(P.markedInvoiced, 'executed', { openCaseId: s.data.caseId });
      },
      (d) => d.chargeTerms === 'monthly',
      P.chargeMarkInvoiced,
    ),
  ];
}

// -----------------------------------------------------------------------------
// Workflow: suppliers & supplier invoices
// -----------------------------------------------------------------------------

async function supplierReport(s: VoiceSession, env: VoiceEnv, supplier: Candidate): Promise<Outcome> {
  const invoices = (await needActions(env).listInvoices())
    .filter((i) => i.supplier_id === supplier.id || (i.supplier_name || '').trim() === supplier.label.split(' · ')[0]);
  const open = invoices.filter((i) => !/^(paid|שולם|settled)$/i.test(String(i.payment_status || '')));
  const openTotal = open.reduce((sum, i) => sum + (Number(i.total_amount) || 0), 0);
  if (s.data.subType === 'debt') {
    return finish(P.supplierDebtShown, 'info', {
      display: [
        `ספק: ${supplier.label}`,
        open.length ? `חשבוניות פתוחות (${open.length}):` : 'אין חשבוניות פתוחות לספק.',
        ...open.slice(0, 10).map(invoiceLine),
        open.length ? `סה"כ פתוח: ${money(openTotal)}` : '',
      ].filter(Boolean).join('\n'),
    });
  }
  return finish(P.supplierShown, 'info', {
    display: [`ספק: ${supplier.label}`, `חשבוניות במערכת: ${invoices.length}`, `פתוחות לתשלום: ${open.length} (${money(openTotal)})`].join('\n'),
  });
}

const SUPPLIERS_MENU = choices(['מציאת ספק', 'למצוא ספק'], ['ספק חדש'], ['חשבונית ספק']);

function expensesFlow(): Step[] {
  const purchase = (d: VoiceData) => d.subType === 'purchase';
  const newSupplier = (d: VoiceData) => d.subType === 'new_supplier';
  const INVOICE_FIELDS = (p: Record<string, unknown>) => ({
    invoiceNumber: String(p.invoice_number || '').replace(/[^\dA-Za-z-]/g, '') || undefined,
    invoiceDate: /^\d{4}-\d{2}-\d{2}$/.test(String(p.invoice_date || '')) ? String(p.invoice_date) : (parseDate(String(p.invoice_date || '')) || undefined),
    invoiceTotal: Number(p.total_amount) > 0 ? Number(p.total_amount) : undefined,
  });
  return [
    {
      id: 'subType',
      done: (d) => !!d.subType,
      ask: (_d, _s, env) => ({ ...personal(env, P.suppliersOpen), ui: [SUPPLIERS_MENU] }),
      answer: (text, s) => {
        if (/חוב|חייבים|יתרה|לשלם לספק/.test(text)) s.data.subType = 'debt';
        else if (/ספק חדש|לפתוח ספק|פתיחת ספק/.test(text)) s.data.subType = 'new_supplier';
        else if (/חשבונית|רכישה|רכישת|לרשום|קנינו|קנייה/.test(text)) s.data.subType = 'purchase';
        else if (/למצוא|מציאת|לחפש|חיפוש|ספק|פרטי/.test(text)) s.data.subType = 'search';
        else return reask(P.expensesSubRetry, undefined, [SUPPLIERS_MENU]);
        return next();
      },
      clear: (d) => { d.subType = undefined; },
    },
    // new supplier
    {
      id: 'supplierNewName',
      applies: newSupplier,
      done: (d) => !!d.supplierToCreate,
      ask: () => ({ say: P.supplierNewName }),
      answer: (text, s) => {
        const name = (extractName(text) || '').replace(/^(ה?ספק|שם ה?ספק( הוא)?)\s+/, '').trim();
        if (!name) return reask(P.supplierNewName);
        s.data.supplierToCreate = name;
        return next();
      },
      clear: (d) => { d.supplierToCreate = undefined; },
    },
    {
      id: 'supplierPhone',
      applies: newSupplier,
      done: (d) => d.supplierPhone !== undefined,
      ask: () => ({ say: P.supplierPhone, ui: [choices(['דלג'])] }),
      answer: (text, s) => {
        if (/דלג|אין|לא יודע/.test(text)) {
          s.data.supplierPhone = '';
          return next();
        }
        const phone = extractPhone(text);
        if (!phone) return reask(P.phoneInvalid, undefined, [choices(['דלג'])]);
        s.data.supplierPhone = phone;
        return next();
      },
      clear: (d) => { d.supplierPhone = undefined; },
    },
    {
      id: 'supplierCategory',
      applies: newSupplier,
      done: (d) => !!d.supplierCategory,
      ask: () => ({ say: P.supplierCategory, ui: [choices(['חלקים'], ['שירות'])] }),
      answer: (text, s) => {
        if (/חלק|חלפים/.test(text)) s.data.supplierCategory = 'parts';
        else if (/שירות|שירותים|קבלן/.test(text)) s.data.supplierCategory = 'services';
        else return reask(P.supplierCategory, undefined, [choices(['חלקים'], ['שירות'])]);
        return next();
      },
      clear: (d) => { d.supplierCategory = undefined; },
    },
    confirmStep(
      (d) => ['ספק חדש:', `שם: ${d.supplierToCreate}`, `טלפון: ${d.supplierPhone || 'לא צוין'}`, `תחום: ${d.supplierCategory === 'services' ? 'שירות' : 'חלקים'}`].join('\n'),
      async (s, env) => {
        const d = s.data;
        const { supplier, alreadyExisted } = await needActions(env).createSupplier(d.supplierToCreate!, { phone: d.supplierPhone, category: d.supplierCategory });
        return finish(alreadyExisted ? P.okDone : P.supplierCreated, alreadyExisted ? 'info' : 'executed', {
          display: alreadyExisted ? `ספק בשם הזה כבר קיים: ${supplierLine(supplier)}` : `נשמר ספק: ${supplierLine(supplier)}`,
        });
      },
      newSupplier,
      P.supplierConfirm,
      'supplierConfirm',
    ),
    // find / debt / purchase: pick supplier
    {
      id: 'supplier',
      slots: /ספק/,
      applies: (d) => !newSupplier(d),
      done: (d) => !!d.supplierId,
      ask: (d) => {
        if (d.supplierToCreate) return { say: P.supplierNotFoundCreate, display: `ספק חדש: ${d.supplierToCreate}`, ui: [YES_NO] };
        if (d.candidateKind === 'supplier' && d.candidates?.length) {
          return d.candidates.length === 1
            ? { say: P.supplierOne, display: d.candidates[0].label, ui: [YES_NO] }
            : { say: P.suppliersMany, display: numbered(d.candidates.map((c) => c.label)) };
        }
        return { say: P.supplierName };
      },
      answer: async (text, s, env) => {
        const d = s.data;
        const a = needActions(env);
        const choose = async (c: Candidate): Promise<Outcome> => {
          d.supplierId = c.id;
          d.supplierLabel = c.label;
          d.supplierName = c.label.split(' · ')[0];
          d.candidates = undefined;
          d.candidateKind = undefined;
          if (d.subType === 'search' || d.subType === 'debt') return supplierReport(s, env, c);
          return next(`נבחר ספק: ${c.label}`);
        };
        if (d.supplierToCreate) {
          const yn = parseYesNo(text);
          if (yn === 'no') return finish(P.supplierNotCreated, 'info');
          if (yn !== 'yes') return reask(P.yesNoRetry, undefined, [YES_NO]);
          try {
            const { supplier } = await a.createSupplier(d.supplierToCreate);
            d.supplierToCreate = undefined;
            if (d.subType !== 'purchase') return finish(P.supplierCreated, 'executed', { display: `נשמר ספק: ${supplierLine(supplier)}` });
            return choose({ id: supplier.id, label: supplierLine(supplier) });
          } catch (e) {
            return failed(e);
          }
        }
        if (d.candidateKind === 'supplier' && d.candidates?.length) {
          const list = d.candidates;
          if (list.length === 1) {
            const yn = parseYesNo(text);
            if (yn === 'yes') return choose(list[0]);
            if (yn === 'no') {
              d.candidates = undefined;
              return reask(P.supplierName);
            }
          } else {
            const idx = pickFromList(text, list.map((c, i) => `${i + 1}. ${c.label}`));
            if (idx !== null) return choose(list[idx]);
            if (text.trim().split(/\s+/).length < 2) return reask(P.pickRetry, numbered(list.map((c) => c.label)));
          }
        }
        const name = (extractName(text) || text).replace(/^(ה?ספק|שם ה?ספק( הוא)?)\s+/, '').trim();
        const words = name.split(/\s+/).filter((w) => w.length >= 2);
        let all: GarageSupplier[];
        try {
          all = await a.listSuppliers();
        } catch (e) {
          return reask(P.searchFailed, e instanceof Error ? e.message : undefined);
        }
        const found = all.filter((sup) => words.length > 0 && words.every((w) => (sup.name || '').includes(w) || (sup.name || '').includes(stripPrefix(w))));
        d.candidates = undefined;
        if (!found.length) {
          if (!words.length) return reask(P.supplierName);
          d.supplierToCreate = name;
          return reask(P.supplierNotFoundCreate, `ספק חדש: ${name}`, [YES_NO]);
        }
        if (found.length > 6) return reask(P.tooMany);
        d.candidateKind = 'supplier';
        d.candidates = found.map((sup) => ({ id: sup.id, label: supplierLine(sup) }));
        return next();
      },
      clear: (d) => {
        d.supplierId = undefined;
        d.supplierLabel = undefined;
        d.supplierName = undefined;
        d.supplierToCreate = undefined;
        if (d.candidateKind === 'supplier') d.candidates = undefined;
      },
    },
    // supplier invoice: optional photo → read (preview only) → verify
    {
      id: 'invoicePhoto',
      applies: (d) => purchase(d) && !!d.supplierId,
      done: (d) => !!d.invoicePhotoDone,
      ask: () => ({ say: P.invoicePhotoAsk, ui: [upload('חשבונית ספק', ['בלי צילום', 'בלי צילום'])] }),
      answer: (text, s) => {
        if (/בלי|אין|לא|דלג/.test(text)) {
          s.data.invoicePhotoDone = true;
          return next();
        }
        return reask(P.invoicePhotoAsk, undefined, [upload('חשבונית ספק', ['בלי צילום', 'בלי צילום'])]);
      },
      onFile: async (file, s, env) => {
        const d = s.data;
        d.invoicePhotoDone = true;
        d.invoiceFile = { name: file.name, type: file.type, b64: arrayBufferToBase64(file.bytes) };
        let fields: Record<string, unknown> | null = null;
        try {
          fields = env.readDocument ? await env.readDocument('supplier_invoice', file) : null;
        } catch {
          fields = null;
        }
        const f = fields ? INVOICE_FIELDS(fields) : null;
        if (!f || (!f.invoiceNumber && !f.invoiceTotal)) return reask(P.invoiceReadFailed);
        Object.assign(d, Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)));
        d.invoiceRead = true;
        return next();
      },
      clear: (d) => { d.invoicePhotoDone = undefined; d.invoiceFile = undefined; },
    },
    {
      id: 'invoiceVerify',
      applies: (d) => purchase(d) && !!d.invoiceRead,
      done: (d) => !!d.invoiceVerified,
      ask: (d) => ({
        say: P.invoiceReadOk,
        display: ['פרטים שנקראו מהחשבונית (לבדיקה):', `מספר: ${d.invoiceNumber || '—'}`, `תאריך: ${d.invoiceDate || '—'}`, `סכום: ${d.invoiceTotal ? money(d.invoiceTotal) : '—'}`].join('\n'),
        ui: [YES_NO],
      }),
      answer: (text, s) => {
        const yn = parseYesNo(text);
        if (yn === 'yes') {
          s.data.invoiceVerified = true;
          return next();
        }
        if (yn === 'no') {
          Object.assign(s.data, { invoiceNumber: undefined, invoiceDate: undefined, invoiceTotal: undefined, invoiceRead: false });
          return next('בסדר, נמלא את פרטי החשבונית בדיבור.');
        }
        return reask(P.yesNoRetry, undefined, [YES_NO]);
      },
      clear: (d) => { d.invoiceVerified = undefined; },
    },
    {
      id: 'invoiceNumber',
      slots: /מספר( ה)?חשבונית/,
      applies: (d) => purchase(d) && !!d.invoicePhotoDone,
      done: (d) => !!d.invoiceNumber,
      ask: () => ({ say: P.purchaseInvoiceNumber }),
      answer: (text, s) => {
        const digits = digitRuns(text).join('');
        const raw = text.replace(/^(מספר|חשבונית|מספר חשבונית)\s+/g, '').trim();
        const value = digits.length >= 2 ? digits : /^[A-Za-z0-9-]{2,}$/.test(raw) ? raw : '';
        if (!value) return reask(P.purchaseInvoiceNumber);
        s.data.invoiceNumber = value;
        return next();
      },
      clear: (d) => { d.invoiceNumber = undefined; },
    },
    {
      id: 'invoiceDate',
      slots: /תאריך/,
      applies: (d) => purchase(d) && !!d.invoicePhotoDone,
      done: (d) => !!d.invoiceDate,
      ask: () => ({ say: P.purchaseDate, ui: [choices(['היום'], ['אתמול'])] }),
      answer: (text, s, env) => {
        const date = parseDate(text, env.now?.() || new Date());
        if (!date) return reask(P.purchaseDate, undefined, [choices(['היום'], ['אתמול'])]);
        s.data.invoiceDate = date;
        return next();
      },
      clear: (d) => { d.invoiceDate = undefined; },
    },
    {
      id: 'invoiceTotal',
      slots: /סכום|סה"כ|סך/,
      applies: (d) => purchase(d) && !!d.invoicePhotoDone,
      done: (d) => !!d.invoiceTotal,
      ask: () => ({ say: P.purchaseTotal }),
      answer: (text, s) => {
        const n = parseHebrewNumber(text);
        if (n === null || n <= 0) return reask(P.priceRetry);
        s.data.invoiceTotal = n;
        return next();
      },
      clear: (d) => { d.invoiceTotal = undefined; },
    },
    {
      id: 'purchaseLink',
      applies: (d) => purchase(d) && !!d.invoicePhotoDone,
      done: (d) => !!d.purchaseLink,
      ask: () => ({ say: P.purchaseLink, ui: [choices(['תיק עבודה'], ['הוצאה כללית'])] }),
      answer: (text, s) => {
        if (/כללית|כללי|לא שייך|בלי תיק/.test(text)) {
          s.data.purchaseLink = 'general';
          s.data.purchaseCaseDone = true;
        } else if (/תיק|רכב/.test(text) || extractPlate(text)) {
          s.data.purchaseLink = 'case';
        } else return reask(P.purchaseLink, undefined, [choices(['תיק עבודה'], ['הוצאה כללית'])]);
        return next();
      },
      clear: (d) => { d.purchaseLink = undefined; d.purchaseCaseDone = undefined; },
    },
    caseSearchStep({ askSay: () => ({ say: P.purchaseCase }), scope: 'any', applies: (d) => purchase(d) && d.purchaseLink === 'case', optional: true }),
    {
      id: 'purchaseKind',
      applies: (d) => purchase(d) && !!d.purchaseLink,
      done: (d) => !!d.purchaseKind,
      ask: () => ({ say: P.purchaseKind, ui: [choices(['חלקים'], ['שירות'])] }),
      answer: (text, s) => {
        if (/חלק|חלפים/.test(text)) s.data.purchaseKind = 'parts';
        else if (/שירות|שירותים|קבלן/.test(text)) s.data.purchaseKind = 'services';
        else return reask(P.purchaseKind, undefined, [choices(['חלקים'], ['שירות'])]);
        return next();
      },
      clear: (d) => { d.purchaseKind = undefined; },
    },
    confirmStep(
      (d) => {
        const subtotal = Math.round((d.invoiceTotal || 0) / 1.18);
        return [
          'סיכום רישום חשבונית ספק:',
          `ספק: ${d.supplierLabel || d.supplierName}`,
          `מספר חשבונית: ${d.invoiceNumber}`,
          `תאריך: ${d.invoiceDate}`,
          `סה"כ כולל מע"מ: ${money(d.invoiceTotal || 0)} (לפני מע"מ ${money(subtotal)})`,
          `סוג: ${d.purchaseKind === 'services' ? 'שירות' : 'חלקים'}`,
          d.caseLabel ? `שייך לתיק: ${d.caseLabel}` : 'הוצאה כללית של המוסך',
          d.invoiceFile ? 'צילום החשבונית יצורף לתיק.' : '',
        ].filter(Boolean).join('\n');
      },
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        const existing = await a.listInvoices();
        const dup = existing.find((i) => String(i.invoice_number || '').trim() === String(d.invoiceNumber).trim()
          && ((d.supplierId && i.supplier_id === d.supplierId) || (i.supplier_name || '').trim() === (d.supplierName || '').trim()));
        if (dup) return finish(P.duplicateInvoice, 'info', { display: invoiceLine(dup) });
        let caseNumber: string | undefined;
        let plate: string | undefined;
        if (d.caseId) {
          const c = await a.getCase(d.caseId);
          caseNumber = c?.case_number;
          plate = c?.vehicle_plate_snapshot;
        }
        const invoice = await a.createInvoice({
          invoice_type: d.caseId ? 'parts_invoice' : 'general_expense',
          expense_category: d.purchaseKind === 'services' ? 'services' : 'parts',
          invoice_number: d.invoiceNumber,
          invoice_date: d.invoiceDate,
          supplier_id: d.supplierId,
          supplier_name: d.supplierName,
          total_amount: d.invoiceTotal,
          case_id: d.caseId || null,
          case_number: caseNumber || null,
          vehicle_plate: plate || null,
          accounting_notes: 'נרשם בשיחה קולית עם דליה AI',
        });
        let photoNote = '';
        if (d.invoiceFile && d.caseId) {
          try {
            await a.uploadCaseMedia(d.caseId, 'parts_invoices', `חשבונית ספק ${invoice.invoice_number}`, { name: d.invoiceFile.name, type: d.invoiceFile.type, bytes: base64ToArrayBuffer(d.invoiceFile.b64) });
            photoNote = 'צילום החשבונית צורף לתיק.';
          } catch {
            photoNote = 'החשבונית נרשמה, אבל צירוף הצילום לתיק נכשל — אפשר לצרף אותו במסך התיק.';
          }
        }
        return finish(P.invoiceSaved, 'executed', { display: join(`נרשמה חשבונית ${invoice.invoice_number} של ${invoice.supplier_name} על ${money(Number(invoice.total_amount) || 0)}.`, photoNote) });
      },
      (d) => purchase(d) && !!d.purchaseKind,
    ),
  ];
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// -----------------------------------------------------------------------------
// Workflow: reports (garage only — never insurance-claim data)
// -----------------------------------------------------------------------------

const REPORT_TYPES = choices(['💰 כספי', 'דוח כספי'], ['🏢 לפי חברה', 'דוח לפי חברה'], ['📂 תיקי עבודה', 'דוח תיקי עבודה'], ['📝 הצעות מחיר', 'דוח הצעות מחיר'], ['📈 פעילות', 'דוח פעילות']);

/** Fills report filters from a free sentence ("כמה כסף נכנס השבוע מאלדן"). */
function applyReportText(f: ReportFilters, text: string, now: Date) {
  const type = parseReportType(text);
  if (type && !f.type) f.type = type;
  const period = parsePeriod(text, now);
  if (period) f.period = period;
  const company = extractCompanyName(text);
  if (company && f.company === undefined) f.company = company;
  if (/כל החברות|כולן|כל הלקוחות/.test(text)) f.company = null;
  const list = parseCaseListIntent(text) || (/פתוחים/.test(text) ? 'open' : /סגורים/.test(text) ? 'closed' : null);
  if (list) {
    f.caseList = list;
    if (!f.type) f.type = 'cases';
    f.status = list === 'closed' ? 'closed' : list === 'all' ? 'all' : 'open';
  }
  if (/פירוט|רשימה|רשומות/.test(text)) f.detail = 'details';
  if (/סיכום בלבד|רק סיכום/.test(text)) f.detail = 'summary';
}

function reportsFlow(): Step[] {
  const rep = (d: VoiceData) => (d.report = d.report || {});
  const needCompany = (d: VoiceData) => d.report?.type === 'company';
  const questions = (d: VoiceData) => d.reportMode === 'questions';
  return [
    {
      id: 'reportType',
      done: (d) => !!d.report?.type,
      ask: (_d, _s, env) => ({ ...personal(env, P.reportsOpen), ui: [REPORT_TYPES] }),
      answer: (text, s, env) => {
        const f = rep(s.data);
        applyReportText(f, text, env.now?.() || new Date());
        if (!f.type) {
          if (/כללי/.test(text)) f.type = 'activity';
          else return reask(P.reportsOpenRetry, undefined, [REPORT_TYPES]);
        }
        // a full sentence ("כמה כסף נכנס השבוע") already says what is needed — no questionnaire
        if (f.period || f.company !== undefined || f.caseList) s.data.reportMode = 'speech';
        return next();
      },
      clear: (d) => { d.report = undefined; d.reportMode = undefined; },
    },
    {
      id: 'reportMode',
      applies: (d) => !!d.report?.type,
      done: (d) => !!d.reportMode,
      ask: () => ({ say: P.reportsMode, ui: [choices(['📋 שאלון סינון', 'שאלון'], ['🎙️ אגיד בדיבור', 'בדיבור'])] }),
      answer: (text, s, env) => {
        if (/שאלון|תשלחי|סינון/.test(text)) s.data.reportMode = 'questions';
        else if (/דיבור|אגיד|בקול/.test(text)) s.data.reportMode = 'speech';
        else {
          // the answer itself may already be the request
          const before = JSON.stringify(rep(s.data));
          applyReportText(rep(s.data), text, env.now?.() || new Date());
          if (JSON.stringify(rep(s.data)) === before) return reask(P.choiceRetry, undefined, [choices(['📋 שאלון סינון', 'שאלון'], ['🎙️ אגיד בדיבור', 'בדיבור'])]);
          s.data.reportMode = 'speech';
        }
        return next();
      },
      clear: (d) => { d.reportMode = undefined; },
    },
    {
      id: 'reportFree',
      applies: (d) => d.reportMode === 'speech' && !d.report?.period && d.report?.company === undefined && !d.report?.caseList,
      done: () => false,
      ask: () => ({ say: P.reportFreeAsk }),
      answer: (text, s, env) => {
        const before = JSON.stringify(rep(s.data));
        applyReportText(rep(s.data), text, env.now?.() || new Date());
        if (JSON.stringify(rep(s.data)) === before) return reask(P.reportFreeAsk);
        return next();
      },
      clear: () => {},
    },
    {
      id: 'reportCompany',
      applies: (d) => !!d.reportMode && (needCompany(d) || questions(d)) && d.report?.company === undefined,
      done: (d) => d.report?.company !== undefined,
      ask: () => ({ say: P.reportCompany, ui: [choices(['כל החברות', 'כולן'])] }),
      answer: (text, s) => {
        if (/כולן|כל החברות|הכל|הכול|כולם/.test(text)) {
          rep(s.data).company = null;
          return next();
        }
        const name = extractCompanyName(text) || nameWordsOf(text).join(' ');
        if (!name) return reask(P.reportCompany, undefined, [choices(['כל החברות', 'כולן'])]);
        rep(s.data).company = name;
        return next();
      },
      clear: (d) => { if (d.report) d.report.company = undefined; },
    },
    {
      id: 'reportPeriod',
      applies: (d) => !!d.reportMode && d.report?.type !== 'cases',
      done: (d) => !!d.report?.period,
      ask: () => ({ say: P.reportPeriod, ui: [choices(['היום'], ['אתמול'], ['השבוע'], ['החודש'], ['השנה'], ['כל התקופה'])] }),
      answer: (text, s, env) => {
        const p = parsePeriod(text, env.now?.() || new Date());
        if (!p) return reask(P.reportPeriod, undefined, [choices(['היום'], ['אתמול'], ['השבוע'], ['החודש'], ['השנה'], ['כל התקופה'])]);
        rep(s.data).period = p;
        return next();
      },
      clear: (d) => { if (d.report) d.report.period = undefined; },
    },
    {
      id: 'reportStatus',
      applies: (d) => questions(d) && d.report?.type === 'cases' && !d.report?.caseList,
      done: (d) => !!d.report?.status,
      ask: () => ({ say: P.reportStatus, ui: [choices(['פתוחים'], ['סגורים'], ['כולם'])] }),
      answer: (text, s) => {
        const f = rep(s.data);
        if (/פתוח/.test(text)) { f.status = 'open'; f.caseList = 'open'; }
        else if (/סגור/.test(text)) { f.status = 'closed'; f.caseList = 'closed'; }
        else if (/כולם|הכל|הכול|כל/.test(text)) { f.status = 'all'; f.caseList = 'all'; }
        else return reask(P.reportStatus, undefined, [choices(['פתוחים'], ['סגורים'], ['כולם'])]);
        return next();
      },
      clear: (d) => { if (d.report) d.report.status = undefined; },
    },
    {
      id: 'reportDetail',
      applies: (d) => questions(d),
      done: (d) => !!d.report?.detail,
      ask: () => ({ say: P.reportDetail, ui: [choices(['סיכום בלבד', 'סיכום'], ['גם פירוט', 'פירוט'])] }),
      answer: (text, s) => {
        if (/פירוט|רשומות|רשימה/.test(text)) rep(s.data).detail = 'details';
        else if (/סיכום/.test(text)) rep(s.data).detail = 'summary';
        else return reask(P.reportDetail, undefined, [choices(['סיכום בלבד', 'סיכום'], ['גם פירוט', 'פירוט'])]);
        return next();
      },
      clear: (d) => { if (d.report) d.report.detail = undefined; },
    },
    {
      id: 'reportRun',
      applies: (d) => !!d.reportMode,
      done: () => false,
      ask: () => ({ say: P.reportShown }),
      answer: () => reask(P.reportShown),
      clear: () => {},
    },
  ];
}

/** Runs the report as soon as every needed filter is known (reportRun is reached). */
async function runReport(s: VoiceSession, env: VoiceEnv): Promise<VoiceTurn> {
  const f = { ...(s.data.report || {}) };
  if (!f.period) f.period = { key: 'all' };
  if (f.type === 'cases' && !f.caseList) f.caseList = f.status === 'closed' ? 'closed' : f.status === 'all' ? 'all' : 'open';
  let all: GarageCase[];
  try {
    all = await needActions(env).listAllCases();
  } catch (e) {
    if (e instanceof NoActionsError) return { say: P.noActions, expectsAnswer: false, done: true, outcome: 'failed' };
    return { say: P.searchFailed, display: e instanceof Error ? e.message : undefined, expectsAnswer: false, done: true, outcome: 'failed', keepForResume: true };
  }
  if (f.company && !all.some((c) => (c.customer_name_snapshot || '').includes(f.company!.split(' ')[0]) || (c.customer_name_snapshot || '').includes(stripPrefix(f.company!.split(' ')[0])))) {
    // "מאלדן" → "אלדן"
    const stripped = stripPrefix(f.company);
    if (stripped !== f.company && all.some((c) => (c.customer_name_snapshot || '').includes(stripped))) f.company = stripped;
    else {
      s.data.report = { ...(s.data.report || {}), company: undefined };
      s.data.reportMode = 'questions';
      return { say: P.reportCompanyNotFound, display: `חברה: ${f.company}`, ui: [choices(['כל החברות', 'כולן'])], expectsAnswer: true, done: false };
    }
  }
  const result = computeReport(all, f, env.now?.() || new Date());
  if (result.empty) {
    return { say: P.reportNoData, display: `${result.title} · ${result.periodLabel}`, ui: [{ type: 'report', result, restartType: f.type || 'cases' }], expectsAnswer: false, done: true, outcome: 'info' };
  }
  return {
    say: result.headline,
    alt: P.reportShown,
    display: `${result.title} · ${result.periodLabel}`,
    ui: [{ type: 'report', result, restartType: f.type || 'cases' }],
    expectsAnswer: false,
    done: true,
    outcome: 'info',
  };
}

// -----------------------------------------------------------------------------
// Workflow: general action (free request → the right workflow, details kept)
// -----------------------------------------------------------------------------

export function routeFreeRequest(text: string): { type: VoiceWorkflowType; prefill?: string; data?: Partial<VoiceData> } | null {
  const t = String(text || '').trim();
  if (!t) return null;
  // A long free question ("…ואיך לתעד את זה בתיק?") is a conversation, not a system command — unless it
  // opens with a clear request. Single words inside it ("בתיק", "נכנס", "לקוח") must not trigger a search.
  if (t.split(/\s+/).length > 9 && !/^(רגע[,.\s]+)?(תמצאי|תחפשי|תביאי|תפתחי|פתחי|תראי|תעשי|תוסיפי|הוסיפי|תרשמי|תסגרי|אני רוצה|בואי|כמה|אילו|איזה תיקים)(?=$|[\s,])/.test(t)) return null;
  const listIntent = parseCaseListIntent(t);
  // "how many cases are open (today / now)" is the current state → the live case list, not a period report
  const period = parsePeriod(t);
  const explicitPeriod = !!period && period.key !== 'today';
  if (listIntent && !explicitPeriod) return { type: 'find_case', prefill: t };
  if (/כמה רכבים (יש )?(לנו )?(כרגע |עכשיו )?(יש )?(במוסך)|כמה רכבים יש (לנו )?(כרגע|עכשיו)/.test(t)) {
    return { type: 'find_case', prefill: 'תראי לי את כל התיקים הפתוחים' };
  }
  const reportish = /כמה כסף|הכנס|תקבול|נכנס|דוח|מאזן|לא שולם|יתר|כמה תיקים|כמה רכבים|הצעות מחיר (השבוע|החודש)/.test(t);
  if (reportish) return { type: 'reports', prefill: t };
  if (listIntent) return { type: 'find_case', prefill: t };
  if (/המשך|תמשיכי|הפעולה האחרונה/.test(t)) return { type: 'resume_action' };
  if (/לסגור|סגירת תיק|תסגרי/.test(t)) return { type: 'close_case', prefill: t.replace(/.*?(לסגור|סגירת|תסגרי)( את)?( ה?תיק)?( של)?/, '').trim() || undefined };
  if (/תוספת/.test(t)) return { type: 'quote', data: { scope: 'supplement' }, prefill: undefined };
  if (/תוסיפי עבודה|להוסיף עבודה|הוסיפי עבודה|עבודה של/.test(t)) {
    const line = t.replace(/.*?(תוסיפי|להוסיף|הוסיפי)\s+(עבודה\s+)?(של\s+)?/, '').trim();
    const parsed = parseSpokenLine(line);
    return { type: 'quote', data: { scope: 'quote', works: parsed ? [parsed] : [] } };
  }
  if (/הצעת מחיר|הצעה/.test(t)) return { type: 'quote' };
  if (/קבלת רכב|נכנס רכב|רכב נכנס|קליטת רכב|לקלוט/.test(t)) return { type: 'intake', prefill: extractPlate(t) || undefined };
  if (/לקוח חדש|לפתוח לקוח|פתיחת לקוח/.test(t)) return { type: 'new_customer' };
  if (/ספק/.test(t)) return { type: 'general_expenses', prefill: t };
  if (/חשבונית|זיכוי|חיוב/.test(t)) return { type: 'invoices_credits', prefill: t };
  if (/תשלום|שילם|לרשום תשלום/.test(t)) return { type: 'context_pay_record' };
  if (/תיק/.test(t) || (/תמצאי|תביאי|תפתחי|תחפשי/.test(t) && (extractPlate(t) || digitRuns(t).join('').length >= 2))) return { type: 'find_case', prefill: t };
  if (/לקוח|תמצאי|תחפשי/.test(t)) return { type: 'existing_customer', prefill: t.replace(/.*?(לקוח קיים|הלקוח|לקוח|תמצאי לי את|תמצאי את|תמצאי|תחפשי)\s*/, '').trim() || undefined };
  return null;
}

// -----------------------------------------------------------------------------
// Topic switching: a side question or another action in the middle of a flow
// -----------------------------------------------------------------------------

/** Workflows that only show data — answered on the side without leaving the current flow. */
const INFO_WORKFLOWS: VoiceWorkflowType[] = ['find_case', 'reports'];

// Question words alone; action verbs ("תמצאי", "תפתחי") count only after "רגע", because they are also real answers
// ("תמצאי את הרכב 12-345-67" inside intake).
const QUESTION_START = /^(רגע[,.\s]+(כמה|מה|איפה|מתי|למה|איזה|אילו|האם|יש לנו|תגידי|תראי לי|תביאי לי|אני רוצה|בואי|תעברי|תפתחי|תמצאי|תחפשי)|כמה|מה|איפה|מתי|למה|איזה|אילו|האם|יש לנו|תגידי)(?=$|[\s,?])/;
/** Steps that themselves choose what to do next — their answers are actions by design, so only greetings interrupt. */
const MENU_STEPS = new Set(['customerAction', 'pickOpenCase', 'listOrSearch', 'general']);

export type SmallTalk = 'hello' | 'howAreYou' | 'thanks';
/** Short greetings / thanks — answered locally with a fixed sentence. */
export function detectSmallTalk(text: string): SmallTalk | null {
  const t = String(text || '').trim().replace(/[.!?,]+/g, '').replace(/\s+/g, ' ');
  if (/^(דליה )?(מה שלומך|מה נשמע|מה קורה|מה המצב|איך את)( דליה)?$/.test(t)) return 'howAreYou';
  if (/^(דליה )?(שלום|היי|הי|הלו|בוקר טוב|ערב טוב|צהריים טובים)( דליה)?$/.test(t)) return 'hello';
  if (/^(תודה|תודה רבה|תודה לך|יופי תודה|מעולה תודה|סבבה תודה)( דליה)?$/.test(t)) return 'thanks';
  return null;
}
export function smallTalkSay(kind: SmallTalk): string {
  return kind === 'hello' ? P.smallTalkHello : kind === 'howAreYou' ? P.smallTalkHowAreYou : P.smallTalkThanks;
}

type Interruption =
  | { kind: 'quoteLater' }
  | { kind: 'info'; route: { type: VoiceWorkflowType; prefill?: string; data?: Partial<VoiceData> } }
  | { kind: 'action'; route: { type: VoiceWorkflowType; prefill?: string; data?: Partial<VoiceData> } }
  | { kind: 'chat'; text: string }
  | { kind: 'smalltalk'; talk: SmallTalk };

/**
 * Is this utterance an answer to the current question, or a new topic?
 * A new topic needs a clear signal ("רגע, …", a question word, "?", an explicit action phrase) so a real answer
 * (a name, an address, a work description) is never taken for a question — and a question is never saved as data.
 */
export function classifyInterruption(text: string, s: VoiceSession): Interruption | null {
  const t = String(text || '').trim();
  if (!t || s.type === 'general_action' || s.type === 'resume_action') return null;
  const talk = detectSmallTalk(t);
  const menu = MENU_STEPS.has(currentStep(s)?.id || s.current || '');
  if (talk && !(menu && talk === 'thanks')) return { kind: 'smalltalk', talk };
  if (menu) return null;
  // a quote for the customer being opened: kept for when the customer + vehicle are saved (no double record)
  const stepId = currentStep(s)?.id || '';
  if (s.type === 'new_customer' && /הצעת מחיר|הצעה ל/.test(t) && !['quoteOffer', 'vehicleChoice'].includes(stepId) && !s.data.wantQuote) {
    return { kind: 'quoteLater' };
  }
  const route = routeFreeRequest(t);
  // "show me all the open cases" is never an answer to a question inside another flow
  const signal = QUESTION_START.test(t) || /\?\s*$/.test(t) || (route?.type === 'find_case' && !!parseCaseListIntent(t));
  // the list / report flows answer each other's questions themselves
  const bothInfo = !!route && INFO_WORKFLOWS.includes(route.type) && INFO_WORKFLOWS.includes(s.type);
  if (route && route.type !== s.type && !bothInfo && signal) {
    return INFO_WORKFLOWS.includes(route.type) ? { kind: 'info', route } : { kind: 'action', route };
  }
  // an explicit "open a new customer / close a case …" phrase is clear even without a question word
  // (the customer search already turns "לקוח חדש" into a new customer by itself)
  const ownSwitch = s.type === 'existing_customer' && route?.type === 'new_customer';
  if (route && route.type !== s.type && !ownSwitch && /^(בואי|אני רוצה|תעברי|נעבור|לעבור|תפתחי|תתחילי|נתחיל)( ל| ל?ה| ל?פתוח| ל?עשות| ל?פתיחת)?.{0,12}(לקוח חדש|לקוח|סגירת תיק|לסגור תיק|קבלת רכב|הצעת מחיר)/.test(t)) {
    return INFO_WORKFLOWS.includes(route.type) ? { kind: 'info', route } : { kind: 'action', route };
  }
  // a clear question the engine cannot answer → the regular Dalia chat
  if (!route && (/^רגע[,.\s]+\S/.test(t) || (/\?\s*$/.test(t) && QUESTION_START.test(t)))) return { kind: 'chat', text: t };
  return null;
}

const CONTINUE_CHOICES = choices(['▶ להמשיך', 'כן, להמשיך'], ['✖ לבטל את הפעולה', 'לא, לבטל']);
const SWITCH_CHOICES = choices(['➡ לעבור', 'כן, לעבור'], ['↩ להישאר', 'לא, להישאר']);
const GENERAL_CHOICES = choices(
  ['📂 כמה תיקים פתוחים', 'כמה תיקים פתוחים יש לנו'],
  ['✅ מוכנים לסגירה', 'אילו תיקים מוכנים לסגירה'],
  ['💰 כמה כסף נכנס השבוע', 'כמה כסף נכנס השבוע'],
  ['🔧 רכבים בעבודה', 'תראי לי את כל הרכבים בעבודה'],
);

function snapshot(s: VoiceSession): VoiceSession {
  return JSON.parse(JSON.stringify({ ...s, data: { ...s.data, invoiceFile: undefined, awaitingContinue: undefined, pendingSwitch: undefined } }));
}

/** When a side flow ends, go back to the interrupted one and ask whether to continue it. */
function resumeAfter(returnTo: VoiceSession | undefined, result: VoiceResult, say: string = P.continueFlowAsk): VoiceResult {
  if (!returnTo || result.session || result.turn.outcome === 'paused') return result;
  if (returnTo.type === 'general_action') {
    // back to the open general chat — no "continue?" question, the chat simply keeps listening
    return { session: returnTo, turn: { ...result.turn, expectsAnswer: true, done: false, isConfirmation: false } };
  }
  returnTo.data.awaitingContinue = true;
  return {
    session: returnTo,
    turn: {
      ...result.turn,
      followSay: say,
      expectsAnswer: true,
      done: false,
      isConfirmation: false,
      ui: [...(result.turn.ui || []), CONTINUE_CHOICES],
    },
  };
}

async function startSide(s: VoiceSession, route: { type: VoiceWorkflowType; prefill?: string; data?: Partial<VoiceData> }, env: VoiceEnv, say: string): Promise<VoiceResult> {
  const back = snapshot(s);
  const result = await startVoiceWorkflow(route.type, {}, env, route.prefill, { ...(route.data || {}), returnTo: back });
  return resumeAfter(back, result, say);
}

async function handleInterruption(s: VoiceSession, it: Interruption, env: VoiceEnv): Promise<VoiceResult> {
  switch (it.kind) {
    case 'quoteLater': {
      s.data.wantQuote = true;
      s.data.quoteOffered = true;
      const turn = await advance(s, env);
      return { session: s, turn: { ...turn, say: P.quoteAfterCustomer, alt: undefined, followSay: turn.expectsAnswer ? (turn.alt || turn.say) : undefined } };
    }
    case 'smalltalk':
      s.data.awaitingContinue = true;
      return { session: s, turn: { say: smallTalkSay(it.talk), followSay: P.continueFlowAsk, ui: [CONTINUE_CHOICES], expectsAnswer: true, done: false } };
    case 'chat':
      s.data.awaitingContinue = true;
      return { session: s, turn: { say: P.sideChat, handoff: it.text, display: 'כשתסיים, אפשר לומר "להמשיך" או "לבטל".', ui: [CONTINUE_CHOICES], expectsAnswer: true, done: false } };
    case 'info':
      return startSide(s, it.route, env, P.continueFlowAsk);
    case 'action':
      s.data.pendingSwitch = it.route;
      return { session: s, turn: { say: P.switchFlowAsk, display: `פעולה חדשה: ${VOICE_WORKFLOW_LABELS[it.route.type]}\nהפעולה הנוכחית: ${VOICE_WORKFLOW_LABELS[s.type]}`, ui: [SWITCH_CHOICES], expectsAnswer: true, isConfirmation: false, done: false } };
  }
}

const CONTINUE_WORDS = /המשך|להמשיך|נמשיך|תמשיכי|ממשיכים|לחזור|נחזור|חזרה לפעולה/;
const STAY_WORDS = /להישאר|נישאר|תישארי|לא לעבור/;

/** The answer to "continue the previous action?" or "switch to the other action?". */
async function answerPending(s: VoiceSession, answer: string, env: VoiceEnv): Promise<VoiceResult | null> {
  const yn = parseYesNo(answer);
  if (s.data.pendingSwitch) {
    const route = s.data.pendingSwitch;
    if (STAY_WORDS.test(answer) || yn === 'no' || detectCommand(answer) === 'cancel') {
      s.data.pendingSwitch = undefined;
      return { session: s, turn: await advance(s, env, P.stayInFlow) };
    }
    if (yn === 'yes' || /לעבור|נעבור|תעברי/.test(answer)) {
      s.data.pendingSwitch = undefined;
      return startSide(s, route, env, P.backToFlowAsk);
    }
    return { session: s, turn: askTurn({ say: P.switchFlowAsk, ui: [SWITCH_CHOICES] }) };
  }
  if (s.data.awaitingContinue) {
    if (CONTINUE_WORDS.test(answer) || yn === 'yes') {
      s.data.awaitingContinue = undefined;
      return { session: s, turn: await advance(s, env, s.filled.length ? recap(s) : undefined) };
    }
    if (yn === 'no' || detectCommand(answer) === 'cancel' || /לבטל/.test(answer)) {
      return { session: null, turn: { say: P.cancelled, expectsAnswer: false, done: true, outcome: 'cancelled' } };
    }
    // another side question while waiting — answer it too
    const it = classifyInterruption(answer, s) || (() => {
      const route = routeFreeRequest(answer);
      if (!route || route.type === s.type) return null;
      return INFO_WORKFLOWS.includes(route.type) ? { kind: 'info', route } as Interruption : { kind: 'action', route } as Interruption;
    })();
    if (it) {
      s.data.awaitingContinue = undefined;
      return handleInterruption(s, it, env);
    }
    return { session: s, turn: askTurn({ say: P.continueFlowAsk, ui: [CONTINUE_CHOICES] }) };
  }
  return null;
}

function generalFlow(): Step[] {
  return [
    {
      id: 'general',
      done: () => false,
      ask: (_d, _s, env) => ({ ...personal(env, P.generalChatOpen), ui: [GENERAL_CHOICES] }),
      answer: (text, s) => {
        // general chat stays open: greetings are answered here, system requests go to their flow and come
        // back here, anything else is answered by the regular Dalia chat
        if (/^(זהו|סיימתי|סיימנו|ביי|להתראות|יום טוב)( תודה)?$/.test(text.trim())) return finish(P.okDone, 'info');
        const talk = detectSmallTalk(text);
        if (talk) return reask(smallTalkSay(talk), undefined, [GENERAL_CHOICES]);
        const route = routeFreeRequest(text);
        if (!route) return finish(P.generalToChat, 'info', { handoff: text, expectsAnswer: true, done: false, keepForResume: true });
        return { kind: 'switch', type: route.type, data: { ...(route.data || {}), returnTo: snapshot(s) }, prefill: route.prefill };
      },
      clear: () => {},
    },
  ];
}

// -----------------------------------------------------------------------------
// Engine
// -----------------------------------------------------------------------------

function flowFor(type: VoiceWorkflowType): Step[] {
  switch (type) {
    case 'new_customer': return newCustomerFlow();
    case 'existing_customer': return existingCustomerFlow();
    case 'intake': return intakeFlow();
    case 'quote':
    case 'context_quote_add_work':
    case 'context_quote_add_part':
    case 'context_quote_supplement':
      return quoteFlow(type);
    case 'context_pay_balance':
    case 'context_pay_record':
      return paymentFlow();
    case 'close_case': return closeCaseFlow();
    case 'find_case': return findCaseFlow();
    case 'invoices_credits': return invoicesFlow();
    case 'general_expenses': return expensesFlow();
    case 'reports': return reportsFlow();
    case 'general_action': return generalFlow();
    default: return [];
  }
}

function currentStep(s: VoiceSession): Step | undefined {
  return flowFor(s.type).find((st) => (st.applies ? st.applies(s.data, s) : true) && !st.done(s.data));
}

function askTurn(ask: Ask, display?: string, ui?: VoiceUi[]): VoiceTurn {
  const allUi = [...(ui || []), ...(ask.ui || [])];
  return {
    say: ask.say,
    alt: ask.alt,
    display: join(display, ask.display),
    ui: allUi.length ? allUi : undefined,
    expectsAnswer: true,
    isConfirmation: !!ask.confirm,
    done: false,
  };
}

async function advance(s: VoiceSession, env: VoiceEnv, display?: string, ui?: VoiceUi[]): Promise<VoiceTurn> {
  const step = currentStep(s);
  if (!step) return { say: P.okDone, display, ui, expectsAnswer: false, done: true, outcome: 'info' };
  s.current = step.id;
  const auto = step.auto?.(s, env);
  if (auto && auto.kind === 'finish') return { ...auto.turn, display: join(display, auto.turn.display), ui: [...(ui || []), ...(auto.turn.ui || [])] };
  if (s.type === 'reports' && step.id === 'reportRun') {
    const turn = await runReport(s, env);
    return { ...turn, display: join(display, turn.display), ui: [...(ui || []), ...(turn.ui || [])] };
  }
  return askTurn(step.ask(s.data, s, env), display, ui);
}

function newSession(type: VoiceWorkflowType, ctx: VoiceContext, env: VoiceEnv): VoiceSession {
  const data: VoiceData = {};
  if (ctx.caseId) {
    data.caseId = ctx.caseId;
    data.caseNumber = ctx.caseNumber || undefined;
    data.caseLabel = [ctx.caseNumber, ctx.customerName, ctx.plate ? `רכב ${ctx.plate}` : ''].filter(Boolean).join(' · ') || undefined;
    data.caseFromContext = true;
  }
  if (type === 'context_quote_add_work' || type === 'context_quote_add_part') data.scope = 'quote';
  if (type === 'context_quote_supplement') data.scope = 'supplement';
  if (type === 'context_quote_add_work') data.partsDone = true;
  if (type === 'context_quote_add_part') data.worksDone = true;
  const now = (env.now?.() || new Date());
  return { id: `vs_${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`, type, data, filled: [], updatedAt: now.toISOString() };
}

const WORKFLOWS_WITHOUT_CASE_CONTEXT: VoiceWorkflowType[] = ['new_customer', 'existing_customer', 'find_case', 'general_expenses', 'reports', 'general_action', 'invoices_credits'];

/** What was done and what is left — shown when resuming. */
function recap(s: VoiceSession): string {
  const d = s.data;
  const lines = [
    `פעולה: ${VOICE_WORKFLOW_LABELS[s.type]}`,
    ...customerSummary(d),
    ...(d.plate || d.vehicleLabel || d.noVehicle ? vehicleSummary(d) : []),
    d.caseLabel ? `תיק: ${d.caseLabel}` : '',
    d.km ? `ק"מ: ${d.km}` : '',
    d.fuel ? `דלק: ${d.fuel}` : '',
    d.keys ? `מפתחות: ${d.keys}` : '',
    d.intakeSaved ? `תמונות קבלה שחסרות: ${missingIntakeAngles(d).map((m) => m.title).join(', ') || 'אין'}` : '',
    d.works?.length ? `עבודות: ${d.works.map(lineText).join('; ')}` : '',
    d.parts?.length ? `חלקים: ${d.parts.map(lineText).join('; ')}` : '',
    d.extraText ? `תוספת: ${d.extraText}` : '',
    d.payAmount ? `תשלום: ${money(d.payAmount)} ${d.payMethod?.label || ''}` : '',
    d.supplierLabel ? `ספק: ${d.supplierLabel}` : '',
    d.invoiceNumber ? `חשבונית: ${d.invoiceNumber}` : '',
  ].filter(Boolean);
  const step = currentStep(s);
  const left = step ? `\nהשלב הבא: ${step.ask(s.data, s, { actions: null }).say}` : '';
  return (lines.length > 1 ? lines.join('\n') : `${lines[0]}\nעדיין לא נרשמו פרטים.`) + left;
}

type Command = 'cancel' | 'pause' | 'repeat' | 'back' | 'summary' | 'help' | { correct: string };

const HELP_TEXT = [
  'אפשר לומר בכל שלב:',
  '• "תחזרי על השאלה" — לשמוע שוב',
  '• "שאלה קודמת" — לחזור צעד אחורה',
  '• "תקני את הטלפון" (או שם, רכב, דלק…) — לתקן פרט',
  '• "מה רשמת" — לראות מה נרשם',
  '• "עצרי" — לעצור ולהמשיך אחר כך',
  '• "בטל" — לבטל בלי לשמור',
].join('\n');

/** Control phrases are recognised only in short utterances, so they never swallow a real answer. */
export function detectCommand(text: string): Command | null {
  const t = text.trim().replace(/^דליה[,.!\s]+/, '').replace(/[.!?,]+$/g, '');
  const words = t.split(/\s+/).length;
  if (/(תחזרי|חזרי|תגידי|תגיד) (שוב )?(על )?(ה)?שאלה|לא שמעתי|מה שאלת|מה השאלה|^שוב$|^עוד פעם$|^חזרי$|^תחזרי$/.test(t)) return 'repeat';
  if (/^(מה רשמת|מה רשמנו|מה יש עד עכשיו|תסכמי|סיכום עד עכשיו|מה כבר רשמת)/.test(t)) return 'summary';
  if (/^(עזרה|מה אפשר לומר|מה אפשר להגיד)/.test(t)) return 'help';
  const correction = t.match(/^(?:לא[, ]+)?(?:תקני|תקן|תתקני|לתקן|תיקון|תשני|לשנות|טעות ב|טעיתי ב)\s*(?:את\s+)?(.+)$/);
  if (correction && correction[1]) return { correct: correction[1] };
  if (words > 5) return null;
  if (/^(בטל|ביטול|לבטל|תבטלי|בטלי|עזבי|עזוב|תעזבי)( את)?( הכל| הכול| הפעולה| זה)?$|^(לא[, ]+)?בטל$|^בטל את הפעולה$/.test(t)) return 'cancel';
  if (/^(עצרי|תעצרי|עצור|המתיני|חכי|הפסקה|נעצור)( רגע)?$|^רגע$/.test(t)) return 'pause';
  if (/^(שאלה קודמת|אחורה|חזרה|חזור|חזרי אחורה|תחזרי אחורה|טעיתי|תחזרי לשאלה הקודמת)$/.test(t)) return 'back';
  return null;
}

export interface VoiceResult {
  session: VoiceSession | null;
  turn: VoiceTurn;
}

const STORAGE_KEY = 'dalia_voice_session_v2';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function saveVoiceSession(s: VoiceSession): void {
  try {
    // photo bytes are never stored
    const copy = { ...s, data: { ...s.data, invoiceFile: undefined } };
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(copy));
  } catch {}
}
export function loadVoiceSession(now = new Date()): VoiceSession | null {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as VoiceSession;
    if (!s?.type || !s.data || now.getTime() - new Date(s.updatedAt).getTime() > MAX_AGE_MS) return null;
    return s;
  } catch {
    return null;
  }
}
export function clearVoiceSession(): void {
  try {
    window.localStorage?.removeItem(STORAGE_KEY);
  } catch {}
}

function touch(s: VoiceSession, env: VoiceEnv) {
  s.updatedAt = (env.now?.() || new Date()).toISOString();
}

/** Starts one of the workflows. `prefill` is a free sentence that already answers the first question. */
export async function startVoiceWorkflow(type: VoiceWorkflowType, ctx: VoiceContext, env: VoiceEnv, prefill?: string, data?: Partial<VoiceData>): Promise<VoiceResult> {
  if (type === 'resume_action') {
    const saved = loadVoiceSession(env.now?.());
    if (!saved) return { session: null, turn: { say: P.resumeNone, expectsAnswer: false, done: true, outcome: 'info' } };
    const s = newSession('resume_action', {}, env);
    s.data.resumeOf = saved;
    s.current = 'resume';
    return {
      session: s,
      turn: { say: P.resumeAsk, display: recap(saved), ui: [YES_NO], expectsAnswer: true, isConfirmation: false, done: false },
    };
  }
  if (!env.actions && type !== 'general_action') return { session: null, turn: { say: P.noActions, expectsAnswer: false, done: true, outcome: 'failed' } };
  if (type === 'reports' && env.actions?.actorRole && !['super_admin', 'fleet_manager'].includes(env.actions.actorRole)) {
    return { session: null, turn: { say: P.reportNoPermission, expectsAnswer: false, done: true, outcome: 'info' } };
  }
  const s = newSession(type, WORKFLOWS_WITHOUT_CASE_CONTEXT.includes(type) ? {} : ctx, env);
  if (data) Object.assign(s.data, data);
  if (type === 'close_case' && s.data.caseId) {
    const out = await runStepless(async () => {
      const c = await needActions(env).getCase(s.data.caseId!);
      if (!c) return failed(new Error('התיק לא נמצא'));
      if (c.case_data.caseClosed) return finish(P.okNotOpening, 'info', { display: `התיק ${c.case_number} כבר סגור.` });
      s.data.closeCd = c.case_data;
      s.data.caseNumber = c.case_number;
      return null;
    });
    if (out) return applyOutcomeAtStart(s, out, env);
  }
  if (prefill && prefill.trim()) {
    const first = currentStep(s);
    if (first) {
      const out = await runStep(first, prefill, s, env);
      // a prefill that is not understood simply leaves the first question to be asked
      if (out.kind !== 'reask') return applyOutcome(s, first, out, env);
    }
  }
  return { session: s, turn: await advance(s, env) };
}

/** Processes one spoken (or typed) answer. */
export async function answerVoiceWorkflow(s: VoiceSession, text: string, env: VoiceEnv): Promise<VoiceResult> {
  const returnTo = s.data.returnTo;
  const result = await answerInner(s, text, env);
  // the side flow ended → back to the interrupted one (its own "continue?" question)
  return result.session === null ? resumeAfter(returnTo, result) : result;
}

/** "דליה, עצרי. תפתחי לי…" → "תפתחי לי…" (only when something follows the address / stop word). */
export function stripAddress(text: string): string {
  const t = String(text || '').trim();
  const rest = t.replace(/^(דליה[,.!\s]*)?((עצרי|תעצרי|עצור|חכי|תחכי|stop)[,.!\s]+)?/, '').trim();
  return rest && rest !== t ? rest : t;
}

async function answerInner(s: VoiceSession, text: string, env: VoiceEnv): Promise<VoiceResult> {
  const answer = stripAddress(String(text || '').trim());
  touch(s, env);

  const pending = await answerPending(s, answer, env);
  if (pending) return pending;

  if (s.type === 'resume_action') {
    const saved = s.data.resumeOf;
    const yn = parseYesNo(answer);
    if (!saved || yn === 'no' || detectCommand(answer) === 'cancel') {
      return { session: null, turn: { say: P.resumeDeclined, expectsAnswer: false, done: true, outcome: 'cancelled' } };
    }
    if (yn !== 'yes') return { session: s, turn: askTurn({ say: P.yesNoRetry, ui: [YES_NO] }) };
    touch(saved, env);
    return { session: saved, turn: await advance(saved, env, recap(saved)) };
  }

  const step = currentStep(s);
  if (!step) return { session: null, turn: { say: P.okDone, expectsAnswer: false, done: true, outcome: 'info' } };

  const cmd = detectCommand(answer);
  if (cmd === 'cancel') return { session: null, turn: { say: P.cancelled, expectsAnswer: false, done: true, outcome: 'cancelled' } };
  if (cmd === 'pause') return { session: s, turn: { say: P.paused, display: recap(s), expectsAnswer: false, done: true, outcome: 'paused', keepForResume: true } };
  if (cmd === 'repeat') return { session: s, turn: askTurn(step.ask(s.data, s, env)) };
  if (cmd === 'summary') return { session: s, turn: askTurn(step.ask(s.data, s, env), recap(s)) };
  if (cmd === 'help') return { session: s, turn: askTurn(step.ask(s.data, s, env), HELP_TEXT) };
  if (cmd === 'back') {
    const flow = flowFor(s.type);
    const prevId = s.filled.pop();
    const prev = prevId ? flow.find((st) => st.id === prevId) : undefined;
    if (prev) prev.clear(s.data);
    return { session: s, turn: await advance(s, env, prev ? 'חזרנו לשאלה הקודמת.' : undefined) };
  }
  if (cmd && typeof cmd === 'object') {
    const flow = flowFor(s.type);
    const target = flow.find((st) => st.slots && st.slots.test(cmd.correct) && (st.applies ? st.applies(s.data, s) : true));
    if (target) {
      target.clear(s.data);
      s.filled = s.filled.filter((id) => id !== target.id);
      const rest = cmd.correct.replace(target.slots!, ' ').replace(/^\s*(ה\s+)?(ל-?|ל |הוא|זה|שלו|שלה)\s*/, '').trim();
      if (rest && currentStep(s)?.id === target.id) {
        const out = await runStep(target, rest, s, env);
        if (out.kind === 'next') return { session: s, turn: await advance(s, env, join('עודכן.', out.display)) };
      }
      return { session: s, turn: await advance(s, env, 'בוא נתקן.') };
    }
    return { session: s, turn: askTurn(step.ask(s.data, s, env), join('לא הבנתי איזה פרט לתקן.', HELP_TEXT)) };
  }

  // a side question / another action → answered on the side, never saved as the answer to this step
  const interruption = classifyInterruption(answer, s);
  if (interruption) return handleInterruption(s, interruption, env);

  const out = await runStep(step, answer, s, env);
  return applyOutcome(s, step, out, env);
}

/** A photo / document the user picked for the current question (camera or upload). */
export async function answerVoiceFile(s: VoiceSession, file: VoiceFile, env: VoiceEnv): Promise<VoiceResult> {
  touch(s, env);
  const step = currentStep(s);
  if (!step?.onFile) {
    return { session: s, turn: askTurn(step ? step.ask(s.data, s, env) : { say: P.notUnderstood }, 'בשלב הזה לא ביקשתי קובץ.') };
  }
  let out: Outcome;
  try {
    out = await step.onFile(file, s, env);
  } catch (e) {
    out = e instanceof NoActionsError ? finish(P.noActions, 'failed') : failed(e);
  }
  const result = await applyOutcome(s, step, out, env);
  return result.session === null ? resumeAfter(s.data.returnTo, result) : result;
}

async function runStepless(fn: () => Promise<Outcome | null>): Promise<Outcome | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NoActionsError) return finish(P.noActions, 'failed');
    return failed(e, 'החיפוש במערכת נכשל');
  }
}

async function applyOutcomeAtStart(s: VoiceSession, out: Outcome, env: VoiceEnv): Promise<VoiceResult> {
  if (out.kind === 'finish') return { session: out.turn.keepForResume ? s : null, turn: out.turn };
  return { session: s, turn: await advance(s, env, out.kind === 'next' || out.kind === 'reask' ? out.display : undefined) };
}

async function runStep(step: Step, text: string, s: VoiceSession, env: VoiceEnv): Promise<Outcome> {
  try {
    return await step.answer(text, s, env);
  } catch (e) {
    if (e instanceof NoActionsError) return finish(P.noActions, 'failed');
    if (e instanceof SearchError) return reask(P.searchFailed, e.message);
    return failed(e, 'החיפוש במערכת נכשל');
  }
}

async function applyOutcome(s: VoiceSession, step: Step, out: Outcome, env: VoiceEnv): Promise<VoiceResult> {
  switch (out.kind) {
    case 'next':
      if (!s.filled.includes(step.id) || step.id === 'works' || step.id === 'parts') s.filled.push(step.id);
      return { session: s, turn: await advance(s, env, out.display, out.ui) };
    case 'reask':
      s.current = step.id;
      return { session: s, turn: askTurn(out.ask, out.display) };
    case 'finish':
      return { session: out.turn.keepForResume ? s : null, turn: out.turn };
    case 'switch': {
      // carry over what was already said (customer, case) into the next workflow
      const carry: Partial<VoiceData> = {
        customerId: s.data.customerId,
        customerLabel: s.data.customerLabel,
        returnTo: s.data.returnTo,
        ...(out.data || {}),
      };
      const started = await startVoiceWorkflow(out.type, {}, env, out.prefill, Object.fromEntries(Object.entries(carry).filter(([, v]) => v !== undefined)));
      if (out.intro) {
        // "תיק העבודה נפתח. עכשיו נכין את הצעת המחיר." and then the first question of the next workflow
        started.turn = {
          ...started.turn,
          say: out.intro,
          alt: undefined,
          followSay: started.turn.expectsAnswer ? (started.turn.alt || started.turn.say) : undefined,
          display: join(out.introDisplay, started.turn.display),
        };
      }
      return started.session === null ? resumeAfter(carry.returnTo, started) : started;
    }
  }
}
