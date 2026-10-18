import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsAiWorkspace, cleanTextForSpeech } from './ClaimsAiWorkspace';

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
    sessionStorage.clear();
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

    const widget = screen.getByTestId('claims-report-table-widget');
    const scoped = within(widget);

    // Verify headers inside widget
    expect(scoped.getByText('מספר תיק')).toBeDefined();
    expect(scoped.getByText('שם לקוח')).toBeDefined();
    expect(scoped.getByText('חברת ביטוח')).toBeDefined();
    expect(scoped.getByText('התראות פתוחות')).toBeDefined();

    // Verify row contents inside widget
    expect(scoped.getByText('ישראל ישראלי')).toBeDefined();
    expect(scoped.getByText('רחל כהן')).toBeDefined();

    // Verify urgent badge styling presence
    expect(scoped.getByText(/חסר אישור משטרה/)).toBeDefined();

    // Verify clickable claim button
    const claimButtons = scoped.getAllByRole('button', { name: /פתח DAL-2026-0001/i });
    expect(claimButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(claimButtons[0]);
    expect(onOpenClaimMock).toHaveBeenCalledWith('DAL-2026-0001');

    // Verify table search filter inside widget
    const searchInput = scoped.getByPlaceholderText(/חיפוש בטבלה/i);
    fireEvent.change(searchInput, { target: { value: 'רחל' } });

    expect(scoped.queryByText('ישראל ישראלי')).toBeNull();
    expect(scoped.getByText('רחל כהן')).toBeDefined();

    // Verify TSV copy button exists
    const copyTableBtns = screen.getAllByRole('button', { name: /📋 העתק טבלה/i });
    expect(copyTableBtns.length).toBeGreaterThanOrEqual(1);
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

    const copyBtn = screen.getByTestId('claims-ai-copy-m2');
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

  describe('cleanTextForSpeech', () => {
    it('strips markdown syntax, tables, and links into clean spoken Hebrew text', () => {
      const raw = '# כותרת ראשית\n**שלום רב**, להלן [תיק תביעה](claim:DAL-2026-0001):\n| מספר | סטטוס |\n|---|---|\n| 1 | `בטיפול` |\n* פריט ראשון\n- פריט שני';
      const cleaned = cleanTextForSpeech(raw);
      expect(cleaned).not.toContain('#');
      expect(cleaned).not.toContain('**');
      expect(cleaned).not.toContain('|');
      expect(cleaned).not.toContain('`');
      expect(cleaned).toContain('שלום רב, להלן תיק תביעה:');
      expect(cleaned).toContain('בטיפול');
      expect(cleaned).toContain('פריט ראשון');
    });
  });

  describe('Task 1: Stop Text-to-Speech Playback', () => {
    let mockSpeechSynthesis: any;
    let lastUtterance: any;

    beforeEach(() => {
      mockSpeechSynthesis = {
        speak: vi.fn((utter: any) => {
          lastUtterance = utter;
        }),
        cancel: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        paused: false,
        speaking: false,
      };
      Object.defineProperty(window, 'speechSynthesis', {
        value: mockSpeechSynthesis,
        configurable: true,
        writable: true,
      });
      (globalThis as any).SpeechSynthesisUtterance = class {
        text: string;
        lang = '';
        rate = 1.0;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      };
    });

    it('clicking speak triggers speech synthesis and toggles button to stop speaking', async () => {
      listClaimsAiMessages.mockResolvedValue({
        data: [
          { id: 'm1', conversation_id: 'conv-gen', role: 'assistant', content: 'התביעה נבדקה ואושרה', created_at: '2026-10-18T10:00:00Z', tool_name: null, metadata: {} },
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
        expect(screen.getByTestId('claims-ai-speak-m1')).toBeDefined();
      });

      // Click speak
      fireEvent.click(screen.getByTestId('claims-ai-speak-m1'));

      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
      expect(lastUtterance.text).toBe('התביעה נבדקה ואושרה');
      expect(lastUtterance.lang).toBe('he-IL');

      // Button should now be Stop Speaking
      await waitFor(() => {
        expect(screen.getByTestId('claims-ai-stop-speaking-m1')).toBeDefined();
        expect(screen.getAllByText('⏹️ עצור הקראה').length).toBe(2);
      });

      // Also global speaking bar appears
      expect(screen.getByTestId('claims-ai-speaking-bar')).toBeDefined();

      // Click stop speaking
      fireEvent.click(screen.getByTestId('claims-ai-stop-speaking-m1'));
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();

      // Returns to speak button
      await waitFor(() => {
        expect(screen.getByTestId('claims-ai-speak-m1')).toBeDefined();
        expect(screen.queryByTestId('claims-ai-stop-speaking-m1')).toBeNull();
      });
    });

    it('cancels speech synthesis when workspace is closed or speech completes naturally', async () => {
      listClaimsAiMessages.mockResolvedValue({
        data: [
          { id: 'm1', conversation_id: 'conv-gen', role: 'assistant', content: 'בדיקת סיום', created_at: '2026-10-18T10:00:00Z', tool_name: null, metadata: {} },
        ],
        error: null,
      });

      const { rerender } = render(
        <ClaimsAiWorkspace
          open={true}
          onClose={vi.fn()}
          claim={null}
          userId="user-1"
          companyName="מוסך אורן קאר"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('claims-ai-speak-m1')).toBeDefined();
      });

      fireEvent.click(screen.getByTestId('claims-ai-speak-m1'));
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();

      // Simulate natural speech finish
      act(() => {
        lastUtterance.onend();
      });

      await waitFor(() => {
        expect(screen.getByTestId('claims-ai-speak-m1')).toBeDefined();
        expect(screen.queryByTestId('claims-ai-speaking-bar')).toBeNull();
      });

      // Start speaking again and test unmount / close
      fireEvent.click(screen.getByTestId('claims-ai-speak-m1'));
      expect(screen.getByTestId('claims-ai-stop-speaking-m1')).toBeDefined();

      rerender(
        <ClaimsAiWorkspace
          open={false}
          onClose={vi.fn()}
          claim={null}
          userId="user-1"
          companyName="מוסך אורן קאר"
        />
      );

      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });
  });

  describe('Task 2: Composer Input Clearing & Non-blocking Textarea', () => {
    it('immediately clears input upon sending and keeps textarea enabled for typing during generation', async () => {
      listClaimsAiMessages.mockResolvedValue({ data: [], error: null });
      insertClaimsAiMessage.mockImplementation(async (arg: any) => ({
        data: {
          id: `m-${Date.now()}`,
          conversation_id: arg.conversationId || 'conv-gen',
          role: arg.role,
          content: arg.content,
          created_at: new Date().toISOString(),
          metadata: {},
        },
        error: null,
      }));

      (globalThis as any).fetch = vi.fn(() => new Promise(() => {})); // pending fetch

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

      const input = screen.getByTestId('claims-ai-input') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'הודעה ראשונה' } });
      expect(input.value).toBe('הודעה ראשונה');

      fireEvent.submit(input.closest('form')!);

      // Immediately cleared
      expect(input.value).toBe('');

      // Loading is active
      await waitFor(() => {
        expect(screen.getByTestId('claims-ai-loading')).toBeDefined();
      });

      // Textarea remains enabled so user can type the next question freely!
      expect(input.disabled).toBe(false);
      fireEvent.change(input, { target: { value: 'הקלדה בזמן טעינה' } });
      expect(input.value).toBe('הקלדה בזמן טעינה');
    });

    it('restores input text if user message failed saving before entering chat', async () => {
      listClaimsAiMessages.mockResolvedValue({ data: [], error: null });
      insertClaimsAiMessage.mockResolvedValueOnce({
        data: null,
        error: { message: 'Network Failure' },
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

      const input = screen.getByTestId('claims-ai-input') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'טקסט שלא אמור ללכת לאיבוד' } });

      fireEvent.submit(input.closest('form')!);

      await waitFor(() => {
        expect(input.value).toBe('טקסט שלא אמור ללכת לאיבוד');
      });
    });
  });

  describe('Task 3: Continuous Voice Conversation Mode', () => {
    let mockSpeechRec: any = null;
    let mockSpeechSynthesis: any;

    beforeEach(() => {
      class MockSpeechRec {
        lang = '';
        continuous = false;
        interimResults = false;
        onresult: any = null;
        onerror: any = null;
        onend: any = null;
        start = vi.fn();
        stop = vi.fn();
        constructor() {
          mockSpeechRec = this;
        }
      }
      Object.defineProperty(window, 'SpeechRecognition', { value: MockSpeechRec, configurable: true, writable: true });
      mockSpeechSynthesis = {
        speak: vi.fn(),
        cancel: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        paused: false,
        speaking: false,
      };
      Object.defineProperty(window, 'speechSynthesis', {
        value: mockSpeechSynthesis,
        configurable: true,
        writable: true,
      });
    });

    it('toggles continuous voice mode on and off via header button', async () => {
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
        expect(screen.getByTestId('claims-ai-voice-call-toggle')).toBeDefined();
      });

      const toggleBtn = screen.getByTestId('claims-ai-voice-call-toggle');
      expect(toggleBtn.textContent).toContain('התחל שיחה קולית');

      // Activate voice mode
      fireEvent.click(toggleBtn);

      expect(toggleBtn.textContent).toContain('סיים שיחה קולית');
      expect(screen.getByTestId('claims-ai-voice-mode-bar')).toBeDefined();
      expect(mockSpeechRec).not.toBeNull();
      expect(mockSpeechRec.continuous).toBe(true);

      // Deactivate voice mode
      fireEvent.click(toggleBtn);
      expect(toggleBtn.textContent).toContain('התחל שיחה קולית');
      expect(screen.queryByTestId('claims-ai-voice-mode-bar')).toBeNull();
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });

    it('cancels speech immediately when stop speaking button is clicked', async () => {
      listClaimsAiMessages.mockResolvedValue({
        data: [
          { id: 'm1', conversation_id: 'conv-gen', role: 'assistant', content: 'שלום, אני דליה ומקריאה תשובה ארוכה.', created_at: '2026-10-18T10:02:00Z', tool_name: null, metadata: {} },
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
        expect(screen.getByTestId('claims-ai-speak-m1')).toBeDefined();
      });

      // Click speak
      fireEvent.click(screen.getByTestId('claims-ai-speak-m1'));
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();

      // Verify stop button appears
      const stopBtn = screen.getByTestId('claims-ai-stop-speaking-m1');
      expect(stopBtn.textContent).toContain('עצור הקראה');

      // Click stop
      fireEvent.click(stopBtn);
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();

      // Verify button reverts to speak
      await waitFor(() => {
        expect(screen.getByTestId('claims-ai-speak-m1')).toBeDefined();
      });
    });
  });

  describe('Task 5: Docked Claims Report Widget', () => {
    it('docks table report above composer and allows expand, collapse, hide, and restore via pill', async () => {
      const tableMarkdown = [
        '| מספר תיק | שם לקוח | חברת ביטוח | סטטוס |',
        '|---|---|---|---|',
        '| DAL-2026-0010 | דני דין | הפניקס | בטיפול |',
        '| DAL-2026-0011 | שרה סילברמן | מגדל | הושלם |',
      ].join('\n');

      listClaimsAiMessages.mockResolvedValue({
        data: [
          { id: 'm1', conversation_id: 'conv-gen', role: 'assistant', content: tableMarkdown, created_at: '2026-10-18T10:02:00Z', tool_name: null, metadata: {} },
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
        expect(screen.getByTestId('claims-ai-docked-report')).toBeDefined();
      });

      const dockedReport = screen.getByTestId('claims-ai-docked-report');
      expect(dockedReport.className).toContain('normal');
      expect(screen.getByTestId('claims-ai-docked-refresh-btn')).toBeDefined();
      expect(screen.getByTestId('claims-ai-docked-copy-btn')).toBeDefined();

      // Test filter
      const searchInput = screen.getByTestId('claims-ai-docked-search');
      fireEvent.change(searchInput, { target: { value: 'שרה' } });
      const dockedScoped = within(dockedReport);
      expect(dockedScoped.queryByText('דני דין')).toBeNull();
      expect(dockedScoped.getByText('שרה סילברמן')).toBeDefined();

      // Test collapse
      const collapseBtn = screen.getByTestId('claims-ai-docked-collapse-btn');
      fireEvent.click(collapseBtn);
      expect(dockedReport.className).toContain('collapsed');

      // Test expand
      const expandBtn = screen.getByTestId('claims-ai-docked-expand-btn');
      fireEvent.click(expandBtn);
      expect(dockedReport.className).toContain('expanded');

      // Test hide
      const closeBtn = screen.getByTestId('claims-ai-docked-close-btn');
      fireEvent.click(closeBtn);
      expect(screen.queryByTestId('claims-ai-docked-report')).toBeNull();

      // Verify restore pill is shown
      expect(screen.getByTestId('claims-ai-docked-pill-bar')).toBeDefined();
      const showPill = screen.getByTestId('claims-ai-docked-show-btn');
      expect(showPill.textContent).toContain('הצג טבלת דוח (2 תביעות פתוחות)');

      // Restore via pill
      fireEvent.click(showPill);
      expect(screen.getByTestId('claims-ai-docked-report')).toBeDefined();
    });

    it('renders all 19 open claims in docked report without truncation and formats title with open claims count', async () => {
      const openClaimRows = Array.from({ length: 19 }, (_, i) => {
        const id = `DAL-2026-${String(i + 1).padStart(4, '0')}`;
        return `| ${id} | לקוח ${i + 1} | מגדל | בטיפול | טיפול ${i + 1} | 18/10/2026 | נשלח | ממתין | חסר | יוסי | מעקב | 20/10 | אין | [פתח](claim:${id}) |`;
      });

      const reportContent = [
        '### 📊 דוח כללי – כל התביעות הפתוחות במערכת (סה״כ: 19 תביעות פתוחות)',
        '',
        '| מספר תיק | שם לקוח | חברת ביטוח | סטטוס נוכחי | פעולה אחרונה | מועד פעולה | סטטוס אימייל | תשובת מבטחת אחרונה | למה ממתינים | גורם מטפל | פעולה נדרשת | מועד מעקב | התראות פתוחות | פתח תיק |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
        ...openClaimRows,
      ].join('\n');

      listClaimsAiMessages.mockResolvedValue({
        data: [
          { id: 'm-rep', conversation_id: 'conv-gen', role: 'assistant', content: reportContent, created_at: '2026-10-18T10:02:00Z', tool_name: 'get_claims_status_report', metadata: {} },
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
        expect(screen.getByTestId('claims-ai-docked-report')).toBeDefined();
      });

      const docked = screen.getByTestId('claims-ai-docked-report');
      // Assert that header contains total open claims
      expect(docked.textContent).toContain('סה״כ: 19 תביעות פתוחות');
      // Assert all 19 claims are in table
      for (let i = 1; i <= 19; i++) {
        const id = `DAL-2026-${String(i).padStart(4, '0')}`;
        expect(within(docked).getByText(new RegExp(id))).toBeDefined();
      }
    });
  });
});

