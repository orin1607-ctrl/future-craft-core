// Conversational engine for the garage voice workflows (the nine Dalia buttons + in-case shortcuts).
//
// Slot-filling model: every workflow is an ordered list of steps; Dalia asks the first step that still has
// no answer. One answer may fill several steps ("משה כהן 052…"), any step can be corrected ("תקני את
// הטלפון"), and nothing is ever invented — an unreadable answer is asked again.
// Every sentence Dalia speaks is fixed text (pre-recorded clips); names, lists and summaries are only
// shown on screen. Writes happen only after an explicit "yes" and only through GarageVoiceActions,
// i.e. the same functions the garage screen uses.

import {
  DALIA_SAFE_ALTERNATIVES,
  DALIA_VOICE_PROMPTS as P,
} from '../../../supabase/functions/_shared/daliaVoicePrompts';
import {
  closeCaseGaps,
  customerDisplayName,
  garageCaseListStatus,
  garageListBucket,
  garageNextAction,
  normalizePlate,
  vehicleLabel,
} from '@/modules/garage-management/garageBook';
import type {
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
  extractName,
  extractPhone,
  extractPlate,
  isNoneAnswer,
  isNoPriceAnswer,
  parseCustomerType,
  parseFuel,
  parseHebrewNumber,
  parsePaymentMethod,
  parseSpokenLine,
  parseYesNo,
  pickFromList,
  splitMakeModel,
  type SpokenLine,
} from './daliaVoiceParse';

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
  general_expenses: 'ספקים והוצאות',
  find_case: 'איתור תיק עבודה',
  close_case: 'סגירת תיק עבודה',
  resume_action: 'המשך פעולה אחרונה',
  context_quote_add_work: 'הוספת עבודה להצעה',
  context_quote_add_part: 'הוספת חלק להצעה',
  context_quote_supplement: 'תוספת להצעה',
  context_pay_balance: 'תשלום יתרה',
  context_pay_record: 'רישום תשלום',
};

type Candidate = { id: string; label: string };
type CandidateKind = 'customer' | 'case' | 'vehicle' | 'supplier';

export interface VoiceData {
  customerName?: string;
  customerPhone?: string;
  customerType?: 'private' | 'business';
  companyName?: string;
  plate?: string;
  noVehicle?: boolean;
  make?: string;
  model?: string;
  arrivedNow?: boolean;
  complaint?: string;
  km?: string;
  fuel?: string;
  keys?: string;
  lights?: string;
  lightsPending?: boolean;
  items?: string;
  itemsPending?: boolean;
  customerId?: string;
  customerLabel?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  vehicleKnown?: boolean;
  plateChecked?: boolean;
  caseId?: string;
  caseNumber?: string;
  caseLabel?: string;
  caseFromContext?: boolean;
  caseTotal?: number;
  casePaid?: number;
  candidates?: Candidate[];
  candidateKind?: CandidateKind;
  customerAction?: 'new_case' | 'open_case';
  noOpenCases?: boolean;
  scope?: 'quote' | 'supplement';
  works?: SpokenLine[];
  parts?: SpokenLine[];
  pending?: { kind: 'work' | 'part'; line: SpokenLine };
  worksDone?: boolean;
  partsDone?: boolean;
  extraText?: string;
  extraPrice?: number | null;
  extraCustomerSaid?: 'approved' | 'pending';
  payAmount?: number;
  payMethod?: { method: string; label: string };
  subType?: 'check' | 'prepare' | 'credit' | 'search' | 'purchase' | 'debt';
  supplierId?: string;
  supplierName?: string;
  supplierLabel?: string;
  supplierToCreate?: string;
  invoiceNumber?: string;
  invoiceTotal?: number;
  purchaseCaseDone?: boolean;
  resumeOf?: VoiceSession;
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
  /** Spoken sentence — always a fixed (pre-recorded) sentence. */
  say: string;
  /** Extra details shown on screen only (lists, summaries, names). */
  display?: string;
  expectsAnswer: boolean;
  isConfirmation?: boolean;
  done: boolean;
  outcome?: 'executed' | 'cancelled' | 'failed' | 'info' | 'paused';
  openCaseId?: string;
  /** Keep the session stored so "המשך פעולה אחרונה" can retry (e.g. after a failed save). */
  keepForResume?: boolean;
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
}

type Ask = { say: string; display?: string; confirm?: boolean };
type Outcome =
  | { kind: 'next'; display?: string }
  | { kind: 'reask'; ask: Ask; display?: string }
  | { kind: 'finish'; turn: VoiceTurn }
  | { kind: 'switch'; type: VoiceWorkflowType; data?: Partial<VoiceData> };

interface Step {
  id: string;
  /** Correction keywords ("תקני את הטלפון"). */
  slots?: RegExp;
  applies?: (d: VoiceData, s: VoiceSession) => boolean;
  done: (d: VoiceData) => boolean;
  ask: (d: VoiceData, s: VoiceSession) => Ask;
  answer: (text: string, s: VoiceSession, env: VoiceEnv) => Outcome | Promise<Outcome>;
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
const reask = (say: string, display?: string): Outcome => ({ kind: 'reask', ask: { say, display } });
const next = (display?: string): Outcome => ({ kind: 'next', display });

function needActions(env: VoiceEnv): GarageVoiceActions {
  if (!env.actions) throw new NoActionsError();
  return env.actions;
}
class NoActionsError extends Error {
  constructor() {
    super('no-actions');
  }
}

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
  if (yn === 'no') return { kind: 'reask', ask: { say: P.notSaved, confirm: true } };
  return { kind: 'reask', ask: { say: P.confirmRetry, confirm: true } };
}

// -----------------------------------------------------------------------------
// Reusable steps
// -----------------------------------------------------------------------------

function nameStep(id: string, askSay: (d: VoiceData) => string, applies?: Step['applies']): Step {
  return {
    id,
    slots: /(^|\s)ה?שם(\s|$)/,
    applies,
    done: (d) => !!d.customerName,
    ask: (d) => ({ say: askSay(d) }),
    answer: (text, s) => {
      const name = extractName(text);
      if (!name) return reask(P.customerNameRetry);
      s.data.customerName = name;
      // natural answers may already carry the phone or plate
      const phone = extractPhone(text);
      if (phone && !s.data.customerPhone) s.data.customerPhone = phone;
      return next();
    },
    clear: (d) => { d.customerName = undefined; },
  };
}

