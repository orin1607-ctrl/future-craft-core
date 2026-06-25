/**
 * Central registry for required-field management across Dalia modules.
 * Defaults live here; per-environment overrides are stored in Supabase (dalia_form_config).
 */

export type RequiredFieldModule =
  | 'vehicles'
  | 'drivers'
  | 'customers'
  | 'accidents'
  | 'documents'
  | 'treatments'
  | 'insurance';

export interface RequiredFieldDefinition {
  key: string;
  label: string;
  category: string;
  group?: string;
  defaultRequired: boolean;
}

export interface RequiredFieldModuleDef {
  key: RequiredFieldModule;
  label: string;
  fields: RequiredFieldDefinition[];
}

export type RequiredFieldsOverrides = Record<string, boolean>;

export const REQUIRED_FIELDS_CONFIG_KEY = 'required_fields';

export function fieldConfigId(module: RequiredFieldModule, fieldKey: string): string {
  return `${module}.${fieldKey}`;
}

function field(
  key: string,
  label: string,
  category: string,
  defaultRequired = false,
  group?: string,
): RequiredFieldDefinition {
  return { key, label, category, defaultRequired, group };
}

const INSURANCE_SUFFIXES: Array<[string, string]> = [
  ['company', 'חברת ביטוח'],
  ['agent', 'סוכן ביטוח'],
  ['policy', 'מספר פוליסה'],
  ['type', 'סוג ביטוח'],
  ['start', 'תאריך התחלה'],
  ['end', 'תאריך סיום'],
  ['status', 'סטטוס'],
  ['cost', 'עלות'],
  ['payment_method', 'אופן תשלום'],
  ['doc_link', 'קישור למסמך'],
  ['file_name', 'העלאת קובץ פוליסה'],
  ['notes', 'הערות'],
];

function insuranceBlockFields(
  prefix: string,
  group: string,
  defaultRequired: boolean,
): RequiredFieldDefinition[] {
  return INSURANCE_SUFFIXES.map(([suffix, label]) =>
    field(`${prefix}_${suffix}`, `${group} — ${label}`, 'ביטוחים', defaultRequired, group),
  );
}

