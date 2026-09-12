import { supabase } from '@/integrations/supabase/client';
import { extractCustomerOrderFields } from './garageOrderExtract';

export type GarageCustomerType = 'private' | 'business' | 'fleet';
export type GarageRoute = 'quote_first' | 'intake_first';

export type GarageContact = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  notes: string;
};

export type GaragePaymentStatus = '' | 'pending' | 'settled' | 'invoiced' | 'paid';

export type GarageCustomer = {
  id: string;
  customer_number: number;
  customer_type: GarageCustomerType;
  default_workflow?: GarageRoute;
  name: string;
  company_name: string;
  phone: string;
  second_phone: string;
  email: string;
  address: string;
  business_id: string;
  contact_person: string;
  preferred_channel: string;
  notes: string;
  contacts?: GarageContact[];
  created_at?: string;
  updated_at?: string;
};

export type GarageVehicle = {
  id: string;
  customer_id: string;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  color: string;
  vin: string;
  vehicle_type: string;
  internal_number: string;
  notes: string;
};

export type GarageCaseData = {
  route?: GarageRoute;
  flowStage?: string;
  photos?: { fl?: boolean; fr?: boolean; rl?: boolean; rr?: boolean };
  intakeAngles?: { front?: boolean; rear?: boolean; right?: boolean; left?: boolean; dashboard?: boolean };
  damageCount?: number;
  quoteCreated?: boolean;
  quoteSent?: boolean;
  quoteApproved?: boolean;
  workOrderSaved?: boolean;
  workOrderAmount?: number | string | null;
  workOrderNumber?: string | null;
  workOrderRef?: string | null;
  workOrderContact?: string | null;
  workOrderDate?: string | null;
  workOrderNotes?: string | null;
  intakeDone?: boolean;
  signatureCaptured?: boolean;
  workStarted?: boolean;
  workFinished?: boolean;
  caseClosed?: boolean;
  workExtraPrice?: number;
  currentScreen?: string;
  timeline?: Array<{ at?: string; text?: string }>;
  quote?: Record<string, unknown>;
  quoteWorks?: Array<{ id?: string; part?: string; type?: string; qty?: number; price?: number; desc?: string }>;
  quoteParts?: Array<{ id?: string; name?: string; qty?: number; price?: number; supplier?: string; sku?: string }>;
  quoteNotes?: string;
    quoteValidity?: string;
    damage?: unknown[];
    damageItems?: Array<{ part?: string; status?: string }>;
    extraApprovals?: Array<{
      id?: string;
      text?: string;
      price?: number;
      at?: string;
      sent?: boolean;
      status?: string;
      sentAt?: string;
      sentTo?: string;
      channel?: string;
      approvedAt?: string;
      approvedBy?: string;
    }>;
    waitingForApproval?: boolean;
    intakeUnlocked?: boolean;
    intakeKm?: string;
    intakeFuel?: string;
    intakeKeys?: string;
    intakeLights?: string;
    intakeItems?: string;
    intakeInterior?: string;
    intakeWorker?: string;
    selectedContact?: GarageContact | null;
    customerContacts?: GarageContact[];
    paymentStatus?: GaragePaymentStatus;
    finishAngles?: { front?: boolean; rear?: boolean; right?: boolean; left?: boolean };
    deliveryKm?: string;
    closeNote?: string;
    deliveryDone?: boolean;
    deliveryRecipient?: string;
    deliveryRecipientRole?: string;
    deliveryAt?: string;
    deliveryNote?: string;
    deliveryConfirmed?: boolean;
    deliverySignerName?: string;
    deliverySignedAt?: string;
    caseClosedAt?: string;
    caseClosedBy?: string;
    reopenHistory?: Array<{ at?: string; by?: string; reason?: string; previousClosedAt?: string }>;
  };

export type GarageCase = {
  id: string;
  case_number: string;
  customer_id: string;
  vehicle_id: string;
  status: string;
  opened_by: string;
  opened_by_name: string;
  customer_name_snapshot: string;
  vehicle_plate_snapshot: string;
  vehicle_label_snapshot: string;
  case_data: GarageCaseData;
  created_at?: string;
  updated_at?: string;
  customer?: GarageCustomer | null;
  vehicle?: GarageVehicle | null;
};

export type GarageActor = {
  id: string;
  full_name?: string;
  role?: string;
};

function tbl(name: string) {
  return supabase.from(name as never);
}

