import type { GpsFreshness, LiveSnapshot } from './types';

/** Assignment without a GPS fix — never treated as Live, never draws a marker. */
export function assignmentOnlyOverlay(unitId: string | null, imei: string | null) {
  return {
    live: false as const,
    freshness: 'none' as GpsFreshness,
    lat: null as number | null,
    lng: null as number | null,
    speedKmh: null as number | null,
    heading: null as number | null,
    ignition: null as boolean | null,
    engine: null as boolean | null,
    motion: null as LiveSnapshot['motion'],
    odometer: null as number | null,
    odometerDecision: 'skip' as LiveSnapshot['odometerDecision'],
    vehicleVoltage: null as number | null,
    backupVoltage: null as number | null,
    rpm: null as number | null,
    lastSeen: null as string | null,
    gpsAt: null as string | null,
    gpsAgeSec: null as number | null,
    imei,
    unitId,
    trail: [] as { lat: number; lng: number }[],
    canRaw: {} as Record<string, string>,
    canMapped: {} as Record<string, { label: string; value: string }>,
    events: [] as { labelHe: string; at: string; severity: string }[],
  };
}
