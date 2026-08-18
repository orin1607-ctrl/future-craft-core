import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { loadVehicleHistory, type VehicleHistoryEntry } from '@/lib/vehicleHistory';
import { normalizePlate as normalizePlateKey } from '@/lib/entityNavContext';
import {
  handoverDateTime,
  isTowingServiceOrder,
  plateFromAlertText,
  vehicleIdFromAlertText,
} from '@/lib/vehicleActionFollowUp';

export type HubTabId =
  | 'tracking'
  | 'faults'
  | 'service'
  | 'accidents'
  | 'inspection'
  | 'alerts'
  | 'docs'
  | 'transfers'
  | 'chat'
  | 'history';

export interface VehicleTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  created_at: string;
}

export interface FaultRow {
  id: string;
  fault_type: string;
  description: string;
  urgency: string;
  status: string;
  date: string | null;
  created_at: string;
  event_number?: string;
  driver_name?: string;
}

export interface ServiceOrderRow {
  id: string;
  service_category: string;
  description: string;
  vendor_name: string | null;
  treatment_status: string;
  date_time: string | null;
  created_at: string;
}

export interface AccidentRow {
  id: string;
  location: string | null;
  description: string;
  status: string | null;
  date: string | null;
  created_at: string;
  event_number?: string;
  driver_name?: string;
}

export interface InspectionRow {
  id: string;
  inspection_type: string;
  inspection_date: string | null;
  overall_status: string | null;
  inspector_name: string | null;
  notes: string | null;
}

export interface HandoverRow {
  id: string;
  action_type: string;
  date_time: string | null;
  giving_driver_name: string | null;
  receiving_driver_name: string | null;
}

/** Driver handover or towing service order — shown in שינועים tab. */
export interface TransferRow {
  id: string;
  kind: 'handover' | 'towing';
  title: string;
  description: string;
  date_time: string | null;
}

export interface VehicleAlertRow {
  id: string;
  title: string;
  alert_date: string;
  daysLeft: number;
}

export interface DocRow {
  id: string;
  ref: string;
  name: string;
  source: string;
  date: string;
  expiry: string;
  url?: string;
}

export interface VehicleHubData {
  history: VehicleHistoryEntry[];
  tasks: VehicleTaskRow[];
  faults: FaultRow[];
  services: ServiceOrderRow[];
  accidents: AccidentRow[];
  inspections: InspectionRow[];
  handovers: HandoverRow[];
  transfers: TransferRow[];
  vehicleAlerts: VehicleAlertRow[];
  docs: DocRow[];
}

