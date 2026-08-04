import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_INSPECTION_CHECKLIST, DEFAULT_TREATMENT_ITEMS } from '@/lib/vehicleListDefaults';

export type CompanyListSettings = {
  treatmentItems: string[];
  inspectionChecklist: string[];
  hasCustomTreatment: boolean;
  hasCustomInspection: boolean;
};

function parseStringArray(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...fallback];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

export async function loadCompanyListSettings(companyName: string): Promise<CompanyListSettings> {
  const { data } = await supabase
    .from('company_settings')
    .select('custom_treatment_items, custom_inspection_checklist')
    .eq('company_name', companyName)
    .maybeSingle();

  const customTreatment = data?.custom_treatment_items;
  const customInspection = data?.custom_inspection_checklist;

  return {
    treatmentItems: parseStringArray(customTreatment, DEFAULT_TREATMENT_ITEMS),
    inspectionChecklist: parseStringArray(customInspection, DEFAULT_INSPECTION_CHECKLIST),
    hasCustomTreatment: Array.isArray(customTreatment) && customTreatment.length > 0,
    hasCustomInspection: Array.isArray(customInspection) && customInspection.length > 0,
  };
}

async function ensureCompanySettingsRow(companyName: string): Promise<void> {
  const { data } = await supabase
    .from('company_settings')
    .select('id')
    .eq('company_name', companyName)
    .maybeSingle();
  if (!data) {
    await supabase.from('company_settings').insert({ company_name: companyName });
  }
}

export async function saveCompanyTreatmentItems(companyName: string, items: string[]): Promise<void> {
  await ensureCompanySettingsRow(companyName);
  const { error } = await supabase
    .from('company_settings')
    .update({ custom_treatment_items: items, updated_at: new Date().toISOString() })
    .eq('company_name', companyName);
  if (error) throw new Error(error.message);
}

export async function saveCompanyInspectionChecklist(companyName: string, items: string[]): Promise<void> {
  await ensureCompanySettingsRow(companyName);
  const { error } = await supabase
    .from('company_settings')
    .update({ custom_inspection_checklist: items, updated_at: new Date().toISOString() })
    .eq('company_name', companyName);
  if (error) throw new Error(error.message);
}

export async function resetCompanyTreatmentItems(companyName: string): Promise<void> {
  await ensureCompanySettingsRow(companyName);
  const { error } = await supabase
    .from('company_settings')
    .update({ custom_treatment_items: null, updated_at: new Date().toISOString() })
    .eq('company_name', companyName);
  if (error) throw new Error(error.message);
}

export async function resetCompanyInspectionChecklist(companyName: string): Promise<void> {
  await ensureCompanySettingsRow(companyName);
  const { error } = await supabase
    .from('company_settings')
    .update({ custom_inspection_checklist: null, updated_at: new Date().toISOString() })
    .eq('company_name', companyName);
  if (error) throw new Error(error.message);
}