export function normalizePhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length > 9) return `0${digits.slice(3)}`;
  return digits;
}

export function normalizePlate(raw: string): string {
  return String(raw || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export type WorkOrderHints = {
  order_number: string;
  case_ref: string;
  order_date: string;
};

export function extractWorkOrderHints(input: {
  text?: string;
  fileName?: string;
} = {}): WorkOrderHints {
  void input.fileName;
  return extractCustomerOrderFields(input.text || '');
}

export function customerDisplayName(c: Pick<GarageCustomer, 'customer_type' | 'name' | 'company_name'>): string {
  if (c.customer_type === 'private') return c.name.trim();
  return (c.company_name || c.name).trim();
}

export function vehicleLabel(v: Pick<GarageVehicle, 'make' | 'model' | 'year'>): string {
  return [v.make, v.model, v.year ? String(v.year) : ''].filter(Boolean).join(' · ');
}

export function defaultRouteForCustomer(
  c?: Pick<GarageCustomer, 'default_workflow' | 'customer_type'> | null,
): GarageRoute {
  return c?.default_workflow === 'intake_first' ? 'intake_first' : 'quote_first';
}

export function routeLabel(route?: string): string {
  return route === 'intake_first' ? 'קבלת רכב' : 'הצעת מחיר תחילה';
}

export function garageNextAction(data: GarageCaseData): string {
  const route: GarageRoute = data.route === 'intake_first' ? 'intake_first' : 'quote_first';
  if (data.caseClosed) return '—';
  if (data.workFinished) return 'מסירה / סגירת תיק';
  if (data.workStarted) return 'המשך עבודה / אישור נוסף';
  if (route === 'quote_first') {
    if (data.intakeDone) return 'התחל עבודה';
    if (data.quoteApproved) return 'קבלת רכב + 5 תמונות';
    if (data.quoteSent || data.waitingForApproval) return 'ממתינים לאישור הלקוח';
    if (data.quoteCreated) return 'שלח הצעת מחיר';
    return 'הכנת הצעת מחיר';
  }
  if (data.quoteApproved) return 'התחל עבודה';
  if (data.quoteSent || data.waitingForApproval) return 'ממתינים לאישור הלקוח';
  if (data.intakeDone) return 'הכנת הצעת מחיר';
  if (data.workOrderSaved) return 'קבלת רכב + 5 תמונות';
  return 'העלאת הזמנת לקוח';
}

export function emptyCaseData(): GarageCaseData {
  return {
    route: 'quote_first',
    flowStage: 'open',
    photos: { fl: false, fr: false, rl: false, rr: false },
    intakeAngles: { front: false, rear: false, right: false, left: false, dashboard: false },
    damageCount: 0,
    quoteCreated: false,
    quoteSent: false,
    quoteApproved: false,
    workOrderSaved: false,
    workOrderAmount: null,
    workOrderNumber: null,
    intakeDone: false,
    signatureCaptured: false,
    workStarted: false,
    workFinished: false,
    caseClosed: false,
    workExtraPrice: 0,
    currentScreen: 's-case',
    timeline: [],
    quote: { works: [], parts: [], notes: '', validity: '' },
    quoteWorks: [],
    quoteParts: [],
    quoteNotes: '',
    quoteValidity: '',
    damage: [],
    damageItems: [],
    extraApprovals: [],
    waitingForApproval: false,
    intakeUnlocked: false,
    selectedContact: null,
    customerContacts: [],
    paymentStatus: '',
    finishAngles: { front: false, rear: false, right: false, left: false },
    deliveryKm: '',
    closeNote: '',
    deliveryDone: false,
    deliveryRecipient: '',
    deliveryConfirmed: false,
  };
}

function isForbiddenBlob(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  if (/^data:/i.test(v)) return true;
  if (/^blob:/i.test(v)) return true;
  if (v.length > 400 && /^[A-Za-z0-9+/=\s]+$/.test(v)) return true;
  return false;
}

export function sanitizeCaseData(input: unknown): GarageCaseData {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (isForbiddenBlob(value)) continue;
    if (Array.isArray(value)) {
      out[key] = value.filter((item) => !isForbiddenBlob(item)).map((item) => {
        if (item && typeof item === 'object') return sanitizeCaseData(item);
        return item;
      });
      continue;
    }
    if (value && typeof value === 'object') {
      out[key] = sanitizeCaseData(value);
      continue;
    }
    out[key] = value;
  }
  return out as GarageCaseData;
}

export function deriveCaseStatus(data: GarageCaseData): string {
  if (data.caseClosed) return 'סגור';
  if (data.workFinished) return 'מוכן למסירה';
  if (data.workStarted) return 'בעבודה';
  if (data.intakeDone && data.route === 'intake_first' && !data.quoteCreated) return 'הרכב התקבל';
  if (data.intakeDone && data.quoteApproved) return 'הרכב התקבל';
  if (data.quoteApproved) return 'אושר';
  if (data.quoteSent || data.waitingForApproval) return 'ממתין לאישור';
  if (data.quoteCreated) return 'הצעה בהכנה';
  if (data.intakeDone) return 'הרכב התקבל';
  return 'בדיקת רכב';
}

function errMessage(error: { message?: string } | null | undefined, fallback: string) {
  return error?.message || fallback;
}

export function isGarageSchemaMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === 'PGRST205'
    || /could not find the table/i.test(message)
    || /schema cache/i.test(message)
    || /does not exist/i.test(message);
}

