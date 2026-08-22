import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { statusLabel } from '@/components/vehicles/vehicleHubUtils';
import { isHistoryLogTask, isCustomGapTask } from '@/lib/vehicleEventLog';
import { loadVehicleHistory, type VehicleHistoryEntry } from '@/lib/vehicleHistory';
import { fetchCompanySettings } from '@/lib/companySettings';
import {
  buildVehicleTrackingAlerts,
  type TrackingAlertItem,
  type TrackingAlertKind,
  vehicleHasTrackingAlerts,
  thresholdsFromCompanySettings,
  type CompanyAlertThresholds,
  DEFAULT_ALERT_THRESHOLDS,
  gapTitleFromTask,
  type TrackingOpenEntity,
} from '@/lib/vehicleTrackingAlerts';
import { isInsuranceAlertsEnabled } from '@/lib/vehicleInsuranceAlerts';
import { applyExcludeArchivedVehicles } from '@/lib/vehicleArchive';
import { calendarDaysLeft } from '@/lib/expiryOfficerApproval';

export type { TrackingAlertItem, TrackingAlertKind };

/** Include form default `opened` so new faults appear immediately in מעקב רכבים → תקלות */
const OPEN_FAULT = [
  'new',
  'open',
  'opened',
  'in_progress',
  'in_treatment',
  'pending',
  'pending_approval',
  'approved',
  'referred_to_provider',
  'towing_done',
  'חדש',
  'פתוח',
  'בטיפול',
];
const OPEN_TASK = ['open', 'in_progress', 'pending', 'פתוח', 'בטיפול'];
const OPEN_ACCIDENT = ['open', 'new', 'opened', 'in_progress', 'פתוח', 'חדש', 'בטיפול'];
const OPEN_SERVICE = ['new', 'open', 'in_progress', 'pending', 'pending_approval', 'חדש', 'פתוח', 'בטיפול'];
const GARAGE_STATUS = ['in_service', 'maintenance', 'בתחזוקה', 'בטיפול'];

export interface TrackingVehicleRow {
  id: string;
  license_plate: string;
  internal_number: string;
  company_name: string;
  department: string | null;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  driver_name: string | null;
  status: string;
  status_text: string;
  current_location: string | null;
  odometer: number;
  service_status: string | null;
  in_garage: boolean;
  days_in_garage: number;
  has_open_fault: boolean;
  has_open_defect: boolean;
  has_open_accident: boolean;
  has_open_alert: boolean;
  has_active_service: boolean;
  has_active_transport: boolean;
  test_expiry: string | null;
  insurance_expiry: string | null;
  insurance_alerts_enabled: boolean;
  insurance_alerts_red_enabled: boolean;
  alert_items: TrackingAlertItem[];
  alert_kinds: TrackingAlertKind[];
}

export type SummaryFilterKey =
  | 'total'
  | 'attention'
  | 'active'
  | 'service'
  | 'transport'
  | 'accident'
  | 'defect'
  | 'fault'
  | 'alert'
  | 'garage'
  | 'disabled'
  | 'nodriver'
  | 'testSoon'
  | 'insSoon'
  | 'km';

export interface TrackingFilters {
  plate: string;
  internal: string;
  company: string;
  department: string;
  manufacturer: string;
  status: string;
  minKm: number;
  driver: string;
  garage: boolean;
  fault: boolean;
  defect: boolean;
  accident: boolean;
  alert: boolean;
  transport: boolean;
  nodriver: boolean;
  testSoon: boolean;
  insSoon: boolean;
  alertKind: TrackingAlertKind | '';
}

export const EMPTY_TRACKING_FILTERS: TrackingFilters = {
  plate: '',
  internal: '',
  company: '',
  department: '',
  manufacturer: '',
  status: '',
  minKm: 0,
  driver: '',
  garage: false,
  fault: false,
  defect: false,
  accident: false,
  alert: false,
  transport: false,
  nodriver: false,
  testSoon: false,
  insSoon: false,
  alertKind: '',
};

function normPlate(p: string) {
  return p.replace(/[-\s]/g, '').toUpperCase();
}

