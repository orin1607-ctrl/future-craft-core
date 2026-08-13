import { supabase } from '@/integrations/supabase/client';
import { buildVehicleHubUrl } from '@/lib/entityNavContext';
import { logVehicleEvent } from '@/lib/vehicleEventLog';
import { getCompanyReminderOffsets } from '@/lib/companySettings';

const PLATE_TAG = 'vplate:';
const VEHICLE_ID_TAG = 'vid:';
const DRIVER_ID_TAG = 'did:';
const DRIVER_NAME_TAG = 'dname:';

export const OFFICER_ALERT_TYPE = 'officer';
export const OFFICER_ALERT_LABEL = 'התראת קצין רכב';
export const FREE_ALERT_TYPE = 'free';
export const FREE_ALERT_LABEL = 'התראה חופשית';

export type AlertTimingBucket = 'active' | 'future' | 'history';

/** Service order that represents transport / towing (שינוע). */
export function isTowingServiceOrder(row: {
  towing_requested?: boolean | null;
  service_category?: string | null;
}): boolean {
  return !!row.towing_requested || (row.service_category || '').startsWith('שינוע');
}

export function formatVehicleAlertMeta(plate: string, vehicleId?: string): string {
  const parts = [`${PLATE_TAG}${plate}`];
  if (vehicleId) parts.push(`${VEHICLE_ID_TAG}${vehicleId}`);
  return parts.join(' ');
}

export function plateFromAlertText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/vplate:([^\s]+)/);
  return m ? m[1] : null;
}

export function vehicleIdFromAlertText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/vid:([^\s]+)/);
  return m ? m[1] : null;
}

export function formatDriverAlertMeta(driverId: string, driverName?: string): string {
  const parts = [`${DRIVER_ID_TAG}${driverId}`];
  if (driverName?.trim()) parts.push(`${DRIVER_NAME_TAG}${encodeURIComponent(driverName.trim())}`);
  return parts.join(' ');
}

