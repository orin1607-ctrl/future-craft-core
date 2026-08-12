import { supabase } from '@/integrations/supabase/client';

export type CompanySettingsRow = {
  id: string;
  company_name: string;
  alert_days_before: number | null;
  reminder_30_days: boolean | null;
  reminder_7_days: boolean | null;
  reminder_1_day: boolean | null;
  require_driver_assignment: boolean;
  max_vehicles_without_assignment: number;
  vehicle_approval_required: boolean | null;
  require_insurance_docs: boolean;
  require_no_claims: boolean;
  hidden_buttons: string[];
  module_transport_enabled: boolean;
  transport_hidden_features: string[];
  whatsapp_enabled: boolean | null;
  whatsapp_phone: string | null;
  whatsapp_button_color: string | null;
  whatsapp_button_text: string | null;
};

const SELECT_COLS =
  'id, company_name, alert_days_before, reminder_30_days, reminder_7_days, reminder_1_day, require_driver_assignment, max_vehicles_without_assignment, vehicle_approval_required, require_insurance_docs, require_no_claims, hidden_buttons, module_transport_enabled, transport_hidden_features, whatsapp_enabled, whatsapp_phone, whatsapp_button_color, whatsapp_button_text';

const cache = new Map<string, { at: number; data: CompanySettingsRow | null }>();
/** In-flight dedupe — prevents stampede when many callers request the same company. */
const inFlight = new Map<string, Promise<CompanySettingsRow | null>>();
const CACHE_MS = 60_000;

function cacheGet(companyName: string): CompanySettingsRow | null | undefined {
  const hit = cache.get(companyName);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  return undefined;
}

function cacheSet(companyName: string, data: CompanySettingsRow | null) {
  cache.set(companyName, { at: Date.now(), data });
}

export async function fetchCompanySettings(companyName: string): Promise<CompanySettingsRow | null> {
  if (!companyName) return null;
  const cached = cacheGet(companyName);
  if (cached !== undefined) return cached;

  const pending = inFlight.get(companyName);
  if (pending) return pending;

  const promise = (async () => {
    const { data, error } = await supabase
      .from('company_settings')
      .select(SELECT_COLS)
      .eq('company_name', companyName)
      .maybeSingle();

    if (error) {
      console.error('fetchCompanySettings', error);
      return null;
    }

    const row = data as CompanySettingsRow | null;
    cacheSet(companyName, row);
    return row;
  })().finally(() => {
    inFlight.delete(companyName);
  });

  inFlight.set(companyName, promise);
  return promise;
}

/**
 * One (or few chunked) query for many companies — fills the shared cache.
 * Safe no-op when names are empty or already cached.
 */
export async function prefetchCompanySettings(companyNames: string[]): Promise<void> {
  const unique = [...new Set(companyNames.map((n) => (n || '').trim()).filter(Boolean))];
  const missing = unique.filter((n) => cacheGet(n) === undefined && !inFlight.has(n));
  if (!missing.length) return;

  const CHUNK = 80;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('company_settings')
      .select(SELECT_COLS)
      .in('company_name', chunk);

    if (error) {
      console.error('prefetchCompanySettings', error);
      await Promise.all(chunk.map((n) => fetchCompanySettings(n)));
      continue;
    }

    const found = new Set<string>();
    for (const row of data || []) {
      const name = (row as CompanySettingsRow).company_name;
      cacheSet(name, row as CompanySettingsRow);
      found.add(name);
    }
    for (const n of chunk) {
      if (!found.has(n)) cacheSet(n, null);
    }
  }
}

/** Reminder offsets (days before target) from company_settings toggles. */
export function buildReminderOffsets(config: {
  alert_days_before?: number | null;
  reminder_30_days?: boolean | null;
  reminder_7_days?: boolean | null;
  reminder_1_day?: boolean | null;
} | null): number[] {
  if (!config) return [30, 7, 1];
  const days: number[] = [];
  if (config.reminder_30_days !== false) days.push(config.alert_days_before ?? 30);
  if (config.reminder_7_days !== false) days.push(7);
  if (config.reminder_1_day !== false) days.push(1);
  return [...new Set(days.filter((d) => d > 0))].sort((a, b) => b - a);
}

export async function getCompanyReminderOffsets(companyName: string): Promise<number[]> {
  const settings = await fetchCompanySettings(companyName);
  return buildReminderOffsets(settings);
}

export function clearCompanySettingsCache(companyName?: string) {
  if (companyName) {
    cache.delete(companyName);
    inFlight.delete(companyName);
  } else {
    cache.clear();
    inFlight.clear();
  }
}

/** Test helper — current cache size (not for production UI). */
export function _companySettingsCacheSizeForTests(): number {
  return cache.size;
}