export function closedCaseUiStatus(data: GarageCaseData): string {
  if (data.caseClosed) return 'הרכב נמסר / התיק נסגר';
  return deriveCaseStatus(data);
}

export function extraApprovalIsPending(item: NonNullable<GarageCaseData['extraApprovals']>[number]): boolean {
  if (!item) return false;
  if (item.approvedAt || item.status === 'approved' || item.status === 'rejected') return false;
  return true;
}

export function closeCaseGaps(data: GarageCaseData): string[] {
  const gaps: string[] = [];
  if (!data.workFinished) gaps.push('העבודה טרם סומנה כהושלמה');
  const hasPrice = Boolean(
    data.quoteCreated
    || data.workOrderAmount
    || (data.quoteWorks && data.quoteWorks.length)
    || (data.quoteParts && data.quoteParts.length),
  );
  if (!hasPrice) gaps.push('המחיר/ההצעה הסופיים אינם ברורים');
  const pendingExtra = (data.extraApprovals || []).filter(extraApprovalIsPending);
  if (pendingExtra.length) gaps.push('קיימת תוספת עבודה שממתינה לאישור');
  if (!data.paymentStatus) gaps.push('מצב התשלום לא סומן');
  const finish = data.finishAngles || {};
  const finishCount = ['front', 'rear', 'right', 'left'].filter((k) => !!(finish as Record<string, boolean>)[k]).length;
  if (finishCount < 4) gaps.push('חסרות תמונות סיום חובה (קדמי, אחורי, ימין, שמאל)');
  if (!String(data.deliveryKm || '').trim()) gaps.push('חסר קילומטראז׳ במסירה');
  if (!data.deliveryDone) gaps.push('מסירת הרכב לא בוצעה');
  if (!String(data.deliveryRecipient || '').trim()) gaps.push('מקבל הרכב לא זוהה');
  if (!data.deliveryConfirmed) gaps.push('חסר אישור/חתימת מקבל הרכב');
  return gaps;
}

export const GARAGE_CONTACTS_MARKER = /<!--gm-contacts:([\s\S]*?)-->/;

export function normalizeGarageContact(raw: Partial<GarageContact> | null | undefined, index = 0): GarageContact {
  return {
    id: String(raw?.id || `c${Date.now()}-${index}`),
    name: String(raw?.name || '').trim(),
    role: String(raw?.role || '').trim(),
    phone: String(raw?.phone || '').trim(),
    email: String(raw?.email || '').trim(),
    notes: String(raw?.notes || '').trim(),
  };
}

export function notesWithoutContacts(notes: string): string {
  return String(notes || '').replace(/\n?<!--gm-contacts:[\s\S]*?-->/g, '').trim();
}

export function encodeContactsInNotes(notes: string, contacts: GarageContact[]): string {
  const base = notesWithoutContacts(notes);
  const clean = (contacts || []).map((c, i) => normalizeGarageContact(c, i)).filter((c) => c.name || c.phone || c.email);
  if (!clean.length) return base;
  return `${base}${base ? '\n' : ''}<!--gm-contacts:${JSON.stringify(clean)}-->`;
}