function normalizePlate(plate: string) {
  return normalizePlateKey(plate);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * document_versions.entity_id is a uuid column, so filtering it by a license
 * plate makes Postgres reject the whole request (22P02) and every Document Hub
 * file for the vehicle disappears from the card.
 */
function vehicleDocumentVersions(vehicleId?: string) {
  if (!vehicleId || !UUID_PATTERN.test(vehicleId)) {
    return Promise.resolve({ data: [] as Record<string, string>[] });
  }
  return supabase
    .from('document_versions')
    .select('id, public_url, original_name, document_type_key, expiry_date, created_at, file_path, is_current')
    .eq('entity_type', 'vehicle')
    .eq('entity_id', vehicleId)
    .eq('is_current', true)
    .order('created_at', { ascending: false });
}

function byPlate(table: string, plate: string, companyFilter: string | null) {
  const norm = normalizePlate(plate);
  const q = norm !== plate
    ? supabase.from(table).select('*').or(`vehicle_plate.eq.${plate},vehicle_plate.eq.${norm}`)
    : supabase.from(table).select('*').eq('vehicle_plate', plate);
  return applyCompanyScope(q, companyFilter);
}

export async function loadVehicleHubData(
  plate: string,
  internalNumber: string,
  companyFilter: string | null,
  vehicleDocs: {
    license_doc_url?: string | null;
    insurance_doc_url?: string | null;
    comprehensive_insurance_doc_url?: string | null;
    third_party_insurance_doc_url?: string | null;
    test_expiry?: string | null;
    insurance_expiry?: string | null;
    comprehensive_insurance_expiry?: string | null;
    third_party_insurance_expiry?: string | null;
  },
  vehicleId?: string,
): Promise<VehicleHubData> {
  const [history, tasksRes, faultsRes, servicesRes, accidentsRes, inspectionsRes, handoversRes, docsRes, alertsRes, versionsRes] =
    await Promise.all([
      loadVehicleHistory(plate, internalNumber, companyFilter),
      byPlate('vehicle_tasks', plate, companyFilter).order('created_at', { ascending: false }),
      byPlate('faults', plate, companyFilter).order('created_at', { ascending: false }),
      byPlate('service_orders', plate, companyFilter).order('created_at', { ascending: false }),
      byPlate('accidents', plate, companyFilter).order('created_at', { ascending: false }),
      byPlate('vehicle_inspections', plate, companyFilter).order('inspection_date', { ascending: false }),
      byPlate('vehicle_handovers', plate, companyFilter).order('date_time', { ascending: false }),
      applyCompanyScope(
        supabase
          .from('document_metadata')
          .select('*')
          .or(`vehicle_plate.eq.${plate},vehicle_plate.eq.${normalizePlate(plate)}`)
          .order('created_at', { ascending: false }),
        companyFilter,
      ),
      applyCompanyScope(
        supabase
          .from('custom_alerts')
          .select('id, title, description, alert_date, is_active')
          .eq('is_active', true)
          .order('alert_date', { ascending: true }),
        companyFilter,
      ),
      vehicleDocumentVersions(vehicleId),
    ]);

  const tasks: VehicleTaskRow[] = (tasksRes.data || []).map((t: Record<string, string>) => ({
    id: t.id,
    title: t.title || 'ליקוי',
    description: t.description,
    status: t.status,
    created_at: t.created_at,
  }));

  const faults: FaultRow[] = (faultsRes.data || []).map((f: Record<string, string>) => ({
    id: f.id,
    fault_type: f.fault_type || 'תקלה',
    description: f.description || '',
    urgency: f.urgency || 'normal',
    status: f.status || '',
    date: f.date,
    created_at: f.created_at,
    event_number: f.event_number || f.serial_id || '',
    driver_name: f.driver_name || '',
  }));

  const services: ServiceOrderRow[] = (servicesRes.data || []).map((s: Record<string, string>) => ({
    id: s.id,
    service_category: s.service_category || 'שירות',
    description: s.description || '',
    vendor_name: s.vendor_name,
    treatment_status: s.treatment_status || '',
    date_time: s.date_time,
    created_at: s.created_at,
  }));

  const accidents: AccidentRow[] = (accidentsRes.data || []).map((a: Record<string, string>) => ({
    id: a.id,
    location: a.location,
    description: a.description || '',
    status: a.status,
    date: a.date,
    created_at: a.created_at,
    event_number: a.event_number || '',
    driver_name: a.driver_name || '',
  }));

  const inspections: InspectionRow[] = (inspectionsRes.data || []).map((i: Record<string, string>) => ({
    id: i.id,
    inspection_type: i.inspection_type || '',
    inspection_date: i.inspection_date,
    overall_status: i.overall_status,
    inspector_name: i.inspector_name,
    notes: i.notes,
  }));

  const handovers: HandoverRow[] = (handoversRes.data || []).map((h: Record<string, string>) => ({
    id: h.id,
    action_type: h.action_type || '',
    date_time: h.date_time || handoverDateTime(h),
    giving_driver_name: h.giving_driver_name,
    receiving_driver_name: h.receiving_driver_name,
  }));

  const transfers: TransferRow[] = [];

  handovers.forEach((h) => {
    transfers.push({
      id: `handover-${h.id}`,
      kind: 'handover',
      title: h.action_type === 'return' ? 'החזרת רכב' : 'מסירת רכב',
      description: `${h.giving_driver_name || '—'} → ${h.receiving_driver_name || '—'}`,
      date_time: h.date_time,
    });
  });

  (servicesRes.data || []).forEach((s: Record<string, string>) => {
    if (!isTowingServiceOrder(s)) return;
    transfers.push({
      id: `towing-${s.id}`,
      kind: 'towing',
      title: s.service_category || 'שינוע',
      description: s.description || '',
      date_time: s.service_date || s.date_time || s.created_at,
    });
  });

  transfers.sort(
    (a, b) => new Date(b.date_time || 0).getTime() - new Date(a.date_time || 0).getTime(),
  );

  const now = Date.now();
  const vehicleAlerts: VehicleAlertRow[] = (alertsRes.data || [])
    .filter((a: Record<string, string>) => {
      const blob = `${a.title || ''}\n${a.description || ''}`;
      const p = plateFromAlertText(blob);
      const vid = vehicleIdFromAlertText(blob);
      if (vehicleId && vid && vid === vehicleId) return true;
      if (p) return normalizePlate(p) === normalizePlate(plate);
      return false;
    })
    .map((a: Record<string, string>) => {
      const alertDate = a.alert_date || '';
      const daysLeft = alertDate
        ? Math.ceil((new Date(alertDate).getTime() - now) / 86400000)
        : 0;
      return {
        id: a.id,
        title: a.title || 'התראה',
        alert_date: alertDate,
        daysLeft,
      };
    });

  const docs: DocRow[] = [];
  const metadataRows = (docsRes.data || []) as Record<string, string>[];
  const metadataCategoriesWithFile = new Set(
    metadataRows.filter((d) => d.file_path || d.public_url).map((d) => d.category),
  );

  const pushUrlDoc = (
    id: string,
    category: string,
    ref: string,
    name: string,
    url: string | null | undefined,
    expiry: string | null | undefined,
  ) => {
    if (!url?.trim()) return;
    if (metadataCategoriesWithFile.has(category)) return;
    docs.push({
      id,
      ref,
      name,
      source: 'רשמי',
      date: '—',
      expiry: expiry ? new Date(expiry).toLocaleDateString('he-IL') : '—',
      url,
    });
  };

  pushUrlDoc('license', 'vehicle-license', 'רישיון', 'רישיון רכב', vehicleDocs.license_doc_url, vehicleDocs.test_expiry);
  pushUrlDoc('insurance', 'insurance', 'ביטוח', 'פוליסת ביטוח חובה', vehicleDocs.insurance_doc_url, vehicleDocs.insurance_expiry);
  pushUrlDoc(
    'comprehensive',
    'comprehensive',
    'מקיף',
    'פוליסת ביטוח מקיף',
    vehicleDocs.comprehensive_insurance_doc_url,
    vehicleDocs.comprehensive_insurance_expiry,
  );
  pushUrlDoc(
    'third-party',
    'third-party',
    'צד ג׳',
    'פוליסת ביטוח צד ג׳',
    vehicleDocs.third_party_insurance_doc_url,
    vehicleDocs.third_party_insurance_expiry,
  );

  metadataRows.forEach((d: Record<string, string>, idx: number) => {
    const url = d.file_path || '';
    docs.push({
      id: d.id,
      ref: `REF-${String(idx + 1).padStart(3, '0')}`,
      name: d.original_name || 'מסמך',
      source: d.category || 'מערכת',
      date: d.created_at ? new Date(d.created_at).toLocaleDateString('he-IL') : '—',
      expiry: '—',
      url,
    });
  });

  const seenUrls = new Set(docs.map((d) => d.url).filter(Boolean) as string[]);
  const seenPaths = new Set(metadataRows.map((d) => d.file_path).filter(Boolean));
  (versionsRes.data || []).forEach((ver: Record<string, string>, idx: number) => {
    const url = ver.file_path || ver.public_url || '';
    if (url && seenUrls.has(url)) return;
    if (ver.file_path && seenPaths.has(ver.file_path)) return;
    if (url) seenUrls.add(url);
    if (ver.file_path) seenPaths.add(ver.file_path);
    const typeLabel =
      ver.document_type_key === 'vehicle_license' || ver.document_type_key === 'license'
        ? 'רישיון רכב'
        : ver.document_type_key === 'insurance' ||
            ver.document_type_key === 'vehicle_insurance' ||
            ver.document_type_key === 'mandatory_insurance'
          ? 'ביטוח רכב'
          : ver.original_name || ver.document_type_key || 'מסמך';
    docs.push({
      id: ver.id || `ver-${idx}`,
      ref: `HUB-${String(idx + 1).padStart(3, '0')}`,
      name: typeLabel,
      source: ver.document_type_key || 'מערכת',
      date: ver.created_at ? new Date(ver.created_at).toLocaleDateString('he-IL') : '—',
      expiry: ver.expiry_date ? new Date(ver.expiry_date).toLocaleDateString('he-IL') : '—',
      url: url || undefined,
    });
  });

  return {
    history,
    tasks,
    faults,
    services,
    accidents,
    inspections,
    handovers,
    transfers,
    vehicleAlerts,
    docs,
  };
}

export function formatHubDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function statusBadgeClass(status: string) {
  const s = (status || '').toLowerCase();
  if (['הושלם', 'closed', 'passed', 'resolved', 'טופל'].some((x) => s.includes(x))) {
    return 'status-active';
  }
  if (['בטיפול', 'in_progress', 'in_service', 'treating', 'pending_approval'].some((x) => s.includes(x))) {
    return 'status-pending';
  }
  if (['דחוף', 'urgent', 'critical', 'failed', 'open', 'opened', 'new'].some((x) => s.includes(x))) {
    return 'status-inactive';
  }
  return 'bg-muted text-muted-foreground';
}
