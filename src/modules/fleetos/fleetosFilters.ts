import { normalizePlate } from '@/lib/entityNavContext';
import type { FleetOSAlertRow, FleetOSVehicleRow } from './fleetosData';
import type { FleetOSFilters } from './FleetOSFilterBar';
import type { FleetOSKpiSnapshot } from './fleetosTypes';

export const STATUS_LABEL: Record<FleetOSVehicleRow['status'], string> = {
  driving: 'בנסיעה',
  stopped: 'עצור',
  fault: 'תקלה',
  offline: 'לא מחובר',
};

function includesFold(haystack: string | undefined, needle: string): boolean {
  if (!needle.trim()) return true;
  return (haystack || '').toLowerCase().includes(needle.trim().toLowerCase());
}

function matchesStatus(v: FleetOSVehicleRow, statusFilter: string): boolean {
  if (!statusFilter) return true;
  if (v.status_text === statusFilter) return true;
  if (STATUS_LABEL[v.status] === statusFilter) return true;
  if (v.status === statusFilter) return true;
  return false;
}

/** Apply FleetOS filter bar values to vehicle rows. */
export function applyFleetOSFilters(
  vehicles: FleetOSVehicleRow[],
  f: FleetOSFilters,
): FleetOSVehicleRow[] {
  return vehicles.filter((v) => {
    if (f.company && v.company_name !== f.company) return false;
    if (f.plate) {
      const q = normalizePlate(f.plate);
      if (!normalizePlate(v.plate).includes(q)) return false;
    }
    if (f.internal && !includesFold(v.internal_number, f.internal)) return false;
    if (f.driver && !includesFold(v.driver_name, f.driver)) return false;
    if (f.make && v.make !== f.make) return false;
    if (f.model && v.model !== f.model) return false;
    if (!matchesStatus(v, f.status)) return false;
    return true;
  });
}

export function computeFleetOSKpisFromRows(rows: FleetOSVehicleRow[]): FleetOSKpiSnapshot {
  return {
    vehicles_active: rows.filter((v) => v.status === 'driving').length,
    vehicles_idling: rows.filter((v) => v.status === 'driving' && !v.in_garage).length,
    vehicles_in_garage: rows.filter((v) => v.in_garage).length,
    total: rows.length,
  };
}

export function filterFleetOSAlerts(
  alerts: FleetOSAlertRow[],
  filteredVehicles: FleetOSVehicleRow[],
  selected: FleetOSVehicleRow | null,
  totalCount: number,
): FleetOSAlertRow[] {
  if (filteredVehicles.length === totalCount && !selected) return alerts;

  const plates = new Set(filteredVehicles.map((v) => normalizePlate(v.plate)));

  return alerts.filter((a) => {
    const alertPlate = normalizePlate(a.vehicle_plate);
    if (selected && alertPlate === normalizePlate(selected.plate)) return true;
    if (plates.size === 0) return false;
    for (const p of plates) {
      if (!p || p === '—') continue;
      if (alertPlate.includes(p) || p.includes(alertPlate)) return true;
    }
    return false;
  });
}

export function hasActiveFleetOSFilters(f: FleetOSFilters): boolean {
  return Object.values(f).some(Boolean);
}
