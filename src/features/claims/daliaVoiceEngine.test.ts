// Conversation tests for the garage voice workflows against an IN-MEMORY fake garage (test data only).
// They prove questions, parsing, corrections, confirmations and the exact writes — not real audio.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { DALIA_VOICE_PROMPTS as P, DALIA_SAFE_ALTERNATIVES, isFixedDaliaPrompt } from '../../../supabase/functions/_shared/daliaVoicePrompts';
import {
  answerVoiceWorkflow,
  caseTotalPayable,
  detectCommand,
  loadVoiceSession,
  saveVoiceSession,
  clearVoiceSession,
  startVoiceWorkflow,
  type VoiceResult,
  type VoiceSession,
  type VoiceWorkflowType,
} from './daliaVoiceEngine';
import type {
  GarageCase,
  GarageCaseData,
  GarageCustomer,
  GarageInvoice,
  GarageSupplier,
  GarageVehicle,
  GarageVoiceActions,
} from '@/modules/garage-management/garageVoiceActions';

// ---------------------------------------------------------------------------
// Fake garage (test data only)
// ---------------------------------------------------------------------------

function customer(id: string, name: string, phone: string, num: number): GarageCustomer {
  return {
    id, customer_number: num, customer_type: 'private', name, company_name: '', phone, second_phone: '', email: '',
    address: '', business_id: '', contact_person: '', preferred_channel: '', notes: '',
  };
}
function vehicle(id: string, customerId: string, plate: string, make = 'טויוטה', model = 'קורולה'): GarageVehicle {
  return { id, customer_id: customerId, plate, make, model, year: null, color: '', vin: '', vehicle_type: '', internal_number: '', notes: '' };
}
function gcase(id: string, num: string, c: GarageCustomer, v: GarageVehicle, data: GarageCaseData = {}, status = 'בדיקת רכב'): GarageCase {
  return {
    id, case_number: num, customer_id: c.id, vehicle_id: v.id, status, opened_by: 'u', opened_by_name: 'בודק',
    customer_name_snapshot: c.name, vehicle_plate_snapshot: v.plate, vehicle_label_snapshot: `${v.make} ${v.model}`, case_data: data,
  };
}

class FakeGarage implements GarageVoiceActions {
  actorName = 'עובד בדיקה';
  customers: GarageCustomer[] = [];
  vehicles: GarageVehicle[] = [];
  cases: GarageCase[] = [];
  suppliers: GarageSupplier[] = [];
  invoices: GarageInvoice[] = [];
  writes: string[] = [];
  seq = 0;
  failNextWrite: string | null = null;

  private id(p: string) { this.seq += 1; return `${p}-${this.seq}`; }
  private guard(op: string) {
    if (this.failNextWrite) {
      const msg = this.failNextWrite;
      this.failNextWrite = null;
      throw new Error(msg);
    }
    this.writes.push(op);
  }