function phoneStep(applies?: Step['applies']): Step {
  return {
    id: 'phone',
    slots: /טלפון|פלאפון|נייד|סלולרי/,
    applies,
    done: (d) => !!d.customerPhone,
    ask: () => ({ say: P.phone }),
    answer: (text, s) => {
      const phone = extractPhone(text);
      if (!phone) return reask(P.phoneInvalid);
      s.data.customerPhone = phone;
      return next();
    },
    clear: (d) => { d.customerPhone = undefined; },
  };
}

function customerTypeSteps(applies?: Step['applies']): Step[] {
  return [
    {
      id: 'customerType',
      slots: /סוג( ה)?לקוח|פרטי|חברה/,
      applies,
      done: (d) => !!d.customerType,
      ask: () => ({ say: P.customerType }),
      answer: (text, s) => {
        const t = parseCustomerType(text);
        if (!t) return reask(P.customerTypeRetry);
        s.data.customerType = t;
        return next();
      },
      clear: (d) => { d.customerType = undefined; d.companyName = undefined; },
    },
    {
      id: 'companyName',
      slots: /שם ה?חברה/,
      applies: (d, s) => (applies ? applies(d, s) : true) && d.customerType === 'business',
      done: (d) => !!d.companyName,
      ask: () => ({ say: P.companyName }),
      answer: (text, s) => {
        const name = extractName(text);
        if (!name) return reask(P.companyName);
        s.data.companyName = name;
        return next();
      },
      clear: (d) => { d.companyName = undefined; },
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
      const { make, model } = splitMakeModel(text);
      s.data.make = make;
      s.data.model = model;
      return next();
    },
    clear: (d) => { d.make = undefined; d.model = undefined; },
  };
}

function yesNoStep(id: string, say: string, key: 'arrivedNow', slots: RegExp, applies?: Step['applies']): Step {
  return {
    id,
    slots,
    applies,
    done: (d) => d[key] !== undefined,
    ask: () => ({ say }),
    answer: (text, s) => {
      const yn = parseYesNo(text);
      if (!yn) return reask(P.yesNoRetry);
      s.data[key] = yn === 'yes';
      return next();
    },
    clear: (d) => { d[key] = undefined; },
  };
}

function complaintStep(say: string, applies?: Step['applies']): Step {
  return {
    id: 'complaint',
    slots: /תלונה|תקלה|בעיה|סיבת/,
    applies,
    done: (d) => d.complaint !== undefined,
    ask: () => ({ say }),
    answer: (text, s) => {
      if (/^(אין|לא ידוע|לא יודע|לא צוין)/.test(text.trim())) {
        s.data.complaint = '';
        return next();
      }
      if (!/[א-תA-Za-z]{2,}/.test(text)) return reask(P.notUnderstood);
      s.data.complaint = text.trim();
      return next();
    },
    clear: (d) => { d.complaint = undefined; },
  };
}

/** Optional detail field asked as yes/no first ("האם יש נורות…?" → "אילו?"). */
function detailStep(id: 'lights' | 'items', askSay: string, whichSay: string, slots: RegExp): Step {
  const pendingKey = id === 'lights' ? 'lightsPending' : 'itemsPending';
  return {
    id,
    slots,
    done: (d) => d[id] !== undefined,
    ask: (d) => ({ say: d[pendingKey] ? whichSay : askSay }),
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
      // "כן, נורת מנוע" — the details came with the yes
      if (words.length > 1 && /[א-תA-Za-z]{2,}/.test(text) && !(yn === 'yes' && words.length <= 2)) {
        d[id] = text.replace(/^(כן|יש)[,\s]+/, '').trim();
        return next();
      }
      if (yn === 'yes') {
        d[pendingKey] = true;
        return reask(whichSay);
      }
      return reask(P.yesNoRetry);
    },
    clear: (d) => { d[id] = undefined; d[pendingKey] = false; },
  };
}

/** Search + pick an existing customer. */
function customerSearchStep(): Step {
  return {
    id: 'customer',
    slots: /(^|\s)ה?לקוח(\s|$)/,
    done: (d) => !!d.customerId,
    ask: (d) => {
      if (d.candidateKind === 'customer' && d.candidates?.length) {
        return d.candidates.length === 1
          ? { say: P.customerOne, display: d.candidates[0].label }
          : { say: P.customerMany, display: numbered(d.candidates.map((c) => c.label)) };
      }
      return { say: P.existingQuery };
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
            return reask(P.existingQuery);
          }
        } else {
          const idx = pickFromList(text, list.map((c, i) => `${i + 1}. ${c.label}`));
          if (idx !== null) return selectCustomer(s, list[idx]);
        }
        // not a choice — maybe a new search ("לא, תחפשי את דנה לוי")
        if (!extractPhone(text) && !extractPlate(text) && text.trim().split(/\s+/).length < 2) {
          return reask(P.pickRetry, numbered(list.map((c) => c.label)));
        }
      }
      if (/לקוח חדש/.test(text)) return { kind: 'switch', type: 'new_customer' };
      const actions = needActions(env);
      const phone = extractPhone(text);
      const plate = extractPlate(text);
      const query = phone ? phone.replace(/\D/g, '') : plate || extractName(text) || text.trim();
      const found = await actions.searchCustomers(query);
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

/** Matches cases by plate, case number or customer name. */
export function matchCases(cases: GarageCase[], text: string): GarageCase[] {
  const plate = extractPlate(text);
  const digits = digitRuns(text).join('');
  const nameWords = (extractName(text) || '')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/^(תיק|של|ה?לקוח|רכב|מספר|את|עבודה)$/.test(w));
  return cases.filter((c) => {
    const p = normalizePlate(c.vehicle_plate_snapshot || '');
    if (plate && p === plate) return true;
    const num = (c.case_number || '').replace(/\D/g, '');
    if (digits.length >= 2 && num && (num === digits || num.endsWith(digits))) return true;
    if (digits.length >= 4 && p.includes(digits)) return true;
    if (nameWords.length && nameWords.every((w) => (c.customer_name_snapshot || '').includes(w))) return true;
    return false;
  });
}

