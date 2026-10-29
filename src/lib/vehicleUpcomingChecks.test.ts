import { describe, expect, it } from 'vitest';
import { buildUpcomingChecks, type UpcomingChecksVehicle } from './vehicleUpcomingChecks';

const TODAY = '2026-10-29';
const vehicle: UpcomingChecksVehicle = {
  id: 'v1',
  license_plate: '12-345-67',
  test_expiry: '2026-11-18',
  insurance_expiry: '2026-10-20',
  comprehensive_insurance_expiry: null,
  next_service_date: '2027-03-01',
};

const build = (overrides: Partial<Parameters<typeof buildUpcomingChecks>[0]> = {}) =>
  buildUpcomingChecks({
    vehicle,
    inspection: {
      label: 'בדיקה תלת חודשית הבאה',
      nextDueDate: TODAY,
      derived: false,
      inspectionId: 'insp-9',
    },
    insuranceRelevant: true,
    windowDays: 30,
    today: TODAY,
    ...overrides,
  });

const byKey = (rows: ReturnType<typeof build>) => Object.fromEntries(rows.map((r) => [r.key, r]));

describe('buildUpcomingChecks', () => {
  it('officer inspection first, with its saved date, status and a link to the inspection record', () => {
    const rows = build();
    expect(rows[0]).toMatchObject({
      key: 'officer-inspection',
      name: 'ביקורת קצין רכב · בדיקה תלת חודשית',
      dueDate: TODAY,
      level: 'due_soon',
      daysText: 'היום',
    });
    expect(rows[0].target).toEqual({
      kind: 'link',
      to: expect.stringContaining('/vehicle-inspections?'),
    });
    expect((rows[0].target as { to: string }).to).toContain('inspectionId=insp-9');
    expect(rows[0].note).toBeUndefined();
  });

  it('same colours as the light: overdue / due within 30 / ok', () => {
    const r = byKey(build());
    expect(r.test).toMatchObject({ level: 'due_soon', daysLeft: 20, daysText: 'עוד 20 ימים' });
    expect(r.insurance).toMatchObject({ level: 'overdue', daysLeft: -9, daysText: 'באיחור 9 ימים' });
    expect(r.service).toMatchObject({ level: 'ok' });
  });

  it('no date in the system: "לא הוגדר מועד", never an invented date', () => {
    const r = byKey(build({ inspection: null }));
    expect(r['officer-inspection']).toMatchObject({ dueDate: null, level: 'none', daysText: 'לא הוגדר מועד' });
    expect(r['officer-inspection'].targetLabel).toBe('לפתיחת ביקורת');
    expect(r.comprehensive).toMatchObject({ dueDate: null, level: 'none', daysText: 'לא הוגדר מועד' });
  });

  it('a date derived from the last inspection is marked as such', () => {
    const rows = build({
      inspection: { label: 'בדיקה תלת חודשית הבאה', nextDueDate: '2026-12-01', derived: true, inspectionId: 'i' },
    });
    expect(rows[0].note).toContain('מחושב');
  });

  it('insurance rows only when insurance applies to the vehicle', () => {
    const keys = build({ insuranceRelevant: false }).map((r) => r.key);
    expect(keys).not.toContain('insurance');
    expect(keys).not.toContain('comprehensive');
  });

  it('open manual officer alerts are listed; inspection-written ones are not duplicated', () => {
    const rows = build({
      officerAlerts: [
        { id: 'm1', title: 'בדיקת מטף', description: 'vid:v1', alert_date: '2026-11-05T09:00:00' },
        { id: 'g1', title: 'התראת קצין רכב · 12-345-67', description: 'vid:v1\ntarget:2026-10-29', alert_date: '2026-10-29T09:00:00' },
      ],
    });
    const keys = rows.map((r) => r.key);
    expect(keys).toContain('officer-alert-m1');
    expect(keys).not.toContain('officer-alert-g1');
    expect(byKey(rows)['officer-alert-m1']).toMatchObject({ name: 'בדיקת מטף', dueDate: '2026-11-05', level: 'due_soon' });
  });

  it('respects a company window other than 30 days', () => {
    expect(byKey(build({ windowDays: 14 })).test.level).toBe('ok');
  });

  it('does not change the vehicle it reads', () => {
    const copy = { ...vehicle };
    build();
    expect(vehicle).toEqual(copy);
  });
});
