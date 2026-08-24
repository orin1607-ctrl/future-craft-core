import type { VehicleHubVehicle } from '@/components/vehicles/VehicleHub';
import { addCalendarMonths } from '@/lib/vehicleActionFollowUp';

export interface InspectionDashboardCard {
  label: string;
  nextDueDate: string;
}

interface InspectionScheduleRow {
  inspection_type?: string | null;
  inspection_date?: string | null;
  next_due_date?: string | null;
}

function ymd(value?: string | null): string | null {
  const day = value?.slice(0, 10) || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function isAfterPerformed(due: string | null, performed: string | null): due is string {
  return Boolean(due && (!performed || due > performed));
}

/** Latest inspection whose next due is actually after the performed date. */
export function pickInspectionForDashboard<T extends InspectionScheduleRow>(rows: T[]): T | null {
  if (!rows.length) return null;
  const future = rows.filter((row) =>
    isAfterPerformed(ymd(row.next_due_date), ymd(row.inspection_date)),
  );
  return future[0] || rows[0];
}

function resolveNextDueDate(
  inspection: InspectionScheduleRow | null | undefined,
  vehicleNextInspection?: string | null,
): string | null {
  const performed = ymd(inspection?.inspection_date);
  const fromRow = ymd(inspection?.next_due_date);
  const fromVehicle = ymd(vehicleNextInspection);
  const usable = [fromRow, fromVehicle].filter((due) => isAfterPerformed(due, performed));
  if (usable.length) return usable.sort()[usable.length - 1];

  if (performed) {
    const type = inspection?.inspection_type;
    if (type === 'semi_annual') return addCalendarMonths(performed, 6);
    if (type === 'quarterly' || type === 'tri_semi_annual') {
      return addCalendarMonths(performed, 3);
    }
  }
  return null;
}

export function getInspectionDashboardCard(
  inspection: InspectionScheduleRow | null | undefined,
  vehicleNextInspection?: string | null,
): InspectionDashboardCard | null {
  const nextDueDate = resolveNextDueDate(inspection, vehicleNextInspection);
  if (!nextDueDate) return null;

  if (inspection?.inspection_type === 'semi_annual') {
    return { label: 'בדיקה חצי שנתית', nextDueDate };
  }
  if (inspection?.inspection_type === 'quarterly') {
    return { label: 'בדיקה תלת חודשית', nextDueDate };
  }

  const inspectionDate = ymd(inspection?.inspection_date);
  if (!inspectionDate) {
    return { label: 'בדיקת תלת / חצי', nextDueDate };
  }

  const sixMonthDate = addCalendarMonths(inspectionDate, 6);
  const threeMonthDate = addCalendarMonths(inspectionDate, 3);
  if (nextDueDate === sixMonthDate) {
    return { label: 'בדיקה חצי שנתית', nextDueDate };
  }
  if (nextDueDate === threeMonthDate) {
    return { label: 'בדיקה תלת חודשית', nextDueDate };
  }

  const intervalDays = Math.round(
    (new Date(`${nextDueDate}T12:00:00`).getTime()
      - new Date(`${inspectionDate}T12:00:00`).getTime())
      / 86400000,
  );
  return {
    label: intervalDays >= 135 ? 'בדיקה חצי שנתית' : 'בדיקה תלת חודשית',
    nextDueDate,
  };
}

export function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const day = dateStr.slice(0, 10);
  return Math.ceil((new Date(`${day}T12:00:00`).getTime() - Date.now()) / 86400000);
}

export function expiryColor(days: number | null) {
  if (days === null) return '';
  if (days <= 0) return 'text-destructive font-bold';
  if (days <= 14) return 'text-warning font-bold';
  return '';
}

export function formatExpiry(date: string | null) {
  if (!date) return 'לא הוגדר';
  const d = daysUntil(date);
  const label = new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('he-IL');
  if (d === null) return label;
  if (d <= 0) return `${label} (פג)`;
  if (d <= 14) return `${label} (${d} ימים)`;
  return label;
}

export function statusLabel(s: string) {
  switch (s) {
    case 'active':
      return { text: 'פעיל', cls: 'status-active' };
    case 'in_service':
      return { text: 'בטיפול', cls: 'status-pending' };
    case 'out_of_service':
      return { text: 'לא פעיל', cls: 'status-inactive' };
    case 'archived':
      return { text: 'ארכיון', cls: 'bg-muted text-muted-foreground' };
    default:
      return { text: s || 'לא ידוע', cls: '' };
  }
}

export function managementTypeLabel(t: string) {
  if (t === 'operational_leasing') return 'ליסינג תפעולי';
  if (t === 'financial_leasing') return 'ליסינג מימוני';
  if (t === 'self_maintained') return 'תחזוקה עצמאית';
  return '—';
}

export function insuranceStatusText(expiry: string | null) {
  const d = daysUntil(expiry);
  if (!expiry) return 'לא הוגדר';
  if (d !== null && d <= 0) return 'פג תוקף';
  if (d !== null && d <= 14) return 'מתקרב לפקיעה';
  return 'בתוקף';
}

export interface InsuranceHistoryRow {
  year: number;
  has_no_claims: boolean;
  insurer_name: string;
  mandatory_insurance_cost: number;
  comprehensive_insurance_cost: number;
}

export type VehicleWithExtras = VehicleHubVehicle & {
  insurance_cost?: number | null;
};
