// Conversation tests for the garage voice workflows against an IN-MEMORY fake garage (test data only).
// They prove questions, parsing, corrections, confirmations and the exact writes — not real audio.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { DALIA_VOICE_PROMPTS as P, DALIA_SAFE_ALTERNATIVES, isFixedDaliaPrompt } from '../../../supabase/functions/_shared/daliaVoicePrompts';
import {
  answerVoiceFile,
  answerVoiceWorkflow,
  caseSearchTerms,
  caseTotalPayable,
  clearVoiceSession,
  detectCommand,
  loadVoiceSession,
  routeFreeRequest,
  saveVoiceSession,
  startVoiceWorkflow,
  type VoiceEnv,
  type VoiceResult,
  type VoiceSession,
  type VoiceWorkflowType,
} from './daliaVoiceEngine';
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

// ---------------------------------------------------------------------------
// Fake garage (test data only)
// ---------------------------------------------------------------------------

function customer(id: string, name: string, phone: string, num: number, type: 'private' | 'business' = 'private'): GarageCustomer {
  return {
    id, customer_number: num, customer_type: type, name, company_name: type === 'business' ? name : '', phone, second_phone: '', email: '',
    address: '', business_id: '', contact_person: '', preferred_channel: '', notes: '',
  };
}
function vehicle(id: string, customerId: string, plate: string, make = 'טויוטה', model = 'קורולה'): GarageVehicle {
  return { id, customer_id: customerId, plate, make, model, year: null, color: '', vin: '', vehicle_type: '', internal_number: '', notes: '' };
}
function gcase(id: string, num: string, c: GarageCustomer, v: GarageVehicle, data: GarageCaseData = {}, created = '2026-10-20T08:00:00Z'): GarageCase {
  return {
    id, case_number: num, customer_id: c.id, vehicle_id: v.id, status: 'בדיקת רכב', opened_by: 'u', opened_by_name: 'בודק',
    customer_name_snapshot: c.name, vehicle_plate_snapshot: v.plate, vehicle_label_snapshot: `${v.make} ${v.model}`, case_data: data, created_at: created,
  };
}

const READY_TO_CLOSE: GarageCaseData = {
  workFinished: true, quoteCreated: true, quoteApproved: true, workOrderSaved: true, workOrderAmount: 1180,
  paymentStatus: 'paid', deliveryKm: '1', deliveryDone: true, deliveryRecipient: 'דנה', deliveryConfirmed: true,
  finishAngles: { front: true, rear: true, right: true, left: true }, timeline: [],
};

class FakeGarage implements GarageVoiceActions {
  actorName = 'מאיר כהן';
  actorRole = 'fleet_manager';
  customers: GarageCustomer[] = [];
  vehicles: GarageVehicle[] = [];
  cases: GarageCase[] = [];
  suppliers: GarageSupplier[] = [];
  invoices: GarageInvoice[] = [];
  media: Array<{ caseId: string; category: string; title: string }> = [];
  writes: string[] = [];
  seq = 0;
  failNextWrite: string | null = null;
  searchFails = false;
  searchCalls: CaseSearchTerms[] = [];

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
      if (/^\d{3,}$/.test(q.trim())) return String(c.customer_number) === q.trim();
      return c.name.includes(q.trim());
    });
  }
  async getCustomer(id: string) { return this.customers.find((c) => c.id === id) || null; }
  async listVehicles(id: string) { return this.vehicles.filter((v) => v.customer_id === id); }
  async findVehicleByPlate(plate: string) { return this.vehicles.find((v) => v.plate.replace(/\D/g, '') === plate.replace(/\D/g, '')) || null; }
  async listCustomerCases(id: string) { return this.cases.filter((c) => c.customer_id === id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); }
  async listCases() { return this.cases.slice(0, 100); }
  /** Emulates the PostgREST ilike query on ALL cases (not just the latest 100). */
  async searchCases(terms: CaseSearchTerms) {
    this.searchCalls.push(terms);
    if (this.searchFails) throw new Error('connection reset');
    const words = terms.nameWords || [];
    const longest = [...words].sort((a, b) => b.length - a.length)[0];
    const owners = terms.phone ? (await this.searchCustomers(terms.phone)).map((c) => c.id) : [];
    const rows = this.cases.filter((c) => {
      if (terms.plate && c.vehicle_plate_snapshot.replace(/\D/g, '').includes(terms.plate)) return true;
      if (terms.numberDigits && c.case_number.includes(terms.numberDigits)) return true;
      if (longest && c.customer_name_snapshot.includes(longest)) return true;
      if (owners.includes(c.customer_id)) return true;
      return false;
    });
    return words.length > 1 && !terms.plate && !terms.numberDigits && !terms.phone
      ? rows.filter((r) => words.every((w) => r.customer_name_snapshot.includes(w)))
      : rows;
  }
  async listAllCases() {
    if (this.searchFails) throw new Error('connection reset');
    return [...this.cases];
  }
  async getCase(id: string) { return this.cases.find((c) => c.id === id) || null; }
  async createCustomer(d: { customer_type: 'private' | 'business'; name: string; company_name: string; phone: string }, opts?: { force?: boolean }) {
    const dup = this.customers.filter((c) => c.phone.replace(/\D/g, '') === d.phone.replace(/\D/g, ''));
    if (dup.length && !opts?.force) return { customer: dup[0], duplicates: dup };
    this.guard('createCustomer');
    const c = { ...customer(this.id('cust'), d.name, d.phone, 100 + this.seq), customer_type: d.customer_type, company_name: d.company_name };
    this.customers.push(c);
    return { customer: c, duplicates: [] };
  }
  async createVehicle(d: { customer_id: string; plate: string; make: string; model: string; year?: number | null }) {
    this.guard('createVehicle');
    const v = { ...vehicle(this.id('veh'), d.customer_id, d.plate, d.make, d.model), year: d.year ?? null };
    this.vehicles.push(v);
    return v;
  }
  async createCase(input: { customer: GarageCustomer; vehicle: GarageVehicle; caseData: GarageCaseData }) {
    this.guard('createCase');
    const c = gcase(this.id('case'), `GM-2026-${String(900 + this.seq).padStart(4, '0')}`, input.customer, input.vehicle, input.caseData, '2026-10-24T10:00:00Z');
    this.cases.unshift(c);
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
    c.case_data = { ...c.case_data, caseClosed: true, caseClosedAt: '2026-10-24T10:00:00Z' };
    c.status = 'סגור';
  }
  async uploadCaseMedia(caseId: string, category: string, title: string) {
    this.guard(`upload:${category}`);
    this.media.push({ caseId, category, title });
  }
  async updateCustomerContact(customerId: string, patch: { contact_person?: string; appendNote?: string }) {
    this.guard('updateCustomer');
    const c = this.customers.find((x) => x.id === customerId)!;
    if (patch.contact_person) c.contact_person = patch.contact_person;
    if (patch.appendNote) c.notes = [c.notes, patch.appendNote].filter(Boolean).join('\n');
    return c;
  }
  async listSuppliers() { return [...this.suppliers]; }
  async createSupplier(name: string, extra?: { phone?: string; category?: string }) {
    this.guard('createSupplier');
    const s = { id: this.id('sup'), name, supplier_number: 'SUP-1', phone: extra?.phone || null, category: extra?.category || 'parts' };
    this.suppliers.push(s);
    return { supplier: s };
  }
  async listInvoices() { return [...this.invoices]; }
  async createInvoice(p: Record<string, unknown>) {
    this.guard('createInvoice');
    const inv = { id: this.id('inv'), ...p, invoice_number: String(p.invoice_number), supplier_name: String(p.supplier_name), supplier_id: String(p.supplier_id || ''), total_amount: Number(p.total_amount), case_id: (p.case_id as string) || null } as GarageInvoice;
    this.invoices.push(inv);
    return inv;
  }
}

