/** Dedicated garage-photographer marker. Reuses existing Auth `driver` role — no new role enum. */
export const GARAGE_PHOTOGRAPHER_JOB_TITLE = 'garage_photographer';
export const GARAGE_PHOTOGRAPHER_LABEL = 'עובד צילומי מוסך';

export function isGaragePhotographerJobTitle(jobTitle?: string | null) {
  return String(jobTitle || '').trim() === GARAGE_PHOTOGRAPHER_JOB_TITLE;
}

export function garagePortalUrl(workerId: string, baseUrl = import.meta.env.BASE_URL || '/') {
  const base = String(baseUrl || '/').replace(/\/?$/, '/');
  return `${base}garage?worker=${encodeURIComponent(workerId)}`;
}

export function openGarageWorkerPortal(workerId: string) {
  if (!workerId) return;
  window.open(garagePortalUrl(workerId), '_blank', 'noopener');
}
