import { supabase } from '@/integrations/supabase/client';

/** רשומות היסטוריה ב-vehicle_tasks — לא נספרות כ"פתוחות" */
export const VEHICLE_HISTORY_LOG_STATUS = 'history_log';
export const VEHICLE_EVENT_TITLE_PREFIX = '__veh_evt__:';
export const CUSTOM_GAP_PREFIX = 'חוסר:';

export function isHistoryLogTask(task: { title?: string | null; status?: string | null }) {
  return (
    task.status === VEHICLE_HISTORY_LOG_STATUS ||
    (task.title || '').startsWith(VEHICLE_EVENT_TITLE_PREFIX)
  );
}

export function isCustomGapTask(task: { title?: string | null }) {
  return (task.title || '').startsWith(CUSTOM_GAP_PREFIX);
}

export function stripEventTitle(title: string) {
  return title.startsWith(VEHICLE_EVENT_TITLE_PREFIX)
    ? title.slice(VEHICLE_EVENT_TITLE_PREFIX.length)
    : title;
}

export function stripGapTitle(title: string) {
  return title.startsWith(CUSTOM_GAP_PREFIX) ? title.slice(CUSTOM_GAP_PREFIX.length) : title;
}

export async function logVehicleEvent(params: {
  vehicleId?: string;
  vehiclePlate: string;
  companyName: string;
  action: string;
  details?: string;
  status?: string;
  userId?: string;
  userName?: string;
}) {
  const { error } = await supabase.from('vehicle_tasks').insert({
    vehicle_id: params.vehicleId || null,
    vehicle_plate: params.vehiclePlate,
    title: `${VEHICLE_EVENT_TITLE_PREFIX}${params.action}`,
    description: [params.details, params.status ? `סטטוס: ${params.status}` : ''].filter(Boolean).join(' · '),
    status: VEHICLE_HISTORY_LOG_STATUS,
    company_name: params.companyName,
    created_by: params.userId || null,
    resolved_by_name: params.userName || '',
  });
  if (error) console.error('logVehicleEvent', error);
}

export async function addCustomVehicleGap(params: {
  vehicleId?: string;
  vehiclePlate: string;
  companyName: string;
  label: string;
  userId?: string;
  userName?: string;
}) {
  const label = params.label.trim();
  if (!label) return { error: new Error('empty') };
  const { data, error } = await supabase
    .from('vehicle_tasks')
    .insert({
      vehicle_id: params.vehicleId || null,
      vehicle_plate: params.vehiclePlate,
      title: `${CUSTOM_GAP_PREFIX}${label}`,
      description: 'חוסר מותאם אישית',
      status: 'open',
      company_name: params.companyName,
      created_by: params.userId || null,
      resolved_by_name: params.userName || '',
    })
    .select('id')
    .single();
  if (!error) {
    await logVehicleEvent({
      ...params,
      action: 'הוספת חוסר',
      details: label,
    });
  }
  return { data, error };
}

export async function resolveCustomVehicleGap(params: {
  gapId: string;
  vehiclePlate: string;
  companyName: string;
  label: string;
  userId?: string;
  userName?: string;
}) {
  const { error } = await supabase
    .from('vehicle_tasks')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: params.userId || null,
      resolved_by_name: params.userName || '',
    })
    .eq('id', params.gapId);
  if (!error) {
    await logVehicleEvent({
      vehiclePlate: params.vehiclePlate,
      companyName: params.companyName,
      action: 'סגירת חוסר',
      details: params.label,
      userId: params.userId,
      userName: params.userName,
    });
  }
  return { error };
}
