import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsAiWorkspace } from './ClaimsAiWorkspace';
import type { ClaimsAiClaimContext } from './claimsAiModel';

const { listClaimsAiConversations, listClaimsAiMessages } = vi.hoisted(() => ({
  listClaimsAiConversations: vi.fn(),
  listClaimsAiMessages: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

vi.mock('./claimsAiStore', () => ({
  listClaimsAiConversations: (...args: unknown[]) => listClaimsAiConversations(...args),
  listClaimsAiMessages: (...args: unknown[]) => listClaimsAiMessages(...args),
  createClaimsAiConversation: vi.fn(),
  archiveClaimsAiConversation: vi.fn(),
  insertClaimsAiMessage: vi.fn(),
  renameClaimsAiConversation: vi.fn(),
  claimsAiSchemaMissing: () => false,
}));

const claimA: ClaimsAiClaimContext = {
  claimId: 'DAL-2026-0001',
  claimNum: '123',
  plate: '11-222-33',
  vehicle: '11-222-33 · קיה',
  clientName: 'דנה לוי',
  insCompany: 'הראל',
  status: 'ממתין לחברת ביטוח',
};

describe('ClaimsAiWorkspace', () => {
  beforeEach(() => {
    listClaimsAiConversations.mockReset();
    listClaimsAiMessages.mockReset();
    listClaimsAiConversations.mockResolvedValue({
      data: [{
        id: 'conv-1',
        user_id: 'user-1',
        claim_id: 'DAL-2026-0001',
        title: 'תביעה 123 – חברת הביטוח',
        created_at: '2026-10-07T08:00:00Z',
        updated_at: '2026-10-07T09:00:00Z',
        archived: false,
      }],
      error: null,
    });
    listClaimsAiMessages.mockResolvedValue({
      data: [
        { id: 'm1', conversation_id: 'conv-1', role: 'user', content: 'מה הסטטוס?', created_at: '2026-10-07T08:01:00Z', tool_name: null, metadata: {} },
        { id: 'm2', conversation_id: 'conv-1', role: 'assistant', content: 'הסטטוס ממתין לחברת ביטוח.', created_at: '2026-10-07T08:02:00Z', tool_name: null, metadata: {} },
      ],
      error: null,
    });
  });

  it('opens a full workspace bound to the current claim and restores its messages', async () => {
    render(
      <div className="claims-root">
        <ClaimsAiWorkspace open onClose={() => {}} claim={claimA} userId="user-1" companyName={null} />
      </div>,
    );

    expect(screen.getByTestId('claims-ai-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('claims-ai-context')).toHaveTextContent('דנה לוי');
    expect(screen.getByTestId('claims-ai-context')).toHaveTextContent('הראל');
    expect(screen.getByTestId('claims-ai-context')).toHaveTextContent('DAL-2026-0001');
    expect(screen.getByTestId('claims-ai-mic')).toBeInTheDocument();
    expect(screen.getByTestId('claims-ai-new')).toBeInTheDocument();

    await waitFor(() => {
      expect(listClaimsAiConversations).toHaveBeenCalledWith('user-1', 'DAL-2026-0001');
    });
    expect(await screen.findByText('מה הסטטוס?')).toBeInTheDocument();
    expect(screen.getByText('הסטטוס ממתין לחברת ביטוח.')).toBeInTheDocument();
    expect(screen.getAllByText('תביעה 123 – חברת הביטוח').length).toBeGreaterThan(0);
  });

  it('does not keep the previous claim when no file is open', async () => {
    listClaimsAiConversations.mockResolvedValue({ data: [], error: null });
    render(
      <div className="claims-root">
        <ClaimsAiWorkspace open onClose={() => {}} claim={null} userId="user-1" companyName={null} />
      </div>,
    );
    expect(screen.getByTestId('claims-ai-context')).toHaveTextContent('אין תיק פתוח');
    await waitFor(() => {
      expect(listClaimsAiConversations).toHaveBeenCalledWith('user-1', null);
    });
    expect(screen.queryByText('דנה לוי')).not.toBeInTheDocument();
  });
});