  async searchCustomers(q: string) {
    const digits = q.replace(/\D/g, '');
    return this.customers.filter((c) => {
      if (digits.length >= 5) {
        if (c.phone.replace(/\D/g, '').includes(digits)) return true;
        return this.vehicles.some((v) => v.customer_id === c.id && v.plate.replace(/\D/g, '') === digits);
      }
      return c.name.includes(q.trim());
    });
  }
  async getCustomer(id: string) { return this.customers.find((c) => c.id === id) || null; }
  async listVehicles(id: string) { return this.vehicles.filter((v) => v.customer_id === id); }
  async findVehicleByPlate(plate: string) { return this.vehicles.find((v) => v.plate.replace(/\D/g, '') === plate.replace(/\D/g, '')) || null; }
  async listCustomerCases(id: string) { return this.cases.filter((c) => c.customer_id === id); }
  async listCases() { return [...this.cases]; }
  async getCase(id: string) { return this.cases.find((c) => c.id === id) || null; }
  async createCustomer(d: { customer_type: 'private' | 'business'; name: string; company_name: string; phone: string }) {
    const dup = this.customers.filter((c) => c.phone.replace(/\D/g, '') === d.phone.replace(/\D/g, ''));
    if (dup.length) return { customer: dup[0], duplicates: dup };
    this.guard('createCustomer');
    const c = { ...customer(this.id('cust'), d.name, d.phone, 100 + this.seq), customer_type: d.customer_type, company_name: d.company_name };
    this.customers.push(c);
    return { customer: c, duplicates: [] };
  }
  async createVehicle(d: { customer_id: string; plate: string; make: string; model: string }) {
    this.guard('createVehicle');
    const v = vehicle(this.id('veh'), d.customer_id, d.plate, d.make, d.model);
    this.vehicles.push(v);
    return v;
  }
  async createCase(input: { customer: GarageCustomer; vehicle: GarageVehicle; caseData: GarageCaseData }) {
    this.guard('createCase');
    const c = gcase(this.id('case'), `GM-T-${this.seq}`, input.customer, input.vehicle, input.caseData);
    this.cases.push(c);
    return c;
  }
  async saveCaseData(caseId: string, data: GarageCaseData) {
    this.guard(`saveCaseData:${caseId}`);
    const c = this.cases.find((x) => x.id === caseId)!;
    c.case_data = { ...c.case_data, ...data };
    return c;
  }
  async closeCase(caseId: string) {
    this.guard(`closeCase:${caseId}`);
    const c = this.cases.find((x) => x.id === caseId)!;
    c.case_data = { ...c.case_data, caseClosed: true };
    c.status = 'סגור';
  }
  async listSuppliers() { return [...this.suppliers]; }
  async createSupplier(name: string) {
    this.guard('createSupplier');
    const s = { id: this.id('sup'), name, supplier_number: 'SUP-1' };
    this.suppliers.push(s);
    return { supplier: s };
  }
  async listInvoices() { return [...this.invoices]; }
  async createInvoice(p: Record<string, unknown>) {
    this.guard('createInvoice');
    const inv = { id: this.id('inv'), invoice_number: String(p.invoice_number), supplier_name: String(p.supplier_name), supplier_id: String(p.supplier_id || ''), total_amount: Number(p.total_amount), case_id: (p.case_id as string) || null } as GarageInvoice;
    this.invoices.push(inv);
    return inv;
  }
}

// ---------------------------------------------------------------------------
// Conversation driver
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-24T12:00:00Z');
let g: FakeGarage;
const env = () => ({ actions: g, now: () => NOW });

async function talk(type: VoiceWorkflowType, answers: string[], ctx = {}) {
  const transcript: VoiceResult[] = [];
  let r = await startVoiceWorkflow(type, ctx, env());
  transcript.push(r);
  for (const a of answers) {
    if (!r.session) throw new Error(`conversation ended before answer "${a}": ${r.turn.say}`);
    r = await answerVoiceWorkflow(r.session, a, env());
    transcript.push(r);
  }
  return { last: r, says: transcript.map((t) => t.turn.say), transcript };
}

/** Every sentence Dalia speaks must have a pre-recorded clip. */
function expectAllSpokenFixed(says: string[]) {
  for (const s of says) expect(isFixedDaliaPrompt(s), `not a fixed sentence: ${s}`).toBe(true);
}

