/** Resolve plate/company/vehicle for Dalia vehicle-card document uploads. */

export function readDomField(name: string): string {
  if (typeof document === 'undefined') return '';
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) return '';
  const el = document.querySelector(`[name="${safe}"]`) as HTMLInputElement | HTMLSelectElement | null;
  return el?.value?.trim() || '';
}

export function resolveVehicleCardUploadFields(
  getValue: (name: string) => string,
  userCompany?: string | null,
): {
  rawPlate: string;
  plate: string;
  formCompany: string;
  vehicleId: string;
} {
  const rawPlate = (getValue('vehicle_plate') || '').trim();
  const plate = (rawPlate || 'vehicle').replace(/[-\s]/g, '');
  const formCompany =
    (getValue('company') || '').trim() ||
    (getValue('company_name') || '').trim() ||
    (userCompany || '').trim();
  const vehicleId = (getValue('vehicle_id') || '').trim();
  return { rawPlate, plate, formCompany, vehicleId };
}
