import { supabase } from '@/integrations/supabase/client';
import { createTeamChatIfNeeded } from '@/features/telemarketing/services/teamChatService';
import type { TelemarketingWorkSession, UrgencyLevel, WorkTaskType } from '@/features/telemarketing/types';

const TABLE = 'telemarketing_work_sessions';

function mapRow(row: Record<string, unknown>): TelemarketingWorkSession {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName: String(row.employee_name || ''),
    customerId: (row.customer_id as string | null) ?? null,
    companyName: String(row.company_name || ''),
    contactName: (row.contact_name as string | null) ?? undefined,
    phone: String(row.phone || ''),
    taskType: String(row.task_type || ''),
    description: (row.description as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    needsFollowUp: Boolean(row.needs_follow_up),
    startedAt: String(row.started_at),
    endedAt: (row.ended_at as string | null) ?? null,
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    status: row.status as TelemarketingWorkSession['status'],
    clientToken: String(row.client_token),
    createdAt: String(row.created_at),
  };
}

export async function getOpenWorkSession(employeeId: string): Promise<TelemarketingWorkSession | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('employee_id', employeeId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function startWorkSession(payload: {
  employeeId: string;
  employeeName: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  customerId?: string | null;
  clientToken: string;
}): Promise<TelemarketingWorkSession> {
  const { data: existing } = await supabase
    .from(TABLE)
    .select('*')
    .eq('client_token', payload.clientToken)
    .maybeSingle();
  if (existing) return mapRow(existing as Record<string, unknown>);

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      employee_id: payload.employeeId,
      employee_name: payload.employeeName,
      customer_id: payload.customerId ?? null,
      company_name: payload.companyName ?? '',
      contact_name: payload.contactName ?? null,
      phone: payload.phone ?? '',
      status: 'in_progress',
      client_token: payload.clientToken,
      created_by: payload.employeeId,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function endWorkSession(sessionId: string): Promise<TelemarketingWorkSession> {
  const { data: current, error: fetchErr } = await supabase.from(TABLE).select('*').eq('id', sessionId).single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (current.ended_at) return mapRow(current as Record<string, unknown>);

  const endedAt = new Date();
  const startedAt = new Date(current.started_at as string);
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ended_at: endedAt.toISOString(), duration_seconds: durationSeconds })
    .eq('id', sessionId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function submitWorkSessionReport(payload: {
  sessionId: string;
  taskType: WorkTaskType | string;
  description: string;
  note?: string;
  needsFollowUp: boolean;
  companyName?: string;
  contactName?: string;
  phone?: string;
  needsDaliaCare?: boolean;
  daliaCareType?: string;
  daliaCareTypeOther?: string;
  daliaCareDetail?: string;
  daliaCareUrgency?: UrgencyLevel;
  daliaCareDueDate?: string;
}): Promise<TelemarketingWorkSession> {
  const { data: current, error: fetchErr } = await supabase.from(TABLE).select('*').eq('id', payload.sessionId).single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (current.status === 'completed') {
    await attachWorkDaliaCare(payload, current as Record<string, unknown>);
    return mapRow(current as Record<string, unknown>);
  }
  if (!payload.taskType) throw new Error('חובה לבחור סוג משימה');
  if (!payload.description.trim()) throw new Error('חובה לכתוב מה בוצע');

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      task_type: payload.taskType,
      description: payload.description.trim(),
      note: payload.note?.trim() || null,
      needs_follow_up: payload.needsFollowUp,
      company_name: payload.companyName ?? current.company_name,
      contact_name: payload.contactName ?? current.contact_name,
      phone: payload.phone ?? current.phone,
      status: 'completed',
    })
    .eq('id', payload.sessionId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  await attachWorkDaliaCare(payload, data as Record<string, unknown>);
  return mapRow(data as Record<string, unknown>);
}

async function attachWorkDaliaCare(
  payload: {
    sessionId: string;
    description: string;
    companyName?: string;
    contactName?: string;
    phone?: string;
    needsDaliaCare?: boolean;
    daliaCareType?: string;
    daliaCareTypeOther?: string;
    daliaCareDetail?: string;
    daliaCareUrgency?: UrgencyLevel;
    daliaCareDueDate?: string;
  },
  row: Record<string, unknown>,
) {
  try {
    await createTeamChatIfNeeded({
      agentId: String(row.employee_id),
      agentName: String(row.employee_name || ''),
      companyName: payload.companyName || String(row.company_name || ''),
      contactName: payload.contactName || ((row.contact_name as string | null) ?? undefined),
      phone: payload.phone || String(row.phone || ''),
      workSessionId: payload.sessionId,
      lastCallSummary: payload.description,
      clientToken: `dalia-work-${String(row.client_token || payload.sessionId)}`,
      care: {
        needsDaliaCare: payload.needsDaliaCare,
        daliaCareType: payload.daliaCareType,
        daliaCareTypeOther: payload.daliaCareTypeOther,
        daliaCareDetail: payload.daliaCareDetail,
        daliaCareUrgency: payload.daliaCareUrgency,
        daliaCareDueDate: payload.daliaCareDueDate,
      },
    });
  } catch (e) {
    throw new Error(
      'המשימה נשמרה, אך יצירת טיפול דליה נכשלה: ' + (e instanceof Error ? e.message : ''),
    );
  }
}

export async function getWorkSessions(limit = 500): Promise<TelemarketingWorkSession[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('started_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function getWorkSessionsForLead(phone: string, companyName: string): Promise<TelemarketingWorkSession[]> {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  const orFilters: string[] = [];
  if (digits) orFilters.push(`phone.eq.${digits}`);
  if (phone.trim()) orFilters.push(`phone.eq.${phone.trim()}`);
  if (companyName.trim()) orFilters.push(`company_name.ilike.${companyName.trim()}`);
  if (orFilters.length === 0) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .or(orFilters.join(','))
    .order('started_at', { ascending: true })
    .limit(50);
  if (error || !data) return [];
  return data.map((row) => mapRow(row as Record<string, unknown>));
}
