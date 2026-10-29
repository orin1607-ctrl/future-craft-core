import { describe, expect, it } from 'vitest';
import {
  alertDueLevel,
  buildOfficerAlertLights,
  calendarDaysLeft,
  isOfficerAlertLit,
  officerAlertWindowDays,
  type OfficerAlertRow,
  type OfficerInspectionRow,
} from './vehicleOfficerAlertLight';

const TODAY = '2026-10-29';
const window30 = () => 30;
const V = { id: 'v1', company_name: 'בארי', license_plate: '12-345-67', next_inspection_date: null as string | null };

function officerAlert(id: string, date: string, extra: Partial<OfficerAlertRow> = {}): OfficerAlertRow {
  return {
    id,
    alert_type: 'officer',
    company_name: 'בארי',
    description: `vplate:1234567 vid:v1`,
    alert_date: `${date}T09:00:00`,
    is_active: true,
    title: 'בדיקת ציוד',
    ...extra,
  };
}

function light(rows: OfficerAlertRow[], inspections: OfficerInspectionRow[] = [], vehicle = V) {
  return buildOfficerAlertLights(rows, [vehicle], window30, TODAY, new Map([[vehicle.id, inspections]])).get(vehicle.id);
}

describe('alertDueLevel', () => {
  it('red only after the due date, yellow from today through the window', () => {
    expect(alertDueLevel(-1, 30)).toBe('overdue');
    expect(alertDueLevel(0, 30)).toBe('due_soon');
    expect(alertDueLevel(20, 30)).toBe('due_soon');
    expect(alertDueLevel(30, 30)).toBe('due_soon');
    expect(alertDueLevel(31, 30)).toBe('ok');
    expect(alertDueLevel(null, 30)).toBe('none');
    expect(isOfficerAlertLit(31, 30)).toBe(false);
  });

  it('keeps a per-company window and falls back to 30', () => {
    expect(officerAlertWindowDays(14)).toBe(14);
    expect(officerAlertWindowDays(null)).toBe(30);
    expect(officerAlertWindowDays(-3)).toBe(30);
  });
});

describe('buildOfficerAlertLights', () => {
  it('vehicle with no open action: no light', () => {
    expect(light([])).toBeUndefined();
  });

  it('action due in 20 days: yellow', () => {
    const l = light([officerAlert('a', '2026-11-18')]);
    expect(l?.color).toBe('yellow');
    expect(l?.alerts[0]).toMatchObject({ daysLeft: 20, level: 'due_soon', label: 'בדיקת ציוד' });
  });

  it('action due today: yellow, not red', () => {
    const l = light([officerAlert('a', TODAY)]);
    expect(l?.color).toBe('yellow');
    expect(l?.alerts[0].daysLeft).toBe(0);
  });

  it('overdue action: red with days overdue', () => {
    const l = light([officerAlert('a', '2026-10-20')]);
    expect(l?.color).toBe('red');
    expect(l?.alerts[0]).toMatchObject({ daysLeft: -9, level: 'overdue' });
  });

  it('completed / cancelled action (is_active false): no light', () => {
    expect(light([officerAlert('a', '2026-10-20', { is_active: false })])).toBeUndefined();
  });

  it('overdue and upcoming together: red, both listed, most urgent first', () => {
    const l = light([officerAlert('soon', '2026-11-10'), officerAlert('late', '2026-10-01')]);
    expect(l?.color).toBe('red');
    expect(l?.alerts.map((a) => a.id)).toEqual(['late', 'soon']);
  });

  it('action beyond the window: no light', () => {
    expect(light([officerAlert('a', '2027-01-15')])).toBeUndefined();
  });

  it('alerts of another company or another vehicle are ignored', () => {
    expect(light([officerAlert('a', '2026-10-20', { company_name: 'אחרת' })])).toBeUndefined();
    expect(light([officerAlert('a', '2026-10-20', { description: 'vid:v2' })])).toBeUndefined();
  });

  it('next inspection from the saved inspection: yellow inside the window, with a link to the record', () => {
    const l = light([], [
      { id: 'insp1', vehicle_id: 'v1', inspection_type: 'tri_semi_annual', inspection_date: '2026-08-10', next_due_date: '2026-11-10' },
    ]);
    expect(l?.color).toBe('yellow');
    expect(l?.alerts[0]).toMatchObject({ kind: 'inspection', label: 'ביקורת קצין רכב', dueDate: '2026-11-10', daysLeft: 12 });
    expect(l?.alerts[0].link).toContain('inspectionId=insp1');
  });

  it('an old vehicle date that a later inspection already replaced is not overdue', () => {
    const vehicle = { ...V, next_inspection_date: '2026-05-01' };
    const l = light([], [
      { id: 'insp2', vehicle_id: 'v1', inspection_type: 'tri_semi_annual', inspection_date: '2026-06-01', next_due_date: '2027-03-01' },
    ], vehicle);
    expect(l).toBeUndefined();
  });

  it('inspection-written alerts (target:) of a superseded inspection never light the vehicle', () => {
    const stale = officerAlert('old', '2026-06-01', { description: 'vplate:1234567 vid:v1\ntarget:2026-06-01' });
    const l = light([stale], [
      { id: 'insp3', vehicle_id: 'v1', inspection_type: 'tri_semi_annual', inspection_date: '2026-06-02', next_due_date: '2027-06-02' },
    ]);
    expect(l).toBeUndefined();
  });

  it('a vehicle with only a configured next inspection date uses that date', () => {
    const vehicle = { ...V, next_inspection_date: '2026-10-25' };
    const l = light([], [], vehicle);
    expect(l?.color).toBe('red');
    expect(l?.alerts[0].daysLeft).toBe(-4);
  });

  it('archived vehicles are not passed in and get no light', () => {
    const lights = buildOfficerAlertLights([officerAlert('a', '2026-10-20')], [], window30, TODAY);
    expect(lights.size).toBe(0);
  });
});

describe('calendarDaysLeft', () => {
  it('counts whole calendar days', () => {
    expect(calendarDaysLeft('2026-10-30', TODAY)).toBe(1);
    expect(calendarDaysLeft('bad', TODAY)).toBeNull();
  });
});