export function parseCustomerContacts(c?: Partial<GarageCustomer> | null): GarageContact[] {
  if (!c) return [];
  if (Array.isArray(c.contacts) && c.contacts.length) {
    return c.contacts.map((row, i) => normalizeGarageContact(row, i)).filter((row) => row.name || row.phone || row.email);
  }
  const marked = String(c.notes || '').match(GARAGE_CONTACTS_MARKER);
  if (marked?.[1]) {
    try {
      const parsed = JSON.parse(marked[1]);
      if (Array.isArray(parsed)) {
        return parsed.map((row, i) => normalizeGarageContact(row, i)).filter((row) => row.name || row.phone || row.email);
      }
    } catch {
      /* keep legacy contact_person */
    }
  }
  if (c.contact_person) {
    return [normalizeGarageContact({
      id: 'legacy',
      name: c.contact_person,
      phone: c.phone || '',
      email: c.email || '',
    })];
  }
  return [];
}

export function hydrateCustomer(row: GarageCustomer): GarageCustomer {
  const contacts = parseCustomerContacts(row);
  return {
    ...row,
    contacts,
    notes: notesWithoutContacts(row.notes || ''),
  };
}

export function isGarageContactsColumnMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return /'contacts'|column.*contacts|contacts.*column/i.test(message)
    && (code === 'PGRST204' || /does not exist/i.test(message) || /schema cache/i.test(message) || /could not find/i.test(message));
}

export function isGarageWorkflowColumnMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return /default_workflow/i.test(message)
    && (code === 'PGRST204' || /does not exist/i.test(message) || /schema cache/i.test(message) || /could not find/i.test(message));
}

export const GARAGE_WORKFLOW_PENDING_MESSAGE =
  'שדה שיטת העבודה של הלקוח (default_workflow) עדיין ממתין ל-SQL ב-Staging. תיקים חדשים ייפתחו כהצעת מחיר תחילה עד להרצה.';

export const GARAGE_BOOK_PENDING_MESSAGE =
  'הפעלת מסד נתוני המוסך עדיין ממתינה. הלקוח, הרכב והתיק לא נשמרים עד להרצת ה-SQL ב-Staging.';

export async function probeGarageBook(): Promise<{ ready: boolean; pending: boolean; error?: string }> {
  const { error } = await tbl('garage_cases').select('id').limit(1);
  if (!error) return { ready: true, pending: false };
  if (isGarageSchemaMissing(error)) return { ready: false, pending: true, error: GARAGE_BOOK_PENDING_MESSAGE };
  return { ready: false, pending: false, error: errMessage(error, 'בדיקת ספר המוסך נכשלה') };
}

export async function searchCustomers(query: string): Promise<GarageCustomer[]> {
  const q = String(query || '').trim().replace(/[%(),]/g, ' ');
  if (!q) return [];
  const plate = normalizePlate(q);
  const phone = normalizePhone(q);
  const { data, error } = await tbl('garage_customers')
    .select('*')
    .or(
      [
        `name.ilike.%${q}%`,
        `company_name.ilike.%${q}%`,
        `phone.ilike.%${q}%`,
        `second_phone.ilike.%${q}%`,
        `business_id.ilike.%${q}%`,
        `contact_person.ilike.%${q}%`,
        `email.ilike.%${q}%`,
        phone ? `phone.ilike.%${phone}%` : '',
        phone ? `second_phone.ilike.%${phone}%` : '',
        /^\d{3,}$/.test(q) ? `customer_number.eq.${q}` : '',
      ].filter(Boolean).join(','),
    )
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) {
    if (isGarageSchemaMissing(error)) return [];
    throw new Error(errMessage(error, 'חיפוש לקוח נכשל'));
  }
  const customers = (data || []) as GarageCustomer[];
  if (plate.length >= 5) {
    const { data: vehicles } = await tbl('garage_vehicles').select('customer_id, plate').limit(200);
    const ids = new Set(
      ((vehicles || []) as Array<{ customer_id: string; plate: string }>)
        .filter((v) => normalizePlate(v.plate) === plate)
        .map((v) => v.customer_id),
    );
    if (ids.size) {
      const { data: extra } = await tbl('garage_customers').select('*').in('id', [...ids]);
      const seen = new Set(customers.map((c) => c.id));
      for (const row of (extra || []) as GarageCustomer[]) {
        if (!seen.has(row.id)) customers.push(row);
      }
    }
  }
  return customers.map(hydrateCustomer);
}