beforeEach(() => {
  g = new FakeGarage();
  const moshe = customer('c1', 'משה כהן', '052-1111111', 101);
  const dana = customer('c2', 'דנה לוי', '054-2222222', 102);
  const moshe2 = customer('c3', 'משה לוי', '050-3333333', 103);
  g.customers.push(moshe, dana, moshe2);
  const v1 = vehicle('v1', 'c1', '1234567');
  const v2 = vehicle('v2', 'c2', '7654321', 'מאזדה', '3');
  g.vehicles.push(v1, v2);
  g.cases.push(gcase('k1', 'GM-2026-0041', moshe, v1, { quoteWorks: [{ id: 'w0', part: 'בדיקה', qty: 1, price: 100 }], timeline: [] }));
  g.cases.push(gcase('k2', 'GM-2026-0042', dana, v2, { workFinished: true, quoteCreated: true, paymentStatus: 'paid', deliveryKm: '1', deliveryDone: true, deliveryRecipient: 'דנה', deliveryConfirmed: true, finishAngles: { front: true, rear: true, right: true, left: true }, timeline: [] }));
  g.suppliers.push({ id: 's1', name: 'אוטו חלקים', supplier_number: 'SUP-11', phone: '03-5550000' });
  g.invoices.push({ id: 'i1', invoice_number: '7788', supplier_id: 's1', supplier_name: 'אוטו חלקים', total_amount: 1180, payment_status: 'pending_accounting', credit_status: 'none' });
  clearVoiceSession();
});

// ---------------------------------------------------------------------------
// 1. New customer
// ---------------------------------------------------------------------------

