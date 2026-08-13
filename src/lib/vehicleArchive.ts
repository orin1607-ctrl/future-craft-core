/** Vehicle archive is stored as vehicles.status = 'archived' (row remains; not deleted). */

export const VEHICLE_ARCHIVED_STATUS = 'archived';

export function isVehicleArchived(status: string | null | undefined): boolean {
  return (status || '').trim().toLowerCase() === VEHICLE_ARCHIVED_STATUS;
}

/** Active fleet = everything except archived (active / in_service / out_of_service / …). */
export function isVehicleInActiveFleet(status: string | null | undefined): boolean {
  return !isVehicleArchived(status);
}

export function excludeArchivedVehicles<T extends { status?: string | null }>(rows: T[]): T[] {
  return rows.filter((v) => isVehicleInActiveFleet(v.status));
}

/**
 * Apply to a Supabase vehicles query so archived rows are excluded from active-fleet counts/lists.
 * Does not change schema; filter only.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyExcludeArchivedVehicles(query: any) {
  return query.neq('status', VEHICLE_ARCHIVED_STATUS);
}
