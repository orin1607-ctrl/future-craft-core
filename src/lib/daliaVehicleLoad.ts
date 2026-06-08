/**
 * Load vehicles row → Dalia form values + hub display (round-trip with daliaVehiclePersist).
 */
import type { DaliaDoc } from '@/components/vehicles/vehicleNewDalia/VehicleNewFormDalia';
import type { DaliaPersistExtras } from '@/lib/daliaVehiclePersist';

export const EMPTY_FIELD_LABEL = 'לא הוזן';

const STATUS_EN_TO_HE: Record<string, string> = {
  active: 'פעיל',
  in_service: 'בטיפול',
  out_of_service: 'לא פעיל',
  archived: 'ארכיון',
};

/** form field → DB column (mirror of daliaVehiclePersist DIRECT_COLUMN_MAP) */
const FORM_TO_COLUMN: Record<string, string> = {
  vehicle_plate: 'license_plate',
  internal_number: 'internal_number',
  manufacturer: 'manufacturer',
  model: 'model',
  year: 'year',
  vehicle_type: 'vehicle_type',
  vehicle_nickname: 'nickname',
  fuel_type: 'fuel_type',
  vin: 'vin',
  engine_number: 'engine_number',
  ownership_type_text: 'ownership_type',
  vehicle_segment: 'segment',
  road_date: 'road_entry_date',
  last_test: 'last_test_date',
  next_test: 'test_expiry',
  current_km: 'odometer',
  department: 'department',
  work_site: 'work_site',
  usage_type: 'usage_type',
  current_location: 'current_location',
  vehicle_supervisor: 'vehicle_manager',
  vehicle_status: 'status',
  company: 'company_name',
  last_service: 'last_service_date',
  next_service: 'next_service_date',
  next_service_km: 'next_service_km',
  maintenance_method: 'maintenance_method',
  service_type: 'service_type',
  service_notes: 'service_notes',
  inspection_date: 'last_inspection_date',
  purchase_date: 'sale_date',
  vehicle_color: 'vehicle_color',
  end_or_scrap_date: 'end_or_scrap_date',
  horse_power: 'horsepower',
  engine_volume: 'engine_volume',
  weight: 'weight_tons',
  weight_ton: 'weight_tons',
  kva: 'kva',
  equipment_serial: 'equipment_serial',
  meter_type: 'meter_type',
  meter_update_date: 'meter_updated_at',
  maintenance_engine_hours: 'engine_hours',
  next_service_engine_hours: 'next_service_hours',
  equipment_engine_hours: 'engine_hours',
  dedicated_equipment: 'equipment_type',
  dedicated_equipment_details: 'equipment_details',
  special_type: 'equipment_type',
  equipment_notes: 'equipment_details',
  ownership_route: 'finance_track',
  test_status: 'test_status',
  alert_status: 'service_status',
  license_link: 'license_doc_url',
  mandatory_insurance_start: 'insurance_start',
  mandatory_insurance_end: 'insurance_expiry',
  mandatory_insurance_doc_link: 'insurance_doc_url',
  mandatory_insurance_cost: 'insurance_cost',
  mandatory_insurance_company: 'insurance_company',
  mandatory_insurance_agent: 'insurance_agent',
  comprehensive_insurance_start: 'comprehensive_insurance_start',
  comprehensive_insurance_end: 'comprehensive_insurance_expiry',
  comprehensive_insurance_doc_link: 'comprehensive_insurance_doc_url',
  op_monthly_cost: 'monthly_leasing_cost',
  op_end: 'leasing_end_date',
  fl_monthly_cost: 'monthly_loan_payment',
  fl_end: 'loan_end_date',
  rent_end: 'vehicle_return_date',
  manager_reminder: 'manager_report',
  lifting_reminder: 'lifting_report',
  manager_reminder_date: 'next_inspection_date',
  lifting_reminder_date: 'repeat_inspection_date',
  dedicated_equipment_validity: 'special_equipment_expiry',
  dedicated_equipment_validity_date: 'special_equipment_expiry',
  accessories_validity: 'inspections_certificates',
  accessories_validity_date: 'inspections_certificates',
  location_assignment: 'work_site',
  work_area: 'department',
};

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function setIf(out: Record<string, string>, key: string, val: unknown) {
  if (val == null || val === '') return;
  out[key] = String(val);
}

function expandPrefixed(
  out: Record<string, string>,
  obj: Record<string, unknown> | undefined,
  prefix: string,
) {
  if (!obj) return;
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '') continue;
    out[`${prefix}${k}`] = String(v);
  }
}

