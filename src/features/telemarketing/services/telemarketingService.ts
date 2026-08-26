import { supabase } from '@/integrations/supabase/client';
import { createTeamChatIfNeeded } from '@/features/telemarketing/services/teamChatService';
import { followUpBucket, localDateStr } from '@/features/telemarketing/lib/localDate';
import { formatClock, formatDay } from '@/features/telemarketing/lib/formatTime';
import { leadKey } from '@/features/telemarketing/lib/leadKey';
import { keepsContinuedTreatment, suggestedLeadTraffic } from '@/features/telemarketing/lib/leadTraffic';
import { closeOpenFollowUpsForLead, getLeadStates, upsertLeadState } from '@/features/telemarketing/services/leadStateService';
import { getWorkSessions } from '@/features/telemarketing/services/workSessionService';
import type {
  AgentPerformance,
  ActivityJournalItem,
  CallResult,
  CompleteCallReportPayload,
  ExistingCustomerLookup,
  FollowUpWorkItem,
  StartCallPayload,
  TelemarketingCall,
  TelemarketingDashboardSummary,
  TelemarketingFollowUp,
  WorkTimeSummary,
} from '@/features/telemarketing/types';

const TABLE_CALLS = 'telemarketing_calls';
const TABLE_FOLLOWUPS = 'telemarketing_followups';

function normalizePhone(phone: string): string {
  return (phone || '').replace(/[^0-9+]/g, '');
}

function todayStr(): string {
  return localDateStr();
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
      source_followup_id: payload.sourceFollowUpId ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error('שגיאה בהתחלת שיחה: ' + error.message);
  return mapCallRow(data);
}

