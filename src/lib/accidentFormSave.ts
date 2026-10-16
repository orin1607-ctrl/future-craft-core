import { accidentDateForSave } from '@/lib/accidentDateTime';

/** Investigation answers stay out of the save payload until dedicated columns exist. */
export const ACCIDENT_INVESTIGATION_SAVE_ENABLED = false;

export const DRIVER_FAULT_DEFAULT = 'undetermined';
export const INVESTIGATION_DONE_DEFAULT = 'not_done';

export const DRIVER_FAULT_OPTIONS = [
  { value: 'undetermined', label: 'טרם נקבע' },
  { value: 'yes', label: 'כן' },
  { value: 'no', label: 'לא' },
] as const;

export const INVESTIGATION_DONE_OPTIONS = [
  { value: 'not_done', label: 'טרם בוצע' },
  { value: 'yes', label: 'כן' },
  { value: 'no', label: 'לא' },
] as const;

export type AccidentFormFields = {
  originalDate?: string | null;
  accidentDate: string;
  accidentTime: string;
  vehiclePlate: string;
  driverName: string;
  location: string;
  description: string;
  hasInsurance: boolean;
  thirdParty: boolean;
  estimatedCost: string;
  claimNumber: string;
  notes: string;
  imageUrls: string[];
};

export function accidentUpdatePayload(fields: AccidentFormFields): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    vehicle_plate: fields.vehiclePlate,
    driver_name: fields.driverName,
    location: fields.location,
    description: fields.description,
    has_insurance: fields.hasInsurance,
    third_party: fields.thirdParty,
    estimated_cost: parseFloat(fields.estimatedCost) || 0,
    claim_number: fields.claimNumber.trim(),
    notes: fields.notes,
    images: JSON.stringify(fields.imageUrls),
  };
  const dateIso = accidentDateForSave(fields.originalDate, fields.accidentDate, fields.accidentTime);
  if (dateIso) payload.date = dateIso;
  return payload;
}