// ---------------------------------------------------------------------------
// Conversation driver
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-24T12:00:00Z'); // Saturday
let g: FakeGarage;
let readDocument: ReturnType<typeof vi.fn>;
const env = (extra: Partial<VoiceEnv> = {}): VoiceEnv => ({ actions: g, now: () => NOW, readDocument, ...extra });
const photo = { name: 'p.jpg', type: 'image/jpeg', bytes: new ArrayBuffer(8) };

async function talk(type: VoiceWorkflowType, answers: Array<string | 'FILE'>, ctx = {}, e = env()) {
  const transcript: VoiceResult[] = [];
  let r = await startVoiceWorkflow(type, ctx, e);
  transcript.push(r);
  for (const a of answers) {
    if (!r.session || r.turn.done) throw new Error(`conversation ended before answer "${a}": ${r.turn.say} ${r.turn.display || ''}`);
    r = a === 'FILE' ? await answerVoiceFile(r.session, photo, e) : await answerVoiceWorkflow(r.session, a, e);
    transcript.push(r);
  }
  return { last: r, says: transcript.map((t) => t.turn.say), transcript };
}

/** Every sentence Dalia speaks must have a pre-recorded clip (or a fixed alt when it carries a name/figure). */
function expectAllSpokenFixed(transcript: VoiceResult[]) {
  for (const t of transcript) {
    const spoken = t.turn.alt || t.turn.say;
    expect(isFixedDaliaPrompt(spoken), `not a fixed sentence: ${spoken}`).toBe(true);
  }
}

let moshe: GarageCustomer;
let dana: GarageCustomer;
let eldan: GarageCustomer;

beforeEach(() => {
  g = new FakeGarage();
  readDocument = vi.fn(async () => null);
  moshe = customer('c1', 'משה כהן', '052-1111111', 101);
  dana = customer('c2', 'דנה לוי', '054-2222222', 102);
  const moshe2 = customer('c3', 'משה לוי', '050-3333333', 103);
  eldan = customer('c4', 'אלדן תחבורה', '03-5551111', 104, 'business');
  g.customers.push(moshe, dana, moshe2, eldan);
  const v1 = vehicle('v1', 'c1', '1234567');
  const v2 = vehicle('v2', 'c2', '7654321', 'מאזדה', '3');
  const v4 = vehicle('v4', 'c4', '11-222-33', 'סקודה', 'אוקטביה');
  g.vehicles.push(v1, v2, v4);
  g.cases.push(gcase('k1', 'GM-2026-0041', moshe, v1, { quoteWorks: [{ id: 'w0', part: 'בדיקה', qty: 1, price: 100 }], timeline: [] }));
  g.cases.push(gcase('k2', 'GM-2026-0042', dana, v2, { ...READY_TO_CLOSE }));
  g.cases.push(gcase('k4', 'GM-2026-0129', eldan, v4, {
    quoteCreated: true, quoteApproved: true, workOrderSaved: true, workOrderAmount: 2000, workStarted: true,
    payments: [{ amount: 500, payment_method_label: 'העברה בנקאית', payment_date: '2026-10-21', created_at: '2026-10-21T09:00:00Z' }],
    totalPaid: 500, timeline: [],
  }, '2026-10-19T08:00:00Z'));
  // 150 older closed cases — beyond the 100 the list screen loads
  for (let i = 0; i < 150; i += 1) {
    g.cases.push(gcase(`old${i}`, `GM-2025-${String(i + 1).padStart(4, '0')}`, dana, v2, { caseClosed: true, workFinished: true }, '2025-01-01T08:00:00Z'));
  }
  // an OPEN case older than the latest 100
  g.cases.push(gcase('kOld', 'GM-2025-0777', moshe, vehicle('v9', 'c1', '9988776'), { quoteCreated: true, timeline: [] }, '2024-12-01T08:00:00Z'));
  g.vehicles.push(vehicle('v9', 'c1', '9988776'));
  g.suppliers.push({ id: 's1', name: 'אוטו חלקים', supplier_number: 'SUP-11', phone: '03-5550000' });
  g.invoices.push({ id: 'i1', invoice_number: '7788', supplier_id: 's1', supplier_name: 'אוטו חלקים', total_amount: 1180, payment_status: 'pending_accounting', credit_status: 'none' });
  clearVoiceSession();
});