const VEHICLE_FIELDS: RequiredFieldDefinition[] = [
  field('vehicle_plate', 'מספר רכב', 'פרטי רכב', true),
  field('internal_number', 'מספר פנימי', 'פרטי רכב'),
  field('vin', 'מספר שלדה VIN', 'פרטי רכב'),
  field('engine_number', 'מספר מנוע', 'פרטי רכב'),
  field('manufacturer', 'יצרן', 'פרטי רכב'),
  field('model', 'דגם', 'פרטי רכב'),
  field('year', 'שנתון', 'פרטי רכב'),
  field('vehicle_nickname', 'כינוי רכב', 'פרטי רכב'),
  field('vehicle_type', 'סוג רכב', 'פרטי רכב'),
  field('vehicle_segment', 'סגמנט רכב', 'פרטי רכב'),
  field('vehicle_color', 'צבע רכב', 'פרטי רכב'),
  field('fuel_type', 'סוג דלק', 'פרטי רכב'),
  field('weight', 'משקל', 'פרטי רכב'),
  field('ownership_type_text', 'סוג בעלות', 'פרטי רכב'),
  field('company', 'חברה', 'פרטי רכב'),
  field('location_assignment', 'שיוך מיקום', 'פרטי רכב'),
  field('assigned_driver', 'נהג משויך', 'פרטי רכב'),
  field('vehicle_supervisor', 'ממונה רכב', 'פרטי רכב'),
  field('current_location', 'מיקום נוכחי', 'פרטי רכב'),
  field('work_site', 'אתר עבודה', 'פרטי רכב'),
  field('usage_type', 'סוג שימוש', 'פרטי רכב'),
  field('department', 'מחלקה', 'פרטי רכב'),
  field('work_area', 'אזור עבודה', 'פרטי רכב'),
  field('vehicle_status', 'סטטוס', 'פרטי רכב'),
  field('purchase_date', 'תאריך רכישה', 'פרטי רכב'),
  field('road_date', 'תאריך עליה לכביש', 'פרטי רכב'),
  field('inspection_date', 'תאריך בדיקה', 'פרטי רכב'),
  field('end_or_scrap_date', 'תאריך סיום / גריעה', 'פרטי רכב'),
  field('ownership_route', 'מסלול בעלות', 'בעלות ומימון'),
  field('license_link', 'קישור למסמך רישיון', 'רישיונות וטסטים'),
  field('license_file_name', 'העלאת קובץ רישיון', 'רישיונות וטסטים'),
  field('last_test', 'טסט אחרון', 'רישיונות וטסטים'),
  field('next_test', 'טסט הבא', 'רישיונות וטסטים'),
  field('test_status', 'סטטוס טסט', 'רישיונות וטסטים'),
  field('test_doc_link', 'קישור מסמך טסט', 'רישיונות וטסטים'),
  field('test_file_name', 'העלאת קובץ טסט', 'רישיונות וטסטים'),
  field('has_no_claims', 'הצהרת תביעות', 'ביטוחים'),
  field('coverage_other', 'כיסוי — אחר', 'ביטוחים'),
  ...insuranceBlockFields('mandatory_insurance', 'ביטוח חובה', false),
  ...insuranceBlockFields('comprehensive_insurance', 'ביטוח מקיף', false),
  ...insuranceBlockFields('third_party_insurance', 'ביטוח צד ג׳', false),
  field('horse_power', 'כוח סוס', 'ציוד'),
  field('engine_volume', 'נפח מנוע', 'ציוד'),
  field('weight_ton', 'משקל / טון', 'ציוד'),
  field('kva', 'KVA', 'ציוד'),
  field('special_type', 'מסוג / ייעודי', 'ציוד'),
  field('last_service', 'טיפול אחרון', 'תחזוקה'),
  field('next_service', 'טיפול הבא', 'תחזוקה'),
  field('next_service_km', 'טיפול הבא (ק״מ)', 'תחזוקה'),
  field('maintenance_method', 'שיטת תחזוקה', 'תחזוקה'),
  field('service_type', 'סוג שירות', 'תחזוקה'),
  field('service_notes', 'הערות שירות', 'תחזוקה'),
];

const DRIVER_FIELDS: RequiredFieldDefinition[] = [
  field('full_name', 'שם מלא', 'פרטי נהג', true),
  field('phone', 'טלפון', 'פרטי נהג', true),
  field('email', 'אימייל', 'פרטי נהג'),
  field('login_email', 'אימייל התחברות', 'התחברות', true),
  field('password', 'סיסמה', 'התחברות', true),
  field('license_number', 'מספר רישיון', 'רישיון'),
  field('license_expiry', 'תוקף רישיון', 'רישיון'),
  field('id_number', 'תעודת זהות', 'פרטי נהג'),
  field('company_name', 'חברה', 'שיוך'),
];

const CUSTOMER_FIELDS: RequiredFieldDefinition[] = [
  field('name', 'שם לקוח / חברה', 'פרטי לקוח', true),
  field('contact_person', 'איש קשר', 'פרטי לקוח'),
  field('phone', 'טלפון', 'פרטי לקוח', true),
  field('email', 'אימייל', 'פרטי לקוח'),
  field('business_id', 'ח.פ / ע.מ', 'פרטי לקוח'),
  field('address', 'כתובת', 'פרטי לקוח'),
  field('notes', 'הערות', 'פרטי לקוח'),
];

const ACCIDENT_FIELDS: RequiredFieldDefinition[] = [
  field('accident_date', 'תאריך תאונה', 'פרטי תאונה', true),
  field('location', 'מיקום', 'פרטי תאונה'),
  field('driver_name', 'נהג', 'פרטי תאונה'),
  field('vehicle_plate', 'מספר רכב', 'פרטי תאונה', true),
  field('description', 'תיאור', 'פרטי תאונה'),
  field('severity', 'חומרה', 'פרטי תאונה'),
  field('police_report', 'דוח משטרה', 'מסמכים'),
];

