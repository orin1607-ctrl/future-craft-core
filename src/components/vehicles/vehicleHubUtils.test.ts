import { describe, expect, it } from 'vitest';
import { addCalendarMonths } from '@/lib/vehicleActionFollowUp';
import { formatExpiry, getInspectionDashboardCard, pickInspectionForDashboard } from './vehicleHubUtils';

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

  it('derives a three-month due date when the saved next due equals the performed date', () => {
    expect(getInspectionDashboardCard({
      inspection_type: 'tri_semi_annual',
      inspection_date: '2026-08-16',
      next_due_date: null,
    })).toEqual({
      label: 'בדיקה תלת חודשית',
      nextDueDate: addCalendarMonths('2026-08-16', 3),
    });
  });

  it('never displays the performed inspection date as the future due date', () => {
    const card = getInspectionDashboardCard({
      inspection_type: 'tri_semi_annual',
      inspection_date: '2026-08-24',
      next_due_date: '2026-08-24',
    });
    expect(card?.nextDueDate).toBe(addCalendarMonths('2026-08-24', 3));
    expect(card?.nextDueDate).not.toBe('2026-08-24');
    expect(card?.label).toBe('בדיקה תלת חודשית');
  });

  it('uses the vehicle next-inspection date when it is later than a stale row', () => {
    expect(getInspectionDashboardCard({
      inspection_type: 'tri_semi_annual',
      inspection_date: '2026-08-24',
      next_due_date: '2026-08-24',
    }, '2027-02-24')).toEqual({
      label: 'בדיקה חצי שנתית',
      nextDueDate: '2027-02-24',
    });
  });

  it('picks the latest inspection whose next due is after the performed date', () => {
    const picked = pickInspectionForDashboard([
      {
        inspection_type: 'tri_semi_annual',
        inspection_date: '2026-08-24',
        next_due_date: '2026-08-24',
      },
      {
        inspection_type: 'tri_semi_annual',
        inspection_date: '2026-08-24',
        next_due_date: '2026-11-24',
      },
    ]);
    expect(picked?.next_due_date).toBe('2026-11-24');
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
