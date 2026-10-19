import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsAiWorkspace } from './ClaimsAiWorkspace';

const { listClaimsAiConversations, listClaimsAiMessages, getSession, insertClaimsAiMessage } = vi.hoisted(() => ({
  listClaimsAiConversations: vi.fn(),
  listClaimsAiMessages: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'fake-token' } } })),
  insertClaimsAiMessage: vi.fn(async () => ({ data: null, error: null })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
    functions: { invoke: vi.fn() },
  },
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

describe('Claims Links and Sharing UI (Task 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    listClaimsAiConversations.mockResolvedValue({
      data: [{
        id: 'conv-links',
        user_id: 'user-1',
        claim_id: 'DAL-2026-0246',
        title: 'שיתוף מסמכים וקישורים',
        created_at: '2026-10-19T10:00:00Z',
        updated_at: '2026-10-19T10:05:00Z',
        archived: false,
      }],
      error: null,
    });
  });

  it('renders custom preview card for send_customer_link with recipient, channel, and claim details', async () => {
    listClaimsAiMessages.mockResolvedValue({
      data: [
        {
          id: 'm-cust-link',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'הכנתי קישור להעלאת מסמכים עבור אילנה אטיאס לאישורך.',
          created_at: '2026-10-19T10:02:00Z',
          tool_name: 'preview_send_customer_link',
          metadata: {
            pending_action: {
              preview_id: 'P-CUST-1',
              summary: 'שליחת קישור פתיחת תיק / העלאת מסמכים ללקוח "אילנה אטיאס"',
              tool_name: 'preview_send_customer_link',
              action_type: 'send_customer_link',
              status: 'pending',
              parameters: {
                claim_id: 'DAL-2026-0246',
                recipient_name: 'אילנה אטיאס',
                recipient_phone: '050-1234567',
                recipient_email: 'ilana@example.com',
                channel: 'whatsapp',
              },
            },
          },
        },
      ],
      error: null,
    });

    render(
      <ClaimsAiWorkspace
        open={true}
        onClose={vi.fn()}
        claim={{
          claimId: 'DAL-2026-0246',
          claimNum: '2279692',
          plate: '65-941-85',
          vehicle: 'טויוטה קורולה',
          clientName: 'אילנה אטיאס',
          insCompany: 'הפניקס',
          status: 'חדש',
        }}
        userId="user-1"
        companyName="מוסך אורן קאר"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('claims-ai-preview')).toBeDefined();
    });

    const preview = screen.getByTestId('claims-ai-preview');
    expect(preview.textContent).toContain('קישור פתיחת תיק והעלאת מסמכים ללקוח');
    expect(preview.textContent).toContain('אילנה אטיאס');
    expect(preview.textContent).toContain('050-1234567');
    expect(preview.textContent).toContain('ilana@example.com');
    expect(preview.textContent).toContain('WhatsApp');
    expect(preview.textContent).toContain('DAL-2026-0246');
    expect(screen.getByTestId('claims-ai-confirm-btn')).toBeDefined();
    expect(screen.getByTestId('claims-ai-cancel-btn')).toBeDefined();
  });

  it('renders custom preview card for create_share_link with document titles, ttl, and recipient details', async () => {
    listClaimsAiMessages.mockResolvedValue({
      data: [
        {
          id: 'm-share-link',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'הכנתי קישור שיתוף עבור דוח השמאות לאישורך.',
          created_at: '2026-10-19T10:03:00Z',
          tool_name: 'preview_create_claim_share_link',
          metadata: {
            pending_action: {
              preview_id: 'P-SHARE-1',
              summary: 'יצירת קישור שיתוף עבור "אילנה אטיאס" לתוקף של 72 שעות (2 קבצים)',
              tool_name: 'preview_create_claim_share_link',
              action_type: 'create_share_link',
              status: 'pending',
              parameters: {
                claim_id: 'DAL-2026-0246',
                recipient_name: 'אילנה אטיאס',
                recipient_kind: 'client',
                recipient_phone: '050-1234567',
                recipient_email: 'ilana@example.com',
                ttl_hours: 72,
                file_ids: ['doc-1', 'doc-2'],
                file_titles: ['דוח שמאות 2270 עמוד 1', 'דוח שמאות 2270 עמוד 2'],
              },
            },
          },
        },
      ],
      error: null,
    });

    render(
      <ClaimsAiWorkspace
        open={true}
        onClose={vi.fn()}
        claim={{
          claimId: 'DAL-2026-0246',
          claimNum: '2279692',
          plate: '65-941-85',
          vehicle: 'טויוטה קורולה',
          clientName: 'אילנה אטיאס',
          insCompany: 'הפניקס',
          status: 'חדש',
        }}
        userId="user-1"
        companyName="מוסך אורן קאר"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('claims-ai-preview')).toBeDefined();
    });

    const preview = screen.getByTestId('claims-ai-preview');
    expect(preview.textContent).toContain('קישור שיתוף מסמכים מאובטח');
    expect(preview.textContent).toContain('אילנה אטיאס');
    expect(preview.textContent).toContain('72 שעות');
    expect(preview.textContent).toContain('דוח שמאות 2270 עמוד 1');
    expect(preview.textContent).toContain('דוח שמאות 2270 עמוד 2');
  });

  it('confirms send_customer_link and calls execute_pending_action endpoint with real link message and WhatsApp link', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'קישור העלאת מסמכים מאובטח נוצר בהצלחה עבור אילנה אטיאס!\nקישור: https://orin1607-ctrl.github.io/future-craft-core/claims-upload?t=tok123\nWhatsApp: [פתיחה ושליחה ב-WhatsApp](https://wa.me/0501234567?text=hello)',
      }),
    });
    global.fetch = mockFetch;

    listClaimsAiMessages.mockResolvedValue({
      data: [
        {
          id: 'm-cust-exec',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'הכנתי קישור.',
          created_at: '2026-10-19T10:04:00Z',
          tool_name: 'preview_send_customer_link',
          metadata: {
            pending_action: {
              preview_id: 'P-CUST-EXEC',
              summary: 'שליחת קישור פתיחת תיק ללקוח',
              tool_name: 'preview_send_customer_link',
              action_type: 'send_customer_link',
              status: 'pending',
              parameters: {
                claim_id: 'DAL-2026-0246',
                recipient_name: 'אילנה אטיאס',
                recipient_phone: '050-1234567',
                channel: 'whatsapp',
              },
            },
          },
        },
      ],
      error: null,
    });

    render(
      <ClaimsAiWorkspace
        open={true}
        onClose={vi.fn()}
        claim={{
          claimId: 'DAL-2026-0246',
          claimNum: '2279692',
          plate: '65-941-85',
          vehicle: 'טויוטה קורולה',
          clientName: 'אילנה אטיאס',
          insCompany: 'הפניקס',
          status: 'חדש',
        }}
        userId="user-1"
        companyName="מוסך אורן קאר"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('claims-ai-confirm-btn')).toBeDefined();
    });

    const confirmBtn = screen.getByTestId('claims-ai-confirm-btn');
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/help-ai-chat'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"action":"execute_pending_action"'),
        })
      );
    });

    // Check message insertion
    expect(insertClaimsAiMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('קישור העלאת מסמכים מאובטח נוצר בהצלחה'),
        role: 'assistant',
      })
    );
  });
});
