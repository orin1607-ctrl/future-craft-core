/**
 * Fleet-officer expiry renewal: pending list is computed from real expiry dates.
 * Approval is persisted on existing approval_requests (no schema change).
 */
import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { applyExcludeArchivedVehicles } from '@/lib/vehicleArchive';
import { getThirdPartyInsuranceExpiry } from '@/lib/vehicleInsuranceUtils';
import { buildVehicleHubUrl } from '@/lib/entityNavContext';
import { logVehicleEvent } from '@/lib/vehicleEventLog';
import { VEHICLE_EXPIRY_SELECT, type VehicleExpiryRow } from '@/lib/vehicleExpiryShared';

export const EXPIRY_RENEWAL_ACTION_PREFIX = 'expiry_renewal_';

export type ExpiryEntityType = 'vehicle' | 'driver';

export type ExpiryKind =
  | 'test'
  | 'insurance'
  | 'comprehensive_insurance'
  | 'third_party_insurance'
  | 'license'
  | 'exam';

export type ExpiryFilterScope = 'all' | 'vehicles' | 'drivers' | ExpiryKind;

export const EXPIRY_KIND_LABELS: Record<ExpiryKind, string> = {
  test: 'טסט / רישוי',
  insurance: 'ביטוח חובה',
  comprehensive_insurance: 'ביטוח מקיף',
  third_party_insurance: "צד ג'",
  license: 'רישיון נהיגה',
  exam: 'מבחן נהיגה',
};

const VEHICLE_KINDS: ExpiryKind[] = ['test', 'insurance', 'comprehensive_insurance', 'third_party_insurance'];
const DRIVER_KINDS: ExpiryKind[] = ['license', 'exam'];

export type PendingExpiryItem = {
  id: string;
  entityType: ExpiryEntityType;
  entityId: string;
  companyName: string;
  displayName: string;
  kind: ExpiryKind;
  kindLabel: string;
  field: string;
  oldDate: string;
  href: string;
};

