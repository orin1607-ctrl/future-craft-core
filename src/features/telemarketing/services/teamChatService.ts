import { supabase } from '@/integrations/supabase/client';
import { leadKey, isUsableLeadKey } from '@/features/telemarketing/lib/leadKey';
import { localDateStr } from '@/features/telemarketing/lib/localDate';
import { formatOpenDuration, isChatClosed, openDurationSeconds, validateDaliaCare } from '@/features/telemarketing/lib/teamChat';
import type { TeamChat, TeamChatMessage, TeamChatStatus, TeamChatSummary, UrgencyLevel } from '@/features/telemarketing/types';
import { INTERNAL_CHAT_TYPE } from '@/features/telemarketing/types';

export { formatOpenDuration, isChatClosed, openDurationSeconds, validateDaliaCare };

const TABLE_CHATS = 'telemarketing_team_chats';
const TABLE_MESSAGES = 'telemarketing_team_messages';
const TABLE_READS = 'telemarketing_team_chat_reads';

function mapChat(row: Record<string, unknown>, unreadCount = 0): TeamChat {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    agentName: String(row.agent_name || ''),
    companyName: String(row.company_name || ''),
    contactName: (row.contact_name as string | null) ?? undefined,
    phone: String(row.phone || ''),
    email: (row.email as string | null) ?? undefined,
    leadKey: (row.lead_key as string | null) ?? null,
    callId: (row.call_id as string | null) ?? null,
    followupId: (row.followup_id as string | null) ?? null,
    workSessionId: (row.work_session_id as string | null) ?? null,
    careType: String(row.care_type || ''),
    careTypeOther: (row.care_type_other as string | null) ?? null,
    requestDetail: String(row.request_detail || ''),
    urgency: (row.urgency as UrgencyLevel) || 'רגיל',
    dueAt: (row.due_at as string | null) ?? null,
    lastCallSummary: (row.last_call_summary as string | null) ?? null,
    status: row.status as TeamChatStatus,
    openedAt: String(row.opened_at),
    firstResponseAt: (row.first_response_at as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
    closedAt: (row.closed_at as string | null) ?? null,
    closedBy: (row.closed_by as string | null) ?? null,
    closingSummary: (row.closing_summary as string | null) ?? null,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    lastMessagePreview: (row.last_message_preview as string | null) ?? null,
    unreadCount,
    initiatedBy: row.initiated_by === 'admin' ? 'admin' : 'agent',
  };
}

function mapMessage(row: Record<string, unknown>): TeamChatMessage {
  return {
    id: String(row.id),
    chatId: String(row.chat_id),
    authorId: String(row.author_id),
    authorName: String(row.author_name || ''),
    authorRole: row.author_role as TeamChatMessage['authorRole'],
    body: String(row.body || ''),
    kind: (row.kind as TeamChatMessage['kind']) || 'user',
    createdAt: String(row.created_at),
  };
}

async function attachUnread(rows: TeamChat[], userId: string): Promise<TeamChat[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const [{ data: messages }, { data: reads }] = await Promise.all([
    supabase.from(TABLE_MESSAGES).select('chat_id, author_id, created_at, kind').in('chat_id', ids),
    supabase.from(TABLE_READS).select('chat_id, last_read_at').eq('user_id', userId).in('chat_id', ids),
  ]);
  const readMap = new Map((reads ?? []).map((r) => [String(r.chat_id), String(r.last_read_at)]));
  const counts = new Map<string, number>();
  for (const msg of messages ?? []) {
    if (String(msg.author_id) === userId) continue;
    if (String(msg.kind) === 'system') continue;
    const lastRead = readMap.get(String(msg.chat_id));
    if (!lastRead || String(msg.created_at) > lastRead) {
      counts.set(String(msg.chat_id), (counts.get(String(msg.chat_id)) || 0) + 1);
    }
  }
  return rows.map((row) => ({ ...row, unreadCount: counts.get(row.id) || 0 }));
}