// ---------------------------------------------------------------------------
// Identity: personal phrasing, fixed fallback
// ---------------------------------------------------------------------------

describe('זהות העובד', () => {
  it('opening uses the worker name, with the fixed sentence as the spoken fallback', async () => {
    const r = await startVoiceWorkflow('new_customer', {}, env({ userName: 'מאיר' }));
    expect(r.turn.say).toBe(`מאיר, ${P.newCustomerOpen}`);
    expect(r.turn.alt).toBe(P.newCustomerOpen);
  });
  it('without a name the sentence is fixed', async () => {
    const r = await startVoiceWorkflow('new_customer', {}, env());
    expect(r.turn.say).toBe(P.newCustomerOpen);
    expect(r.turn.alt).toBeUndefined();
  });
  it('reports are refused for roles without garage access (permissions come from the account)', async () => {
    g.actorRole = 'driver';
    const r = await startVoiceWorkflow('reports', {}, env({ userName: 'מאיר' }));
    expect(r.turn.say).toBe(P.reportNoPermission);
  });
});

// ---------------------------------------------------------------------------
// 1. New customer → vehicle (speech / license photo) → optional new work
// ---------------------------------------------------------------------------

describe('לקוח חדש', () => {
  it('customer is saved after confirmation, then a vehicle by speech, then a new case', async () => {
    const { last, says, transcript } = await talk('new_customer', [
      'קוראים לו יוסי מזרחי', '0525551234', 'פרטי', 'כן',
      'בדיבור', '12-345-99', 'טויוטה קורולה', '2019', 'כן',
      'כן', 'רעש בבלמים', 'לא',
    ]);
    expect(says.slice(0, 5)).toEqual([P.newCustomerOpen, P.phone, P.customerTypeBiz, P.confirmCustomer, P.vehicleChoice]);
    expect(says.slice(5, 10)).toEqual([P.vehiclePlate, P.model, P.year, P.vehicleConfirm, P.vehicleSavedOpenWork]);
    expect(g.writes).toEqual(['createCustomer', 'createVehicle']);
    expect(last.turn.isConfirmation).toBe(true);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.caseCreated);
    expect(g.writes).toEqual(['createCustomer', 'createVehicle', 'createCase']);
    expect(g.vehicles.at(-1)).toMatchObject({ plate: '1234599', make: 'טויוטה', model: 'קורולה', year: 2019 });
    expectAllSpokenFixed([...transcript, done]);
  });

  it('nothing is saved before the customer confirmation', async () => {
    const { last } = await talk('new_customer', ['רונית', '0541112233', 'פרטי']);
    expect(last.turn.say).toBe(P.confirmCustomer);
    expect(g.writes).toEqual([]);
  });

  it('business customer: asks business id (skippable) and saves company name', async () => {
    const { last } = await talk('new_customer', ['חברת הובלות הצפון', '0541231231', 'עסקי', 'דלג', 'כן']);
    expect(last.turn.say).toBe(P.vehicleChoice);
    expect(g.customers.at(-1)).toMatchObject({ customer_type: 'business', company_name: 'הובלות הצפון' });
  });

  it('similar customer found → offered; "yes" moves to that existing customer', async () => {
    const { last, says } = await talk('new_customer', ['משה כהן', '0521111111']);
    expect(says.at(-1)).toBe(P.similarFound);
    const r = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(r.session!.type).toBe('existing_customer');
    expect(r.turn.say).toBe(P.customerMenu);
    expect(g.writes).toEqual([]);
  });

  it('similar customer found → "no" creates a new one on purpose', async () => {
    const { last } = await talk('new_customer', ['משה כהן', '0521111111', 'לא', 'פרטי', 'כן']);
    expect(last.turn.say).toBe(P.vehicleChoice);
    expect(g.writes).toEqual(['createCustomer']);
  });

  it('license photo: fields are read, shown for verification, missing ones asked, nothing saved unverified', async () => {
    readDocument.mockResolvedValue({ plate_number: '45-678-90', make: 'יונדאי', model: 'איוניק' });
    const { last, says } = await talk('new_customer', ['שרה', '0541112233', 'פרטי', 'כן', 'צילום רישיון', 'FILE']);
    expect(says.at(-2)).toBe(P.licenseUpload);
    expect(last.turn.say).toBe(P.licenseReadOk);
    expect(last.turn.display).toContain('4567890');
    expect(readDocument).toHaveBeenCalledWith('vehicle_license', photo);
    expect(g.writes).toEqual(['createCustomer']);
    const r = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(r.turn.say).toBe(P.year); // year was not on the license → asked
    const r2 = await answerVoiceWorkflow(r.session!, 'לא ידוע', env());
    expect(r2.turn.say).toBe(P.vehicleConfirm);
    await answerVoiceWorkflow(r2.session!, 'כן', env());
    expect(g.vehicles.at(-1)).toMatchObject({ plate: '4567890', make: 'יונדאי', model: 'איוניק' });
  });

  it('license read rejected by the worker → nothing from the photo is kept', async () => {
    readDocument.mockResolvedValue({ plate_number: '45-678-90', make: 'יונדאי', model: 'איוניק' });
    const { last } = await talk('new_customer', ['שרה', '0541112233', 'פרטי', 'כן', 'צילום רישיון', 'FILE', 'לא']);
    expect(last.turn.say).toBe(P.vehiclePlate);
    expect(last.session!.data.plate).toBeUndefined();
    expect(last.session!.data.make).toBeUndefined();
  });

  it('unreadable license → continues by speech', async () => {
    const { last } = await talk('new_customer', ['שרה', '0541112233', 'פרטי', 'כן', 'צילום', 'FILE']);
    expect(last.turn.say).toBe(P.licenseReadFailed);
  });

  it('"בלי רכב" after the customer is saved ends with the customer only', async () => {
    const { last } = await talk('new_customer', ['שרה', '0541112233', 'פרטי', 'כן', 'בלי רכב']);
    expect(last.turn.say).toBe(P.customerOnlyCreated);
    expect(g.writes).toEqual(['createCustomer']);
  });

  it('plate of another customer is refused before saving', async () => {
    const { last } = await talk('new_customer', ['גל', '0520000001', 'פרטי', 'כן', 'בדיבור', '1234567']);
    expect(last.turn.say).toBe(P.plateTaken);
    expect(g.writes).toEqual(['createCustomer']);
  });

  it('invalid phone is asked again — nothing is invented', async () => {
    const { last } = await talk('new_customer', ['רונית', '12345']);
    expect(last.turn.say).toBe(P.phoneInvalid);
  });

  it('correction mid-way keeps the other answers', async () => {
    const { last } = await talk('new_customer', ['יוסי', '0525551234', 'פרטי']);
    const r = await answerVoiceWorkflow(last.session!, 'תקני את הטלפון ל 0547779999', env());
    expect(r.session!.data.customerPhone).toBe('054-7779999');
    expect(r.session!.data.customerName).toBe('יוסי');
    expect(r.turn.say).toBe(P.confirmCustomer);
  });

  it('save error → failed (never success) and kept for resume', async () => {
    const { last } = await talk('new_customer', ['גל', '0520000002', 'פרטי']);
    g.failNextWrite = 'שגיאת רשת';
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.outcome).toBe('failed');
    expect(done.turn.say).toBe(DALIA_SAFE_ALTERNATIVES.executedFailed);
    expect(done.turn.keepForResume).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

describe('פקודות: חזרי, שאלה קודמת, בטל, עצרי, מה רשמת', () => {
  it('repeat', async () => {
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
  });
  it('pause keeps the session for resume', async () => {
    const { last } = await talk('new_customer', ['יוסי', 'עצרי']);
    expect(last.turn.outcome).toBe('paused');
    expect(last.turn.expectsAnswer).toBe(false);
  });
  it('commands are not detected inside real answers', () => {
    expect(detectCommand('שני מגבים 60 שקל')).toBeNull();
    expect(detectCommand('בטל')).toBe('cancel');
    expect(detectCommand('חזרי')).toBe('repeat');
    expect(detectCommand('תתקני את השם')).toEqual({ correct: 'השם' });
  });
});

// ---------------------------------------------------------------------------
// 2. Existing customer
// ---------------------------------------------------------------------------

describe('לקוח קיים', () => {
  it('several matches → pick → menu', async () => {
    const { says, last } = await talk('existing_customer', ['משה', 'השני']);
    expect(says[1]).toBe(P.customerMany);
    expect(last.turn.say).toBe(P.customerMenu);
    expect(last.session!.data.customerId).toBe('c3');
  });
  it('by customer number', async () => {
    const { last } = await talk('existing_customer', ['לקוח מספר 102', 'כן']);
    expect(last.session!.data.customerId).toBe('c2');
  });
  it('card and vehicles are shown, the menu stays open', async () => {
    const { last } = await talk('existing_customer', ['דנה לוי', 'כן', 'כרטיס לקוח']);
    expect(last.turn.say).toBe(P.customerMenuAgain);
    expect(last.turn.display).toContain('054-2222222');
    const r = await answerVoiceWorkflow(last.session!, 'רכבים', env());
    expect(r.turn.display).toContain('7654321');
  });
  it('update contact person through the existing customer book', async () => {
    const { last } = await talk('existing_customer', ['דנה לוי', 'כן', 'עדכון פרטים', 'איש קשר', 'רון לוי']);
    expect(last.turn.say).toBe(P.confirmUpdate);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.customerUpdated);
    expect(dana.contact_person).toBe('רון לוי');
  });
  it('new work for an existing vehicle', async () => {
    const { last } = await talk('existing_customer', ['דנה לוי', 'כן', 'עבודה חדשה', 'כן', 'החלפת שמן', 'לא']);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.caseCreated);
    expect(g.writes).toEqual(['createCase']);
  });
  it('not found', async () => {
    const { last } = await talk('existing_customer', ['ישראל ישראלי']);
    expect(last.turn.say).toBe(P.customerNotFound);
  });
});

