/** ERM #LAT# = ±DDMM.MMMM  #LONG# = ±DDDMM.MMMM  (#LTDD#/#LGDD# are already decimal). */

export function parseSignedNmea(raw: string | null | undefined, isLat: boolean): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const sign = s.startsWith('-') ? -1 : 1;
  const abs = Number(s.replace(/^[+-]/, ''));
  if (!Number.isFinite(abs) || abs === 0) return null;

  const degDigits = isLat ? 2 : 3;
  const [intPart, frac = '0000'] = abs.toFixed(4).split('.');
  const paddedInt = intPart.padStart(degDigits + 2, '0');
  const deg = Number(paddedInt.slice(0, degDigits));
  const minutes = Number(`${paddedInt.slice(degDigits)}.${frac}`);
  if (!Number.isFinite(deg) || !Number.isFinite(minutes)) return null;
  return clampCoord(sign * (deg + minutes / 60), isLat);
}

export function parseDecimalDegrees(raw: string | null | undefined, isLat: boolean): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n === 0) return null;
  return clampCoord(n, isLat);
}

function clampCoord(value: number, isLat: boolean): number | null {
  if (!Number.isFinite(value) || value === 0) return null;
  if (isLat && (value < -90 || value > 90)) return null;
  if (!isLat && (value < -180 || value > 180)) return null;
  return value;
}

export function isValidLatLng(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
