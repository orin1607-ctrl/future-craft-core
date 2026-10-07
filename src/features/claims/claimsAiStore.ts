import { supabase } from '@/integrations/supabase/client';
import type { ClaimsAiConversation, ClaimsAiMessage } from './claimsAiModel';

type DbError = { message: string; code?: string };
type DbResult<T> = { data: T | null; error: DbError | null };

interface Builder extends PromiseLike<DbResult<unknown>> {
  select(columns: string): Builder;
  insert(row: Record<string, unknown>): Builder;
  update(row: Record<string, unknown>): Builder;
  eq(column: string, value: string | boolean): Builder;
  is(column: string, value: null): Builder;
  order(column: string, options: { ascending: boolean }): Builder;
  limit(count: number): Builder;
  single(): Promise<DbResult<unknown>>;
}

function from(table: string): Builder {
  return (supabase as unknown as { from: (name: string) => Builder }).from(table);
}

function asConversation(row: unknown): ClaimsAiConversation {
  const r = row as ClaimsAiConversation;
  return {
    id: r.id,
    user_id: r.user_id,
    claim_id: r.claim_id ?? null,
    title: r.title || 'שיחה חדשה',
    created_at: r.created_at,
    updated_at: r.updated_at,
    archived: !!r.archived,
  };
}

function asMessage(row: unknown): ClaimsAiMessage {
  const r = row as ClaimsAiMessage;
  return {
    id: r.id,
    conversation_id: r.conversation_id,
    role: r.role,
    content: r.content || '',
    created_at: r.created_at,
    tool_name: r.tool_name ?? null,
    metadata: r.metadata && typeof r.metadata === 'object' ? r.metadata : {},
  };
}

export function claimsAiSchemaMissing(error: DbError | null): boolean {
  const code = error?.code || '';
  const message = error?.message || '';
  return code === '42P01' || code === 'PGRST205' || /claims_ai_(conversations|messages)/.test(message);
}

export async function listClaimsAiConversations(userId: string, claimId: string | null): Promise<DbResult<ClaimsAiConversation[]>> {
  let query = from('claims_ai_conversations')
    .select('id, user_id, claim_id, title, created_at, updated_at, archived')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(50);
  query = claimId ? query.eq('claim_id', claimId) : query.is('claim_id', null);
  const { data, error } = await query;
  if (error) return { data: null, error };
  return { data: (Array.isArray(data) ? data : []).map(asConversation), error: null };
}

export async function createClaimsAiConversation(input: {
  userId: string;
  claimId: string | null;
  title: string;
}): Promise<DbResult<ClaimsAiConversation>> {
  const { data, error } = await from('claims_ai_conversations')
    .insert({
      user_id: input.userId,
      claim_id: input.claimId,
      title: input.title || 'שיחה חדשה',
    })
    .select('id, user_id, claim_id, title, created_at, updated_at, archived')
    .single();
  if (error || !data) return { data: null, error: error || { message: 'יצירת השיחה נכשלה' } };
  return { data: asConversation(data), error: null };
}

export async function archiveClaimsAiConversation(id: string): Promise<DbError | null> {
  const { error } = await from('claims_ai_conversations')
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  return error;
}

export async function listClaimsAiMessages(conversationId: string): Promise<DbResult<ClaimsAiMessage[]>> {
  const { data, error } = await from('claims_ai_messages')
    .select('id, conversation_id, role, content, created_at, tool_name, metadata')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) return { data: null, error };
  return { data: (Array.isArray(data) ? data : []).map(asMessage), error: null };
}

export async function insertClaimsAiMessage(input: {
  conversationId: string;
  role: ClaimsAiMessage['role'];
  content: string;
  toolName?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<DbResult<ClaimsAiMessage>> {
  const { data, error } = await from('claims_ai_messages')
    .insert({
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      tool_name: input.toolName || null,
      metadata: input.metadata || {},
    })
    .select('id, conversation_id, role, content, created_at, tool_name, metadata')
    .single();
  if (error || !data) return { data: null, error: error || { message: 'שמירת ההודעה נכשלה' } };
  return { data: asMessage(data), error: null };
}

export async function renameClaimsAiConversation(id: string, title: string): Promise<DbError | null> {
  const { error } = await from('claims_ai_conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id);
  return error;
}
