// Dalia AI — scored scenario suite. Each scenario is a real conversation through the engine (the same code the
// window runs) against an isolated in-memory garage with FAKE test data. For each one it records the question,
// the expected result, what Dalia said / showed, whether the data was right, whether the action succeeded,
// whether she had to ask, duplicates and errors — and scores every area. Report: docs/dalia-scorecard/.
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import fs from 'node:fs';
import path from 'node:path';
import { DALIA_VOICE_PROMPTS as P, isFixedDaliaPrompt } from '../../../supabase/functions/_shared/daliaVoicePrompts';
import { answerVoiceWorkflow, startVoiceWorkflow, type VoiceEnv, type VoiceResult, type VoiceTurn, type VoiceWorkflowType } from './daliaVoiceEngine';
import type { GarageCase, GarageCaseData, GarageCustomer, GarageVehicle, GarageVoiceActions } from '@/modules/garage-management/garageVoiceActions';

// ---------------------------------------------------------------------------
// Isolated test garage (fake data only)
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-24T12:00:00'); // Saturday; the week started Sunday 18.10
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
  seq = 0;
  constructor() {
    const c1 = cust('c1', 'משה כהן', '052-1111111', 101, '2026-09-01T09:00:00Z');
    const c2 = cust('c2', 'דנה לוי', '054-2222222', 102, '2026-10-10T09:00:00Z');
    const c3 = cust('c3', 'אלדן תחבורה', '03-5551111', 103, '2026-08-01T09:00:00Z', 'business');
    const c4 = cust('c4', 'רינה בדיקה', '050-4444444', 104, '2026-10-23T15:00:00Z');
    this.customers.push(c1, c2, c3, c4);
    const v1 = veh('v1', 'c1', '1234567', 'טויוטה', 'קורולה');
    const v2 = veh('v2', 'c2', '7654321', 'מאזדה', '3');
    const v3 = veh('v3', 'c3', '11-222-33', 'סקודה', 'אוקטביה');
    const v4 = veh('v4', 'c3', '22-333-44', 'פולקסווגן', 'קאדי');
    const v5 = veh('v5', 'c1', '9988776', 'יונדאי', 'i20');
    this.vehicles.push(v1, v2, v3, v4, v5);
    const k = (id: string, num: string, c: GarageCustomer, v: GarageVehicle, by: string, created: string, data: GarageCaseData & Record<string, unknown>): GarageCase => ({
      id, case_number: num, customer_id: c.id, vehicle_id: v.id, status: 'בדיקת רכב', opened_by: by, opened_by_name: by === ME ? 'אני' : 'עובד אחר',
      customer_name_snapshot: c.name, vehicle_plate_snapshot: v.plate, vehicle_label_snapshot: `${v.make} ${v.model}`, case_data: data, created_at: created,
    });
    this.cases.push(
      k('k1', 'GM-2026-0041', c1, v1, OTHER, '2026-10-20T08:00:00Z', { quoteCreated: true, quoteWorks: [{ id: 'w1', part: 'בדיקה', qty: 1, price: 100 }], quoteParts: [{ id: 'p1', name: 'פילטר', qty: 2, price: 80, supplier: 'us' }], timeline: [] }),
      k('k2', 'GM-2026-0042', c2, v2, ME, '2026-10-05T08:00:00Z', {
        quoteCreated: true, quoteApproved: true, workOrderSaved: true, workOrderAmount: 1180, finalApprovedAmount: 1180, paymentStatus: 'paid', workFinished: true,
        caseClosed: true, caseClosedAt: '2026-10-22T14:00:00Z', payments: [{ amount: 1180, payment_date: '2026-10-22', created_at: '2026-10-22T14:00:00Z' }],
        timeline: [{ at: '2026-10-06T10:00:00Z', text: 'הצעת המחיר אושרה ע״י דנה לוי (חתימה דיגיטלית)' }],
      }),
      k('k3', 'GM-2026-0129', c3, v3, ME, '2026-10-19T08:00:00Z', {
        quoteCreated: true, quoteApproved: true, workOrderSaved: true, workOrderAmount: 2000, workStarted: true, paymentStatus: 'pending',
        payments: [{ amount: 500, payment_date: '2026-10-21', created_at: '2026-10-21T09:00:00Z' }],
        extraApprovals: [{ id: 'x1', text: 'תומך פגוש', price: 300, status: 'pending_customer' }], timeline: [],
      }),
      k('k4', 'GM-2026-0130', c3, v4, OTHER, '2026-10-23T10:00:00Z', { quoteCreated: true, timeline: [] }),
      k('k5', 'GM-2026-0010', c1, v5, ME, '2026-06-01T08:00:00Z', { timeline: [] }),
      k('k6', 'GM-2026-0005', c2, v2, OTHER, '2026-09-01T08:00:00Z', { caseClosed: true, caseClosedAt: '2026-09-15T10:00:00Z', finalApprovedAmount: 800, paymentStatus: 'paid', payments: [{ amount: 800, payment_date: '2026-09-15' }], timeline: [] }),
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
  async createCustomer(d: { customer_type: 'private' | 'business'; name: string; company_name: string; phone: string; address?: string; contact_person?: string; notes?: string }) {
    this.writes.push('createCustomer');
    const c = { ...cust(this.id('cn'), d.name, d.phone, 200 + this.seq, NOW.toISOString(), d.customer_type), address: d.address || '', contact_person: d.contact_person || '', notes: d.notes || '' };
    this.customers.push(c);
    this.lastCreatedCustomer = c;
    return { customer: c, duplicates: [] };
  }
  lastCreatedCustomer: GarageCustomer | null = null;
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
  async uploadCaseMedia() { this.writes.push('upload'); }
  async updateCustomerContact(id: string) { this.writes.push('updateCustomerContact'); return this.customers.find((c) => c.id === id)!; }
  async updateCustomerDetails(id: string, patch: { phone?: string }) { this.writes.push(`updateCustomerDetails:${id}`); const c = this.customers.find((x) => x.id === id)!; Object.assign(c, patch); return c; }
  async listSuppliers() { return []; }
  async createSupplier(name: string) { this.writes.push('createSupplier'); return { supplier: { id: 's', name, supplier_number: 'S', phone: null } as never }; }
  async listInvoices() { return []; }
  async createInvoice() { this.writes.push('createInvoice'); return {} as never; }
}

// ---------------------------------------------------------------------------
// Runner + scorecard
// ---------------------------------------------------------------------------

type Area = 'שיחה כללית' | 'איתור תיקים' | 'לקוחות ורכבים' | 'דוחות כספיים' | 'דוחות תפעוליים' | 'הצעות מחיר ופרטי תיק' | 'תיקון פרטים' | 'קבלת רכב' | 'סגירת תיקים' | 'ארכוב ומחיקה' | 'הרשאות' | 'רצף שיחה ודיבור';
interface Row {
  id: number; area: Area; question: string; expected: string; actual: string;
  dataOk: boolean; actionOk: boolean; clarified: boolean; duplicates: boolean; error: string; pass: boolean; fix?: string;
}
const results: Row[] = [];
let idSeq = 0;

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

async function talk(g: Garage, start: VoiceWorkflowType, answers: string[], ctx = {}): Promise<{ last: VoiceResult; all: VoiceResult[] }> {
  const env: VoiceEnv = { actions: g, now: () => NOW };
  let r = await startVoiceWorkflow(start, ctx, env);
  const all = [r];
  for (const a of answers) {
    if (!r.session) break;
    r = await answerVoiceWorkflow(r.session, a, env);
    all.push(r);
  }
  return { last: r, all };
}

function scenario(area: Area, question: string, expected: string, run: (g: Garage) => Promise<{ ok: boolean; dataOk?: boolean; actionOk?: boolean; clarified?: boolean; actual: string; fix?: string }>, setup?: (g: Garage) => void) {
  const id = ++idSeq;
  it(`#${id} [${area}] ${question}`, async () => {
    const g = new Garage();
    setup?.(g);
    const before = new Set(g.cases.map((c) => c.id));
    let row: Row;
    try {
      const out = await run(g);
      const dup = g.cases.filter((c) => !before.has(c.id)).length > 1 || g.writes.filter((w) => w === 'createCustomer').length > 1;
      row = { id, area, question, expected, actual: out.actual.slice(0, 400), dataOk: out.dataOk ?? out.ok, actionOk: out.actionOk ?? out.ok, clarified: !!out.clarified, duplicates: dup, error: '', pass: out.ok && !dup, fix: out.ok ? undefined : out.fix };
    } catch (e) {
      row = { id, area, question, expected, actual: '', dataOk: false, actionOk: false, clarified: false, duplicates: false, error: e instanceof Error ? e.message : String(e), pass: false, fix: 'חריגה בזמן ריצה — לבדוק את הנתיב בקוד' };
    }
    results.push(row);
    expect(row.pass, `${question}\nexpected: ${expected}\nactual: ${row.actual || row.error}`).toBe(true);
  });
}


const ask = async (g: Garage, ...q: string[]) => talk(g, 'general_action', q);
const has = (text: string, ...needles: Array<string | RegExp>) => needles.every((n) => (typeof n === 'string' ? text.includes(n) : n.test(text)));

// ---------------------------------------------------------------------------
// 1. General conversation
// ---------------------------------------------------------------------------
describe('1. שיחה כללית', () => {
  scenario('שיחה כללית', 'שלום', 'ברכה קבועה, השיחה נשארת פתוחה', async (g) => { const { last } = await ask(g, 'שלום'); return { ok: last.turn.say === P.smallTalkHello && !!last.session, actual: shown(last.turn) }; });
  scenario('שיחה כללית', 'מה נשמע', 'מענה קבוע', async (g) => { const { last } = await ask(g, 'מה נשמע'); return { ok: last.turn.say === P.smallTalkHowAreYou, actual: shown(last.turn) }; });
  scenario('שיחה כללית', 'תודה', 'מענה קבוע', async (g) => { const { last } = await ask(g, 'תודה'); return { ok: last.turn.say === P.smallTalkThanks, actual: shown(last.turn) }; });
  scenario('שיחה כללית', 'איך מחליפים מגב ברכב', 'מועבר לצ׳אט של דליה, השיחה פתוחה', async (g) => { const { last } = await ask(g, 'איך מחליפים מגב ברכב'); return { ok: last.turn.handoff === 'איך מחליפים מגב ברכב' && !!last.session, actual: shown(last.turn) }; });
  scenario('שיחה כללית', 'זהו תודה', 'סיום השיחה', async (g) => { const { last } = await ask(g, 'זהו תודה'); return { ok: last.session === null, actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
// 2. Finding cases (real creation / closing dates, "me" vs "the shop")
// ---------------------------------------------------------------------------
describe('2. איתור תיקים', () => {
  scenario('איתור תיקים', 'תביאי לי את התיק האחרון שפתחת', 'שאלת הבהרה: שלך או של המוסך (התיקים שונים)', async (g) => { const { last } = await ask(g, 'תביאי לי את התיק האחרון שפתחת'); return { ok: has(shown(last.turn), 'GM-2026-0129', 'GM-2026-0130') && /שאתה פתחת|במוסך/.test(last.turn.say), clarified: true, actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'נתיב האתר: השאלה נכתבת בתיבה בלי לבחור פעולה (פותחת שיחה כללית עם השאלה)', 'השאלה נענית מיד — לא נבלעת', async (g) => { const r = await startVoiceWorkflow('general_action', {}, { actions: g, now: () => NOW }, 'מה התיק האחרון שנפתח במוסך?'); return { ok: has(r.turn.say, 'GM-2026-0130') && !!r.session, actual: shown(r.turn), fix: 'התשובה מוחזרת כ-reask ולכן נזרקה במסלול ה-prefill' }; });
  scenario('איתור תיקים', 'תביאי לי את התיק האחרון שפתחת → "שאני פתחתי"', 'GM-2026-0129 (נפתח 19.10 ע"י המשתמש)', async (g) => { const { last } = await ask(g, 'תביאי לי את התיק האחרון שפתחת', 'שאני פתחתי'); return { ok: has(last.turn.say, 'GM-2026-0129') && !!last.turn.ui?.some((u) => u.type === 'choices' && u.options.some((o) => o.label.includes('פתחי'))), clarified: true, actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'תביאי לי את התיק האחרון שפתחתי', 'GM-2026-0129 בלי הבהרה', async (g) => { const { last } = await ask(g, 'תביאי לי את התיק האחרון שפתחתי'); return { ok: has(last.turn.say, 'GM-2026-0129'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'מה התיק האחרון שנפתח במוסך?', 'GM-2026-0130 (23.10)', async (g) => { const { last } = await ask(g, 'מה התיק האחרון שנפתח במוסך?'); return { ok: has(last.turn.say, 'GM-2026-0130', '23.10.2026'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'איזה תיק סגרנו אחרון?', 'GM-2026-0042 (נסגר 22.10)', async (g) => { const { last } = await ask(g, 'איזה תיק סגרנו אחרון?'); return { ok: has(last.turn.say, 'GM-2026-0042', '22.10.2026'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'מתי סגרנו את התיק של הרכב 7654321?', 'נסגר 22.10.2026 (התיק האחרון של הרכב)', async (g) => { const { last } = await ask(g, 'מתי סגרנו את התיק של הרכב 7654321?'); return { ok: has(last.turn.say, '22.10.2026'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'תראי לי את כל התיקים הפתוחים', '4 תיקים פתוחים ברשימה', async (g) => { const { last } = await ask(g, 'תראי לי את כל התיקים הפתוחים'); const list = last.turn.ui?.find((u) => u.type === 'list'); return { ok: list?.type === 'list' && list.rows.length === 4, actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'כמה תיקים סגרנו השבוע?', '1 (לפי תאריך סגירה אמיתי)', async (g) => { const { last } = await ask(g, 'כמה תיקים סגרנו השבוע?'); return { ok: /נסגרו 1 תיקים/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'איזה תיק נשאר פתוח הכי הרבה זמן?', 'GM-2026-0010 (מ-01.06)', async (g) => { const { last } = await ask(g, 'איזה תיק נשאר פתוח הכי הרבה זמן?'); return { ok: has(last.turn.say, 'GM-2026-0010'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'איזה תיק פתחנו ללקוח משה כהן?', '2 תיקים של משה כהן', async (g) => { const { last } = await ask(g, 'איזה תיק פתחנו ללקוח משה כהן?'); return { ok: /2 תיקים/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'תמצאי את התיק לפי מספר הרכב → 1234567', 'שואלת את מספר הרכב, אחר כך GM-2026-0041', async (g) => { const { all, last } = await ask(g, 'תמצאי את התיק לפי מספר הרכב', '1234567'); return { ok: /איזה תיק|מספר רכב/.test(all[1].turn.say) && has(shown(last.turn), 'GM-2026-0041'), clarified: true, actual: `${all[1].turn.say} → ${shown(last.turn)}` }; });
  scenario('איתור תיקים', 'תראי לי תיקים שנפתחו אתמול', 'GM-2026-0130 בלבד', async (g) => { const { last } = await ask(g, 'תראי לי תיקים שנפתחו אתמול'); const list = last.turn.ui?.find((u) => u.type === 'list'); return { ok: list?.type === 'list' && list.rows.length === 1 && list.rows[0].title.includes('0130'), actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'תפתחי את תיק 42', 'פותחת את GM-2026-0042', async (g) => { const { last } = await ask(g, 'תפתחי את תיק 42'); return { ok: last.turn.openCaseId === 'k2', actual: shown(last.turn) }; });
  scenario('איתור תיקים', 'תפתחי את תיק GM-2026-0129 (מספר מלא, גם בתחילית אחרת)', 'פותחת ישר בלי אישור נוסף', async (g) => { const { last } = await ask(g, 'תפתחי את תיק GM-2026-0129'); g.cases.find((c) => c.id === 'k4')!.case_number = 'TEST-0130'; const r2 = await ask(g, 'תפתחי את תיק TEST-0130'); return { ok: last.turn.openCaseId === 'k3' && r2.last.turn.openCaseId === 'k4', actual: `${shown(last.turn)} || ${shown(r2.last.turn)}`, fix: 'מספר תיק עם תחילית שאינה GM לא זוהה' }; });
  scenario('איתור תיקים', 'איתור תיק (כפתור) → "התיק האחרון שנפתח במוסך"', 'GM-2026-0130', async (g) => { const { last } = await talk(g, 'find_case', ['מה התיק האחרון שנפתח במוסך']); return { ok: has(last.turn.say, 'GM-2026-0130'), actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
// 3. Customers and vehicles
// ---------------------------------------------------------------------------
describe('3. לקוחות ורכבים', () => {
  scenario('לקוחות ורכבים', 'מי הלקוח האחרון שפתחנו?', 'רינה בדיקה (23.10)', async (g) => { const { last } = await ask(g, 'מי הלקוח האחרון שפתחנו?'); return { ok: has(last.turn.say, 'רינה בדיקה'), actual: shown(last.turn) }; });
  scenario('לקוחות ורכבים', 'כמה רכבים יש לאלדן?', '2 רכבים', async (g) => { const { last } = await ask(g, 'כמה רכבים יש לאלדן?'); return { ok: /2 רכבים/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('לקוחות ורכבים', 'תמצאי לי לקוח לפי טלפון 052-1111111', 'משה כהן', async (g) => { const { last } = await ask(g, 'תמצאי לי לקוח לפי טלפון 052-1111111'); return { ok: has(shown(last.turn), 'משה כהן'), actual: shown(last.turn) }; });
  scenario('לקוחות ורכבים', 'תמצאי לי לקוח לפי טלפון → 0542222222', 'שואלת טלפון, מוצאת את דנה לוי', async (g) => { const { all, last } = await ask(g, 'תמצאי לי לקוח לפי טלפון', '0542222222'); return { ok: all[1].turn.say.includes('טלפון') && has(shown(last.turn), 'דנה לוי'), clarified: true, actual: `${all[1].turn.say} → ${shown(last.turn)}` }; });
  scenario('לקוחות ורכבים', 'תראי לי את כל הרכבים של אלדן', '2 רכבים: 11-222-33, 22-333-44', async (g) => { const { last } = await ask(g, 'תראי לי את כל הרכבים של אלדן'); return { ok: has(shown(last.turn), '11-222-33', '22-333-44'), actual: shown(last.turn) }; });
  scenario('לקוחות ורכבים', 'איזה רכב נמצא עכשיו בעבודה?', 'GM-2026-0129 (11-222-33)', async (g) => { const { last } = await ask(g, 'איזה רכב נמצא עכשיו בעבודה?'); return { ok: has(shown(last.turn), '0129'), actual: shown(last.turn) }; });
  scenario('לקוחות ורכבים', 'תראי לי את היסטוריית העבודות של הרכב 7654321', '2 תיקים (0042, 0005)', async (g) => { const { last } = await ask(g, 'תראי לי את היסטוריית העבודות של הרכב 7654321'); return { ok: /2 תיקים/.test(last.turn.say) && has(shown(last.turn), '0042', '0005'), actual: shown(last.turn) }; });
  scenario('לקוחות ורכבים', 'היסטוריה → "כמה רכבים יש ללקוח הזה?" (המשך הקשר)', 'דנה לוי: 1 רכב', async (g) => { const { last } = await ask(g, 'תראי לי את היסטוריית העבודות של הרכב 7654321', 'כמה רכבים יש ללקוח הזה?'); return { ok: has(last.turn.say, 'דנה לוי', '1 רכבים'), actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
// 4. Money (received ≠ balances ≠ quotes ≠ orders)
// ---------------------------------------------------------------------------
describe('4. דוחות כספיים', () => {
  scenario('דוחות כספיים', 'כמה כסף נכנס היום?', '₪0, עם התקופה', async (g) => { const { last } = await ask(g, 'כמה כסף נכנס היום?'); return { ok: /התקבל בפועל 0/.test(clean(last.turn.say)) && /היום/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('דוחות כספיים', 'כמה נכנס השבוע?', '₪1,680 (500 + 1,180)', async (g) => { const { last } = await ask(g, 'כמה נכנס השבוע?'); return { ok: clean(last.turn.say).includes('1680'), actual: shown(last.turn) }; });
  scenario('דוחות כספיים', 'כמה נכנס החודש?', '₪1,680 (ספטמבר לא נכלל)', async (g) => { const { last } = await ask(g, 'כמה נכנס החודש?'); return { ok: clean(last.turn.say).includes('1680'), actual: shown(last.turn) }; });
  scenario('דוחות כספיים', 'כמה כסף קיבלנו מאלדן בחודש האחרון?', '₪500', async (g) => { const { last } = await ask(g, 'כמה כסף קיבלנו מאלדן בחודש האחרון?'); return { ok: clean(last.turn.say).includes('500') && !clean(last.turn.say).includes('1680'), actual: shown(last.turn) }; });
  scenario('דוחות כספיים', 'כמה כסף עדיין חייבים לנו?', '₪1,807 (307 + 1,500) — יתרות, לא תקבולים', async (g) => { const { last } = await ask(g, 'כמה כסף עדיין חייבים לנו?'); return { ok: clean(last.turn.say).includes('1807'), actual: shown(last.turn) }; });
  scenario('דוחות כספיים', 'איזה לקוח הכניס לנו הכי הרבה כסף?', 'דנה לוי (₪1,980)', async (g) => { const { last } = await ask(g, 'איזה לקוח הכניס לנו הכי הרבה כסף?'); return { ok: has(last.turn.say, 'דנה לוי') && clean(last.turn.say).includes('1980'), actual: shown(last.turn) }; });
  scenario('דוחות כספיים', 'כמה כסף יש בתיקים שעדיין פתוחים?', '₪2,307 לתשלום (307 + 2,000)', async (g) => { const { last } = await ask(g, 'כמה כסף יש בתיקים שעדיין פתוחים?'); return { ok: clean(last.turn.say).includes('2307'), actual: shown(last.turn) }; });
  scenario('דוחות כספיים', 'כמה כסף נכנס? → "השבוע"', 'שואלת תקופה, אחר כך ₪1,680', async (g) => { const { all, last } = await ask(g, 'כמה כסף נכנס?', 'השבוע'); return { ok: /תקופה/.test(all[1].turn.say) && clean(last.turn.say).includes('1680'), clarified: true, actual: `${all[1].turn.say} → ${shown(last.turn)}` }; });
  scenario('דוחות כספיים', 'כמה כסף נכנס השבוע מחברת קוקה?', 'לא מוצאת — לא ממציאה ₪0', async (g) => { const { last } = await ask(g, 'כמה כסף נכנס השבוע מחברת קוקה?'); return { ok: /לא מצאתי/.test(last.turn.say), actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
// 5. Operational reports
// ---------------------------------------------------------------------------
describe('5. דוחות תפעוליים', () => {
  scenario('דוחות תפעוליים', 'כמה הצעות מחיר הוצאנו?', '4 הצעות (0041, 0042, 0129, 0130)', async (g) => { const { last } = await ask(g, 'כמה הצעות מחיר הוצאנו?'); return { ok: /4 הצעות/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('דוחות תפעוליים', 'כמה הצעות אושרו?', '2 (0042, 0129)', async (g) => { const { last } = await ask(g, 'כמה הצעות אושרו?'); return { ok: /2 הצעות/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('דוחות תפעוליים', 'כמה הצעות אושרו? (הצעה מאושרת בלי סימון "נוצרה" — כמו GM-2026-0076 ב-STAGING)', '3 — הצעה מאושרת נספרת', async (g) => { const { last } = await ask(g, 'כמה הצעות אושרו?'); return { ok: /3 הצעות/.test(last.turn.say), actual: shown(last.turn) }; }, (g) => { g.cases.find((c) => c.id === 'k5')!.case_data.quoteApproved = true; });
  scenario('דוחות תפעוליים', 'כמה רכבים נכנסו השבוע?', '3 (19.10, 20.10, 23.10)', async (g) => { const { last } = await ask(g, 'כמה רכבים נכנסו השבוע?'); return { ok: /נכנסו 3 רכבים/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('דוחות תפעוליים', 'כמה תיקים סגרנו החודש?', '1 (0042)', async (g) => { const { last } = await ask(g, 'כמה תיקים סגרנו החודש?'); return { ok: /נסגרו 1 תיקים/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('דוחות תפעוליים', 'תראי לי את כל התיקים של אלדן', '2 תיקים (0129, 0130)', async (g) => { const { last } = await ask(g, 'תראי לי את כל התיקים של אלדן'); return { ok: /2 תיקים/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('דוחות תפעוליים', 'איזה הזמנות עדיין לא סודרו?', '1 (0129, תשלום ממתין)', async (g) => { const { last } = await ask(g, 'איזה הזמנות עדיין לא סודרו?'); return { ok: /^1 הזמנות/.test(last.turn.say) && has(shown(last.turn), '0129'), actual: shown(last.turn) }; });
  scenario('דוחות תפעוליים', 'איזה תיקים חסרה להם הזמנה?', '3 (0041, 0130, 0010)', async (g) => { const { last } = await ask(g, 'איזה תיקים חסרה להם הזמנה?'); const list = last.turn.ui?.find((u) => u.type === 'list'); return { ok: list?.type === 'list' && list.rows.length === 3, actual: shown(last.turn) }; });
  scenario('דוחות תפעוליים', 'דוחות (כפתור) → "כמה כסף נכנס השבוע מאלדן"', 'דוח: ₪500 מאלדן', async (g) => { const { last } = await talk(g, 'reports', ['כמה כסף נכנס השבוע מאלדן']); return { ok: shown(last.turn).includes('500'), actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
// 6. Quotes and case details
// ---------------------------------------------------------------------------
describe('6. הצעות מחיר ופרטי תיק', () => {
  scenario('הצעות מחיר ופרטי תיק', 'כמה הייתה הצעת המחיר בתיק 41?', '₪260 לפני מע"מ, ₪307 כולל', async (g) => { const { last } = await ask(g, 'כמה הייתה הצעת המחיר בתיק 41?'); return { ok: clean(last.turn.say).includes('260') && clean(last.turn.say).includes('307'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'מה המחיר הסופי של העבודה בתיק 42?', '₪1,180', async (g) => { const { last } = await ask(g, 'מה המחיר הסופי של העבודה בתיק 42?'); return { ok: clean(last.turn.say).includes('1180'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'איזה חלקים הוספנו בתיק 41?', 'פילטר × 2', async (g) => { const { last } = await ask(g, 'איזה חלקים הוספנו בתיק 41?'); return { ok: has(shown(last.turn), 'פילטר'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'האם יש הזמנה מאושרת בתיק 129?', 'כן, ₪2,000', async (g) => { const { last } = await ask(g, 'האם יש הזמנה מאושרת בתיק 129?'); return { ok: last.turn.say.startsWith('כן') && clean(last.turn.say).includes('2000'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'האם יש תוספת עבודה בתיק 129?', 'כן, 1 (תומך פגוש, ממתינה)', async (g) => { const { last } = await ask(g, 'האם יש תוספת עבודה בתיק 129?'); return { ok: last.turn.say.startsWith('כן') && has(shown(last.turn), 'תומך פגוש'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'כמה הלקוח שילם בתיק 129?', '₪500', async (g) => { const { last } = await ask(g, 'כמה הלקוח שילם בתיק 129?'); return { ok: clean(last.turn.say).includes('500'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'כמה נשאר לו לשלם בתיק 129?', '₪1,500', async (g) => { const { last } = await ask(g, 'כמה נשאר לו לשלם בתיק 129?'); return { ok: clean(last.turn.say).includes('1500'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'מי אישר את ההצעה בתיק 42?', 'מציגה את רשומת האישור (דנה לוי, חתימה)', async (g) => { const { last } = await ask(g, 'מי אישר את ההצעה בתיק 42?'); return { ok: has(shown(last.turn), 'דנה לוי'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'מי אישר את ההצעה בתיק 129?', 'אושרה, אבל לא נשמר מי — לא ממציאה', async (g) => { const { last } = await ask(g, 'מי אישר את ההצעה בתיק 129?'); return { ok: /לא נשמר/.test(last.turn.say), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'האם התיק 129 מוכן לסגירה?', 'לא — עם רשימת החוסרים', async (g) => { const { last } = await ask(g, 'האם התיק 129 מוכן לסגירה?'); return { ok: /לא מוכן/.test(last.turn.say) && (last.turn.display || '').includes('•'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'תפתחי את תיק 129 → "כמה נשאר לו לשלם?" (הקשר)', '₪1,500 בלי לשאול איזה תיק', async (g) => { const { last } = await ask(g, 'תפתחי את תיק 129', 'כמה נשאר לו לשלם?'); return { ok: clean(last.turn.say).includes('1500'), actual: shown(last.turn) }; });
  scenario('הצעות מחיר ופרטי תיק', 'כמה הייתה הצעת המחיר בתיק הזה? (בלי הקשר)', 'שואלת על איזה תיק', async (g) => { const { last } = await ask(g, 'כמה הייתה הצעת המחיר בתיק הזה?'); return { ok: /איזה תיק/.test(last.turn.say), clarified: true, actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
// 7. Corrections in drafts (nothing saved before approval)
// ---------------------------------------------------------------------------
const NEW_CUSTOMER = ['יוסי מזרחי', '0525551234', 'פרטי'];
describe('7. תיקון פרטים', () => {
  scenario('תיקון פרטים', 'תתקני את שם הלקוח → "יוסי לוי"', 'שואלת רק את השם, מעדכנת, מציגה סיכום ושואלת על עוד תיקון', async (g) => { const { all, last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'תתקני את שם הלקוח', 'יוסי לוי']); return { ok: all.at(-2)!.turn.say === P.correctionValueAsk && last.turn.say === P.correctionsApplied && (last.turn.display || '').includes('יוסי לוי') && !g.writes.length, actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'תשני את הטלפון ל 0547779999 ואת סוג הלקוח לעסקי', 'שני השינויים בבת אחת', async (g) => { const { last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'תשני את הטלפון ל 0547779999 ואת סוג הלקוח לעסקי']); const d = last.session?.data; return { ok: d?.customerPhone === '054-7779999' && d?.customerType === 'business', actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'תוסיפי איש קשר → "רון כהן"', 'איש קשר נוסף לטיוטה', async (g) => { const { last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'תוסיפי איש קשר', 'רון כהן']); return { ok: last.session?.data.contactPerson === 'רון כהן' && (last.turn.display || '').includes('איש קשר: רון כהן'), actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'תוסיפי הערה לקוח VIP → תמחקי את ההערה האחרונה', 'ההערה נוספה ואז נמחקה', async (g) => { const { all, last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'תוסיפי הערה לקוח VIP', 'תמחקי את ההערה האחרונה']); return { ok: (all.at(-2)!.turn.display || '').includes('VIP') && !(last.session?.data.customerNotes || []).length, actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'תשני את כתובת הלקוח לרחוב הרצל 5 חיפה', 'כתובת בטיוטה', async (g) => { const { last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'תשני את כתובת הלקוח לרחוב הרצל 5 חיפה']); return { ok: /הרצל 5 חיפה/.test(last.session?.data.customerAddress || ''), actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'אישור אחרי תיקונים → נשמר עם הערכים המתוקנים', 'createCustomer עם השם, הטלפון, הכתובת ואיש הקשר המתוקנים — פעם אחת', async (g) => {
    await talk(g, 'new_customer', [...NEW_CUSTOMER, 'תשני את השם ליוסי לוי', 'תשני את כתובת הלקוח לרחוב הרצל 5', 'תוסיפי איש קשר רון', 'כן']);
    const c = g.lastCreatedCustomer;
    return { ok: !!c && c.name === 'יוסי לוי' && c.address.includes('הרצל 5') && c.contact_person === 'רון' && g.writes.filter((w) => w === 'createCustomer').length === 1, actual: c ? `${c.name} · ${c.phone} · ${c.address} · ${c.contact_person}` : 'לא נשמר' };
  });
  scenario('תיקון פרטים', 'שנת הייצור היא 2022 ולא 2021 (לפני שמירת הרכב)', 'השנה מתעדכנת ל-2022', async (g) => { const { last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'כן', 'בדיבור', '12-345-99', 'טויוטה קורולה', '2021', 'שנת הייצור היא 2022 ולא 2021']); return { ok: last.session?.data.year === 2022 && last.turn.say === P.correctionsApplied, actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'תתקני את הדגם של הרכב למאזדה 3', 'יצרן מאזדה, דגם 3', async (g) => { const { last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'כן', 'בדיבור', '12-345-99', 'טויוטה קורולה', '2021', 'תתקני את הדגם של הרכב למאזדה 3']); return { ok: last.session?.data.make === 'מאזדה' && last.session?.data.model === '3', actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'תשני את מספר הרישוי ל 12-345-88', 'מספר רישוי חדש', async (g) => { const { last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'כן', 'בדיבור', '12-345-99', 'טויוטה קורולה', '2021', 'תשני את מספר הרישוי ל 12-345-88']); return { ok: last.session?.data.plate === '1234588', actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'תמחקי את הרכב מהטיוטה, אני רוצה להכניס רכב אחר', 'פרטי הרכב נמחקים ושאלת הרכב חוזרת; שום דבר לא נשמר', async (g) => { const { last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'כן', 'בדיבור', '12-345-99', 'טויוטה קורולה', '2021', 'תמחקי את הרכב מהטיוטה, אני רוצה להכניס רכב אחר']); return { ok: !last.session?.data.plate && /רכב/.test(last.turn.followSay || last.turn.say) && !g.writes.includes('createVehicle'), actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'קבלת רכב: תעדכני את הקילומטראז׳ ל 125000', 'ק"מ 125000 בסיכום', async (g) => { const { last } = await talk(g, 'intake', ['1234567', 'כן', 'רעש', 'בדיקה', 'תקין', 'לא', '120000', 'חצי', '1', 'לא', 'לא', 'תעדכני את הקילומטראז\' ל 125000']); return { ok: last.session?.data.km === '125000' && (last.turn.display || '').includes('125000'), actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'תוספת לתיק: תשני את המחיר ל 400', 'מחיר התוספת 400', async (g) => { const { last } = await talk(g, 'quote', ['תוספת עבודה או חלקים לתיק קיים', '11-222-33', 'נמצא שהמגן האחורי סדוק', 'גם וגם', '650', 'רישום פנימי', 'תשני את המחיר ל 400']); return { ok: last.session?.data.extraPrice === 400, actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'תשני את הטלפון ל 123 (לא תקין)', 'לא משנה, מסבירה למה', async (g) => { const { last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'תשני את הטלפון ל 123']); return { ok: last.session?.data.customerPhone === '052-5551234' && /לא עודכן|לא הצלחתי/.test(shown(last.turn)), actual: shown(last.turn) }; });
  scenario('תיקון פרטים', 'עוד תיקון (כפתור) → מה לתקן?', 'שואלת מה לתקן', async (g) => { const { last } = await talk(g, 'new_customer', [...NEW_CUSTOMER, 'תשני את הטלפון ל 0547779999', 'עוד תיקון']); return { ok: last.turn.say === P.correctionWhat, actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
// 8. Intake, 9. Closing
// ---------------------------------------------------------------------------
describe('8–9. קבלת רכב וסגירה', () => {
  scenario('קבלת רכב', 'קבלת רכב: "דנה לוי" (תיקים סגורים בלבד)', 'מוצאת את הרכב, מציגה היסטוריה, תיק חדש — ממשיכה לשאלון', async (g) => { const { last } = await talk(g, 'intake', ['דנה לוי']); return { ok: last.turn.say === P.intakeComplaint && /תיקים של הרכב/.test(last.turn.display || ''), actual: shown(last.turn) }; });
  scenario('קבלת רכב', 'קבלת רכב לרכב עם תיק פתוח → "לא"', 'לא פותחת תיק כפול', async (g) => { const { last } = await talk(g, 'intake', ['1234567', 'לא']); return { ok: last.turn.say === P.intakeNoSecondCase && !g.writes.length, actual: shown(last.turn) }; });
  scenario('קבלת רכב', 'קבלת רכב → אישור בלי תמונות → "אחר כך"', 'פרטים נשמרים, הרכב לא מסומן כהתקבל', async (g) => { const { last } = await talk(g, 'intake', ['1234567', 'כן', 'רעש', 'בדיקה', 'תקין', 'לא', '120000', 'חצי', '1', 'לא', 'לא', 'כן', 'אחר כך']); return { ok: last.turn.say === P.photosLater && !g.cases.find((c) => c.id === 'k1')!.case_data.intakeDone, actual: shown(last.turn) }; });
  scenario('סגירת תיקים', 'סגירת תיק 42 (כבר סגור)', 'אומרת שכבר סגור, לא נוגעת', async (g) => { const { last } = await talk(g, 'close_case', ['תיק 42']); return { ok: !g.writes.some((w) => w.startsWith('closeCase')) && /0042 כבר סגור/.test(shown(last.turn)), actual: shown(last.turn) }; });
  scenario('סגירת תיקים', 'סגירת תיק 129 (עדיין בעבודה)', 'לא נסגר, מציגה מה חסר', async (g) => { const { all } = await talk(g, 'close_case', ['תיק 129']); const t = shown(all.at(-1)!.turn); return { ok: !g.writes.some((w) => w.startsWith('closeCase')), actual: t }; });
});

// ---------------------------------------------------------------------------
// 10. Archive and delete — never deleted by voice
// ---------------------------------------------------------------------------
describe('10. ארכוב ומחיקה', () => {
  scenario('ארכוב ומחיקה', 'תמחקי את התיק 41', 'מזהה את התיק ושואלת: מחיקה או הסתרה', async (g) => { const { last } = await ask(g, 'תמחקי את התיק 41'); return { ok: /למחוק|להסתיר/.test(last.turn.say) && has(shown(last.turn), '0041') && !g.writes.length, clarified: true, actual: shown(last.turn) }; });
  scenario('ארכוב ומחיקה', 'תמחקי את התיק 41 → "למחוק"', 'לא מוחקת בקול — מסבירה', async (g) => { const { last } = await ask(g, 'תמחקי את התיק 41', 'למחוק'); return { ok: last.turn.say === P.deleteNotByVoice && !g.writes.length && g.cases.some((c) => c.id === 'k1'), actual: shown(last.turn) }; });
  scenario('ארכוב ומחיקה', 'תמחקי את התיק 41 → "רק להסתיר"', 'אין ארכיון במערכת — לא משנה דבר', async (g) => { const { last } = await ask(g, 'תמחקי את התיק 41', 'רק להסתיר'); return { ok: last.turn.say === P.archiveNotAvailable && !g.writes.length, actual: shown(last.turn) }; });
  scenario('ארכוב ומחיקה', 'תעבירי את תיק 41 לארכיון', 'אין ארכיון — לא משנה דבר', async (g) => { const { last } = await ask(g, 'תעבירי את תיק 41 לארכיון'); return { ok: /אין עדיין ארכיון/.test(last.turn.say) && !g.writes.length, actual: shown(last.turn) }; });
  scenario('ארכוב ומחיקה', 'תשחזרי את תיק 41 מהארכיון', 'אין ארכיון — מסבירה', async (g) => { const { last } = await ask(g, 'תשחזרי את תיק 41 מהארכיון'); return { ok: /אין עדיין ארכיון/.test(last.turn.say) && !g.writes.length, actual: shown(last.turn) }; });
  scenario('ארכוב ומחיקה', 'תשני את הסטטוס של תיק 41', 'סטטוס לפי שלבי העבודה — מציעה את השלב הבא', async (g) => { const { last } = await ask(g, 'תשני את הסטטוס של תיק 41'); return { ok: /שלבי העבודה/.test(last.turn.say) && /השלב הבא/.test(last.turn.display || '') && !g.writes.length, actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
// 11. Permissions and confirmed writes
// ---------------------------------------------------------------------------
describe('11. הרשאות', () => {
  scenario('הרשאות', 'נהג: כמה כסף נכנס השבוע?', 'אין הרשאה', async (g) => { const { last } = await ask(g, 'כמה כסף נכנס השבוע?'); return { ok: /אין לך הרשאה/.test(last.turn.say), actual: shown(last.turn) }; }, (g) => { g.actorRole = 'driver'; });
  scenario('הרשאות', 'נהג: כמה נשאר לשלם בתיק 129?', 'אין הרשאה', async (g) => { const { last } = await ask(g, 'כמה נשאר לשלם בתיק 129?'); return { ok: /אין לך הרשאה/.test(last.turn.say), actual: shown(last.turn) }; }, (g) => { g.actorRole = 'driver'; });
  scenario('הרשאות', 'נהג: דוחות (כפתור)', 'אין הרשאה לדוחות', async (g) => { const { last } = await talk(g, 'reports', []); return { ok: last.turn.say === P.reportNoPermission, actual: shown(last.turn) }; }, (g) => { g.actorRole = 'driver'; });
  scenario('הרשאות', 'תעדכני את הטלפון של משה כהן ל 0541234567', 'מציגה את השינוי ומבקשת אישור — לפני אישור לא נכתב דבר', async (g) => { const { last } = await ask(g, 'תעדכני את הטלפון של משה כהן ל 0541234567'); return { ok: last.turn.isConfirmation === true && has(shown(last.turn), '052-1111111', '054-1234567') && !g.writes.length, actual: shown(last.turn) }; });
  scenario('הרשאות', 'עדכון טלפון → "כן"', 'נכתב פעם אחת', async (g) => { const { last } = await ask(g, 'תעדכני את הטלפון של משה כהן ל 0541234567', 'כן'); return { ok: last.turn.say === P.phoneUpdated && g.writes.filter((w) => w.startsWith('updateCustomerDetails')).length === 1 && g.customers.find((c) => c.id === 'c1')!.phone === '054-1234567', actual: shown(last.turn) }; });
  scenario('הרשאות', 'עדכון טלפון → "לא"', 'לא נכתב דבר', async (g) => { const { last } = await ask(g, 'תעדכני את הטלפון של משה כהן ל 0541234567', 'לא'); return { ok: last.turn.say === P.okNothingChanged && !g.writes.length, actual: shown(last.turn) }; });
  scenario('הרשאות', 'עדכון טלפון למספר של לקוח אחר', 'אזהרה על כפילות לפני אישור', async (g) => { const { last } = await ask(g, 'תעדכני את הטלפון של משה כהן ל 0542222222'); return { ok: /כבר רשום אצל דנה לוי/.test(last.turn.display || '') && !g.writes.length, actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
// 12. Conversation continuity and Hebrew speech
// ---------------------------------------------------------------------------
describe('12. רצף שיחה ודיבור', () => {
  scenario('רצף שיחה ודיבור', 'באמצע לקוח חדש: "רגע, איזה תיק סגרנו אחרון?"', 'עונה מהנתונים, לא רושמת כשם, שואלת להמשיך', async (g) => { const { last } = await talk(g, 'new_customer', ['רגע, איזה תיק סגרנו אחרון?']); return { ok: has(last.turn.say, 'GM-2026-0042') && last.turn.followSay === P.continueFlowAsk && !last.session?.data.customerName, actual: shown(last.turn) }; });
  scenario('רצף שיחה ודיבור', '… → "כן להמשיך"', 'חוזרת לאותה שאלה בלי לאבד דבר', async (g) => { const { last } = await talk(g, 'new_customer', ['רגע, איזה תיק סגרנו אחרון?', 'כן להמשיך']); return { ok: last.turn.say === P.newCustomerOpen, actual: shown(last.turn) }; });
  scenario('רצף שיחה ודיבור', 'שאלה אחרי שאלה בשיחה כללית (3 ברצף)', 'כל תשובה נכונה, השיחה נשארת פתוחה', async (g) => { const { all } = await ask(g, 'כמה תיקים סגרנו השבוע?', 'מה התיק האחרון שנפתח במוסך?', 'מי הלקוח האחרון שפתחנו?'); return { ok: /נסגרו 1/.test(all[1].turn.say) && all[2].turn.say.includes('0130') && all[3].turn.say.includes('רינה') && !!all[3].session, actual: all.slice(1).map((r) => r.turn.say).join(' | ') }; });
  scenario('רצף שיחה ודיבור', 'כל תשובה דינמית מגובה במשפט קבוע (קול אחד גם בלי קול עברי במכשיר)', 'alt קבוע לכל תשובה', async (g) => { const { all } = await ask(g, 'מה התיק האחרון שנפתח במוסך?', 'כמה נכנס השבוע?', 'תמצאי לי לקוח לפי טלפון 052-1111111'); return { ok: all.slice(1).every((r) => !r.turn.alt || isFixedDaliaPrompt(r.turn.alt)) && all.slice(1).every((r) => isFixedDaliaPrompt(r.turn.say) || !!r.turn.alt), actual: all.slice(1).map((r) => `${r.turn.say} [${r.turn.alt || ''}]`).join(' | ') }; });
  scenario('רצף שיחה ודיבור', '"דליה, עצרי. תפתחי לי גם הצעת מחיר" באמצע לקוח חדש', 'ההוראה נרשמת, הפרטים נשמרים, השאלה הפתוחה חוזרת פעם אחת', async (g) => { const { last } = await talk(g, 'new_customer', ['יוסי מזרחי', '0525551234', 'דליה, עצרי. תפתחי לי גם הצעת מחיר ללקוח הזה']); return { ok: last.turn.say === P.quoteAfterCustomer && last.turn.followSay === P.customerTypeBiz && last.session?.data.customerName === 'יוסי מזרחי', actual: shown(last.turn) }; });
});

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------
afterAll(() => {
  const areas = [...new Set(results.map((r) => r.area))];
  const score = (rows: Row[]) => (rows.length ? Math.round((100 * rows.filter((r) => r.pass).length) / rows.length) : 0);
  const byArea = areas.map((a) => {
    const rows = results.filter((r) => r.area === a);
    return { area: a, total: rows.length, passed: rows.filter((r) => r.pass).length, score: score(rows) };
  });
  const passed = results.filter((r) => r.pass).length;
  const out = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed: results.length - passed,
    overall: score(results),
    byArea,
    rows: results.sort((a, b) => a.id - b.id),
  };
  const dir = path.join(process.cwd(), 'docs', 'dalia-scorecard');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'scorecard.json'), JSON.stringify(out, null, 2), 'utf8');
  const md = [
    '# Dalia AI — כרטיס ציונים (בדיקות תרחישים)',
    '',
    `סה״כ ${out.total} תרחישים · עברו ${out.passed} · נכשלו ${out.failed} · ציון כללי ${out.overall}`,
    '',
    '| תחום | תרחישים | עברו | ציון |',
    '|---|---|---|---|',
    ...byArea.map((a) => `| ${a.area} | ${a.total} | ${a.passed} | ${a.score} |`),
    '',
    '| # | תחום | שאלה | צפוי | בפועל | נתונים | פעולה | הבהרה | כפילות | שגיאה | עבר |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...out.rows.map((r) => `| ${r.id} | ${r.area} | ${r.question.replace(/\|/g, '/')} | ${r.expected.replace(/\|/g, '/')} | ${(r.actual || '').replace(/\|/g, '/').slice(0, 160)} | ${r.dataOk ? '✓' : '✗'} | ${r.actionOk ? '✓' : '✗'} | ${r.clarified ? 'כן' : '—'} | ${r.duplicates ? 'כן' : 'לא'} | ${r.error || '—'} | ${r.pass ? '✅' : '❌'} |`),
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'scorecard.md'), md, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`SCORECARD total=${out.total} passed=${out.passed} failed=${out.failed} overall=${out.overall} :: ${byArea.map((a) => `${a.area}=${a.score}(${a.passed}/${a.total})`).join(' · ')}`);
});
