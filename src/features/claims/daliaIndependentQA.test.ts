// Dalia AI — INDEPENDENT QA suite (second pass, written separately from daliaScenarios.test.ts).
// Same engine entry points the window uses, an isolated in-memory garage with FAKE data only, but different
// phrasing: speech-recognition style text (no punctuation, numbers in words, colloquial verbs, masculine and
// feminine imperatives), full end-to-end flows (customer → vehicle → case, quote → pending → approved → intake),
// robustness (empty, noise, repeats) and "nothing written before approval".
// Report: docs/dalia-scorecard/independent-qa.{md,json}
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import fs from 'node:fs';
import path from 'node:path';
import { DALIA_VOICE_PROMPTS as P, isFixedDaliaPrompt } from '../../../supabase/functions/_shared/daliaVoicePrompts';
import {
  answerVoiceFile,
  answerVoiceWorkflow,
  startVoiceWorkflow,
  type VoiceEnv,
  type VoiceResult,
  type VoiceTurn,
  type VoiceWorkflowType,
} from './daliaVoiceEngine';
import { pickHebrewVoice } from './daliaSpeechController';
import { mergeRecognitionResults } from './daliaSpeechText';
import type { GarageCase, GarageCaseData, GarageCustomer, GarageVehicle, GarageVoiceActions } from '@/modules/garage-management/garageVoiceActions';
import type { QuoteDraft, QuoteDraftInput } from '@/modules/garage-management/garageQuoteDrafts';

const NOW = new Date('2026-10-24T12:00:00');
const ME = 'u-me';
const OTHER = 'u-other';

function cust(id: string, name: string, phone: string, num: number, created: string, type: 'private' | 'business' = 'private'): GarageCustomer {
  return { id, customer_number: num, customer_type: type, name, company_name: type === 'business' ? name : '', phone, second_phone: '', email: '', address: '', business_id: '', contact_person: '', preferred_channel: '', notes: '', created_at: created } as GarageCustomer;
}
function veh(id: string, customerId: string, plate: string, make: string, model: string): GarageVehicle {
  return { id, customer_id: customerId, plate, make, model, year: 2019, color: '', vin: '', vehicle_type: '', internal_number: '', notes: '' } as GarageVehicle;
}

class Garage implements GarageVoiceActions {
  actorName = '';
  actorRole = 'fleet_manager';
  actorId = ME;
  writes: string[] = [];
  customers: GarageCustomer[] = [];
  vehicles: GarageVehicle[] = [];
  cases: GarageCase[] = [];
  drafts: QuoteDraft[] = [];
  media: string[] = [];
  seq = 0;
  constructor() {
    const c1 = cust('c1', 'משה כהן', '052-1111111', 101, '2026-09-01T09:00:00Z');
    const c2 = cust('c2', 'דנה לוי', '054-2222222', 102, '2026-10-10T09:00:00Z');
    const c3 = cust('c3', 'אלדן תחבורה', '03-5551111', 103, '2026-08-01T09:00:00Z', 'business');
    this.customers.push(c1, c2, c3);
    const v1 = veh('v1', 'c1', '1234567', 'טויוטה', 'קורולה');
    const v2 = veh('v2', 'c2', '7654321', 'מאזדה', '3');
    const v3 = veh('v3', 'c3', '11-222-33', 'סקודה', 'אוקטביה');
    const v4 = veh('v4', 'c3', '22-333-44', 'פולקסווגן', 'קאדי');
    this.vehicles.push(v1, v2, v3, v4);
    const k = (id: string, num: string, c: GarageCustomer, v: GarageVehicle, by: string, created: string, data: GarageCaseData & Record<string, unknown>): GarageCase => ({
      id, case_number: num, customer_id: c.id, vehicle_id: v.id, status: 'בדיקת רכב', opened_by: by, opened_by_name: by === ME ? 'אני' : 'עובד אחר',
      customer_name_snapshot: c.name, vehicle_plate_snapshot: v.plate, vehicle_label_snapshot: `${v.make} ${v.model}`, case_data: data, created_at: created,
    });
    this.cases.push(
      k('k1', 'GM-2026-0041', c1, v1, OTHER, '2026-10-20T08:00:00Z', { quoteCreated: true, quoteWorks: [{ id: 'w1', part: 'בדיקה', qty: 1, price: 100 }], timeline: [] }),
      k('k2', 'GM-2026-0042', c2, v2, ME, '2026-10-05T08:00:00Z', {
        quoteCreated: true, quoteApproved: true, workOrderSaved: true, workOrderAmount: 1180, finalApprovedAmount: 1180, paymentStatus: 'paid', workFinished: true,
        caseClosed: true, caseClosedAt: '2026-10-22T14:00:00Z', payments: [{ amount: 1180, payment_date: '2026-10-22', created_at: '2026-10-22T14:00:00Z' }], timeline: [],
      }),
      k('k3', 'GM-2026-0129', c3, v3, ME, '2026-10-19T08:00:00Z', {
        quoteCreated: true, quoteApproved: true, workOrderSaved: true, workOrderAmount: 2000, workStarted: true, paymentStatus: 'pending',
        payments: [{ amount: 500, payment_date: '2026-10-21', created_at: '2026-10-21T09:00:00Z' }], timeline: [],
      }),
      k('k4', 'GM-2026-0130', c3, v4, OTHER, '2026-10-23T10:00:00Z', { quoteCreated: true, timeline: [] }),
    );
  }
  private id(p: string) { this.seq += 1; return `${p}-${this.seq}`; }
  async searchCustomers(q: string) {
    const digits = q.replace(/\D/g, '');
    return this.customers.filter((c) => (digits.length >= 5 ? c.phone.replace(/\D/g, '').includes(digits) : c.name.includes(q.trim())));
  }
  async getCustomer(id: string) { return this.customers.find((c) => c.id === id) || null; }
  async listVehicles(id: string) { return this.vehicles.filter((v) => v.customer_id === id); }
  async findVehicleByPlate(p: string) { return this.vehicles.find((v) => v.plate.replace(/\D/g, '') === p.replace(/\D/g, '')) || null; }
  async listCustomerCases(id: string) { return this.cases.filter((c) => c.customer_id === id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); }
  async listCases() { return [...this.cases]; }
  async searchCases(t: { plate?: string | null; numberDigits?: string | null; nameWords?: string[]; phone?: string | null }) {
    const owners = t.phone ? (await this.searchCustomers(t.phone)).map((c) => c.id) : [];
    return this.cases.filter((c) => (t.plate && c.vehicle_plate_snapshot.replace(/\D/g, '').includes(t.plate))
      || (t.numberDigits && c.case_number.includes(t.numberDigits))
      || ((t.nameWords || []).length > 0 && (t.nameWords || []).every((w) => c.customer_name_snapshot.includes(w)))
      || owners.includes(c.customer_id));
  }
  async listAllCases() { return [...this.cases]; }
  async getCase(id: string) { return this.cases.find((c) => c.id === id) || null; }
  async listCustomers() { return [...this.customers]; }
  async createCustomer(d: { customer_type: 'private' | 'business'; name: string; company_name: string; phone: string }, opts?: { force?: boolean }) {
    const dup = this.customers.filter((c) => d.phone && c.phone.replace(/\D/g, '') === d.phone.replace(/\D/g, ''));
    if (dup.length && !opts?.force) return { customer: dup[0], duplicates: dup };
    this.writes.push('createCustomer');
    const c = cust(this.id('cn'), d.name, d.phone, 200 + this.seq, NOW.toISOString(), d.customer_type);
    this.customers.push(c);
    return { customer: c, duplicates: [] };
  }
  async createVehicle(d: { customer_id: string; plate: string; make: string; model: string; year?: number | null }) {
    this.writes.push('createVehicle');
    const v = { ...veh(this.id('vn'), d.customer_id, d.plate, d.make, d.model), year: d.year ?? null };
    this.vehicles.push(v);
    return v;
  }
  async createCase(i: { customer: GarageCustomer; vehicle: GarageVehicle; caseData: GarageCaseData }) {
    this.writes.push('createCase');
    const c: GarageCase = { id: this.id('kn'), case_number: `GM-2026-0${900 + this.seq}`, customer_id: i.customer.id, vehicle_id: i.vehicle.id, status: 'בדיקת רכב', opened_by: ME, opened_by_name: 'אני', customer_name_snapshot: i.customer.name, vehicle_plate_snapshot: i.vehicle.plate, vehicle_label_snapshot: '', case_data: i.caseData, created_at: NOW.toISOString() };
    this.cases.unshift(c);
    return c;
  }
  async saveCaseData(id: string, d: GarageCaseData) { this.writes.push(`saveCaseData:${id}`); const c = this.cases.find((x) => x.id === id)!; c.case_data = { ...c.case_data, ...d }; return c; }
  async closeCase(id: string) { this.writes.push(`closeCase:${id}`); }
  async uploadCaseMedia(_caseId: string, category: string) { this.writes.push('upload'); this.media.push(category); }
  async updateCustomerContact(id: string) { this.writes.push('updateCustomerContact'); return this.customers.find((c) => c.id === id)!; }
  async updateCustomerDetails(id: string, patch: { phone?: string }) { this.writes.push(`updateCustomerDetails:${id}`); const c = this.customers.find((x) => x.id === id)!; Object.assign(c, patch); return c; }
  async listSuppliers() { return []; }
  async createSupplier(name: string) { this.writes.push('createSupplier'); return { supplier: { id: 's', name, supplier_number: 'S', phone: null } as never }; }
  async listInvoices() { return []; }
  async createInvoice() { this.writes.push('createInvoice'); return {} as never; }
  async saveQuoteDraft(input: QuoteDraftInput, existingId?: string) {
    this.writes.push(existingId ? 'updateDraft' : 'saveDraft');
    const now = NOW.toISOString();
    if (existingId) {
      const d = this.drafts.find((x) => x.id === existingId)!;
      Object.assign(d, input, { updated_at: now });
      return d;
    }
    const d = { ...(input as object), id: this.id('qd'), created_by_name: 'אני', created_at: now, updated_at: now, storage: 'system' } as QuoteDraft;
    this.drafts.push(d);
    return d;
  }
  async listQuoteDrafts() { return [...this.drafts]; }
  async updateQuoteDraft(id: string, patch: Partial<QuoteDraftInput>) { this.writes.push('updateDraft'); const d = this.drafts.find((x) => x.id === id)!; Object.assign(d, patch); return d; }
}

