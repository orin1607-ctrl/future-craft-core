import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { loadVehicleHistory, type VehicleHistoryEntry } from '@/lib/vehicleHistory';

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
  docs: DocRow[];
}

function byPlate(table: string, plate: string, companyFilter: string | null) {
  return applyCompanyScope(supabase.from(table).select('*').eq('vehicle_plate', plate), companyFilter);
}

export async function loadVehicleHubData(
  plate: string,
  internalNumber: string,
  companyFilter: string | null,
  vehicleDocs: {
    license_doc_url?: string | null;
    insurance_doc_url?: string | null;
    comprehensive_insurance_doc_url?: string | null;
    test_expiry?: string | null;
    insurance_expiry?: string | null;
    comprehensive_insurance_expiry?: string | null;
  },
): Promise<VehicleHubData> {
  const [history, tasksRes, faultsRes, servicesRes, accidentsRes, inspectionsRes, handoversRes, docsRes] =
    await Promise.all([
      loadVehicleHistory(plate, internalNumber, companyFilter),
      byPlate('vehicle_tasks', plate, companyFilter).order('created_at', { ascending: false }),
      byPlate('faults', plate, companyFilter).order('created_at', { ascending: false }),
      byPlate('service_orders', plate, companyFilter).order('created_at', { ascending: false }),
      byPlate('accidents', plate, companyFilter).order('created_at', { ascending: false }),
      byPlate('vehicle_inspections', plate, companyFilter).order('inspection_date', { ascending: false }),
      byPlate('vehicle_handovers', plate, companyFilter).order('date_time', { ascending: false }),
      applyCompanyScope(
        supabase.from('document_metadata').select('*').eq('vehicle_plate', plate).order('created_at', { ascending: false }),
        companyFilter,
      ),
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
    date_time: h.date_time,
    giving_driver_name: h.giving_driver_name,
    receiving_driver_name: h.receiving_driver_name,
  }));

  const docs: DocRow[] = [];

  if (vehicleDocs.license_doc_url) {
    docs.push({
      id: 'license',
      ref: 'רישיון',
      name: 'רישיון רכב',
      source: 'רשמי',
      date: '—',
      expiry: vehicleDocs.test_expiry
        ? new Date(vehicleDocs.test_expiry).toLocaleDateString('he-IL')
        : '—',
      url: vehicleDocs.license_doc_url,
    });
  }
  if (vehicleDocs.insurance_doc_url) {
    docs.push({
      id: 'insurance',
      ref: 'ביטוח',
      name: 'פוליסת ביטוח חובה',
      source: 'ביטוח',
      date: '—',
      expiry: vehicleDocs.insurance_expiry
        ? new Date(vehicleDocs.insurance_expiry).toLocaleDateString('he-IL')
        : '—',
      url: vehicleDocs.insurance_doc_url,
    });
  }
  if (vehicleDocs.comprehensive_insurance_doc_url) {
    docs.push({
      id: 'comprehensive',
      ref: 'מקיף',
      name: 'פוליסת ביטוח מקיף',
      source: 'ביטוח',
      date: '—',
      expiry: vehicleDocs.comprehensive_insurance_expiry
        ? new Date(vehicleDocs.comprehensive_insurance_expiry).toLocaleDateString('he-IL')
        : '—',
      url: vehicleDocs.comprehensive_insurance_doc_url,
    });
  }

  (docsRes.data || []).forEach((d: Record<string, string>, idx: number) => {
    const { data: pub } = supabase.storage.from('documents').getPublicUrl(d.file_path);
    docs.push({
      id: d.id,
      ref: `REF-${String(idx + 1).padStart(3, '0')}`,
      name: d.original_name || 'מסמך',
      source: d.category || 'מערכת',
      date: d.created_at ? new Date(d.created_at).toLocaleDateString('he-IL') : '—',
      expiry: '—',
      url: pub.publicUrl,
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
