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

describe('Claims AI Enhancements (Tasks 1-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listClaimsAiConversations.mockResolvedValue({
      data: [{
        id: 'conv-gen',
        user_id: 'user-1',
        claim_id: null,
        title: 'דוח כללי על כל התיקים',
        created_at: '2026-10-18T10:00:00Z',
        updated_at: '2026-10-18T10:05:00Z',
        archived: false,
      }],
      error: null,
    });
  });

  it('renders markdown table as structured ClaimsReportTable with clickable claim links and copy TSV button', async () => {
    const tableMarkdown = [
      'להלן דוח מצב כללי על כל התביעות:',
      '',
      '| מספר תיק | שם לקוח | חברת ביטוח | סטטוס נוכחי | פעולה אחרונה | מועד פעולה | סטטוס אימייל | תשובת מבטחת אחרונה | למה ממתינים | גורם מטפל | פעולה נדרשת | מועד מעקב | התראות פתוחות | פתח תיק |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
      '| DAL-2026-0001 | ישראל ישראלי | מגדל | בטיפול | נשלחה הודעה | 18/10/2026 | נשלח ב-18/10 | ממתין למענה | מענה מגדל | יוסי | תזכורת | 20/10/2026 | 🔴 [דחוף] חסר אישור משטרה | [פתח תיק](claim:DAL-2026-0001) |',
      '| DAL-2026-0002 | רחל כהן | הראל | הושלם | נסגר התיק | 17/10/2026 | לא נדרש | אושר תשלום | סגירה | שרה | סגירה | - | אין התראות | [פתח תיק](claim:DAL-2026-0002) |',
      '',
      'סיכום כללי: סה"כ 2 תיקים במערכת.',
    ].join('\n');

    listClaimsAiMessages.mockResolvedValue({
      data: [
        { id: 'm1', conversation_id: 'conv-gen', role: 'user', content: 'תוציא לי דוח כללי על כל התיקים', created_at: '2026-10-18T10:01:00Z', tool_name: null, metadata: {} },
        { id: 'm2', conversation_id: 'conv-gen', role: 'assistant', content: tableMarkdown, created_at: '2026-10-18T10:02:00Z', tool_name: 'get_claims_status_report', metadata: {} },
      ],
      error: null,
    });

    const onOpenClaimMock = vi.fn();

    render(
      <ClaimsAiWorkspace
        open={true}
        onClose={vi.fn()}
        claim={null}
        userId="user-1"
        companyName="מוסך אורן קאר"
        onOpenClaim={onOpenClaimMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('claims-report-table-widget')).toBeDefined();
    });

    // Verify headers
    expect(screen.getByText('מספר תיק')).toBeDefined();
    expect(screen.getByText('שם לקוח')).toBeDefined();
    expect(screen.getByText('חברת ביטוח')).toBeDefined();
    expect(screen.getByText('התראות פתוחות')).toBeDefined();

    // Verify row contents
    expect(screen.getByText('ישראל ישראלי')).toBeDefined();
    expect(screen.getByText('רחל כהן')).toBeDefined();

    // Verify urgent badge styling presence
    expect(screen.getByText(/חסר אישור משטרה/)).toBeDefined();

    // Verify clickable claim button
    const claimButtons = screen.getAllByRole('button', { name: /פתח DAL-2026-0001/i });
    expect(claimButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(claimButtons[0]);
    expect(onOpenClaimMock).toHaveBeenCalledWith('DAL-2026-0001');

    // Verify table search filter
    const searchInput = screen.getByPlaceholderText(/חיפוש בטבלה/i);
    fireEvent.change(searchInput, { target: { value: 'רחל' } });

    expect(screen.queryByText('ישראל ישראלי')).toBeNull();
    expect(screen.getByText('רחל כהן')).toBeDefined();

    // Verify TSV copy button exists
    const copyTableBtn = screen.getByRole('button', { name: /📋 העתק טבלה/i });
    expect(copyTableBtn).toBeDefined();
  });

  it('renders copy button on assistant messages and toggles copied state', async () => {
    listClaimsAiMessages.mockResolvedValue({
      data: [
        { id: 'm1', conversation_id: 'conv-gen', role: 'user', content: 'מה המצב?', created_at: '2026-10-18T10:01:00Z', tool_name: null, metadata: {} },
        { id: 'm2', conversation_id: 'conv-gen', role: 'assistant', content: 'יש 5 תביעות פתוחות במערכת.', created_at: '2026-10-18T10:02:00Z', tool_name: null, metadata: {} },
      ],
      error: null,
    });

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => {}),
      },
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
      expect(screen.getByText('יש 5 תביעות פתוחות במערכת.')).toBeDefined();
    });

    const copyBtn = screen.getByRole('button', { name: /📋 העתק/i });
    expect(copyBtn).toBeDefined();

    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('יש 5 תביעות פתוחות במערכת.');

    await waitFor(() => {
      expect(screen.getByText('✓ הועתק!')).toBeDefined();
    });
  });

  it('provides continuous speech recognition setup and does not auto-send on silence', async () => {
    listClaimsAiMessages.mockResolvedValue({ data: [], error: null });

    let recognitionInstance: any = null;
    class MockSpeechRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: any = null;
      onerror: any = null;
      onend: any = null;
      start = vi.fn();
      stop = vi.fn();

      constructor() {
        recognitionInstance = this;
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', { value: MockSpeechRecognition, configurable: true, writable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true, writable: true });

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
      const btn = screen.getByTestId('claims-ai-mic') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    const micBtn = screen.getByTestId('claims-ai-mic');
    fireEvent.click(micBtn);

    expect(recognitionInstance).not.toBeNull();
    // Continuous must be true!
    expect(recognitionInstance.continuous).toBe(true);
    expect(recognitionInstance.start).toHaveBeenCalled();

    // Simulate speech input
    act(() => {
      recognitionInstance.onresult({
        resultIndex: 0,
        results: [
          { isFinal: true, 0: { transcript: 'בדיקת הכתבה קולית רציפה' } },
        ],
      });
    });

    const textarea = screen.getByTestId('claims-ai-input') as HTMLTextAreaElement;
    expect(textarea.value).toBe('בדיקת הכתבה קולית רציפה');

    // Simulate browser onend without manual stop (e.g. pause in speech)
    // It should restart rather than auto-send!
    act(() => {
      recognitionInstance.onend();
    });
    expect(recognitionInstance.start).toHaveBeenCalledTimes(2);

    // Verify that NO message was auto-sent
    expect(insertClaimsAiMessage).not.toHaveBeenCalled();

    // Now click mic again to manually stop
    fireEvent.click(micBtn);
    expect(recognitionInstance.stop).toHaveBeenCalled();
    // Text remains in textarea for user to review and edit
    expect(textarea.value).toBe('בדיקת הכתבה קולית רציפה');
  });

  it('displays stop button while AI is loading and clicking it stops the response generation', async () => {
    listClaimsAiMessages.mockResolvedValue({ data: [], error: null });
    insertClaimsAiMessage.mockResolvedValue({
      data: {
        id: 'msg-user-1',
        conversation_id: 'conv-gen',
        role: 'user',
        content: 'שאלה שדורשת זמן',
        created_at: new Date().toISOString(),
        metadata: {},
      },
      error: null,
    });

    let abortSignalObserved: AbortSignal | null = null;
    (globalThis as any).fetch = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.signal) {
        abortSignalObserved = init.signal;
      }
      // Never resolves immediately to simulate loading
      return new Promise(() => {});
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
      expect(screen.getByTestId('claims-ai-input')).toBeDefined();
    });

    const input = screen.getByTestId('claims-ai-input');
    const sendBtn = screen.getByTestId('claims-ai-send');

    fireEvent.change(input, { target: { value: 'שאלה שדורשת זמן' } });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByTestId('claims-ai-loading')).toBeDefined();
    });

    const stopBtn = screen.getByRole('button', { name: /⏹️ עצור/i });
    expect(stopBtn).toBeDefined();

    // Click stop button
    fireEvent.click(stopBtn);

    // Verify abort signal was triggered
    expect(abortSignalObserved?.aborted).toBe(true);

    // Verify loading bar disappears
    await waitFor(() => {
      expect(screen.queryByTestId('claims-ai-loading')).toBeNull();
    });
  });

  it('displays friendly message when server returns 504 Gateway Timeout', async () => {
    insertClaimsAiMessage.mockImplementation(async (arg: any) => ({
      data: {
        id: `m-${Math.random()}`,
        conversation_id: arg.conversationId,
        role: arg.role,
        content: arg.content,
        created_at: new Date().toISOString(),
        tool_name: null,
        metadata: arg.metadata || {},
      },
      error: null,
    }));

    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      status: 504,
      headers: new Headers(),
      json: async () => { throw new Error('Not JSON'); },
    }));

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
      expect(screen.getByTestId('claims-ai-input')).toBeDefined();
    });

    const input = screen.getByTestId('claims-ai-input');
    const sendBtn = screen.getByTestId('claims-ai-send');

    fireEvent.change(input, { target: { value: 'דוח תביעות' } });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/שגיאת עומס 504\/503/i)).toBeDefined();
    });
  });
});
