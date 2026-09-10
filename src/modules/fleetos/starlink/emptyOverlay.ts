import type { GpsFreshness, LiveSnapshot } from './types';
import type { TelematicsOverlay } from './adapter';

const EMPTY_QUALITY = {
  altitude: null as number | null,
  satellites: null as number | null,
  hdop: null as number | null,
  gpsFix: null as string | null,
  idlingSec: null as number | null,
};

/** Assignment without a GPS fix — never treated as Live, never draws a marker. */
export function assignmentOnlyOverlay(unitId: string | null, imei: string | null): TelematicsOverlay {
  const qa = Boolean(unitId && /^QA/i.test(unitId));
  return {
    live: false,
    freshness: 'none' as GpsFreshness,
    commStatus: 'no_data',
    dataOrigin: qa ? 'qa' : 'device',
    lat: null,
    lng: null,
    speedKmh: null,
    heading: null,
    ignition: null,
    engine: null,
    motion: null as LiveSnapshot['motion'],
    odometer: null,
    odometerDecision: 'skip',
    odometerSourceTag: null,
    odometerGpsVsCan: 'לא התקבל',
    vehicleVoltage: null,
    backupVoltage: null,
    rpm: null,
    engineHours: null,
    fuel: null,
    driverId: null,
    ...EMPTY_QUALITY,
    lastSeen: null,
    gpsAt: null,
    gpsAgeSec: null,
    imei,
    unitId,
    trail: [],
    canRaw: {},
    canMapped: {},
    events: [],
  };
}
