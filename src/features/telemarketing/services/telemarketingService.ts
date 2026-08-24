import { supabase } from '@/integrations/supabase/client';
import type {
  AgentPerformance,
  CallResult,
  CompleteCallReportPayload,
  ExistingCustomerLookup,
  StartCallPayload,
  TelemarketingCall,
  TelemarketingDashboardSummary,
  TelemarketingFollowUp,
} from '@/features/telemarketing/types';

const TABLE_CALLS = 'telemarketing_calls';
const TABLE_FOLLOWUPS = 'telemarketing_followups';

function normalizePhone(phone: string): string {
  return (phone || '').replace(/[^0-9+]/g, '');
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function startCall(payload: StartCallPayload): Promise<TelemarketingCall> {
  const { data: existing } = await supabase
    .from(TABLE_CALLS)
    .select('*')
    .eq('client_token', payload.clientToken)
    .maybeSingle();

  if (existing) return mapCallRow(existing);

  const { data, error } = await supabase
    .from(TABLE_CALLS)
    .insert({
      employee_id: payload.employeeId,
      employee_name: payload.employeeName,
      customer_id: payload.customerId ?? null,
      company_name: payload.companyName,
      contact_name: payload.contactName ?? null,
      contact_role: payload.contactRole ?? null,
      phone: payload.phone,
      email: payload.email ?? null,
      vehicle_count: payload.vehicleCount ?? null,
      city: payload.city ?? null,
      started_at: new Date().toISOString(),
      status: 'in_progress',
      client_token: payload.clientToken,
      created_by: payload.employeeId,
    })
    .select('*')
    .single();

  if (error) throw new Error('שגיאה בהתחלת שיחה: ' + error.message);
  return mapCallRow(data);
}

export async function endCall(callId: string): Promise<TelemarketingCall> {
  const { data: current, error: fetchErr } = await supabase
    .from(TABLE_CALLS)
    .select('*')
    .eq('id', callId)
    .single();
  if (fetchErr) throw new Error('שגיאה באיתור השיחה: ' + fetchErr.message);
  if (current.ended_at) return mapCallRow(current);

  const endedAt = new Date();
  const startedAt = new Date(current.started_at);
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));

  const { data, error } = await supabase
    .from(TABLE_CALLS)
    .update({
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq('id', callId)
    .select('*')
    .single();

  if (error) throw new Error('שגיאה בסיום שיחה: ' + error.message);
  return mapCallRow(data);
}

export async function submitCallReport(
  payload: CompleteCallReportPayload,
): Promise<{ call: TelemarketingCall; followUp: TelemarketingFollowUp | null; duplicate: boolean }> {
  const { data: currentRow, error: fetchErr } = await supabase
    .from(TABLE_CALLS)
    .select('*')
    .eq('id', payload.callId)
    .single();
  if (fetchErr) throw new Error('שגיאה באיתור השיחה: ' + fetchErr.message);

  if (currentRow.status === 'completed') {
    const existingFollowUp = currentRow.needs_follow_up ? await getFollowUpByCallId(payload.callId) : null;
    return { call: mapCallRow(currentRow), followUp: existingFollowUp, duplicate: true };
  }

  if (!payload.result || !payload.summary || payload.needsFollowUp === undefined) {
    throw new Error('דיווח חובה: תוצאת שיחה, סיכום, והאם נדרשת המשכיות הם שדות חובה');
  }
  if (payload.needsFollowUp && !payload.followUpDate) {
    throw new Error('נדרשת המשכיות מסומן - חובה למלא תאריך לחזרה');
  }

  const { data: updatedCall, error: updateErr } = await supabase
    .from(TABLE_CALLS)
    .update({
      result: payload.result,
      lead_rating: payload.leadRating,
      summary: payload.summary,
      needs_follow_up: payload.needsFollowUp,
      next_action: payload.nextAction ?? null,
      follow_up_owner: payload.followUpOwner ?? null,
      follow_up_date: payload.followUpDate ?? null,
      follow_up_time: payload.followUpTime ?? null,
      follow_up_urgency: payload.followUpUrgency ?? null,
      manager_note: payload.managerNote ?? null,
      status: 'completed',
      client_token: payload.clientToken,
      whatsapp_status: payload.needsFollowUp ? 'pending' : 'not_applicable',
      email_status: payload.needsFollowUp ? 'pending' : 'not_applicable',
    })
    .eq('id', payload.callId)
    .select('*')
    .single();

  if (updateErr) throw new Error('שגיאה בשמירת הדיווח: ' + updateErr.message);

  let followUp: TelemarketingFollowUp | null = null;
  if (payload.needsFollowUp) {
    const existing = await getFollowUpByCallId(payload.callId);
    if (existing) {
      followUp = existing;
    } else {
      const { data: fu, error: fuErr } = await supabase
        .from(TABLE_FOLLOWUPS)
        .insert({
          call_id: payload.callId,
          company_name: updatedCall.company_name,
          contact_name: updatedCall.contact_name,
          phone: updatedCall.phone,
          action_needed: payload.nextAction ?? '',
          owner: payload.followUpOwner ?? null,
          due_date: payload.followUpDate,
          due_time: payload.followUpTime ?? null,
          urgency: payload.followUpUrgency ?? 'רגיל',
          manager_note: payload.managerNote ?? null,
          status: 'open',
        })
        .select('*')
        .single();

      if (fuErr) {
        throw new Error(
          'השיחה נשמרה בהצלחה, אך יצירת ה-Follow-up נכשלה: ' + fuErr.message + ' (ID שיחה: ' + payload.callId + ')',
        );
      }
      followUp = mapFollowUpRow(fu);
    }
  }

  return { call: mapCallRow(updatedCall), followUp, duplicate: false };
}

async function getFollowUpByCallId(callId: string): Promise<TelemarketingFollowUp | null> {
  const { data } = await supabase.from(TABLE_FOLLOWUPS).select('*').eq('call_id', callId).maybeSingle();
  return data ? mapFollowUpRow(data) : null;
}

export async function checkExistingCustomer(phone: string, companyName: string): Promise<ExistingCustomerLookup> {
  const normPhone = normalizePhone(phone);
  const orFilters: string[] = [];
  if (normPhone) orFilters.push(`phone.eq.${normPhone}`);
  if (companyName) orFilters.push(`company_name.ilike.${companyName}`);
  if (orFilters.length === 0) return { found: false };

  const { data, error } = await supabase
    .from(TABLE_CALLS)
    .select('*')
    .or(orFilters.join(','))
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return { found: false };

  const last = data[0];
  const { data: openFollowUp } = await supabase
    .from(TABLE_FOLLOWUPS)
    .select('due_date, action_needed')
    .eq('call_id', last.id)
    .eq('status', 'open')
    .maybeSingle();

  return {
    found: true,
    companyName: last.company_name,
    contactName: last.contact_name ?? undefined,
    lastCallDate: last.created_at?.slice(0, 10),
    lastCallTime: last.created_at?.slice(11, 16),
    lastResult: last.result as CallResult,
    lastSummary: last.summary ?? undefined,
    openFollowUp: openFollowUp ? { dueDate: openFollowUp.due_date, actionNeeded: openFollowUp.action_needed } : null,
    inProgressByOtherAgent: false,
  };
}

export async function getDashboardData(limit = 300): Promise<{
  calls: TelemarketingCall[];
  summary: TelemarketingDashboardSummary;
}> {
  const { data, error } = await supabase
    .from(TABLE_CALLS)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error('שגיאה בטעינת נתוני Dashboard: ' + error.message);

  const calls = (data ?? []).map(mapCallRow);
  const today = todayStr();

  const summary: TelemarketingDashboardSummary = {
    callsToday: 0,
    answeredToday: 0,
    noAnswerToday: 0,
    totalCallDurationSeconds: 0,
    avgCallDurationSeconds: 0,
    interested: 0,
    hotLeads: 0,
    urgentLeads: 0,
    wantsInfo: 0,
    wantsQuote: 0,
    wantsMeeting: 0,
    followUpsOpen: 0,
    followUpsToday: 0,
    followUpsLate: 0,
  };

  let todayDurationSum = 0;
  let todayDurationCount = 0;

  for (const c of calls) {
    const dateOnly = c.createdAt.slice(0, 10);
    if (dateOnly === today) {
      summary.callsToday++;
      if (c.result && c.result !== 'לא ענה' && c.result !== 'מספר שגוי') summary.answeredToday++;
      if (c.result === 'לא ענה') summary.noAnswerToday++;
      if (c.durationSeconds) {
        todayDurationSum += c.durationSeconds;
        todayDurationCount++;
      }
    }
    if (['מעוניין', 'מעוניין מאוד', 'ביקש מידע', 'ביקש הצעת מחיר', 'רוצה פגישה'].includes(c.result ?? '')) {
      summary.interested++;
    }
    if (c.leadRating === 'חם') summary.hotLeads++;
    if (c.leadRating === 'דחוף') summary.urgentLeads++;
    if (c.result === 'ביקש מידע') summary.wantsInfo++;
    if (c.result === 'ביקש הצעת מחיר') summary.wantsQuote++;
    if (c.result === 'רוצה פגישה') summary.wantsMeeting++;
  }

  summary.totalCallDurationSeconds = todayDurationSum;
  summary.avgCallDurationSeconds = todayDurationCount > 0 ? Math.round(todayDurationSum / todayDurationCount) : 0;

  const { data: followUps, error: fuError } = await supabase.from(TABLE_FOLLOWUPS).select('*').eq('status', 'open');
  if (!fuError && followUps) {
    summary.followUpsOpen = followUps.length;
    summary.followUpsToday = followUps.filter((f) => f.due_date === today).length;
    summary.followUpsLate = followUps.filter((f) => f.due_date < today).length;
  }

  return { calls, summary };
}

export async function getFollowUps(filter?: { status?: 'open' | 'done' }): Promise<TelemarketingFollowUp[]> {
  let query = supabase.from(TABLE_FOLLOWUPS).select('*').order('due_date', { ascending: true });
  if (filter?.status) query = query.eq('status', filter.status);
  const { data, error } = await query;
  if (error) throw new Error('שגיאה בטעינת Follow-ups: ' + error.message);
  return (data ?? []).map(mapFollowUpRow);
}

export async function completeFollowUp(followUpId: string, completedBy: string): Promise<TelemarketingFollowUp> {
  const { data, error } = await supabase
    .from(TABLE_FOLLOWUPS)
    .update({ status: 'done', completed_by: completedBy, completed_at: new Date().toISOString() })
    .eq('id', followUpId)
    .select('*')
    .single();
  if (error) throw new Error('שגיאה בסגירת Follow-up: ' + error.message);
  return mapFollowUpRow(data);
}

export async function getAgentPerformance(limit = 1000): Promise<AgentPerformance[]> {
  const { data, error } = await supabase
    .from(TABLE_CALLS)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error('שגיאה בטעינת ביצועי עובדים: ' + error.message);

  const today = todayStr();
  const byAgent = new Map<string, AgentPerformance>();

  for (const row of data ?? []) {
    const call = mapCallRow(row);
    const key = call.employeeId || call.employeeName;
    if (!byAgent.has(key)) {
      byAgent.set(key, {
        employeeId: call.employeeId,
        employeeName: call.employeeName,
        employeeCode: null,
        callsToday: 0,
        answeredToday: 0,
        noAnswerToday: 0,
        hotLeads: 0,
        followUpsOpen: 0,
        totalCallDurationSeconds: 0,
        avgCallDurationSeconds: 0,
        wantsMeeting: 0,
        wantsInfo: 0,
        wantsQuote: 0,
      });
    }
    const agent = byAgent.get(key)!;
    const dateOnly = call.createdAt.slice(0, 10);

    if (dateOnly === today) {
      agent.callsToday++;
      if (call.result && call.result !== 'לא ענה' && call.result !== 'מספר שגוי') agent.answeredToday++;
      if (call.result === 'לא ענה') agent.noAnswerToday++;
      if (call.durationSeconds) agent.totalCallDurationSeconds += call.durationSeconds;
    }
    if (call.leadRating === 'חם' || call.leadRating === 'דחוף') agent.hotLeads++;
    if (call.result === 'רוצה פגישה') agent.wantsMeeting++;
    if (call.result === 'ביקש מידע') agent.wantsInfo++;
    if (call.result === 'ביקש הצעת מחיר') agent.wantsQuote++;
  }

  const ids = Array.from(byAgent.values()).map((a) => a.employeeId).filter(Boolean);
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, user_number, full_name').in('id', ids);
    for (const p of profiles ?? []) {
      const agent = byAgent.get(p.id);
      if (agent) {
        agent.employeeCode = p.user_number;
        if (p.full_name) agent.employeeName = p.full_name;
      }
    }
  }

  const { data: openFollowUps } = await supabase.from(TABLE_FOLLOWUPS).select('owner').eq('status', 'open');
  for (const fu of openFollowUps ?? []) {
    for (const agent of byAgent.values()) {
      if (fu.owner === agent.employeeName) agent.followUpsOpen++;
    }
  }

  const result = Array.from(byAgent.values());
  for (const agent of result) {
    agent.avgCallDurationSeconds = agent.callsToday > 0 ? Math.round(agent.totalCallDurationSeconds / agent.callsToday) : 0;
  }
  return result.sort((a, b) => b.callsToday - a.callsToday);
}