export type DaliaLoadedVehicle = {
  values: Record<string, string>;
  extras: DaliaPersistExtras;
  assignedDriverName?: string;
};

export function loadDaliaFromVehicleRow(row: Record<string, unknown>): DaliaLoadedVehicle {
  const values: Record<string, string> = {};

  for (const [form, col] of Object.entries(FORM_TO_COLUMN)) {
    setIf(values, form, row[col]);
  }

  if (row.license_plate) values.vehicle_plate = String(row.license_plate);
  if (row.status) {
    values.vehicle_status = STATUS_EN_TO_HE[String(row.status)] || String(row.status);
  }
  if (row.odometer != null) values.current_km = String(row.odometer);

  const insurances = parseJson<{
    coverage?: Record<string, unknown>;
    mandatory?: Record<string, unknown>;
    comprehensive?: Record<string, unknown>;
    third_party?: Record<string, unknown>;
  }>(row.insurances, {});

  const cov = insurances.coverage || {};
  if (cov.glass) values.coverage_glass = 'true';
  if (cov.replacement) values.coverage_replacement = 'true';
  if (cov.new_driver) values.coverage_new_driver = 'true';
  if (cov.licensing) values.coverage_licensing = 'true';
  if (cov.roadside) values.coverage_roadside = 'true';
  if (cov.lights) values.coverage_lights = 'true';
  if (cov.other) values.coverage_other = String(cov.other);

  expandPrefixed(values, insurances.mandatory as Record<string, unknown>, 'mandatory_insurance_');
  expandPrefixed(values, insurances.comprehensive as Record<string, unknown>, 'comprehensive_insurance_');
  expandPrefixed(values, insurances.third_party as Record<string, unknown>, 'third_party_insurance_');

  const maintenance = parseJson<Record<string, unknown>>(row.maintenance_details, {});
  const maintMethod = String(maintenance.method || row.maintenance_method || 'דליה');
  delete maintenance.method;
  for (const [k, v] of Object.entries(maintenance)) {
    if (v == null || v === '') continue;
    if (k.startsWith('maint_') || k.startsWith('svc_')) values[k] = String(v);
    else if (k.startsWith('maint')) values[`maint_${k}`] = String(v);
    else values[k.startsWith('svc') ? k : `maint_${k}`] = String(v);
  }
  for (const [k, v] of Object.entries(maintenance)) {
    if (k.startsWith('maint_') || k.startsWith('svc_')) values[k] = String(v);
  }

  const finance = parseJson<Record<string, unknown>>(row.finance_details, {});
  const route = String(finance.route || row.finance_track || '');
  delete finance.route;
  if (route) values.ownership_route = route;
  for (const [k, v] of Object.entries(finance)) {
    if (v == null || v === '') continue;
    if (typeof v === 'object' && k === 'pledge') {
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        if (pv != null && pv !== '') values[String(pk)] = String(pv);
      }
    } else {
      values[k] = String(v);
    }
  }

  const buf = parseJson<{
    dalia_form?: Record<string, string>;
    departments?: string[];
    docs?: DaliaDoc[];
    section_saved?: Record<number, boolean>;
    assigned_driver_name?: string;
  }>(row.import_buffer, {});

  if (buf.dalia_form) {
    for (const [k, v] of Object.entries(buf.dalia_form)) {
      if (v != null && v !== '' && !values[k]) values[k] = String(v);
    }
  }

  if (!values.vehicle_color && buf.dalia_form?.vehicle_color) {
    values.vehicle_color = buf.dalia_form.vehicle_color;
  }
  if (!values.end_or_scrap_date && buf.dalia_form?.end_or_scrap_date) {
    values.end_or_scrap_date = buf.dalia_form.end_or_scrap_date;
  }

  const assignedDriverName =
    buf.assigned_driver_name || values.assigned_driver || undefined;

  return {
    values,
    extras: {
      docs: buf.docs || [],
      departments: buf.departments || [],
      route: route || values.ownership_route || '',
      maintMethod,
      sectionSaved: buf.section_saved || {},
    },
    assignedDriverName,
  };
}

export type DisplayField = { key: string; label: string; value: string; section: string };

