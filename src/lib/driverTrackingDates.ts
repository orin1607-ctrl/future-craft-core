/** Calendar-day helpers used by the driver-tracking validity cards.
 * Same behavior as the staging screen. Kept local so Production does not
 * import the expiry-officer module.
 */

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Whole calendar days from today to the expiry date (negative = already expired). */
export function calendarDaysLeft(
  dateStr: string | null | undefined,
  today = todayIsoDate(),
): number | null {
  const d = toIsoDate(dateStr);
  if (!d) return null;
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(`${d}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}