export function findDuplicateCustomers(
  existing: GarageCustomer[],
  draft: Pick<GarageCustomer, 'name' | 'company_name' | 'phone' | 'business_id' | 'customer_type'>,
): GarageCustomer[] {
  const phone = normalizePhone(draft.phone);
  const biz = String(draft.business_id || '').replace(/\s/g, '').toLowerCase();
  const display = customerDisplayName(draft).replace(/\s+/g, ' ').trim().toLowerCase();
  return existing.filter((row) => {
    if (phone && (normalizePhone(row.phone) === phone || normalizePhone(row.second_phone) === phone)) return true;
    if (biz && String(row.business_id || '').replace(/\s/g, '').toLowerCase() === biz) return true;
    if (display && customerDisplayName(row).replace(/\s+/g, ' ').trim().toLowerCase() === display) return true;
    return false;
  });
}

export async function detectCustomerDuplicates(
  draft: Pick<GarageCustomer, 'name' | 'company_name' | 'phone' | 'business_id' | 'customer_type'>,
): Promise<GarageCustomer[]> {
  const phone = normalizePhone(draft.phone);
  const biz = String(draft.business_id || '').trim();
  const name = customerDisplayName(draft);
  const filters = [
    phone ? `phone.eq.${draft.phone}` : '',
    phone ? `phone.ilike.%${phone}%` : '',
    phone ? `second_phone.ilike.%${phone}%` : '',
    biz ? `business_id.eq.${biz}` : '',
    name ? `name.ilike.%${name}%` : '',
    name ? `company_name.ilike.%${name}%` : '',
  ].filter(Boolean);
  if (!filters.length) return [];
  const { data, error } = await tbl('garage_customers').select('*').or(filterJoin(filters)).limit(25);
  if (error) {
    if (isGarageSchemaMissing(error)) return [];
    throw new Error(errMessage(error, 'בדיקת כפילות לקוח נכשלה'));
  }
  return findDuplicateCustomers(((data || []) as GarageCustomer[]).map(hydrateCustomer), draft);
}

function filterJoin(filters: string[]) {
  return filters.join(',');
}

export async function createCustomer(
  draft: Omit<GarageCustomer, 'id' | 'customer_number'> & { customer_number?: number },
  opts?: { force?: boolean },
): Promise<{ customer: GarageCustomer; duplicates: GarageCustomer[] }> {
  const duplicates = await detectCustomerDuplicates(draft);
  if (duplicates.length && !opts?.force) {
    return { customer: hydrateCustomer(duplicates[0]), duplicates: duplicates.map(hydrateCustomer) };
  }
  const contacts = parseCustomerContacts(draft);
  const primary = contacts[0];
  const workflow: GarageRoute = draft.default_workflow === 'intake_first' ? 'intake_first' : 'quote_first';
  const encodedNotes = encodeContactsInNotes(draft.notes || '', contacts);
  const insert: Record<string, unknown> = {
    customer_type: draft.customer_type,
    name: draft.name || '',
    company_name: draft.company_name || '',
    phone: draft.phone,
    second_phone: draft.second_phone || '',
    email: draft.email || '',
    address: draft.address || '',
    business_id: draft.business_id || '',
    contact_person: draft.contact_person || primary?.name || '',
    preferred_channel: draft.preferred_channel || '',
    notes: encodedNotes,
    default_workflow: workflow,
    contacts,
  };
  const first = await tbl('garage_customers').insert(insert as never).select('*').single();
  if (!first.error) {
    return { customer: hydrateCustomer({ ...(first.data as GarageCustomer), default_workflow: workflow, contacts }), duplicates: [] };
  }
  const retryInsert = { ...insert };
  let omitted = false;
  if (isGarageContactsColumnMissing(first.error)) {
    delete retryInsert.contacts;
    omitted = true;
  }
  if (isGarageWorkflowColumnMissing(first.error)) {
    delete retryInsert.default_workflow;
    omitted = true;
  }
  if (!omitted) throw new Error(errMessage(first.error, 'שמירת לקוח נכשלה'));
  const retry = await tbl('garage_customers').insert(retryInsert as never).select('*').single();
  if (!retry.error) {
    return { customer: hydrateCustomer({ ...(retry.data as GarageCustomer), default_workflow: workflow, contacts }), duplicates: [] };
  }
  if (isGarageContactsColumnMissing(retry.error) || isGarageWorkflowColumnMissing(retry.error)) {
    const last = { ...retryInsert };
    delete last.contacts;
    delete last.default_workflow;
    const finalTry = await tbl('garage_customers').insert(last as never).select('*').single();
    if (finalTry.error) throw new Error(errMessage(finalTry.error, 'שמירת לקוח נכשלה'));
    return { customer: hydrateCustomer({ ...(finalTry.data as GarageCustomer), default_workflow: workflow, contacts }), duplicates: [] };
  }
  throw new Error(errMessage(retry.error, 'שמירת לקוח נכשלה'));
}

