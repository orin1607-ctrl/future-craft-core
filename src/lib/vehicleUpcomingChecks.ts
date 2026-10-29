import {
  alertDueLevel,
  calendarDaysLeft,
  officerAlertDueDate,
  officerAlertDaysText,
  targetDateFromAlertText,
  todayIsoDate,
  type AlertDueLevel,
} from '@/lib/vehicleOfficerAlertLight';
import type { NextInspectionDue } from '@/components/vehicles/vehicleHubUtils';
import { buildVehicleContextUrl } from '@/lib/entityNavContext';

/**
 * "בדיקות קרובות ומועדי חידוש" in the vehicle card. Read-only: every date comes
 * from a field or record the system already saves; a missing date stays missing.
 * Uses the same due levels as the tracking light (alertDueLevel).
 */

export type UpcomingCheckTarget =
  | { kind: 'link'; to: string }
  | { kind: 'drill'; drill: 'insurance_licenses' | 'service' };

export type UpcomingCheck = {
  key: string;
  name: string;
  /** YYYY-MM-DD or null when the system has no date for it. */
  dueDate: string | null;
  daysLeft: number | null;
  level: AlertDueLevel;
  /** "עוד 12 ימים" / "באיחור 3 ימים" / "לא הוגדר מועד". */
  daysText: string;
  /** Extra line, e.g. that a date is derived from the last inspection. */
  note?: string;
  target: UpcomingCheckTarget;
  targetLabel: string;
};

export type UpcomingChecksVehicle = {
  id: string;
  license_plate: string;
  test_expiry: string | null;
  insurance_expiry: string | null;
  comprehensive_insurance_expiry: string | null;
  next_service_date: string | null;
};

export type UpcomingInspection = NextInspectionDue & {
  label: string;
  /** Inspection the date was read from, when there is one. */
  inspectionId?: string | null;
};

export type OpenOfficerAlert = {
  id: string;
  title: string | null;
  description: string | null;
  alert_date: string | null;
};

const LEVEL_ORDER: Record<AlertDueLevel, number> = { overdue: 0, due_soon: 1, ok: 2, none: 3 };

function ymd(value: string | null | undefined): string | null {
  const d = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function inspectionsUrl(v: UpcomingChecksVehicle, inspectionId: string): string {
  const url = buildVehicleContextUrl('/vehicle-inspections', { plate: v.license_plate, vehicleId: v.id });
  return `${url}&inspectionId=${encodeURIComponent(inspectionId)}`;
}

function newInspectionUrl(v: UpcomingChecksVehicle): string {
  return buildVehicleContextUrl('/private-vehicle-inspection', { plate: v.license_plate, vehicleId: v.id });
}

export function buildUpcomingChecks(input: {
  vehicle: UpcomingChecksVehicle;
  inspection: UpcomingInspection | null;
  officerAlerts?: OpenOfficerAlert[];
  insuranceRelevant: boolean;
  windowDays: number;
  today?: string;
}): UpcomingCheck[] {
  const { vehicle: v, windowDays } = input;
  const today = input.today ?? todayIsoDate();
  const out: UpcomingCheck[] = [];

  const push = (row: Omit<UpcomingCheck, 'daysLeft' | 'level' | 'daysText'>) => {
    const dueDate = ymd(row.dueDate);
    const daysLeft = calendarDaysLeft(dueDate, today);
    const level = alertDueLevel(daysLeft, windowDays);
    out.push({
      ...row,
      dueDate,
      daysLeft,
      level,
      daysText: daysLeft === null ? 'לא הוגדר מועד' : officerAlertDaysText(daysLeft),
    });
  };

  const insp = input.inspection;
  push({
    key: 'officer-inspection',
    name: insp?.label ? `ביקורת קצין רכב · ${insp.label.replace(/ הבאה$/, '')}` : 'ביקורת קצין רכב (תלת / חצי)',
    dueDate: insp?.nextDueDate ?? null,
    note: insp?.derived ? 'מחושב מתאריך הביקורת האחרונה (לא נשמר מועד בביקורת)' : undefined,
    target: insp?.inspectionId
      ? { kind: 'link', to: inspectionsUrl(v, insp.inspectionId) }
      : { kind: 'link', to: newInspectionUrl(v) },
    targetLabel: insp?.inspectionId ? 'לביקורת האחרונה' : 'לפתיחת ביקורת',
  });

  for (const a of input.officerAlerts || []) {
    // Alerts an inspection wrote (target:) are the same date as the inspection row above.
    if (targetDateFromAlertText(a.description)) continue;
    push({
      key: `officer-alert-${a.id}`,
      name: String(a.title || '').trim() || 'התראת קצין רכב',
      dueDate: officerAlertDueDate(a.alert_date),
      target: { kind: 'link', to: '/alerts?category=officer&scope=all' },
      targetLabel: 'להתראה',
    });
  }

  push({
    key: 'test',
    name: 'טסט שנתי / רישיון רכב',
    dueDate: v.test_expiry,
    target: { kind: 'drill', drill: 'insurance_licenses' },
    targetLabel: 'לפרטי הרישיון',
  });

  if (input.insuranceRelevant) {
    push({
      key: 'insurance',
      name: 'ביטוח חובה',
      dueDate: v.insurance_expiry,
      target: { kind: 'drill', drill: 'insurance_licenses' },
      targetLabel: 'לפרטי הביטוח',
    });
    push({
      key: 'comprehensive',
      name: 'ביטוח מקיף',
      dueDate: v.comprehensive_insurance_expiry,
      target: { kind: 'drill', drill: 'insurance_licenses' },
      targetLabel: 'לפרטי הביטוח',
    });
  }

  push({
    key: 'service',
    name: 'טיפול תקופתי',
    dueDate: v.next_service_date,
    target: { kind: 'drill', drill: 'service' },
    targetLabel: 'לטיפולים',
  });

  // Officer inspection stays first; the rest by urgency, then date.
  const [first, ...rest] = out;
  rest.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999));
  return [first, ...rest];
}