describe('לקוח חדש', () => {
  it('full conversation creates customer, vehicle and case only after "yes"', async () => {
    const { last, says, transcript } = await talk('new_customer', [
      'קוראים לו יוסי מזרחי',
      'אפס חמש שתיים חמש חמש חמש אחת שתיים שלוש ארבע',
      'פרטי',
      '12-345-99',
      'טויוטה קורולה',
      'כן',
      'רעש בבלמים',
    ]);
    expect(says).toEqual([
      P.newCustomerName, P.phone, P.customerType, P.plate, P.model, P.arrivedNow, P.complaint, DALIA_SAFE_ALTERNATIVES.confirm,
    ]);
    expect(last.turn.isConfirmation).toBe(true);
    expect(last.turn.display).toContain('יוסי מזרחי');
    expect(last.turn.display).toContain('052-5551234');
    expect(last.turn.display).toContain('1234599');
    expect(g.writes).toEqual([]); // nothing saved before confirmation

    const done = await answerVoiceWorkflow(last.session!, 'כן, תשמרי', env());
    expect(done.turn.say).toBe(P.customerAndCaseCreated);
    expect(done.turn.outcome).toBe('executed');
    expect(g.writes).toEqual(['createCustomer', 'createVehicle', 'createCase']);
    const created = g.cases[g.cases.length - 1];
    expect(done.turn.openCaseId).toBe(created.id);
    expect(created.case_data.route).toBe('intake_first');
    expect(created.case_data.timeline?.[0]?.text).toContain('רעש בבלמים');
    const v = g.vehicles[g.vehicles.length - 1];
    expect(v).toMatchObject({ plate: '1234599', make: 'טויוטה', model: 'קורולה' });
    expectAllSpokenFixed([...says, done.turn.say]);
    expect(transcript.every((t) => t.turn.say !== '')).toBe(true);
  });

  it('natural answer with name + phone skips the phone question', async () => {
    const { says } = await talk('new_customer', ['משה פרץ 052-9998888']);
    expect(says[1]).toBe(P.customerType);
  });

  it('invalid phone is asked again — nothing is invented', async () => {
    const { last } = await talk('new_customer', ['רונית', '12345']);
    expect(last.turn.say).toBe(P.phoneInvalid);
    expect(last.session!.data.customerPhone).toBeUndefined();
  });

  it('business customer asks for the company name', async () => {
    const { says } = await talk('new_customer', ['אבי', '0541231231', 'חברה']);
    expect(says[3]).toBe(P.companyName);
  });

  it('"בלי רכב" saves only the customer card', async () => {
    const { last } = await talk('new_customer', ['שרה', '0541112233', 'פרטי', 'בלי רכב']);
    expect(last.turn.isConfirmation).toBe(true);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.customerOnlyCreated);
    expect(g.writes).toEqual(['createCustomer']);
  });

  it('"no" at confirmation saves nothing; correction then save', async () => {
    const { last } = await talk('new_customer', ['יוסי', '0525551234', 'פרטי', '1234599', 'מאזדה 3', 'לא', 'פנס שבור']);
    let r = await answerVoiceWorkflow(last.session!, 'לא', env());
    expect(r.turn.say).toBe(P.notSaved);
    expect(g.writes).toEqual([]);
    r = await answerVoiceWorkflow(r.session!, 'תקני את הטלפון ל 0547779999', env());
    expect(r.session!.data.customerPhone).toBe('054-7779999');
    expect(r.turn.isConfirmation).toBe(true);
    expect(r.turn.display).toContain('054-7779999');
    r = await answerVoiceWorkflow(r.session!, 'אשר', env());
    expect(r.turn.outcome).toBe('executed');
    expect(g.customers[g.customers.length - 1].phone).toBe('054-7779999');
  });

  it('correction without a value re-asks that field', async () => {
    const { last } = await talk('new_customer', ['יוסי', '0525551234']);
    const r = await answerVoiceWorkflow(last.session!, 'תקני את השם', env());
    expect(r.turn.say).toBe(P.newCustomerName);
    expect(r.session!.data.customerName).toBeUndefined();
    expect(r.session!.data.customerPhone).toBe('052-5551234');
  });

  it('existing phone → uses the existing customer instead of a duplicate', async () => {
    const { last } = await talk('new_customer', ['משה', '0521111111', 'פרטי', '5554443', 'קיה', 'לא', 'טיפול']);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(g.writes).toEqual(['createVehicle', 'createCase']);
    expect(done.turn.display).toContain('כבר קיים');
  });

  it('plate of another customer → no case opened, failure is reported honestly', async () => {
    const { last } = await talk('new_customer', ['גל', '0520000001', 'פרטי', '1234567', 'קיה', 'כן', 'טיפול']);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.outcome).toBe('failed');
    expect(done.turn.say).toBe(DALIA_SAFE_ALTERNATIVES.executedFailed);
    expect(done.turn.display).toContain('לקוח אחר');
    expect(g.writes).not.toContain('createCase');
  });

  it('save error → failed (never success) and kept for resume', async () => {
    const { last } = await talk('new_customer', ['גל', '0520000002', 'פרטי', 'בלי רכב']);
    g.failNextWrite = 'שגיאת רשת';
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.outcome).toBe('failed');
    expect(done.turn.display).toContain('שגיאת רשת');
    expect(done.turn.keepForResume).toBe(true);
    expect(done.session).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Global commands
// ---------------------------------------------------------------------------

describe('commands: repeat, back, cancel, pause, summary', () => {
  it('repeat asks the same question again', async () => {
    const { last } = await talk('new_customer', ['יוסי', 'תחזרי על השאלה']);
    expect(last.turn.say).toBe(P.phone);
  });
  it('back clears the previous answer', async () => {
    const { last } = await talk('new_customer', ['יוסי', '0525551234', 'שאלה קודמת']);
    expect(last.turn.say).toBe(P.phone);
    expect(last.session!.data.customerPhone).toBeUndefined();
  });
  it('cancel ends without saving', async () => {
    const { last } = await talk('new_customer', ['יוסי', 'בטל']);
    expect(last.turn.say).toBe(P.cancelled);
    expect(last.session).toBeNull();
    expect(g.writes).toEqual([]);
  });
  it('pause keeps the session for resume', async () => {
    const { last } = await talk('new_customer', ['יוסי', 'עצרי']);
    expect(last.turn.outcome).toBe('paused');
    expect(last.turn.expectsAnswer).toBe(false);
    expect(last.session!.data.customerName).toBe('יוסי');
  });
  it('summary shows what was recorded and re-asks', async () => {
    const { last } = await talk('new_customer', ['יוסי', 'מה רשמת']);
    expect(last.turn.say).toBe(P.phone);
    expect(last.turn.display).toContain('יוסי');
  });
  it('commands are not detected inside real answers', () => {
    expect(detectCommand('החלפת רפידות בלמים ועוד בדיקת בטל ב')).toBeNull();
    expect(detectCommand('שני מגבים 60 שקל')).toBeNull();
    expect(detectCommand('בטל')).toBe('cancel');
    expect(detectCommand('לא, בטל')).toBe('cancel');
  });
});

// ---------------------------------------------------------------------------
// 2. Existing customer
// ---------------------------------------------------------------------------

describe('לקוח קיים', () => {
  it('not found → asks again with guidance', async () => {
    const { last } = await talk('existing_customer', ['ישראל ישראלי']);
    expect(last.turn.say).toBe(P.customerNotFound);
    expect(last.turn.expectsAnswer).toBe(true);
  });
  it('several matches → numbered list → pick → open existing case', async () => {
    const { says, last } = await talk('existing_customer', ['משה', 'השני']);
    expect(says[1]).toBe(P.customerMany);
    expect(last.turn.say).toBe(P.customerAction);
    expect(last.session!.data.customerId).toBe('c3');
  });
  it('one match → confirm → new case for existing vehicle', async () => {
    const { last } = await talk('existing_customer', ['דנה לוי', 'כן', 'לפתוח תיק עבודה חדש', 'כן', 'החלפת שמן', 'לא']);
    expect(last.turn.isConfirmation).toBe(true);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.caseCreated);
    expect(g.writes).toEqual(['createCase']);
    expect(g.cases[g.cases.length - 1].vehicle_id).toBe('v2');
  });
  it('search by plate finds the owner; open existing case navigates without writing', async () => {
    const { last } = await talk('existing_customer', ['1234567', 'כן', 'תיק קיים']);
    expect(last.turn.say).toBe(P.openingCase);
    expect(last.turn.openCaseId).toBe('k1');
    expect(g.writes).toEqual([]);
  });
  it('"לקוח חדש" switches to the new-customer workflow', async () => {
    const { last } = await talk('existing_customer', ['לקוח חדש']);
    expect(last.turn.say).toBe(P.newCustomerName);
    expect(last.session!.type).toBe('new_customer');
  });
});

