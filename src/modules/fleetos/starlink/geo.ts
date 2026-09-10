import { isValidLatLng } from './coords';

/** Israel-ish view box for the existing Fleet Status map chrome (no tile library). */
export const MAP_BOUNDS = {
  south: 29.45,
  north: 33.4,
  west: 34.2,
  east: 35.95,
};

export function latLngToPercent(lat: number, lng: number): { top: string; left: string } | null {
  if (!isValidLatLng(lat, lng)) return null;
  const { south, north, west, east } = MAP_BOUNDS;
  if (lat < south || lat > north || lng < west || lng > east) return null;
  const x = ((lng - west) / (east - west)) * 100;
  const y = ((north - lat) / (north - south)) * 100;
  return {
    top: `${Math.max(8, Math.min(90, y))}%`,
    left: `${Math.max(6, Math.min(94, x))}%`,
  };
}