export async function updateCustomerBook(
  customerId: string,
  patch: {
    default_workflow?: GarageRoute;
    contact_person?: string;
    notes?: string;
    contacts?: GarageContact[];
  },
): Promise<GarageCustomer> {
  const contacts = patch.contacts ? patch.contacts.map((c, i) => normalizeGarageContact(c, i)) : undefined;
  const updates: Record<string, unknown> = {};
  if (patch.default_workflow) {
    updates.default_workflow = patch.default_workflow === 'intake_first' ? 'intake_first' : 'quote_first';
  }
  if (patch.contact_person !== undefined) updates.contact_person = patch.contact_person;
  if (contacts) {
    updates.contacts = contacts;
    updates.contact_person = patch.contact_person || contacts[0]?.name || '';
  }
  if (patch.notes !== undefined || contacts) {
    updates.notes = encodeContactsInNotes(patch.notes || '', contacts || []);
  }
  const first = await tbl('garage_customers').update(updates as never).eq('id', customerId).select('*').single();
  if (!first.error) return hydrateCustomer(first.data as GarageCustomer);
  const retry = { ...updates };
  if (isGarageContactsColumnMissing(first.error)) delete retry.contacts;
  if (isGarageWorkflowColumnMissing(first.error)) delete retry.default_workflow;
  if (Object.keys(retry).length) {
    const second = await tbl('garage_customers').update(retry as never).eq('id', customerId).select('*').single();
    if (!second.error) return hydrateCustomer({
      ...(second.data as GarageCustomer),
      contacts: contacts || parseCustomerContacts(second.data as GarageCustomer),
      default_workflow: (updates.default_workflow as GarageRoute) || (second.data as GarageCustomer).default_workflow,
    });
    if (isGarageContactsColumnMissing(second.error) || isGarageWorkflowColumnMissing(second.error)) {
      const last = { ...retry };
      delete last.contacts;
      delete last.default_workflow;
      if (!Object.keys(last).length) {
        const { data } = await tbl('garage_customers').select('*').eq('id', customerId).single();
        return hydrateCustomer({ ...(data as GarageCustomer), contacts: contacts || [] });
      }
      const third = await tbl('garage_customers').update(last as never).eq('id', customerId).select('*').single();
      if (third.error) throw new Error(errMessage(third.error, 'שמירת לקוח נכשלה'));
      return hydrateCustomer({ ...(third.data as GarageCustomer), contacts: contacts || parseCustomerContacts(third.data as GarageCustomer) });
    }
    throw new Error(errMessage(second.error, 'שמירת לקוח נכשלה'));
  }
  throw new Error(errMessage(first.error, 'שמירת לקוח נכשלה'));
}

export async function updateCustomerWorkflow(
  customerId: string,
  workflow: GarageRoute,
): Promise<GarageCustomer> {
  return updateCustomerBook(customerId, {
    default_workflow: workflow === 'intake_first' ? 'intake_first' : 'quote_first',
  });
}

export async function listVehicles(customerId: string): Promise<GarageVehicle[]> {
  const { data, error } = await tbl('garage_vehicles')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) {
    if (isGarageSchemaMissing(error)) return [];
    throw new Error(errMessage(error, 'טעינת רכבים נכשלה'));
  }
  return (data || []) as GarageVehicle[];
}

export async function findVehicleByPlate(plate: string): Promise<GarageVehicle | null> {
  const needle = normalizePlate(plate);
  if (!needle) return null;
  const { data, error } = await tbl('garage_vehicles').select('*').limit(500);
  if (error) {
    if (isGarageSchemaMissing(error)) return null;
    throw new Error(errMessage(error, 'חיפוש רכב נכשל'));
  }
  return ((data || []) as GarageVehicle[]).find((v) => normalizePlate(v.plate) === needle) || null;
}