/** Search + pick a work case. `scope` decides which cases may be chosen. */
function caseSearchStep(opts: {
  askSay: string;
  /** open = not finished (quotes, payments); notClosed = finished work may still be closed; any = all. */
  scope: 'open' | 'notClosed' | 'any';
  applies?: Step['applies'];
  optional?: boolean;
  onSelected?: (s: VoiceSession, env: VoiceEnv) => Promise<Outcome | null>;
}): Step {
  return {
    id: 'case',
    slots: /(^|\s)ה?תיק(\s|$)/,
    applies: opts.applies,
    done: (d) => !!d.caseId || (!!opts.optional && !!d.purchaseCaseDone),
    ask: (d) => {
      if (d.candidateKind === 'case' && d.candidates?.length) {
        return d.candidates.length === 1
          ? { say: P.caseOne, display: d.candidates[0].label }
          : { say: P.casesMany, display: numbered(d.candidates.map((c) => c.label)) };
      }
      return { say: opts.askSay };
    },
    answer: async (text, s, env) => {
      const d = s.data;
      if (opts.optional && /לא שייך|ללא תיק|בלי תיק|אין/.test(text)) {
        d.purchaseCaseDone = true;
        return next();
      }
      if (d.candidateKind === 'case' && d.candidates?.length) {
        const list = d.candidates;
        let chosen: Candidate | null = null;
        if (list.length === 1) {
          const yn = parseYesNo(text);
          if (yn === 'yes') chosen = list[0];
          else if (yn === 'no') {
            d.candidates = undefined;
            return reask(opts.askSay);
          }
        } else {
          const idx = pickFromList(text, list.map((c, i) => `${i + 1}. ${c.label}`));
          if (idx !== null) chosen = list[idx];
        }
        if (chosen) {
          d.caseId = chosen.id;
          d.caseLabel = chosen.label;
          d.candidates = undefined;
          d.candidateKind = undefined;
          const extra = opts.onSelected ? await opts.onSelected(s, env) : null;
          return extra || next(`נבחר התיק: ${chosen.label}`);
        }
        if (!extractPlate(text) && digitRuns(text).join('').length < 2 && text.trim().split(/\s+/).length < 2) {
          return reask(P.pickRetry, numbered(list.map((c) => c.label)));
        }
      }
      const actions = needActions(env);
      const all = await actions.listCases();
      const pool = all.filter((c) => {
        if (opts.scope === 'open') return garageListBucket(c.case_data, c.status) !== 'closed';
        if (opts.scope === 'notClosed') return !c.case_data?.caseClosed;
        return true;
      });
      const found = matchCases(pool, text);
      d.candidates = undefined;
      if (!found.length) return reask(P.caseNotFound);
      if (found.length > 6) return reask(P.tooMany, `נמצאו ${found.length} תיקים.`);
      if (found.length === 1) {
        // a single match is taken directly; the confirmation summary still shows it before any write
        d.caseId = found[0].id;
        d.caseNumber = found[0].case_number;
        d.caseLabel = caseLine(found[0]);
        const extra = opts.onSelected ? await opts.onSelected(s, env) : null;
        return extra || next(`נמצא התיק: ${d.caseLabel}`);
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

function confirmStep(summary: (d: VoiceData) => string, run: (s: VoiceSession, env: VoiceEnv) => Promise<Outcome>, applies?: Step['applies'], say: string = DALIA_SAFE_ALTERNATIVES.confirm): Step {
  return {
    id: 'confirm',
    applies,
    done: () => false,
    ask: (d) => ({ say, display: summary(d), confirm: true }),
    answer: (text, s, env) => confirmAnswer(text, () => run(s, env)),
    clear: () => {},
  };
}

// -----------------------------------------------------------------------------
// Workflow: new customer
// -----------------------------------------------------------------------------

function plateStep(say: string, opts: { allowNone?: boolean; applies?: Step['applies']; onPlate?: (s: VoiceSession, env: VoiceEnv) => Promise<Outcome | null> } = {}): Step {
  return {
    id: 'plate',
    slots: /מספר( ה)?רכב|לוחית|רישוי/,
    applies: opts.applies,
    done: (d) => !!d.plate || !!d.noVehicle,
    ask: () => ({ say, display: opts.allowNone ? 'אם אין רכב, אפשר לומר "בלי רכב".' : undefined }),
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
      d.plateChecked = undefined;
      d.vehicleId = undefined;
      d.vehicleLabel = undefined;
      if (!d.caseFromContext) {
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
    d.customerType ? `סוג: ${d.customerType === 'business' ? 'חברה' : 'פרטי'}` : '',
    d.companyName ? `חברה: ${d.companyName}` : '',
  ].filter(Boolean);
}
function vehicleSummary(d: VoiceData): string[] {
  if (d.noVehicle) return ['רכב: ללא — יישמר כרטיס לקוח בלבד'];
  return [
    d.vehicleLabel ? `רכב: ${d.vehicleLabel}` : d.plate ? `רכב: ${d.plate}` : '',
    !d.vehicleLabel && (d.make || d.model) ? `דגם: ${[d.make, d.model].filter(Boolean).join(' ')}` : '',
    d.arrivedNow !== undefined ? `הרכב במוסך עכשיו: ${d.arrivedNow ? 'כן' : 'לא'}` : '',
    d.complaint !== undefined ? `תלונה: ${d.complaint || 'לא צוינה'}` : '',
  ].filter(Boolean);
}

async function ensureCustomer(s: VoiceSession, env: VoiceEnv): Promise<{ customer: GarageCustomer; note: string }> {
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
    company_name: d.companyName || '',
    phone: d.customerPhone || '',
  });
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
      throw new Error(`מספר הרכב ${plate} כבר רשום אצל לקוח אחר במוסך. התיק לא נפתח.`);
    }
    return existing;
  }
  return a.createVehicle({ customer_id: customer.id, plate, make: d.make || '', model: d.model || '' });
}

function newCaseData(env: VoiceEnv, d: VoiceData, route: 'quote_first' | 'intake_first', extra: GarageCaseData = {}): GarageCaseData {
  const complaint = d.complaint ? ` תלונת לקוח: ${d.complaint}` : '';
  return {
    route,
    ...extra,
    timeline: [timelineEntry(env, `התיק נפתח בשיחה קולית עם דליה AI.${complaint}`)],
  };
}

function newCustomerFlow(): Step[] {
  const hasVehicle = (d: VoiceData) => !d.noVehicle;
  return [
    nameStep('name', () => P.newCustomerName),
    phoneStep(),
    ...customerTypeSteps(),
    plateStep(P.plate, { allowNone: true }),
    modelStep(hasVehicle),
    yesNoStep('arrivedNow', P.arrivedNow, 'arrivedNow', /הגיע|נמצא במוסך/, hasVehicle),
    complaintStep(P.complaint, hasVehicle),
    confirmStep(
      (d) => ['סיכום לקוח חדש:', ...customerSummary(d), ...vehicleSummary(d)].join('\n'),
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        const { customer, note } = await ensureCustomer(s, env);
        if (d.noVehicle) {
          return finish(P.customerOnlyCreated, 'executed', { display: join(`נשמר כרטיס לקוח: ${customerLine(customer)}`, note) });
        }
        const vehicle = await ensureVehicle(s, env, customer);
        const created = await a.createCase({
          customer,
          vehicle,
          caseData: newCaseData(env, d, d.arrivedNow ? 'intake_first' : 'quote_first'),
        });
        return finish(P.customerAndCaseCreated, 'executed', {
          display: join(`נפתח תיק ${created.case_number || ''} עבור ${customerDisplayName(customer)}, רכב ${vehicle.plate}.`, note),
          openCaseId: created.id,
        });
      },
    ),
  ];
}

