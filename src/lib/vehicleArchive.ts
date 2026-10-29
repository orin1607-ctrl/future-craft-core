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

/**
 * Archived vehicles, by id and by plate, so alerts that point at a vehicle only
 * through a plate or a `vid:` tag (faults, tasks, service orders, custom_alerts)
 * can be left out of active alerts. Rows are kept; this is a read-time filter,
 * so a vehicle restored from the archive gets its alerts back as they stand.
 */
export type ArchivedVehicleRefs = {
  ids: Set<string>;
  /** Plates of archived vehicles that no active vehicle uses (plates can be reused). */
  plates: Set<string>;
};

export const EMPTY_ARCHIVED_VEHICLE_REFS: ArchivedVehicleRefs = { ids: new Set(), plates: new Set() };

export function archivedPlateKey(plate: string | null | undefined): string {
  return String(plate || '').replace(/[-\s]/g, '').toUpperCase();
}

export function buildArchivedVehicleRefs(
  rows: { id: string; license_plate?: string | null; status?: string | null }[],
): ArchivedVehicleRefs {
  const ids = new Set<string>();
  const archivedPlates = new Set<string>();
  const activePlates = new Set<string>();
  for (const row of rows) {
    const plate = archivedPlateKey(row.license_plate);
    if (isVehicleArchived(row.status)) {
      ids.add(row.id);
      if (plate) archivedPlates.add(plate);
    } else if (plate) {
      activePlates.add(plate);
    }
  }
  const plates = new Set([...archivedPlates].filter((p) => !activePlates.has(p)));
  return { ids, plates };
}

/** True when the alert's vehicle (by id first, else by plate) is archived. */
export function isArchivedVehicleRef(
  refs: ArchivedVehicleRefs,
  ref: { vehicleId?: string | null; plate?: string | null },
): boolean {
  if (ref.vehicleId) return refs.ids.has(ref.vehicleId);
  const plate = archivedPlateKey(ref.plate);
  return !!plate && refs.plates.has(plate);
}