// ---------------------------------------------------------------------------
// Runner + scorecard (defects are recorded with a severity and the reason)
// ---------------------------------------------------------------------------

type Area = 'שיחה רציפה ודיבור' | 'לקוח חדש' | 'הצעות מחיר' | 'קבלת רכב' | 'תיקון פרטים' | 'איתור תיקים' | 'דוחות' | 'פעולות משיחה כללית' | 'עמידות' | 'קול נשי';
interface Row { id: number; area: Area; question: string; expected: string; actual: string; pass: boolean; severity: 'גבוהה' | 'בינונית' | 'נמוכה'; writes: string }
const results: Row[] = [];
let seq = 0;

const clean = (s: string) => s.replace(/[‎‏]/g, '').replace(/(\d),(\d{3})/g, '$1$2');
function shown(t: VoiceTurn): string {
  const parts = [t.say, t.followSay || '', t.display || ''];
  for (const u of t.ui || []) {
    if (u.type === 'list') parts.push(u.title, ...u.rows.map((r) => `${r.title} ${r.subtitle || ''} ${r.amount || ''}`));
    if (u.type === 'choices') parts.push(...u.options.map((o) => o.label));
    if (u.type === 'report') parts.push(u.result.headline || '', ...u.result.cards.map((c) => `${c.label} ${c.value}`));
  }
  return clean(parts.filter(Boolean).join(' | '));
}
const photo = { name: 'p.jpg', type: 'image/jpeg', bytes: new ArrayBuffer(8) };

async function talk(g: Garage, start: VoiceWorkflowType, answers: string[], ctx = {}, env?: Partial<VoiceEnv>) {
  const e: VoiceEnv = { actions: g, now: () => NOW, ...env };
  let r: VoiceResult = await startVoiceWorkflow(start, ctx, e);
  const all = [r];
  for (const a of answers) {
    if (!r.session) break;
    r = a === 'FILE' ? await answerVoiceFile(r.session, photo, e) : await answerVoiceWorkflow(r.session, a, e);
    all.push(r);
  }
  return { last: r, all };
}
const ask = (g: Garage, ...q: string[]) => talk(g, 'general_action', q);
const has = (text: string, ...needles: Array<string | RegExp>) => needles.every((n) => (typeof n === 'string' ? text.includes(n) : n.test(text)));

function scenario(area: Area, severity: Row['severity'], question: string, expected: string, run: (g: Garage) => Promise<{ ok: boolean; actual: string }>) {
  const id = ++seq;
  it(`#${id} [${area}] ${question}`, async () => {
    const g = new Garage();
    let row: Row;
    try {
      const out = await run(g);
      row = { id, area, question, expected, actual: out.actual.slice(0, 300), pass: out.ok, severity, writes: g.writes.join(',') || '—' };
    } catch (e) {
      row = { id, area, question, expected, actual: `חריגה: ${e instanceof Error ? e.message : String(e)}`, pass: false, severity, writes: g.writes.join(',') || '—' };
    }
    results.push(row);
    expect(row.pass, `${question}\nexpected: ${expected}\nactual: ${row.actual}\nwrites: ${row.writes}`).toBe(true);
  });
}

const NC = ['יוסי מזרחי', '0525551234', 'פרטי'];

