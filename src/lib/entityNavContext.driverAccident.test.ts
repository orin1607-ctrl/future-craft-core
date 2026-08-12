import { describe, expect, it } from 'vitest';
import { buildDriverAccidentReportUrl } from './entityNavContext';

describe('buildDriverAccidentReportUrl', () => {
  it('opens existing accidents form with driver context', () => {
    const url = buildDriverAccidentReportUrl({
      driverId: 'drv-1',
      driverName: 'ישראל ישראלי',
      plate: '12-345-67',
    });
    expect(url.startsWith('/accidents?')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('action')).toBe('new');
    expect(q.get('context')).toBe('driver');
    expect(q.get('driverId')).toBe('drv-1');
    expect(q.get('driverName')).toBe('ישראל ישראלי');
    expect(q.get('section')).toBe('driving');
    expect(q.get('plate')).toBe('12-345-67');
  });

  it('omits plate when not provided', () => {
    const url = buildDriverAccidentReportUrl({ driverId: 'x', driverName: 'A' });
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('plate')).toBeNull();
  });
});