// -----------------------------------------------------------------------------
// Workflow: existing customer
// -----------------------------------------------------------------------------

function existingCustomerFlow(): Step[] {
  const newCase = (d: VoiceData) => d.customerAction === 'new_case';
  return [
    customerSearchStep(),
    {
      id: 'customerAction',
      done: (d) => !!d.customerAction,
      ask: (d) => ({ say: P.customerAction, display: d.customerLabel }),
      answer: async (text, s, env) => {
        const d = s.data;
        const a = needActions(env);
        if (/חדש|לפתוח תיק עבודה|פתחי תיק|תיק עבודה חדש/.test(text) && !/קיים/.test(text)) {
          d.customerAction = 'new_case';
          const vehicles = await a.listVehicles(d.customerId!);
          d.candidateKind = 'vehicle';
          d.candidates = vehicles.map((v) => ({ id: v.id, label: vehicleLine(v) }));
          return next();
        }
        if (/קיים|פתוח|ישן|להציג|לראות|אחרון/.test(text)) {
          const cases = (await a.listCustomerCases(d.customerId!)).filter((c) => garageListBucket(c.case_data, c.status) !== 'closed');
          if (!cases.length) {
            d.noOpenCases = true;
            return reask(P.noOpenCasesNew);
          }
          if (cases.length === 1) {
            return finish(P.openingCase, 'info', { display: caseLine(cases[0]), openCaseId: cases[0].id });
          }
          d.customerAction = 'open_case';
          d.candidateKind = 'case';
          d.candidates = cases.slice(0, 6).map((c) => ({ id: c.id, label: caseLine(c) }));
          return next();
        }
        if (d.noOpenCases) {
          const yn = parseYesNo(text);
          if (yn === 'yes') {
            d.noOpenCases = false;
            d.customerAction = 'new_case';
            const vehicles = await a.listVehicles(d.customerId!);
            d.candidateKind = 'vehicle';
            d.candidates = vehicles.map((v) => ({ id: v.id, label: vehicleLine(v) }));
            return next();
          }
          if (yn === 'no') return finish(P.okNotOpening, 'info');
        }
        return reask(P.customerActionRetry);
      },
      clear: (d) => { d.customerAction = undefined; d.noOpenCases = undefined; d.candidates = undefined; d.candidateKind = undefined; },
    },
    {
      id: 'pickOpenCase',
      applies: (d) => d.customerAction === 'open_case',
      done: () => false,
      ask: (d) => ({ say: P.casesMany, display: numbered((d.candidates || []).map((c) => c.label)) }),
      answer: (text, s) => {
        const list = s.data.candidates || [];
        const idx = pickFromList(text, list.map((c, i) => `${i + 1}. ${c.label}`));
        if (idx === null) return reask(P.pickRetry, numbered(list.map((c) => c.label)));
        return finish(P.openingCase, 'info', { display: list[idx].label, openCaseId: list[idx].id });
      },
      clear: () => {},
    },
    {
      id: 'vehicle',
      slots: /מספר( ה)?רכב|לוחית/,
      applies: newCase,
      done: (d) => !!d.vehicleId || !!d.plate,
      ask: (d) => {
        const list = d.candidateKind === 'vehicle' ? d.candidates || [] : [];
        if (!list.length) return { say: P.vehicleNewPlate };
        if (list.length === 1) return { say: P.vehicleOne, display: list[0].label };
        return { say: P.vehicleMany, display: numbered(list.map((c) => c.label)) };
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
          return reask(P.yesNoRetry);
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
    complaintStep(P.complaint, newCase),
    yesNoStep('arrivedNow', P.arrivedNow, 'arrivedNow', /הגיע|נמצא במוסך/, newCase),
    confirmStep(
      (d) => ['סיכום תיק עבודה חדש:', ...customerSummary(d), ...vehicleSummary(d)].join('\n'),
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        const { customer } = await ensureCustomer(s, env);
        const vehicle = await ensureVehicle(s, env, customer);
        const created = await a.createCase({
          customer,
          vehicle,
          caseData: newCaseData(env, d, d.arrivedNow ? 'intake_first' : 'quote_first'),
        });
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
// Workflow: vehicle intake
// -----------------------------------------------------------------------------

function intakeFlow(): Step[] {
  const newOwner = (d: VoiceData) => !d.vehicleKnown && !d.caseFromContext;
  const lookup = async (s: VoiceSession, env: VoiceEnv): Promise<Outcome | null> => {
    const a = needActions(env);
    const d = s.data;
    const vehicle = await a.findVehicleByPlate(d.plate!);
    d.plateChecked = true;
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
    const open = (await a.listCustomerCases(vehicle.customer_id))
      .filter((c) => c.vehicle_id === vehicle.id && garageListBucket(c.case_data, c.status) !== 'closed');
    if (open.length) {
      d.caseId = open[0].id;
      d.caseNumber = open[0].case_number;
      d.caseLabel = caseLine(open[0]);
    }
    return next(join(
      `הרכב נמצא: ${d.vehicleLabel}${d.customerLabel ? ` · ${d.customerLabel}` : ''}`,
      open.length ? `פרטי הקבלה יישמרו בתיק הפתוח ${open[0].case_number || ''}.` : 'ייפתח תיק עבודה חדש לרכב.',
    ));
  };
  return [
    plateStep(P.intakePlate, { applies: (d) => !d.caseFromContext, onPlate: lookup }),
    nameStep('name', () => P.vehicleNotFoundName, newOwner),
    phoneStep(newOwner),
    ...customerTypeSteps(newOwner),
    modelStep(newOwner),
    complaintStep(P.intakeComplaint),
    {
      id: 'km',
      slots: /קילומטר|ק"מ|ק״מ|מד אוץ/,
      done: (d) => d.km !== undefined,
      ask: () => ({ say: P.km }),
      answer: (text, s) => {
        if (/לא יודע|לא ידוע|לא בדקתי/.test(text)) {
          s.data.km = '';
          return next();
        }
        const n = parseHebrewNumber(text);
        if (n === null || n < 0 || n > 3_000_000) return reask(P.kmRetry);
        s.data.km = String(Math.round(n));
        return next();
      },
      clear: (d) => { d.km = undefined; },
    },
    {
      id: 'fuel',
      slots: /דלק/,
      done: (d) => d.fuel !== undefined,
      ask: () => ({ say: P.fuel }),
      answer: (text, s) => {
        const f = parseFuel(text);
        if (!f) return reask(P.fuelRetry);
        s.data.fuel = f;
        return next();
      },
      clear: (d) => { d.fuel = undefined; },
    },
    {
      id: 'keys',
      slots: /מפתח/,
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
    detailStep('lights', P.lights, P.lightsWhich, /נור/),
    detailStep('items', P.items, P.itemsWhich, /חפצ/),
    confirmStep(
      (d) => [
        'סיכום קבלת רכב:',
        d.caseLabel ? `תיק קיים: ${d.caseLabel}` : 'תיק: חדש',
        ...customerSummary(d),
        ...vehicleSummary(d),
        `ק"מ: ${d.km || 'לא צוין'}`,
        `דלק: ${d.fuel || 'לא צוין'}`,
        `מפתחות: ${d.keys ?? 'לא צוין'}`,
        `נורות אזהרה: ${d.lights || 'לא צוין'}`,
        `חפצים ברכב: ${d.items || 'לא צוין'}`,
        'תמונות הקבלה (5 חובה) והחתימה נעשות במסך התיק.',
      ].join('\n'),
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        const intake: GarageCaseData = {
          intakeKm: d.km || '',
          intakeFuel: d.fuel || '',
          intakeKeys: d.keys || '',
          intakeLights: d.lights && d.lights !== 'אין' ? d.lights : '',
          intakeItems: d.items && d.items !== 'אין' ? d.items : '',
        };
        const note = `פרטי קבלת רכב נרשמו בשיחה קולית עם דליה AI.${d.complaint ? ` סיבת כניסה: ${d.complaint}` : ''}`;
        if (d.caseId) {
          const current = await a.getCase(d.caseId);
          if (!current) throw new Error('התיק לא נמצא');
          const timeline = [...(current.case_data.timeline || []), timelineEntry(env, note)];
          await a.saveCaseData(d.caseId, { ...intake, timeline });
          return finish(P.intakeSaved, 'executed', { display: `נשמרו פרטי הקבלה בתיק ${current.case_number || ''}.`, openCaseId: d.caseId });
        }
        const { customer, note: dupNote } = await ensureCustomer(s, env);
        const vehicle = await ensureVehicle(s, env, customer);
        const created = await a.createCase({
          customer,
          vehicle,
          caseData: { ...newCaseData(env, d, 'intake_first', intake), flowStage: 'intake' },
        });
        return finish(P.intakeSaved, 'executed', {
          display: join(`נפתח תיק ${created.case_number || ''} לרכב ${vehicle.plate} ונשמרו פרטי הקבלה.`, dupNote),
          openCaseId: created.id,
        });
      },
    ),
  ];
}

// -----------------------------------------------------------------------------
// Workflow: quote, add work/part, supplement
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
      if (d.pending?.kind === kind) return { say: priceSay, display: d.pending.line.name };
      const list = d[listKey] || [];
      if (list.length) return { say: moreSay, display: list.map(lineText).join('\n') };
      return { say: firstSay(s) };
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
        return reask(priceSay, line.name);
      }
      return push(line);
    },
    // "back" inside a list removes the last line
    clear: (d) => {
      d.pending = undefined;
      const list = d[listKey];
      if (list?.length) list.pop();
      d[doneKey] = false;
    },
  };
}

function caseFromContextOnSelect(): Step['applies'] {
  return (d) => !d.caseFromContext;
}

function quoteFlow(type: VoiceWorkflowType): Step[] {
  const isQuote = (d: VoiceData) => d.scope === 'quote';
  const isSupp = (d: VoiceData) => d.scope === 'supplement';
  const linesEmpty = (d: VoiceData) => !(d.works?.length || d.parts?.length);
  return [
    caseSearchStep({ askSay: P.quoteCase, scope: 'open', applies: caseFromContextOnSelect() }),
    {
      id: 'scope',
      applies: () => type === 'quote',
      done: (d) => !!d.scope,
      ask: () => ({ say: P.quoteScope }),
      answer: (text, s) => {
        if (/תוספת|גילוי|התגלה|גילינו/.test(text)) s.data.scope = 'supplement';
        else if (/הצעה|עבוד|חלק|מחיר/.test(text)) s.data.scope = 'quote';
        else return reask(P.quoteScopeRetry);
        return next();
      },
      clear: (d) => { d.scope = undefined; },
    },
    lineLoopStep('work', () => (type === 'context_quote_add_work' ? P.addWork : P.works), (d) => isQuote(d) && type !== 'context_quote_add_part', type === 'context_quote_add_work'),
    lineLoopStep('part', () => (type === 'context_quote_add_part' ? P.addPart : P.parts), (d) => isQuote(d) && type !== 'context_quote_add_work', type === 'context_quote_add_part'),
    {
      id: 'emptyQuote',
      applies: (d) => isQuote(d) && linesEmpty(d),
      done: () => false,
      ask: () => ({ say: P.emptyQuote }),
      answer: (text, s) => {
        const line = parseSpokenLine(text);
        if (!line) return reask(P.emptyQuote);
        const d = s.data;
        if (type === 'context_quote_add_part') {
          d.parts = [line];
        } else {
          d.works = [line];
        }
        if (line.price === null && !isNoPriceAnswer(text)) {
          d.pending = { kind: type === 'context_quote_add_part' ? 'part' : 'work', line };
          (type === 'context_quote_add_part' ? d.parts! : d.works!).pop();
          if (type === 'context_quote_add_part') d.partsDone = false;
          else d.worksDone = false;
        }
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
      id: 'extraPrice',
      slots: /מחיר|סכום/,
      applies: isSupp,
      done: (d) => d.extraPrice !== undefined,
      ask: () => ({ say: P.supplementPrice }),
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
      ask: () => ({ say: P.supplementStatus }),
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
            `תיאור: ${d.extraText}`,
            `מחיר: ${d.extraPrice == null ? 'ללא מחיר' : money(d.extraPrice)}`,
            'תירשם כרישום פנימי שממתין לאישור הלקוח. אישור הלקוח נעשה במסך התיק.',
            d.extraCustomerSaid === 'approved' ? 'צוין שהלקוח אישר בעל-פה — יירשם כהערה.' : '',
          ].filter(Boolean).join('\n');
        }
        const t = quoteTotals(d);
        return [
          'סיכום הצעת מחיר:',
          d.caseLabel ? `תיק: ${d.caseLabel}` : '',
          d.works?.length ? `עבודות:\n${d.works.map(lineText).join('\n')}` : '',
          d.parts?.length ? `חלקים:\n${d.parts.map(lineText).join('\n')}` : '',
          `סה"כ לפני מע"מ: ${money(t.net)}`,
          `מע"מ 18%: ${money(t.vat)}`,
          `סה"כ כולל מע"מ: ${money(t.gross)}`,
          t.unpriced ? `${t.unpriced} פריטים ללא מחיר — יש להשלים במסך התיק.` : '',
          'המחירים נרשמו לפני מע"מ. ההצעה לא נשלחת ללקוח מכאן.',
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
          const item = {
            id: `x${stamp}`,
            text: d.extraText || '',
            works: '',
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
            timeline: [...(cd.timeline || []), timelineEntry(env, `נרשם בדיבור גילוי פנימי של תוספת עבודה: ${d.extraText}${d.extraPrice ? ` בסך ${money(d.extraPrice)}` : ''} — ממתין לאישור לקוח`)],
          });
          return finish(P.supplementSaved, 'executed', { display: `התוספת נרשמה בתיק ${current.case_number || ''}.`, openCaseId: d.caseId });
        }
        const works = (d.works || []).map((l, i) => ({
          id: `w${stamp}${i}`,
          part: l.name,
          type: 'עבודה',
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
      (d) => isSupp(d) || (isQuote(d) && !linesEmpty(d)),
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
    caseSearchStep({ askSay: P.quoteCase, scope: 'open', applies: caseFromContextOnSelect() }),
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
      ask: () => ({ say: P.paymentMethod }),
      answer: (text, s) => {
        const m = parsePaymentMethod(text);
        if (!m) return reask(P.paymentMethod);
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
// Workflow: close case / find case
// -----------------------------------------------------------------------------

/** The garage screen's own close rules (closeCaseGaps). Returns a finished turn when the case cannot be closed. */
async function checkCloseGaps(s: VoiceSession, env: VoiceEnv): Promise<Outcome | null> {
  const c = await needActions(env).getCase(s.data.caseId!);
  if (!c) return failed(new Error('התיק לא נמצא'));
  s.data.caseNumber = c.case_number;
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

function closeCaseFlow(): Step[] {
  const checkGaps = checkCloseGaps;
  return [
    caseSearchStep({ askSay: P.closeQuery, scope: 'notClosed', applies: caseFromContextOnSelect(), onSelected: checkGaps }),
    confirmStep(
      (d) => [`סגירת תיק: ${d.caseLabel || d.caseNumber || ''}`, 'אחרי הסגירה התיק עובר לארכיון.'].join('\n'),
      async (s, env) => {
        const a = needActions(env);
        const blocked = await checkGaps(s, env);
        if (blocked) return blocked;
        await a.closeCase(s.data.caseId!, 'נסגר בשיחה קולית עם דליה AI');
        return finish(P.caseClosed, 'executed', { display: `תיק ${s.data.caseNumber || ''} נסגר.`, openCaseId: s.data.caseId });
      },
      undefined,
      P.closeConfirm,
    ),
  ];
}

function findCaseFlow(): Step[] {
  return [
    caseSearchStep({ askSay: P.findQuery, scope: 'any' }),
    {
      id: 'openAsk',
      done: () => false,
      ask: (d) => ({ say: P.caseFoundOpen, display: d.caseLabel }),
      answer: (text, s) => {
        const yn = parseYesNo(text);
        if (yn === 'yes') return finish(P.openingCase, 'info', { display: s.data.caseLabel, openCaseId: s.data.caseId });
        if (yn === 'no') return finish(P.okNotOpening, 'info', { display: s.data.caseLabel });
        return reask(P.yesNoRetry);
      },
      clear: () => {},
    },
  ];
}

// -----------------------------------------------------------------------------
// Workflow: invoices & credits (read-only)
// -----------------------------------------------------------------------------

function invoicesFlow(): Step[] {
  const caseDraft = async (s: VoiceSession, env: VoiceEnv): Promise<Outcome> => {
    const c = await needActions(env).getCase(s.data.caseId!);
    if (!c) return failed(new Error('התיק לא נמצא'));
    const cd = c.case_data as Record<string, unknown>;
    const total = caseTotalPayable(cd);
    const paid = casePaid(cd);
    const works = (c.case_data.quoteWorks || []).map((w) => `${w.part || w.desc || 'עבודה'} × ${w.qty || 1} — ${money((Number(w.price) || 0) * (Number(w.qty) || 1))}`);
    const parts = (c.case_data.quoteParts || []).filter((p) => p.supplier !== 'customer').map((p) => `${p.name || 'חלק'} × ${p.qty || 1} — ${money((Number(p.price) || 0) * (Number(p.qty) || 1))}`);
    return finish(P.invoiceDraftShown, 'info', {
      display: [
        `טיוטת נתוני חשבונית — תיק ${c.case_number || ''}`,
        `לקוח: ${c.customer_name_snapshot || ''} · רכב ${c.vehicle_plate_snapshot || ''}`,
        ...(works.length ? ['עבודות:', ...works] : []),
        ...(parts.length ? ['חלקים:', ...parts] : []),
        `סה"כ לתשלום: ${total ? money(total) : 'לא נקבע'}`,
        `שולם: ${money(paid)} · יתרה: ${money(Math.max(0, total - paid))}`,
        'שים לב: לא מחובר ספק חשבוניות חיצוני — זו טיוטת נתונים בלבד ולא חשבונית חוקית.',
      ].join('\n'),
    });
  };
  return [
    {
      id: 'subType',
      done: (d) => !!d.subType,
      ask: () => ({ say: P.invoicesSub }),
      answer: (text, s) => {
        if (/זיכוי|זיכויים|החזר/.test(text)) s.data.subType = 'credit';
        else if (/להכין|הכנת|נתוני|טיוטה|ללקוח/.test(text)) s.data.subType = 'prepare';
        else if (/לבדוק|בדיקת|בדיקה|חשבונית/.test(text)) s.data.subType = 'check';
        else return reask(P.invoicesSubRetry);
        return next();
      },
      clear: (d) => { d.subType = undefined; },
    },
    {
      id: 'invoiceLookup',
      applies: (d) => d.subType === 'check' || d.subType === 'credit',
      done: () => false,
      ask: () => ({ say: P.invoiceQuery }),
      answer: async (text, s, env) => {
        const invoices = await needActions(env).listInvoices();
        const digits = digitRuns(text).join('');
        const words = (extractName(text) || '').split(/\s+/).filter((w) => w.length >= 2 && !/^(חשבונית|מספר|רכב|של)$/.test(w));
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
        const header = s.data.subType === 'credit' ? 'מצב זיכוי לפי החשבונית:' : '';
        if (found.length === 1) return finish(P.invoiceFound, 'info', { display: join(header, lines[0]) });
        return finish(P.invoicesFound, 'info', { display: join(header, numbered(lines)) });
      },
      clear: () => {},
    },
    caseSearchStep({
      askSay: P.invoiceDraftQuery,
      scope: 'any',
      applies: (d) => d.subType === 'prepare' && !d.caseFromContext,
      onSelected: caseDraft,
    }),
    {
      id: 'draftFromContext',
      applies: (d) => d.subType === 'prepare' && !!d.caseFromContext,
      done: () => false,
      ask: () => ({ say: P.invoiceDraftQuery }),
      answer: (_t, s, env) => caseDraft(s, env),
      clear: () => {},
    },
  ];
}

// -----------------------------------------------------------------------------
// Workflow: suppliers & general expenses
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

function expensesFlow(): Step[] {
  const purchase = (d: VoiceData) => d.subType === 'purchase';
  return [
    {
      id: 'subType',
      done: (d) => !!d.subType,
      ask: () => ({ say: P.expensesSub }),
      answer: (text, s) => {
        if (/חוב|חייבים|יתרה|לשלם לספק/.test(text)) s.data.subType = 'debt';
        else if (/רכישה|רכישת|לרשום|קנינו|חשבונית|קנייה/.test(text)) s.data.subType = 'purchase';
        else if (/לחפש|חיפוש|ספק|פרטי/.test(text)) s.data.subType = 'search';
        else return reask(P.expensesSubRetry);
        return next();
      },
      clear: (d) => { d.subType = undefined; },
    },
    {
      id: 'supplier',
      slots: /ספק/,
      done: (d) => !!d.supplierId,
      ask: (d) => {
        if (d.supplierToCreate) return { say: P.supplierNotFoundCreate, display: `ספק חדש: ${d.supplierToCreate}` };
        if (d.candidateKind === 'supplier' && d.candidates?.length) {
          return d.candidates.length === 1
            ? { say: P.supplierOne, display: d.candidates[0].label }
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
          if (yn !== 'yes') return reask(P.yesNoRetry);
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
        const all = await a.listSuppliers();
        const found = all.filter((sup) => words.length > 0 && words.every((w) => (sup.name || '').includes(w)));
        d.candidates = undefined;
        if (!found.length) {
          if (!words.length) return reask(P.supplierName);
          d.supplierToCreate = name;
          return reask(P.supplierNotFoundCreate, `ספק חדש: ${name}`);
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
    {
      id: 'invoiceNumber',
      slots: /מספר( ה)?חשבונית/,
      applies: purchase,
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
      id: 'invoiceTotal',
      slots: /סכום|סה"כ|סך/,
      applies: purchase,
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
    caseSearchStep({ askSay: P.purchaseCase, scope: 'any', applies: purchase, optional: true }),
    confirmStep(
      (d) => {
        const subtotal = Math.round((d.invoiceTotal || 0) / 1.18);
        return [
          'סיכום רישום חשבונית ספק:',
          `ספק: ${d.supplierLabel || d.supplierName}`,
          `מספר חשבונית: ${d.invoiceNumber}`,
          `סה"כ כולל מע"מ: ${money(d.invoiceTotal || 0)} (לפני מע"מ ${money(subtotal)})`,
          d.caseLabel ? `שייך לתיק: ${d.caseLabel}` : 'לא שויך לתיק',
        ].join('\n');
      },
      async (s, env) => {
        const a = needActions(env);
        const d = s.data;
        let caseNumber: string | undefined;
        let plate: string | undefined;
        if (d.caseId) {
          const c = await a.getCase(d.caseId);
          caseNumber = c?.case_number;
          plate = c?.vehicle_plate_snapshot;
        }
        const invoice = await a.createInvoice({
          invoice_type: 'parts_invoice',
          expense_category: 'parts',
          invoice_number: d.invoiceNumber,
          supplier_id: d.supplierId,
          supplier_name: d.supplierName,
          total_amount: d.invoiceTotal,
          case_id: d.caseId || null,
          case_number: caseNumber || null,
          vehicle_plate: plate || null,
          accounting_notes: 'נרשם בשיחה קולית עם דליה AI',
        });
        return finish(P.invoiceSaved, 'executed', { display: `נרשמה חשבונית ${invoice.invoice_number} של ${invoice.supplier_name} על ${money(Number(invoice.total_amount) || 0)}.` });
      },
      purchase,
    ),
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
    default: return [];
  }
}

function currentStep(s: VoiceSession): Step | undefined {
  return flowFor(s.type).find((st) => (st.applies ? st.applies(s.data, s) : true) && !st.done(s.data));
}

function askTurn(ask: Ask, display?: string): VoiceTurn {
  return {
    say: ask.say,
    display: join(display, ask.display),
    expectsAnswer: true,
    isConfirmation: !!ask.confirm,
    done: false,
  };
}

function advance(s: VoiceSession, display?: string): VoiceTurn {
  const step = currentStep(s);
  if (!step) return { say: P.okNotOpening, display, expectsAnswer: false, done: true, outcome: 'info' };
  s.current = step.id;
  return askTurn(step.ask(s.data, s), display);
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

const WORKFLOWS_WITHOUT_CASE_CONTEXT: VoiceWorkflowType[] = ['new_customer', 'existing_customer', 'find_case', 'general_expenses'];

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
    d.works?.length ? `עבודות: ${d.works.map(lineText).join('; ')}` : '',
    d.parts?.length ? `חלקים: ${d.parts.map(lineText).join('; ')}` : '',
    d.extraText ? `תוספת: ${d.extraText}` : '',
    d.payAmount ? `תשלום: ${money(d.payAmount)} ${d.payMethod?.label || ''}` : '',
    d.supplierLabel ? `ספק: ${d.supplierLabel}` : '',
    d.invoiceNumber ? `חשבונית: ${d.invoiceNumber}` : '',
  ].filter(Boolean);
  return lines.length > 1 ? lines.join('\n') : `${lines[0]}\nעדיין לא נרשמו פרטים.`;
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
  const t = text.trim().replace(/[.!?,]+$/g, '');
  const words = t.split(/\s+/).length;
  if (/(תחזרי|חזרי|תגידי|תגיד) (שוב )?(על )?(ה)?שאלה|לא שמעתי|מה שאלת|מה השאלה|^שוב$|^עוד פעם$/.test(t)) return 'repeat';
  if (/^(מה רשמת|מה רשמנו|מה יש עד עכשיו|תסכמי|סיכום עד עכשיו|מה כבר רשמת)/.test(t)) return 'summary';
  if (/^(עזרה|מה אפשר לומר|מה אפשר להגיד)/.test(t)) return 'help';
  const correction = t.match(/^(?:לא[, ]+)?(?:תקני|תקן|לתקן|תיקון|תשני|לשנות|טעות ב|טעיתי ב)\s*(?:את\s+)?(.+)$/);
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
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(s));
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

/** Starts one of the workflows. */
export async function startVoiceWorkflow(type: VoiceWorkflowType, ctx: VoiceContext, env: VoiceEnv): Promise<VoiceResult> {
  if (type === 'resume_action') {
    const saved = loadVoiceSession(env.now?.());
    if (!saved) return { session: null, turn: { say: P.resumeNone, expectsAnswer: false, done: true, outcome: 'info' } };
    const s = newSession('resume_action', {}, env);
    s.data.resumeOf = saved;
    s.current = 'resume';
    return {
      session: s,
      turn: { say: P.resumeAsk, display: recap(saved), expectsAnswer: true, isConfirmation: false, done: false },
    };
  }
  if (!env.actions) return { session: null, turn: { say: P.noActions, expectsAnswer: false, done: true, outcome: 'failed' } };
  const s = newSession(type, WORKFLOWS_WITHOUT_CASE_CONTEXT.includes(type) ? {} : ctx, env);
  if (type === 'close_case' && s.data.caseId) {
    // closing the open case: tell what is missing before asking anything
    const out = await runStepless(() => checkCloseGaps(s, env));
    if (out) return applyOutcomeAtStart(s, out);
  }
  return { session: s, turn: advance(s) };
}

/** Processes one spoken (or typed) answer. */
export async function answerVoiceWorkflow(s: VoiceSession, text: string, env: VoiceEnv): Promise<VoiceResult> {
  const answer = String(text || '').trim();
  touch(s, env);

  if (s.type === 'resume_action') {
    const saved = s.data.resumeOf;
    const yn = parseYesNo(answer);
    if (!saved || yn === 'no' || detectCommand(answer) === 'cancel') {
      return { session: null, turn: { say: P.resumeDeclined, expectsAnswer: false, done: true, outcome: 'cancelled' } };
    }
    if (yn !== 'yes') return { session: s, turn: askTurn({ say: P.yesNoRetry }) };
    touch(saved, env);
    return { session: saved, turn: advance(saved, recap(saved)) };
  }

  const step = currentStep(s);
  if (!step) return { session: null, turn: { say: P.okNotOpening, expectsAnswer: false, done: true, outcome: 'info' } };

  const cmd = detectCommand(answer);
  if (cmd === 'cancel') return { session: null, turn: { say: P.cancelled, expectsAnswer: false, done: true, outcome: 'cancelled' } };
  if (cmd === 'pause') return { session: s, turn: { say: P.paused, display: recap(s), expectsAnswer: false, done: true, outcome: 'paused', keepForResume: true } };
  if (cmd === 'repeat') return { session: s, turn: askTurn(step.ask(s.data, s)) };
  if (cmd === 'summary') return { session: s, turn: askTurn(step.ask(s.data, s), recap(s)) };
  if (cmd === 'help') return { session: s, turn: askTurn(step.ask(s.data, s), HELP_TEXT) };
  if (cmd === 'back') {
    const flow = flowFor(s.type);
    const prevId = s.filled.pop();
    const prev = prevId ? flow.find((st) => st.id === prevId) : undefined;
    if (prev) prev.clear(s.data);
    return { session: s, turn: advance(s, prev ? 'חזרנו לשאלה הקודמת.' : undefined) };
  }
  if (cmd && typeof cmd === 'object') {
    const flow = flowFor(s.type);
    const target = flow.find((st) => st.slots && st.slots.test(cmd.correct) && (st.applies ? st.applies(s.data, s) : true));
    if (target) {
      target.clear(s.data);
      s.filled = s.filled.filter((id) => id !== target.id);
      // "תקני את הטלפון ל-054…" — the new value may already be in the sentence
      const rest = cmd.correct.replace(target.slots!, ' ').replace(/^\s*(ל-?|ל |הוא|זה|שלו|שלה)\s*/, '').trim();
      if (rest && currentStep(s)?.id === target.id) {
        const out = await runStep(target, rest, s, env);
        if (out.kind === 'next') return { session: s, turn: advance(s, join('עודכן.', out.display)) };
      }
      return { session: s, turn: advance(s, 'בוא נתקן.') };
    }
    return { session: s, turn: askTurn(step.ask(s.data, s), join('לא הבנתי איזה פרט לתקן.', HELP_TEXT)) };
  }

  const out = await runStep(step, answer, s, env);
  return applyOutcome(s, step, out, env);
}

async function runStepless(fn: () => Promise<Outcome | null>): Promise<Outcome | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NoActionsError) return finish(P.noActions, 'failed');
    return failed(e, 'החיפוש במערכת נכשל');
  }
}

function applyOutcomeAtStart(s: VoiceSession, out: Outcome): VoiceResult {
  if (out.kind === 'finish') return { session: out.turn.keepForResume ? s : null, turn: out.turn };
  return { session: s, turn: advance(s, out.kind === 'next' || out.kind === 'reask' ? out.display : undefined) };
}

async function runStep(step: Step, text: string, s: VoiceSession, env: VoiceEnv): Promise<Outcome> {
  try {
    return await step.answer(text, s, env);
  } catch (e) {
    if (e instanceof NoActionsError) return finish(P.noActions, 'failed');
    return failed(e, 'החיפוש במערכת נכשל');
  }
}

function applyOutcome(s: VoiceSession, step: Step, out: Outcome, env: VoiceEnv): VoiceResult {
  switch (out.kind) {
    case 'next':
      if (!s.filled.includes(step.id) || step.id === 'works' || step.id === 'parts') s.filled.push(step.id);
      return { session: s, turn: advance(s, out.display) };
    case 'reask':
      s.current = step.id;
      return { session: s, turn: askTurn(out.ask, out.display) };
    case 'finish':
      return { session: out.turn.keepForResume ? s : null, turn: out.turn };
    case 'switch': {
      const ns = newSession(out.type, {}, env);
      Object.assign(ns.data, out.data || {});
      return { session: ns, turn: advance(ns) };
    }
  }
}