// ---------------------------------------------------------------------------
// 3. Intake with mandatory photos
// ---------------------------------------------------------------------------

const INTAKE_ANSWERS = ['רעש מהמנוע', 'בדיקת מנוע', 'שריטה בדלת', 'לא', 'מאה עשרים אלף', 'חצי', 'שניים', 'כן, נורת מנוע', 'לא'];

describe('קבלת רכב לעבודה', () => {
  it('fields saved first; completion only after all 5 required photos and worker confirmation', async () => {
    const { last, says } = await talk('intake', ['1234567', ...INTAKE_ANSWERS]);
    expect(says.slice(1, 4)).toEqual([P.intakeComplaint, P.intakeWork, P.intakeCondition]);
    expect(last.turn.isConfirmation).toBe(true);
    let r = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(r.turn.say).toBe(P.intakeSavedPhotos);
    expect(r.turn.ui?.some((u) => u.type === 'upload')).toBe(true);
    expect(g.cases.find((c) => c.id === 'k1')!.case_data).toMatchObject({ intakeKm: '120000', intakeFuel: '1/2', intakeInterior: 'שריטה בדלת' });
    const asked: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      r = await answerVoiceFile(r.session!, photo, env());
      asked.push(r.turn.say);
    }
    expect(asked.slice(0, 4)).toEqual([P.photoRear, P.photoRight, P.photoLeft, P.photoDashboard]);
    expect(asked[4]).toBe(P.intakeFinalConfirm);
    expect(g.media.map((m) => m.category)).toEqual(['angles', 'angles', 'angles', 'angles', 'angles']);
    expect(g.cases.find((c) => c.id === 'k1')!.case_data.intakeDone).toBeUndefined();
    const done = await answerVoiceWorkflow(r.session!, 'כן', env());
    expect(done.turn.say).toBe(P.intakeDoneSaid);
    expect(g.cases.find((c) => c.id === 'k1')!.case_data.intakeDone).toBe(true);
  });

  it('missing photos → "אחר כך" leaves the vehicle NOT received and resumable', async () => {
    const { last } = await talk('intake', ['1234567', ...INTAKE_ANSWERS, 'כן', 'FILE', 'אחר כך']);
    expect(last.turn.say).toBe(P.photosLater);
    expect(last.turn.keepForResume).toBe(true);
    expect(last.turn.display).toContain('אחורה');
    expect(g.cases.find((c) => c.id === 'k1')!.case_data.intakeDone).toBeUndefined();
  });

  it('mileage is mandatory (as in the intake screen)', async () => {
    const { last } = await talk('intake', ['1234567', 'רעש', 'בדיקה', 'תקין', 'לא', 'לא יודע']);
    expect(last.turn.say).toBe(P.kmRetry);
  });

  it('quote-first case with an unapproved quote cannot be received', async () => {
    g.cases.find((c) => c.id === 'k1')!.case_data.route = 'quote_first';
    const { last } = await talk('intake', ['1234567']);
    expect(last.turn.say).toBe(P.intakeBlockedQuoteFirst);
  });

  it('unknown vehicle → new customer, vehicle and intake case', async () => {
    const { last } = await talk('intake', ['8889990', 'רון', '0526667777', 'פרטי', 'סקודה אוקטביה', ...INTAKE_ANSWERS]);
    await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(g.writes).toEqual(['createCustomer', 'createVehicle', 'createCase']);
    expect(g.cases[0].case_data).toMatchObject({ route: 'intake_first', intakeKm: '120000' });
  });
});

