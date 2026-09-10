import { isValidLatLng } from './coords';
import { NO_COMM_SECONDS, STALE_GPS_SECONDS, type GpsFreshness } from './types';

export type DataOrigin = 'qa' | 'device';
export type CommStatus = 'online' | 'stale' | 'offline' | 'no_data';

export const QA_PREVIEW_P177 =
  '#EDT#,#EID#,#PDT#,#LAT#,#LONG#,#SPD#,#HEAD#,#ODO#,#LAC#,#CID#,#VIN#,#VBAT#,#IGN#,#ENG#,#RPM#,#DUR#,#CFL#,#DID#,#FIX#,#SAT#,#HDOP#,#ALT#,#CV1#,#CV2#';

export function isQaUnitId(unitId: string | null | undefined): boolean {
  return Boolean(unitId && /^QA/i.test(unitId.trim()));
}

export function dataOriginFromUnit(unitId: string | null | undefined): DataOrigin {
  return isQaUnitId(unitId) ? 'qa' : 'device';
}

export function commStatusFromLastSeen(
  lastSeen: string | null | undefined,
  now = Date.now(),
): CommStatus {
  if (!lastSeen) return 'no_data';
  const t = Date.parse(lastSeen);
  if (!Number.isFinite(t)) return 'no_data';
  const ageSec = (now - t) / 1000;
  if (ageSec <= STALE_GPS_SECONDS) return 'online';
  if (ageSec <= NO_COMM_SECONDS) return 'stale';
  return 'offline';
}

export function freshnessNow(
  lat: number | null,
  lng: number | null,
  gpsAgeSec: number | null,
  gpsAt: string | null,
  lastSeen: string | null,
  now = Date.now(),
): GpsFreshness {
  if (!isValidLatLng(lat, lng)) return 'none';
  const seenAt = lastSeen ? Date.parse(lastSeen) : NaN;
  const gpsAtMs = gpsAt ? Date.parse(gpsAt) : NaN;
  const sinceSeen = Number.isFinite(seenAt) ? Math.max(0, (now - seenAt) / 1000) : null;
  const reported =
    gpsAgeSec != null
      ? gpsAgeSec
      : Number.isFinite(gpsAtMs) && Number.isFinite(seenAt)
        ? Math.max(0, (seenAt - gpsAtMs) / 1000)
        : Number.isFinite(gpsAtMs)
          ? Math.max(0, (now - gpsAtMs) / 1000)
          : 0;
  const age = (sinceSeen ?? 0) + (reported || 0);
  if (age > STALE_GPS_SECONDS) return 'stale';
  return 'live';
}

export function parseOptionalNumber(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function gpsQualityFromTags(tags: Record<string, string | null> | null | undefined): {
  altitude: number | null;
  satellites: number | null;
  hdop: number | null;
  gpsFix: string | null;
  idlingSec: number | null;
} {
  const t = tags || {};
  const gpsFix = t.FIX || t.LOCA || null;
  return {
    altitude: parseOptionalNumber(t.ALT) ?? parseOptionalNumber(t.ALTD),
    satellites: parseOptionalNumber(t.SAT),
    hdop: parseOptionalNumber(t.HDOP),
    gpsFix: gpsFix && String(gpsFix).trim() ? String(gpsFix).trim() : null,
    idlingSec: parseOptionalNumber(t.IDL),
  };
}

/** P0004 is a device parameter, not a per-message tag. */
export function odometerSourceLabel(hasOdo: boolean): {
  tag: string | null;
  gpsVsCan: string;
} {
  if (!hasOdo) {
    return { tag: null, gpsVsCan: 'לא התקבל' };
  }
  return {
    tag: 'ERM #ODO#',
    gpsVsCan: 'לא אומת (P0004 הוא פרמטר מכשיר, לא שדה בדיווח)',
  };
}
