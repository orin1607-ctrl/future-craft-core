/**
 * Dalia form → vehicles table persistence (dalia-staging).
 * Maps direct columns + packs overflow into JSON/text columns.
 */
import { supabase } from '@/integrations/supabase/client';
import { logVehicleEvent } from '@/lib/vehicleEventLog';
import {
  resolveVehicleApprovalStatus,
  validateVehicleAgainstCompanyPolicy,
} from '@/lib/companyPolicyEnforcement';
import { fetchCompanySettings } from '@/lib/companySettings';
import { createApprovalRequest } from '@/lib/approvalQueue';
import { fetchRequiredFieldsOverrides } from '@/lib/requiredFieldsApi';
import { validateRequiredModuleFields } from '@/lib/requiredFieldsValidate';
import type { DaliaDoc } from '@/components/vehicles/vehicleNewDalia/VehicleNewFormDalia';

export type DaliaPersistExtras = {
  docs: DaliaDoc[];
  departments: string[];
  route: string;
  maintMethod: string;
  sectionSaved: Record<number, boolean>;
};

/** Direct form field → vehicles column */
const DIRECT_COLUMN_MAP: Record<string, string> = {
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
  other_route_notes: 'finance_details',
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
  third_party_insurance_end: 'third_party_insurance_expiry',
  third_party_insurance_doc_link: 'third_party_insurance_doc_url',
  has_no_claims: 'has_no_claims',
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

const ROUTE_TO_MANAGEMENT: Record<string, string> = {
  'ליסינג תפעולי': 'operational_leasing',
  'ליסינג מימוני': 'financial_leasing',
  'הלוואה / מימון': 'financial_leasing',
  'תחזוקה עצמאית': 'self_maintained',
  'שירות ותחזוקה': 'self_maintained',
  'בעלות חברה': 'self_maintained',
  'בעלות פרטית': 'self_maintained',
  השכרה: 'operational_leasing',
  אחר: 'self_maintained',
};

const STATUS_HE_TO_EN: Record<string, string> = {
  פעיל: 'active',
  'בטיפול': 'in_service',
  'לא פעיל': 'out_of_service',
  מושבת: 'out_of_service',
  'בבדיקה': 'in_service',
  ממתין: 'active',
  ארכיון: 'archived',
};

export function formatVehiclePersistError(err: unknown): string {
  const e = err as { message?: string; code?: string; details?: string };
  const msg = e?.message || '';
  if (e?.code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
    return 'רכב עם מספר רישוי זה כבר קיים במערכת';
  }
  if (msg.includes('invalid input syntax')) {
    return 'אחד השדות מכיל ערך לא תקין — בדוק תאריכים ומספרים';
  }
  if (msg.includes('JWT') || msg.includes('not authenticated')) {
    return 'יש להתחבר מחדש לפני שמירה';
  }
  return msg || 'שגיאה לא ידועה בשמירה';
}

const NUMERIC_COLUMNS = new Set([
  'year',
  'odometer',
  'next_service_km',
  'horsepower',
  'engine_volume',
  'weight_tons',
  'kva',
  'engine_hours',
  'next_service_hours',
  'insurance_cost',
  'monthly_leasing_cost',
  'monthly_loan_payment',
]);

const DATE_COLUMNS = new Set([
  'test_expiry',
  'insurance_start',
  'insurance_expiry',
  'comprehensive_insurance_start',
  'comprehensive_insurance_expiry',
  'third_party_insurance_expiry',
  'last_service_date',
  'next_service_date',
  'road_entry_date',
  'last_test_date',
  'last_inspection_date',
  'next_inspection_date',
  'repeat_inspection_date',
  'sale_date',
  'end_or_scrap_date',
  'leasing_end_date',
  'loan_end_date',
  'vehicle_return_date',
  'special_equipment_expiry',
  'meter_updated_at',
]);

function normValue(column: string, raw: string): unknown {
  const v = raw.trim();
  if (!v) return null;
  if (column === 'has_no_claims') return v === 'true' || v === 'on';
  if (column === 'status') return STATUS_HE_TO_EN[v] || 'active';
  if (NUMERIC_COLUMNS.has(column)) {
    const n = parseFloat(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (DATE_COLUMNS.has(column)) return v;
  return v;
}

/** Merge React context values + FormData (checkboxes, file names). */
export function collectDaliaFormValues(
  contextValues: Record<string, string>,
  formData?: FormData | null,
): Record<string, string> {
  const out = { ...contextValues };
  if (!formData) return out;
  for (const [key, val] of formData.entries()) {
    if (typeof val !== 'string') continue;
    if (val !== '') out[key] = val;
  }
  for (const name of [
    'coverage_glass',
    'coverage_replacement',
    'coverage_new_driver',
    'coverage_licensing',
    'coverage_roadside',
    'coverage_lights',
    'has_no_claims',
  ]) {
    out[name] = formData.get(name) ? 'true' : 'false';
  }
  return out;
}

function pickPrefix(values: Record<string, string>, prefix: string) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length), v]),
  );
}

