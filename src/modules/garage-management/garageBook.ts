import { supabase } from '@/integrations/supabase/client';

export type GarageCustomerType = 'private' | 'business' | 'fleet';

export type GarageCustomer = {
  id: string;
  customer_number: number;
  customer_type: GarageCustomerType;
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
  photos?: { fl?: boolean; fr?: boolean; rl?: boolean; rr?: boolean };
  damageCount?: number;
  quoteCreated?: boolean;
  quoteSent?: boolean;
  quoteApproved?: boolean;
  workOrderSaved?: boolean;
  workOrderAmount?: number | string | null;
  workOrderNumber?: string | null;
  intakeDone?: boolean;
  signatureCaptured?: boolean;
  workStarted?: boolean;
  workFinished?: boolean;
  caseClosed?: boolean;
  workExtraPrice?: number;
  currentScreen?: string;
  timeline?: Array<{ at?: string; text?: string }>;
  quote?: Record<string, unknown>;
  damage?: unknown[];
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

export function customerDisplayName(c: Pick<GarageCustomer, 'customer_type' | 'name' | 'company_name'>): string {
  if (c.customer_type === 'private') return c.name.trim();
  return (c.company_name || c.name).trim();
}

export function vehicleLabel(v: Pick<GarageVehicle, 'make' | 'model' | 'year'>): string {
  return [v.make, v.model, v.year ? String(v.year) : ''].filter(Boolean).join(' · ');
}

export function emptyCaseData(): GarageCaseData {
  return {
    photos: { fl: false, fr: false, rl: false, rr: false },
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
    quote: {},
    damage: [],
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
  if (data.intakeDone) return 'הרכב התקבל';
  if (data.quoteApproved) return 'אושר';
  if (data.quoteSent) return 'ממתין לאישור';
  if (data.quoteCreated) return 'הצעה בהכנה';
  return 'בדיקת רכב';
}

function errMessage(error: { message?: string } | null | undefined, fallback: string) {
  return error?.message || fallback;
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
        phone ? `phone.ilike.%${phone}%` : '',
      ].filter(Boolean).join(','),
    )
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) throw new Error(errMessage(error, 'חיפוש לקוח נכשל'));
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
  return customers;
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
  if (error) throw new Error(errMessage(error, 'בדיקת כפילות לקוח נכשלה'));
  return findDuplicateCustomers((data || []) as GarageCustomer[], draft);
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
    return { customer: duplicates[0], duplicates };
  }
  const insert = {
    customer_type: draft.customer_type,
    name: draft.name || '',
    company_name: draft.company_name || '',
    phone: draft.phone,
    second_phone: draft.second_phone || '',
    email: draft.email || '',
    address: draft.address || '',
    business_id: draft.business_id || '',
    contact_person: draft.contact_person || '',
    preferred_channel: draft.preferred_channel || '',
    notes: draft.notes || '',
  };
  const { data, error } = await tbl('garage_customers').insert(insert as never).select('*').single();
  if (error) throw new Error(errMessage(error, 'שמירת לקוח נכשלה'));
  return { customer: data as GarageCustomer, duplicates: [] };
}

export async function listVehicles(customerId: string): Promise<GarageVehicle[]> {
  const { data, error } = await tbl('garage_vehicles')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(errMessage(error, 'טעינת רכבים נכשלה'));
  return (data || []) as GarageVehicle[];
}

export async function findVehicleByPlate(plate: string): Promise<GarageVehicle | null> {
  const needle = normalizePlate(plate);
  if (!needle) return null;
  const { data, error } = await tbl('garage_vehicles').select('*').limit(500);
  if (error) throw new Error(errMessage(error, 'חיפוש רכב נכשל'));
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
  if (error) throw new Error(errMessage(error, 'טעינת תיק נכשלה'));
  if (!data) return null;
  const row = data as GarageCase;
  const [{ data: customer }, { data: vehicle }] = await Promise.all([
    tbl('garage_customers').select('*').eq('id', row.customer_id).maybeSingle(),
    tbl('garage_vehicles').select('*').eq('id', row.vehicle_id).maybeSingle(),
  ]);
  return {
    ...row,
    case_data: sanitizeCaseData(row.case_data),
    customer: (customer as GarageCustomer) || null,
    vehicle: (vehicle as GarageVehicle) || null,
  };
}

export async function listCases(): Promise<GarageCase[]> {
  const { data, error } = await tbl('garage_cases')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(errMessage(error, 'טעינת תיקים נכשלה'));
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
  if (error) throw new Error(errMessage(error, 'טעינת היסטוריית לקוח נכשלה'));
  return (data || []) as GarageCase[];
}
