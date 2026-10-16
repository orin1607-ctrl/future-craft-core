import { describe, expect, it } from 'vitest';
import { alertCalendarDaysLeft, formatAlertCalendarDate } from './alertCalendar';

describe('alert calendar days', () => {
  // Local wall clock on 16 Oct 2026 at 01:07. An offset instant would be the
  // previous date on a UTC runner, which is not the clock the screen uses.
  const now = new Date(2026, 9, 16, 1, 7, 54);

  it('counts a date-only alert by calendar days, matching the displayed date', () => {
    expect(formatAlertCalendarDate('2026-10-17', now)).toBe('17.10.2026');
    expect(alertCalendarDaysLeft('2026-10-17', now)).toBe(1);
  });

  it('counts today as zero and an invalid date as empty', () => {
    expect(alertCalendarDaysLeft('2026-10-16', now)).toBe(0);
    expect(alertCalendarDaysLeft('not-a-date', now)).toBeNull();
    expect(formatAlertCalendarDate('', now)).toBe('');
  });
});
