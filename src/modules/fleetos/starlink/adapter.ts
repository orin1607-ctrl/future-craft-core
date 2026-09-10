import type { FleetOSAlertRow, FleetOSVehicleRow } from '../fleetosData';
import type { GpsStore } from './store';
import type { GpsFreshness, LiveSnapshot } from './types';
import { NO_COMM_SECONDS } from './types';
import {
  commStatusFromLastSeen,
  dataOriginFromUnit,
  freshnessNow,
  gpsQualityFromTags,
  odometerSourceLabel,
  type CommStatus,
  type DataOrigin,
} from './origin';

export interface TelematicsOverlay {
  live: boolean;
  freshness: GpsFreshness;
  commStatus: CommStatus;
  dataOrigin: DataOrigin;
  lat: number | null;
  lng: number | null;
  speedKmh: number | null;
  heading: number | null;
  ignition: boolean | null;
  engine: boolean | null;
  motion: 'driving' | 'stopped' | null;
  odometer: number | null;
  odometerDecision: LiveSnapshot['odometerDecision'];
  odometerSourceTag: string | null;
  odometerGpsVsCan: string;
  vehicleVoltage: number | null;
  backupVoltage: number | null;
  rpm: number | null;
  engineHours: number | null;
  fuel: number | null;
  driverId: string | null;
  altitude: number | null;
  satellites: number | null;
  hdop: number | null;
  gpsFix: string | null;
  idlingSec: number | null;
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

export function liveToOverlay(store: GpsStore, live: LiveSnapshot, now = Date.now()): TelematicsOverlay {
  const trail = store.listPositions(live.vehicleId).map((p) => ({ lat: p.lat, lng: p.lng }));
  const events = store
    .listEvents(live.companyName)
    .filter((e) => e.vehicleId === live.vehicleId)
    .slice(-5)
    .reverse()
    .map((e) => ({ labelHe: e.labelHe, at: e.at, severity: e.severity }));
  const freshness = freshnessNow(live.lat, live.lng, live.gpsAgeSec, live.gpsAt, live.lastSeen, now);
  const origin = dataOriginFromUnit(live.unitId);
  const quality = gpsQualityFromTags(live.tags);
  const odoSrc = odometerSourceLabel(live.odometer != null);
  return {
    live: freshness === 'live' && origin !== 'qa',
    freshness,
    commStatus: commStatusFromLastSeen(live.lastSeen, now),
    dataOrigin: origin,
    lat: live.lat,
    lng: live.lng,
    speedKmh: live.speedKmh,
    heading: live.heading,
    ignition: live.ignition,
    engine: live.engine,
    motion: live.motion,
    odometer: live.odometer,
    odometerDecision: live.odometerDecision,
    odometerSourceTag: odoSrc.tag,
    odometerGpsVsCan: odoSrc.gpsVsCan,
    vehicleVoltage: live.vehicleVoltage,
    backupVoltage: live.backupVoltage,
    rpm: live.rpm,
    engineHours: live.engineHours,
    fuel: live.fuel,
    driverId: live.driverId,
    altitude: quality.altitude,
    satellites: quality.satellites,
    hdop: quality.hdop,
    gpsFix: quality.gpsFix,
    idlingSec: quality.idlingSec,
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

export { assignmentOnlyOverlay } from './emptyOverlay';

export function mergeTelematics(
  vehicles: FleetOSVehicleRow[],
  store: GpsStore,
  companyFilter: string | null,
  now = Date.now(),
): FleetOSVehicleRow[] {
  const lives = store.listLive(companyFilter);
  const byVehicle = new Map(lives.map((l) => [l.vehicleId, l]));
  return vehicles.map((v) => {
    const live = byVehicle.get(v.id);
    if (!live) return v;
    return { ...v, telematics: liveToOverlay(store, live, now) };
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
