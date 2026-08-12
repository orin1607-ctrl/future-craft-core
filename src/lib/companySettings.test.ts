import { describe, expect, it, beforeEach } from 'vitest';
import { buildReminderOffsets, clearCompanySettingsCache, _companySettingsCacheSizeForTests } from './companySettings';

describe('companySettings helpers', () => {
  beforeEach(() => {
    clearCompanySettingsCache();
  });

  it('buildReminderOffsets defaults to 30/7/1', () => {
    expect(buildReminderOffsets(null)).toEqual([30, 7, 1]);
  });

  it('buildReminderOffsets respects toggles without inventing 60/90', () => {
    expect(
      buildReminderOffsets({
        alert_days_before: 30,
        reminder_30_days: true,
        reminder_7_days: false,
        reminder_1_day: true,
      }),
    ).toEqual([30, 1]);
  });

  it('clearCompanySettingsCache resets cache size', () => {
    expect(_companySettingsCacheSizeForTests()).toBe(0);
  });
});
