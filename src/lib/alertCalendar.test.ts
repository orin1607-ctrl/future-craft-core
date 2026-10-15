import { describe, expect, it } from 'vitest';
import { alertCalendarDaysLeft, formatAlertCalendarDate } from './alertCalendar';

describe('alert calendar days', () => {
  const now = new Date('2026-10-16T01:07:54+03:00');

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
