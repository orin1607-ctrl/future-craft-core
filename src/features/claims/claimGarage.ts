/** Garage-photo assignment helpers. Separate from assigned_to. Staging only. */

export const GARAGE_STATUSES = [
  { key: 'pending', label: 'ממתין לצילום' },
  { key: 'in_progress', label: 'צילום בתהליך' },
  { key: 'completed', label: 'צילום הושלם' },
] as const;

export type GarageStatus = (typeof GARAGE_STATUSES)[number]['key'];

export const GARAGE_REVIEW_STATUSES = [
  { key: 'awaiting_review', label: 'התקבל — לבדיקה', workerLabel: 'נשלח לבדיקה' },
  { key: 'approved', label: 'אושר', workerLabel: 'אושר' },
  { key: 'needs_update', label: 'נדרש להשלים', workerLabel: 'נדרש להשלים' },
] as const;

export type GarageReviewStatus = (typeof GARAGE_REVIEW_STATUSES)[number]['key'] | '';

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
  review_status?: GarageReviewStatus | string;
  review_note?: string;
  reviewed_by?: string | null;
  reviewed_by_name?: string;
  reviewed_at?: string | null;
};

export function garageStatusLabel(status?: string) {
  return GARAGE_STATUSES.find((s) => s.key === status)?.label || 'לא שויך';
}

export function garageReviewLabel(status?: string) {
  return GARAGE_REVIEW_STATUSES.find((s) => s.key === status)?.label || '';
}

export function garageWorkerReviewLabel(status?: string) {
  return GARAGE_REVIEW_STATUSES.find((s) => s.key === status)?.workerLabel || '';
}

export function isGarageAwaitingReview(status?: string) {
  return status === 'awaiting_review';
}

export function formatGarageReviewedAt(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('he-IL');
}

export function isGaragePhoto(file: { doc_kind?: string; doc_meta?: Record<string, string> | null }) {
  const st = String(file.doc_meta?.staff_type || '');
  return file.doc_kind === 'garage_photo' || st === 'garage_photos';
}

/** Display-only helper. Does not copy files or change storage. */
export function garagePhotosOf<T extends { doc_kind?: string; doc_meta?: Record<string, string> | null }>(files: T[]) {
  return files.filter(isGaragePhoto);
}

export function garageShareIdsAllowed(
  fileIds: string[],
  garageFiles: Array<{ id: string; claim_id?: string }>,
  claimId: string,
) {
  const allowed = new Set(
    garageFiles.filter((f) => !f.claim_id || f.claim_id === claimId).map((f) => f.id),
  );
  const unique = [...new Set(fileIds.map(String).filter(Boolean))];
  if (!unique.length) return { ok: false as const, error: 'נא לבחור לפחות תמונת מוסך אחת', ids: [] as string[] };
  if (unique.some((id) => !allowed.has(id))) return { ok: false as const, error: 'BLOCKED', ids: [] as string[] };
  return { ok: true as const, ids: unique };
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
