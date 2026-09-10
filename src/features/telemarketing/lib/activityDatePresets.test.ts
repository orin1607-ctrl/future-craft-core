import { describe, expect, it } from 'vitest';
import { activityDatePreset } from '@/features/telemarketing/lib/activityDatePresets';

describe('activityDatePreset', () => {
  const now = new Date(2026, 7, 26, 12, 0, 0);

  it('covers today, yesterday, week (Sunday start) and month', () => {
    expect(activityDatePreset('today', now)).toEqual({ from: '2026-08-26', to: '2026-08-26' });
    expect(activityDatePreset('yesterday', now)).toEqual({ from: '2026-08-25', to: '2026-08-25' });
    expect(activityDatePreset('week', now)).toEqual({ from: '2026-08-23', to: '2026-08-26' });
    expect(activityDatePreset('month', now)).toEqual({ from: '2026-08-01', to: '2026-08-26' });
    expect(activityDatePreset('custom', now)).toEqual({ from: '2026-08-26', to: '2026-08-26' });
  });
});