const DOCUMENT_FIELDS: RequiredFieldDefinition[] = [
  field('name', 'שם מסמך', 'פרטי מסמך', true),
  field('category', 'קטגוריה', 'פרטי מסמך'),
  field('vehicle_plate', 'מספר רכב', 'שיוך'),
  field('expiry_date', 'תאריך תפוגה', 'פרטי מסמך'),
  field('file_url', 'קובץ / קישור', 'פרטי מסמך'),
  field('notes', 'הערות', 'פרטי מסמך'),
];

const TREATMENT_FIELDS: RequiredFieldDefinition[] = [
  field('vehicle_plate', 'מספר רכב', 'פרטי טיפול', true),
  field('service_date', 'תאריך טיפול', 'פרטי טיפול', true),
  field('description', 'תיאור', 'פרטי טיפול'),
  field('cost', 'עלות', 'פרטי טיפול'),
  field('provider', 'ספק / מוסך', 'פרטי טיפול'),
  field('odometer', 'קילומטראז׳', 'פרטי טיפול'),
];

const INSURANCE_MODULE_FIELDS: RequiredFieldDefinition[] = [
  ...insuranceBlockFields('policy', 'פוליסה כללית', false),
  field('vehicle_plate', 'מספר רכב', 'שיוך'),
  field('insurance_type', 'סוג ביטוח', 'פרטי ביטוח'),
];

export const REQUIRED_FIELD_MODULES: RequiredFieldModuleDef[] = [
  { key: 'vehicles', label: 'רכבים', fields: VEHICLE_FIELDS },
  { key: 'drivers', label: 'נהגים', fields: DRIVER_FIELDS },
  { key: 'customers', label: 'לקוחות', fields: CUSTOMER_FIELDS },
  { key: 'accidents', label: 'תאונות', fields: ACCIDENT_FIELDS },
  { key: 'documents', label: 'מסמכים', fields: DOCUMENT_FIELDS },
  { key: 'treatments', label: 'טיפולים', fields: TREATMENT_FIELDS },
  { key: 'insurance', label: 'ביטוחים', fields: INSURANCE_MODULE_FIELDS },
];

const MODULE_MAP = Object.fromEntries(
  REQUIRED_FIELD_MODULES.map((m) => [m.key, m]),
) as Record<RequiredFieldModule, RequiredFieldModuleDef>;

export function getModuleDef(module: RequiredFieldModule): RequiredFieldModuleDef {
  return MODULE_MAP[module];
}

export function getFieldDef(
  module: RequiredFieldModule,
  fieldKey: string,
): RequiredFieldDefinition | undefined {
  return MODULE_MAP[module]?.fields.find((f) => f.key === fieldKey);
}

export function buildDefaultRequiredMap(): RequiredFieldsOverrides {
  const out: RequiredFieldsOverrides = {};
  for (const mod of REQUIRED_FIELD_MODULES) {
    for (const f of mod.fields) {
      if (f.defaultRequired) {
        out[fieldConfigId(mod.key, f.key)] = true;
      }
    }
  }
  return out;
}

export function mergeRequiredFields(overrides: RequiredFieldsOverrides): RequiredFieldsOverrides {
  const merged = buildDefaultRequiredMap();
  for (const [id, required] of Object.entries(overrides)) {
    merged[id] = required;
  }
  return merged;
}

export function isFieldRequiredInMap(
  module: RequiredFieldModule,
  fieldKey: string,
  map: RequiredFieldsOverrides,
): boolean {
  const id = fieldConfigId(module, fieldKey);
  if (id in map) return map[id];
  return getFieldDef(module, fieldKey)?.defaultRequired ?? false;
}

export function listFieldsByCategory(
  module: RequiredFieldModule,
): Array<{ category: string; fields: RequiredFieldDefinition[] }> {
  const mod = MODULE_MAP[module];
  const byCat = new Map<string, RequiredFieldDefinition[]>();
  for (const f of mod.fields) {
    const list = byCat.get(f.category) ?? [];
    list.push(f);
    byCat.set(f.category, list);
  }
  return [...byCat.entries()].map(([category, fields]) => ({ category, fields }));
}
