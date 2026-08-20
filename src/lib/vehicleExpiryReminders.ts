import type { CompanyAlertThresholds } from '@/lib/vehicleTrackingAlerts';

/** Active reminder tier for expiry-based alerts (30 → 7 → 1 day windows). */
export type ExpiryReminderTier = 30 | 7 | 1;

export type ExpiryActiveListKind = 'none' | 'expired' | 'active' | 'future';

export function expiryReminderTier(
  daysLeft: number | null,
  thresholds: CompanyAlertThresholds,
): ExpiryReminderTier | null {
  if (daysLeft === null) return null;
  const first = thresholds.firstDays;
  if (daysLeft > first) return null;
  if (thresholds.show1 && daysLeft <= 1) return 1;
  if (thresholds.show7 && daysLeft <= 7) return 7;
  return first as ExpiryReminderTier;
}

/** Alerts list: expired stay visible, plus current window and future (>30). */
export function classifyExpiryForActiveList(daysLeft: number | null): ExpiryActiveListKind {
  if (daysLeft === null) return 'none';
  if (daysLeft < 0) return 'expired';
  if (daysLeft > 30) return 'future';
  return 'active';
}

export function expiryAlertTitle(
  subject: string,
  daysLeft: number,
  thresholds: CompanyAlertThresholds,
): string {
  if (daysLeft < 0) return `${subject} · פג תוקף`;
  if (daysLeft === 0) return `${subject} · פג היום`;
  if (daysLeft > 30) return `${subject} · עתידית`;
  const tier = expiryReminderTier(daysLeft, thresholds);
  if (tier) return tierLabel(tier, subject);
  return subject;
}

export function tierLabel(tier: ExpiryReminderTier, subject: string): string {
  if (tier === 1) return `${subject} · תזכורת יום אחד`;
  if (tier === 7) return `${subject} · תזכורת 7 ימים`;
  return `${subject} · התראת ${tier} יום`;
}

export function tierDetail(date: string | null, daysLeft: number | null, tier: ExpiryReminderTier): string {
  if (daysLeft === null) return 'תאריך לא תקין';
  const datePart = date ? ` (${date})` : '';
  if (tier === 1) {
    if (daysLeft < 0) return `פג לפני ${Math.abs(daysLeft)} ימים${datePart}`;
    if (daysLeft === 0) return `פג היום${datePart}`;
    if (daysLeft === 1) return `מחר${datePart}`;
    return `עוד ${daysLeft} ימים${datePart}`;
  }
  if (daysLeft < 0) return `פג לפני ${Math.abs(daysLeft)} ימים${datePart}`;
  if (daysLeft === 0) return `פג היום${datePart}`;
  if (daysLeft === 1) return `מחר${datePart}`;
  return `עוד ${daysLeft} ימים${datePart}`;
}
