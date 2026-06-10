import { describe, expect, it } from 'vitest';
import { buildReminderOffsets } from './companySettings';

describe('companySettings', () => {
  it('builds default reminder offsets', () => {
    expect(buildReminderOffsets(null)).toEqual([30, 7, 1]);
  });

  it('respects disabled reminder toggles', () => {
    expect(
      buildReminderOffsets({
        alert_days_before: 45,
        reminder_30_days: true,
        reminder_7_days: false,
        reminder_1_day: true,
      }),
    ).toEqual([45, 1]);
  });

  it('uses alert_days_before for first reminder', () => {
    expect(
      buildReminderOffsets({
        alert_days_before: 14,
        reminder_30_days: true,
        reminder_7_days: true,
        reminder_1_day: false,
      }),
    ).toEqual([14, 7]);
  });
});
