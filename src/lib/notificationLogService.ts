import { supabase } from '@/integrations/supabase/client';
import type {
  LogChannel,
  LogScope,
  LogStatus,
  LogTiming,
  NotificationLogEntry,
} from '@/lib/notificationLogMock';
import {
  classifyAlertTiming,
  driverIdFromAlertText,
  driverNameFromAlertText,
  plateFromAlertText,
  vehicleIdFromAlertText,
} from '@/lib/vehicleActionFollowUp';

type SystemLogRow = {
  id: string;
  created_at: string;
  company_name: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  vehicle_plate: string | null;
  details: string | null;
  channel: string | null;
  new_status: string | null;
};

type CustomAlertRow = {
  id: string;
  created_at?: string | null;
  company_name: string | null;
  title: string | null;
  description: string | null;
  alert_date: string | null;
  alert_type: string | null;
  is_active: boolean | null;
};

function mapChannel(raw: string | null): LogChannel {
  if (raw === 'whatsapp') return 'whatsapp';
  if (raw === 'email') return 'email';
  return 'system';
}

function mapStatus(actionType: string, newStatus: string | null): LogStatus {
  const s = (newStatus || actionType || '').toLowerCase();
  if (s.includes('fail') || s.includes('error')) return 'failed';
  if (s.includes('pending') || s.includes('wait')) return 'pending';
  if (s.includes('block')) return 'blocked';
  if (s.includes('missing') || s.includes('no_phone')) return 'missing_phone';
  return 'sent';
}

function mapScope(entityType: string): LogScope {
  if (entityType === 'driver' || entityType === 'drivers') return 'driver';
  if (entityType === 'vehicle' || entityType === 'vehicles') return 'vehicle';
  return 'company';
}

function mapTiming(createdAt: string): LogTiming {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  if (created > now + 60_000) return 'future';
  if (created < now - 7 * 24 * 60 * 60 * 1000) return 'history';
  return 'active';
}

export function systemLogToNotificationEntry(row: SystemLogRow): NotificationLogEntry {
  return {
    id: row.id,
    scope: mapScope(row.entity_type || ''),
    timing: mapTiming(row.created_at),
    createdAt: row.created_at,
    companyName: row.company_name || '',
    vehiclePlate: row.vehicle_plate || undefined,
    topic: row.action_type || row.entity_type || 'מערכת',
    channel: mapChannel(row.channel),
    status: mapStatus(row.action_type, row.new_status),
    source: 'auto',
    notes: row.details || undefined,
  };
}

export function customAlertToNotificationEntry(row: CustomAlertRow): NotificationLogEntry {
  const blob = `${row.title || ''}\n${row.description || ''}`;
  const plate = plateFromAlertText(blob);
  const vehicleId = vehicleIdFromAlertText(blob) || undefined;
  const driverId = driverIdFromAlertText(blob) || undefined;
  const driverName = driverNameFromAlertText(blob) || undefined;
  const scope: LogScope = driverId ? 'driver' : plate || vehicleId ? 'vehicle' : 'company';
  return {
    id: row.id,
    customAlertId: row.id,
    scope,
    timing: classifyAlertTiming(row.alert_date, row.is_active !== false),
    createdAt: row.created_at || row.alert_date || new Date().toISOString(),
    scheduledFor: row.alert_date || undefined,
    companyName: row.company_name || '',
    vehiclePlate: plate || undefined,
    vehicleId,
    driverId,
    driverName,
    topic: row.title || row.alert_type || 'התראה',
    channel: 'system',
    status: row.is_active === false ? 'sent' : 'pending',
    source: 'manual',
    notes: row.description || undefined,
  };
}

export async function fetchCustomAlertLogEntries(filters?: {
  companyName?: string | null;
  vehiclePlate?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
  limit?: number;
}): Promise<NotificationLogEntry[]> {
  let q = supabase
    .from('custom_alerts')
    .select('id, created_at, company_name, title, description, alert_date, alert_type, is_active')
    .order('alert_date', { ascending: true })
    .limit(filters?.limit || 500);

  if (filters?.companyName) q = q.eq('company_name', filters.companyName);

  const { data, error } = await q;
  if (error) {
    console.error('[notificationLogService] custom_alerts', error);
    return [];
  }

  const plateNorm = (filters?.vehiclePlate || '').replace(/[-\s]/g, '');
  return (data as CustomAlertRow[])
    .map(customAlertToNotificationEntry)
    .filter((e) => {
      if (filters?.driverId) return e.driverId === filters.driverId;
      if (filters?.vehicleId || filters?.vehiclePlate) {
        if (filters.vehicleId && e.vehicleId === filters.vehicleId) return true;
        if (filters.vehiclePlate) {
          const p = (e.vehiclePlate || '').replace(/[-\s]/g, '');
          if (p && (p === plateNorm || e.vehiclePlate === filters.vehiclePlate)) return true;
        }
        return false;
      }
      return true;
    });
}

export async function fetchActiveCustomAlertCount(filters: {
  companyName?: string | null;
  vehiclePlate?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
}): Promise<number> {
  const rows = await fetchCustomAlertLogEntries(filters);
  return rows.filter((e) => e.timing === 'active' || e.timing === 'future').length;
}

export async function deactivateCustomAlert(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('custom_alerts').update({ is_active: false }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Loads notification-relevant rows from system_logs (WhatsApp/email/system channels). */
export async function fetchNotificationLogEntries(limit = 500): Promise<NotificationLogEntry[]> {
  const { data, error } = await supabase
    .from('system_logs')
    .select(
      'id, created_at, company_name, action_type, entity_type, entity_id, vehicle_plate, details, channel, new_status',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[notificationLogService]', error);
    return [];
  }

  return (data as SystemLogRow[]).map(systemLogToNotificationEntry);
}
