import { describe, expect, it } from 'vitest';
import {
  buildPendingExpiryItems,
  canApproveExpiryRenewal,
  filterPendingExpiryItems,
  isExpiryPending,
  isUpcomingInWindow,
  isDueOrUpcomingInWindow,
  matchesExpiryKindQuery,
  pendingItemsForDriver,
  pendingItemsForVehicle,
  todayIsoDate,
  validateNewExpiryDate,
} from './expiryOfficerApproval';

const TODAY = '2026-08-18';

describe('expiry pending detection', () => {
  it('treats dates before today as pending and missing as not pending', () => {
    expect(isExpiryPending('2026-08-10', TODAY)).toBe(true);
    expect(isExpiryPending('2026-08-18', TODAY)).toBe(false);
    expect(isExpiryPending('2026-09-01', TODAY)).toBe(false);
    expect(isExpiryPending(null, TODAY)).toBe(false);
    expect(isExpiryPending('', TODAY)).toBe(false);
  });

  it('does not count expired dates as upcoming reminders', () => {
    expect(isUpcomingInWindow('2026-08-10', 30, TODAY)).toBe(false);
    expect(isUpcomingInWindow('2026-08-18', 30, TODAY)).toBe(true);
    expect(isUpcomingInWindow('2026-09-01', 30, TODAY)).toBe(true);
    expect(isUpcomingInWindow('2026-12-01', 30, TODAY)).toBe(false);
  });

  it('urgent window includes expired plus the coming month', () => {
    expect(isDueOrUpcomingInWindow('2026-08-10', 30, TODAY)).toBe(true);
    expect(isDueOrUpcomingInWindow('2026-08-18', 30, TODAY)).toBe(true);
    expect(isDueOrUpcomingInWindow('2026-09-01', 30, TODAY)).toBe(true);
    expect(isDueOrUpcomingInWindow('2026-12-01', 30, TODAY)).toBe(false);
    expect(isDueOrUpcomingInWindow(null, 30, TODAY)).toBe(false);
  });
});

describe('renewal date validation', () => {
  it('rejects empty, invalid, past, today, and identical dates', () => {
    expect(validateNewExpiryDate('', '2026-08-10', TODAY)).toMatch(/לא הוזן/);
    expect(validateNewExpiryDate('not-a-date', '2026-08-10', TODAY)).toMatch(/אינו תקין/);
    expect(validateNewExpiryDate('2026-08-10', '2026-08-01', TODAY)).toMatch(/פג/);
    expect(validateNewExpiryDate('2026-08-18', '2026-08-01', TODAY)).toMatch(/פג|עתיד/);
    expect(validateNewExpiryDate('2026-08-10', '2026-08-10', TODAY)).toMatch(/זהה|פג/);
  });

  it('accepts a strictly future different date', () => {
    expect(validateNewExpiryDate('2027-01-15', '2026-08-10', TODAY)).toBeNull();
  });
});

describe('pending item build', () => {
  it('emits one row per expired field and does not duplicate test/license', () => {
    const items = pendingItemsForVehicle(
      {
        id: 'v1',
        license_plate: '123',
        company_name: 'QA-A',
        test_expiry: '2026-08-10',
        insurance_expiry: '2026-08-05',
        comprehensive_insurance_expiry: '2027-01-01',
      },
      TODAY,
    );
    expect(items.map((i) => i.kind).sort()).toEqual(['insurance', 'test']);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.find((i) => i.kind === 'test')?.kindLabel).toContain('טסט');
  });

  it('skips archived drivers and keeps company isolation', () => {
    const items = buildPendingExpiryItems(
      [
        { id: 'v1', license_plate: '111', company_name: 'QA-A', test_expiry: '2026-01-01' },
        { id: 'v2', license_plate: '222', company_name: 'QA-B', test_expiry: '2026-01-01' },
      ],
      [
        { id: 'd1', full_name: 'נהג א', company_name: 'QA-A', license_expiry: '2026-01-01' },
        { id: 'd2', full_name: 'נהג ב', company_name: 'QA-A', license_expiry: '2026-01-01', status: 'archived' },
      ],
      { companyFilter: 'QA-A', today: TODAY },
    );
    expect(items.every((i) => i.companyName === 'QA-A')).toBe(true);
    expect(items.some((i) => i.displayName === '222')).toBe(false);
    expect(items.some((i) => i.displayName === 'נהג ב')).toBe(false);
    expect(items.some((i) => i.kind === 'license' && i.displayName === 'נהג א')).toBe(true);
  });

  it('filters by entity and kind', () => {
    const items = buildPendingExpiryItems(
      [{ id: 'v1', license_plate: '123', company_name: 'QA-A', test_expiry: '2026-01-01', insurance_expiry: '2026-01-02' }],
      [{ id: 'd1', full_name: 'ישראל', company_name: 'QA-A', license_expiry: '2026-01-03' }],
      { today: TODAY },
    );
    expect(filterPendingExpiryItems(items, 'drivers')).toHaveLength(1);
    expect(filterPendingExpiryItems(items, 'test')).toHaveLength(1);
    expect(filterPendingExpiryItems(items, 'all').length).toBe(3);
    expect(matchesExpiryKindQuery('insurance')).toBe('insurance');
    expect(matchesExpiryKindQuery('nope')).toBe('all');
  });

  it('does not emit driver exam when only license expired', () => {
    const items = pendingItemsForDriver(
      { id: 'd1', full_name: 'ישראל ישראלי', license_expiry: '2026-08-05', exam_expiry: '2027-01-01' },
      TODAY,
    );
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('license');
  });
});

describe('approval roles', () => {
  it('allows fleet_manager and super_admin only', () => {
    expect(canApproveExpiryRenewal('fleet_manager')).toBe(true);
    expect(canApproveExpiryRenewal('super_admin')).toBe(true);
    expect(canApproveExpiryRenewal('driver')).toBe(false);
    expect(canApproveExpiryRenewal('private_customer')).toBe(false);
  });
});

describe('today helper', () => {
  it('formats local calendar date', () => {
    expect(todayIsoDate(new Date('2026-08-18T22:15:00+03:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
