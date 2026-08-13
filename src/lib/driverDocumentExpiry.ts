export type DocumentExpiryStatus = 'valid' | 'warning' | 'expired' | 'unknown';

/** Add whole years to an ISO date string (YYYY-MM-DD). */
export function addYearsToDate(isoDate: string, years: number): string {
  const d = new Date(isoDate.includes('T') ? isoDate : `${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
}

/** Compute expiry from issue date + configured validity years. */
export function computeExpiryFromValidity(issueDate: string | null | undefined, validityYears: number | null | undefined): string | null {
  if (!issueDate || !validityYears || validityYears < 1) return null;
  const out = addYearsToDate(issueDate, validityYears);
  return out || null;
}

export function daysUntilDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

/** Status for display badges (30-day warning window aligns with fleet alerts). */
export function documentExpiryStatus(expiryDate: string | null | undefined, warnWithinDays = 30): DocumentExpiryStatus {
  const days = daysUntilDate(expiryDate);
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= warnWithinDays) return 'warning';
  return 'valid';
}

export function documentExpiryStatusLabel(status: DocumentExpiryStatus): string {
  switch (status) {
    case 'valid':
      return 'תקף';
    case 'warning':
      return 'מתקרב לתפוגה';
    case 'expired':
      return 'פג תוקף';
    default:
      return '—';
  }
}

export function formatIsraelDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('he-IL');
}
