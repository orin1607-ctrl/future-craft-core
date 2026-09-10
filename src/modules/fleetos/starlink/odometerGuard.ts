import { shouldUpdateOdometer } from '@/lib/vehicleActionFollowUp';
import { ODOMETER_JUMP_KM, type OdometerDecision } from './types';

export function parseOdometerTag(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * FleetOS wrapper around shared shouldUpdateOdometer (file not edited).
 * Extra jump-guard lives only here. Does not write vehicles.odometer.
 */
export function shouldApplyTelematicsOdometer(
  current: number | null | undefined,
  incoming: number | null,
  jumpKm = ODOMETER_JUMP_KM,
): { decision: OdometerDecision; value: number | null } {
  if (incoming == null) return { decision: 'skip', value: null };
  if (!shouldUpdateOdometer(current, incoming)) {
    return { decision: 'reject_decrease', value: incoming };
  }
  const cur = Number(current || 0);
  if (cur > 0 && incoming - cur > jumpKm) {
    return { decision: 'reject_jump', value: incoming };
  }
  return { decision: 'apply', value: incoming };
}
