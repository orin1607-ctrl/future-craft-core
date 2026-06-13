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

const cache = new Map<string, { at: number; data: CompanySettingsRow | null }>();
const CACHE_MS = 60_000;

export async function fetchCompanySettings(companyName: string): Promise<CompanySettingsRow | null> {
  if (!companyName) return null;
  const hit = cache.get(companyName);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const { data, error } = await supabase
    .from('company_settings')
    .select(
      'id, company_name, alert_days_before, reminder_30_days, reminder_7_days, reminder_1_day, require_driver_assignment, max_vehicles_without_assignment, vehicle_approval_required, require_insurance_docs, require_no_claims, hidden_buttons, module_transport_enabled, transport_hidden_features, whatsapp_enabled, whatsapp_phone, whatsapp_button_color, whatsapp_button_text',
    )
    .eq('company_name', companyName)
    .maybeSingle();

  if (error) {
    console.error('fetchCompanySettings', error);
    return null;
  }

  cache.set(companyName, { at: Date.now(), data: data as CompanySettingsRow | null });
  return data as CompanySettingsRow | null;
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
  if (companyName) cache.delete(companyName);
  else cache.clear();
}
