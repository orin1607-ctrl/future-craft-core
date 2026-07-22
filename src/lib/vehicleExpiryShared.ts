/**
 * Shared vehicle expiry helpers — used by Alerts and Reports
 * so renewal/test logic is not duplicated.
 */
import { getThirdPartyInsuranceExpiry } from '@/lib/vehicleInsuranceUtils';

export type ExpirySeverity = 'critical' | 'warning' | 'info';

export type VehicleRenewalKind =
  | 'test'
  | 'insurance'
  | 'comprehensive_insurance'
  | 'third_party_insurance';

export const VEHICLE_RENEWAL_LABELS: Record<VehicleRenewalKind, string> = {
  test: 'טסט',
  insurance: 'ביטוח חובה',
  comprehensive_insurance: 'ביטוח מקיף',
  third_party_insurance: 'ביטוח צד ג׳',
};

/** Lean vehicle columns for expiry / reports (avoids select('*') on large fleets). */
export const VEHICLE_EXPIRY_SELECT =
  'id,license_plate,internal_number,company_name,status,manufacturer,model,year,odometer,assigned_driver_id,test_expiry,insurance_expiry,comprehensive_insurance_expiry,third_party_insurance_expiry,insurances';

export function getDaysLeft(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getExpirySeverity(daysLeft: number | null): ExpirySeverity {
  if (daysLeft === null) return 'info';
  if (daysLeft <= 0) return 'critical';
  if (daysLeft <= 14) return 'warning';
  return 'info';
}

export function renewalStatusLabel(dateStr: string | null | undefined): string {
  const days = getDaysLeft(dateStr);
  if (days === null) return 'ללא תאריך';
  if (days < 0) return 'פג תוקף';
  if (days === 0) return 'פוג היום';
  if (days <= 30) return 'לחידוש';
  return 'בתוקף';
}

export interface VehicleExpiryRow {
  id: string;
  license_plate?: string | null;
  internal_number?: string | null;
  company_name?: string | null;
  status?: string | null;
  assigned_driver_id?: string | null;
  test_expiry?: string | null;
  insurance_expiry?: string | null;
  comprehensive_insurance_expiry?: string | null;
  third_party_insurance_expiry?: string | null;
  insurances?: unknown;
}

export interface VehicleRenewalEvent {
  id: string;
  kind: VehicleRenewalKind;
  eventType: string;
  internalNumber: string;
  vehiclePlate: string;
  companyName: string;
  driverName: string;
  date: string;
  status: string;
  vehicleId: string;
}

function inRange(dateStr: string, from?: Date | null, to?: Date | null): boolean {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  if (from) {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    if (d < start) return false;
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (d > end) return false;
  }
  return true;
}

/**
 * Build test + insurance renewal events whose expiry date falls in [from, to].
 * Supports past and future dates (same field logic as Alerts).
 */
export function buildVehicleRenewalEvents(
  vehicles: VehicleExpiryRow[],
  opts: {
    from?: Date | null;
    to?: Date | null;
    driverById?: Record<string, string>;
    kinds?: VehicleRenewalKind[];
  } = {},
): VehicleRenewalEvent[] {
  const kinds = new Set(
    opts.kinds ||
      (['test', 'insurance', 'comprehensive_insurance', 'third_party_insurance'] as VehicleRenewalKind[]),
  );
  const driverById = opts.driverById || {};
  const out: VehicleRenewalEvent[] = [];

  for (const v of vehicles) {
    const plate = v.license_plate || '';
    const internal = v.internal_number || '';
    const company = v.company_name || '';
    const driver =
      (v.assigned_driver_id && driverById[v.assigned_driver_id]) || '';

    const candidates: { kind: VehicleRenewalKind; date: string | null }[] = [
      { kind: 'test', date: v.test_expiry || null },
      { kind: 'insurance', date: v.insurance_expiry || null },
      { kind: 'comprehensive_insurance', date: v.comprehensive_insurance_expiry || null },
      { kind: 'third_party_insurance', date: getThirdPartyInsuranceExpiry(v) },
    ];

    for (const c of candidates) {
      if (!kinds.has(c.kind) || !c.date) continue;
      if (!inRange(c.date, opts.from, opts.to)) continue;
      out.push({
        id: `${c.kind}-${v.id}-${c.date}`,
        kind: c.kind,
        eventType: VEHICLE_RENEWAL_LABELS[c.kind],
        internalNumber: internal,
        vehiclePlate: plate,
        companyName: company,
        driverName: driver,
        date: c.date,
        status: renewalStatusLabel(c.date),
        vehicleId: v.id,
      });
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
