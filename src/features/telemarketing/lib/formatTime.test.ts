import { describe, expect, it } from 'vitest';
import { formatDurationSeconds, formatTimeRange } from '@/features/telemarketing/lib/formatTime';

describe('formatTime', () => {
  it('formats durations without inventing values', () => {
    expect(formatDurationSeconds(null)).toBe('-');
    expect(formatDurationSeconds(0)).toBe('00:00');
    expect(formatDurationSeconds(75)).toBe('01:15');
    expect(formatDurationSeconds(3661)).toBe('1:01:01');
  });

  it('marks an open range as active instead of overwriting the start', () => {
    expect(formatTimeRange('2026-08-24T07:00:00.000Z', null)).toContain('פעיל');
    expect(formatTimeRange(null, '2026-08-24T07:00:00.000Z')).toBe('-');
  });
});