// ---------------------------------------------------------------------------
describe('A. שיחה רציפה ודיבור', () => {
  scenario('שיחה רציפה ודיבור', 'גבוהה', 'באמצע שם לקוח: "רגע כמה תיקים פתוחים יש לנו" (בלי פסיק, כמו מזיהוי דיבור)', 'עונה מהנתונים, לא נרשם כשם', async (g) => { const { last } = await talk(g, 'new_customer', ['רגע כמה תיקים פתוחים יש לנו']); return { ok: !last.session?.data.customerName && last.turn.followSay === P.continueFlowAsk, actual: shown(last.turn) }; });
  scenario('שיחה רציפה ודיבור', 'בינונית', 'באמצע שם לקוח: "שנייה, מה התיק האחרון שנפתח במוסך?"', 'עונה (0130), לא נרשם כשם', async (g) => { const { last } = await talk(g, 'new_customer', ['שנייה, מה התיק האחרון שנפתח במוסך?']); return { ok: !last.session?.data.customerName && has(shown(last.turn), '0130'), actual: shown(last.turn) }; });
  scenario('שיחה רציפה ודיבור', 'גבוהה', 'אותה תשובה נשמעת פעמיים ברצף (שם ואז שוב השם בשאלת הטלפון)', 'הטלפון לא נקבע מהשם, השאלה חוזרת', async (g) => { const { last } = await talk(g, 'new_customer', ['יוסי מזרחי', 'יוסי מזרחי']); return { ok: !last.session?.data.customerPhone && last.session?.data.customerName === 'יוסי מזרחי', actual: shown(last.turn) }; });
  scenario('שיחה רציפה ודיבור', 'בינונית', 'טלפון עם רווחים "052 555 1234"', 'טלפון 052-5551234', async (g) => { const { last } = await talk(g, 'new_customer', ['יוסי מזרחי', '052 555 1234']); return { ok: last.session?.data.customerPhone === '052-5551234', actual: shown(last.turn) }; });
  scenario('שיחה רציפה ודיבור', 'בינונית', 'טלפון במילים "אפס חמש שתיים חמש חמש חמש אחת שתיים שלוש ארבע"', 'טלפון 052-5551234', async (g) => { const { last } = await talk(g, 'new_customer', ['יוסי מזרחי', 'אפס חמש שתיים חמש חמש חמש אחת שתיים שלוש ארבע']); return { ok: last.session?.data.customerPhone === '052-5551234', actual: shown(last.turn) }; });
  scenario('שיחה רציפה ודיבור', 'נמוכה', 'שם עם הקדמה "השם שלו זה יוסי מזרחי"', 'שם: יוסי מזרחי', async (g) => { const { last } = await talk(g, 'new_customer', ['השם שלו זה יוסי מזרחי']); return { ok: last.session?.data.customerName === 'יוסי מזרחי', actual: `${last.session?.data.customerName} | ${shown(last.turn)}` }; });
  scenario('שיחה רציפה ודיבור', 'גבוהה', '"עזבי" באמצע לקוח חדש', 'מבוטל, לא נשמר דבר', async (g) => { const { last } = await talk(g, 'new_customer', ['יוסי מזרחי', 'עזבי']); return { ok: !last.session && !g.writes.length, actual: shown(last.turn) }; });
  scenario('שיחה רציפה ודיבור', 'בינונית', '"עצרי" ואז "המשך פעולה אחרונה" → "כן"', 'חוזרת לשאלת הטלפון עם השם שנשמר', async (g) => {
    const e: VoiceEnv = { actions: g, now: () => NOW };
    const { last } = await talk(g, 'new_customer', ['יוסי מזרחי', 'עצרי']);
    const { saveVoiceSession } = await import('./daliaVoiceEngine');
    if (last.session) saveVoiceSession(last.session);
    let r = await startVoiceWorkflow('resume_action', {}, e);
    r = await answerVoiceWorkflow(r.session!, 'כן', e);
    return { ok: r.session?.data.customerName === 'יוסי מזרחי' && r.turn.say === P.phone, actual: shown(r.turn) };
  });
  scenario('שיחה רציפה ודיבור', 'גבוהה', 'תוצאות זיהוי מצטברות של אנדרואיד (כל משפט פעם אחת)', '"כמה תיקים פתוחים" פעם אחת', async () => { const r = (t: string) => ({ isFinal: true, 0: { transcript: t } }); const out = mergeRecognitionResults([r('כמה'), r('כמה תיקים'), r('כמה תיקים פתוחים'), r('כמה תיקים פתוחים')]).full; return { ok: out === 'כמה תיקים פתוחים', actual: out }; });
  scenario('שיחה רציפה ודיבור', 'בינונית', 'כל משפט שדליה אומרת בזרימת לקוח חדש מלאה מגובה במשפט קבוע', 'say קבוע או alt קבוע בכל תור', async (g) => { const { all } = await talk(g, 'new_customer', [...NC, 'כן', 'בדיבור', '12-345-99', 'טויוטה קורולה', '2019', 'כן', 'לא']); const bad = all.filter((r) => !(isFixedDaliaPrompt(r.turn.say) || (r.turn.alt && isFixedDaliaPrompt(r.turn.alt)))).map((r) => r.turn.say); return { ok: !bad.length, actual: bad.join(' | ') || 'הכל קבוע' }; });
});

// ---------------------------------------------------------------------------
describe('B. לקוח חדש', () => {
  scenario('לקוח חדש', 'בינונית', 'כפתור לקוח חדש → "רגיל"', 'פתיחה רגילה: שואלת שם', async (g) => { const { last } = await talk(g, 'new_customer_choice', ['רגיל']); return { ok: last.session?.type === 'new_customer' && last.turn.say === P.newCustomerOpen, actual: shown(last.turn) }; });
  scenario('לקוח חדש', 'בינונית', 'כפתור לקוח חדש → "עם הצעת מחיר"', 'מסלול הצעה ללקוח חדש', async (g) => { const { last } = await talk(g, 'new_customer_choice', ['עם הצעת מחיר']); return { ok: last.session?.type === 'prospect_quote', actual: shown(last.turn) }; });
  scenario('לקוח חדש', 'בינונית', 'כפתור לקוח חדש → אומרים ישר שם "רונית אברהם"', 'השם נקלט, שואלת טלפון', async (g) => { const { last } = await talk(g, 'new_customer_choice', ['רונית אברהם']); return { ok: last.session?.data.customerName === 'רונית אברהם' && last.turn.say === P.phone, actual: shown(last.turn) }; });
  scenario('לקוח חדש', 'גבוהה', 'פתיחה מלאה: לקוח + רכב בדיבור + תיק עבודה', 'לקוח, רכב ותיק — כל אחד פעם אחת', async (g) => { const { all } = await talk(g, 'new_customer', [...NC, 'כן', 'בדיבור', '12-345-99', 'טויוטה קורולה', '2019', 'כן', 'כן', 'רעש בבלמים', 'לא', 'כן']); const w = g.writes.join(','); return { ok: w === 'createCustomer,createVehicle,createCase', actual: `${w} | ${all.at(-1)!.turn.say}` }; });
  scenario('לקוח חדש', 'גבוהה', 'לפני אישור: שום כתיבה', 'אין כתיבה עד "כן"', async (g) => { await talk(g, 'new_customer', NC); return { ok: !g.writes.length, actual: g.writes.join(',') || 'אין כתיבה' }; });
  scenario('לקוח חדש', 'גבוהה', 'טלפון שכבר שייך ללקוח קיים (משה כהן)', 'מזהירה על לקוח קיים, לא יוצרת כפול', async (g) => { const { last } = await talk(g, 'new_customer', ['משה חדש', '0521111111', 'פרטי', 'כן']); return { ok: !g.writes.includes('createCustomer') && /משה כהן/.test(shown(last.turn)), actual: shown(last.turn) }; });
  scenario('לקוח חדש', 'בינונית', 'לקוח עסקי עם ח.פ', 'לקוח עסקי נשמר', async (g) => { const { all } = await talk(g, 'new_customer', ['מוסך הצפון בעמ', '0541231231', 'עסקי', '514567891', 'כן']); const c = g.customers.at(-1)!; return { ok: g.writes.includes('createCustomer') && c.customer_type === 'business', actual: `${all.at(-1)!.turn.say} | ${c.name} ${c.customer_type}` }; });
});