const SECTION_BY_PREFIX: [string, string][] = [
  ['vehicle_', '1. פרטי רכב'],
  ['internal_', '1. פרטי רכב'],
  ['vin', '1. פרטי רכב'],
  ['manufacturer', '1. פרטי רכב'],
  ['ownership_route', '2. בעלות'],
  ['op_', '2. בעלות'],
  ['fl_', '2. בעלות'],
  ['rent_', '2. בעלות'],
  ['loan_', '2. בעלות'],
  ['company_', '2. בעלות'],
  ['private_', '2. בעלות'],
  ['other_', '2. בעלות'],
  ['svc_', '2. בעלות'],
  ['mandatory_insurance_', '3. ביטוחים'],
  ['comprehensive_insurance_', '3. ביטוחים'],
  ['third_party_insurance_', '3. ביטוחים'],
  ['coverage_', '3. ביטוחים'],
  ['license_', '3. ביטוחים'],
  ['test_', '3. ביטוחים'],
  ['last_test', '3. ביטוחים'],
  ['next_test', '3. ביטוחים'],
  ['special_', '4. ציוד'],
  ['equipment_', '4. ציוד'],
  ['horse_power', '4. ציוד'],
  ['engine_volume', '4. ציוד'],
  ['weight', '4. ציוד'],
  ['kva', '4. ציוד'],
  ['dedicated_', '4. ציוד'],
  ['maint_', '5. תחזוקה'],
  ['maintenance_', '5. תחזוקה'],
  ['service_', '5. תחזוקה'],
  ['current_km', '5. תחזוקה'],
  ['last_service', '5. תחזוקה'],
  ['next_service', '5. תחזוקה'],
  ['alert_', '5. תחזוקה'],
  ['meter_', '5. תחזוקה'],
];

function guessSection(key: string): string {
  for (const [prefix, section] of SECTION_BY_PREFIX) {
    if (key.startsWith(prefix) || key === prefix.replace(/_$/, '')) return section;
  }
  return '1. פרטי רכב';
}

const HEBREW_FIELD_LABELS: Record<string, string> = {
  vehicle_plate: 'מספר רכב',
  internal_number: 'מספר פנימי',
  manufacturer: 'יצרן',
  model: 'דגם',
  year: 'שנת ייצור',
  vehicle_type: 'סוג רכב',
  vehicle_nickname: 'כינוי רכב',
  vehicle_color: 'צבע רכב',
  fuel_type: 'סוג דלק',
  vin: 'מספר שלדה',
  engine_number: 'מספר מנוע',
  assigned_driver: 'נהג משויך',
  department: 'מחלקה',
  work_site: 'אתר עבודה',
  work_area: 'אזור עבודה',
  location_assignment: 'שיוך מיקום',
  current_location: 'מיקום נוכחי',
  current_km: 'קילומטראז׳',
  vehicle_status: 'סטטוס רכב',
  vehicle_supervisor: 'מפקח רכב',
  usage_type: 'סוג שימוש',
  company: 'חברה',
  ownership_route: 'מסלול בעלות',
  ownership_type_text: 'סוג בעלות',
  end_or_scrap_date: 'תאריך סיום / גריעה',
  last_service: 'טיפול אחרון',
  next_service: 'טיפול הבא',
  next_service_km: 'טיפול הבא (ק״מ)',
  last_test: 'טסט אחרון',
  next_test: 'טסט הבא',
  test_status: 'סטטוס טסט',
  alert_status: 'סטטוס התראה',
  horse_power: 'כוח סוס',
  engine_volume: 'נפח מנוע',
  weight: 'משקל',
  kva: 'KVA',
  dedicated_equipment: 'ציוד ייעודי',
  dedicated_equipment_details: 'פרטי ציוד',
  equipment_serial: 'מספר סידורי ציוד',
  meter_type: 'סוג מד',
  meter_update_date: 'עדכון מד',
  maintenance_engine_hours: 'שעות מנוע',
  next_service_engine_hours: 'שעות מנוע לטיפול הבא',
  coverage_glass: 'כיסוי שמשות',
  coverage_replacement: 'רכב חלופי',
  coverage_new_driver: 'נהג חדש',
  coverage_licensing: 'רישוי',
  coverage_roadside: 'שירותי דרך',
  coverage_lights: 'פנסים',
  license_link: 'קישור רישיון',
  mandatory_insurance_start: 'תחילת ביטוח חובה',
  mandatory_insurance_end: 'סיום ביטוח חובה',
  mandatory_insurance_cost: 'עלות ביטוח חובה',
  mandatory_insurance_company: 'חברת ביטוח חובה',
  mandatory_insurance_agent: 'סוכן ביטוח חובה',
  comprehensive_insurance_start: 'תחילת ביטוח מקיף',
  comprehensive_insurance_end: 'סיום ביטוח מקיף',
  op_monthly_cost: 'עלות חודשית (ליסינג תפעולי)',
  op_end: 'סיום ליסינג תפעולי',
  fl_monthly_cost: 'תשלום חודשי (ליסינג מימוני)',
  fl_end: 'סיום ליסינג מימוני',
  rent_end: 'סיום השכרה',
  purchase_date: 'תאריך רכישה',
  road_date: 'תאריך עלייה לכביש',
  inspection_date: 'תאריך בדיקה',
  manager_reminder: 'תזכורת מנהל',
  lifting_reminder: 'תזכורת הרמה',
  manager_reminder_date: 'תאריך תזכורת מנהל',
  lifting_reminder_date: 'תאריך תזכורת הרמה',
  maint_notes: 'הערות תחזוקה',
  service_notes: 'הערות שירות',
  service_type: 'סוג שירות',
  maintenance_method: 'שיטת תחזוקה',
};

