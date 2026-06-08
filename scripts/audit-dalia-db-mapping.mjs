/**
 * Map 103 Dalia form fields → vehicles columns on dalia-staging (read-only audit).
 */
import { readFileSync } from 'fs';

const src =
  readFileSync('src/components/vehicles/vehicleNewDalia/VehicleNewFormDalia.tsx', 'utf8') +
  readFileSync('src/components/vehicles/vehicleNewDalia/vehicleNewDaliaBlocks.tsx', 'utf8');
const formFields = [...new Set([...src.matchAll(/name=["']([^"']+)["']/g)].map((m) => m[1]))].filter(
  (n) => !n.includes('${'),
);

const EXPLICIT_MAP = {
  vehicle_plate: 'license_plate',
  internal_number: 'internal_number',
  manufacturer: 'manufacturer',
  model: 'model',
  year: 'year',
  vehicle_type: 'vehicle_type',
  vehicle_color: null,
  fuel_type: 'fuel_type',
  vin: 'vin',
  engine_number: 'engine_number',
  ownership_type_text: 'ownership_type',
  vehicle_segment: 'segment',
  road_date: 'road_entry_date',
  last_test: 'last_test_date',
  next_test: 'test_expiry',
  vehicle_nickname: 'nickname',
  current_km: 'odometer',
  department: 'department',
  work_site: 'work_site',
  usage_type: 'usage_type',
  current_location: 'current_location',
  vehicle_supervisor: 'vehicle_manager',
  vehicle_status: 'status',
  assigned_driver: 'assigned_driver_id',
  company: 'company_name',
  last_service: 'last_service_date',
  next_service: 'next_service_date',
  next_service_km: 'next_service_km',
  maintenance_method: 'maintenance_method',
  service_type: 'service_type',
  service_notes: 'service_notes',
  inspection_date: 'last_inspection_date',
  purchase_date: 'sale_date',
  end_or_scrap_date: null,
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
  license_file: 'license_doc_url',
  license_link: 'license_doc_url',
  test_status: 'test_status',
  ownership_route: 'finance_track',
  other_route_notes: 'finance_details',
  maint_notes: 'maintenance_details',
  svc_notes: 'service_notes',
  equipment_notes: 'equipment_details',
  lifting_reminder: 'lifting_report',
  manager_reminder: 'manager_report',
  dedicated_equipment_validity: 'special_equipment_expiry',
  dedicated_equipment_validity_date: 'special_equipment_expiry',
  lifting_reminder_date: 'repeat_inspection_date',
  manager_reminder_date: 'next_inspection_date',
  accessories_validity: 'inspections_certificates',
  accessories_validity_date: 'inspections_certificates',
  location_assignment: 'work_site',
  work_area: 'department',
  alert_status: 'service_status',
};

const dbColumns = new Set([
  'id','license_plate','manufacturer','model','year','vehicle_type','odometer','company_name',
  'assigned_driver_id','test_expiry','insurance_expiry','comprehensive_insurance_expiry','notes',
  'status','created_at','updated_at','created_by','insurance_start','comprehensive_insurance_start',
  'next_service_date','last_service_date','needs_transport','approval_status','license_doc_url',
  'insurance_doc_url','comprehensive_insurance_doc_url','is_leasing','leasing_end_date','insurance_cost',
  'has_no_claims','management_type','monthly_leasing_cost','vehicle_return_date','monthly_loan_payment',
  'loan_end_date','planned_replacement_date','has_loan','internal_number','code','nickname',
  'ownership_type','third_party_insurance_expiry','third_party_insurance_doc_url','next_service_km',
  'insurance_company','insurance_agent','vehicle_images','vin','engine_number','department','work_site',
  'fuel_type','usage_type','segment','manager_report','lifting_report','special_equipment_expiry',
  'last_inspection_date','next_inspection_date','repeat_inspection_date','vehicle_manager',
  'current_location','road_entry_date','sale_date','finance_track','finance_details','loan_details',
  'is_pledged','pledge_details','insurances','inspections_certificates','equipment_type','equipment_details',
  'horsepower','engine_volume','weight_tons','kva','engine_hours','equipment_serial','meter_type',
  'meter_updated_at','next_service_hours','service_type','service_status','service_notes',
  'maintenance_method','maintenance_details','import_source','import_category','import_buffer',
  'import_file_name','import_date','imported_by','import_status','last_test_date','test_status',
]);

const PREFIX_UI = ['coverage_', 'maint_', 'svc_', 'other_'];
const SUFFIX_UI = ['_file', '_file_name', '_link'];

const mappedToColumn = [];
const noDbColumn = [];
const uiNested = [];

for (const field of formFields.sort()) {
  if (PREFIX_UI.some((p) => field.startsWith(p)) || SUFFIX_UI.some((s) => field.endsWith(s))) {
    uiNested.push(field);
    continue;
  }
  let col = EXPLICIT_MAP[field];
  if (col === undefined && dbColumns.has(field)) col = field;
  if (col && dbColumns.has(col)) mappedToColumn.push({ field, column: col });
  else noDbColumn.push(field);
}

const daliaSrc = readFileSync('src/components/vehicles/vehicleNewDalia/VehicleNewFormDalia.tsx', 'utf8');
const saveCallsSupabase = /supabase\.from\(['"]vehicles['"]\)/.test(daliaSrc);

console.log(
  JSON.stringify(
    {
      dbColumnCount: dbColumns.size,
      daliaFormFieldCount: formFields.length,
      mappedToExistingDbColumn: mappedToColumn.length,
      uiNestedOrFileFields: uiNested.length,
      noMatchingDbColumn: noDbColumn.length,
      wiredInSaveVehicle: saveCallsSupabase ? 'partial' : 0,
      saveVehicleUiOnly: !saveCallsSupabase,
      mappedToColumn,
      noDbColumn,
      uiNested,
    },
    null,
    2,
  ),
);
