import { normalizePlate, plateMatches } from '@/lib/entityNavContext';
import type {
  FleetOSFuelAnomaly,
  FleetOSFuelFilters,
  FleetOSChargeRow,
  FleetOSFuelRow,
} from './fleetosFuelTypes';

function includesFold(haystack: string | undefined, needle: string): boolean {
  if (!needle.trim()) return true;
  return (haystack || '').toLowerCase().includes(needle.trim().toLowerCase());
}

function parseDateParts(iso: string): { y: string; m: string; d: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { y: '', m: '', d: '' };
  return {
    y: String(d.getFullYear()),
    m: String(d.getMonth() + 1).padStart(2, '0'),
    d: String(d.getDate()).padStart(2, '0'),
  };
}

function rowDateOk(dateIso: string, f: FleetOSFuelFilters): boolean {
  if (!dateIso) return true;
  const dt = new Date(dateIso);
  if (Number.isNaN(dt.getTime())) return true;
  const parts = parseDateParts(dateIso);
  if (f.year && parts.y !== f.year) return false;
  if (f.month && parts.m !== f.month.padStart(2, '0')) return false;
  if (f.date_from) {
    const from = new Date(f.date_from);
    if (dt < from) return false;
  }
  if (f.date_to) {
    const to = new Date(f.date_to);
    to.setHours(23, 59, 59, 999);
    if (dt > to) return false;
  }
  return true;
}

function rowTimeOk(time: string, f: FleetOSFuelFilters): boolean {
  if (!f.time_from && !f.time_to) return true;
  if (!time) return true;
  const t = time.slice(0, 5);
  if (f.time_from && t < f.time_from) return false;
  if (f.time_to && t > f.time_to) return false;
  return true;
}

function baseRowFilter<T extends { plate: string; internal: string; driver: string; company: string; customer: string; station: string; location: string; status: string }>(
  row: T,
  f: FleetOSFuelFilters,
): boolean {
  if (f.company && row.company !== f.company) return false;
  if (f.customer && row.customer !== f.customer) return false;
  if (f.plate) {
    const q = normalizePlate(f.plate);
    if (!normalizePlate(row.plate).includes(q)) return false;
  }
  if (f.internal && !includesFold(row.internal, f.internal)) return false;
  if (f.driver && !includesFold(row.driver, f.driver)) return false;
  if (f.station && !includesFold(row.station, f.station)) return false;
  if (f.location && !includesFold(row.location, f.location)) return false;
  if (f.status && row.status !== f.status) return false;
  return true;
}

export function applyFuelFilters(rows: FleetOSFuelRow[], f: FleetOSFuelFilters): FleetOSFuelRow[] {
  return rows.filter((r) => {
    if (!baseRowFilter(r, f)) return false;
    if (!rowDateOk(r.date, f)) return false;
    if (!rowTimeOk(r.time, f)) return false;
    return true;
  });
}

export function applyChargeFilters(rows: FleetOSChargeRow[], f: FleetOSFuelFilters): FleetOSChargeRow[] {
  return rows.filter((r) => {
    if (!baseRowFilter(r, f)) return false;
    if (!rowDateOk(r.date, f)) return false;
    if (!rowTimeOk(r.time, f)) return false;
    return true;
  });
}

export function applyAnomalyFilters(rows: FleetOSFuelAnomaly[], f: FleetOSFuelFilters): FleetOSFuelAnomaly[] {
  return rows.filter((r) => {
    if (f.company && r.company !== f.company) return false;
    if (f.customer && r.customer !== f.customer) return false;
    if (f.plate && !plateMatches(r.plate, f.plate)) return false;
    if (f.internal && !includesFold(r.internal, f.internal)) return false;
    if (f.driver && !includesFold(r.driver, f.driver)) return false;
    if (f.location && !includesFold(r.location, f.location)) return false;
    if (f.status === 'handled' && !r.handled) return false;
    if (f.status === 'open' && r.handled) return false;
    return true;
  });
}

export function hasActiveFuelFilters(f: FleetOSFuelFilters): boolean {
  return Object.entries(f).some(([k, v]) => k !== 'energy_type' && Boolean(v)) || (f.energy_type !== 'all' && !!f.energy_type);
}

export function filtersFromVehicleContext(ctx: {
  plate?: string;
  vehicleId?: string;
  company?: string;
  internal?: string;
  driver?: string;
}): Partial<FleetOSFuelFilters> {
  const patch: Partial<FleetOSFuelFilters> = {};
  if (ctx.plate) patch.plate = ctx.plate;
  if (ctx.company) {
    patch.company = ctx.company;
    patch.customer = ctx.company;
  }
  if (ctx.internal) patch.internal = ctx.internal;
  if (ctx.driver) patch.driver = ctx.driver;
  return patch;
}
