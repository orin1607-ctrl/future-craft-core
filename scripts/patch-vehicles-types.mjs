/**
 * Patch src/integrations/supabase/types.ts vehicles table to match dalia-staging (98 cols).
 */
import { readFileSync, writeFileSync } from 'fs';

const cols = [
  ['id', 'string'],
  ['license_plate', 'string'],
  ['internal_number', 'string | null'],
  ['manufacturer', 'string | null'],
  ['model', 'string | null'],
  ['year', 'number | null'],
  ['vehicle_type', 'string | null'],
  ['nickname', 'string | null'],
  ['code', 'string | null'],
  ['vin', 'string | null'],
  ['engine_number', 'string | null'],
  ['fuel_type', 'string | null'],
  ['vehicle_color', 'string | null'],
  ['ownership_type', 'string | null'],
  ['segment', 'string | null'],
  ['road_entry_date', 'string | null'],
  ['last_test_date', 'string | null'],
  ['test_expiry', 'string | null'],
  ['test_status', 'string | null'],
  ['odometer', 'number | null'],
  ['department', 'string | null'],
  ['work_site', 'string | null'],
  ['usage_type', 'string | null'],
  ['current_location', 'string | null'],
  ['vehicle_manager', 'string | null'],
  ['status', 'string | null'],
  ['company_name', 'string | null'],
  ['assigned_driver_id', 'string | null'],
  ['last_service_date', 'string | null'],
  ['next_service_date', 'string | null'],
  ['next_service_km', 'number | null'],
  ['maintenance_method', 'string | null'],
  ['maintenance_details', 'string | null'],
  ['service_type', 'string | null'],
  ['service_status', 'string | null'],
  ['service_notes', 'string | null'],
  ['last_inspection_date', 'string | null'],
  ['next_inspection_date', 'string | null'],
  ['repeat_inspection_date', 'string | null'],
  ['sale_date', 'string | null'],
  ['end_or_scrap_date', 'string | null'],
  ['horsepower', 'number | null'],
  ['engine_volume', 'number | null'],
  ['weight_tons', 'number | null'],
  ['kva', 'number | null'],
  ['engine_hours', 'number | null'],
  ['next_service_hours', 'number | null'],
  ['equipment_serial', 'string | null'],
  ['meter_type', 'string | null'],
  ['meter_updated_at', 'string | null'],
  ['equipment_type', 'string | null'],
  ['equipment_details', 'string | null'],
  ['special_equipment_expiry', 'string | null'],
  ['inspections_certificates', 'string | null'],
  ['manager_report', 'string | null'],
  ['lifting_report', 'string | null'],
  ['finance_track', 'string | null'],
  ['finance_details', 'string | null'],
  ['loan_details', 'string | null'],
  ['is_pledged', 'boolean | null'],
  ['pledge_details', 'string | null'],
  ['insurances', 'string | null'],
  ['license_doc_url', 'string | null'],
  ['insurance_doc_url', 'string | null'],
  ['comprehensive_insurance_doc_url', 'string | null'],
  ['third_party_insurance_doc_url', 'string | null'],
  ['insurance_start', 'string | null'],
  ['insurance_expiry', 'string | null'],
  ['insurance_cost', 'number | null'],
  ['insurance_company', 'string | null'],
  ['insurance_agent', 'string | null'],
  ['comprehensive_insurance_start', 'string | null'],
  ['comprehensive_insurance_expiry', 'string | null'],
  ['third_party_insurance_expiry', 'string | null'],
  ['has_no_claims', 'boolean | null'],
  ['is_leasing', 'boolean | null'],
  ['leasing_end_date', 'string | null'],
  ['monthly_leasing_cost', 'number | null'],
  ['has_loan', 'boolean | null'],
  ['loan_end_date', 'string | null'],
  ['monthly_loan_payment', 'number | null'],
  ['vehicle_return_date', 'string | null'],
  ['planned_replacement_date', 'string | null'],
  ['management_type', 'string | null'],
  ['needs_transport', 'boolean | null'],
  ['approval_status', 'string | null'],
  ['vehicle_images', 'string | null'],
  ['notes', 'string | null'],
  ['import_source', 'string | null'],
  ['import_category', 'string | null'],
  ['import_buffer', 'string | null'],
  ['import_file_name', 'string | null'],
  ['import_date', 'string | null'],
  ['imported_by', 'string | null'],
  ['import_status', 'string | null'],
  ['created_at', 'string | null'],
  ['updated_at', 'string | null'],
  ['created_by', 'string | null'],
];

function block(kind) {
  return cols
    .map(([name, type]) => {
      if (kind === 'Row') return `          ${name}: ${type}`;
      const req = kind === 'Insert' && name === 'license_plate' ? '' : '?';
      return `          ${name}${req}: ${type}`;
    })
    .join('\n');
}

const path = 'src/integrations/supabase/types.ts';
let src = readFileSync(path, 'utf8');
const re = /      vehicles: \{\s*Row: \{[\s\S]*?Relationships: \[\]\s*\}/;
const replacement = `      vehicles: {
        Row: {
${block('Row')}
        }
        Insert: {
${block('Insert')}
        }
        Update: {
${block('Insert')}
        }
        Relationships: []
      }`;
if (!re.test(src)) {
  console.error('vehicles block not found');
  process.exit(1);
}
src = src.replace(re, replacement);
writeFileSync(path, src);
console.log('Patched vehicles types:', cols.length, 'columns');