function mapCallRow(row: Record<string, unknown>): TelemarketingCall {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName: String(row.employee_name || ''),
    customerId: (row.customer_id as string | null) ?? null,
    companyName: String(row.company_name || ''),
    contactName: (row.contact_name as string | null) ?? undefined,
    contactRole: (row.contact_role as string | null) ?? undefined,
    phone: String(row.phone || ''),
    email: (row.email as string | null) ?? undefined,
    vehicleCount: (row.vehicle_count as number | null) ?? null,
    city: (row.city as string | null) ?? undefined,
    startedAt: String(row.started_at),
    endedAt: (row.ended_at as string | null) ?? null,
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    status: row.status as TelemarketingCall['status'],
    result: (row.result as CallResult | null) ?? null,
    leadRating: (row.lead_rating as TelemarketingCall['leadRating']) ?? null,
    summary: (row.summary as string | null) ?? null,
    needsFollowUp: Boolean(row.needs_follow_up),
    nextAction: (row.next_action as string | null) ?? null,
    followUpOwner: (row.follow_up_owner as string | null) ?? null,
    followUpDate: (row.follow_up_date as string | null) ?? null,
    followUpTime: row.follow_up_time ? String(row.follow_up_time).slice(0, 5) : null,
    followUpUrgency: (row.follow_up_urgency as TelemarketingCall['followUpUrgency']) ?? null,
    managerNote: (row.manager_note as string | null) ?? null,
    whatsappStatus: row.whatsapp_status as TelemarketingCall['whatsappStatus'],
    emailStatus: row.email_status as TelemarketingCall['emailStatus'],
    recordingPath: (row.recording_path as string | null) ?? null,
    recordingStatus: (row.recording_status as TelemarketingCall['recordingStatus']) || 'none',
    recordingMime: (row.recording_mime as string | null) ?? null,
    clientToken: String(row.client_token),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapFollowUpRow(row: Record<string, unknown>): TelemarketingFollowUp {
  return {
    id: String(row.id),
    callId: String(row.call_id),
    companyName: String(row.company_name || ''),
    contactName: (row.contact_name as string | null) ?? undefined,
    phone: String(row.phone || ''),
    actionNeeded: String(row.action_needed || ''),
    owner: (row.owner as string | null) ?? null,
    dueDate: String(row.due_date),
    dueTime: row.due_time ? String(row.due_time).slice(0, 5) : null,
    urgency: row.urgency as TelemarketingFollowUp['urgency'],
    managerNote: (row.manager_note as string | null) ?? null,
    status: row.status as TelemarketingFollowUp['status'],
    completedBy: (row.completed_by as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}
