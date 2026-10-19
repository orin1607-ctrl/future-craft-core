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

  it('renders permanent DAL ID and waiting status for customer link preview card', async () => {
    listClaimsAiConversations.mockResolvedValue({
      data: [{
        id: 'conv-links',
        user_id: 'user-1',
        claim_id: null,
        title: 'שיחה כללית',
        created_at: '2026-10-19T10:00:00Z',
        updated_at: '2026-10-19T10:05:00Z',
        archived: false,
      }],
      error: null,
    });
    listClaimsAiMessages.mockResolvedValue({
      data: [
        {
          id: 'm-cust-new-dal',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'הכנתי קישור פתיחת תיק.',
          created_at: '2026-10-19T10:10:00Z',
          tool_name: 'preview_send_customer_link',
          metadata: {
            pending_action: {
              preview_id: 'P-CUST-DAL-247',
              summary: 'שליחת קישור פתיחת תיק והעלאת מסמכים ללקוח "ישראל ישראלי" (תיק DAL-2026-0247)',
              tool_name: 'preview_send_customer_link',
              action_type: 'send_customer_link',
              status: 'pending',
              parameters: {
                claim_id: 'DAL-2026-0247',
                recipient_name: 'ישראל ישראלי',
                recipient_phone: '052-9998877',
                recipient_email: 'israel@example.com',
                channel: 'both',
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
        claim={null}
        userId="user-1"
        companyName="מוסך אורן קאר"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('claims-ai-preview')).toBeDefined();
    });

    const preview = screen.getByTestId('claims-ai-preview');
    expect(preview.textContent).toContain('DAL-2026-0247');
    expect(preview.textContent).toContain('ממתין למילוי הלקוח');
    expect(preview.textContent).toContain('ישראל ישראלי');
    expect(preview.textContent).toContain('אימייל + WhatsApp');
  });

  it('ensures speech recognition does NOT duplicate sentences across interim and final events', async () => {
    let mockInstance: any = null;
    class MockSpeechRecognition {
      lang = 'he-IL';
      continuous = true;
      interimResults = true;
      onresult: ((ev: any) => void) | null = null;
      onerror: ((ev: any) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        mockInstance = this;
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).isSecureContext = true;

    listClaimsAiMessages.mockResolvedValue({ data: [], error: null });

    render(
      <ClaimsAiWorkspace
        open={true}
        onClose={vi.fn()}
        claim={null}
        userId="user-1"
        companyName="מוסך אורן קאר"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('claims-ai-mic')).toBeDefined();
    });

    const micBtn = screen.getByTestId('claims-ai-mic');
    const inputEl = screen.getByTestId('claims-ai-input') as HTMLTextAreaElement;

    // Start mic
    await act(async () => {
      fireEvent.click(micBtn);
    });

    expect(mockInstance).not.toBeNull();

    // 1. First event: interim speech result "שלום דליה"
    await act(async () => {
      mockInstance.onresult({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: 'שלום דליה' }], { isFinal: false }),
        ],
      });
    });

    expect(inputEl.value).toBe('שלום דליה');

    // 2. Second event: interim speech result updates with additional word "שלום דליה מה שלומך"
    await act(async () => {
      mockInstance.onresult({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: 'שלום דליה מה שלומך' }], { isFinal: false }),
        ],
      });
    });

    // Interim replaced cleanly, not duplicated!
    expect(inputEl.value).toBe('שלום דליה מה שלומך');

    // 3. Third event: first segment becomes final, second interim starts
    await act(async () => {
      mockInstance.onresult({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: 'שלום דליה מה שלומך' }], { isFinal: true }),
          Object.assign([{ transcript: 'יש לי שאלה' }], { isFinal: false }),
        ],
      });
    });

    expect(inputEl.value).toBe('שלום דליה מה שלומך יש לי שאלה');

    // 4. Fourth event: second segment becomes final
    await act(async () => {
      mockInstance.onresult({
        resultIndex: 1,
        results: [
          Object.assign([{ transcript: 'שלום דליה מה שלומך' }], { isFinal: true }),
          Object.assign([{ transcript: 'יש לי שאלה' }], { isFinal: true }),
        ],
      });
    });

    expect(inputEl.value).toBe('שלום דליה מה שלומך יש לי שאלה');

    // Stop mic
    await act(async () => {
      fireEvent.click(micBtn);
    });

    // Value preserved once and editable
    expect(inputEl.value).toBe('שלום דליה מה שלומך יש לי שאלה');

    // 5. User manually edits the textarea
    await act(async () => {
      fireEvent.change(inputEl, { target: { value: 'שלום דליה, יש לי שאלה חשובה' } });
    });

    expect(inputEl.value).toBe('שלום דליה, יש לי שאלה חשובה');

    // Start mic again for another sentence
    await act(async () => {
      fireEvent.click(micBtn);
    });

    await act(async () => {
      mockInstance.onresult({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: 'לגבי התיק' }], { isFinal: true }),
        ],
      });
    });

    // Appended smoothly to the manually edited text, NO duplication of old speech!
    expect(inputEl.value).toBe('שלום דליה, יש לי שאלה חשובה לגבי התיק');

    delete (window as any).SpeechRecognition;
  });
});
