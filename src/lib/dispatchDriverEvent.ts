import { supabase } from '@/integrations/supabase/client';
import { resolveDriverEventKey } from '@/lib/driverAppActions';

export type DriverEventPayload = {
  action_key: string;
  condition_value?: string | null;
  record: Record<string, unknown>;
  title?: string;
  message?: string;
  link?: string;
};

export async function dispatchDriverEvent(payload: DriverEventPayload) {
  const action_key = resolveDriverEventKey(payload.action_key, payload.condition_value);
  const { data, error } = await supabase.functions.invoke('notify-driver-event', {
    body: {
      action_key,
      condition_value: payload.condition_value || null,
      record: payload.record,
      title: payload.title || '',
      message: payload.message || '',
      link: payload.link || '',
    },
  });
  if (error) {
    console.error('notify-driver-event failed', error);
  }
  return { data, error };
}

export async function checkDriverEmergencySla() {
  return supabase.functions.invoke('notify-driver-event', { body: { check_sla: true } });
}
