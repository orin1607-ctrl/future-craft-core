import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import {
  loadFleetTrackingRows,
  type TrackingVehicleRow,
} from '@/lib/vehicleTrackingData';
import type { AlertTypeKey, FleetOSKpiSnapshot, VehicleStatus } from './fleetosTypes';

export interface FleetOSVehicleRow {
  id: string;
  plate: string;
  internal_number?: string;
  department?: string;
  company_name?: string;
  make?: string;
  model?: string;
  driver_name?: string;
  status: VehicleStatus;
  status_text: string;
  location?: string;
  odometer?: number;
  fault_count?: number;
  in_garage?: boolean;
}

export interface FleetOSAlertRow {
  id: string;
  type: AlertTypeKey;
  vehicle_plate: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  created_at: string;
}

function mapDisplayStatus(row: TrackingVehicleRow): VehicleStatus {
  if (row.in_garage) return 'stopped';
  if (row.has_open_fault) return 'fault';
  if (row.status === 'active' || row.status_text === 'פעיל') return 'driving';
  if (row.status === 'out_of_service' || row.status_text === 'לא פעיל') return 'offline';
  return 'stopped';
}

/** Skip import/header junk rows that landed in vehicles.license_plate. */
export function isFleetOSDisplayablePlate(plate: string | null | undefined): boolean {
  const p = (plate || '').trim();
  if (!p || p === '—') return false;
  if (p.includes(',') || p.includes('סוג רכב') || p.length > 15) return false;
  return true;
}

export function trackingRowToFleetOS(row: TrackingVehicleRow): FleetOSVehicleRow | null {
  if (!isFleetOSDisplayablePlate(row.license_plate)) return null;
  return {
    id: row.id,
    plate: row.license_plate,
    internal_number: row.internal_number !== '—' ? row.internal_number : undefined,
    department: row.department && row.department !== '—' ? row.department : undefined,
    company_name: row.company_name && row.company_name !== '—' ? row.company_name : undefined,
    make: row.manufacturer || undefined,
    model: row.model || undefined,
    driver_name: row.driver_name || undefined,
    status: mapDisplayStatus(row),
    status_text: row.status_text,
    location: row.current_location !== '—' ? row.current_location || undefined : undefined,
    odometer: row.odometer,
    fault_count: row.has_open_fault ? 1 : 0,
    in_garage: row.in_garage,
  };
}

/** Fixed KPIs from Dalia vehicle tracking aggregates. */
export function computeFleetOSKpis(rows: TrackingVehicleRow[]): FleetOSKpiSnapshot {
  const active = rows.filter((v) => v.status === 'active' || v.status_text === 'פעיל').length;
  const garage = rows.filter((v) => v.in_garage).length;
  /** Proxy: פעילים בשטח שאינם במוסך/שינוע — עד שיתווסף שדה telematics */
  const idling = rows.filter(
    (v) =>
      (v.status === 'active' || v.status_text === 'פעיל') &&
      !v.in_garage &&
      !v.has_active_transport,
  ).length;

  return {
    vehicles_active: active,
    vehicles_idling: idling,
    vehicles_in_garage: garage,
    total: rows.length,
  };
}

export async function loadFleetOSTracking(companyFilter: string | null): Promise<{
  vehicles: FleetOSVehicleRow[];
  kpis: FleetOSKpiSnapshot;
  trackingRows: TrackingVehicleRow[];
}> {
  const trackingRows = await loadFleetTrackingRows(companyFilter);
  const vehicles = trackingRows
    .map(trackingRowToFleetOS)
    .filter((v): v is FleetOSVehicleRow => v != null);
  return {
    trackingRows,
    vehicles,
    kpis: computeFleetOSKpis(trackingRows),
  };
}

/** Build alert catalog from existing Dalia tables (faults, service_orders, vehicles). */
export async function loadFleetOSAlertCatalog(
  trackingRows: TrackingVehicleRow[],
  companyFilter: string | null,
): Promise<FleetOSAlertRow[]> {
  const alerts: FleetOSAlertRow[] = [];

  const { data: faults } = await applyCompanyScope(
    supabase
      .from('faults')
      .select('id, vehicle_plate, description, urgency, created_at, status')
      .in('status', ['new', 'open', 'in_progress', 'חדש', 'פתוח', 'בטיפול'])
      .order('created_at', { ascending: false })
      .limit(30),
    companyFilter,
  );

  for (const f of faults || []) {
    const urgent =
      (f.urgency || '').toLowerCase().includes('critical') ||
      (f.urgency || '').toLowerCase().includes('דחוף');
    alerts.push({
      id: `fault-${f.id}`,
      type: urgent ? 'fault_active' : 'engine_light',
      vehicle_plate: f.vehicle_plate || '—',
      message: f.description || 'תקלה פתוחה',
      severity: urgent ? 'critical' : 'warning',
      created_at: f.created_at ? new Date(f.created_at).toLocaleString('he-IL') : '—',
    });
  }

  const { data: services } = await applyCompanyScope(
    supabase
      .from('service_orders')
      .select('id, vehicle_plate, service_category, treatment_status, created_at')
      .in('treatment_status', ['new', 'open', 'in_progress', 'pending', 'pending_approval', 'חדש', 'פתוח', 'בטיפול'])
      .order('created_at', { ascending: false })
      .limit(20),
    companyFilter,
  );

  for (const s of services || []) {
    alerts.push({
      id: `svc-${s.id}`,
      type: 'service_urgent',
      vehicle_plate: s.vehicle_plate || '—',
      message: `טיפול פתוח${s.service_category ? `: ${s.service_category}` : ''}`,
      severity: 'warning',
      created_at: s.created_at ? new Date(s.created_at).toLocaleString('he-IL') : '—',
    });
  }

    for (const v of trackingRows) {
    if (v.in_garage) {
      alerts.push({
        id: `garage-${v.id}`,
        type: 'in_garage',
        vehicle_plate: v.license_plate,
        message: `רכב במוסך${v.days_in_garage ? ` — ${v.days_in_garage} ימים` : ''}`,
        severity: 'info',
        created_at: 'עכשיו',
      });
    }
    if (v.odometer > 200000) {
      alerts.push({
        id: `km-${v.id}`,
        type: 'km_threshold',
        vehicle_plate: v.license_plate,
        message: `חריגת ק"מ — ${v.odometer.toLocaleString('he')} ק"מ`,
        severity: 'warning',
        created_at: 'עכשיו',
      });
    }
    if (!v.current_location || v.current_location === '—') {
      alerts.push({
        id: `comm-${v.id}`,
        type: 'no_comm',
        vehicle_plate: v.license_plate,
        message: 'אין מיקום / תקשורת זמינה',
        severity: 'warning',
        created_at: 'עכשיו',
      });
    }
    for (const item of v.alert_items) {
      if (item.kind === 'test') {
        alerts.push({
          id: `test-${v.id}-${item.tier || 'x'}`,
          type: 'service_urgent',
          vehicle_plate: v.license_plate,
          message: item.detail,
          severity: 'warning',
          created_at: 'עכשיו',
        });
      } else if (item.kind === 'insurance' && v.insurance_alerts_enabled) {
        alerts.push({
          id: `ins-${v.id}-${item.tier || 'x'}`,
          type: 'service_urgent',
          vehicle_plate: v.license_plate,
          message: item.detail,
          severity: 'warning',
          created_at: 'עכשיו',
        });
      }
    }
  }

  return alerts;
}
