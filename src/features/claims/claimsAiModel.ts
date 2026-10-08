import type { ClaimRecord } from './claimsConstants';

/** Header the claims AI is allowed to treat as the open file. Built from the open card only. */
export type ClaimsAiClaimContext = {
  claimId: string;
  claimNum: string;
  plate: string;
  vehicle: string;
  clientName: string;
  insCompany: string;
  status: string;
};

export type ClaimsAiConversation = {
  id: string;
  user_id: string;
  claim_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
};

export type ClaimsAiMessage = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
  tool_name: string | null;
  metadata: Record<string, unknown>;
};

export type ClaimsAiPendingAction = {
  preview_id: string;
  summary: string;
  tool_name: string;
  action_type?: string;
  status?: 'pending' | 'executed' | 'cancelled';
  parameters?: Record<string, unknown>;
};

export type ClaimsAiAttachment = {
  id?: string;
  name: string;
  mime_type: string;
  byte_size: number;
  file_id?: string;
  data_base64?: string;
  preview_url?: string;
};

const EMPTY = '—';

export function claimContextFromRecord(c: Pick<ClaimRecord, 'id'> & Partial<ClaimRecord>): ClaimsAiClaimContext {
  const claimNum = String(c.claimNum || '').trim();
  const plate = String(c.plate || '').trim();
  const model = String(c.carModel || '').trim();
  return {
    claimId: c.id,
    claimNum: claimNum || 'טרם התקבל',
    plate,
    vehicle: [plate, model].filter(Boolean).join(' · ') || EMPTY,
    clientName: String(c.clientName || '').trim() || EMPTY,
    insCompany: String(c.insCompany || '').trim() || EMPTY,
    status: String(c.status || '').trim() || EMPTY,
  };
}

/** A conversation is visible only for the claim it was created on. No open claim means unscoped chats only. */
export function conversationsForClaim<T extends { claim_id: string | null; archived?: boolean }>(
  rows: T[],
  claimId: string | null,
): T[] {
  return rows.filter((row) => {
    if (row.archived) return false;
    if (claimId) return row.claim_id === claimId;
    return row.claim_id == null || row.claim_id === '';
  });
}

export function conversationMatchesClaim(claimIdOnRow: string | null, openClaimId: string | null): boolean {
  if (openClaimId) return claimIdOnRow === openClaimId;
  return claimIdOnRow == null || claimIdOnRow === '';
}

export function titleFromFirstMessage(text: string): string {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  if (!line) return 'שיחה חדשה';
  return line.length > 42 ? `${line.slice(0, 42)}…` : line;
}

/** Model payload is this conversation only, without failed turns. */
export function messagesForModel(messages: ClaimsAiMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim() && m.metadata?.error !== true)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
}

export function pendingActionOf(metadata: Record<string, unknown> | null | undefined): ClaimsAiPendingAction | null {
  const raw = metadata?.pending_action;
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const preview_id = String(row.preview_id || '').trim();
  const summary = String(row.summary || '').trim();
  const tool_name = String(row.tool_name || '').trim();
  const action_type = String(row.action_type || '').trim();
  const status = (row.status as 'pending' | 'executed' | 'cancelled') || 'pending';
  const parameters = row.parameters && typeof row.parameters === 'object' ? (row.parameters as Record<string, unknown>) : undefined;
  if (!preview_id || !summary) return null;
  return { preview_id, summary, tool_name, action_type, status, parameters };
}

export function activeConversationStorageKey(userId: string, claimId: string | null): string {
  return `claims-ai-active:${userId}:${claimId || 'none'}`;
}