export type ExpiryApprover = {
  id: string;
  full_name: string;
  role: string;
  company_name: string;
};

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Whole calendar days from today to the expiry date (negative = already expired). */
export function calendarDaysLeft(
  dateStr: string | null | undefined,
  today = todayIsoDate(),
): number | null {
  const d = toIsoDate(dateStr);
  if (!d) return null;
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(`${d}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

/** Expired = calendar date strictly before today. Missing dates are gaps, not pending renewals. */
export function isExpiryPending(dateStr: string | null | undefined, today = todayIsoDate()): boolean {
  const d = toIsoDate(dateStr);
  return d !== null && d < today;
}

/** Upcoming reminder window used by dashboard "מתקרב" cards — excludes already-expired. */
export function isUpcomingInWindow(
  dateStr: string | null | undefined,
  daysBefore: number,
  today = todayIsoDate(),
): boolean {
  const d = toIsoDate(dateStr);
  if (!d || daysBefore < 0) return false;
  if (d < today) return false;
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(`${d}T00:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return diff <= daysBefore;
}

/** Urgent window for officer lists: expired + due within daysBefore (inclusive). */
export function isDueOrUpcomingInWindow(
  dateStr: string | null | undefined,
  daysBefore: number,
  today = todayIsoDate(),
): boolean {
  if (daysBefore < 0) return false;
  const n = calendarDaysLeft(dateStr, today);
  return n !== null && n <= daysBefore;
}

export function canApproveExpiryRenewal(role: string | undefined | null): boolean {
  return role === 'fleet_manager' || role === 'super_admin';
}

export function formatExpiryHe(dateStr: string | null | undefined): string {
  const d = toIsoDate(dateStr);
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

export function validateNewExpiryDate(
  newDate: string | null | undefined,
  oldDate: string | null | undefined,
  today = todayIsoDate(),
): string | null {
  const next = toIsoDate(newDate);
  if (!newDate || !String(newDate).trim()) return 'לא הוזן תאריך חדש';
  if (!next) return 'התאריך החדש אינו תקין';
  if (next <= today) return 'התאריך החדש כבר פג או אינו בעתיד';
  const prev = toIsoDate(oldDate);
  if (prev && next === prev) return 'התאריך החדש זהה לתאריך הישן';
  return null;
}

function vehicleHref(vehicleId: string, kind: ExpiryKind): string {
  const hubFocus = kind === 'test' ? 'test' : 'insurance';
  return buildVehicleHubUrl(vehicleId, {
    hubSection: 'home',
    hubDrill: 'insurance_licenses',
    hubFocus,
  });
}

function driverHref(driverId: string, kind: ExpiryKind): string {
  const section = kind === 'exam' ? 'driving' : 'documents';
  return `/drivers?driverId=${encodeURIComponent(driverId)}&section=${section}`;
}

function pushItem(
  out: PendingExpiryItem[],
  item: Omit<PendingExpiryItem, 'id' | 'kindLabel'>,
) {
  out.push({
    ...item,
    kindLabel: EXPIRY_KIND_LABELS[item.kind],
    id: `${item.entityType}:${item.entityId}:${item.kind}`,
  });
}

export function pendingItemsForVehicle(
  v: VehicleExpiryRow,
  today = todayIsoDate(),
): PendingExpiryItem[] {
  if (!v.id) return [];
  const companyName = v.company_name || '';
  const displayName = (v.license_plate || '').trim() || 'רכב';
  const out: PendingExpiryItem[] = [];
  const candidates: { kind: ExpiryKind; field: string; date: string | null }[] = [
    { kind: 'test', field: 'test_expiry', date: v.test_expiry || null },
    { kind: 'insurance', field: 'insurance_expiry', date: v.insurance_expiry || null },
    {
      kind: 'comprehensive_insurance',
      field: 'comprehensive_insurance_expiry',
      date: v.comprehensive_insurance_expiry || null,
    },
    {
      kind: 'third_party_insurance',
      field: 'third_party_insurance_expiry',
      date: getThirdPartyInsuranceExpiry(v),
    },
  ];
  for (const c of candidates) {
    const oldDate = toIsoDate(c.date);
    if (!oldDate || !isExpiryPending(oldDate, today)) continue;
    pushItem(out, {
      entityType: 'vehicle',
      entityId: v.id,
      companyName,
      displayName,
      kind: c.kind,
      field: c.field,
      oldDate,
      href: vehicleHref(v.id, c.kind),
    });
  }
  return out;
}

export function pendingItemsForDriver(
  d: {
    id: string;
    full_name?: string | null;
    company_name?: string | null;
    license_expiry?: string | null;
    exam_expiry?: string | null;
    status?: string | null;
  },
  today = todayIsoDate(),
): PendingExpiryItem[] {
  if (!d.id) return [];
  if ((d.status || '').toLowerCase() === 'archived') return [];
  const companyName = d.company_name || '';
  const displayName = (d.full_name || '').trim() || 'נהג';
  const out: PendingExpiryItem[] = [];
  const candidates: { kind: ExpiryKind; field: string; date: string | null }[] = [
    { kind: 'license', field: 'license_expiry', date: d.license_expiry || null },
    { kind: 'exam', field: 'exam_expiry', date: d.exam_expiry || null },
  ];
  for (const c of candidates) {
    const oldDate = toIsoDate(c.date);
    if (!oldDate || !isExpiryPending(oldDate, today)) continue;
    pushItem(out, {
      entityType: 'driver',
      entityId: d.id,
      companyName,
      displayName,
      kind: c.kind,
      field: c.field,
      oldDate,
      href: driverHref(d.id, c.kind),
    });
  }
  return out;
}

export function buildPendingExpiryItems(
  vehicles: VehicleExpiryRow[],
  drivers: Parameters<typeof pendingItemsForDriver>[0][],
  opts: { companyFilter?: string | null; today?: string } = {},
): PendingExpiryItem[] {
  const today = opts.today || todayIsoDate();
  const company = opts.companyFilter || null;
  const out: PendingExpiryItem[] = [];
  for (const v of vehicles) {
    if (company && (v.company_name || '') !== company) continue;
    out.push(...pendingItemsForVehicle(v, today));
  }
  for (const d of drivers) {
    if (company && (d.company_name || '') !== company) continue;
    out.push(...pendingItemsForDriver(d, today));
  }
  out.sort((a, b) => a.oldDate.localeCompare(b.oldDate) || a.displayName.localeCompare(b.displayName, 'he'));
  return out;
}

export function filterPendingExpiryItems(
  items: PendingExpiryItem[],
  filter: ExpiryFilterScope,
): PendingExpiryItem[] {
  if (filter === 'all') return items;
  if (filter === 'vehicles') return items.filter((i) => i.entityType === 'vehicle');
  if (filter === 'drivers') return items.filter((i) => i.entityType === 'driver');
  return items.filter((i) => i.kind === filter);
}

export function matchesExpiryKindQuery(kind: string | null | undefined): ExpiryFilterScope {
  if (!kind || kind === 'all') return 'all';
  if (kind === 'vehicles' || kind === 'drivers') return kind;
  if ((VEHICLE_KINDS as string[]).includes(kind) || (DRIVER_KINDS as string[]).includes(kind)) {
    return kind as ExpiryKind;
  }
  return 'all';
}

async function fetchAll<T>(loadPage: (from: number, to: number) => Promise<T[] | null>): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const page = (await loadPage(from, from + 999)) || [];
    rows.push(...page);
    if (page.length < 1000) break;
    from += 1000;
  }
  return rows;
}

