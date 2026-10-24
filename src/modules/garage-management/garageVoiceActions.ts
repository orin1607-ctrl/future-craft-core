// The garage operations Dalia's voice workflows may perform, bound to the signed-in user and shop.
// Every write goes through the same functions the garage screen uses (garageBook / garageLedger),
// so voice never gets its own copy of the business rules.
import { supabase } from '@/integrations/supabase/client';
import {
  createCase,
  createCustomer,
  createVehicle,
  emptyCaseData,
  getCase,
  hydrateCustomer,
  listCases,
  listCustomerCases,
  listVehicles,
  normalizePlate,
  sanitizeCaseData,
  searchCustomers,
  updateCase,
  updateCustomerBook,
  GARAGE_BOOK_PENDING_MESSAGE,
  isGarageSchemaMissing,
  type GarageActor,
  type GarageCase,
  type GarageCaseData,
  type GarageCustomer,
  type GarageShopScope,
  type GarageVehicle,
} from './garageBook';
import { filterGarageByShop } from './garageTenant';
import {
  closeGarageCase,
  createGarageInvoice,
  createGarageSupplier,
  listGarageInvoices,
  listGarageSuppliers,
  type GarageInvoice,
  type GarageSupplier,
} from './garageLedger';
import { uploadGarageMedia, type GarageMediaCategoryId } from './garageMedia';
import { createQuoteDraftStore, type QuoteDraft, type QuoteDraftInput } from './garageQuoteDrafts';

export type { GarageCase, GarageCaseData, GarageCustomer, GarageVehicle, GarageInvoice, GarageSupplier, QuoteDraft, QuoteDraftInput };

export type VoiceCustomerDraft = {
  customer_type: 'private' | 'business';
  name: string;
  company_name: string;
  phone: string;
  business_id?: string;
};

/** Structured case search terms (parsed from speech by the voice engine). */
export type CaseSearchTerms = {
  plate?: string | null;
  /** digits of a case number, e.g. "129" for GM-2026-0129 */
  numberDigits?: string | null;
  nameWords?: string[];
  phone?: string | null;
};

export interface GarageVoiceActions {
  actorName: string;
  /** Auth role of the signed-in user — never taken from speech. */
  actorRole?: string;
  searchCustomers(query: string): Promise<GarageCustomer[]>;
  getCustomer(customerId: string): Promise<GarageCustomer | null>;
  listVehicles(customerId: string): Promise<GarageVehicle[]>;
  findVehicleByPlate(plate: string): Promise<GarageVehicle | null>;
  listCustomerCases(customerId: string): Promise<GarageCase[]>;
  listCases(): Promise<GarageCase[]>;
  /**
   * Searches ALL cases the user may see (not only the latest 100 the list screen loads).
   * Throws on a database error, so "not found" and "search failed" are never confused.
   */
  searchCases(terms: CaseSearchTerms): Promise<GarageCase[]>;
  /** Every visible case, paged — for reports. Throws on error. */
  listAllCases(): Promise<GarageCase[]>;
  /** Same upload + category the garage screen uses (e.g. 'angles' for intake photos). */
  uploadCaseMedia(caseId: string, category: GarageMediaCategoryId, title: string, file: { name: string; type: string; bytes: ArrayBuffer }): Promise<void>;
  /** The customer fields the existing book allows to change: contact person and notes. */
  updateCustomerContact(customerId: string, patch: { contact_person?: string; appendNote?: string }): Promise<GarageCustomer>;
  getCase(caseId: string): Promise<GarageCase | null>;
  /** Returns the existing customer (and `duplicates`) instead of creating a second one. */
  /** `force` = the worker confirmed it is a different customer despite a similar one (as the screen does). */
  createCustomer(draft: VoiceCustomerDraft, opts?: { force?: boolean }): Promise<{ customer: GarageCustomer; duplicates: GarageCustomer[] }>;
  createVehicle(draft: { customer_id: string; plate: string; make: string; model: string; year?: number | null; color?: string; vin?: string }): Promise<GarageVehicle>;
  createCase(input: { customer: GarageCustomer; vehicle: GarageVehicle; caseData: GarageCaseData }): Promise<GarageCase>;
  /** Merges into the stored case_data (garageBook.updateCase keeps fields it does not receive). */
  saveCaseData(caseId: string, caseData: GarageCaseData): Promise<GarageCase>;
  closeCase(caseId: string, note: string): Promise<void>;
  listSuppliers(): Promise<GarageSupplier[]>;
  createSupplier(name: string, extra?: { phone?: string; category?: string }): Promise<{ supplier: GarageSupplier; alreadyExisted?: boolean }>;
  listInvoices(): Promise<GarageInvoice[]>;
  createInvoice(payload: Record<string, unknown>): Promise<GarageInvoice>;
  /** Quotes not tied to a work case (waiting for the customer's approval) — see garageQuoteDrafts. */
  saveQuoteDraft?(input: QuoteDraftInput, existingId?: string): Promise<QuoteDraft>;
  listQuoteDrafts?(): Promise<QuoteDraft[]>;
  updateQuoteDraft?(id: string, patch: Partial<QuoteDraftInput>): Promise<QuoteDraft>;
}

