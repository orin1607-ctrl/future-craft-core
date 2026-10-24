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
  searchCustomers,
  updateCase,
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

export type { GarageCase, GarageCaseData, GarageCustomer, GarageVehicle, GarageInvoice, GarageSupplier };

export type VoiceCustomerDraft = {
  customer_type: 'private' | 'business';
  name: string;
  company_name: string;
  phone: string;
};

export interface GarageVoiceActions {
  actorName: string;
  searchCustomers(query: string): Promise<GarageCustomer[]>;
  getCustomer(customerId: string): Promise<GarageCustomer | null>;
  listVehicles(customerId: string): Promise<GarageVehicle[]>;
  findVehicleByPlate(plate: string): Promise<GarageVehicle | null>;
  listCustomerCases(customerId: string): Promise<GarageCase[]>;
  listCases(): Promise<GarageCase[]>;
  getCase(caseId: string): Promise<GarageCase | null>;
  /** Returns the existing customer (and `duplicates`) instead of creating a second one. */
  createCustomer(draft: VoiceCustomerDraft): Promise<{ customer: GarageCustomer; duplicates: GarageCustomer[] }>;
  createVehicle(draft: { customer_id: string; plate: string; make: string; model: string }): Promise<GarageVehicle>;
  createCase(input: { customer: GarageCustomer; vehicle: GarageVehicle; caseData: GarageCaseData }): Promise<GarageCase>;
  /** Merges into the stored case_data (garageBook.updateCase keeps fields it does not receive). */
  saveCaseData(caseId: string, caseData: GarageCaseData): Promise<GarageCase>;
  closeCase(caseId: string, note: string): Promise<void>;
  listSuppliers(): Promise<GarageSupplier[]>;
  createSupplier(name: string): Promise<{ supplier: GarageSupplier; alreadyExisted?: boolean }>;
  listInvoices(): Promise<GarageInvoice[]>;
  createInvoice(payload: Record<string, unknown>): Promise<GarageInvoice>;
}

export function createGarageVoiceActions(actor: GarageActor, shopScope: GarageShopScope): GarageVoiceActions {
  const shopName = actor.company_name || '';
  return {
    actorName: actor.full_name || 'דליה AI',
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
    getCase: (caseId) => getCase(caseId, shopScope),
    createCustomer: (draft) => createCustomer({
      customer_type: draft.customer_type,
      name: draft.name,
      company_name: draft.company_name,
      phone: draft.phone,
      second_phone: '',
      email: '',
      address: '',
      business_id: '',
      contact_person: '',
      preferred_channel: '',
      notes: '',
      shop_company_name: shopName,
    }),
    createVehicle: (draft) => createVehicle({
      customer_id: draft.customer_id,
      plate: draft.plate,
      make: draft.make,
      model: draft.model,
      year: null,
      color: '',
      vin: '',
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
    createSupplier: (name) => createGarageSupplier({ name }, actor, shopScope),
    async listInvoices() {
      const { invoices, error } = await listGarageInvoices(shopScope);
      if (error) throw new Error(error);
      return invoices;
    },
    createInvoice: (payload) => createGarageInvoice(payload, actor),
  };
}
