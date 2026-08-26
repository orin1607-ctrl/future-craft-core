import { describe, expect, it } from 'vitest';
import { formatDurationSeconds, formatTimeRange, inDayRange, inStampWindow, localClockStr } from '@/features/telemarketing/lib/formatTime';

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

  it('treats empty hour bounds as the same as inDayRange', () => {
    const iso = '2026-08-24T12:00:00.000Z';
    expect(inStampWindow(iso, '2026-08-24', '2026-08-24')).toBe(inDayRange(iso, '2026-08-24', '2026-08-24'));
    expect(inStampWindow(iso, '2026-08-24', '2026-08-24', '', '')).toBe(true);
    expect(inStampWindow(iso, '2026-08-23', '2026-08-23')).toBe(false);
  });

  it('keeps a stamp inside its own minute and drops 00:00–00:00 for midday UTC', () => {
    const iso = '2026-08-24T12:00:00.000Z';
    const clock = localClockStr(iso);
    expect(inStampWindow(iso, '2026-08-24', '2026-08-24', clock, clock)).toBe(true);
    expect(inStampWindow(iso, '2026-08-24', '2026-08-24', '00:00', '00:00')).toBe(false);
  });
});