/** Humanize field key for display */
export function fieldLabel(key: string): string {
  if (HEBREW_FIELD_LABELS[key]) return HEBREW_FIELD_LABELS[key];
  if (key.startsWith('mandatory_insurance_')) return `ביטוח חובה — ${key.replace('mandatory_insurance_', '').replace(/_/g, ' ')}`;
  if (key.startsWith('comprehensive_insurance_')) return `ביטוח מקיף — ${key.replace('comprehensive_insurance_', '').replace(/_/g, ' ')}`;
  if (key.startsWith('third_party_insurance_')) return `ביטוח צד ג׳ — ${key.replace('third_party_insurance_', '').replace(/_/g, ' ')}`;
  if (key.startsWith('maint_')) return `תחזוקה — ${key.replace('maint_', '').replace(/_/g, ' ')}`;
  if (key.startsWith('svc_')) return `שירות — ${key.replace('svc_', '').replace(/_/g, ' ')}`;
  if (key.startsWith('op_')) return `ליסינג תפעולי — ${key.replace('op_', '').replace(/_/g, ' ')}`;
  if (key.startsWith('fl_')) return `ליסינג מימוני — ${key.replace('fl_', '').replace(/_/g, ' ')}`;
  if (key.startsWith('coverage_')) return `כיסוי — ${key.replace('coverage_', '').replace(/_/g, ' ')}`;
  if (key.startsWith('doc:')) return key.replace('doc:', 'מסמך: ');
  return key.replace(/_/g, ' ').trim();
}

export function formatDisplayValue(raw: string | undefined | null, isBool = false): string {
  if (raw == null || raw === '') return EMPTY_FIELD_LABEL;
  if (isBool) return raw === 'true' ? 'כן' : raw === 'false' ? 'לא' : raw;
  return raw;
}

export function getAllDisplayFields(row: Record<string, unknown>): DisplayField[] {
  const { values, extras } = loadDaliaFromVehicleRow(row);
  const fields: DisplayField[] = [];

  const seen = new Set<string>();
  for (const [key, val] of Object.entries(values).sort(([a], [b]) => a.localeCompare(b, 'he'))) {
    if (seen.has(key)) continue;
    seen.add(key);
    const isBool = key.startsWith('coverage_');
    fields.push({
      key,
      label: fieldLabel(key),
      value: formatDisplayValue(val, isBool),
      section: guessSection(key),
    });
  }

  if (extras.docs.length) {
    for (const doc of extras.docs) {
      fields.push({
        key: `doc:${doc.name}`,
        label: `מסמך: ${doc.name}`,
        value: doc.link || doc.file || EMPTY_FIELD_LABEL,
        section: '6. מסמכים',
      });
    }
  } else {
    fields.push({
      key: 'docs_empty',
      label: 'מסמכים',
      value: EMPTY_FIELD_LABEL,
      section: '6. מסמכים',
    });
  }

  if (extras.departments.length) {
    fields.push({
      key: 'departments',
      label: 'מחלקות',
      value: extras.departments.join(', '),
      section: '1. פרטי רכב',
    });
  }

  return fields;
}

export function groupDisplayFieldsBySection(fields: DisplayField[]): Record<string, DisplayField[]> {
  const groups: Record<string, DisplayField[]> = {};
  for (const f of fields) {
    if (!groups[f.section]) groups[f.section] = [];
    groups[f.section].push(f);
  }
  return groups;
}
