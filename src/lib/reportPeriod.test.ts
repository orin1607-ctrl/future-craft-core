import { describe, expect, it } from 'vitest';
import { formatSummaryHeadline, resolveReportPeriod, dateInReportRange } from './reportPeriod';
import { buildVehicleRenewalEvents, getDaysLeft, renewalStatusLabel } from './vehicleExpiryShared';

describe('reportPeriod', () => {
  it('resolves month with Hebrew suffix', () => {
    const r = resolveReportPeriod('month', undefined, undefined, new Date('2026-10-15T12:00:00'));
    expect(r.from).toBeTruthy();
    expect(r.to).toBeTruthy();
    expect(r.labelSuffix).toMatch(/ב/);
  });

  it('formats headline', () => {
    expect(formatSummaryHeadline(8, 'טסטים', 'באוקטובר')).toBe('8 טסטים באוקטובר');
    expect(formatSummaryHeadline(3, 'תאונות', 'בתקופה שנבחרה')).toBe('3 תאונות בתקופה שנבחרה');
  });

  it('dateInReportRange supports past and future', () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-12-31');
    expect(dateInReportRange('2025-06-01', from, to)).toBe(false);
    expect(dateInReportRange('2026-06-01', from, to)).toBe(true);
    expect(dateInReportRange('2027-06-01', from, to)).toBe(false);
  });
});

describe('vehicleExpiryShared', () => {
  it('builds test + insurance events in range', () => {
    const events = buildVehicleRenewalEvents(
      [
        {
          id: 'v1',
          license_plate: '12-345-67',
          internal_number: '100',
          company_name: 'Acme',
          test_expiry: '2026-10-20',
          insurance_expiry: '2026-11-05',
          comprehensive_insurance_expiry: null,
        },
      ],
      { from: new Date('2026-10-01'), to: new Date('2026-10-31') },
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('test');
    expect(events[0].eventType).toBe('טסט');
    expect(events[0].internalNumber).toBe('100');
  });

  it('getDaysLeft and status labels', () => {
    expect(getDaysLeft(null)).toBeNull();
    expect(renewalStatusLabel('2000-01-01')).toBe('פג תוקף');
  });
});
