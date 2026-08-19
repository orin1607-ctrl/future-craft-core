import { supabase } from '@/integrations/supabase/client';
import { deviceSummary } from '@/lib/securityAuditLabels';

const SESSION_KEY = 'dalia_security_session_id';

type RpcClient = typeof supabase;

function rpc(name: string, args: Record<string, unknown>) {
  return (supabase as RpcClient).rpc(name as never, args as never);
}

export async function securityStartSession(): Promise<string | null> {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const { data, error } = await rpc('security_start_session', {
    p_device_summary: deviceSummary(),
  });
  if (error || !data) return null;
  const id = String(data);
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
}

export async function securityHeartbeat(): Promise<number | null> {
  const id = sessionStorage.getItem(SESSION_KEY);
  if (!id) return null;
  const { data, error } = await rpc('security_heartbeat', { p_session_id: id });
  if (error || !data) return null;
  const row = data as { accumulated_active_ms?: number };
  return row.accumulated_active_ms ?? null;
}

export async function securityEndSession(reason = 'logout'): Promise<void> {
  const id = sessionStorage.getItem(SESSION_KEY);
  if (!id) return;
  await rpc('security_end_session', { p_session_id: id, p_reason: reason });
  sessionStorage.removeItem(SESSION_KEY);
}

export async function securityRecordClientEvent(
  eventType: 'unauthorized_page' | 'forbidden_action' | 'session_invalid',
  opts?: { outcome?: string; action?: string; result?: string },
): Promise<void> {
  await rpc('security_record_client_event', {
    p_event_type: eventType,
    p_outcome: opts?.outcome || 'failure',
    p_action_label: opts?.action || 'ניסיון גישה ללא הרשאה',
    p_result_label: opts?.result || 'נדחה',
    p_session_id: sessionStorage.getItem(SESSION_KEY),
    p_device_summary: deviceSummary(),
    p_severity: 'high',
    p_details: { path: typeof window !== 'undefined' ? window.location.pathname : '' },
  });
}

export async function securityRecordAnonEvent(
  eventType: 'login_failed' | 'unauthorized_anonymous' | 'invalid_token',
  emailHint?: string,
): Promise<void> {
  await rpc('security_record_anon_event', {
    p_event_type: eventType,
    p_actor_email: emailHint || null,
    p_action_label: eventType === 'login_failed' ? 'התחברות נכשלה' : 'גישה אנונימית',
    p_result_label: 'נכשל',
    p_device_summary: deviceSummary(),
    p_details: {},
  });
}
