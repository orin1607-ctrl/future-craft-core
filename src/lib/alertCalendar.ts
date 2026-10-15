import { calendarDaysLeft, todayIsoDate } from '@/lib/vehicleOfficerAlertLight';

/** Calendar date behind an alert, in the viewer's local timezone.
 * A date-only value stays that date. A timestamp uses the local calendar day,
 * the same day shown next to the alert.
 */
export function alertCalendarDate(dateStr: string | null | undefined, now = new Date()): string | null {
  const raw = String(dateStr || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return todayIsoDate(parsed);
}

/** Whole local calendar days from today until the alert date. */
export function alertCalendarDaysLeft(dateStr: string | null | undefined, now = new Date()): number | null {
  return calendarDaysLeft(alertCalendarDate(dateStr, now), todayIsoDate(now));
}

export function formatAlertCalendarDate(dateStr: string | null | undefined, now = new Date()): string {
  const key = alertCalendarDate(dateStr, now);
  if (!key) return '';
  const [year, month, day] = key.split('-');
  return `${day}.${month}.${year}`;
}
