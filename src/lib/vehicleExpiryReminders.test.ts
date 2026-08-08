import { describe, expect, it } from 'vitest';
import { expiryReminderTier } from './vehicleExpiryReminders';
import { DEFAULT_ALERT_THRESHOLDS } from './vehicleTrackingAlerts';

describe('expiryReminderTier', () => {
  const t = DEFAULT_ALERT_THRESHOLDS;

  it('returns null above 30 days', () => {
    expect(expiryReminderTier(57, t)).toBeNull();
    expect(expiryReminderTier(31, t)).toBeNull();
    expect(expiryReminderTier(60, t)).toBeNull();
    expect(expiryReminderTier(90, t)).toBeNull();
  });

  it('returns tier 30 between 8 and 30 days', () => {
    expect(expiryReminderTier(30, t)).toBe(30);
    expect(expiryReminderTier(20, t)).toBe(30);
    expect(expiryReminderTier(8, t)).toBe(30);
  });

  it('returns tier 7 between 2 and 7 days', () => {
    expect(expiryReminderTier(7, t)).toBe(7);
    expect(expiryReminderTier(3, t)).toBe(7);
    expect(expiryReminderTier(2, t)).toBe(7);
  });

  it('returns tier 1 at 1 day or less', () => {
    expect(expiryReminderTier(1, t)).toBe(1);
    expect(expiryReminderTier(0, t)).toBe(1);
    expect(expiryReminderTier(-3, t)).toBe(1);
  });
});