export async function loadPendingExpiryItems(companyFilter: string | null): Promise<PendingExpiryItem[]> {
  const vehicles = await fetchAll(async (from, to) => {
    const { data, error } = await applyExcludeArchivedVehicles(
      applyCompanyScope(supabase.from('vehicles').select(VEHICLE_EXPIRY_SELECT), companyFilter),
    ).range(from, to);
    if (error) throw error;
    return (data || []) as VehicleExpiryRow[];
  });

  const drivers = await fetchAll(async (from, to) => {
    const { data, error } = await applyCompanyScope(
      supabase.from('drivers').select('id, full_name, company_name, license_expiry, exam_expiry, status'),
      companyFilter,
    ).range(from, to);
    if (error) throw error;
    return data || [];
  });

  return buildPendingExpiryItems(vehicles, drivers, { companyFilter });
}

function assertApproverCompany(user: ExpiryApprover, item: PendingExpiryItem): string | null {
  if (!canApproveExpiryRenewal(user.role)) return 'אין הרשאה לאשר חידוש';
  if (user.role !== 'super_admin' && user.company_name !== item.companyName) {
    return 'לא ניתן לאשר פריט של חברה אחרת';
  }
  return null;
}

export async function approveExpiryRenewal(params: {
  item: PendingExpiryItem;
  newDate: string;
  user: ExpiryApprover;
  today?: string;
}): Promise<{ ok: true; newDate: string } | { ok: false; error: string }> {
  const today = params.today || todayIsoDate();
  const newDate = toIsoDate(params.newDate);
  const dateError = validateNewExpiryDate(params.newDate, params.item.oldDate, today);
  if (dateError) return { ok: false, error: dateError };
  if (!newDate) return { ok: false, error: 'התאריך החדש אינו תקין' };

  const accessError = assertApproverCompany(params.user, params.item);
  if (accessError) return { ok: false, error: accessError };

  const table = params.item.entityType === 'vehicle' ? 'vehicles' : 'drivers';
  const { error: updateError } = await supabase
    .from(table)
    .update({ [params.item.field]: newDate })
    .eq('id', params.item.entityId);
  if (updateError) return { ok: false, error: updateError.message || 'שגיאה בעדכון התאריך' };

  const { error: approvalError } = await supabase.from('approval_requests').insert({
    company_name: params.item.companyName,
    entity_type: params.item.entityType,
    entity_id: params.item.entityId,
    action_type: `${EXPIRY_RENEWAL_ACTION_PREFIX}${params.item.kind}`,
    vehicle_plate: params.item.entityType === 'vehicle' ? params.item.displayName : '',
    description: JSON.stringify({
      field: params.item.field,
      kind: params.item.kind,
      label: params.item.kindLabel,
      oldDate: params.item.oldDate,
      newDate,
      displayName: params.item.displayName,
    }),
    requested_by: params.user.id,
    requested_by_name: params.user.full_name || '',
    status: 'approved',
    approved_by: params.user.id,
    approved_by_name: params.user.full_name || '',
    approved_at: new Date().toISOString(),
  });
  if (approvalError) {
    console.error('expiry approval audit insert failed', approvalError);
  }

  if (params.item.entityType === 'vehicle') {
    await logVehicleEvent({
      vehicleId: params.item.entityId,
      vehiclePlate: params.item.displayName,
      companyName: params.item.companyName,
      action: `חידוש ${params.item.kindLabel} (אישור קצין)`,
      details: `${params.item.oldDate} → ${newDate}`,
      userId: params.user.id,
      userName: params.user.full_name,
    });
  }

  return { ok: true, newDate };
}
