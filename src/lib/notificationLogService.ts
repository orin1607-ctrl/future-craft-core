import { supabase } from '@/integrations/supabase/client';
import type {
  LogChannel,
  LogScope,
  LogStatus,
  LogTiming,
  NotificationLogEntry,
} from '@/lib/notificationLogMock';

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
