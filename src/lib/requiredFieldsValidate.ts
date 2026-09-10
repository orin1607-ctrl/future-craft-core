import {
  getFieldDef,
  isFieldRequiredInMap,
  mergeRequiredFields,
  type RequiredFieldModule,
  type RequiredFieldsOverrides,
} from '@/lib/requiredFieldsSchema';

/** Hidden from the vehicle form; never block save even if an old override marks them required. */
export const HIDDEN_VEHICLE_FORM_FIELDS = new Set(['test_file_name']);

export function validateRequiredModuleFields(
  module: RequiredFieldModule,
  values: Record<string, string>,
  overrides: RequiredFieldsOverrides = {},
): { ok: true } | { ok: false; message: string; fieldKey?: string } {
  const map = mergeRequiredFields(overrides);

  for (const [id, required] of Object.entries(map)) {
    if (!required) continue;
    const [mod, ...rest] = id.split('.');
    if (mod !== module) continue;
    const fieldKey = rest.join('.');
    if (module === 'vehicles' && HIDDEN_VEHICLE_FORM_FIELDS.has(fieldKey)) continue;
    const raw = values[fieldKey];
    const empty = raw == null || String(raw).trim() === '';
    if (empty) {
      const label = getFieldDef(module, fieldKey)?.label ?? fieldKey;
      return { ok: false, message: `שדה חובה: ${label}`, fieldKey };
    }
  }

  return { ok: true };
}

export function isFieldRequired(
  module: RequiredFieldModule,
  fieldKey: string,
  overrides: RequiredFieldsOverrides = {},
): boolean {
  return isFieldRequiredInMap(module, fieldKey, mergeRequiredFields(overrides));
}
