import { describe, expect, it } from 'vitest';
import { sortByExactInternalNumberFirst } from './internalNumberSearch';
import {
  addCalendarMonths,
  classifyAlertTiming,
  driverIdFromAlertText,
  driverNameFromAlertText,
  formatDriverAlertMeta,
  parseOdometerKm,
  shouldUpdateOdometer,
} from './vehicleActionFollowUp';

describe('internal number exact-first sort', () => {
  it('puts exact "19" before "019" and other includes', () => {
    const rows = [
      { internal_number: '119' },
      { internal_number: '019' },
      { internal_number: '19' },
      { internal_number: '190' },
    ];
    const sorted = sortByExactInternalNumberFirst(rows, '19');
    expect(sorted[0].internal_number).toBe('19');
    expect(sorted.slice(1).map((r) => r.internal_number)).toEqual(['119', '019', '190']);
  });

  it('does not treat 019 as exact match for 19', () => {
    const rows = [{ internal_number: '019' }, { internal_number: '19' }];
    expect(sortByExactInternalNumberFirst(rows, '19')[0].internal_number).toBe('19');
    expect(sortByExactInternalNumberFirst(rows, '019')[0].internal_number).toBe('019');
  });
});

describe('driver alert meta', () => {
  it('round-trips uuid and hebrew name', () => {
    const id = 'f267e18e-d52d-4737-97f4-c6e78bff0d0d';
    const meta = formatDriverAlertMeta(id, 'יוסי כהן');
    expect(driverIdFromAlertText(meta)).toBe(id);
    expect(driverNameFromAlertText(meta)).toBe('יוסי כהן');
  });
});

describe('alert timing buckets', () => {
  const now = new Date('2026-08-13T12:00:00Z');
  it('classifies near / future / history without deleting', () => {
    expect(classifyAlertTiming('2026-08-20', true, now)).toBe('active');
    expect(classifyAlertTiming('2026-12-01', true, now)).toBe('future');
    expect(classifyAlertTiming('2026-07-01', true, now)).toBe('history');
    expect(classifyAlertTiming('2026-12-01', false, now)).toBe('history');
  });
});

describe('odometer sync guard', () => {
  it('parses thousands separators', () => {
    expect(parseOdometerKm('85,000')).toBe(85000);
  });
  it('does not overwrite a newer higher reading', () => {
    expect(shouldUpdateOdometer(90000, 85000)).toBe(false);
    expect(shouldUpdateOdometer(80000, 85000)).toBe(true);
    expect(shouldUpdateOdometer(85000, 85000)).toBe(true);
  });
});

describe('next due months', () => {
  it('adds 3 and 6 calendar months', () => {
    expect(addCalendarMonths('2026-08-13', 3)).toBe('2026-11-13');
    expect(addCalendarMonths('2026-08-13', 6)).toBe('2027-02-13');
  });
});