function pickPrefixes(values: Record<string, string>, prefixes: string[]) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (prefixes.some((pre) => k.startsWith(pre))) out[k] = v;
  }
  return out;
}

export function buildVehiclePayloadFromDalia(
  allValues: Record<string, string>,
  extras: DaliaPersistExtras,
  user: { id?: string; company_name?: string; full_name?: string },
) {
  const direct: Record<string, unknown> = {};
  const overflow: Record<string, string> = {};

  for (const [field, raw] of Object.entries(allValues)) {
    if (raw === undefined || raw === '') continue;
    const col = DIRECT_COLUMN_MAP[field];
    if (col) {
      const val = normValue(col, raw);
      if (val !== null && val !== '') direct[col] = val;
    } else {
      overflow[field] = raw;
    }
  }

  if (extras.route) {
    direct.finance_track = extras.route;
    const mgmt = ROUTE_TO_MANAGEMENT[extras.route];
    if (mgmt) {
      direct.management_type = mgmt;
      direct.is_leasing = mgmt === 'operational_leasing' || mgmt === 'financial_leasing';
      direct.has_loan = mgmt === 'financial_leasing' || mgmt === 'self_maintained';
    }
  }

  if (extras.maintMethod) direct.maintenance_method = extras.maintMethod;

  const plate = String(direct.license_plate || allValues.vehicle_plate || '').replace(/[-\s]/g, '');
  if (!plate) throw new Error('חסר מספר רכב');

  direct.license_plate = plate;
  direct.company_name = user.company_name || String(direct.company_name || '');
  direct.created_by = user.id || null;
  direct.status = (direct.status as string) || 'active';
  direct.odometer = direct.odometer ?? 0;
  if (allValues.has_no_claims === 'false') direct.has_no_claims = false;

  const insurancesJson = {
    coverage: {
      glass: allValues.coverage_glass === 'true',
      replacement: allValues.coverage_replacement === 'true',
      new_driver: allValues.coverage_new_driver === 'true',
      licensing: allValues.coverage_licensing === 'true',
      roadside: allValues.coverage_roadside === 'true',
      lights: allValues.coverage_lights === 'true',
      other: allValues.coverage_other || '',
    },
    mandatory: pickPrefix(allValues, 'mandatory_insurance_'),
    comprehensive: pickPrefix(allValues, 'comprehensive_insurance_'),
    third_party: pickPrefix(allValues, 'third_party_insurance_'),
  };

  const maintenanceJson = {
    method: extras.maintMethod,
    ...pickPrefix(allValues, 'maint_'),
    ...pickPrefix(allValues, 'svc_'),
    ...Object.fromEntries(Object.entries(allValues).filter(([k]) => k.startsWith('eq_'))),
  };

  const financeJson = {
    route: extras.route,
    ...pickPrefix(allValues, 'op_'),
    ...pickPrefix(allValues, 'fl_'),
    ...pickPrefix(allValues, 'rent_'),
    ...pickPrefix(allValues, 'other_'),
    ...pickPrefix(allValues, 'company_'),
    ...pickPrefix(allValues, 'private_'),
    ...pickPrefixes(allValues, ['loan_', 'self_', 'company_', 'private_']),
    pledge: pickPrefixes(allValues, [
      'op_pledge_',
      'fl_pledge_',
      'loan_pledge_',
      'self_pledge_',
      'svc_pledge_',
      'company_pledge_',
      'private_pledge_',
    ]),
  };

  const importBuffer = {
    dalia_form: {
      ...overflow,
      ...(allValues.assigned_driver ? { assigned_driver: allValues.assigned_driver } : {}),
    },
    departments: extras.departments,
    docs: extras.docs,
    section_saved: extras.sectionSaved,
    assigned_driver_name: allValues.assigned_driver || '',
    saved_at: new Date().toISOString(),
    saved_by: user.full_name || '',
  };

  direct.insurances = JSON.stringify(insurancesJson);
  direct.maintenance_details = JSON.stringify(maintenanceJson);
  direct.finance_details = JSON.stringify(financeJson);
  direct.import_buffer = JSON.stringify(importBuffer);
  direct.import_source = 'dalia_form';
  direct.import_status = 'saved';

  return { payload: direct, overflow, plate };
}

