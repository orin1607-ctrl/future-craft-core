import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsAiWorkspace, ClaimsCatalogWidget } from './ClaimsAiWorkspace';

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
    expect(preview.textContent).toContain('קישור פתיחת תיק חדש ללקוח');
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

  it('renders interactive buttons (open, copy, WhatsApp) on Card A without document link mixing', async () => {
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
          id: 'm-card-a',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'הכנתי קישור לפתיחת תיק.',
          created_at: '2026-10-19T10:15:00Z',
          tool_name: 'preview_send_customer_link',
          metadata: {
            pending_action: {
              preview_id: 'P-INTAKE-1',
              summary: 'פתיחת תיק חדש והכנת קישור ללקוח "אילנה אטיאס"',
              tool_name: 'preview_send_customer_link',
              action_type: 'send_customer_intake_link',
              status: 'pending',
              parameters: {
                claim_id: 'DAL-2026-0248',
                recipient_name: 'אילנה אטיאס',
                recipient_phone: '050-1234567',
                channel: 'whatsapp',
                link_type: 'intake',
                intake_url: 'https://orin1607-ctrl.github.io/future-craft-core/claims-intake?t=tok_intake_99',
                wa_link: 'https://wa.me/972501234567?text=intake_text',
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
      expect(screen.getByTestId('claims-ai-preview-intake-card')).toBeDefined();
    });

    const card = screen.getByTestId('claims-ai-preview-intake-card');
    expect(card.textContent).toContain('DAL-2026-0248');
    expect(card.textContent).toContain('ממתין למילוי הלקוח');
    expect(card.textContent).not.toContain('claims-share');

    // Open button
    const openBtn = screen.getByTestId('claims-ai-preview-open-intake-btn') as HTMLAnchorElement;
    expect(openBtn.href).toContain('claims-intake?t=tok_intake_99');
    expect(openBtn.target).toBe('_blank');

    // WhatsApp button
    const waBtn = screen.getByTestId('claims-ai-preview-wa-intake-btn') as HTMLAnchorElement;
    expect(waBtn.href).toContain('wa.me/972501234567');

    // Copy button
    const copyBtn = screen.getByTestId('claims-ai-preview-copy-intake-btn');
    expect(copyBtn.textContent).toContain('העתק קישור');

    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    });

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    await waitFor(() => {
      expect(copyBtn.textContent).toContain('✓ הועתק!');
    });
  });

  it('renders Card B2 with exact file checklist and missing documents alert box that disables confirm', async () => {
    listClaimsAiMessages.mockResolvedValue({
      data: [
        {
          id: 'm-card-b2-missing',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'הכנתי קישור לשיתוף מסמכים, אך רישיון הרכב חסר.',
          created_at: '2026-10-19T10:20:00Z',
          tool_name: 'preview_create_claim_share_link',
          metadata: {
            pending_action: {
              preview_id: 'P-SHARE-MISSING',
              summary: 'קישור שיתוף מסמכים לתיק DAL-2026-0246',
              tool_name: 'preview_create_claim_share_link',
              action_type: 'create_share_link',
              status: 'pending',
              parameters: {
                claim_id: 'DAL-2026-0246',
                recipient_name: 'שמאי מורשה',
                recipient_kind: 'surveyor',
                file_ids: ['doc-1', 'doc-2'],
                file_titles: [
                  'דוח שמאות 2270 (עמוד 1 מתוך 2)',
                  'דוח שמאות 2270 (עמוד 2 מתוך 2)',
                ],
                missing_documents: ['רישיון רכב'],
                ttl_hours: 48,
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
      expect(screen.getByTestId('claims-ai-preview-share-card')).toBeDefined();
    });

    const shareCard = screen.getByTestId('claims-ai-preview-share-card');
    expect(shareCard.textContent).toContain('דוח שמאות 2270 (עמוד 1 מתוך 2)');
    expect(shareCard.textContent).toContain('דוח שמאות 2270 (עמוד 2 מתוך 2)');
    expect(shareCard.textContent).toContain('מסמכים שנבחרו לשיתוף (2)');

    // Missing docs alert
    const missingAlert = screen.getByTestId('claims-ai-missing-docs-alert');
    expect(missingAlert.textContent).toContain('מסמכים שהתבקשו וחסרים בתיק:');
    expect(missingAlert.textContent).toContain('רישיון רכב');
    expect(missingAlert.textContent).toContain('העלה מסמך חסר (רישיון רכב)');

    // Confirm button must be disabled due to missing documents!
    const confirmBtn = screen.getByTestId('claims-ai-confirm-btn') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it('renders Card B (Upload) with distinct Category A (customer uploads) and Category B (forms to sign) with removal buttons', async () => {
    listClaimsAiMessages.mockResolvedValue({
      data: [
        {
          id: 'm-card-b-categories',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'הכנתי קישור להעלאת מסמכים עבור אילנה אטיאס לתיק DAL-2026-0246.',
          created_at: '2026-10-19T10:25:00Z',
          tool_name: 'preview_send_customer_link',
          metadata: {
            pending_action: {
              preview_id: 'P-UPLOAD-CATS',
              summary: 'שליחת קישור להעלאת מסמכים ללקוח "אילנה אטיאס"',
              tool_name: 'preview_send_customer_link',
              action_type: 'send_customer_upload_link',
              status: 'pending',
              parameters: {
                claim_id: 'DAL-2026-0246',
                recipient_name: 'אילנה אטיאס',
                recipient_phone: '050-1234567',
                link_type: 'upload',
                upload_url: 'https://orin1607-ctrl.github.io/future-craft-core/claims-upload?t=tok123',
                wa_link: 'https://wa.me/972501234567?text=hello',
                requested_documents: ['רישיון רכב', 'תמונות נזק'],
                provided_forms: ['ייפוי כוח', 'הצהרת לקוח'],
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
      expect(screen.getByTestId('claims-ai-preview-upload-card')).toBeDefined();
    });

    const uploadCard = screen.getByTestId('claims-ai-preview-upload-card');
    expect(uploadCard.textContent).toContain('מסמכים שהלקוח נדרש להעלות אלינו (2)');
    expect(uploadCard.textContent).toContain('רישיון רכב');
    expect(uploadCard.textContent).toContain('תמונות נזק');

    expect(uploadCard.textContent).toContain('טפסים שאנו מספקים ללקוח למילוי וחתימה (2)');
    expect(uploadCard.textContent).toContain('ייפוי כוח');
    expect(uploadCard.textContent).toContain('הצהרת לקוח');

    // Test removing a document
    const removeDocBtn = uploadCard.querySelector('button[title="הסר את תמונות נזק"]') as HTMLButtonElement;
    expect(removeDocBtn).toBeDefined();
    fireEvent.click(removeDocBtn);

    await waitFor(() => {
      expect(uploadCard.textContent).not.toContain('תמונות נזק');
      expect(uploadCard.textContent).toContain('מסמכים שהלקוח נדרש להעלות אלינו (1)');
    });
  });

  it('renders ClaimsCatalogWidget when catalog is presented in chat', async () => {
    listClaimsAiMessages.mockResolvedValue({
      data: [
        {
          id: 'm-catalog-msg',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'מאגר המסמכים והטפסים של המערכת:\nקטגוריה א: מסמכים להעלאה\nקטגוריה ב: טפסים לחתימה',
          created_at: '2026-10-19T10:30:00Z',
          metadata: {},
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
      expect(screen.getByTestId('claims-catalog-widget')).toBeDefined();
    });

    const widget = screen.getByTestId('claims-catalog-widget');
    expect(widget.textContent).toContain('מאגר מסמכים וטפסים לבחירה מהירה');
    expect(widget.textContent).toContain('רישיון רכב');
    expect(widget.textContent).toContain('ייפוי כוח');
    // Permanent custom upload button is present
    expect(screen.getByTestId('claims-catalog-upload-custom-btn')).toBeDefined();
  });

  it('allows manual upload in ClaimsCatalogWidget and appends to selections', async () => {
    const onPrepareLink = vi.fn();
    const onUploadCustomFile = vi.fn().mockResolvedValue({ success: true, file_id: 'file-xyz' });

    render(
      <ClaimsCatalogWidget
        claimId="DAL-2026-0249"
        onUploadCustomFile={onUploadCustomFile}
        onPrepareLink={onPrepareLink}
      />
    );

    expect(screen.getByTestId('claims-catalog-widget')).toBeDefined();

    // 1. Permanent upload button is present
    const uploadBtn = screen.getByTestId('claims-catalog-upload-custom-btn');
    expect(uploadBtn).toBeDefined();

    // 2. Select standard document first (e.g., רישיון רכב)
    const licenseCheckbox = screen.getByLabelText(/רישיון רכב/);
    await act(async () => {
      fireEvent.click(licenseCheckbox);
    });

    const prepBtn = screen.getByTestId('claims-catalog-prepare-btn');
    expect(prepBtn.textContent).toContain('(1)');

    // 3. Simulate file selection via hidden file input
    const file = new File(['content'], 'custom_waiver.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('input[type="file"][accept*="pdf"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // 4. Inline upload dialog should now be visible
    expect(screen.getByTestId('claims-catalog-upload-dialog')).toBeDefined();
    const nameInput = screen.getByTestId('claims-catalog-custom-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('custom_waiver');

    // Change title
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'טופס ויתור סודיות מותאם' } });
    });

    // Click save
    const saveBtn = screen.getByTestId('claims-catalog-save-custom-btn');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // 5. Verify upload was called with custom title and default category B
    expect(onUploadCustomFile).toHaveBeenCalledWith(file, 'טופס ויתור סודיות מותאם', 'cat_b', true);

    // 6. Verify selection count is now 2 (standard doc + new custom form) without resetting prior selection
    await waitFor(() => {
      expect(prepBtn.textContent).toContain('(2)');
    });

    // 7. Click prepare link button and verify documents and forms are passed
    await act(async () => {
      fireEvent.click(prepBtn);
    });

    expect(onPrepareLink).toHaveBeenCalledWith(
      ['רישיון רכב'],
      ['טופס ויתור סודיות מותאם'],
      24
    );
  });

  it('shows missing form notice for Category B items and preserves selections on retry', async () => {
    let callCount = 0;
    const onPrepareLink = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('שגיאת תקשורת עם שרת דליה (Failed to fetch). נא לבדוק את חיבור האינטרנט ולנסות שוב.');
      }
    });

    render(
      <ClaimsCatalogWidget
        claimId="DAL-2026-0249"
        onPrepareLink={onPrepareLink}
      />
    );

    // 1. Select Cat A (רישיון רכב, רישיון נהיגה) and Cat B (ייפוי כוח)
    const vehLicense = screen.getByLabelText(/רישיון רכב/);
    const drvLicense = screen.getByLabelText(/רישיון נהיגה/);
    const poaForm = screen.getByLabelText(/ייפוי כוח/);

    await act(async () => {
      fireEvent.click(vehLicense);
      fireEvent.click(drvLicense);
      fireEvent.click(poaForm);
    });

    // Verify summary card contains exact names
    const summaryCard = screen.getByTestId('claims-catalog-summary-card');
    expect(summaryCard.textContent).toContain('רישיון רכב, רישיון נהיגה');
    expect(summaryCard.textContent).toContain('ייפוי כוח');

    // 2. Category B form has no attached file -> verify missing form notice appears
    const notice = screen.getByTestId('claims-catalog-missing-forms-notice');
    expect(notice).toBeDefined();
    expect(notice.textContent).toContain('הטופס חסר, נא להעלות אותו (PDF/תמונה): ייפוי כוח');

    const prepBtn = screen.getByTestId('claims-catalog-prepare-btn');
    expect(prepBtn.textContent).toContain('(3)');

    // 3. Click prepare button -> first call fails
    await act(async () => {
      fireEvent.click(prepBtn);
    });

    // 4. Verify error banner appears, but selections remain intact
    const errBanner = screen.getByTestId('claims-catalog-error-banner');
    expect(errBanner.textContent).toContain('שגיאת תקשורת עם שרת דליה (Failed to fetch)');
    expect(errBanner.textContent).toContain('כל המסמכים והטפסים שסימנת נשמרו');

    // Button should now show retry text with the 3 selections still counted
    expect(prepBtn.textContent).toContain('נסה שוב להכין כרטיס אישור (3)');

    // 5. Retry click
    await act(async () => {
      fireEvent.click(prepBtn);
    });

    expect(onPrepareLink).toHaveBeenCalledTimes(2);
    expect(onPrepareLink).toHaveBeenLastCalledWith(
      ['רישיון רכב', 'רישיון נהיגה'],
      ['ייפוי כוח'],
      24
    );
  });

  it('renders package builder notice, expiration picker, summary card, and triggers custom ttl on prepare', async () => {
    const onPrepareLink = vi.fn().mockResolvedValue(undefined);

    render(
      <ClaimsCatalogWidget
        claimId="DAL-2026-0249"
        onPrepareLink={onPrepareLink}
      />
    );

    // 1. Notice that intake questionnaire is always included
    const notice = screen.getByTestId('claims-catalog-intake-notice');
    expect(notice.textContent).toContain('שאלון פתיחת תביעה – תמיד כלול בחבילה');

    // 2. Summary card displays questionnaire included
    const summaryCard = screen.getByTestId('claims-catalog-summary-card');
    expect(summaryCard.textContent).toContain('שאלון פתיחת תיק: כלול ומאושר');
    expect(summaryCard.textContent).toContain('24 שעות (יום אחד)');

    // 3. Select 7 days expiration
    const radio7d = screen.getByLabelText(/שבוע \(7 ימים\)/);
    fireEvent.click(radio7d);
    expect(summaryCard.textContent).toContain('שבוע אחד (7 ימים)');

    // 4. Select a document (רישיון נהיגה)
    const docLabel = screen.getByLabelText(/רישיון נהיגה/);
    fireEvent.click(docLabel);

    // 5. Submit package with 7 days (168 hours)
    const prepBtn = screen.getByTestId('claims-catalog-prepare-btn');
    await act(async () => {
      fireEvent.click(prepBtn);
    });

    expect(onPrepareLink).toHaveBeenCalledWith(
      ['רישיון נהיגה'],
      [],
      168
    );
  });

  it('renders Card A with expiration, category A chips, category B chips, and management action buttons', async () => {
    listClaimsAiConversations.mockResolvedValue({
      data: [{
        id: 'conv-links',
        user_id: 'user-1',
        claim_id: null,
        title: 'חבילת פתיחת תיק',
        created_at: '2026-10-19T10:00:00Z',
        updated_at: '2026-10-19T10:05:00Z',
        archived: false,
      }],
      error: null,
    });
    listClaimsAiMessages.mockResolvedValue({
      data: [
        {
          id: 'msg-package-1',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'הוכנה חבילת פתיחת תיק מלאה ללקוח',
          tool_name: 'preview_send_customer_link',
          metadata: {
            pending_action: {
              preview_id: 'P-PACK-1',
              summary: 'חבילת פתיחת תיק מלאה ללקוח "ישראל ישראלי"',
              tool_name: 'preview_send_customer_link',
              action_type: 'send_customer_intake_link',
              status: 'pending',
              parameters: {
                claim_id: 'DAL-2026-0249',
                recipient_name: 'ישראל ישראלי',
                recipient_phone: '050-7654321',
                channel: 'whatsapp',
                link_type: 'intake',
                intake_url: 'https://orin1607-ctrl.github.io/future-craft-core/claims-intake?t=tok_pack_77',
                wa_link: 'https://wa.me/972507654321?text=pack_text',
                expires_in_hours: 168,
                expires_label: 'שבוע אחד (7 ימים)',
                requested_documents: ['רישיון רכב', 'תמונות נזק'],
                provided_forms: ['ייפוי כוח'],
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
      expect(screen.getByTestId('claims-ai-preview-intake-card')).toBeDefined();
    });

    const card = screen.getByTestId('claims-ai-preview-intake-card');
    expect(card.textContent).toContain('DAL-2026-0249');
    expect(card.textContent).toContain('ישראל ישראלי');
    expect(card.textContent).toContain('שבוע אחד (7 ימים)');
    expect(card.textContent).toContain('רישיון רכב');
    expect(card.textContent).toContain('תמונות נזק');
    expect(card.textContent).toContain('ייפוי כוח');

    // Management buttons
    expect(screen.getByTestId('claims-ai-preview-open-intake-btn')).toBeDefined();
    expect(screen.getByTestId('claims-ai-preview-copy-intake-btn')).toBeDefined();
    expect(screen.getByTestId('claims-ai-preview-wa-intake-btn')).toBeDefined();
    expect(screen.getByTestId('claims-ai-preview-extend-intake-btn')).toBeDefined();
    expect(screen.getByTestId('claims-ai-preview-revoke-intake-btn')).toBeDefined();
  });

  it('renders revoke_customer_link and extend_customer_link preview cards correctly', async () => {
    listClaimsAiConversations.mockResolvedValue({
      data: [{
        id: 'conv-links',
        user_id: 'user-1',
        claim_id: null,
        title: 'ניהול קישורים',
        created_at: '2026-10-19T10:00:00Z',
        updated_at: '2026-10-19T10:05:00Z',
        archived: false,
      }],
      error: null,
    });
    listClaimsAiMessages.mockResolvedValue({
      data: [
        {
          id: 'msg-revoke-1',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'ביטול קישורי לקוח',
          tool_name: 'preview_revoke_customer_link',
          metadata: {
            pending_action: {
              preview_id: 'P-REV-1',
              summary: 'ביטול קישורי הלקוח בתיק DAL-2026-0249',
              tool_name: 'preview_revoke_customer_link',
              action_type: 'revoke_customer_link',
              status: 'pending',
              parameters: {
                claim_id: 'DAL-2026-0249',
                reason: 'לבקשת המשתמש',
              },
            },
          },
        },
        {
          id: 'msg-extend-1',
          conversation_id: 'conv-links',
          role: 'assistant',
          content: 'הארכת תוקף קישורי לקוח',
          tool_name: 'preview_extend_customer_link',
          metadata: {
            pending_action: {
              preview_id: 'P-EXT-1',
              summary: 'הארכת קישורי הלקוח בתיק DAL-2026-0249',
              tool_name: 'preview_extend_customer_link',
              action_type: 'extend_customer_link',
              status: 'pending',
              parameters: {
                claim_id: 'DAL-2026-0249',
                extend_hours: 168,
                extend_label: 'שבוע אחד (7 ימים)',
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
      expect(screen.getByTestId('claims-ai-preview-revoke-link-card')).toBeDefined();
    });

    const revokeCard = screen.getByTestId('claims-ai-preview-revoke-link-card');
    expect(revokeCard.textContent).toContain('ביטול קישורי לקוח בשרת');
    expect(revokeCard.textContent).toContain('DAL-2026-0249');
    expect(revokeCard.textContent).toContain('לבקשת המשתמש');

    const extendCard = screen.getByTestId('claims-ai-preview-extend-link-card');
    expect(extendCard.textContent).toContain('הארכת תוקף קישורי לקוח');
    expect(extendCard.textContent).toContain('DAL-2026-0249');
    expect(extendCard.textContent).toContain('שבוע אחד (7 ימים)');
  });
});