export async function createTeamChatIfNeeded(payload: {
  agentId: string;
  agentName: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  callId?: string | null;
  followupId?: string | null;
  workSessionId?: string | null;
  lastCallSummary?: string;
  clientToken: string;
  care: {
    needsDaliaCare?: boolean;
    daliaCareType?: string;
    daliaCareTypeOther?: string;
    daliaCareDetail?: string;
    daliaCareUrgency?: UrgencyLevel;
    daliaCareDueDate?: string;
  };
}): Promise<TeamChat | null> {
  const invalid = validateDaliaCare(payload.care);
  if (invalid) throw new Error(invalid);
  if (!payload.care.needsDaliaCare) return null;
  return createTeamChat({
    agentId: payload.agentId,
    agentName: payload.agentName,
    companyName: payload.companyName,
    contactName: payload.contactName,
    phone: payload.phone,
    email: payload.email,
    callId: payload.callId,
    followupId: payload.followupId,
    workSessionId: payload.workSessionId,
    careType: payload.care.daliaCareType || '',
    careTypeOther: payload.care.daliaCareTypeOther,
    requestDetail: payload.care.daliaCareDetail || '',
    urgency: payload.care.daliaCareUrgency,
    dueDate: payload.care.daliaCareDueDate,
    lastCallSummary: payload.lastCallSummary,
    clientToken: payload.clientToken,
  });
}

