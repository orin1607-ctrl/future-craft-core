import type { NotificationLogEntry } from '@/lib/notificationLogMock';
import {
  FREE_ALERT_LABEL,
  OFFICER_ALERT_LABEL,
  OFFICER_ALERT_TYPE,
  classifyAlertTiming,
} from '@/lib/vehicleActionFollowUp';
import { isInsuranceAlertsEnabled } from '@/lib/vehicleInsuranceAlerts';

type VehicleExpiryRow = {
  id: string;
  license_plate?: string | null;
  company_name?: string | null;
  test_expiry?: string | null;
  insurance_expiry?: string | null;
  comprehensive_insurance_expiry?: string | null;
  next_inspection_date?: string | null;
  insurance_alerts_enabled?: boolean | null;
};

type DriverExpiryRow = {
  id: string;
  full_name?: string | null;
  company_name?: string | null;
  license_expiry?: string | null;
  exam_expiry?: string | null;
};

function pushDated(
  out: NotificationLogEntry[],
  row: {
    id: string;
    topic: string;
    date: string | null | undefined;
    companyName: string;
    vehiclePlate?: string;
    vehicleId?: string;
    driverId?: string;
    driverName?: string;
    notes?: string;
  },
) {
  if (!row.date) return;
  const timing = classifyAlertTiming(row.date, true);
  if (timing === 'history') return;
  out.push({
    id: row.id,
    scope: row.driverId ? 'driver' : 'vehicle',
    timing,
    createdAt: row.date,
    scheduledFor: row.date,
    companyName: row.companyName,
    vehiclePlate: row.vehiclePlate,
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    driverName: row.driverName,
    topic: row.topic,
    channel: 'system',
    status: 'pending',
    source: 'auto',
    notes: row.notes,
  });
}

export function vehicleExpiryToLogEntries(v: VehicleExpiryRow): NotificationLogEntry[] {
  const out: NotificationLogEntry[] = [];
  const company = v.company_name || '';
  const plate = v.license_plate || undefined;
  pushDated(out, {
    id: `exp-test-${v.id}`,
    topic: 'טסט / רישיון רכב',
    date: v.test_expiry,
    companyName: company,
    vehiclePlate: plate,
    vehicleId: v.id,
  });
  if (isInsuranceAlertsEnabled(v)) {
    pushDated(out, {
      id: `exp-ins-${v.id}`,
      topic: 'ביטוח חובה',
      date: v.insurance_expiry,
      companyName: company,
      vehiclePlate: plate,
      vehicleId: v.id,
    });
    pushDated(out, {
      id: `exp-comp-${v.id}`,
      topic: 'ביטוח מקיף',
      date: v.comprehensive_insurance_expiry,
      companyName: company,
      vehiclePlate: plate,
      vehicleId: v.id,
    });
  }
  pushDated(out, {
    id: `exp-officer-${v.id}`,
    topic: OFFICER_ALERT_LABEL,
    date: v.next_inspection_date,
    companyName: company,
    vehiclePlate: plate,
    vehicleId: v.id,
    notes: 'מועד בדיקת תלת/חצי הבאה',
  });
  return out;
}

export function driverExpiryToLogEntries(d: DriverExpiryRow): NotificationLogEntry[] {
  const out: NotificationLogEntry[] = [];
  pushDated(out, {
    id: `exp-lic-${d.id}`,
    topic: 'רישיון נהיגה',
    date: d.license_expiry,
    companyName: d.company_name || '',
    driverId: d.id,
    driverName: d.full_name || undefined,
  });
  pushDated(out, {
    id: `exp-exam-${d.id}`,
    topic: 'מבחן נהיגה',
    date: d.exam_expiry,
    companyName: d.company_name || '',
    driverId: d.id,
    driverName: d.full_name || undefined,
  });
  return out;
}

export function isOfficerLikeAlert(entry: { topic?: string | null; alertType?: string | null }): boolean {
  const topic = String(entry.topic || '');
  return entry.alertType === OFFICER_ALERT_TYPE || topic.includes(OFFICER_ALERT_LABEL);
}

export function isFreeLikeAlert(entry: { topic?: string | null; alertType?: string | null }): boolean {
  const topic = String(entry.topic || '');
  return topic.includes(FREE_ALERT_LABEL) || topic.includes('התראה חופשית');
}
