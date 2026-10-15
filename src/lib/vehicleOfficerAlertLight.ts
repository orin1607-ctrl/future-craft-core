import { OFFICER_ALERT_TYPE, vehicleIdFromAlertText } from '@/lib/vehicleActionFollowUp';

/**
 * Red light in מעקב רכבים for open fleet-officer alerts (custom_alerts, type
 * `officer`). Read-only: alerts are matched to a vehicle by its `vid:` tag and
 * company only, never by plate or name, and nothing is written back.
 */

export const DEFAULT_OFFICER_ALERT_WINDOW_DAYS = 30;

/** Local calendar date (YYYY-MM-DD). */
export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole calendar days from `today` to `dateStr` (negative = overdue). */
export function calendarDaysLeft(dateStr: string | null | undefined, today = todayIsoDate()): number | null {
  const d = String(dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(`${d}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

/** Where the light leads: all officer alerts, overdue ones included. */
export const ALL_OFFICER_ALERTS_URL = '/alerts?category=officer&scope=all';

export type OfficerAlertRow = {
  id: string;
  alert_type: string | null;
  company_name: string | null;
  description: string | null;
  alert_date: string | null;
  is_active: boolean | null;
};

export type VehicleOfficerAlertEntry = {
  id: string;
  dueDate: string;
  daysLeft: number;
};

export type VehicleOfficerAlertLight = {
  /** Alerts inside the window or overdue, most urgent first. */
  alerts: VehicleOfficerAlertEntry[];
  windowDays: number;
};

/** company_settings.alert_days_before, falling back to 30 for missing or invalid values. */
export function officerAlertWindowDays(alertDaysBefore: number | null | undefined): number {
  if (alertDaysBefore === null || alertDaysBefore === undefined) return DEFAULT_OFFICER_ALERT_WINDOW_DAYS;
  const n = Number(alertDaysBefore);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_OFFICER_ALERT_WINDOW_DAYS;
  return Math.floor(n);
}

/** Local calendar date of a stored alert_date (an ISO timestamp or a plain date). */
export function officerAlertDueDate(alertDate: string | null | undefined): string | null {
  if (!alertDate) return null;
  const s = String(alertDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return todayIsoDate(d);
}

/** Lit from `windowDays` before the due date, and for as long as it stays open after it. */
export function isOfficerAlertLit(daysLeft: number | null, windowDays: number): boolean {
  return daysLeft !== null && daysLeft <= windowDays;
}

/**
 * Groups open officer alerts by vehicle id. A row without a `vid:` tag, of
 * another company, closed, or without a valid date is skipped.
 */
export function buildOfficerAlertLights(
  rows: OfficerAlertRow[],
  vehicles: { id: string; company_name: string | null }[],
  windowDaysForCompany: (company: string) => number,
  today = todayIsoDate(),
): Map<string, VehicleOfficerAlertLight> {
  const companyByVehicle = new Map(vehicles.map((v) => [v.id, v.company_name || '']));
  const lights = new Map<string, VehicleOfficerAlertLight>();
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.alert_type !== OFFICER_ALERT_TYPE || row.is_active !== true) continue;
    if (seen.has(row.id)) continue;
    const vehicleId = vehicleIdFromAlertText(row.description);
    if (!vehicleId || !companyByVehicle.has(vehicleId)) continue;
    const company = companyByVehicle.get(vehicleId) || '';
    if ((row.company_name || '') !== company) continue;
    const dueDate = officerAlertDueDate(row.alert_date);
    const daysLeft = calendarDaysLeft(dueDate, today);
    if (dueDate === null || daysLeft === null) continue;
    const windowDays = windowDaysForCompany(company);
    if (!isOfficerAlertLit(daysLeft, windowDays)) continue;
    seen.add(row.id);
    const light = lights.get(vehicleId) || { alerts: [], windowDays };
    light.alerts.push({ id: row.id, dueDate, daysLeft });
    lights.set(vehicleId, light);
  }

  lights.forEach((light) => light.alerts.sort((a, b) => a.daysLeft - b.daysLeft));
  return lights;
}

export function officerAlertDaysText(daysLeft: number): string {
  if (daysLeft === 0) return 'היום';
  if (daysLeft < 0) return daysLeft === -1 ? 'באיחור יום אחד' : `באיחור ${-daysLeft} ימים`;
  return daysLeft === 1 ? 'מחר' : `עוד ${daysLeft} ימים`;
}

export function formatOfficerDueDate(dueDate: string): string {
  const [y, m, d] = dueDate.split('-');
  return `${d}/${m}/${y}`;
}
