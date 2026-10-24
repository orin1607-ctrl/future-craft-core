// Suppliers, supplier invoices and case closing — the exact logic the garage screen bridge (GarageApp)
// always used, moved here so the Dalia voice workflows call the same code instead of a copy.
import { supabase } from '@/integrations/supabase/client';
import type { GarageActor, GarageShopScope } from './garageBook';

const DEFAULT_SHOP_NAME = 'מוסך יוני – פחחות וצבע לרכב';

export type GarageSupplier = {
  id: string;
  supplier_number?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  business_id?: string | null;
  contact_person?: string | null;
  category?: string | null;
  notes?: string | null;
  shop_company_name?: string | null;
};

export type GarageInvoice = {
  id: string;
  invoice_type?: string;
  invoice_number: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  case_id?: string | null;
  case_number?: string | null;
  vehicle_plate?: string | null;
  expense_category?: string | null;
  invoice_date?: string | null;
  subtotal?: number | null;
  vat_amount?: number | null;
  total_amount?: number | null;
  credit_status?: string | null;
  payment_status?: string | null;
  accounting_notes?: string | null;
  created_at?: string;
};

// GarageApp filtered by `shopScope.company_name`, a field GarageShopScope does not carry, so no shop filter
// was ever applied here. Kept as-is to leave the screen's behaviour unchanged.
function legacyShopFilter(shopScope?: GarageShopScope | null): string | undefined {
  return (shopScope as { company_name?: string } | null | undefined)?.company_name;
}

export async function listGarageSuppliers(shopScope?: GarageShopScope | null) {
  let sQuery = supabase.from('garage_suppliers' as never).select('*').order('name');
  const shop = legacyShopFilter(shopScope);
  if (shop) sQuery = sQuery.ilike('shop_company_name', `%${shop}%`);
  const { data, error } = await sQuery;
  return { suppliers: ((data || []) as GarageSupplier[]), error: error?.message };
}

export async function createGarageSupplier(
  payload: Record<string, unknown>,
  actor: Pick<GarageActor, 'company_name'> | null | undefined,
  shopScope?: GarageShopScope | null,
): Promise<{ supplier: GarageSupplier; alreadyExisted?: boolean }> {
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('שם ספק הוא שדה חובה');
  let dupQuery = supabase.from('garage_suppliers' as never).select('id, supplier_number, name').ilike('name', name);
  const shop = legacyShopFilter(shopScope);
  if (shop) dupQuery = dupQuery.ilike('shop_company_name', `%${shop}%`);
  const { data: existing } = await dupQuery.maybeSingle();
  if (existing) return { supplier: existing as GarageSupplier, alreadyExisted: true };
  const suppNum = `SUP-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data: created, error } = await supabase.from('garage_suppliers' as never).insert({
    supplier_number: suppNum,
    name,
    phone: payload.phone ? String(payload.phone).trim() : null,
    email: payload.email ? String(payload.email).trim() : null,
    business_id: payload.business_id ? String(payload.business_id).trim() : null,
    contact_person: payload.contact_person ? String(payload.contact_person).trim() : null,
    category: String(payload.category || 'parts'),
    notes: payload.notes ? String(payload.notes).trim() : null,
    shop_company_name: actor?.company_name || DEFAULT_SHOP_NAME,
  } as never).select('*').single();
  if (error) throw error;
  return { supplier: created as GarageSupplier };
}

export async function listGarageInvoices(shopScope?: GarageShopScope | null) {
  let iQuery = supabase.from('garage_invoices' as never).select('*').order('created_at', { ascending: false });
  const shop = legacyShopFilter(shopScope);
  if (shop) iQuery = iQuery.ilike('shop_company_name', `%${shop}%`);
  const { data, error } = await iQuery;
  return { invoices: ((data || []) as GarageInvoice[]), error: error?.message };
}

export async function createGarageInvoice(
  payload: Record<string, unknown>,
  actor: Pick<GarageActor, 'company_name'> | null | undefined,
): Promise<GarageInvoice> {
  const invNum = String(payload.invoice_number || '').trim();
  const suppName = String(payload.supplier_name || '').trim();
  if (!invNum || !suppName) throw new Error('מספר חשבונית ושם ספק הינם שדות חובה');
  const total = Number(payload.total_amount) || 0;
  const subtotal = Number(payload.subtotal) || Math.round(total / 1.18);
  const vat = Number(payload.vat_amount) || Math.round(total - subtotal);
  const { data: created, error } = await supabase.from('garage_invoices' as never).insert({
    invoice_type: String(payload.invoice_type || 'parts_invoice'),
    invoice_number: invNum,
    supplier_id: payload.supplier_id ? String(payload.supplier_id) : null,
    supplier_name: suppName,
    case_id: payload.case_id ? String(payload.case_id) : null,
    case_number: payload.case_number ? String(payload.case_number) : null,
    vehicle_plate: payload.vehicle_plate ? String(payload.vehicle_plate) : (/^\d{7,8}$/.test(String(payload.case_number || '')) ? String(payload.case_number) : null),
    expense_category: String(payload.expense_category || 'parts'),
    invoice_date: String(payload.invoice_date || new Date().toISOString().slice(0, 10)),
    subtotal,
    vat_amount: vat,
    total_amount: total,
    parts_received_confirmed: Boolean(payload.parts_received_confirmed),
    returned_parts_exist: Boolean(payload.returned_parts_exist),
    returned_parts_notes: String(payload.returned_parts_notes || ''),
    credit_status: String(payload.credit_status || 'none'),
    accounting_notes: String(payload.accounting_notes || ''),
    payment_status: String(payload.payment_status || 'pending_accounting'),
    line_items: Array.isArray(payload.line_items) ? payload.line_items : [],
    shop_company_name: actor?.company_name || DEFAULT_SHOP_NAME,
  } as never).select('*').single();
  if (error) throw error;
  return created as GarageInvoice;
}

export async function closeGarageCase(
  caseId: string,
  actor: Pick<GarageActor, 'full_name'> | null | undefined,
  closeNote?: string,
): Promise<void> {
  if (!caseId) throw new Error('אין מזהה תיק לסגירה');
  const { data: cRow, error: cErr } = await supabase.from('garage_cases' as never).select('*').eq('id', caseId).single();
  if (cErr || !cRow) throw new Error('תיק לא נמצא');
  const cd = ((cRow as { case_data?: Record<string, unknown> }).case_data || {}) as Record<string, unknown>;
  cd.caseClosed = true;
  cd.caseClosedAt = new Date().toISOString();
  cd.caseClosedBy = actor?.full_name || 'מנהל מוסך';
  cd.closeNote = String(closeNote || 'סגירת תיק עבודה מורשית');
  const { error: updErr } = await supabase.from('garage_cases' as never).update({
    status: 'סגור',
    case_data: cd,
  } as never).eq('id', caseId);
  if (updErr) throw updErr;
}
