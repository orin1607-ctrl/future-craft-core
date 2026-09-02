import type { TelematicsOverlay } from './starlink/adapter';
import type { CommStatus } from './starlink/origin';

export const NA = 'לא התקבל';

export function formatNa(value: string | number | null | undefined, suffix = ''): string {
  if (value == null || value === '') return NA;
  return suffix ? `${value}${suffix}` : String(value);
}

export function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return NA;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return NA;
  return new Date(t).toLocaleString('he-IL');
}

export function headingLabel(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return NA;
  const dirs = ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב'];
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return `${Math.round(deg)}° · ${dirs[i]}`;
}

export function commStatusLabel(status: CommStatus): string {
  if (status === 'online') return 'Online';
  if (status === 'stale') return 'Stale';
  if (status === 'offline') return 'Offline';
  return 'No Data';
}

export function gpsFreshnessLabel(t: TelematicsOverlay): string {
  if (t.freshness === 'live') return t.dataOrigin === 'qa' ? 'GPS (QA)' : 'GPS Live';
  if (t.freshness === 'stale') return 'GPS ישן';
  return 'אין GPS';
}

export function originLabel(t: TelematicsOverlay): string {
  return t.dataOrigin === 'qa' ? 'QA / TEST' : 'מכשיר';
}

export function motionLabel(t: TelematicsOverlay): string {
  if (t.motion === 'driving') return 'בנסיעה';
  if (t.motion === 'stopped') return 'עצור';
  return NA;
}

export function flagLabel(v: boolean | null | undefined, on: string, off: string): string {
  if (v == null) return NA;
  return v ? on : off;
}