export function createGarageVoiceActions(actor: GarageActor, shopScope: GarageShopScope): GarageVoiceActions {
  const shopName = actor.company_name || '';
  const drafts = createQuoteDraftStore(actor);
  return {
    actorName: actor.full_name || 'דליה AI',
    actorRole: actor.role,
    searchCustomers: (query) => searchCustomers(query, shopScope),
    async getCustomer(customerId) {
      const { data, error } = await supabase.from('garage_customers' as never).select('*').eq('id', customerId).maybeSingle();
      if (error) throw new Error(error.message || 'טעינת לקוח נכשלה');
      if (!data) return null;
      return filterGarageByShop([hydrateCustomer(data as GarageCustomer)], shopScope)[0] || null;
    },
    listVehicles: (customerId) => listVehicles(customerId, shopScope),
    async findVehicleByPlate(plate) {
      // garageBook.findVehicleByPlate needs a shop name; super admins have none, so match here the same way.
      const needle = normalizePlate(plate);
      if (!needle) return null;
      const { data, error } = await supabase.from('garage_vehicles' as never).select('*').limit(500);
      if (error) throw new Error(error.message || 'חיפוש רכב נכשל');
      const rows = filterGarageByShop((data || []) as GarageVehicle[], shopScope);
      return rows.find((v) => normalizePlate(v.plate) === needle) || null;
    },
    listCustomerCases: (customerId) => listCustomerCases(customerId, shopScope),
    listCases: () => listCases(shopScope),
    async searchCases(terms) {
      const clean = (v: string) => v.replace(/[%,()*]/g, ' ').trim();
      const ors: string[] = [];
      const plate = normalizePlate(terms.plate || '');
      if (plate) {
        // plates are stored as typed — with or without dashes
        const variants = new Set([plate]);
        if (plate.length === 7) variants.add(`${plate.slice(0, 2)}-${plate.slice(2, 5)}-${plate.slice(5)}`);
        if (plate.length === 8) variants.add(`${plate.slice(0, 3)}-${plate.slice(3, 5)}-${plate.slice(5)}`);
        variants.forEach((v) => ors.push(`vehicle_plate_snapshot.ilike.%${v}%`));
      }
      const digits = (terms.numberDigits || '').replace(/\D/g, '');
      if (digits.length >= 2) ors.push(`case_number.ilike.%${digits}%`);
      const words = (terms.nameWords || []).map(clean).filter((w) => w.length >= 2);
      if (words.length) {
        const longest = [...words].sort((a, b) => b.length - a.length)[0];
        ors.push(`customer_name_snapshot.ilike.%${longest}%`);
      }
      if (terms.phone) {
        const owners = await searchCustomers(terms.phone.replace(/\D/g, ''), shopScope);
        if (owners.length) ors.push(`customer_id.in.(${owners.map((c) => c.id).join(',')})`);
      }
      if (!ors.length) return [];
      const { data, error } = await supabase.from('garage_cases' as never).select('*').or(ors.join(',')).order('created_at', { ascending: false }).limit(300);
      if (error) throw new Error(isGarageSchemaMissing(error) ? GARAGE_BOOK_PENDING_MESSAGE : (error.message || 'חיפוש תיקים נכשל'));
      const rows = filterGarageByShop(((data || []) as GarageCase[]).map((row) => ({ ...row, case_data: sanitizeCaseData(row.case_data) })), shopScope);
      // every spoken name word must appear (the query used only the longest one)
      return words.length > 1 && !plate && digits.length < 2 && !terms.phone
        ? rows.filter((r) => words.every((w) => (r.customer_name_snapshot || '').includes(w)))
        : rows;
    },
    async listAllCases() {
      const all: GarageCase[] = [];
      const page = 1000;
      for (let from = 0; from < 10000; from += page) {
        const { data, error } = await supabase.from('garage_cases' as never).select('*').order('created_at', { ascending: false }).range(from, from + page - 1);
        if (error) throw new Error(isGarageSchemaMissing(error) ? GARAGE_BOOK_PENDING_MESSAGE : (error.message || 'טעינת תיקים נכשלה'));
        const rows = (data || []) as GarageCase[];
        all.push(...rows);
        if (rows.length < page) break;
      }
      return filterGarageByShop(all.map((row) => ({ ...row, case_data: sanitizeCaseData(row.case_data) })), shopScope);
    },
    async uploadCaseMedia(caseId, category, title, file) {
      await uploadGarageMedia({
        garageCaseId: caseId,
        category,
        title,
        fileName: file.name,
        mimeType: file.type,
        bytes: file.bytes,
        actorId: actor.id,
      });
    },
    async updateCustomerContact(customerId, patch) {
      const { data } = await supabase.from('garage_customers' as never).select('notes').eq('id', customerId).maybeSingle();
      const prevNotes = String((data as { notes?: string } | null)?.notes || '');
      return updateCustomerBook(customerId, {
        contact_person: patch.contact_person,
        notes: patch.appendNote ? [prevNotes, patch.appendNote].filter(Boolean).join('\n') : undefined,
      });
    },
    getCase: (caseId) => getCase(caseId, shopScope),
    createCustomer: (draft, opts) => createCustomer({
      customer_type: draft.customer_type,
      name: draft.name,
      company_name: draft.company_name,
      phone: draft.phone,
      second_phone: '',
      email: '',
      address: '',
      business_id: draft.business_id || '',
      contact_person: '',
      preferred_channel: '',
      notes: '',
      shop_company_name: shopName,
    }, opts),
    createVehicle: (draft) => createVehicle({
      customer_id: draft.customer_id,
      plate: draft.plate,
      make: draft.make,
      model: draft.model,
      year: draft.year || null,
      color: draft.color || '',
      vin: draft.vin || '',
      vehicle_type: '',
      internal_number: '',
      notes: '',
      shop_company_name: shopName,
    }),
    createCase: ({ customer, vehicle, caseData }) => createCase({
      customer,
      vehicle,
      actor,
      shopCompanyName: actor.company_name,
      caseData: { ...emptyCaseData(), ...caseData },
    }),
    saveCaseData: (caseId, caseData) => updateCase(caseId, { case_data: caseData }),
    closeCase: (caseId, note) => closeGarageCase(caseId, actor, note),
    async listSuppliers() {
      const { suppliers, error } = await listGarageSuppliers(shopScope);
      if (error) throw new Error(error);
      return suppliers;
    },
    createSupplier: (name, extra) => createGarageSupplier({ name, phone: extra?.phone, category: extra?.category }, actor, shopScope),
    async listInvoices() {
      const { invoices, error } = await listGarageInvoices(shopScope);
      if (error) throw new Error(error);
      return invoices;
    },
    createInvoice: (payload) => createGarageInvoice(payload, actor),
    saveQuoteDraft: (input, existingId) => drafts.save(input, existingId),
    listQuoteDrafts: () => drafts.list(),
    updateQuoteDraft: (id, patch) => drafts.update(id, patch),
  };
}