export async function getOpenCallForEmployee(employeeId: string): Promise<TelemarketingCall | null> {
  const { data, error } = await supabase
    .from(TABLE_CALLS)
    .select('*')
    .eq('employee_id', employeeId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
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
    try {
      await createTeamChatIfNeeded({
        agentId: String(currentRow.employee_id),
        agentName: String(currentRow.employee_name || ''),
        companyName: String(currentRow.company_name || ''),
        contactName: (currentRow.contact_name as string | null) ?? undefined,
        phone: String(currentRow.phone || ''),
        email: (currentRow.email as string | null) ?? undefined,
        callId: payload.callId,
        followupId: existingFollowUp?.id ?? payload.sourceFollowUpId ?? (currentRow.source_followup_id as string | null),
        lastCallSummary: payload.summary || String(currentRow.summary || ''),
        clientToken: `dalia-call-${payload.clientToken}`,
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
        'השיחה נשמרה, אך יצירת טיפול דליה נכשלה: ' + (e instanceof Error ? e.message : '') + ' (ID שיחה: ' + payload.callId + ')',
      );
    }
    return { call: mapCallRow(currentRow), followUp: existingFollowUp, duplicate: true };
  }

  if (!payload.result || !payload.summary || payload.needsFollowUp === undefined) {
    throw new Error('דיווח חובה: תוצאת שיחה, סיכום, והאם נדרשת המשכיות הם שדות חובה');
  }
  const continued = keepsContinuedTreatment(payload.result);
  const needsFollow = Boolean(payload.needsFollowUp || continued);
  if (payload.needsFollowUp && !payload.followUpDate && !continued) {
    throw new Error('נדרשת המשכיות מסומן - חובה למלא תאריך לחזרה');
  }
  const followDate = payload.followUpDate || (continued ? localDateStr() : null);

  const { data: updatedCall, error: updateErr } = await supabase
    .from(TABLE_CALLS)
    .update({
      result: payload.result,
      lead_rating: payload.leadRating,
      summary: payload.summary,
      needs_follow_up: needsFollow,
      next_action: payload.nextAction ?? (continued ? 'המשך טיפול — אין מענה' : null),
      follow_up_owner: payload.followUpOwner ?? null,
      follow_up_date: followDate,
      follow_up_time: payload.followUpTime ?? null,
      follow_up_urgency: payload.followUpUrgency ?? null,
      manager_note: payload.managerNote ?? null,
      status: 'completed',
      client_token: payload.clientToken,
      whatsapp_status: needsFollow ? 'pending' : 'not_applicable',
      email_status: needsFollow ? 'pending' : 'not_applicable',
    })
    .eq('id', payload.callId)
    .select('*')
    .single();

  if (updateErr) throw new Error('שגיאה בשמירת הדיווח: ' + updateErr.message);

  let followUp: TelemarketingFollowUp | null = null;
  const skipFollowUp = payload.leadColor === 'red';
  const sourceFollowUpId = payload.sourceFollowUpId || (updatedCall.source_followup_id as string | null);

  if (needsFollow && !skipFollowUp) {
    const existing = await getFollowUpByCallId(payload.callId);
    if (existing) {
      followUp = existing;
    } else if (sourceFollowUpId && continued) {
      const { data: kept, error: keepErr } = await supabase
        .from(TABLE_FOLLOWUPS)
        .update({
          due_date: followDate,
          due_time: payload.followUpTime ?? null,
          action_needed: payload.nextAction || 'המשך טיפול — אין מענה',
          owner: payload.followUpOwner ?? null,
          status: 'open',
        })
        .eq('id', sourceFollowUpId)
        .eq('status', 'open')
        .select('*')
        .maybeSingle();
      if (keepErr) {
        throw new Error(
          'השיחה נשמרה, אך עדכון המשך הטיפול נכשל: ' + keepErr.message + ' (ID שיחה: ' + payload.callId + ')',
        );
      }
      if (kept) {
        followUp = mapFollowUpRow(kept);
      } else {
        const { data: openRow } = await supabase.from(TABLE_FOLLOWUPS).select('*').eq('id', sourceFollowUpId).maybeSingle();
        followUp = openRow ? mapFollowUpRow(openRow) : null;
      }
    } else {
      const { data: fu, error: fuErr } = await supabase
        .from(TABLE_FOLLOWUPS)
        .insert({
          call_id: payload.callId,
          company_name: updatedCall.company_name,
          contact_name: updatedCall.contact_name,
          phone: updatedCall.phone,
          action_needed: payload.nextAction || (continued ? 'המשך טיפול — אין מענה' : ''),
          owner: payload.followUpOwner ?? null,
          due_date: followDate,
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

  if (sourceFollowUpId && !continued) {
    const { error: closeErr } = await supabase
      .from(TABLE_FOLLOWUPS)
      .update({
        status: 'done',
        completed_by: currentRow.employee_id,
        completed_at: new Date().toISOString(),
        closed_by_call_id: payload.callId,
      })
      .eq('id', sourceFollowUpId)
      .eq('status', 'open');
    if (closeErr) {
      throw new Error(
        'השיחה נשמרה, אך סגירת החזרה הקודמת נכשלה: ' + closeErr.message + ' (ID שיחה: ' + payload.callId + ')',
      );
    }
  }

  try {
    await applyLeadTrafficFromReport(payload, updatedCall as Record<string, unknown>);
  } catch (e) {
    throw new Error(
      'השיחה נשמרה, אך שמירת הרמזור נכשלה: ' + (e instanceof Error ? e.message : '') + ' (ID שיחה: ' + payload.callId + ')',
    );
  }

  try {
    await createTeamChatIfNeeded({
      agentId: String(updatedCall.employee_id),
      agentName: String(updatedCall.employee_name || ''),
      companyName: String(updatedCall.company_name || ''),
      contactName: (updatedCall.contact_name as string | null) ?? undefined,
      phone: String(updatedCall.phone || ''),
      email: (updatedCall.email as string | null) ?? undefined,
      callId: payload.callId,
      followupId: followUp?.id ?? sourceFollowUpId ?? null,
      lastCallSummary: payload.summary,
      clientToken: `dalia-call-${payload.clientToken}`,
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
      'השיחה נשמרה, אך יצירת טיפול דליה נכשלה: ' + (e instanceof Error ? e.message : '') + ' (ID שיחה: ' + payload.callId + ')',
    );
  }

  return { call: mapCallRow(updatedCall), followUp, duplicate: false };
}

async function applyLeadTrafficFromReport(payload: CompleteCallReportPayload, callRow: Record<string, unknown>) {
  if (!payload.leadColor || !payload.leadStatus) return;
  await upsertLeadState({
    phone: String(callRow.phone || ''),
    companyName: String(callRow.company_name || ''),
    contactName: (callRow.contact_name as string | null) ?? undefined,
    employeeId: String(callRow.employee_id),
    employeeName: String(callRow.employee_name || ''),
    color: payload.leadColor,
    status: payload.leadStatus,
    reason: payload.closeReason || payload.summary,
  });
  if (payload.leadColor === 'red' && payload.closeOpenFollowUps !== false) {
    await closeOpenFollowUpsForLead(String(callRow.phone || ''), String(callRow.company_name || ''), String(callRow.employee_id));
  }
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
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return { found: false };

  const last = data[0];
  const { data: openFollowUp } = await supabase
    .from(TABLE_FOLLOWUPS)
    .select('due_date, action_needed')
    .eq('call_id', last.id)
    .eq('status', 'open')
    .maybeSingle();

  const lastStarted = String(last.started_at || last.created_at || '');
  return {
    found: true,
    companyName: last.company_name,
    contactName: last.contact_name ?? undefined,
    lastCallDate: lastStarted ? formatDay(lastStarted) : undefined,
    lastCallTime: lastStarted ? formatClock(lastStarted) : undefined,
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
    for (const f of followUps) {
      const bucket = followUpBucket(String(f.due_date), f.due_time ? String(f.due_time).slice(0, 5) : null, 'open');
      if (bucket === 'today') summary.followUpsToday++;
      if (bucket === 'late') summary.followUpsLate++;
    }
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

export async function getFollowUpWorkItems(): Promise<FollowUpWorkItem[]> {
  const rows = await getFollowUps();
  const callIds = Array.from(new Set(rows.map((r) => r.callId)));
  const callMap = new Map<string, TelemarketingCall>();
  if (callIds.length > 0) {
    const { data } = await supabase.from(TABLE_CALLS).select('*').in('id', callIds);
    for (const row of data ?? []) {
      const call = mapCallRow(row);
      callMap.set(call.id, call);
    }
  }
  const states = await getLeadStates().catch(() => []);
  const stateByKey = new Map(states.map((s) => [s.leadKey, s]));
  return rows.map((fu) => {
    const origin = callMap.get(fu.callId);
    const key = leadKey(fu.phone, fu.companyName);
    const state = stateByKey.get(key);
    const inferred = origin?.result ? suggestedLeadTraffic(origin.result, origin.needsFollowUp) : null;
    return {
      ...fu,
      employeeId: origin?.employeeId || '',
      employeeName: origin?.employeeName || fu.owner || '',
      lastResult: origin?.result ?? null,
      lastSummary: origin?.summary ?? null,
      lastRecordingPath: origin?.recordingPath ?? null,
      bucket: followUpBucket(fu.dueDate, fu.dueTime, fu.status),
      leadColor: state?.leadColor ?? inferred?.color ?? null,
      leadStatus: state?.leadStatus ?? inferred?.status ?? null,
      closeReason: state?.reason ?? null,
    };
  });
}

export async function getLeadHistory(phone: string, companyName: string): Promise<TelemarketingCall[]> {
  const normPhone = normalizePhone(phone);
  const orFilters: string[] = [];
  if (normPhone) orFilters.push(`phone.eq.${normPhone}`);
  if (companyName.trim()) orFilters.push(`company_name.ilike.${companyName.trim()}`);
  if (orFilters.length === 0) return [];

  const { data, error } = await supabase
    .from(TABLE_CALLS)
    .select('*')
    .or(orFilters.join(','))
    .order('started_at', { ascending: true })
    .limit(50);
  if (error || !data) return [];
  return data.map(mapCallRow);
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
        workCount: 0,
        workSeconds: 0,
        avgWorkSeconds: 0,
        totalWorkSeconds: 0,
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

  try {
    const sessions = await getWorkSessions();
    for (const session of sessions) {
      const dateOnly = session.startedAt.slice(0, 10);
      if (dateOnly !== today) continue;
      const key = session.employeeId || session.employeeName;
      if (!byAgent.has(key)) {
        byAgent.set(key, {
          employeeId: session.employeeId,
          employeeName: session.employeeName,
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
          workCount: 0,
          workSeconds: 0,
          avgWorkSeconds: 0,
          totalWorkSeconds: 0,
        });
      }
      const agent = byAgent.get(key)!;
      agent.workCount++;
      if (session.durationSeconds) {
        agent.workSeconds += session.durationSeconds;
        agent.totalWorkSeconds += session.durationSeconds;
      }
    }
  } catch {
    /* work table may be empty before first use */
  }

  const merged = Array.from(byAgent.values());
  for (const agent of merged) {
    agent.avgCallDurationSeconds = agent.callsToday > 0 ? Math.round(agent.totalCallDurationSeconds / agent.callsToday) : 0;
    agent.avgWorkSeconds = agent.workCount > 0 ? Math.round(agent.workSeconds / agent.workCount) : 0;
  }
  return merged.sort((a, b) => b.callsToday + b.workCount - (a.callsToday + a.workCount));
}

function inDateRange(iso: string, from?: string, to?: string): boolean {
  const day = localDateStr(new Date(iso));
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export async function getActivityJournal(filter?: {
  from?: string;
  to?: string;
  employeeId?: string;
}): Promise<ActivityJournalItem[]> {
  const [{ calls }, sessions] = await Promise.all([getDashboardData(1000), getWorkSessions(1000)]);
  const items: ActivityJournalItem[] = [];
  for (const call of calls) {
    if (filter?.employeeId && call.employeeId !== filter.employeeId) continue;
    if (!inDateRange(call.startedAt, filter?.from, filter?.to)) continue;
    items.push({
      id: `call-${call.id}`,
      kind: 'call',
      employeeId: call.employeeId,
      employeeName: call.employeeName,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      durationSeconds: call.durationSeconds,
      title: call.companyName ? `שיחה עם ${call.companyName}` : 'שיחה',
      detail: call.result || call.summary,
    });
  }
  for (const session of sessions) {
    if (filter?.employeeId && session.employeeId !== filter.employeeId) continue;
    if (!inDateRange(session.startedAt, filter?.from, filter?.to)) continue;
    items.push({
      id: `work-${session.id}`,
      kind: 'work',
      employeeId: session.employeeId,
      employeeName: session.employeeName,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds: session.durationSeconds,
      title: session.companyName ? `${session.taskType || 'משימה'} — ${session.companyName}` : session.taskType || 'משימת עבודה',
      detail: session.description || session.note,
    });
  }
  return items.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export async function getWorkTimeSummary(filter?: {
  from?: string;
  to?: string;
}): Promise<WorkTimeSummary[]> {
  const journal = await getActivityJournal(filter);
  const byAgent = new Map<string, WorkTimeSummary>();
  for (const item of journal) {
    if (!byAgent.has(item.employeeId)) {
      byAgent.set(item.employeeId, {
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        callCount: 0,
        workCount: 0,
        callSeconds: 0,
        workSeconds: 0,
        totalSeconds: 0,
        avgCallSeconds: 0,
        avgWorkSeconds: 0,
      });
    }
    const row = byAgent.get(item.employeeId)!;
    const dur = item.durationSeconds || 0;
    if (item.kind === 'call') {
      row.callCount++;
      row.callSeconds += dur;
    } else {
      row.workCount++;
      row.workSeconds += dur;
    }
    row.totalSeconds += dur;
  }
  return Array.from(byAgent.values()).map((row) => ({
    ...row,
    avgCallSeconds: row.callCount > 0 ? Math.round(row.callSeconds / row.callCount) : 0,
    avgWorkSeconds: row.workCount > 0 ? Math.round(row.workSeconds / row.workCount) : 0,
  }));
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
    sourceFollowUpId: (row.source_followup_id as string | null) ?? null,
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
    closedByCallId: (row.closed_by_call_id as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}
