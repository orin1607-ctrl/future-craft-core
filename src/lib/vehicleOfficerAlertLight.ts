import { OFFICER_ALERT_TYPE, vehicleIdFromAlertText } from '@/lib/vehicleActionFollowUp';
import {
  pickInspectionForDashboard,
  resolveNextInspectionDue,
} from '@/components/vehicles/vehicleHubUtils';

/**
 * Light next to the plate in מעקב רכבים for fleet-officer actions that are still
 * open: the next tri/semi inspection of the vehicle and open manual officer
 * alerts (custom_alerts, type `officer`). Read-only: nothing is written back.
 *
 * - no light: nothing open is due within the window
 * - yellow:   an open action is due today or within the window (default 30 days)
 * - red:      an open action's due date has passed (red wins over yellow)
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

/** Due state shared by the tracking light and the vehicle card. */
export type AlertDueLevel = 'overdue' | 'due_soon' | 'ok' | 'none';

export function alertDueLevel(daysLeft: number | null, windowDays: number): AlertDueLevel {
  if (daysLeft === null) return 'none';
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= windowDays) return 'due_soon';
  return 'ok';
}

export const ALERT_DUE_LEVEL_LABELS: Record<AlertDueLevel, string> = {
  overdue: 'באיחור',
  due_soon: 'מתקרב',
  ok: 'תקין',
  none: 'לא הוגדר מועד',
};

export type OfficerAlertRow = {
  id: string;
  alert_type: string | null;
  company_name: string | null;
  description: string | null;
  alert_date: string | null;
  is_active: boolean | null;
  title?: string | null;
};

export type OfficerInspectionRow = {
  id?: string | null;
  vehicle_id?: string | null;
  inspection_type?: string | null;
  inspection_date?: string | null;
  next_due_date?: string | null;
  created_at?: string | null;
};

export type OfficerAlertVehicle = {
  id: string;
  company_name: string | null;
  license_plate?: string | null;
  next_inspection_date?: string | null;
};

export type OfficerAlertEntryKind = 'inspection' | 'officer_alert';

export type VehicleOfficerAlertEntry = {
  id: string;
  kind: OfficerAlertEntryKind;
  /** What has to be done, e.g. ביקורת קצין רכב / the officer alert title. */
  label: string;
  dueDate: string;
  daysLeft: number;
  level: 'overdue' | 'due_soon';
  /** Opens the record behind the alert. */
  link: string;
};

export type VehicleOfficerAlertLight = {
  /** Open actions inside the window or overdue, most urgent first. */
  alerts: VehicleOfficerAlertEntry[];
  windowDays: number;
  /** Red when any action is overdue, else yellow. */
  color: 'red' | 'yellow';
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
  const level = alertDueLevel(daysLeft, windowDays);
  return level === 'overdue' || level === 'due_soon';
}

/** Optional target:YYYY-MM-DD in the alert description (alerts written by an inspection). */
export function targetDateFromAlertText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = String(text).match(/target:(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export const OFFICER_INSPECTION_LABEL = 'ביקורת קצין רכב';

function inspectionLink(vehicle: OfficerAlertVehicle, inspectionId: string | null | undefined): string {
  const q = new URLSearchParams();
  if (inspectionId) q.set('inspectionId', inspectionId);
  q.set('vehicleId', vehicle.id);
  if (vehicle.license_plate) q.set('plate', vehicle.license_plate);
  return `/vehicle-inspections?${q.toString()}`;
}

/**
 * Builds the light per vehicle.
 *
 * 1. The vehicle's next tri/semi inspection, resolved from its saved inspection
 *    rows (same rule as the vehicle card). An old date that a later inspection
 *    already replaced is never counted.
 * 2. Open manual officer alerts (`vid:` tag, same company, is_active). Alerts an
 *    inspection wrote (`target:`) only mirror the inspection schedule, so they
 *    are used only when the vehicle has no inspection schedule at all.
 * Closed / cancelled alerts (is_active false) are never counted.
 */
export function buildOfficerAlertLights(
  rows: OfficerAlertRow[],
  vehicles: OfficerAlertVehicle[],
  windowDaysForCompany: (company: string) => number,
  today = todayIsoDate(),
  inspectionsByVehicle: Map<string, OfficerInspectionRow[]> = new Map(),
): Map<string, VehicleOfficerAlertLight> {
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const entriesByVehicle = new Map<string, VehicleOfficerAlertEntry[]>();
  const hasSchedule = new Set<string>();
  const seenKeys = new Set<string>();

  const add = (vehicle: OfficerAlertVehicle, entry: Omit<VehicleOfficerAlertEntry, 'daysLeft' | 'level'>) => {
    const daysLeft = calendarDaysLeft(entry.dueDate, today);
    const level = alertDueLevel(daysLeft, windowDaysForCompany(vehicle.company_name || ''));
    if (daysLeft === null || (level !== 'overdue' && level !== 'due_soon')) return;
    const key = `${vehicle.id}|${entry.kind}|${entry.dueDate}|${entry.label}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const list = entriesByVehicle.get(vehicle.id) || [];
    list.push({ ...entry, daysLeft, level });
    entriesByVehicle.set(vehicle.id, list);
  };

  // 1. Inspection schedule (authoritative next due date).
  for (const v of vehicles) {
    const rowsForVehicle = inspectionsByVehicle.get(v.id) || [];
    const picked = pickInspectionForDashboard(rowsForVehicle);
    const due = resolveNextInspectionDue(picked, v.next_inspection_date);
    if (!due) continue;
    hasSchedule.add(v.id);
    add(v, {
      id: `insp-${v.id}`,
      kind: 'inspection',
      label: OFFICER_INSPECTION_LABEL,
      dueDate: due.nextDueDate,
      link: inspectionLink(v, picked?.id),
    });
  }

  // 2. Open officer alerts.
  for (const row of rows) {
    if (row.alert_type !== OFFICER_ALERT_TYPE || row.is_active !== true) continue;
    const vehicleId = vehicleIdFromAlertText(row.description);
    const vehicle = vehicleId ? vehicleById.get(vehicleId) : undefined;
    if (!vehicle) continue;
    if ((row.company_name || '') !== (vehicle.company_name || '')) continue;
    const target = targetDateFromAlertText(row.description);
    if (target && hasSchedule.has(vehicle.id)) continue;
    const dueDate = target || officerAlertDueDate(row.alert_date);
    if (!dueDate) continue;
    add(vehicle, {
      id: row.id,
      kind: target ? 'inspection' : 'officer_alert',
      label: target ? OFFICER_INSPECTION_LABEL : String(row.title || '').trim() || 'התראת קצין רכב',
      dueDate,
      link: ALL_OFFICER_ALERTS_URL,
    });
  }

  const lights = new Map<string, VehicleOfficerAlertLight>();
  entriesByVehicle.forEach((alerts, vehicleId) => {
    alerts.sort((a, b) => a.daysLeft - b.daysLeft);
    const vehicle = vehicleById.get(vehicleId);
    lights.set(vehicleId, {
      alerts,
      windowDays: windowDaysForCompany(vehicle?.company_name || ''),
      color: alerts.some((a) => a.level === 'overdue') ? 'red' : 'yellow',
    });
  });
  return lights;
}

/** Total count of open officer actions across all vehicles. */
export function countTotalOfficerAlerts(lights: Map<string, VehicleOfficerAlertLight>): number {
  let count = 0;
  for (const light of lights.values()) {
    count += light.alerts.length;
  }
  return count;
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
