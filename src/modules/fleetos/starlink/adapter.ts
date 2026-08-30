import type { FleetOSAlertRow, FleetOSVehicleRow } from '../fleetosData';
import type { GpsStore } from './store';
import type { GpsFreshness, LiveSnapshot } from './types';
import { NO_COMM_SECONDS } from './types';

export interface TelematicsOverlay {
  live: boolean;
  freshness: GpsFreshness;
  lat: number | null;
  lng: number | null;
  speedKmh: number | null;
  heading: number | null;
  ignition: boolean | null;
  engine: boolean | null;
  motion: 'driving' | 'stopped' | null;
  odometer: number | null;
  odometerDecision: LiveSnapshot['odometerDecision'];
  vehicleVoltage: number | null;
  backupVoltage: number | null;
  rpm: number | null;
  lastSeen: string | null;
  gpsAt: string | null;
  gpsAgeSec: number | null;
  imei: string | null;
  unitId: string | null;
  trail: { lat: number; lng: number }[];
  canRaw: Record<string, string>;
  canMapped: Record<string, { label: string; value: string }>;
  events: { labelHe: string; at: string; severity: string }[];
}

export function liveToOverlay(store: GpsStore, live: LiveSnapshot): TelematicsOverlay {
  const trail = store.listPositions(live.vehicleId).map((p) => ({ lat: p.lat, lng: p.lng }));
  const events = store
    .listEvents(live.companyName)
    .filter((e) => e.vehicleId === live.vehicleId)
    .slice(-5)
    .map((e) => ({ labelHe: e.labelHe, at: e.at, severity: e.severity }));
  return {
    live: live.freshness === 'live',
    freshness: live.freshness,
    lat: live.lat,
    lng: live.lng,
    speedKmh: live.speedKmh,
    heading: live.heading,
    ignition: live.ignition,
    engine: live.engine,
    motion: live.motion,
    odometer: live.odometer,
    odometerDecision: live.odometerDecision,
    vehicleVoltage: live.vehicleVoltage,
    backupVoltage: live.backupVoltage,
    rpm: live.rpm,
    lastSeen: live.lastSeen,
    gpsAt: live.gpsAt,
    gpsAgeSec: live.gpsAgeSec,
    imei: live.imei,
    unitId: live.unitId,
    trail,
    canRaw: live.canRaw,
    canMapped: live.canMapped,
    events,
  };
}

export function mergeTelematics(
  vehicles: FleetOSVehicleRow[],
  store: GpsStore,
  companyFilter: string | null,
): FleetOSVehicleRow[] {
  const lives = store.listLive(companyFilter);
  const byVehicle = new Map(lives.map((l) => [l.vehicleId, l]));
  return vehicles.map((v) => {
    const live = byVehicle.get(v.id);
    if (!live) return v;
    return { ...v, telematics: liveToOverlay(store, live) };
  });
}

export function telematicsNoCommAlerts(
  vehicles: FleetOSVehicleRow[],
  now = Date.now(),
): FleetOSAlertRow[] {
  const alerts: FleetOSAlertRow[] = [];
  for (const v of vehicles) {
    const t = v.telematics;
    if (!t?.unitId && !t?.imei) continue;
    const seen = t.lastSeen ? Date.parse(t.lastSeen) : NaN;
    const stale = !Number.isFinite(seen) || now - seen > NO_COMM_SECONDS * 1000;
    if (stale) {
      alerts.push({
        id: `erm-comm-${v.id}`,
        type: 'no_comm',
        vehicle_plate: v.plate,
        message: 'אין תקשורת מהמכשיר (Last Seen)',
        severity: 'warning',
        created_at: t.lastSeen ? new Date(t.lastSeen).toLocaleString('he-IL') : '—',
      });
    }
  }
  return alerts;
}

export function filterBusinessLocationNoComm(
  alerts: FleetOSAlertRow[],
  vehicles: FleetOSVehicleRow[],
): FleetOSAlertRow[] {
  const mapped = new Set(vehicles.filter((v) => v.telematics?.imei || v.telematics?.unitId).map((v) => v.id));
  if (mapped.size === 0) return alerts;
  const plates = new Set(
    vehicles.filter((v) => mapped.has(v.id)).map((v) => v.plate),
  );
  return alerts.filter((a) => {
    if (a.type !== 'no_comm' || a.id.startsWith('erm-comm-')) return true;
    return !plates.has(a.vehicle_plate);
  });
}