async function resolveAssignedDriverId(
  driverName: string | undefined,
  companyName: string | undefined,
): Promise<string | null> {
  const name = driverName?.trim();
  if (!name) return null;
  let query = supabase.from('drivers').select('id').eq('full_name', name).limit(1);
  if (companyName) query = query.eq('company_name', companyName);
  const { data } = await query.maybeSingle();
  return data?.id ?? null;
}

export async function persistDaliaVehicle(params: {
  allValues: Record<string, string>;
  extras: DaliaPersistExtras;
  user: { id?: string; company_name?: string; full_name?: string; role?: string };
  vehicleId?: string | null;
}) {
  const { payload, plate } = buildVehiclePayloadFromDalia(
    params.allValues,
    params.extras,
    params.user,
  );

  const assignedDriverId = await resolveAssignedDriverId(
    params.allValues.assigned_driver,
    params.user.company_name,
  );
  if (assignedDriverId) payload.assigned_driver_id = assignedDriverId;

  const companyName = String(payload.company_name || params.user.company_name || '');
  const isNewVehicle = !params.vehicleId;

  const policyCheck = await validateVehicleAgainstCompanyPolicy({
    allValues: params.allValues,
    docs: params.extras.docs,
    companyName,
    userRole: params.user.role,
    vehicleId: params.vehicleId,
    assignedDriverId,
    isNewVehicle,
  });
  if (!policyCheck.ok) throw new Error(policyCheck.message);

  const fieldOverrides = await fetchRequiredFieldsOverrides(companyName);
  const requiredCheck = validateRequiredModuleFields('vehicles', params.allValues, fieldOverrides);
  if (!requiredCheck.ok) throw new Error(requiredCheck.message);

  const settings = await fetchCompanySettings(companyName);
  if (isNewVehicle) {
    payload.approval_status = resolveVehicleApprovalStatus(settings, true, params.user.role);
  }

  let vehicleId = params.vehicleId || null;
  let error;

  if (vehicleId) {
    ({ error } = await supabase.from('vehicles').update(payload).eq('id', vehicleId));
  } else {
    const res = await supabase.from('vehicles').insert(payload).select('id').single();
    error = res.error;
    vehicleId = res.data?.id ?? null;
  }

  if (error) throw new Error(formatVehiclePersistError(error));
  if (!vehicleId) throw new Error('לא התקבל מזהה רכב');

  void import('@/lib/securityAuditClient').then(({ securityRecordAction }) => {
    securityRecordAction(params.vehicleId ? 'entity_update' : 'entity_create', {
      action: params.vehicleId ? 'שינוי רכב' : 'יצירת רכב',
      objectType: 'vehicle',
      outcome: 'success',
    }).catch(() => undefined);
  });

  await logVehicleEvent({
    vehicleId,
    vehiclePlate: plate,
    companyName: String(payload.company_name || ''),
    action: params.vehicleId ? 'עדכון רכב (Dalia)' : 'הוספת רכב (Dalia)',
    details: `${payload.manufacturer || ''} ${payload.model || ''}`.trim(),
    userId: params.user.id,
    userName: params.user.full_name,
  });

  if (isNewVehicle && payload.approval_status === 'pending_approval') {
    await createApprovalRequest({
      companyName,
      entityType: 'vehicle',
      entityId: vehicleId,
      actionType: 'vehicle_create',
      vehiclePlate: plate,
      description: `רכב חדש ממתין לאישור: ${payload.manufacturer || ''} ${payload.model || ''}`.trim(),
      requestedBy: params.user.id,
      requestedByName: params.user.full_name || '',
    });
  }

  return { id: vehicleId, payload };
}
