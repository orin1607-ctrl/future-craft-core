import { describe, expect, it } from 'vitest';
import {
  claimContextFromRecord,
  conversationMatchesClaim,
  chatBoundClaim,
  chatClaimOnOpen,
  conversationsForClaim,
  documentCardsOf,
  messagesForModel,
  pendingActionOf,
  titleFromFirstMessage,
  type ClaimsAiMessage,
} from './claimsAiModel';

const msg = (partial: Partial<ClaimsAiMessage> & Pick<ClaimsAiMessage, 'role' | 'content'>): ClaimsAiMessage => ({
  id: partial.id || 'm1',
  conversation_id: partial.conversation_id || 'c1',
  role: partial.role,
  content: partial.content,
  created_at: partial.created_at || '2026-10-07T00:00:00Z',
  tool_name: partial.tool_name ?? null,
  metadata: partial.metadata || {},
});

describe('claim context', () => {
  it('maps the open claim header and leaves the business number empty as טרם התקבל', () => {
    const ctx = claimContextFromRecord({
      id: 'DAL-2026-0007',
      claimNum: '',
      plate: '12-345-67',
      carModel: 'מאזדה 3',
      clientName: 'דנה לוי',
      insCompany: 'הראל',
      status: 'ממתין לחברת ביטוח',
    });
    expect(ctx).toEqual({
      claimId: 'DAL-2026-0007',
      claimNum: 'טרם התקבל',
      plate: '12-345-67',
      vehicle: '12-345-67 · מאזדה 3',
      clientName: 'דנה לוי',
      insCompany: 'הראל',
      status: 'ממתין לחברת ביטוח',
    });
  });
});

describe('conversation isolation', () => {
  const rows = [
    { id: 'a', claim_id: 'DAL-1', archived: false },
    { id: 'b', claim_id: 'DAL-2', archived: false },
    { id: 'c', claim_id: null, archived: false },
    { id: 'd', claim_id: 'DAL-1', archived: true },
  ];

  it('shows only the open claim and hides archived rows', () => {
    expect(conversationsForClaim(rows, 'DAL-1').map((r) => r.id)).toEqual(['a']);
  });

  it('does not show a previous claim when no file is open', () => {
    expect(conversationsForClaim(rows, null).map((r) => r.id)).toEqual(['c']);
  });

  it('rejects a conversation bound to another claim', () => {
    expect(conversationMatchesClaim('DAL-1', 'DAL-2')).toBe(false);
    expect(conversationMatchesClaim('DAL-2', 'DAL-2')).toBe(true);
    expect(conversationMatchesClaim('DAL-1', null)).toBe(false);
    expect(conversationMatchesClaim(null, null)).toBe(true);
  });
});

describe('messages and titles', () => {
  it('builds a short title from the first line', () => {
    expect(titleFromFirstMessage('  תביעה 123   – חברת הביטוח  ')).toBe('תביעה 123 – חברת הביטוח');
    expect(titleFromFirstMessage('')).toBe('שיחה חדשה');
  });

  it('sends only successful user and assistant turns from this conversation', () => {
    const out = messagesForModel([
      msg({ role: 'user', content: 'מה הסטטוס?' }),
      msg({ role: 'assistant', content: 'נכשל', metadata: { error: true } }),
      msg({ role: 'system', content: 'secret' }),
      msg({ role: 'assistant', content: 'הסטטוס ממתין.' }),
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'מה הסטטוס?' },
      { role: 'assistant', content: 'הסטטוס ממתין.' },
    ]);
  });

  it('reads a future write preview without treating it as permission to execute', () => {
    expect(pendingActionOf({ pending_action: { preview_id: 'p1', summary: 'שינוי סטטוס לנסגר', tool_name: 'preview_claim_status_change' } })?.preview_id).toBe('p1');
    expect(pendingActionOf({})).toBeNull();
  });
});

describe('documentCardsOf', () => {
  const card = { kind: 'document', claim_id: 'C1', file_id: 'F1', title: 'דוח שמאי – רכב 1234567', original_name: 'a.pdf', mime_type: 'application/pdf', read_status: '', needs_read: true };

  it('reads cards from a stream event or from saved metadata', () => {
    expect(documentCardsOf([card])).toHaveLength(1);
    expect(documentCardsOf({ document_cards: [card] })[0]).toMatchObject({ file_id: 'F1', needs_read: true });
  });

  it('keeps only cards of the open claim and drops malformed or repeated ones', () => {
    expect(documentCardsOf([card], 'C2')).toEqual([]);
    expect(documentCardsOf([card, card, { kind: 'document', file_id: '' }, null, 'x'], 'C1')).toHaveLength(1);
    expect(documentCardsOf({})).toEqual([]);
  });
});

describe('chat claim binding', () => {
  const claims = [{ id: 'DAL-2026-0013' }, { id: 'DAL-2026-0014' }];

  it('opening the chat from a claim card binds it to that claim; from the list it is general', () => {
    expect(chatClaimOnOpen(true, 'DAL-2026-0013')).toBe('DAL-2026-0013');
    expect(chatClaimOnOpen(false, 'DAL-2026-0013')).toBeNull();
    expect(chatClaimOnOpen(true, null)).toBeNull();
  });

  it('stays on the bound claim whatever the screen shows meanwhile (sub-windows, reloads)', () => {
    expect(chatBoundClaim('DAL-2026-0013', claims)?.id).toBe('DAL-2026-0013');
    expect(chatBoundClaim('DAL-2026-0013', [...claims].reverse())?.id).toBe('DAL-2026-0013');
    expect(chatBoundClaim(null, claims)).toBeNull();
    expect(chatBoundClaim('DAL-GONE', claims)).toBeNull();
  });
});

