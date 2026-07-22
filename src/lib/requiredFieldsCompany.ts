/**
 * Per-company required-fields resolution on top of the existing required_fields store.
 * Extends dalia_form_config.required_fields — no parallel system.
 */
import {
  fieldConfigId,
  isFieldRequiredInMap,
  mergeRequiredFields,
  type RequiredFieldModule,
  type RequiredFieldsOverrides,
} from '@/lib/requiredFieldsSchema';

export type RequiredFieldsStore = {
  version: 2;
  byCompany: Record<string, RequiredFieldsOverrides>;
  /** Pre–per-company flat overrides; fallback until a company is customized */
  legacy: RequiredFieldsOverrides;
};

export function emptyRequiredFieldsStore(): RequiredFieldsStore {
  return { version: 2, byCompany: {}, legacy: {} };
}

export function normalizeOverrides(raw: unknown): RequiredFieldsOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const out: RequiredFieldsOverrides = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === 'boolean') out[key] = val;
  }
  return out;
}

/** Parse DB JSON: supports legacy flat map and v2 { byCompany, legacy }. */
export function parseRequiredFieldsStore(raw: unknown): RequiredFieldsStore {
  if (!raw || typeof raw !== 'object') return emptyRequiredFieldsStore();
  const obj = raw as Record<string, unknown>;

  if (obj.byCompany && typeof obj.byCompany === 'object') {
    const byCompany: Record<string, RequiredFieldsOverrides> = {};
    for (const [name, overrides] of Object.entries(obj.byCompany as Record<string, unknown>)) {
      const key = name.trim();
      if (!key) continue;
      byCompany[key] = normalizeOverrides(overrides);
    }
    return {
      version: 2,
      byCompany,
      legacy: normalizeOverrides(obj.legacy),
    };
  }

  // Legacy flat: top-level boolean keys only (ignore non-boolean metadata if any)
  return {
    version: 2,
    byCompany: {},
    legacy: normalizeOverrides(obj),
  };
}

export function serializeRequiredFieldsStore(store: RequiredFieldsStore): Record<string, unknown> {
  return {
    version: 2,
    byCompany: store.byCompany,
    legacy: store.legacy,
  };
}

export function companyKey(companyName: string | null | undefined): string {
  return (companyName ?? '').trim();
}

/**
 * Overrides for a company: dedicated byCompany entry, else legacy global map.
 * Empty company name → legacy only.
 */
export function resolveCompanyOverrides(
  store: RequiredFieldsStore,
  companyName: string | null | undefined,
): RequiredFieldsOverrides {
  const key = companyKey(companyName);
  if (key && store.byCompany[key]) return store.byCompany[key];
  return store.legacy;
}

export function isFieldRequiredForCompany(
  module: RequiredFieldModule,
  fieldKey: string,
  store: RequiredFieldsStore,
  companyName: string | null | undefined,
): boolean {
  const overrides = resolveCompanyOverrides(store, companyName);
  return isFieldRequiredInMap(module, fieldKey, mergeRequiredFields(overrides));
}

/**
 * Hub / DB column → settings field keys (any required ⇒ treat as required for gaps/missing).
 */
export const VEHICLE_HUB_REQUIRED_ALIASES: Record<string, string[]> = {
  license_doc_url: ['license_file_name', 'license_link'],
  insurance_doc_url: ['mandatory_insurance_file_name', 'mandatory_insurance_doc_link'],
  comprehensive_insurance_doc_url: [
    'comprehensive_insurance_file_name',
    'comprehensive_insurance_doc_link',
  ],
  third_party_insurance_doc_url: [
    'third_party_insurance_file_name',
    'third_party_insurance_doc_link',
  ],
  test_expiry: ['next_test'],
  insurance_expiry: ['mandatory_insurance_end', 'mandatory_insurance_file_name', 'mandatory_insurance_doc_link'],
  comprehensive_insurance_expiry: [
    'comprehensive_insurance_end',
    'comprehensive_insurance_file_name',
    'comprehensive_insurance_doc_link',
  ],
  third_party_insurance_expiry: [
    'third_party_insurance_end',
    'third_party_insurance_file_name',
    'third_party_insurance_doc_link',
  ],
};

export function isVehicleHubFieldRequired(
  hubFieldKey: keyof typeof VEHICLE_HUB_REQUIRED_ALIASES | string,
  overrides: RequiredFieldsOverrides,
): boolean {
  const aliases = VEHICLE_HUB_REQUIRED_ALIASES[hubFieldKey];
  if (!aliases?.length) return false;
  const map = mergeRequiredFields(overrides);
  return aliases.some((fieldKey) => isFieldRequiredInMap('vehicles', fieldKey, map));
}

export function withCompanyOverride(
  store: RequiredFieldsStore,
  companyName: string,
  overrides: RequiredFieldsOverrides,
): RequiredFieldsStore {
  const key = companyKey(companyName);
  if (!key) return store;
  return {
    version: 2,
    byCompany: { ...store.byCompany, [key]: overrides },
    legacy: store.legacy,
  };
}

export function patchCompanyField(
  store: RequiredFieldsStore,
  companyName: string,
  moduleKey: string,
  fieldKey: string,
  required: boolean,
): RequiredFieldsStore {
  const key = companyKey(companyName);
  if (!key) throw new Error('יש לבחור חברה לפני שמירת שדות חובה');
  const current = { ...resolveCompanyOverrides(store, key) };
  current[`${moduleKey}.${fieldKey}`] = required;
  return withCompanyOverride(store, key, current);
}

/** Convenience: config id helpers stay aligned with schema */
export function companyFieldId(module: RequiredFieldModule, fieldKey: string): string {
  return fieldConfigId(module, fieldKey);
}
