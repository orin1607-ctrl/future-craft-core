import { supabase } from '@/integrations/supabase/client';
import {
  REQUIRED_FIELDS_CONFIG_KEY,
  type RequiredFieldsOverrides,
} from '@/lib/requiredFieldsSchema';
import {
  parseRequiredFieldsStore,
  patchCompanyField,
  resolveCompanyOverrides,
  serializeRequiredFieldsStore,
  type RequiredFieldsStore,
} from '@/lib/requiredFieldsCompany';

type ConfigRow = {
  config_key: string;
  config_value: unknown;
};

export async function fetchRequiredFieldsStore(): Promise<RequiredFieldsStore> {
  const { data, error } = await supabase
    .from('dalia_form_config')
    .select('config_value')
    .eq('config_key', REQUIRED_FIELDS_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    console.warn('[requiredFieldsApi] fetch failed', error.message);
    return parseRequiredFieldsStore(null);
  }

  return parseRequiredFieldsStore((data as ConfigRow | null)?.config_value);
}

/**
 * Overrides for one company (or legacy fallback when company has no dedicated map).
 * Pass companyName whenever the consumer knows the business context.
 */
export async function fetchRequiredFieldsOverrides(
  companyName?: string | null,
): Promise<RequiredFieldsOverrides> {
  const store = await fetchRequiredFieldsStore();
  return resolveCompanyOverrides(store, companyName);
}

export async function saveRequiredFieldsStore(
  store: RequiredFieldsStore,
  userId?: string,
): Promise<void> {
  const payload = {
    config_key: REQUIRED_FIELDS_CONFIG_KEY,
    config_value: serializeRequiredFieldsStore(store),
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  };

  const { error } = await supabase.from('dalia_form_config').upsert(payload, {
    onConflict: 'config_key',
  });

  if (error) throw new Error(error.message || 'שגיאה בשמירת הגדרות שדות חובה');
}

/** @deprecated Prefer saveRequiredFieldsStore / patchRequiredField with companyName */
export async function saveRequiredFieldsOverrides(
  overrides: RequiredFieldsOverrides,
  userId?: string,
): Promise<void> {
  const store = await fetchRequiredFieldsStore();
  await saveRequiredFieldsStore({ ...store, legacy: overrides }, userId);
}

export async function patchRequiredField(
  companyName: string,
  moduleKey: string,
  fieldKey: string,
  required: boolean,
  userId?: string,
): Promise<RequiredFieldsStore> {
  const store = await fetchRequiredFieldsStore();
  const next = patchCompanyField(store, companyName, moduleKey, fieldKey, required);
  await saveRequiredFieldsStore(next, userId);
  return next;
}
