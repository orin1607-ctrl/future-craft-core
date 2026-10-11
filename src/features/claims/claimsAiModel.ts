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

/** A claim document the chat showed to the user. Display only; never sent to the model. */
export type ClaimsAiDocumentCard = {
  kind: 'document';
  claim_id: string;
  file_id: string;
  title: string;
  original_name: string;
  mime_type: string;
  read_status: string;
  needs_read: boolean;
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

/** Document cards from a stream event or saved message metadata. Drops anything malformed. */
export function documentCardsOf(raw: unknown, claimId?: string | null): ClaimsAiDocumentCard[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).document_cards)
    ? ((raw as Record<string, unknown>).document_cards as unknown[])
    : [];
  const out: ClaimsAiDocumentCard[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const file_id = String(row.file_id || '').trim();
    const claim_id = String(row.claim_id || '').trim();
    if (row.kind !== 'document' || !file_id || !claim_id) continue;
    if (claimId && claim_id !== claimId) continue;
    if (out.some((c) => c.file_id === file_id)) continue;
    out.push({
      kind: 'document',
      claim_id,
      file_id,
      title: String(row.title || row.original_name || 'מסמך'),
      original_name: String(row.original_name || ''),
      mime_type: String(row.mime_type || ''),
      read_status: String(row.read_status || ''),
      needs_read: row.needs_read === true,
    });
  }
  return out;
}

export function activeConversationStorageKey(userId: string, claimId: string | null): string {
  return `claims-ai-active:${userId}:${claimId || 'none'}`;
}
