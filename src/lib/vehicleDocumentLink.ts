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

/** Storage object key for a public URL or a stored file path. */
export function storedDocumentPath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  const raw = String(urlOrPath).trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '');
  const match = raw.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/documents\/([^?]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function sameStoredDocument(a?: string | null, b?: string | null): boolean {
  const left = storedDocumentPath(a);
  const right = storedDocumentPath(b);
  return !!left && left === right;
}

export type NamedDocumentCopy = {
  original_name?: string | null;
  category?: string | null;
  created_at?: string | null;
};

function namedCopyKey(row: NamedDocumentCopy): string | null {
  const name = String(row.original_name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!name) return null;
  return `${String(row.category || '').trim()}\n${name}`;
}

/** Keep the newest stored row when the same category and file name were uploaded more than once. */
export function keepLatestNamedCopies<T extends NamedDocumentCopy>(rows: T[]): T[] {
  const newest = new Map<string, string>();
  for (const row of rows) {
    const key = namedCopyKey(row);
    if (!key) continue;
    const created = String(row.created_at || '');
    const prev = newest.get(key);
    if (prev == null || created > prev) newest.set(key, created);
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = namedCopyKey(row);
    if (!key) {
      out.push(row);
      continue;
    }
    if (String(row.created_at || '') !== newest.get(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
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
