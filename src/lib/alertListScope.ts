/** Shared Alerts list scope so dashboard counts and Alerts filters stay aligned. */

export type AlertListScope = 'urgent' | 'expired' | 'all';

export const INSURANCE_ALERT_CATEGORIES = [
  'insurance',
  'comprehensive_insurance',
  'third_party_insurance',
] as const;

export type InsuranceAlertCategory = (typeof INSURANCE_ALERT_CATEGORIES)[number];

export function parseAlertListScope(raw: string | null | undefined): AlertListScope {
  if (raw === 'expired' || raw === 'all' || raw === 'urgent') return raw;
  return 'urgent';
}

export function parseAlertWindowDays(raw: string | null | undefined, fallback = 30): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(365, Math.floor(n));
}

export function isInsuranceAlertCategory(category: string): boolean {
  return (INSURANCE_ALERT_CATEGORIES as readonly string[]).includes(category);
}

/** Dashboard "ביטוח מתקרב" includes חובה + מקיף + צד ג׳. */
export function alertCategoryMatches(filter: string | 'all', category: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'insurance') return isInsuranceAlertCategory(category);
  return filter === category;
}

export function alertInScope(
  daysLeft: number | null,
  scope: AlertListScope,
  windowDays: number,
): boolean {
  if (scope === 'all') return true;
  if (scope === 'expired') return daysLeft !== null && daysLeft < 0;
  if (daysLeft === null) return true;
  return daysLeft <= windowDays;
}

export function buildAlertsHref(opts: {
  category?: string;
  scope?: AlertListScope;
  days?: number;
}): string {
  const q = new URLSearchParams();
  if (opts.category && opts.category !== 'all') q.set('category', opts.category);
  q.set('scope', opts.scope || 'urgent');
  if (opts.days && opts.days !== 30) q.set('days', String(opts.days));
  const s = q.toString();
  return s ? `/alerts?${s}` : '/alerts';
}