// ---------------------------------------------------------------------------
// 4. Quote and extra work
// ---------------------------------------------------------------------------

describe('הצעת מחיר ותוספות', () => {
  it('new quote: works and parts with qty/price, saved as draft in the screen format', async () => {
    const { last, transcript } = await talk('quote', ['הצעה חדשה', '1234567', 'יישור פח בכנף 450 שקל', 'זהו', 'פילטר שמן כמות 2 במחיר 80', 'אין עוד']);
    expect(last.turn.display).toContain('₪610');
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.quoteSaved);
    const cd = g.cases.find((c) => c.id === 'k1')!.case_data;
    expect(cd.quoteWorks?.[1]).toMatchObject({ part: 'יישור פח בכנף', type: 'פחחות', price: 450 });
    expect(cd.quoteParts?.[0]).toMatchObject({ name: 'פילטר שמן', qty: 2, price: 80, supplier: 'us' });
    expectAllSpokenFixed([...transcript, done]);
  });

  it('an approved quote is never changed silently — offered as extra work instead', async () => {
    const { last } = await talk('quote', ['עדכון הצעה', '11-222-33']);
    expect(last.turn.say).toBe(P.quoteLocked);
    const r = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(r.turn.say).toBe(P.supplementText);
  });

  it('extra work from a free sentence: asks part / work / both, saves a pending internal extra', async () => {
    const { last, says } = await talk('quote', ['פירקנו את הפגוש וגילינו שגם התומך שבור', '11-222-33', 'גם וגם', '650', 'רישום פנימי']);
    expect(says[2]).toBe(P.extraKindAbout);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.supplementSaved);
    const extra = g.cases.find((c) => c.id === 'k4')!.case_data.extraApprovals![0];
    expect(extra).toMatchObject({ status: 'pending_customer', works: 'חלק + עבודה', price: 650, channel: 'internal_discovery' });
  });
});

// ---------------------------------------------------------------------------
// 5. Invoices, charges & credits
// ---------------------------------------------------------------------------