function isOpen(list: string[], status: string | null | undefined) {
  const s = (status || '').toLowerCase();
  return list.includes(s) || list.includes(status || '');
}

async function loadCompanyThresholdsMap(
  companyNames: string[],
): Promise<Map<string, CompanyAlertThresholds>> {
  const map = new Map<string, CompanyAlertThresholds>();
  await Promise.all(
    companyNames.map(async (name) => {
      const settings = await fetchCompanySettings(name);
      map.set(name, thresholdsFromCompanySettings(settings));
    }),
  );
  return map;
}

function compactExpiryReason(
  subject: 'טסט' | 'ביטוח',
  date: string | null,
  item: TrackingAlertItem,
): string {
  const days = calendarDaysLeft(date);
  if (days !== null && days < 0) return `${subject} פג תוקף`;
  if (days !== null && days >= 0) {
    return subject === 'טסט' ? 'טסט בחודש הקרוב' : 'ביטוח מתקרב';
  }
  if (/פג לפני|פג תוקף/.test(`${item.label} ${item.detail}`)) return `${subject} פג תוקף`;
  return subject === 'טסט' ? 'טסט בחודש הקרוב' : 'ביטוח מתקרב';
}

function reasonFromOperationalItem(item: TrackingAlertItem, v: TrackingVehicleRow): string | null {
  switch (item.kind) {
    case 'license':
      return null;
    case 'test':
      return compactExpiryReason('טסט', v.test_expiry, item);
    case 'insurance':
      return compactExpiryReason('ביטוח', v.insurance_expiry, item);
    case 'document':
      return item.detail || 'מסמך חסר';
    case 'fault':
      return 'תקלה פתוחה';
    case 'defect':
      return 'ליקוי פתוח';
    case 'accident':
      return 'תאונה פתוחה';
    case 'transport':
      return 'שינוע פעיל';
    case 'service':
      return /תקופ/.test(`${item.label} ${item.detail}`) ? 'טיפול תקופתי' : 'טיפול פעיל';
    case 'gap':
      return item.detail ? `חוסר · ${item.detail}` : 'חוסר';
    default:
      return item.label;
  }
}

