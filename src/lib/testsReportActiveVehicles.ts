import { isVehicleArchived } from '@/lib/vehicleArchive';

/** Existing archive encodings of vehicles.status — tests report only. */
const ARCHIVED_STATUS_ALIASES = new Set(['archived', 'archive', 'ארכיון']);

export type TestsReportVehicleRow = {
  id?: string | null;
  status?: string | null;
  internal_number?: string | null;
};

function normalizeVehicleStatus(status: string | null | undefined): string {
  return (status || '')
    .replace(/[\u200e\u200f\u00a0]/g, '')
    .trim()
    .toLowerCase();
}

/** True when the existing status field already marks the vehicle as archived. */
export function isArchivedOnTestsReport(vehicle: TestsReportVehicleRow | null | undefined): boolean {
  if (!vehicle) return false;
  if (isVehicleArchived(vehicle.status)) return true;
  const normalized = normalizeVehicleStatus(vehicle.status);
  if (ARCHIVED_STATUS_ALIASES.has(normalized)) return true;
  const raw = (vehicle.status || '').replace(/[\u200e\u200f\u00a0]/g, '').trim();
  return raw === 'ארכיון';
}

export function vehiclesForTestsReport<T extends TestsReportVehicleRow>(vehicles: T[]): T[] {
  return vehicles.filter((vehicle) => !isArchivedOnTestsReport(vehicle));
}

export function findVehicleForTestsEvent<T extends TestsReportVehicleRow>(
  vehicles: T[],
  event: { vehicleId?: string | null; internalNumber?: string | null },
): T | undefined {
  if (event.vehicleId) {
    const byId = vehicles.find((vehicle) => vehicle.id === event.vehicleId);
    if (byId) return byId;
  }
  if (event.internalNumber) {
    const wanted = String(event.internalNumber).trim();
    return vehicles.find((vehicle) => String(vehicle.internal_number || '').trim() === wanted);
  }
  return undefined;
}
