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
import { classifyExpiryForActiveList, expiryAlertTitle } from './vehicleExpiryReminders';
import { DEFAULT_ALERT_THRESHOLDS } from './vehicleTrackingAlerts';
import { DEFAULT_VEHICLE_TYPES, withRequiredVehicleTypes } from './vehicleTypesConfig';
import { driverExpiryToLogEntries, vehicleExpiryToLogEntries } from './expiryAlertFeed';
import { OFFICER_ALERT_LABEL } from './vehicleActionFollowUp';
import { isDriverHubDashboardHidden } from './hiddenButtons';

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

describe('expiry active list', () => {
  it('shows expired, current window, and future including >30 days', () => {
    expect(classifyExpiryForActiveList(0)).toBe('active');
    expect(classifyExpiryForActiveList(14)).toBe('active');
    expect(classifyExpiryForActiveList(90)).toBe('future');
    expect(classifyExpiryForActiveList(-1)).toBe('expired');
    expect(classifyExpiryForActiveList(null)).toBe('none');
  });
  it('labels future vs near expiry', () => {
    expect(expiryAlertTitle('טסט', 90, DEFAULT_ALERT_THRESHOLDS)).toContain('עתידית');
    expect(expiryAlertTitle('טסט', 7, DEFAULT_ALERT_THRESHOLDS)).toContain('7');
  });
});

describe('required vehicle types overlay', () => {
  it('keeps old types and adds the four new ones without duplicating אחר', () => {
    const merged = withRequiredVehicleTypes([
      { id: 'private', label: 'רכב פרטי' },
      { id: 'other', label: 'אחר' },
    ]);
    const labels = merged.map((t) => t.label);
    expect(labels).toContain('נגרר');
    expect(labels).toContain('טרקטור');
    expect(labels).toContain('ציוד הנדסי');
    expect(labels).toContain('רכב זעיר');
    expect(labels).toContain('רכב פרטי');
    expect(labels.filter((l) => l === 'אחר')).toHaveLength(1);
    expect(labels.indexOf('נגרר')).toBeLessThan(labels.indexOf('אחר'));
  });
  it('does not duplicate when defaults already include them', () => {
    const merged = withRequiredVehicleTypes(DEFAULT_VEHICLE_TYPES);
    expect(merged.filter((t) => t.id === 'trailer')).toHaveLength(1);
  });
});

describe('expiry alert feed (unified log)', () => {
  it('emits test, insurance and officer future dates without inventing docs', () => {
    const rows = vehicleExpiryToLogEntries({
      id: 'veh-1',
      license_plate: '45954002',
      company_name: 'QA-Company-A',
      test_expiry: '2026-08-20',
      insurance_expiry: '2026-12-01',
      next_inspection_date: '2026-11-13',
    });
    const topics = rows.map((r) => r.topic);
    expect(topics).toContain('טסט / רישיון רכב');
    expect(topics).toContain('ביטוח חובה');
    expect(topics).toContain(OFFICER_ALERT_LABEL);
    expect(rows.every((r) => r.vehiclePlate === '45954002')).toBe(true);
    expect(rows.some((r) => r.timing === 'future')).toBe(true);
  });

  it('skips expired dates so they leave the active list', () => {
    const rows = vehicleExpiryToLogEntries({
      id: 'veh-2',
      license_plate: '111',
      test_expiry: '2020-01-01',
    });
    expect(rows).toHaveLength(0);
  });

  it('emits driver license expiry', () => {
    const rows = driverExpiryToLogEntries({
      id: 'drv-1',
      full_name: 'נהג בדיקה',
      license_expiry: '2026-09-01',
    });
    expect(rows[0].topic).toBe('רישיון נהיגה');
    expect(rows[0].driverId).toBe('drv-1');
  });
});

describe('driver hub dashboard hide key', () => {
  it('matches settings key and hebrew label', () => {
    expect(isDriverHubDashboardHidden(['driver-hub-dashboard'])).toBe(true);
    expect(isDriverHubDashboardHidden(['פתח דשבורד נהג'])).toBe(true);
    expect(isDriverHubDashboardHidden(['/vehicles'])).toBe(false);
  });
});
