import { supabase } from '@/integrations/supabase/client';

export const VEHICLE_TYPES_CONFIG_KEY = 'vehicle_types';

export interface VehicleTypeOption {
  id: string;
  label: string;
}

export const DEFAULT_VEHICLE_TYPES: VehicleTypeOption[] = [
  { id: 'private', label: 'רכב פרטי' },
  { id: 'commercial', label: 'רכב מסחרי' },
  { id: 'taxi', label: 'מונית' },
  { id: 'van_10', label: 'רכב 10 מקומות' },
  { id: 'van_14', label: 'רכב 14 מקומות' },
  { id: 'minibus', label: 'מיניבוס' },
  { id: 'bus', label: 'אוטובוס' },
  { id: 'trailer', label: 'נגרר' },
  { id: 'tractor', label: 'טרקטור' },
  { id: 'engineering', label: 'ציוד הנדסי' },
  { id: 'micro', label: 'רכב זעיר' },
  { id: 'other', label: 'אחר' },
];

export const VEHICLE_TYPE_OTHER_ID = 'other';

function normalizeTypes(raw: unknown): VehicleTypeOption[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_VEHICLE_TYPES;
  const out: VehicleTypeOption[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      const label = item.trim();
      out.push({ id: label.toLowerCase().replace(/\s+/g, '_'), label });
      continue;
    }
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const label = String(rec.label ?? rec.value ?? '').trim();
      const id = String(rec.id ?? label).trim();
      if (label) out.push({ id: id || label, label });
    }
  }
  return out.length > 0 ? out : DEFAULT_VEHICLE_TYPES;
}

export async function fetchVehicleTypes(): Promise<VehicleTypeOption[]> {
  const { data, error } = await supabase
    .from('dalia_form_config')
    .select('config_value')
    .eq('config_key', VEHICLE_TYPES_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    console.warn('[vehicleTypesConfig] fetch failed', error.message);
    return DEFAULT_VEHICLE_TYPES;
  }

  const value = (data as { config_value?: unknown } | null)?.config_value;
  if (value && typeof value === 'object' && 'types' in (value as object)) {
    return normalizeTypes((value as { types: unknown }).types);
  }
  return normalizeTypes(value);
}

export async function saveVehicleTypes(
  types: VehicleTypeOption[],
  userId?: string,
): Promise<void> {
  const payload = {
    config_key: VEHICLE_TYPES_CONFIG_KEY,
    config_value: { types },
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  };

  const { error } = await supabase.from('dalia_form_config').upsert(payload, {
    onConflict: 'config_key',
  });

  if (error) throw new Error(error.message || 'שגיאה בשמירת סוגי רכב');
}

export function resolveVehicleTypeLabel(
  types: VehicleTypeOption[],
  stored: string | null | undefined,
): string {
  const raw = (stored || '').trim();
  if (!raw) return '';
  const byId = types.find((t) => t.id === raw);
  if (byId) return byId.label;
  const byLabel = types.find((t) => t.label === raw);
  return byLabel?.label ?? raw;
}