// ---------------------------------------------------------------------------
describe('C. הצעות מחיר', () => {
  const PROSPECT = ['רונית אברהם', 'דלג', 'בדיבור', '12-345-77', 'מאזדה 3', '2020', 'החלפת בלמים 800', 'אין', 'רפידות 300', 'אין', 'אין'];
  scenario('הצעות מחיר', 'גבוהה', 'הצעה ללקוח חדש עד הסקירה', 'סקירה עם 2 סעיפים, בלי כתיבה', async (g) => { const { last } = await talk(g, 'prospect_quote', PROSPECT); return { ok: last.turn.say === P.prospectReview && has(shown(last.turn), 'בלמים', 'רפידות') && !g.writes.length, actual: shown(last.turn) }; });
  scenario('הצעות מחיר', 'גבוהה', 'סקירה → "מחקי סעיף 2" → "להכין"', 'נשמרת הצעה ממתינה אחת עם סעיף אחד; אין לקוח/תיק', async (g) => { const { last } = await talk(g, 'prospect_quote', [...PROSPECT, 'מחקי סעיף 2', 'להכין']); const d = g.drafts[0]; return { ok: last.turn.say === P.prospectSaved && g.drafts.length === 1 && (d.works.length + d.parts.length) === 1 && !g.writes.some((w) => /create/.test(w)), actual: `${shown(last.turn)} | ${g.writes.join(',')}` }; });
  scenario('הצעות מחיר', 'בינונית', 'סקירה → "מחיר סעיף 1 600"', 'מחיר הבלמים 600', async (g) => { const { last } = await talk(g, 'prospect_quote', [...PROSPECT, 'מחיר סעיף 1 600']); return { ok: last.session?.data.works?.[0]?.price === 600, actual: shown(last.turn) }; });
  scenario('הצעות מחיר', 'בינונית', 'מחיר במילים: "החלפת שמן שלוש מאות"', 'מחיר 300', async (g) => { const { last } = await talk(g, 'prospect_quote', ['רונית אברהם', 'דלג', 'בלי רכב', 'החלפת שמן שלוש מאות']); const w = last.session?.data.works?.[0]; return { ok: w?.price === 300, actual: `${JSON.stringify(w)} | ${shown(last.turn)}` }; });
  scenario('הצעות מחיר', 'בינונית', 'מחיר עם "שקל": "בדיקת מחשב 250 שקל"', 'מחיר 250', async (g) => { const { last } = await talk(g, 'prospect_quote', ['רונית אברהם', 'דלג', 'בלי רכב', 'בדיקת מחשב 250 שקל']); const w = last.session?.data.works?.[0]; return { ok: w?.price === 250, actual: `${JSON.stringify(w)}` }; });
  scenario('הצעות מחיר', 'גבוהה', 'כפתור הצעת מחיר → הצעה ללקוח קיים (דנה לוי) → רכב 1 → סעיף → להכין', 'הצעה ממתינה מקושרת ללקוח ולרכב, בלי תיק', async (g) => { const { last } = await talk(g, 'quote', ['הצעה ללקוח קיים', 'דנה לוי', 'כן', 'מספר 1', 'החלפת מצבר 450', 'אין', 'אין', 'אין', 'להכין']); const d = g.drafts[0]; return { ok: !!d && d.customer_id === 'c2' && d.vehicle_id === 'v2' && !g.writes.includes('createCase'), actual: `${shown(last.turn)} | ${JSON.stringify(d ? { c: d.customer_id, v: d.vehicle_id } : null)}` }; });
  scenario('הצעות מחיר', 'גבוהה', 'הצעה ממתינה → "הלקוח אישר" → "קליטת הרכב" → שאלון → אישור', 'נפתח תיק אחד לרכב של דנה עם סעיף המצבר; בלי לקוח כפול', async (g) => {
    await talk(g, 'quote', ['הצעה ללקוח קיים', 'דנה לוי', 'כן', 'מספר 1', 'החלפת מצבר 450', 'אין', 'אין', 'אין', 'להכין']);
    const before = g.cases.length;
    const { last, all } = await talk(g, 'quote_drafts', ['דנה לוי', 'הלקוח אישר', 'קליטת הרכב', 'מצבר חלש', 'החלפת מצבר', 'תקין', 'לא', '80000', 'חצי', '1', 'לא', 'לא', 'כן', 'אחר כך']);
    const created = g.cases.slice(0, g.cases.length - before);
    const k = created[0];
    const lines = JSON.stringify(k?.case_data || {});
    return { ok: created.length === 1 && k.vehicle_id === 'v2' && /מצבר/.test(lines) && !g.writes.includes('createCustomer'), actual: `${all.slice(-3).map((r) => r.turn.say).join(' → ')} | cases+${created.length} | vehicle=${k?.vehicle_id} | lines=${/מצבר/.test(lines)} | ${g.writes.join(',')} | ${shown(last.turn).slice(0, 80)}` };
  });
  scenario('הצעות מחיר', 'בינונית', 'אין הצעות ממתינות → "הצעות ממתינות"', 'אומרת שאין הצעות', async (g) => { const { last } = await talk(g, 'quote_drafts', []); return { ok: last.turn.say === P.draftsNone, actual: shown(last.turn) }; });
  scenario('הצעות מחיר', 'בינונית', 'תוספת לתיק 129: "מגן אחורי סדוק" גם וגם 650', 'תוספת נרשמת עם מחיר 650', async (g) => { const { last } = await talk(g, 'quote', ['תוספת עבודה או חלקים לתיק קיים', '11-222-33', 'נמצא שהמגן האחורי סדוק', 'גם וגם', '650']); return { ok: last.session?.data.extraPrice === 650 || /650/.test(shown(last.turn)), actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
describe('D. קבלת רכב', () => {
  scenario('קבלת רכב', 'בינונית', 'קבלת רכב לפי מספר תיק "תיק 41"', 'מזהה את רכב 1234567 עם התיק הפתוח', async (g) => { const { last } = await talk(g, 'intake', ['תיק 41']); return { ok: last.turn.say === P.intakeContinueOpen || has(shown(last.turn), '0041'), actual: shown(last.turn) }; });
  scenario('קבלת רכב', 'בינונית', 'קבלת רכב לפי טלפון "054-2222222"', 'מזהה את הרכב של דנה', async (g) => { const { last } = await talk(g, 'intake', ['054-2222222']); return { ok: has(shown(last.turn), '7654321') || last.turn.say === P.intakeComplaint, actual: shown(last.turn) }; });
  scenario('קבלת רכב', 'בינונית', 'קבלת רכב לרכב לא קיים "99-999-99"', 'אומרת שהרכב לא קיים ומציעה לפתוח לקוח+רכב — בלי כתיבה ובלי להמציא', async (g) => { const { last } = await talk(g, 'intake', ['99-999-99']); return { ok: /לא (נמצא|קיים)/.test(shown(last.turn)) && !g.writes.length, actual: shown(last.turn) }; });
  scenario('קבלת רכב', 'גבוהה', 'קבלת רכב מלאה בתיק 41 עם 5 תמונות', 'נשמר פעם אחת, 5 תמונות קבלה, הרכב מסומן כהתקבל', async (g) => {
    const { last, all } = await talk(g, 'intake', ['1234567', 'כן', 'רעש', 'בדיקה', 'תקין', 'לא', '120000', 'חצי', '1', 'לא', 'לא', 'כן', 'FILE', 'FILE', 'FILE', 'FILE', 'FILE', 'כן']);
    const k1 = g.cases.find((c) => c.id === 'k1')!;
    return { ok: g.media.filter((m) => m === 'angles').length === 5 && !!k1.case_data.intakeDone, actual: `${all.map((r) => r.turn.say).slice(-3).join(' → ')} | media=${g.media.join(',')} | intakeDone=${k1.case_data.intakeDone}` };
  });
  scenario('קבלת רכב', 'גבוהה', 'ק"מ במילים "מאה ועשרים אלף"', 'ק"מ 120000', async (g) => { const { last } = await talk(g, 'intake', ['1234567', 'כן', 'רעש', 'בדיקה', 'תקין', 'לא', 'מאה ועשרים אלף']); return { ok: last.session?.data.km === '120000', actual: `km=${last.session?.data.km} | ${shown(last.turn)}` }; });
});

// ---------------------------------------------------------------------------
describe('E. תיקון פרטים בשיחה חופשית', () => {
  scenario('תיקון פרטים', 'גבוהה', 'בסיכום: "לא לא, השם הוא יוסי לוי"', 'השם מתעדכן, לא נשמר', async (g) => { const { last } = await talk(g, 'new_customer', [...NC, 'לא לא, השם הוא יוסי לוי']); return { ok: last.session?.data.customerName === 'יוסי לוי' && !g.writes.length, actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'גבוהה', 'בסיכום: "הטלפון הנכון הוא 0547779999"', 'טלפון 054-7779999', async (g) => { const { last } = await talk(g, 'new_customer', [...NC, 'הטלפון הנכון הוא 0547779999']); return { ok: last.session?.data.customerPhone === '054-7779999' && !g.writes.length, actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'בינונית', 'באמצע (בשאלת סוג הלקוח): "רגע, השם הוא יוסי לוי"', 'השם מתעדכן והשאלה הפתוחה חוזרת', async (g) => { const { last } = await talk(g, 'new_customer', ['יוסי מזרחי', '0525551234', 'רגע, השם הוא יוסי לוי']); return { ok: last.session?.data.customerName === 'יוסי לוי' && [last.turn.say, last.turn.followSay].includes(P.customerTypeBiz), actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'בינונית', 'ברכב: "תחליפי את השנה ל 2020"', 'שנה 2020', async (g) => { const { last } = await talk(g, 'new_customer', [...NC, 'כן', 'בדיבור', '12-345-99', 'טויוטה קורולה', '2021', 'תחליפי את השנה ל 2020']); return { ok: last.session?.data.year === 2020, actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'בינונית', 'בהצעה: "תוסיפי עבודה יישור פח 900"', 'סעיף חדש 900', async (g) => { const { last } = await talk(g, 'prospect_quote', ['רונית אברהם', 'דלג', 'בלי רכב', 'החלפת שמן 300', 'אין', 'אין', 'אין', 'תוסיפי עבודה יישור פח 900']); return { ok: (last.session?.data.works || []).some((w) => w.price === 900), actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'גבוהה', 'אחרי תיקונים → "כן" נשמר פעם אחת עם הערכים המתוקנים', 'createCustomer אחד עם יוסי לוי / 054-7779999', async (g) => { await talk(g, 'new_customer', [...NC, 'השם הוא יוסי לוי והטלפון 0547779999', 'כן']); const c = g.customers.at(-1)!; return { ok: g.writes.filter((w) => w === 'createCustomer').length === 1 && c.name === 'יוסי לוי' && c.phone === '054-7779999', actual: `${c.name} ${c.phone} | ${g.writes.join(',')}` }; });
});

// ---------------------------------------------------------------------------
describe('F. איתור תיקים (ניסוחים שונים)', () => {
  scenario('איתור תיקים', 'בינונית', 'לשון זכר: "תביא לי את התיק של דנה"', 'תיקי דנה לוי', async (g) => { const { last } = await ask(g, 'תביא לי את התיק של דנה'); return { ok: has(shown(last.turn), '0042'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'בינונית', '"איפה התיק של הרכב 1234567"', 'GM-2026-0041', async (g) => { const { last } = await ask(g, 'איפה התיק של הרכב 1234567'); return { ok: has(shown(last.turn), '0041'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'בינונית', 'מספר במילים: "תפתחי את תיק ארבעים ואחת" → "פתחי את התיק"', 'מזהה את GM-2026-0041 (מבקשת אישור כי המספר נאמר במילים) ופותחת', async (g) => { const { all, last } = await ask(g, 'תפתחי את תיק ארבעים ואחת', 'פתחי את התיק'); return { ok: has(shown(all[1].turn), '0041') && last.turn.openCaseId === 'k1', actual: `${shown(all[1].turn).slice(0, 80)} → ${shown(last.turn)}` }; });
  scenario('איתור תיקים', 'נמוכה', '"מה קורה עם התיק של אלדן"', 'מציגה את תיקי אלדן', async (g) => { const { last } = await ask(g, 'מה קורה עם התיק של אלדן'); return { ok: has(shown(last.turn), '0129') || has(shown(last.turn), '0130'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'בינונית', '"יש לנו תיקים פתוחים של אלדן?"', '2 תיקים פתוחים', async (g) => { const { last } = await ask(g, 'יש לנו תיקים פתוחים של אלדן?'); return { ok: /2/.test(last.turn.say) && has(shown(last.turn), '0129', '0130'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'בינונית', 'כפתור איתור תיק → "של משה כהן"', 'GM-2026-0041', async (g) => { const { last } = await talk(g, 'find_case', ['של משה כהן']); return { ok: has(shown(last.turn), '0041'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'גבוהה', 'מספר תיק שלא קיים: "תפתחי את תיק 777"', 'לא נמצא — לא פותחת תיק אחר', async (g) => { const { last } = await ask(g, 'תפתחי את תיק 777'); return { ok: !last.turn.openCaseId, actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
describe('G. דוחות (ניסוחים שונים)', () => {
  scenario('דוחות', 'גבוהה', '"כמה כסף עשינו השבוע"', '₪1,680 התקבל', async (g) => { const { last } = await ask(g, 'כמה כסף עשינו השבוע'); return { ok: clean(shown(last.turn)).includes('1680'), actual: shown(last.turn) }; });
  scenario('דוחות', 'בינונית', '"מה ההכנסות של החודש"', '₪1,680', async (g) => { const { last } = await ask(g, 'מה ההכנסות של החודש'); return { ok: clean(shown(last.turn)).includes('1680'), actual: shown(last.turn) }; });
  scenario('דוחות', 'גבוהה', '"כמה חייבים לנו"', 'יתרות — לא תקבולים (₪1,500 בתיק 129 + יתרת 41)', async (g) => { const { last } = await ask(g, 'כמה חייבים לנו'); return { ok: /חייבים|יתר/.test(shown(last.turn)) && clean(shown(last.turn)).includes('1500') === true || /חייבים לנו/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('דוחות', 'בינונית', '"כמה רכבים קיבלנו השבוע"', '3 רכבים (19.10, 20.10, 23.10)', async (g) => { const { last } = await ask(g, 'כמה רכבים קיבלנו השבוע'); return { ok: /3/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('דוחות', 'בינונית', 'כפתור דוחות → "דוח כספי" → שאלון', 'שואלת חברה / תקופה', async (g) => { const { all } = await talk(g, 'reports', ['דוח כספי']); return { ok: /שאלון|חברה|תקופה|איך/.test(all.at(-1)!.turn.say), actual: shown(all.at(-1)!.turn) }; });
  scenario('דוחות', 'גבוהה', 'נהג שואל "כמה כסף עשינו השבוע"', 'אין הרשאה', async (g) => { g.actorRole = 'driver'; const { last } = await ask(g, 'כמה כסף עשינו השבוע'); return { ok: /אין לך הרשאה/.test(last.turn.say), actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
describe('H. פעולות דרך שיחה כללית', () => {
  scenario('פעולות משיחה כללית', 'גבוהה', '"תפתחי לקוח חדש"', 'עוברת לפתיחת לקוח', async (g) => { const { last } = await ask(g, 'תפתחי לקוח חדש'); return { ok: ['new_customer', 'new_customer_choice'].includes(last.session?.type || ''), actual: `${last.session?.type} | ${shown(last.turn)}` }; });
  scenario('פעולות משיחה כללית', 'גבוהה', '"אני רוצה לקלוט את רכב 1234567"', 'קבלת רכב עם הרכב', async (g) => { const { last } = await ask(g, 'אני רוצה לקלוט את רכב 1234567'); return { ok: last.session?.type === 'intake' && has(shown(last.turn), '1234567') || last.turn.say === P.intakeContinueOpen, actual: `${last.session?.type} | ${shown(last.turn)}` }; });
  scenario('פעולות משיחה כללית', 'בינונית', '"תכיני הצעת מחיר"', 'תפריט הצעות', async (g) => { const { last } = await ask(g, 'תכיני הצעת מחיר'); return { ok: last.session?.type === 'quote' || last.session?.type === 'prospect_quote', actual: `${last.session?.type} | ${shown(last.turn)}` }; });
  scenario('פעולות משיחה כללית', 'גבוהה', '"תסגרי את תיק 42" (כבר סגור)', 'אומרת שכבר סגור, בלי כתיבה', async (g) => { const { last } = await ask(g, 'תסגרי את תיק 42'); return { ok: !g.writes.length && /סגור/.test(shown(last.turn)), actual: shown(last.turn) }; });
  scenario('פעולות משיחה כללית', 'בינונית', 'פעולה → "בטל" → חוזרת לשיחה הכללית', 'session=general_action', async (g) => { const { last } = await ask(g, 'תפתחי לקוח חדש', 'בטל'); return { ok: last.session?.type === 'general_action', actual: `${last.session?.type} | ${shown(last.turn)}` }; });
  scenario('פעולות משיחה כללית', 'גבוהה', '"תמחקי את כל התיקים"', 'לא מוחקת, אין כתיבה', async (g) => { const { last } = await ask(g, 'תמחקי את כל התיקים'); return { ok: !g.writes.length && g.cases.length === 4, actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
describe('I. עמידות', () => {
  scenario('עמידות', 'בינונית', 'תשובה ריקה בשאלת השם', 'שואלת שוב, לא נרשם', async (g) => { const { last } = await talk(g, 'new_customer', ['']); return { ok: !last.session?.data.customerName && !!last.session, actual: shown(last.turn) }; });
  scenario('עמידות', 'בינונית', 'רעש "אאאא" בשאלת אישור', 'מבקשת כן/לא, לא שומרת', async (g) => { const { last } = await talk(g, 'new_customer', [...NC, 'אאאא']); return { ok: !g.writes.length && !!last.session, actual: shown(last.turn) }; });
  scenario('עמידות', 'נמוכה', '"yes" באנגלית באישור', 'מתקבל כאישור או נשאלת שוב — לא קריסה', async (g) => { const { last } = await talk(g, 'new_customer', [...NC, 'yes']); return { ok: !!last.turn.say, actual: `${shown(last.turn)} | ${g.writes.join(',')}` }; });
  scenario('עמידות', 'בינונית', 'טקסט ארוך מאוד (400 תווים) בשאלת השם', 'לא נשמר כשם ענק', async (g) => { const long = 'אני רוצה להגיד לך משהו ארוך '.repeat(15); const { last } = await talk(g, 'new_customer', [long]); const n = last.session?.data.customerName || ''; return { ok: n.length <= 60, actual: `name len=${n.length} | ${shown(last.turn).slice(0, 120)}` }; });
  scenario('עמידות', 'נמוכה', 'אימוג׳י בשם "יוסי 😀"', 'לא קריסה', async (g) => { const { last } = await talk(g, 'new_customer', ['יוסי 😀']); return { ok: !!last.turn.say, actual: shown(last.turn) }; });
  scenario('עמידות', 'גבוהה', 'מערכת ללא חיבור (actions=null) — לקוח חדש', 'אומרת שאי אפשר, בלי קריסה', async () => { const r = await startVoiceWorkflow('new_customer', {}, { actions: null, now: () => NOW }); return { ok: r.turn.say === P.noActions, actual: r.turn.say }; });
});

// ---------------------------------------------------------------------------
describe('J. קול נשי', () => {
  const v = (name: string, lang = 'he-IL') => ({ name, lang, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice;
  scenario('קול נשי', 'גבוהה', 'Windows: Asaf (גבר) + Hila (אישה)', 'נבחר הקול הנשי', async () => { const p = pickHebrewVoice([v('Microsoft Asaf - Hebrew (Israel)'), v('Microsoft Hila Online (Natural) - Hebrew (Israel)')]); return { ok: /Hila/.test(p?.name || ''), actual: p?.name || 'none' }; });
  scenario('קול נשי', 'גבוהה', 'סמסונג/גוגל: קולות עבריים בלי שם מגדר + Asaf', 'לא נבחר Asaf', async () => { const p = pickHebrewVoice([v('Microsoft Asaf'), v('he-il-x-heb-local'), v('he-il-x-heb-network')]); return { ok: !/Asaf/i.test(p?.name || ''), actual: p?.name || 'none' }; });
  scenario('קול נשי', 'בינונית', 'רק קול עברי גברי במכשיר', 'נבחר (עדיף על שתיקה) — מתועד כחסימה', async () => { const p = pickHebrewVoice([v('Microsoft Asaf - Hebrew (Israel)'), v('Google US English', 'en-US')]); return { ok: /Asaf/.test(p?.name || ''), actual: p?.name || 'none' }; });
});

// ---------------------------------------------------------------------------
// Round 2 — blind scenarios (written after the round-1 fixes; first-run result recorded in the report)
// ---------------------------------------------------------------------------
describe('K. סבב עיוור 2', () => {
  const R = (q: string) => `[סבב 2] ${q}`;
  scenario('לקוח חדש', 'בינונית', R('לקוח קיים: "תמצא לי את משה כהן" → כן → "רכבים"'), 'רשימת הרכבים של משה (1234567)', async (g) => { const { last } = await talk(g, 'existing_customer', ['תמצא לי את משה כהן', 'כן', 'רכבים']); return { ok: has(shown(last.turn), '1234567'), actual: shown(last.turn) }; });
  scenario('לקוח חדש', 'בינונית', R('לקוח קיים לפי טלפון "03-5551111"'), 'אלדן תחבורה', async (g) => { const { last } = await talk(g, 'existing_customer', ['03-5551111']); return { ok: has(shown(last.turn), 'אלדן'), actual: shown(last.turn) }; });
  scenario('לקוח חדש', 'גבוהה', R('לקוח חדש → "בעצם תבטלי" אחרי הטלפון'), 'מבוטל, בלי כתיבה', async (g) => { const { last } = await talk(g, 'new_customer', ['יוסי מזרחי', '0525551234', 'בעצם תבטלי']); return { ok: !last.session && !g.writes.length, actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'גבוהה', R('בסיכום: "סליחה, הטלפון זה 0501112233"'), 'טלפון 050-1112233', async (g) => { const { last } = await talk(g, 'new_customer', [...NC, 'סליחה, הטלפון זה 0501112233']); return { ok: last.session?.data.customerPhone === '050-1112233' && !g.writes.length, actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'בינונית', R('בסיכום: "הלקוח עסקי לא פרטי"'), 'סוג לקוח עסקי', async (g) => { const { last } = await talk(g, 'new_customer', [...NC, 'הלקוח עסקי לא פרטי']); return { ok: last.session?.data.customerType === 'business' && !g.writes.length, actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'בינונית', R('ברכב לפני שמירה: "הצבע לבן" (פרט שלא נשאל)'), 'לא קריסה, לא שמירה', async (g) => { const { last } = await talk(g, 'new_customer', [...NC, 'כן', 'בדיבור', '12-345-99', 'טויוטה קורולה', '2021', 'הצבע לבן']); return { ok: !!last.session && !g.writes.includes('createVehicle'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר', 'בינונית', R('הצעה ללקוח חדש: שני סעיפים במשפט אחד "החלפת שמן 300 ופילטר 80"'), 'סעיפים עם המחירים שנאמרו — לא מחיר שגוי', async (g) => { const { last } = await talk(g, 'prospect_quote', ['רונית אברהם', 'דלג', 'בלי רכב', 'החלפת שמן 300 ופילטר 80']); const ws = last.session?.data.works || []; return { ok: ws.length >= 1 && ws.every((w) => w.price === 300 || w.price === 80), actual: `${JSON.stringify(ws)} | ${shown(last.turn).slice(0, 100)}` }; });
  scenario('הצעות מחיר', 'גבוהה', R('הצעה ללקוח חדש → סקירה → "בטל"'), 'לא נשמרת הצעה', async (g) => { await talk(g, 'prospect_quote', ['רונית אברהם', 'דלג', 'בלי רכב', 'החלפת שמן 300', 'אין', 'אין', 'אין', 'בטל']); return { ok: !g.drafts.length, actual: `drafts=${g.drafts.length} | ${g.writes.join(',')}` }; });
  scenario('הצעות מחיר', 'בינונית', R('הצעה בלי סעיפים → "להכין"'), 'לא נשמרת הצעה ריקה', async (g) => { const { last } = await talk(g, 'prospect_quote', ['רונית אברהם', 'דלג', 'בלי רכב', 'אין', 'אין', 'אין', 'להכין']); return { ok: !g.drafts.length, actual: `${shown(last.turn)} | drafts=${g.drafts.length}` }; });
  scenario('קבלת רכב', 'גבוהה', R('קבלת רכב 11-222-33 (תיק 129 בעבודה)'), 'לא פותחת תיק כפול', async (g) => { const { all } = await talk(g, 'intake', ['11-222-33', 'כן']); return { ok: !g.writes.includes('createCase'), actual: all.map((r) => r.turn.say).join(' → ') }; });
  scenario('קבלת רכב', 'בינונית', R('קבלת רכב: דלק "שלושת רבעי"'), 'דלק 3/4', async (g) => { const { last } = await talk(g, 'intake', ['1234567', 'כן', 'רעש', 'בדיקה', 'תקין', 'לא', '120000', 'שלושת רבעי']); return { ok: last.session?.data.fuel === '3/4', actual: `fuel=${last.session?.data.fuel} | ${shown(last.turn)}` }; });
  scenario('קבלת רכב', 'בינונית', R('קבלת רכב: מפתחות "שניים"'), 'מפתחות 2', async (g) => { const { last } = await talk(g, 'intake', ['1234567', 'כן', 'רעש', 'בדיקה', 'תקין', 'לא', '120000', 'חצי', 'שניים']); return { ok: last.session?.data.keys === '2', actual: `keys=${last.session?.data.keys} | ${shown(last.turn)}` }; });
  scenario('איתור תיקים', 'בינונית', R('"תראי לי את התיקים הסגורים"'), 'תיק 42 בלבד', async (g) => { const { last } = await ask(g, 'תראי לי את התיקים הסגורים'); const list = last.turn.ui?.find((u) => u.type === 'list'); return { ok: list?.type === 'list' && list.rows.length === 1 && list.rows[0].title.includes('0042'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'בינונית', R('"מה מצב התיק של הרכב 11-222-33"'), 'תיק 129', async (g) => { const { last } = await ask(g, 'מה מצב התיק של הרכב 11-222-33'); return { ok: has(shown(last.turn), '0129'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'בינונית', R('כפתור איתור תיק → "תיק מאה עשרים ותשע"'), 'תיק 129', async (g) => { const { last } = await talk(g, 'find_case', ['תיק מאה עשרים ותשע']); return { ok: has(shown(last.turn), '0129'), actual: shown(last.turn) }; });
  scenario('דוחות', 'בינונית', R('"כמה כסף נכנס מאלדן החודש"'), '₪500', async (g) => { const { last } = await ask(g, 'כמה כסף נכנס מאלדן החודש'); return { ok: clean(shown(last.turn)).includes('500') && !clean(last.turn.say).includes('1680'), actual: shown(last.turn) }; });
  scenario('דוחות', 'בינונית', R('"כמה הצעות מחיר נתנו החודש"'), 'מספר הצעות (לא כסף)', async (g) => { const { last } = await ask(g, 'כמה הצעות מחיר נתנו החודש'); return { ok: /הצעות/.test(last.turn.say) && !/התקבל בפועל/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('דוחות', 'גבוהה', R('"כמה כסף יש לנו בקופה"'), 'לא ממציאה יתרת קופה', async (g) => { const { last } = await ask(g, 'כמה כסף יש לנו בקופה'); return { ok: !/קופה/.test(last.turn.say) || !/\d/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('פעולות משיחה כללית', 'בינונית', R('"תרשמי תשלום של 500 בתיק 129"'), 'זרימת תשלום לתיק 129, בלי כתיבה לפני אישור', async (g) => { const { last } = await ask(g, 'תרשמי תשלום של 500 בתיק 129'); return { ok: !g.writes.length && (last.session?.type === 'context_pay_record' || /תשלום|אמצעי|סכום/.test(last.turn.say)), actual: `${last.session?.type} | ${shown(last.turn)}` }; });
  scenario('פעולות משיחה כללית', 'בינונית', R('"תמצאי לי ספק אוטו חלקים"'), 'זרימת ספקים', async (g) => { const { last } = await ask(g, 'תמצאי לי ספק אוטו חלקים'); return { ok: last.session?.type === 'general_expenses' || /ספק/.test(last.turn.say), actual: `${last.session?.type} | ${shown(last.turn)}` }; });
  scenario('פעולות משיחה כללית', 'גבוהה', R('"תסגרי את התיק של משה" (תיק 41 לא מוכן)'), 'לא נסגר', async (g) => { const { all } = await ask(g, 'תסגרי את התיק של משה'); return { ok: !g.writes.some((w) => w.startsWith('closeCase')), actual: all.map((r) => r.turn.say).join(' → ') }; });
  scenario('שיחה רציפה ודיבור', 'גבוהה', R('באמצע הצעה: "רגע מי הלקוח האחרון שפתחנו"'), 'עונה, לא נרשם כסעיף בהצעה', async (g) => { const { last } = await talk(g, 'prospect_quote', ['רונית אברהם', 'דלג', 'בלי רכב', 'רגע מי הלקוח האחרון שפתחנו']); return { ok: !(last.session?.data.works || []).length, actual: shown(last.turn) }; });
  scenario('שיחה רציפה ודיבור', 'בינונית', R('"תחזרי על השאלה" בשאלת הטלפון'), 'אותה שאלה שוב', async (g) => { const { last } = await talk(g, 'new_customer', ['יוסי מזרחי', 'תחזרי על השאלה']); return { ok: last.turn.say === P.phone, actual: shown(last.turn) }; });
  scenario('עמידות', 'בינונית', R('מספר רכב חלקי "12-3"'), 'מבקשת שוב, לא שומרת רכב שגוי', async (g) => { const { last } = await talk(g, 'new_customer', [...NC, 'כן', 'בדיבור', '12-3']); return { ok: !last.session?.data.plate || (last.session?.data.plate || '').length >= 5, actual: `plate=${last.session?.data.plate} | ${shown(last.turn)}` }; });
  scenario('עמידות', 'נמוכה', R('שנת ייצור עתידית "2035"'), 'לא מתקבלת', async (g) => { const { last } = await talk(g, 'new_customer', [...NC, 'כן', 'בדיבור', '12-345-99', 'טויוטה קורולה', '2035']); return { ok: last.session?.data.year !== 2035, actual: `year=${last.session?.data.year} | ${shown(last.turn)}` }; });
});

// ---------------------------------------------------------------------------
afterAll(() => {
  const areas = [...new Set(results.map((r) => r.area))];
  const score = (rows: Row[]) => (rows.length ? Math.round((100 * rows.filter((r) => r.pass).length) / rows.length) : 0);
  const byArea = areas.map((a) => { const rows = results.filter((r) => r.area === a); return { area: a, total: rows.length, passed: rows.filter((r) => r.pass).length, score: score(rows) }; });
  const rows = results.sort((a, b) => a.id - b.id);
  const passed = rows.filter((r) => r.pass).length;
  const out = { generatedAt: new Date().toISOString(), total: rows.length, passed, failed: rows.length - passed, overall: score(rows), byArea, defects: rows.filter((r) => !r.pass), rows };
  const dir = path.join(process.cwd(), 'docs', 'dalia-scorecard');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'independent-qa.json'), JSON.stringify(out, null, 2), 'utf8');
  const md = [
    '# Dalia AI — בדיקה בלתי תלויה (סבב שני)',
    '',
    `סה״כ ${out.total} תרחישים · עברו ${out.passed} · נכשלו ${out.failed} · ציון ${out.overall}`,
    '',
    '| תחום | תרחישים | עברו | ציון |', '|---|---|---|---|',
    ...byArea.map((a) => `| ${a.area} | ${a.total} | ${a.passed} | ${a.score} |`),
    '',
    '## תקלות פתוחות', '',
    ...(out.defects.length ? ['| # | חומרה | תחום | תרחיש | צפוי | בפועל |', '|---|---|---|---|---|---|', ...out.defects.map((r) => `| ${r.id} | ${r.severity} | ${r.area} | ${r.question.replace(/\|/g, '/')} | ${r.expected.replace(/\|/g, '/')} | ${r.actual.replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 200)} |`)] : ['אין.']),
    '',
    '## כל התרחישים', '',
    '| # | תחום | חומרה | תרחיש | צפוי | בפועל | כתיבות | עבר |', '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.id} | ${r.area} | ${r.severity} | ${r.question.replace(/\|/g, '/')} | ${r.expected.replace(/\|/g, '/')} | ${r.actual.replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 160)} | ${r.writes} | ${r.pass ? '✅' : '❌'} |`),
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'independent-qa.md'), md, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`INDEPENDENT-QA total=${out.total} passed=${out.passed} failed=${out.failed} overall=${out.overall}`);
});
