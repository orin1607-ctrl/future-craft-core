import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsAiWorkspace } from './ClaimsAiWorkspace';
import type { ClaimsAiClaimContext } from './claimsAiModel';

const { listClaimsAiConversations, listClaimsAiMessages, getSession, insertClaimsAiMessage } = vi.hoisted(() => ({
  listClaimsAiConversations: vi.fn(),
  listClaimsAiMessages: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: null as null | { access_token: string } } })),
  insertClaimsAiMessage: vi.fn(async () => ({ data: null, error: null })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => getSession(...args) } },
}));

vi.mock('./claimsAiStore', () => ({
  listClaimsAiConversations: (...args: unknown[]) => listClaimsAiConversations(...args),
  listClaimsAiMessages: (...args: unknown[]) => listClaimsAiMessages(...args),
  createClaimsAiConversation: vi.fn(),
  archiveClaimsAiConversation: vi.fn(),
  insertClaimsAiMessage: (...args: unknown[]) => insertClaimsAiMessage(...args),
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

  it('renders attach button and file input for photo/document uploads', async () => {
    render(
      <div className="claims-root">
        <ClaimsAiWorkspace open onClose={() => {}} claim={claimA} userId="user-1" companyName={null} />
      </div>,
    );
    expect(screen.getByTestId('claims-ai-attach-btn')).toBeInTheDocument();
    expect(screen.getByTestId('claims-ai-file-input')).toBeInTheDocument();
  });

  it('renders attachments in message history when present in metadata', async () => {
    listClaimsAiMessages.mockResolvedValue({
      data: [
        {
          id: 'm1',
          conversation_id: 'conv-1',
          role: 'user',
          content: 'תבדוק את הקובץ המצורף',
          created_at: '2026-10-07T08:01:00Z',
          tool_name: null,
          metadata: {
            attachments: [
              { name: 'damage_front.jpg', mime_type: 'image/jpeg', byte_size: 204800, file_id: 'CDM-001' },
              { name: 'surveyor_report.pdf', mime_type: 'application/pdf', byte_size: 512000, file_id: 'CDM-002' },
            ],
          },
        },
      ],
      error: null,
    });

    render(
      <div className="claims-root">
        <ClaimsAiWorkspace open onClose={() => {}} claim={claimA} userId="user-1" companyName={null} />
      </div>,
    );

    expect(await screen.findByText('damage_front.jpg')).toBeInTheDocument();
    expect(screen.getByText('surveyor_report.pdf')).toBeInTheDocument();
    expect(screen.getByTestId('claims-ai-msg-attachments')).toBeInTheDocument();
  });

  describe('document cards', () => {
    const cardMsg = (card: Record<string, unknown>) => ({
      data: [{ id: 'm3', conversation_id: 'conv-1', role: 'assistant', content: 'הנה דוח השמאי.', created_at: '2026-10-07T08:03:00Z', tool_name: null, metadata: { document_cards: [card] } }],
      error: null,
    });
    const baseCard = { kind: 'document', claim_id: 'DAL-2026-0001', file_id: 'F1', title: 'דוח שמאי – רכב 1234567', original_name: 'scan.pdf', mime_type: 'application/pdf' };

    it('shows the document with open and download, and reads an unread one once in the browser', async () => {
      listClaimsAiMessages.mockResolvedValue(cardMsg({ ...baseCard, read_status: '', needs_read: true }));
      const actions = {
        meta: vi.fn(() => null),
        open: vi.fn(async () => null),
        download: vi.fn(async () => null),
        read: vi.fn(async () => 'סיכום: נקרא.'),
      };
      render(<div className="claims-root"><ClaimsAiWorkspace open onClose={() => {}} claim={claimA} userId="user-1" companyName={null} documentActions={actions} /></div>);

      expect(await screen.findByText('📄 דוח שמאי – רכב 1234567')).toBeInTheDocument();
      expect(screen.getByText('קובץ מקורי: scan.pdf')).toBeInTheDocument();
      await waitFor(() => expect(actions.read).toHaveBeenCalledWith('F1'));
      expect(await screen.findByTestId('claims-ai-doc-note-F1')).toHaveTextContent('סיכום: נקרא.');
      fireEvent.click(screen.getByTestId('claims-ai-doc-open-F1'));
      fireEvent.click(screen.getByTestId('claims-ai-doc-download-F1'));
      expect(actions.open).toHaveBeenCalledWith('F1');
      expect(actions.download).toHaveBeenCalledWith('F1');
      expect(actions.read).toHaveBeenCalledTimes(1);
    });

    it('shows the saved read and does not read again', async () => {
      listClaimsAiMessages.mockResolvedValue(cardMsg({ ...baseCard, read_status: 'ready', needs_read: false }));
      const actions = {
        meta: vi.fn(() => ({ read_status: 'ready', read_summary: 'דוח שמאי לרכב', read_source: 'pdf_text', read_doc_type: 'דוח שמאי' })),
        open: vi.fn(async () => null),
        download: vi.fn(async () => null),
        read: vi.fn(async () => ''),
      };
      render(<div className="claims-root"><ClaimsAiWorkspace open onClose={() => {}} claim={claimA} userId="user-1" companyName={null} documentActions={actions} /></div>);

      expect(await screen.findByTestId('claims-ai-doc-read-F1')).toHaveTextContent('דוח שמאי לרכב');
      expect(actions.read).not.toHaveBeenCalled();
    });

    it('ignores a card from another claim', async () => {
      listClaimsAiMessages.mockResolvedValue(cardMsg({ ...baseCard, claim_id: 'DAL-2026-0999', read_status: '', needs_read: true }));
      render(<div className="claims-root"><ClaimsAiWorkspace open onClose={() => {}} claim={claimA} userId="user-1" companyName={null} /></div>);
      expect(await screen.findByText('הנה דוח השמאי.')).toBeInTheDocument();
      expect(screen.queryByTestId('claims-ai-doc-card-F1')).toBeNull();
    });
  });

  describe('claim field fix', () => {
    const pending = {
      preview_id: 'P-FIELDS-1',
      summary: 'תיקון פרטים בתיק DAL-2026-0001:\n• מספר תביעה בחברת הביטוח — ערך נוכחי: OLD-1 · ערך חדש: NEW-777',
      tool_name: 'preview_update_claim_fields',
      action_type: 'update_claim_fields',
      parameters: { claim_id: 'DAL-2026-0001', changes: [] },
    };

    it('shows old and new values, and after approval tells the screen to reload the claim', async () => {
      listClaimsAiMessages.mockResolvedValue({
        data: [{ id: 'm9', conversation_id: 'conv-1', role: 'assistant', content: 'הכנתי תיקון.', created_at: '2026-10-07T08:03:00Z', tool_name: null, metadata: { pending_action: pending } }],
        error: null,
      });
      getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } });
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, message: 'עודכנו 1 שדות בתיק DAL-2026-0001' }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const onActionExecuted = vi.fn();

      render(<div className="claims-root"><ClaimsAiWorkspace open onClose={() => {}} claim={claimA} userId="user-1" companyName={null} onActionExecuted={onActionExecuted} /></div>);

      expect(await screen.findByText(/ערך נוכחי: OLD-1 · ערך חדש: NEW-777/)).toBeInTheDocument();
      expect(onActionExecuted).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('claims-ai-confirm-btn'));

      await waitFor(() => expect(onActionExecuted).toHaveBeenCalledWith(expect.objectContaining({ action_type: 'update_claim_fields' })));
      const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown[])[1] && ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body));
      expect(body).toMatchObject({ action: 'execute_pending_action', claim_id: 'DAL-2026-0001' });
      vi.unstubAllGlobals();
      getSession.mockResolvedValue({ data: { session: null } });
    });

    it('does not tell the screen anything when the update failed', async () => {
      listClaimsAiMessages.mockResolvedValue({
        data: [{ id: 'm9', conversation_id: 'conv-1', role: 'assistant', content: 'הכנתי תיקון.', created_at: '2026-10-07T08:03:00Z', tool_name: null, metadata: { pending_action: pending } }],
        error: null,
      });
      getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } });
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, message: 'העדכון לא בוצע: השדות השתנו' }), { status: 400 })));
      const onActionExecuted = vi.fn();

      render(<div className="claims-root"><ClaimsAiWorkspace open onClose={() => {}} claim={claimA} userId="user-1" companyName={null} onActionExecuted={onActionExecuted} /></div>);
      fireEvent.click(await screen.findByTestId('claims-ai-confirm-btn'));

      expect(await screen.findByText(/העדכון לא בוצע/)).toBeInTheDocument();
      expect(onActionExecuted).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
      getSession.mockResolvedValue({ data: { session: null } });
    });
  });
});
