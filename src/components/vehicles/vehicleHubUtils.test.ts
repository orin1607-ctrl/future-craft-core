import { describe, expect, it } from 'vitest';
import { formatExpiry, getInspectionDashboardCard } from './vehicleHubUtils';

describe('getInspectionDashboardCard', () => {
  it('uses the saved next due date for a three-month inspection', () => {
    expect(getInspectionDashboardCard({
      inspection_type: 'tri_semi_annual',
      inspection_date: '2026-08-16',
      next_due_date: '2026-11-16',
    })).toEqual({
      label: 'בדיקה תלת חודשית',
      nextDueDate: '2026-11-16',
    });
  });

  it('uses the saved next due date and half-year label for six months', () => {
    expect(getInspectionDashboardCard({
      inspection_type: 'tri_semi_annual',
      inspection_date: '2026-08-16',
      next_due_date: '2027-02-16',
    })).toEqual({
      label: 'בדיקה חצי שנתית',
      nextDueDate: '2027-02-16',
    });
  });

  it('preserves an explicit semi-annual inspection type', () => {
    expect(getInspectionDashboardCard({
      inspection_type: 'semi_annual',
      inspection_date: '2026-08-16',
      next_due_date: '2027-02-16',
    })?.label).toBe('בדיקה חצי שנתית');
  });

  it('returns no card schedule when no next due date was saved', () => {
    expect(getInspectionDashboardCard({
      inspection_type: 'tri_semi_annual',
      inspection_date: '2026-08-16',
      next_due_date: null,
    })).toBeNull();
  });
});

describe('inspection expiry display', () => {
  it('does not mark a future next due date as expired', () => {
    expect(formatExpiry('2099-11-16')).not.toContain('פג');
  });

  it('keeps a genuinely passed next due date expired', () => {
    expect(formatExpiry('2020-01-01')).toContain('פג');
  });
});