// ---------------------------------------------------------------------------
// 3. Intake
// ---------------------------------------------------------------------------

describe('קבלת רכב לעבודה', () => {
  it('known vehicle with an open case → intake fields saved into that case', async () => {
    const { last, says } = await talk('intake', ['1234567', 'רעש מהמנוע', 'מאה עשרים אלף', 'חצי', 'שניים', 'כן, נורת מנוע', 'לא']);
    expect(says[1]).toBe(P.intakeComplaint);
    expect(last.turn.display).toContain('120000');
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.intakeSaved);
    expect(g.writes).toEqual(['saveCaseData:k1']);
    const cd = g.cases.find((c) => c.id === 'k1')!.case_data;
    expect(cd).toMatchObject({ intakeKm: '120000', intakeFuel: '1/2', intakeKeys: '2', intakeLights: 'נורת מנוע', intakeItems: '' });
    expect(cd.intakeDone).toBeUndefined(); // photos + signature stay in the case screen
  });
  it('unknown vehicle → asks owner details, creates customer, vehicle and intake case', async () => {
    const { says, last } = await talk('intake', ['8889990', 'רון', '0526667777', 'פרטי', 'סקודה אוקטביה', 'טיפול 30 אלף', '30000', 'מלא', '1', 'לא', 'אין']);
    expect(says[1]).toBe(P.vehicleNotFoundName);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(g.writes).toEqual(['createCustomer', 'createVehicle', 'createCase']);
    const c = g.cases[g.cases.length - 1];
    expect(c.case_data).toMatchObject({ route: 'intake_first', intakeFuel: 'מלא', intakeKm: '30000', intakeKeys: '1' });
    expect(done.turn.openCaseId).toBe(c.id);
  });
  it('unclear fuel and mileage are asked again', async () => {
    const { last } = await talk('intake', ['1234567', 'בדיקה', 'הרבה']);
    expect(last.turn.say).toBe(P.kmRetry);
    const r = await answerVoiceWorkflow(last.session!, '45000', env());
    const r2 = await answerVoiceWorkflow(r.session!, 'לא יודע בדיוק', env());
    expect(r2.turn.say).toBe(P.fuelRetry);
  });
});