export async function createVehicle(
  draft: Omit<GarageVehicle, 'id'>,
): Promise<GarageVehicle> {
  const existing = await findVehicleByPlate(draft.plate);
  if (existing) {
    throw new Error(`לוחית ${existing.plate} כבר קיימת אצל לקוח במערכת. לא נוצר רכב כפול.`);
  }
  const insert = {
    customer_id: draft.customer_id,
    plate: draft.plate.trim(),
    make: draft.make || '',
    model: draft.model || '',
    year: draft.year || null,
    color: draft.color || '',
    vin: draft.vin || '',
    vehicle_type: draft.vehicle_type || '',
    internal_number: draft.internal_number || '',
    notes: draft.notes || '',
  };
  const { data, error } = await tbl('garage_vehicles').insert(insert as never).select('*').single();
  if (error) throw new Error(errMessage(error, 'שמירת רכב נכשלה'));
  return data as GarageVehicle;
}

export async function createCase(input: {
  customer: GarageCustomer;
  vehicle: GarageVehicle;
  actor: GarageActor;
  caseData?: GarageCaseData;
}): Promise<GarageCase> {
  const case_data = sanitizeCaseData(input.caseData || emptyCaseData());
  const insert = {
    customer_id: input.customer.id,
    vehicle_id: input.vehicle.id,
    status: deriveCaseStatus(case_data),
    opened_by: input.actor.id,
    opened_by_name: input.actor.full_name || '',
    customer_name_snapshot: customerDisplayName(input.customer),
    vehicle_plate_snapshot: input.vehicle.plate,
    vehicle_label_snapshot: vehicleLabel(input.vehicle),
    case_data,
  };
  const { data, error } = await tbl('garage_cases').insert(insert as never).select('*').single();
  if (error) throw new Error(errMessage(error, 'פתיחת תיק נכשלה'));
  return {
    ...(data as GarageCase),
    customer: input.customer,
    vehicle: input.vehicle,
  };
}

export async function updateCase(
  caseId: string,
  patch: { case_data?: GarageCaseData; status?: string; snapshots?: Partial<GarageCase> },
): Promise<GarageCase> {
  const updates: Record<string, unknown> = {};
  if (patch.case_data) {
    const case_data = sanitizeCaseData(patch.case_data);
    updates.case_data = case_data;
    updates.status = patch.status || deriveCaseStatus(case_data);
  } else if (patch.status) {
    updates.status = patch.status;
  }
  if (patch.snapshots?.customer_name_snapshot) updates.customer_name_snapshot = patch.snapshots.customer_name_snapshot;
  if (patch.snapshots?.vehicle_plate_snapshot) updates.vehicle_plate_snapshot = patch.snapshots.vehicle_plate_snapshot;
  if (patch.snapshots?.vehicle_label_snapshot) updates.vehicle_label_snapshot = patch.snapshots.vehicle_label_snapshot;
  const { data, error } = await tbl('garage_cases').update(updates as never).eq('id', caseId).select('*').single();
  if (error) throw new Error(errMessage(error, 'שמירת תיק נכשלה'));
  return data as GarageCase;
}

export async function getCase(caseId: string): Promise<GarageCase | null> {
  const { data, error } = await tbl('garage_cases').select('*').eq('id', caseId).maybeSingle();
  if (error) {
    if (isGarageSchemaMissing(error)) return null;
    throw new Error(errMessage(error, 'טעינת תיק נכשלה'));
  }
  if (!data) return null;
  const row = data as GarageCase;
  const [{ data: customer }, { data: vehicle }] = await Promise.all([
    tbl('garage_customers').select('*').eq('id', row.customer_id).maybeSingle(),
    tbl('garage_vehicles').select('*').eq('id', row.vehicle_id).maybeSingle(),
  ]);
  return {
    ...row,
    case_data: sanitizeCaseData(row.case_data),
    customer: customer ? hydrateCustomer(customer as GarageCustomer) : null,
    vehicle: (vehicle as GarageVehicle) || null,
  };
}

export async function listCases(): Promise<GarageCase[]> {
  const { data, error } = await tbl('garage_cases')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    if (isGarageSchemaMissing(error)) return [];
    throw new Error(errMessage(error, 'טעינת תיקים נכשלה'));
  }
  return ((data || []) as GarageCase[]).map((row) => ({
    ...row,
    case_data: sanitizeCaseData(row.case_data),
  }));
}

export async function listCustomerCases(customerId: string): Promise<GarageCase[]> {
  const { data, error } = await tbl('garage_cases')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) {
    if (isGarageSchemaMissing(error)) return [];
    throw new Error(errMessage(error, 'טעינת היסטוריית לקוח נכשלה'));
  }
  return (data || []) as GarageCase[];
}
