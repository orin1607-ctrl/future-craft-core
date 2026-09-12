import {
  VEHICLE_TYPE_OTHER_ID,
  resolveVehicleTypeLabel,
  type VehicleTypeOption,
} from '@/lib/vehicleTypesConfig';

/** Trimmed vehicle type as stored on vehicles.vehicle_type (סוג רכב / סוג כלי). */
export function normalizeVehicleType(value: string | null | undefined): string {
  return (value || '').trim();
}

/**
 * Empty / "הכל" selected type means no type filtering.
 * Matches the existing vehicles.vehicle_type field by stored value, config id, or display label
 * so "מלגזה" still hits rows saved as the label or as the type id.
 */
export function vehicleTypeMatches(
  storedType: string | null | undefined,
  selectedType: string | null | undefined,
  types: VehicleTypeOption[] = [],
): boolean {
  const selected = normalizeVehicleType(selectedType);
  if (!selected) return true;

  const stored = normalizeVehicleType(storedType);
  if (!stored) return false;
  if (stored === selected) return true;

  const storedLabel = resolveVehicleTypeLabel(types, stored);
  const selectedLabel = resolveVehicleTypeLabel(types, selected);
  return Boolean(storedLabel) && storedLabel === selectedLabel;
}

export function uniqueReportVehicleTypes(
  vehicles: Array<{ vehicle_type?: string | null }>,
  configured: VehicleTypeOption[] = [],
): string[] {
  const labels = new Set<string>();

  for (const t of configured) {
    if (t.id === VEHICLE_TYPE_OTHER_ID || t.label === 'אחר') continue;
    const label = normalizeVehicleType(t.label);
    if (label) labels.add(label);
  }

  for (const v of vehicles) {
    const resolved = resolveVehicleTypeLabel(configured, v.vehicle_type);
    if (resolved) labels.add(resolved);
  }

  return [...labels].sort((a, b) => a.localeCompare(b, 'he'));
}

export function buildPlateToVehicleType(
  vehicles: Array<{ license_plate?: string | null; vehicle_type?: string | null }>,
  normalizePlate: (plate: string) => string,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of vehicles) {
    const plate = normalizeVehicleType(v.license_plate);
    const type = normalizeVehicleType(v.vehicle_type);
    if (!plate || !type) continue;
    map[plate] = type;
    map[normalizePlate(plate)] = type;
  }
  return map;
}

export function lookupVehicleTypeForPlate(
  plate: string | null | undefined,
  plateToType: Record<string, string>,
  normalizePlate: (plate: string) => string,
  fallbackType?: string | null,
): string {
  const fromRow = normalizeVehicleType(fallbackType);
  if (fromRow) return fromRow;
  if (!plate) return '';
  return plateToType[plate] || plateToType[normalizePlate(plate)] || '';
}