export function driverIdFromAlertText(text: string | null | undefined): string | null {
  if (!text) return null;
  const uuid = text.match(/did:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (uuid) return uuid[1];
  const m = text.match(/did:([^\s]+)/);
  return m ? m[1] : null;
}

export function driverNameFromAlertText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/dname:([^\s]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function addCalendarMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function parseOdometerKm(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function shouldUpdateOdometer(current: number | null | undefined, incoming: number): boolean {
  return incoming >= Number(current || 0);
}

export function classifyAlertTiming(
  alertDate: string | null | undefined,
  isActive: boolean | null | undefined,
  now: Date = new Date(),
): AlertTimingBucket {
  if (!isActive) return 'history';
  if (!alertDate) return 'active';
  const daysLeft = Math.ceil((new Date(alertDate).getTime() - now.getTime()) / 86400000);
  if (Number.isNaN(daysLeft) || daysLeft < 0) return 'history';
  if (daysLeft > 30) return 'future';
  return 'active';
}

export function handoverDateTime(row: {
  date_time?: string | null;
  pickup_date?: string | null;
  pickup_time?: string | null;
  created_at?: string | null;
}): string {
  if (row.date_time) return row.date_time;
  if (row.pickup_date) {
    const time = row.pickup_time || '12:00:00';
    return new Date(`${row.pickup_date}T${time}`).toISOString();
  }
  return row.created_at || new Date().toISOString();
}

/** Notify fleet managers + super_admins in the same company (internal alert). */
export async function notifyFleetManagers(params: {
  companyName: string;
  title: string;
  message: string;
  link?: string;
  vehicleId?: string;
}) {
  if (!params.companyName) return;

  const link = params.link || (params.vehicleId ? buildVehicleHubUrl(params.vehicleId) : '/vehicles');

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('user_id')
    .in('role', ['fleet_manager', 'super_admin']);

  const roleUserIds = (roleRows || []).map((r) => r.user_id);
  if (!roleUserIds.length) return;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('company_name', params.companyName)
    .eq('is_active', true)
    .in('id', roleUserIds);

  const notifications = (profiles || []).map((p) => ({
    user_id: p.id,
    type: 'transport',
    title: params.title,
    message: params.message,
    link,
  }));

  if (notifications.length) {
    const { error } = await supabase.from('driver_notifications').insert(notifications);
    if (error) console.error('notifyFleetManagers', error);
  }
}

/** Create custom_alerts for 30 / 7 / 1 days before target date. */
export async function createTargetDateAlerts(params: {
  userId: string;
  companyName: string;
  vehiclePlate: string;
  vehicleId?: string;
  actionLabel: string;
  targetDate: string;
  details?: string;
}) {
  if (!params.targetDate || !params.userId) return;

  const target = new Date(`${params.targetDate}T09:00:00`);
  if (Number.isNaN(target.getTime())) return;

  const meta = formatVehicleAlertMeta(params.vehiclePlate, params.vehicleId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inserts: Record<string, unknown>[] = [];
  const reminderDays = await getCompanyReminderOffsets(params.companyName);

  for (const daysBefore of reminderDays) {
    const alertDate = new Date(target);
    alertDate.setDate(alertDate.getDate() - daysBefore);
    alertDate.setHours(9, 0, 0, 0);
    if (alertDate < today) continue;

    const whenLabel = daysBefore === 1 ? 'מחר' : `בעוד ${daysBefore} ימים`;
    inserts.push({
      user_id: params.userId,
      company_name: params.companyName,
      alert_type: 'service',
      title: `${params.actionLabel} · ${params.vehiclePlate} · ${whenLabel}`,
      description: [meta, params.details, `target:${params.targetDate}`].filter(Boolean).join('\n'),
      alert_date: alertDate.toISOString(),
      next_trigger_at: alertDate.toISOString(),
      recurrence: 'none',
      is_active: true,
    });
  }

  if (inserts.length) {
    const { error } = await supabase.from('custom_alerts').insert(inserts);
    if (error) console.error('createTargetDateAlerts', error);
  }
}

/** Single officer alert dated at the next inspection due date. */
export async function createOfficerInspectionAlert(params: {
  userId: string;
  companyName: string;
  vehiclePlate: string;
  vehicleId?: string;
  nextDueDate: string;
  details?: string;
}) {
  if (!params.nextDueDate || !params.userId) return;
  const when = new Date(`${params.nextDueDate}T09:00:00`);
  if (Number.isNaN(when.getTime())) return;
  const meta = formatVehicleAlertMeta(params.vehiclePlate, params.vehicleId);
  const { error } = await supabase.from('custom_alerts').insert({
    user_id: params.userId,
    company_name: params.companyName,
    alert_type: OFFICER_ALERT_TYPE,
    title: `${OFFICER_ALERT_LABEL} · ${params.vehiclePlate}`,
    description: [meta, params.details, `target:${params.nextDueDate}`].filter(Boolean).join('\n'),
    alert_date: when.toISOString(),
    next_trigger_at: when.toISOString(),
    recurrence: 'none',
    is_active: true,
  });
  if (error) console.error('createOfficerInspectionAlert', error);
}

/** Log to vehicle history + optional dated alerts + optional transport notification. */
export async function recordVehicleHubAction(params: {
  vehicleId?: string;
  vehiclePlate: string;
  companyName: string;
  action: string;
  details?: string;
  userId?: string;
  userName?: string;
  targetDate?: string | null;
  notifyTransport?: boolean;
  transportTitle?: string;
  transportMessage?: string;
}) {
  await logVehicleEvent({
    vehicleId: params.vehicleId,
    vehiclePlate: params.vehiclePlate,
    companyName: params.companyName,
    action: params.action,
    details: params.details,
    userId: params.userId,
    userName: params.userName,
  });

  if (params.targetDate && params.userId) {
    await createTargetDateAlerts({
      userId: params.userId,
      companyName: params.companyName,
      vehiclePlate: params.vehiclePlate,
      vehicleId: params.vehicleId,
      actionLabel: params.action,
      targetDate: params.targetDate,
      details: params.details,
    });
  }

  if (params.notifyTransport) {
    await notifyFleetManagers({
      companyName: params.companyName,
      title: params.transportTitle || '🚛 הזמנת שינוע חדשה',
      message: params.transportMessage || `שינוע לרכב ${params.vehiclePlate}`,
      vehicleId: params.vehicleId,
    });
  }
}
