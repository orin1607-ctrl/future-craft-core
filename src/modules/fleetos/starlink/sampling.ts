import { haversineMeters } from './coords';
import {
  SAMPLE_DISTANCE_M,
  SAMPLE_HEADING_DEG,
  SAMPLE_MIN_SECONDS,
  type PositionSample,
} from './types';

export function headingDelta(a: number | null, b: number | null): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const d = Math.abs(b - a) % 360;
  return d > 180 ? 360 - d : d;
}

export function shouldSamplePosition(
  last: PositionSample | null,
  next: { lat: number; lng: number; heading: number | null; at: string },
): boolean {
  if (!last) return true;
  const elapsed = (Date.parse(next.at) - Date.parse(last.at)) / 1000;
  if (Number.isFinite(elapsed) && elapsed >= SAMPLE_MIN_SECONDS) return true;
  const dist = haversineMeters(last, next);
  if (dist >= SAMPLE_DISTANCE_M) return true;
  const hd = headingDelta(last.heading, next.heading);
  if (hd != null && hd >= SAMPLE_HEADING_DEG) return true;
  return false;
}
