/** Garage-photo assignment helpers. Separate from assigned_to. Staging only. */

export const GARAGE_STATUSES = [
  { key: 'pending', label: 'ממתין לצילום' },
  { key: 'in_progress', label: 'צילום בתהליך' },
  { key: 'completed', label: 'צילום הושלם' },
] as const;

export type GarageStatus = (typeof GARAGE_STATUSES)[number]['key'];

export type GarageAssignment = {
  id: string;
  claim_id: string;
  worker_id: string;
  worker_name: string;
  status: GarageStatus | string;
  worker_note?: string;
  photo_count?: number;
  assigned_by_name?: string;
  assigned_at?: string;
  completed_at?: string | null;
};

export function garageStatusLabel(status?: string) {
  return GARAGE_STATUSES.find((s) => s.key === status)?.label || 'לא שויך';
}

export function isGaragePhoto(file: { doc_kind?: string; doc_meta?: Record<string, string> | null }) {
  const st = String(file.doc_meta?.staff_type || '');
  return file.doc_kind === 'garage_photo' || st === 'garage_photos';
}

export function publicGarageClaimFields(row: {
  id?: string;
  client_name?: string;
  plate?: string;
  row_data?: Record<string, unknown> | null;
}) {
  const rd = row.row_data && typeof row.row_data === 'object' ? row.row_data : {};
  const str = (k: string, fallback = '') => String((rd as Record<string, unknown>)[k] || fallback || '').trim();
  return {
    id: String(row.id || ''),
    client_name: String(row.client_name || str('clientName') || ''),
    plate: String(row.plate || str('plate') || ''),
    car_model: str('carModel'),
    garage_name: str('garageName'),
    event_date: str('eventDate'),
  };
}