/** Same source of truth as the "דרוש טיפול" counter — one compact reason per cause. */
export function trackingAttentionReasons(v: TrackingVehicleRow): string[] {
  const reasons: string[] = [];
  const seen = new Set<string>();
  const add = (label: string | null | undefined) => {
    const t = (label || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    reasons.push(t);
  };

  for (const item of v.alert_items || []) {
    add(reasonFromOperationalItem(item, v));
  }

  if (v.has_open_fault) add('תקלה פתוחה');
  if (v.has_open_defect) add('ליקוי פתוח');
  if (v.has_open_accident) add('תאונה פתוחה');
  if (v.has_active_service) add('טיפול פעיל');
  if (v.in_garage) add('במוסך');

  return reasons;
}

export function vehicleNeedsTrackingAttention(v: TrackingVehicleRow): boolean {
  return trackingAttentionReasons(v).length > 0;
}

export async function countTrackingAttention(companyFilter: string | null): Promise<number> {
  const rows = await loadFleetTrackingRows(companyFilter);
  return rows.filter(vehicleNeedsTrackingAttention).length;
}

export async function loadFleetTrackingRows(companyFilter: string | null): Promise<TrackingVehicleRow[]> {
  const vehiclesRes = await applyCompanyScope(
    applyExcludeArchivedVehicles(
      supabase
        .from('vehicles')
        .select(
          'id, license_plate, internal_number, company_name, department, manufacturer, model, year, status, current_location, odometer, service_status, assigned_driver_id, needs_transport, test_expiry, insurance_expiry, license_doc_url, insurance_alerts_enabled, insurance_alerts_red_enabled',
        )
        .order('license_plate'),
    ),
    companyFilter,
  );

  const vehicles = vehiclesRes.data || [];
  if (vehicles.length === 0) return [];

  const companyNames = [...new Set(vehicles.map((v) => v.company_name).filter(Boolean))] as string[];
  const thresholdsMap = await loadCompanyThresholdsMap(companyNames);

  const driverIds = [...new Set(vehicles.map((v) => v.assigned_driver_id).filter(Boolean))] as string[];
  const driverMap = new Map<string, string>();

  if (driverIds.length > 0) {
    const { data: drivers } = await supabase.from('drivers').select('id, full_name').in('id', driverIds);
    (drivers || []).forEach((d) => driverMap.set(d.id, d.full_name));
  }

function pushEntity(map: Map<string, TrackingOpenEntity[]>, plate: string | null | undefined, entity: TrackingOpenEntity) {
  if (!plate) return;
  const key = normPlate(plate);
  const list = map.get(key) || [];
  list.push(entity);
  map.set(key, list);
}

  const [faultsRes, tasksRes, accidentsRes, servicesRes] = await Promise.all([
    applyCompanyScope(
      supabase.from('faults').select('id, vehicle_plate, status, fault_type, description'),
      companyFilter,
    ),
    applyCompanyScope(
      supabase.from('vehicle_tasks').select('id, vehicle_plate, status, title, description, created_at'),
      companyFilter,
    ),
    applyCompanyScope(
      supabase.from('accidents').select('id, vehicle_plate, status, description, date'),
      companyFilter,
    ),
    applyCompanyScope(
      supabase
        .from('service_orders')
        .select('id, vehicle_plate, treatment_status, created_at, service_category, description'),
      companyFilter,
    ),
  ]);

  const faultsByPlate = new Map<string, TrackingOpenEntity[]>();
  const defectsByPlate = new Map<string, TrackingOpenEntity[]>();
  const gapsByPlate = new Map<string, TrackingOpenEntity[]>();
  const accidentsByPlate = new Map<string, TrackingOpenEntity[]>();
  const servicesByPlate = new Map<string, TrackingOpenEntity[]>();

  (faultsRes.data || []).forEach((f) => {
    if (!f.vehicle_plate || !isOpen(OPEN_FAULT, f.status)) return;
    pushEntity(faultsByPlate, f.vehicle_plate, {
      id: f.id,
      title: f.fault_type || 'תקלה',
      detail: f.description || 'תקלה פתוחה',
    });
  });

  (tasksRes.data || []).forEach((t) => {
    if (!t.vehicle_plate || isHistoryLogTask(t)) return;
    if (isCustomGapTask(t)) {
      if (!isOpen(OPEN_TASK, t.status)) return;
      pushEntity(gapsByPlate, t.vehicle_plate, {
        id: t.id,
        title: gapTitleFromTask(t.title),
        detail: t.description || 'חוסר פתוח',
      });
      return;
    }
    if (!isOpen(OPEN_TASK, t.status)) return;
    pushEntity(defectsByPlate, t.vehicle_plate, {
      id: t.id,
      title: t.title || 'ליקוי',
      detail: t.description || 'ליקוי פתוח',
    });
  });

  (accidentsRes.data || []).forEach((a) => {
    if (!a.vehicle_plate || !isOpen(OPEN_ACCIDENT, a.status)) return;
    pushEntity(accidentsByPlate, a.vehicle_plate, {
      id: a.id,
      title: 'תאונה',
      detail: a.description || 'תאונה בטיפול',
    });
  });

  const serviceByPlate = new Map<string, { active: boolean; oldest: string | null }>();
  (servicesRes.data || []).forEach((s) => {
    if (!s.vehicle_plate) return;
    const key = normPlate(s.vehicle_plate);
    const active = isOpen(OPEN_SERVICE, s.treatment_status);
    if (active) {
      pushEntity(servicesByPlate, s.vehicle_plate, {
        id: s.id,
        title: s.service_category || 'טיפול',
        detail: s.description || s.service_category || 'טיפול פעיל',
      });
    }
    const prev = serviceByPlate.get(key);
    if (!prev) {
      serviceByPlate.set(key, { active, oldest: s.created_at });
    } else {
      serviceByPlate.set(key, {
        active: prev.active || active,
        oldest:
          prev.oldest && s.created_at && prev.oldest < s.created_at ? prev.oldest : s.created_at || prev.oldest,
      });
    }
  });

  return vehicles.map((v) => {
    const plateKey = normPlate(v.license_plate || '');
    const svc = serviceByPlate.get(plateKey);
    const has_active_service = !!svc?.active || isOpen(OPEN_SERVICE, v.service_status);
    const in_garage =
      GARAGE_STATUS.includes((v.status || '').toLowerCase()) ||
      GARAGE_STATUS.includes(v.status || '') ||
      has_active_service;
    let days_in_garage = 0;
    if (in_garage && svc?.oldest) {
      days_in_garage = Math.max(
        0,
        Math.floor((Date.now() - new Date(svc.oldest).getTime()) / 86400000),
      );
    }

    const openFaults = faultsByPlate.get(plateKey) || [];
    const openDefects = defectsByPlate.get(plateKey) || [];
    const openAccidents = accidentsByPlate.get(plateKey) || [];
    const openServices = servicesByPlate.get(plateKey) || [];
    const customGaps = gapsByPlate.get(plateKey) || [];
    const has_open_fault = openFaults.length > 0;
    const has_open_defect = openDefects.length > 0;
    const has_open_accident = openAccidents.length > 0;
    const thresholds = thresholdsMap.get(v.company_name || '') ?? DEFAULT_ALERT_THRESHOLDS;
    const insOn = isInsuranceAlertsEnabled(v);

    const alert_items = buildVehicleTrackingAlerts({
      vehicleId: v.id,
      license_plate: v.license_plate,
      test_expiry: v.test_expiry,
      insurance_expiry: v.insurance_expiry,
      license_doc_url: v.license_doc_url,
      insurance_alerts_enabled: v.insurance_alerts_enabled,
      openFaults,
      openDefects,
      openAccidents,
      openServices,
      customGaps,
      has_active_transport: !!v.needs_transport,
      service_status: v.service_status,
      thresholds,
    });

    const has_open_alert = vehicleHasTrackingAlerts(alert_items);

    const sl = statusLabel(v.status || '');

    return {
      id: v.id,
      license_plate: v.license_plate,
      internal_number: v.internal_number || '—',
      company_name: v.company_name || '—',
      department: v.department,
      manufacturer: v.manufacturer,
      model: v.model,
      year: v.year,
      driver_name: v.assigned_driver_id ? driverMap.get(v.assigned_driver_id) || null : null,
      status: v.status || '',
      status_text: sl.text,
      current_location: v.current_location || '—',
      odometer: Number(v.odometer) || 0,
      service_status: v.service_status,
      in_garage,
      days_in_garage,
      has_open_fault,
      has_open_defect,
      has_open_accident,
      has_open_alert,
      has_active_service,
      has_active_transport: !!v.needs_transport,
      test_expiry: v.test_expiry,
      insurance_expiry: v.insurance_expiry,
      insurance_alerts_enabled: insOn,
      insurance_alerts_red_enabled: v.insurance_alerts_red_enabled !== false,
      alert_items,
      alert_kinds: alert_items.map((a) => a.kind),
    };
  });
}

export function applySummaryFilter(rows: TrackingVehicleRow[], key: SummaryFilterKey | null): TrackingVehicleRow[] {
  if (!key || key === 'total') return rows;
  switch (key) {
    case 'attention':
      return rows.filter(vehicleNeedsTrackingAttention);
    case 'active':
      return rows.filter((v) => v.status === 'active' || v.status_text === 'פעיל');
    case 'service':
      return rows.filter((v) => v.has_active_service);
    case 'transport':
      return rows.filter((v) => v.has_active_transport);
    case 'accident':
      return rows.filter((v) => v.has_open_accident);
    case 'defect':
      return rows.filter((v) => v.has_open_defect);
    case 'fault':
      return rows.filter((v) => v.has_open_fault);
    case 'alert':
      return rows.filter((v) => v.has_open_alert);
    case 'garage':
      return rows.filter((v) => v.in_garage);
    case 'disabled':
      return rows.filter((v) => v.status === 'out_of_service' || v.status_text === 'לא פעיל');
    case 'nodriver':
      return rows.filter((v) => !v.driver_name);
    case 'testSoon':
      return rows.filter((v) => v.alert_kinds.includes('test'));
    case 'insSoon':
      return rows.filter((v) => v.alert_kinds.includes('insurance'));
    case 'km':
      return rows.filter((v) => v.odometer > 200000);
    default:
      return rows;
  }
}

export function applyTrackingFilters(rows: TrackingVehicleRow[], f: TrackingFilters): TrackingVehicleRow[] {
  return rows.filter((v) => {
    if (f.plate && !v.license_plate.toLowerCase().includes(f.plate.toLowerCase())) return false;
    if (f.internal && !v.internal_number.toLowerCase().includes(f.internal.toLowerCase())) return false;
    if (f.company && v.company_name !== f.company) return false;
    if (f.department && (v.department || '') !== f.department) return false;
    if (f.manufacturer && v.manufacturer !== f.manufacturer) return false;
    if (f.status && v.status_text !== f.status && v.status !== f.status) return false;
    if (f.minKm && v.odometer < f.minKm) return false;
    if (f.driver && !(v.driver_name || '').toLowerCase().includes(f.driver.toLowerCase())) return false;
    if (f.garage && !v.in_garage) return false;
    if (f.fault && !v.has_open_fault) return false;
    if (f.defect && !v.has_open_defect) return false;
    if (f.accident && !v.has_open_accident) return false;
    if (f.alert && !v.has_open_alert) return false;
    if (f.transport && !v.has_active_transport) return false;
    if (f.nodriver && v.driver_name) return false;
    if (f.testSoon && !v.alert_kinds.includes('test')) return false;
    if (f.insSoon && !v.alert_kinds.includes('insurance')) return false;
    if (f.alertKind && !v.alert_kinds.includes(f.alertKind)) return false;
    return true;
  });
}

export function buildSummaryCounts(rows: TrackingVehicleRow[]): Record<SummaryFilterKey, number> {
  return {
    total: rows.length,
    attention: applySummaryFilter(rows, 'attention').length,
    active: applySummaryFilter(rows, 'active').length,
    service: applySummaryFilter(rows, 'service').length,
    transport: applySummaryFilter(rows, 'transport').length,
    accident: applySummaryFilter(rows, 'accident').length,
    defect: applySummaryFilter(rows, 'defect').length,
    fault: applySummaryFilter(rows, 'fault').length,
    alert: applySummaryFilter(rows, 'alert').length,
    garage: applySummaryFilter(rows, 'garage').length,
    disabled: applySummaryFilter(rows, 'disabled').length,
    nodriver: applySummaryFilter(rows, 'nodriver').length,
    testSoon: applySummaryFilter(rows, 'testSoon').length,
    insSoon: applySummaryFilter(rows, 'insSoon').length,
    km: applySummaryFilter(rows, 'km').length,
  };
}

export async function loadVehicleTrackingDetail(
  vehicleId: string,
  companyFilter: string | null,
): Promise<{ vehicle: TrackingVehicleRow; history: VehicleHistoryEntry[] } | null> {
  const { data } = await applyCompanyScope(
    supabase
      .from('vehicles')
      .select(
        'id, license_plate, internal_number, company_name, department, manufacturer, model, year, status, current_location, odometer, service_status, assigned_driver_id, needs_transport, test_expiry, insurance_expiry, license_doc_url, insurance_alerts_enabled, insurance_alerts_red_enabled',
      )
      .eq('id', vehicleId)
      .maybeSingle(),
    companyFilter,
  );

  if (!data) return null;

  const all = await loadFleetTrackingRows(companyFilter);
  const vehicle = all.find((v) => v.id === vehicleId);
  if (!vehicle) return null;

  const history = await loadVehicleHistory(
    vehicle.license_plate,
    vehicle.internal_number === '—' ? '' : vehicle.internal_number,
    companyFilter,
  );

  return { vehicle, history };
}
