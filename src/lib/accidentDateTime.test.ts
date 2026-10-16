import { describe, expect, it } from 'vitest';
import { accidentDateForSave, formatAccidentWall, isoToIsraelWall, israelWallTimeToIso } from './accidentDateTime';

describe('accident date and time', () => {
  it('round-trips Israel summer time without a UTC shift', () => {
    const iso = israelWallTimeToIso('2026-10-16', '01:07');
    expect(iso).toBe('2026-10-15T22:07:00.000Z');
    expect(isoToIsraelWall(iso)).toEqual({ date: '2026-10-16', time: '01:07' });
    expect(formatAccidentWall(iso)).toEqual({ date: '16.10.2026', time: '01:07' });
  });

  it('round-trips Israel winter time without a UTC shift', () => {
    const iso = israelWallTimeToIso('2026-01-15', '01:07');
    expect(iso).toBe('2026-01-14T23:07:00.000Z');
    expect(isoToIsraelWall(iso)).toEqual({ date: '2026-01-15', time: '01:07' });
  });

  it('does not invent a timestamp from a partial value', () => {
    expect(israelWallTimeToIso('2026-06-15', '')).toBeNull();
    expect(israelWallTimeToIso('', '14:30')).toBeNull();
  });

  it('keeps the stored timestamp when the displayed minute did not change', () => {
    const stored = '2026-10-15T22:07:45.000Z';
    expect(isoToIsraelWall(stored)).toEqual({ date: '2026-10-16', time: '01:07' });
    expect(accidentDateForSave(stored, '2026-10-16', '01:07')).toBeUndefined();
  });

  it('writes a new timestamp only after the wall clock changes', () => {
    const stored = '2026-10-15T22:07:45.000Z';
    expect(accidentDateForSave(stored, '2026-10-16', '01:08')).toBe('2026-10-15T22:08:00.000Z');
  });
});
