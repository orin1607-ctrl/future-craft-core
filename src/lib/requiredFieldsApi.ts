import { supabase } from '@/integrations/supabase/client';
import {
  REQUIRED_FIELDS_CONFIG_KEY,
  type RequiredFieldsOverrides,
} from '@/lib/requiredFieldsSchema';

type ConfigRow = {
  config_key: string;
  config_value: RequiredFieldsOverrides;
};

function normalizeOverrides(raw: unknown): RequiredFieldsOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const out: RequiredFieldsOverrides = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === 'boolean') out[key] = val;
  }
  return out;
}

export async function fetchRequiredFieldsOverrides(): Promise<RequiredFieldsOverrides> {
  const { data, error } = await supabase
    .from('dalia_form_config')
    .select('config_value')
    .eq('config_key', REQUIRED_FIELDS_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    console.warn('[requiredFieldsApi] fetch failed', error.message);
    return {};
  }

  return normalizeOverrides((data as ConfigRow | null)?.config_value);
}

export async function saveRequiredFieldsOverrides(
  overrides: RequiredFieldsOverrides,
  userId?: string,
): Promise<void> {
  const payload = {
    config_key: REQUIRED_FIELDS_CONFIG_KEY,
    config_value: overrides,
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  };

  const { error } = await supabase.from('dalia_form_config').upsert(payload, {
    onConflict: 'config_key',
  });

  if (error) throw new Error(error.message || 'שגיאה בשמירת הגדרות שדות חובה');
}

export async function patchRequiredField(
  moduleKey: string,
  fieldKey: string,
  required: boolean,
  currentOverrides: RequiredFieldsOverrides,
  userId?: string,
): Promise<RequiredFieldsOverrides> {
  const next = { ...currentOverrides, [`${moduleKey}.${fieldKey}`]: required };
  await saveRequiredFieldsOverrides(next, userId);
  return next;
}
