/** Decide whether an existing document row belongs to one vehicle.
 * Read-only. Does not move, copy, or delete files.
 * A plate string that is only an internal number is accepted only when that
 * number identifies exactly one vehicle inside the same company.
 */

export function normalizeVehicleKey(value: string | null | undefined): string {
  return String(value || '').replace(/[-\s]/g, '').toUpperCase();
}

export type VehicleIdentity = {
  id: string;
  licensePlate: string;
  internalNumber: string;
  companyName: string;
};

export type VehicleDocCandidate = {
  companyName?: string | null;
  vehiclePlate?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export function internalNumberIdentifiesVehicle(
  vehicle: VehicleIdentity,
  companyVehicles: Array<{ id: string; licensePlate: string; internalNumber: string; companyName: string }>,
): boolean {
  const company = vehicle.companyName.trim();
  const internal = normalizeVehicleKey(vehicle.internalNumber);
  if (!company || !internal || !vehicle.id) return false;
  const hits = companyVehicles.filter((row) => {
    if (row.companyName.trim() !== company) return false;
    return normalizeVehicleKey(row.internalNumber) === internal
      || normalizeVehicleKey(row.licensePlate) === internal;
  });
  return hits.length === 1 && hits[0].id === vehicle.id;
}

export function documentMatchesVehicle(
  doc: VehicleDocCandidate,
  vehicle: VehicleIdentity,
  internalNumberIsUnique: boolean,
): boolean {
  const vehicleCompany = vehicle.companyName.trim();
  const docCompany = (doc.companyName || '').trim();
  if (!vehicleCompany || !vehicle.id) return false;
  if (docCompany && docCompany !== vehicleCompany) return false;

  const boundToThisVehicle = doc.entityType === 'vehicle' && !!doc.entityId && doc.entityId === vehicle.id;
  if (boundToThisVehicle) return true;
  if (!docCompany) return false;

  const plate = normalizeVehicleKey(doc.vehiclePlate);
  if (!plate) return false;
  const license = normalizeVehicleKey(vehicle.licensePlate);
  if (license && plate === license) return true;

  const internal = normalizeVehicleKey(vehicle.internalNumber);
  return internalNumberIsUnique && !!internal && plate === internal;
}

export type StoredVehicleDoc = {
  name?: string;
  link?: string;
  file?: string;
  category?: string;
};

export function mergeStoredVehicleDocs<T extends { id: string; name: string; url?: string }>(
  linked: T[],
  importBuffer: unknown,
): T[] {
  const raw = typeof importBuffer === 'string'
    ? (() => { try { return JSON.parse(importBuffer) as { docs?: StoredVehicleDoc[] }; } catch { return null; } })()
    : importBuffer as { docs?: StoredVehicleDoc[] } | null;
  const stored = raw?.docs || [];
  const seen = new Set(linked.map((doc) => doc.url).filter(Boolean));
  const extra = stored.flatMap((doc, index) => {
    const url = (doc.link || '').trim();
    if (url && seen.has(url)) return [];
    if (url) seen.add(url);
    return [{
      id: `stored-${index}`,
      name: doc.name || doc.file || 'מסמך',
      url: url || undefined,
    } as T];
  });
  return [...linked, ...extra];
}

export function safePlateFilterValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text || /[,.()"\\]/.test(text) || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