export async function createTeamChat(payload: {
  agentId: string;
  agentName: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  callId?: string | null;
  followupId?: string | null;
  workSessionId?: string | null;
  careType: string;
  careTypeOther?: string;
  requestDetail: string;
  urgency?: UrgencyLevel;
  dueDate?: string;
  lastCallSummary?: string;
  clientToken: string;
}): Promise<TeamChat> {
  if (!payload.careType) throw new Error('חובה לבחור סוג טיפול');
  if (payload.careType === 'אחר' && !payload.careTypeOther?.trim()) throw new Error('סוג אחר — חובה לפרט');
  if (!payload.requestDetail.trim()) throw new Error('חובה לכתוב מה צריך לבצע');

  const { data: existing } = await supabase.from(TABLE_CHATS).select('*').eq('client_token', payload.clientToken).maybeSingle();
  if (existing) return mapChat(existing as Record<string, unknown>);

  const key = leadKey(payload.phone || '', payload.companyName || '');
  const { data: userData } = await supabase.auth.getUser();
  const actorId = userData.user?.id;
  if (!actorId) throw new Error('יש להתחבר כדי לפתוח פנייה');

  const initiatedBy = actorId === payload.agentId ? 'agent' : 'admin';
  const status = initiatedBy === 'admin' ? 'ממתין לנציג' : 'חדש';

  const { data, error } = await supabase
    .from(TABLE_CHATS)
    .insert({
      agent_id: payload.agentId,
      agent_name: payload.agentName,
      company_name: payload.companyName || '',
      contact_name: payload.contactName ?? null,
      phone: payload.phone || '',
      email: payload.email ?? null,
      lead_key: isUsableLeadKey(key) ? key : null,
      call_id: payload.callId ?? null,
      followup_id: payload.followupId ?? null,
      work_session_id: payload.workSessionId ?? null,
      care_type: payload.careType,
      care_type_other: payload.careTypeOther?.trim() || null,
      request_detail: payload.requestDetail.trim(),
      urgency: payload.urgency || 'רגיל',
      due_at: payload.dueDate ? `${payload.dueDate}T12:00:00` : null,
      last_call_summary: payload.lastCallSummary ?? null,
      status,
      initiated_by: initiatedBy,
      client_token: payload.clientToken,
      last_message_at: new Date().toISOString(),
      last_message_preview: payload.requestDetail.trim().slice(0, 140),
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  const { data: actorProfile } = await supabase.from('profiles').select('full_name').eq('id', actorId).maybeSingle();
  const actorName = actorProfile?.full_name || payload.agentName;

  const { error: sysErr } = await supabase.from(TABLE_MESSAGES).insert({
    chat_id: data.id,
    author_id: actorId,
    author_name: actorName,
    author_role: 'system',
    kind: 'system',
    body:
      initiatedBy === 'admin'
        ? `מנהל פתח פנייה פנימית: ${payload.careType}${payload.careTypeOther ? ` (${payload.careTypeOther})` : ''} — ${payload.requestDetail.trim()}`
        : `נפתח טיפול: ${payload.careType}${payload.careTypeOther ? ` (${payload.careTypeOther})` : ''} — ${payload.requestDetail.trim()}`,
  });
  if (sysErr) throw new Error(sysErr.message);

  if (initiatedBy === 'admin') {
    const { error: msgErr } = await supabase.from(TABLE_MESSAGES).insert({
      chat_id: data.id,
      author_id: actorId,
      author_name: actorName,
      author_role: 'super_admin',
      kind: 'user',
      body: payload.requestDetail.trim(),
    });
    if (msgErr) throw new Error(msgErr.message);
  }

  return mapChat(data as Record<string, unknown>);
}

export async function getTeamChatById(chatId: string): Promise<TeamChat | null> {
  const { data, error } = await supabase.from(TABLE_CHATS).select('*').eq('id', chatId).maybeSingle();
  if (error || !data) return null;
  const { data: userData } = await supabase.auth.getUser();
  const mapped = mapChat(data as Record<string, unknown>);
  if (!userData.user?.id) return mapped;
  const [withUnread] = await attachUnread([mapped], userData.user.id);
  return withUnread;
}

export async function getTeamChats(): Promise<TeamChat[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  const { data, error } = await supabase.from(TABLE_CHATS).select('*').order('opened_at', { ascending: false }).limit(400);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((row) => mapChat(row as Record<string, unknown>));
  if (!userId) return rows;
  return attachUnread(rows, userId);
}

export async function getTeamChatsForLead(phone: string, companyName: string): Promise<TeamChat[]> {
  const key = leadKey(phone, companyName);
  if (!isUsableLeadKey(key)) return [];
  const { data, error } = await supabase.from(TABLE_CHATS).select('*').eq('lead_key', key).order('opened_at', { ascending: true });
  if (error || !data) return [];
  return data.map((row) => mapChat(row as Record<string, unknown>));
}

export async function getTeamMessages(chatId: string): Promise<TeamChatMessage[]> {
  const { data, error } = await supabase.from(TABLE_MESSAGES).select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapMessage(row as Record<string, unknown>));
}

export async function sendTeamMessage(payload: {
  chatId: string;
  authorId: string;
  authorName: string;
  authorRole: 'telemarketing_agent' | 'super_admin';
  body: string;
}): Promise<TeamChatMessage> {
  if (!payload.body.trim()) throw new Error('יש לכתוב הודעה');
  const { data, error } = await supabase
    .from(TABLE_MESSAGES)
    .insert({
      chat_id: payload.chatId,
      author_id: payload.authorId,
      author_name: payload.authorName,
      author_role: payload.authorRole,
      kind: 'user',
      body: payload.body.trim(),
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapMessage(data as Record<string, unknown>);
}

export async function updateTeamChatStatus(payload: {
  chatId: string;
  status: TeamChatStatus;
  actorId: string;
  actorName: string;
  closingSummary?: string;
}): Promise<void> {
  if (payload.status !== 'ארכיון') {
    const { error: msgErr } = await supabase.from(TABLE_MESSAGES).insert({
      chat_id: payload.chatId,
      author_id: payload.actorId,
      author_name: payload.actorName,
      author_role: 'system',
      kind: 'system',
      body:
        payload.status === 'הושלם'
          ? `הטיפול נסגר: ${payload.closingSummary?.trim() || ''}`
          : `סטטוס עודכן ל-${payload.status}`,
    });
    if (msgErr) throw new Error(msgErr.message);
  }
  const patch: Record<string, unknown> = { status: payload.status };
  if (payload.status === 'הושלם') patch.closing_summary = payload.closingSummary?.trim() || null;
  if (payload.status === 'הושלם' || payload.status === 'ארכיון') patch.closed_by = payload.actorId;
  const { error } = await supabase.from(TABLE_CHATS).update(patch).eq('id', payload.chatId);
  if (error) throw new Error(error.message);
}

export async function markTeamChatRead(chatId: string, userId: string): Promise<void> {
  await supabase.from(TABLE_READS).upsert(
    { user_id: userId, chat_id: chatId, last_read_at: new Date().toISOString() },
    { onConflict: 'user_id,chat_id' },
  );
}

export async function getTeamChatBadge(userId: string, role: 'agent' | 'admin'): Promise<{ newCount: number; unreadCount: number; waitingAgent: number }> {
  const chats = await getTeamChats();
  const unreadCount = chats.reduce((sum, c) => sum + c.unreadCount, 0);
  if (role === 'admin') {
    return {
      newCount: chats.filter((c) => c.status === 'חדש').length,
      unreadCount,
      waitingAgent: chats.filter((c) => c.status === 'ממתין לנציג').length,
    };
  }
  return {
    newCount: chats.filter((c) => c.status === 'ממתין לנציג').length,
    unreadCount,
    waitingAgent: chats.filter((c) => c.status === 'ממתין לנציג').length,
  };
}

export async function getTeamChatSummary(): Promise<TeamChatSummary> {
  const chats = await getTeamChats();
  const today = localDateStr();
  const firsts: number[] = [];
  const closes: number[] = [];
  for (const chat of chats) {
    if (chat.firstResponseAt) firsts.push(openDurationSeconds(chat.openedAt, chat.firstResponseAt));
    if (chat.closedAt) closes.push(openDurationSeconds(chat.openedAt, chat.closedAt));
  }
  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  return {
    newToday: chats.filter((c) => localDateStr(new Date(c.openedAt)) === today).length,
    openNow: chats.filter((c) => !isChatClosed(c.status)).length,
    closedToday: chats.filter((c) => c.closedAt && localDateStr(new Date(c.closedAt)) === today).length,
    waitingAgent: chats.filter((c) => c.status === 'ממתין לנציג').length,
    waitingCustomer: chats.filter((c) => c.status === 'ממתין ללקוח').length,
    avgFirstResponseSeconds: avg(firsts),
    avgCloseSeconds: avg(closes),
  };
}

export async function getTelemarketingAgents(): Promise<{ id: string; displayName: string }[]> {
  const { data: roles, error } = await supabase.from('user_roles').select('user_id').eq('role', 'telemarketing_agent');
  if (error) throw new Error(error.message);
  const ids = Array.from(new Set((roles ?? []).map((r) => String(r.user_id)).filter(Boolean)));
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, user_number').in('id', ids);
  return (profiles ?? [])
    .map((p) => ({ id: String(p.id), displayName: String(p.full_name || p.user_number || p.id) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
}

export async function createManagerInternalChat(payload: {
  agentId: string;
  agentName: string;
  body: string;
  urgency?: UrgencyLevel;
  companyName?: string;
  contactName?: string;
  phone?: string;
}): Promise<TeamChat> {
  if (!payload.agentId) throw new Error('חובה לבחור עובד');
  return createTeamChat({
    agentId: payload.agentId,
    agentName: payload.agentName,
    companyName: payload.companyName,
    contactName: payload.contactName,
    phone: payload.phone,
    careType: INTERNAL_CHAT_TYPE,
    requestDetail: payload.body,
    urgency: payload.urgency,
    clientToken: `dalia-internal-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
  });
}

