// Price quotes that are NOT tied to a work case: a quote for a customer who is not in the system yet
// (or a new quote for an existing customer) waits for the customer's approval without opening a case.
//
// Storage: the shop-scoped `garage_quote_drafts` table (docs/proposed-migrations/20261025120000_garage_quote_drafts_staging.sql — prepared for review, not applied).
// Until that table exists, drafts are kept on this device only — and every result says where it was kept,
// so nothing pretends to be saved in the system when it is not.
import { supabase } from '@/integrations/supabase/client';
import type { GarageActor } from './garageBook';

export type QuoteDraftLine = { name: string; qty: number; price: number | null };
/** pending_approval → approved → converted (customer / case created from it), or cancelled. */
export type QuoteDraftStatus = 'pending_approval' | 'approved' | 'converted' | 'cancelled';

export interface QuoteDraft {
  id: string;
  status: QuoteDraftStatus;
  customer_name: string;
  customer_phone: string;
  /** Set when the quote is for an existing customer, or after the customer was opened from it. */
  customer_id: string | null;
  vehicle_id: string | null;
  vehicle_plate: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number | null;
  works: QuoteDraftLine[];
  parts: QuoteDraftLine[];
  extras_note: string;
  /** Before VAT, priced lines only. */
  total_net: number;
  /** The work case opened from this quote (only after the customer approved). */
  case_id: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  /** Where it is kept: the shop's database, or this device until the table exists. */
  storage: 'system' | 'device';
}

export type QuoteDraftInput = Omit<QuoteDraft, 'id' | 'created_at' | 'updated_at' | 'storage' | 'created_by_name'>;

export interface QuoteDraftStore {
  save(input: QuoteDraftInput, existingId?: string): Promise<QuoteDraft>;
  list(): Promise<QuoteDraft[]>;
  update(id: string, patch: Partial<QuoteDraftInput>): Promise<QuoteDraft>;
}

const TABLE = 'garage_quote_drafts';

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /garage_quote_drafts/.test(error.message || '') && /does not exist|schema cache|could not find/i.test(error.message || '');
}

type Row = {
  id: string;
  status: QuoteDraftStatus;
  customer_name: string;
  customer_phone: string;
  customer_id: string | null;
  vehicle_id: string | null;
  vehicle_plate: string;
  case_id: string | null;
  draft: Partial<QuoteDraft> | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

function fromRow(r: Row): QuoteDraft {
  const d = r.draft || {};
  return {
    id: r.id,
    status: r.status,
    customer_name: r.customer_name || '',
    customer_phone: r.customer_phone || '',
    customer_id: r.customer_id,
    vehicle_id: r.vehicle_id,
    vehicle_plate: r.vehicle_plate || '',
    vehicle_make: d.vehicle_make || '',
    vehicle_model: d.vehicle_model || '',
    vehicle_year: d.vehicle_year ?? null,
    works: d.works || [],
    parts: d.parts || [],
    extras_note: d.extras_note || '',
    total_net: d.total_net || 0,
    case_id: r.case_id,
    created_by_name: r.created_by_name || '',
    created_at: r.created_at,
    updated_at: r.updated_at,
    storage: 'system',
  };
}

function toRow(input: Partial<QuoteDraftInput>) {
  const row: Record<string, unknown> = {};
  for (const k of ['status', 'customer_name', 'customer_phone', 'customer_id', 'vehicle_id', 'vehicle_plate', 'case_id'] as const) {
    if (input[k] !== undefined) row[k] = input[k];
  }
  const draftKeys = ['vehicle_make', 'vehicle_model', 'vehicle_year', 'works', 'parts', 'extras_note', 'total_net'] as const;
  if (draftKeys.some((k) => input[k] !== undefined)) {
    row.draft = Object.fromEntries(draftKeys.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
  }
  return row;
}

/** Device copy (used only while the table is not available). */
function deviceStore(shopName: string) {
  const key = `dalia_quote_drafts_v1:${shopName || 'shop'}`;
  const read = (): QuoteDraft[] => {
    try {
      return JSON.parse(window.localStorage?.getItem(key) || '[]') as QuoteDraft[];
    } catch {
      return [];
    }
  };
  const write = (rows: QuoteDraft[]) => {
    try {
      window.localStorage?.setItem(key, JSON.stringify(rows.slice(-200)));
    } catch {}
  };
  return { read, write };
}

export function createQuoteDraftStore(actor: GarageActor): QuoteDraftStore {
  const shopName = actor.company_name || '';
  const device = deviceStore(shopName);
  const now = () => new Date().toISOString();

  const saveOnDevice = (input: Partial<QuoteDraftInput>, id?: string): QuoteDraft => {
    const rows = device.read();
    const at = now();
    const idx = id ? rows.findIndex((r) => r.id === id) : -1;
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...input, updated_at: at };
      device.write(rows);
      return rows[idx];
    }
    const created: QuoteDraft = {
      id: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      status: 'pending_approval',
      customer_name: '',
      customer_phone: '',
      customer_id: null,
      vehicle_id: null,
      vehicle_plate: '',
      vehicle_make: '',
      vehicle_model: '',
      vehicle_year: null,
      works: [],
      parts: [],
      extras_note: '',
      total_net: 0,
      case_id: null,
      ...input,
      created_by_name: actor.full_name || '',
      created_at: at,
      updated_at: at,
      storage: 'device',
    };
    rows.push(created);
    device.write(rows);
    return created;
  };

  return {
    async save(input, existingId) {
      if (existingId?.startsWith('local-')) return saveOnDevice(input, existingId);
      if (existingId) return this.update(existingId, input);
      const { data, error } = await supabase
        .from(TABLE as never)
        .insert({ ...toRow(input), shop_company_name: shopName, created_by: actor.id, created_by_name: actor.full_name || '' } as never)
        .select('*')
        .single();
      if (tableMissing(error)) return saveOnDevice(input);
      if (error) throw new Error(error.message || 'שמירת הצעת המחיר נכשלה');
      return fromRow(data as unknown as Row);
    },
    async list() {
      const local = device.read();
      const { data, error } = await supabase.from(TABLE as never).select('*').order('created_at', { ascending: false }).limit(300);
      if (tableMissing(error)) return local.slice().reverse();
      if (error) throw new Error(error.message || 'טעינת הצעות המחיר נכשלה');
      // RLS already limits rows to the user's shop
      return [...((data || []) as unknown as Row[]).map(fromRow), ...local.slice().reverse()];
    },
    async update(id, patch) {
      if (id.startsWith('local-')) return saveOnDevice(patch, id);
      const { data, error } = await supabase
        .from(TABLE as never)
        .update({ ...toRow(patch), updated_at: now() } as never)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new Error(error.message || 'עדכון הצעת המחיר נכשל');
      return fromRow(data as unknown as Row);
    },
  };
}
