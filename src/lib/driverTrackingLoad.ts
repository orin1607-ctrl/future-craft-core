import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { fetchCompanySettings } from '@/lib/companySettings';
import { applyExcludeArchivedVehicles } from '@/lib/vehicleArchive';
import {
  thresholdsFromCompanySettings,
  type CompanyAlertThresholds,
} from '@/lib/vehicleTrackingAlerts';
import {
  assembleDriverTrackingRows,
  type DriverAccidentSource,
  type DriverAssignmentSource,
  type DriverDeclarationSource,
  type DriverDocumentRequestSource,
  type DriverDocumentSource,
  type DriverExamSource,
  type DriverHealthSource,
  type DriverPracticalExamSource,
  type DriverSource,
  type DriverTrackingRow,
  type DriverVehicleSource,
} from '@/lib/driverTrackingData';

const CHUNK = 80;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || /does not exist|schema cache|could not find/i.test(error.message || '');
}

async function loadThresholds(companyNames: string[]): Promise<Map<string, CompanyAlertThresholds>> {
  const map = new Map<string, CompanyAlertThresholds>();
  await Promise.all(companyNames.map(async (name) => {
    const settings = await fetchCompanySettings(name);
    map.set(name, thresholdsFromCompanySettings(settings));
  }));
  return map;
}

async function loadLoose<T>(
  table: string,
  select: string,
  companyFilter: string | null,
  driverIds: string[],
  idColumn: 'driver_id' | 'entity_id' | 'assigned_driver_id',
  extra?: (query: any) => any,
): Promise<T[]> {
  const rows: T[] = [];
  for (const ids of chunk(driverIds, CHUNK)) {
    let query = (supabase as unknown as { from: (name: string) => any })
      .from(table)
      .select(select)
      .in(idColumn, ids);
    if (extra) query = extra(query);
    query = applyCompanyScope(query, companyFilter);
    const { data, error } = await query;
    if (missingTable(error)) return rows;
    if (error) throw error;
    rows.push(...((data || []) as T[]));
  }
  return rows;
}

async function loadLabels(): Promise<Record<string, string>> {
  const query = (supabase as unknown as { from: (name: string) => any })
    .from('document_type_defs')
    .select('key, label_he');
  const { data, error } = await query;
  if (error) return {};
  const labels: Record<string, string> = {};
  for (const row of data || []) {
    if (row.key && row.label_he) labels[row.key] = row.label_he;
  }
  return labels;
}

/**
 * Read-only fleet load. Accidents are not queried: the accidents table has no driver id,
 * and a matching name is not an unambiguous link.
 */
export async function loadDriverTrackingRows(companyFilter: string | null): Promise<DriverTrackingRow[]> {
  const driversRes = await applyCompanyScope(
    supabase
      .from('drivers')
      .select('id, full_name, id_number, phone, department, company_name, status, license_number, license_types, license_expiry, exam_expiry, last_exam_date')
      .order('full_name'),
    companyFilter,
  );
  if (driversRes.error) throw driversRes.error;

  const drivers = ((driversRes.data || []) as DriverSource[]).filter(
    (d) => (d.status || '').trim().toLowerCase() !== 'archived',
  );
  if (drivers.length === 0) return [];

  const ids = drivers.map((d) => d.id);
  const companies = [...new Set(drivers.map((d) => d.company_name).filter(Boolean))] as string[];

  const [vehicles, exams, practicalExams, healthDeclarations, declarations, assignments, documents, documentRequests, labels, thresholdsByCompany] = await Promise.all([
    loadLoose<DriverVehicleSource>(
      'vehicles',
      'id, license_plate, assigned_driver_id, company_name, status',
      companyFilter,
      ids,
      'assigned_driver_id',
      (query) => applyExcludeArchivedVehicles(query),
    ),
    loadLoose<DriverExamSource>(
      'driving_exams',
      'id, driver_id, company_name, exam_type, status, passed, completed_at, created_at, expires_at, score',
      companyFilter,
      ids,
      'driver_id',
    ),
    loadLoose<DriverPracticalExamSource>(
      'practical_driving_exams',
      'id, driver_id, company_name, exam_date, status, passed, examiner_name, notes, created_at, vehicle_plate',
      companyFilter,
      ids,
      'driver_id',
    ),
    loadLoose<DriverHealthSource>(
      'driver_health_declarations',
      'id, driver_id, company_name, declaration_date, created_at',
      companyFilter,
      ids,
      'driver_id',
    ),
    loadLoose<DriverDeclarationSource>(
      'driver_declarations',
      'id, driver_id, company_name, status, created_at, signed_at, expires_at, pdf_url',
      companyFilter,
      ids,
      'driver_id',
    ),
    loadLoose<DriverAssignmentSource>(
      'work_assignments',
      'id, driver_id, company_name, title, description, status, scheduled_date, created_at',
      companyFilter,
      ids,
      'driver_id',
    ),
    loadLoose<DriverDocumentSource>(
      'document_versions',
      'id, entity_id, company_name, document_type_key, expiry_date, created_at, is_current, original_name, public_url',
      companyFilter,
      ids,
      'entity_id',
      (query) => query.eq('entity_type', 'driver').eq('is_current', true),
    ),
    loadLoose<DriverDocumentRequestSource>(
      'document_requests',
      'id, entity_id, company_name, document_type_key, status, created_at, token_expires_at, requested_by_name',
      companyFilter,
      ids,
      'entity_id',
      (query) => query.eq('entity_type', 'driver'),
    ),
    loadLabels(),
    loadThresholds(companies),
  ]);

  const accidents: DriverAccidentSource[] = [];

  return assembleDriverTrackingRows({
    drivers,
    vehicles,
    exams,
    practicalExams,
    healthDeclarations,
    declarations,
    assignments,
    documents,
    documentRequests,
    accidents,
    labels,
    thresholdsByCompany,
  });
}