// ---------------------------------------------------------------------------
// 4. Quote
// ---------------------------------------------------------------------------

describe('הצעת מחיר', () => {
  it('collects works and parts with quantities and prices, asks missing price, saves in screen format', async () => {
    const { says, last } = await talk('quote', [
      '1234567',
      'הצעת מחיר',
      'החלפת רפידות קדמיות 450 שקל',
      'יישור פח',
      '300',
      'זהו',
      'פילטר שמן כמות 2 במחיר 80',
      'אין עוד',
    ]);
    expect(says.slice(1, 7)).toEqual([P.quoteScope, P.works, P.moreWorks, P.workPrice, P.moreWorks, P.parts]);
    expect(last.turn.isConfirmation).toBe(true);
    // 450 + 300 + 2*80 = 910 ; VAT 164 ; total 1074
    expect(last.turn.display).toContain('₪910');
    expect(last.turn.display).toContain('₪1,074');
    expect(g.writes).toEqual([]);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.quoteSaved);
    const cd = g.cases.find((c) => c.id === 'k1')!.case_data;
    expect(cd.quoteWorks).toHaveLength(3); // 1 existing + 2 new
    expect(cd.quoteWorks?.[1]).toMatchObject({ part: 'החלפת רפידות קדמיות', qty: 1, price: 450, type: 'עבודה' });
    expect(cd.quoteParts?.[0]).toMatchObject({ name: 'פילטר שמן', qty: 2, price: 80, supplier: 'us' });
    expect(cd.quoteCreated).toBe(true);
    expectAllSpokenFixed([...says, done.turn.say]);
  });
  it('"בלי מחיר" leaves the price open and flags it', async () => {
    const { last } = await talk('quote', ['1234567', 'הצעה', 'צביעת דלת', 'בלי מחיר', 'זהו', 'אין']);
    expect(last.turn.display).toContain('ללא מחיר');
  });
  it('back removes the last line', async () => {
    const { last } = await talk('quote', ['1234567', 'הצעה', 'החלפת מגבים 60 שקל', 'שאלה קודמת']);
    expect(last.session!.data.works).toEqual([]);
  });
  it('case not found asks again', async () => {
    const { last } = await talk('quote', ['9999999']);
    expect(last.turn.say).toBe(P.caseNotFound);
  });
  it('supplement path records a pending internal extra (never auto-approved)', async () => {
    const { last } = await talk('quote', ['1234567', 'תוספת עבודה', 'נמצא סדק ברדיאטור', '650', 'הלקוח אישר בטלפון']);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.supplementSaved);
    const extra = g.cases.find((c) => c.id === 'k1')!.case_data.extraApprovals![0];
    expect(extra).toMatchObject({ text: 'נמצא סדק ברדיאטור', price: 650, status: 'pending_customer', channel: 'internal_discovery' });
  });
  it('in-case shortcut: add one work line without asking for the case', async () => {
    const ctx = { caseId: 'k1', caseNumber: 'GM-2026-0041', customerName: 'משה כהן', plate: '1234567' };
    const { says, last } = await talk('context_quote_add_work', ['כיוון פרונט 250 שקל'], ctx);
    expect(says[0]).toBe(P.addWork);
    expect(last.turn.isConfirmation).toBe(true);
    await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(g.cases.find((c) => c.id === 'k1')!.case_data.quoteWorks).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 5. Invoices & credits (read-only)
// ---------------------------------------------------------------------------

describe('חשבוניות וזיכויים', () => {
  it('check an invoice by number — read only', async () => {
    const { last } = await talk('invoices_credits', ['לבדוק חשבונית', '7788']);
    expect(last.turn.say).toBe(P.invoiceFound);
    expect(last.turn.display).toContain('אוטו חלקים');
    expect(g.writes).toEqual([]);
  });
  it('invoice not found asks again', async () => {
    const { last } = await talk('invoices_credits', ['בדיקת חשבונית', '1111']);
    expect(last.turn.say).toBe(P.invoiceNotFound);
  });
  it('prepare invoice data for a case shows a draft and writes nothing', async () => {
    const { last } = await talk('invoices_credits', ['להכין נתוני חשבונית', '1234567']);
    expect(last.turn.say).toBe(P.invoiceDraftShown);
    expect(last.turn.display).toContain('טיוטת נתונים בלבד');
    expect(g.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. Suppliers & expenses
// ---------------------------------------------------------------------------

describe('ספקים והוצאות', () => {
  it('search supplier shows details', async () => {
    const { last } = await talk('general_expenses', ['לחפש ספק', 'אוטו חלקים', 'כן']);
    expect(last.turn.say).toBe(P.supplierShown);
  });
  it('supplier debt lists open invoices', async () => {
    const { last } = await talk('general_expenses', ['חוב לספק', 'אוטו חלקים', 'כן']);
    expect(last.turn.say).toBe(P.supplierDebtShown);
    expect(last.turn.display).toContain('7788');
  });
  it('unknown supplier → offer to create, "no" creates nothing', async () => {
    const { last } = await talk('general_expenses', ['לחפש ספק', 'צמיגי הצפון', 'לא']);
    expect(last.turn.say).toBe(P.supplierNotCreated);
    expect(g.writes).toEqual([]);
  });
  it('record a parts purchase invoice after confirmation', async () => {
    const { last } = await talk('general_expenses', ['לרשום רכישת חלק', 'אוטו חלקים', 'כן', '5521', 'אלף מאה שמונים', '1234567']);
    expect(last.turn.isConfirmation).toBe(true);
    expect(last.turn.display).toContain('₪1,180');
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.invoiceSaved);
    expect(g.invoices[g.invoices.length - 1]).toMatchObject({ invoice_number: '5521', total_amount: 1180, case_id: 'k1' });
  });
});

// ---------------------------------------------------------------------------
// 7. Find case
// ---------------------------------------------------------------------------

describe('איתור תיק עבודה', () => {
  it('by case number → status → open', async () => {
    const { last } = await talk('find_case', ['תיק 42', 'כן']);
    expect(last.turn.say).toBe(P.openingCase);
    expect(last.turn.openCaseId).toBe('k2');
  });
  it('by customer name → "no" leaves it on screen', async () => {
    const { last } = await talk('find_case', ['משה כהן', 'לא']);
    expect(last.turn.say).toBe(P.okNotOpening);
  });
  it('not found asks again', async () => {
    const { last } = await talk('find_case', ['אלון']);
    expect(last.turn.say).toBe(P.caseNotFound);
  });
});

// ---------------------------------------------------------------------------
// 8. Close case
// ---------------------------------------------------------------------------

describe('סגירת תיק עבודה', () => {
  it('case with gaps cannot be closed — the gaps are shown', async () => {
    const { last } = await talk('close_case', ['1234567']);
    expect(last.turn.say).toBe(P.closeGaps);
    expect(last.turn.display).toContain('העבודה טרם סומנה כהושלמה');
    expect(g.writes).toEqual([]);
  });
  it('ready case closes only after explicit yes', async () => {
    const { last } = await talk('close_case', ['7654321']);
    expect(last.turn.say).toBe(P.closeConfirm);
    const unclear = await answerVoiceWorkflow(last.session!, 'אולי', env());
    expect(unclear.turn.say).toBe(P.confirmRetry);
    const no = await answerVoiceWorkflow(unclear.session!, 'רגע לא בטוח', env());
    expect(no.turn.say).toBe(P.notSaved); // any "לא" is a no — nothing closes
    expect(g.writes).toEqual([]);
    const done = await answerVoiceWorkflow(no.session!, 'כן תסגרי', env());
    expect(done.turn.say).toBe(P.caseClosed);
    expect(g.writes).toEqual(['closeCase:k2']);
  });
  it('from inside a case: gaps checked immediately', async () => {
    const { last } = await talk('close_case', [], { caseId: 'k1', caseNumber: 'GM-2026-0041' });
    expect(last.turn.say).toBe(P.closeGaps);
  });
});

// ---------------------------------------------------------------------------
// 9. Resume
// ---------------------------------------------------------------------------

describe('המשך פעולה אחרונה', () => {
  it('nothing saved', async () => {
    const r = await startVoiceWorkflow('resume_action', {}, env());
    expect(r.turn.say).toBe(P.resumeNone);
  });
  it('resumes a paused conversation at the same question, with the answers kept', async () => {
    const { last } = await talk('new_customer', ['יוסי', '0525551234', 'עצרי']);
    saveVoiceSession(last.session as VoiceSession);
    expect(loadVoiceSession(NOW)).not.toBeNull();
    const r = await startVoiceWorkflow('resume_action', {}, env());
    expect(r.turn.say).toBe(P.resumeAsk);
    expect(r.turn.display).toContain('יוסי');
    const cont = await answerVoiceWorkflow(r.session!, 'כן', env());
    expect(cont.turn.say).toBe(P.customerType);
    expect(cont.session!.data.customerPhone).toBe('052-5551234');
  });
  it('declining clears it', async () => {
    const { last } = await talk('new_customer', ['יוסי', 'עצרי']);
    saveVoiceSession(last.session as VoiceSession);
    const r = await startVoiceWorkflow('resume_action', {}, env());
    const no = await answerVoiceWorkflow(r.session!, 'לא', env());
    expect(no.turn.say).toBe(P.resumeDeclined);
  });
});

// ---------------------------------------------------------------------------
// Payment shortcut
// ---------------------------------------------------------------------------

describe('תשלום (קיצור בתוך תיק)', () => {
  const ctx = { caseId: 'k1', caseNumber: 'GM-2026-0041' };
  it('amount + method in one answer, balance shown, saved in server format', async () => {
    const { last } = await talk('context_pay_balance', ['50 שקל במזומן'], ctx);
    expect(last.turn.isConfirmation).toBe(true);
    expect(last.turn.display).toContain('₪118'); // 100 + 18% VAT
    await answerVoiceWorkflow(last.session!, 'כן', env());
    const cd = g.cases.find((c) => c.id === 'k1')!.case_data as Record<string, unknown>;
    expect(cd.totalPaid).toBe(50);
    expect(cd.balanceRemaining).toBe(68);
    expect((cd.payments as Array<Record<string, unknown>>)[0]).toMatchObject({ amount: 50, payment_method: 'cash', payment_method_label: 'מזומן' });
  });
  it('duplicate payment within 10 minutes is not recorded twice', async () => {
    for (let i = 0; i < 2; i += 1) {
      const { last } = await talk('context_pay_balance', ['50 במזומן'], ctx);
      await answerVoiceWorkflow(last.session!, 'כן', env());
    }
    const cd = g.cases.find((c) => c.id === 'k1')!.case_data as Record<string, unknown>;
    expect((cd.payments as unknown[]).length).toBe(1);
  });
  it('missing method is asked', async () => {
    const { last } = await talk('context_pay_balance', ['300'], ctx);
    expect(last.turn.say).toBe(P.paymentMethod);
  });
  it('caseTotalPayable mirrors the server rule', () => {
    expect(caseTotalPayable({ workOrderAmount: 500 })).toBe(500);
    expect(caseTotalPayable({ quoteWorks: [{ price: 100, qty: 2 }], quoteParts: [{ price: 50, supplier: 'customer' }] })).toBe(236);
  });
});

describe('without garage actions', () => {
  it('says the action is only available from the garage screen', async () => {
    const r = await startVoiceWorkflow('new_customer', {}, { actions: null });
    expect(r.turn.say).toBe(P.noActions);
    expect(r.turn.done).toBe(true);
  });
});
