import { plateMatches } from '@/lib/entityNavContext';

export type AccidentSearchRow = {
  id: string;
  vehicle_plate?: string | null;
  driver_name?: string | null;
  description?: string | null;
  event_number?: string | null;
  claim_number?: string | null;
};

export type VehicleIdentity = {
  plate: string;
  internal_number?: string | null;
  department?: string | null;
};

export function findVehicleIdentity(
  identities: VehicleIdentity[],
  plate: string | null | undefined,
): VehicleIdentity | undefined {
  if (!plate) return undefined;
  return identities.find((v) => plateMatches(v.plate, plate));
}

export function accidentBelongsToVehicle(
  accident: AccidentSearchRow,
  vehiclePlate: string | null | undefined,
): boolean {
  if (!vehiclePlate) return true;
  return plateMatches(accident.vehicle_plate, vehiclePlate);
}

export function accidentMatchesSearch(
  accident: AccidentSearchRow,
  search: string,
  identity?: VehicleIdentity | null,
): boolean {
  const q = (search || '').trim();
  if (!q) return true;
  if (accident.driver_name?.includes(q)) return true;
  if (plateMatches(accident.vehicle_plate, q)) return true;
  if (accident.description?.includes(q)) return true;
  if ((accident.event_number || '').includes(q)) return true;
  if (accident.claim_number?.includes(q)) return true;
  if ((identity?.internal_number || '').includes(q)) return true;
  if ((identity?.department || '').includes(q)) return true;
  return false;
}