describe('חשבוניות וזיכויים', () => {
  it('search invoice — read only', async () => {
    const { last } = await talk('invoices_credits', ['חיפוש חשבונית', '7788']);
    expect(last.turn.say).toBe(P.invoiceFound);
    expect(g.writes).toEqual([]);
  });
  it('charge draft for a monthly customer → may mark "חיוב לקוח/חברה", never a tax document', async () => {
    const { last } = await talk('invoices_credits', ['הכנת חיוב', 'אלדן', 'אשראי חודשי']);
    expect(last.turn.display).toContain('לא מסמך מס');
    expect(last.turn.display).toContain('500');
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.markedInvoiced);
    expect(g.cases.find((c) => c.id === 'k4')!.case_data.paymentStatus).toBe('invoiced');
  });
  it('credit: explains no licensed provider, shows the invoice credit state', async () => {
    const { says, last } = await talk('invoices_credits', ['זיכוי', '7788']);
    expect(says[1]).toBe(P.creditNoProvider);
    expect(last.turn.say).toBe(P.invoiceFound);
  });
});

// ---------------------------------------------------------------------------
// 6. Suppliers
// ---------------------------------------------------------------------------

describe('ספקים וחשבוניות ספק', () => {
  it('find supplier', async () => {
    const { last } = await talk('general_expenses', ['למצוא ספק', 'אוטו חלקים', 'כן']);
    expect(last.turn.say).toBe(P.supplierShown);
  });
  it('new supplier with phone and category', async () => {
    const { last } = await talk('general_expenses', ['ספק חדש', 'צמיגי הצפון', '0501234567', 'חלקים']);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.supplierCreated);
    expect(g.suppliers.at(-1)).toMatchObject({ name: 'צמיגי הצפון', phone: '050-1234567' });
  });
  it('supplier invoice by speech: number, date, amount, case, kind → saved', async () => {
    const { last } = await talk('general_expenses', ['חשבונית ספק', 'אוטו חלקים', 'כן', 'בלי צילום', '5521', 'היום', 'אלף מאה שמונים', 'תיק עבודה', '1234567', 'חלקים']);
    expect(last.turn.display).toContain('₪1,180');
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.invoiceSaved);
    expect(g.invoices.at(-1)).toMatchObject({ invoice_number: '5521', total_amount: 1180, case_id: 'k1', invoice_type: 'parts_invoice', expense_category: 'parts' });
  });
  it('supplier invoice photo is read for verification and attached to the case', async () => {
    readDocument.mockResolvedValue({ invoice_number: '9001', invoice_date: '2026-10-22', total_amount: 590 });
    const { last } = await talk('general_expenses', ['חשבונית ספק', 'אוטו חלקים', 'כן', 'FILE']);
    expect(last.turn.say).toBe(P.invoiceReadOk);
    const r = await talk('general_expenses', []); void r;
    let x = await answerVoiceWorkflow(last.session!, 'כן', env());
    x = await answerVoiceWorkflow(x.session!, 'תיק עבודה', env());
    x = await answerVoiceWorkflow(x.session!, '1234567', env());
    x = await answerVoiceWorkflow(x.session!, 'חלקים', env());
    const done = await answerVoiceWorkflow(x.session!, 'כן', env());
    expect(done.turn.say).toBe(P.invoiceSaved);
    expect(g.media.at(-1)).toMatchObject({ category: 'parts_invoices', caseId: 'k1' });
  });
  it('duplicate supplier invoice is refused', async () => {
    const { last } = await talk('general_expenses', ['חשבונית ספק', 'אוטו חלקים', 'כן', 'בלי צילום', '7788', 'היום', '1180', 'הוצאה כללית', 'חלקים']);
    const done = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(done.turn.say).toBe(P.duplicateInvoice);
    expect(g.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. Find case — the reported bug
// ---------------------------------------------------------------------------

describe('איתור תיק עבודה (התקלה מהטלפון)', () => {
  it('finds an OPEN case that exists, even beyond the 100 cases of the list screen', async () => {
    const { last } = await talk('find_case', ['9988776']);
    expect(last.turn.say).toBe(P.caseFoundOpen);
    expect(last.turn.display).toContain('GM-2025-0777');
  });
  it('"התיק של משה כהן" — command words are not required in the customer name', async () => {
    expect(caseSearchTerms('התיק של משה כהן').nameWords).toEqual(['משה', 'כהן']);
    const { last } = await talk('find_case', ['התיק של משה כהן']);
    expect([P.casesMany, P.caseFoundOpen]).toContain(last.turn.say);
  });
  it('case number spoken in words ("מאה עשרים ותשע")', async () => {
    const { last } = await talk('find_case', ['תיק מאה עשרים ותשע']);
    expect(last.turn.display).toContain('GM-2026-0129');
  });
  it('company name with a Hebrew prefix ("של אלדן" / "לאלדן")', async () => {
    const { last } = await talk('find_case', ['תביאי לי את התיק לאלדן']);
    expect(last.turn.display).toContain('GM-2026-0129');
  });
  it('several results → choice list', async () => {
    const { last } = await talk('find_case', ['משה']);
    expect(last.turn.say).toBe(P.casesMany);
    expect(last.turn.ui?.[0].type).toBe('choices');
  });
  it('a technical search failure is reported as a failure, not as "not found"', async () => {
    g.searchFails = true;
    const { last } = await talk('find_case', ['1234567']);
    expect(last.turn.say).toBe(P.searchFailed);
    expect(last.turn.say).not.toBe(P.caseNotFound);
  });
  it('really not found', async () => {
    const { last } = await talk('find_case', ['5550001']);
    expect(last.turn.say).toBe(P.caseNotFound);
  });
  it('"תראי לי את כל התיקים הפתוחים" → summary card + full list for the drawer', async () => {
    const { last } = await talk('find_case', ['תראי לי את כל התיקים הפתוחים']);
    expect(last.turn.say).toBe(P.listSummary);
    const list = last.turn.ui!.find((u) => u.type === 'list');
    expect(list && list.type === 'list' && list.rows.length).toBe(4); // k1, k2 (ready), k4, kOld
  });
  it('"גם סגורים" lists all cases', async () => {
    const { last } = await talk('find_case', ['תראי לי את כל התיקים גם סגורים']);
    const list = last.turn.ui!.find((u) => u.type === 'list');
    expect(list && list.type === 'list' && list.rows.length).toBe(g.cases.length);
  });
  it('open the found case', async () => {
    const { last } = await talk('find_case', ['תיק 42', 'כן']);
    expect(last.turn.openCaseId).toBe('k2');
  });
});

// ---------------------------------------------------------------------------
// 8. Close case questionnaire
// ---------------------------------------------------------------------------

describe('סגירת תיק — שאלון', () => {
  it('ready case: questionnaire then close after explicit decision', async () => {
    const { last, says } = await talk('close_case', ['7654321', 'שאלון', 'לא', 'כן']);
    expect(says[1]).toBe(P.closeMode);
    expect(says[2]).toBe(P.cqExtras);
    expect(last.turn.say).toBe(P.cqDecision);
    expect(last.turn.ui?.some((u) => u.type === 'checklist')).toBe(true);
    const done = await answerVoiceWorkflow(last.session!, 'לסגור', env());
    expect(done.turn.say).toBe(P.caseClosed);
    expect(g.writes).toEqual(['closeCase:k2']);
  });
  it('no valid order → stops before closing', async () => {
    const k1 = g.cases.find((c) => c.id === 'k1')!;
    k1.case_data = { ...READY_TO_CLOSE, quoteApproved: false, workOrderSaved: false, workOrderAmount: 0, quoteWorks: [], finalApprovedAmount: 0 };
    const { last } = await talk('close_case', ['1234567', 'בדיבור', 'לא']);
    expect(last.turn.say).toBe(P.closeOrderMissing);
    expect(g.writes).toEqual([]);
  });
  it('monthly customer (אלדן) that has not paid: operational close, payment stays tracked, never "שולם"', async () => {
    const k4 = g.cases.find((c) => c.id === 'k4')!;
    k4.case_data = { ...k4.case_data, ...READY_TO_CLOSE, paymentStatus: '', payments: k4.case_data.payments, totalPaid: 500 };
    const { last, says } = await talk('close_case', ['11-222-33', 'בדיבור', 'לא', 'כן', 'כן']);
    expect(says.at(-1)).toBe(P.cqMarkInvoiced);
    const r = await answerVoiceWorkflow(last.session!, 'כן', env());
    expect(g.cases.find((c) => c.id === 'k4')!.case_data.paymentStatus).toBe('invoiced');
    expect(r.turn.say).toBe(P.cqDecision);
    const done = await answerVoiceWorkflow(r.session!, 'לסגור', env());
    expect(done.turn.say).toBe(P.caseClosed);
    expect(g.cases.find((c) => c.id === 'k4')!.case_data.paymentStatus).toBe('invoiced');
  });
  it('regular customer that has not paid → kept open', async () => {
    const k4 = g.cases.find((c) => c.id === 'k4')!;
    k4.case_data = { ...k4.case_data, ...READY_TO_CLOSE, paymentStatus: '', totalPaid: 500 };
    const { last } = await talk('close_case', ['11-222-33', 'בדיבור', 'לא', 'כן', 'לא']);
    expect(last.turn.say).toBe(P.closeUnpaid);
    expect(g.writes).toEqual([]);
  });
  it('hide / archive is not delete: explained, nothing removed', async () => {
    const { last } = await talk('close_case', ['7654321', 'בדיבור', 'לא', 'כן', 'להסתיר את התיק']);
    expect(last.turn.say).toBe(P.noArchive);
    expect(g.writes).toEqual([]);
  });
  it('work not finished, photos missing → finish photos requested, then work marked finished', async () => {
    const k2 = g.cases.find((c) => c.id === 'k2')!;
    k2.case_data = { ...READY_TO_CLOSE, workFinished: false, finishAngles: {} };
    const { last } = await talk('close_case', ['7654321', 'בדיבור', 'כן']);
    expect(last.turn.say).toBe(P.finishPhotoFront);
    let r = last;
    for (let i = 0; i < 4; i += 1) r = await answerVoiceFile(r.session!, photo, env());
    expect(r.turn.say).toBe(P.markFinished);
    r = await answerVoiceWorkflow(r.session!, 'כן', env());
    expect(g.cases.find((c) => c.id === 'k2')!.case_data.workFinished).toBe(true);
    expect(r.turn.say).toBe(P.cqExtras);
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
  it('resumes at the same question with what is left', async () => {
    const { last } = await talk('new_customer', ['יוסי', '0525551234', 'עצרי']);
    saveVoiceSession(last.session as VoiceSession);
    const r = await startVoiceWorkflow('resume_action', {}, env());
    expect(r.turn.display).toContain('יוסי');
    expect(r.turn.display).toContain('השלב הבא');
    const cont = await answerVoiceWorkflow(r.session!, 'כן', env());
    expect(cont.turn.say).toBe(P.customerTypeBiz);
  });
  it('photo-less saved session never contains file bytes', async () => {
    const { last } = await talk('new_customer', ['יוסי']);
    saveVoiceSession({ ...(last.session as VoiceSession), data: { ...(last.session as VoiceSession).data, invoiceFile: { name: 'x', type: 'x', b64: 'AAAA' } } });
    expect(loadVoiceSession(NOW)!.data.invoiceFile).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 10. General action
// ---------------------------------------------------------------------------

describe('פעולה כללית', () => {
  it.each([
    ['תמצאי לי את התיק של אלדן', 'find_case'],
    ['תוסיפי עבודה של החלפת כנף', 'quote'],
    ['תראי לי כמה כסף נכנס השבוע', 'reports'],
    ['תבדקי איזה תיקים מוכנים לסגירה', 'find_case'],
    ['תראי לי את כל הרכבים בעבודה', 'find_case'],
    ['לקוח חדש', 'new_customer'],
  ])('%s → %s', (text, type) => {
    expect(routeFreeRequest(text)?.type).toBe(type);
  });
  it('free request keeps the details: "תמצאי לי את התיק של אלדן" goes straight to the case', async () => {
    const { last } = await talk('general_action', ['תמצאי לי את התיק של אלדן']);
    expect(last.session!.type).toBe('find_case');
    expect(last.turn.display).toContain('GM-2026-0129');
  });
  it('"תוסיפי עבודה של החלפת כנף" keeps the work line', async () => {
    const { last } = await talk('general_action', ['תוסיפי עבודה של החלפת כנף']);
    expect(last.session!.data.works?.[0]?.name).toBe('החלפת כנף');
  });
  it('unrecognised request is handed to the regular Dalia chat', async () => {
    const { last } = await talk('general_action', ['מה מזג האוויר מחר']);
    expect(last.turn.handoff).toBe('מה מזג האוויר מחר');
    expect(last.turn.say).toBe(P.generalToChat);
  });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

describe('דוחות', () => {
  it('"כמה כסף נכנס השבוע מאלדן" → real received money only, period stated, no questionnaire', async () => {
    const { last } = await talk('reports', ['כמה כסף נכנס השבוע מאלדן']);
    expect(last.turn.done).toBe(true);
    expect(last.turn.alt).toBe(P.reportShown);
    const rep = last.turn.ui!.find((u) => u.type === 'report');
    expect(rep && rep.type === 'report').toBe(true);
    if (rep?.type !== 'report') return;
    const received = rep.result.cards.find((c) => c.label === 'התקבל בפועל')!;
    expect(received.value).toContain('500');
    expect(received.hint).toContain('1 תשלומים');
    expect(rep.result.periodLabel).toContain('השבוע');
    // balances / approved / quotes are separate figures, never added to "received"
    const open = rep.result.cards.find((c) => c.label === 'עדיין לא שולם')!;
    expect(open.value).toContain('1,500');
  });
  it('a financial request without a period asks only for the period', async () => {
    const { last } = await talk('reports', ['דוח כספי', 'בדיבור', 'כמה התקבל מאלדן']);
    expect(last.turn.say).toBe(P.reportPeriod);
  });
  it('questionnaire mode asks company, period and detail', async () => {
    const { says } = await talk('reports', ['דוח כספי', 'שאלון', 'כולן', 'החודש', 'פירוט']);
    expect(says.slice(2, 5)).toEqual([P.reportCompany, P.reportPeriod, P.reportDetail]);
  });
  it('cases report: open cases this month', async () => {
    const { last } = await talk('reports', ['תראי לי את כל התיקים הפתוחים החודש']);
    const rep = last.turn.ui!.find((u) => u.type === 'report');
    expect(rep?.type === 'report' && rep.result.rows.length).toBe(3); // k1, k2, k4 opened in October
  });
  it('unknown company is not invented — asked again', async () => {
    const { last } = await talk('reports', ['כמה כסף נכנס השבוע מחברת קוקה']);
    expect(last.turn.say).toBe(P.reportCompanyNotFound);
  });
  it('no payments in the period → says there is no data, invents nothing', async () => {
    const { last } = await talk('reports', ['כמה כסף נכנס היום']);
    const rep = last.turn.ui!.find((u) => u.type === 'report');
    expect(rep?.type === 'report' && rep.result.notes.join(' ')).toContain('לא הוערך סכום');
  });
});

// ---------------------------------------------------------------------------
// Payment shortcut (unchanged behaviour)
// ---------------------------------------------------------------------------

describe('תשלום (קיצור בתוך תיק)', () => {
  const ctx = { caseId: 'k1', caseNumber: 'GM-2026-0041' };
  it('amount + method in one answer, saved in server format', async () => {
    const { last } = await talk('context_pay_balance', ['50 שקל במזומן'], ctx);
    await answerVoiceWorkflow(last.session!, 'כן', env());
    const cd = g.cases.find((c) => c.id === 'k1')!.case_data as Record<string, unknown>;
    expect(cd.totalPaid).toBe(50);
    expect(cd.balanceRemaining).toBe(68);
  });
  it('caseTotalPayable mirrors the server rule', () => {
    expect(caseTotalPayable({ workOrderAmount: 500 })).toBe(500);
  });
});

describe('without garage actions', () => {
  it('says the action is only available from the garage screen', async () => {
    const r = await startVoiceWorkflow('new_customer', {}, { actions: null });
    expect(r.turn.say).toBe(P.noActions);
  });
});
