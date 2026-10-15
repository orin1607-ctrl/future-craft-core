import { describe, expect, it } from 'vitest';
import { isoToIsraelWall, israelWallTimeToIso } from './accidentDateTime';

describe('accident date and time', () => {
  it('round-trips an Israel wall time through the existing timestamp', () => {
    const iso = israelWallTimeToIso('2026-06-15', '14:30');
    expect(iso).toBeTruthy();
    expect(isoToIsraelWall(iso)).toEqual({ date: '2026-06-15', time: '14:30' });
  });

  it('does not invent a timestamp from a partial value', () => {
    expect(israelWallTimeToIso('2026-06-15', '')).toBeNull();
    expect(israelWallTimeToIso('', '14:30')).toBeNull();
  });
});
