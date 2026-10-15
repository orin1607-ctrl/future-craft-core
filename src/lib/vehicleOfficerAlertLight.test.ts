import { describe, expect, it } from 'vitest';
import {
  ALL_OFFICER_ALERTS_URL,
  buildOfficerAlertLights,
  officerAlertDaysText,
  officerAlertDueDate,
  officerAlertWindowDays,
  type OfficerAlertRow,
} from './vehicleOfficerAlertLight';

const TODAY = '2026-10-15';

function shift(days: number): string {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() + days);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

/** Stored the way createOfficerInspectionAlert does: 09:00 local, as ISO. */
function alertDateFor(days: number): string {
  return new Date(`${shift(days)}T09:00:00`).toISOString();
}

let seq = 0;
function alert(partial: Partial<OfficerAlertRow> & { days?: number } = {}): OfficerAlertRow {
  const { days = 10, ...rest } = partial;
  seq += 1;
  return {
    id: `a-${seq}`,
    alert_type: 'officer',
    company_name: 'A',
    description: 'vplate:1234567 vid:veh-a\ntarget:x',
    alert_date: alertDateFor(days),
    is_active: true,
    ...rest,
  };
}

const VEHICLES = [
  { id: 'veh-a', company_name: 'A' },
  { id: 'veh-b', company_name: 'B' },
];
const window30 = () => 30;

function lit(rows: OfficerAlertRow[], windowFor: (c: string) => number = window30) {
  return buildOfficerAlertLights(rows, VEHICLES, windowFor, TODAY);
}

describe('officer alert red light in vehicle tracking', () => {
  it('45 days ahead: no light with the default 30-day window', () => {
    expect(lit([alert({ days: 45 })]).has('veh-a')).toBe(false);
  });

  it('30 days ahead: lit', () => {
    expect(lit([alert({ days: 30 })]).get('veh-a')?.alerts[0].daysLeft).toBe(30);
  });

  it('31 days ahead: not yet lit', () => {
    expect(lit([alert({ days: 31 })]).has('veh-a')).toBe(false);
  });

  it('10 days ahead: lit', () => {
    expect(lit([alert({ days: 10 })]).get('veh-a')?.alerts[0].daysLeft).toBe(10);
  });

  it('due today: lit', () => {
    expect(lit([alert({ days: 0 })]).get('veh-a')?.alerts[0].daysLeft).toBe(0);
  });

  it('5 days overdue and still open: stays lit', () => {
    expect(lit([alert({ days: -5 })]).get('veh-a')?.alerts[0].daysLeft).toBe(-5);
  });

  it('closed alert: no light', () => {
    expect(lit([alert({ days: 5, is_active: false })]).has('veh-a')).toBe(false);
  });

  it('closed alert next to another open one: lit by the open one only', () => {
    const open = alert({ id: 'open', days: 20 });
    const light = lit([alert({ id: 'closed', days: 3, is_active: false }), open]).get('veh-a');
    expect(light?.alerts.map((a) => a.id)).toEqual(['open']);
  });

  it('company window 15 instead of 30: a 20-day alert is no longer lit', () => {
    const rows = [alert({ days: 20 })];
    expect(lit(rows).has('veh-a')).toBe(true);
    expect(lit(rows, () => 15).has('veh-a')).toBe(false);
    expect(lit([alert({ days: 15 })], () => 15).has('veh-a')).toBe(true);
  });

  it('company windows 45 and 60 widen the light', () => {
    expect(lit([alert({ days: 45 })], () => 45).has('veh-a')).toBe(true);
    expect(lit([alert({ days: 60 })], () => 60).has('veh-a')).toBe(true);
    expect(lit([alert({ days: 61 })], () => 60).has('veh-a')).toBe(false);
  });

  it('each company uses its own window', () => {
    const rows = [
      alert({ days: 20 }),
      alert({ days: 20, company_name: 'B', description: 'vid:veh-b' }),
    ];
    const lights = lit(rows, (c) => (c === 'A' ? 30 : 15));
    expect(lights.has('veh-a')).toBe(true);
    expect(lights.has('veh-b')).toBe(false);
  });

  it('two companies: an alert of another company never lights this vehicle', () => {
    const foreign = alert({ company_name: 'B', description: 'vid:veh-a' });
    expect(lit([foreign]).has('veh-a')).toBe(false);
    const own = alert({ company_name: 'B', description: 'vid:veh-b' });
    const lights = lit([own]);
    expect(lights.has('veh-b')).toBe(true);
    expect(lights.has('veh-a')).toBe(false);
  });

  it('several open alerts for one vehicle: one light with a count, most urgent first', () => {
    const light = lit([alert({ id: 'x', days: 12 }), alert({ id: 'y', days: -2 })]).get('veh-a');
    expect(light?.alerts.map((a) => a.id)).toEqual(['y', 'x']);
  });

  it('never guesses the vehicle: plate-only or untagged alerts are skipped', () => {
    expect(lit([alert({ description: 'vplate:1234567' })]).size).toBe(0);
    expect(lit([alert({ description: null })]).size).toBe(0);
    expect(lit([alert({ description: 'vid:unknown-vehicle' })]).size).toBe(0);
  });

  it('skips alerts without a valid due date and non-officer alerts', () => {
    expect(lit([alert({ alert_date: null })]).size).toBe(0);
    expect(lit([alert({ alert_date: 'not-a-date' })]).size).toBe(0);
    expect(lit([alert({ alert_type: 'service' })]).size).toBe(0);
  });

  it('reads the window from alert_days_before with 30 as fallback', () => {
    expect(officerAlertWindowDays(null)).toBe(30);
    expect(officerAlertWindowDays(undefined)).toBe(30);
    expect(officerAlertWindowDays(15)).toBe(15);
    expect(officerAlertWindowDays(60)).toBe(60);
    expect(officerAlertWindowDays(-3)).toBe(30);
  });

  it('due date is the local calendar day of the stored timestamp', () => {
    expect(officerAlertDueDate(alertDateFor(3))).toBe(shift(3));
    expect(officerAlertDueDate('2026-11-01')).toBe('2026-11-01');
  });

  it('days text for remaining, today and overdue', () => {
    expect(officerAlertDaysText(10)).toBe('עוד 10 ימים');
    expect(officerAlertDaysText(1)).toBe('מחר');
    expect(officerAlertDaysText(0)).toBe('היום');
    expect(officerAlertDaysText(-1)).toBe('באיחור יום אחד');
    expect(officerAlertDaysText(-5)).toBe('באיחור 5 ימים');
  });

  it('links to all officer alerts, overdue included', () => {
    expect(ALL_OFFICER_ALERTS_URL).toBe('/alerts?category=officer&scope=all');
  });
});
