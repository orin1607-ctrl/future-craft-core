// Claims welcome screen (stage 3): read-only actions, disabled not-yet-connected actions,
// and a saved conversation still opens as before. Storage and the AI endpoint are FAKES.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsAiWorkspace } from './ClaimsAiWorkspace';
import { claimsWelcomeActions } from './claimsWelcomeActions';
import type { ClaimsAiClaimContext } from './claimsAiModel';

const { invoke, listClaimsAiConversations, listClaimsAiMessages, createClaimsAiConversation, insertClaimsAiMessage } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listClaimsAiConversations: vi.fn(),
  listClaimsAiMessages: vi.fn(),
  createClaimsAiConversation: vi.fn(),
  insertClaimsAiMessage: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 't', expires_at: 9999999999 } } })),
      refreshSession: vi.fn(async () => ({ data: { session: { access_token: 't' } } })),
    },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

vi.mock('./claimsAiStore', () => ({
  listClaimsAiConversations: (...a: unknown[]) => listClaimsAiConversations(...a),
  listClaimsAiMessages: (...a: unknown[]) => listClaimsAiMessages(...a),
  createClaimsAiConversation: (...a: unknown[]) => createClaimsAiConversation(...a),
  archiveClaimsAiConversation: vi.fn(),
  insertClaimsAiMessage: (...a: unknown[]) => insertClaimsAiMessage(...a),
  renameClaimsAiConversation: vi.fn(async () => ({ error: null })),
  claimsAiSchemaMissing: () => false,
}));

const conversation = {
  id: 'conv-test', user_id: 'u', claim_id: null, module: 'claims', garage_case_id: null,
  title: 'בדיקה', created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z', archived: false,
};
const savedAnswer = {
  id: 'msg-test', conversation_id: 'conv-test', user_id: 'u', role: 'assistant',
  content: 'תשובה שמורה מהשיחה הקודמת', metadata: {}, created_at: '2026-10-25T10:00:01Z',
};
const testClaim: ClaimsAiClaimContext = {
  claimId: 'claim-test', claimNum: 'DAL-2099-0001', plate: '00-000-00', vehicle: 'רכב בדיקה',
  clientName: 'לקוח בדיקה', insCompany: 'ביטוח בדיקה', status: 'פתוח',
};

let chatBodies: Array<{ messages: Array<{ role: string; content: string }>; module: string }> = [];

type Utter = { text: string; lang: string; onstart: (() => void) | null; onend: (() => void) | null };
let recognizers: Array<{ start: ReturnType<typeof vi.fn> }> = [];

/** Fake Hebrew speech engine + speech recognition (test only). Returns the spoken utterances. */
function installSpeech(): Utter[] {
  const spoken: Utter[] = [];
  recognizers = [];
  class MockRec {
    lang = '';
    continuous = false;
    interimResults = false;
    onresult = null;
    onerror = null;
    onend = null;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
    constructor() {
      recognizers.push(this);
    }
  }
  Object.defineProperty(window, 'SpeechRecognition', { value: MockRec, configurable: true, writable: true });
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      speak: vi.fn((u: Utter) => spoken.push(u)),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      paused: false,
      speaking: false,
      pending: false,
      getVoices: vi.fn(() => [{ lang: 'he-IL', name: 'Google עברית' }]),
    },
    configurable: true,
    writable: true,
  });
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
    text: string;
    lang = '';
    voice = null;
    rate = 1;
    pitch = 1;
    onstart = null;
    onend = null;
    onerror = null;
    constructor(t: string) {
      this.text = t;
    }
  };
  return spoken;
}

function renderClaims(claim: ClaimsAiClaimContext | null = null) {
  return render(<ClaimsAiWorkspace open onClose={vi.fn()} claim={claim} userId="u" companyName={null} module="claims" />);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  chatBodies = [];
  invoke.mockReset();
  invoke.mockResolvedValue({ data: null, error: { name: 'Offline', context: { status: 404, json: async () => ({}) } } });
  listClaimsAiConversations.mockResolvedValue({ data: [], error: null });
  listClaimsAiMessages.mockResolvedValue({ data: [], error: null });
  createClaimsAiConversation.mockResolvedValue({ data: conversation, error: null });
  insertClaimsAiMessage.mockImplementation(async (row: Record<string, unknown>) => ({
    data: { id: `m-${Math.random()}`, created_at: new Date().toISOString(), metadata: {}, ...row },
    error: null,
  }));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('help-ai-chat') && init?.body) chatBodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ error: 'offline test' }), { status: 503 });
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('claims welcome actions (model)', () => {
  it('has the twelve requested actions with general chat first', () => {
    const actions = claimsWelcomeActions(null);
    expect(actions).toHaveLength(12);
    expect(actions[0]).toMatchObject({ id: 'general', kind: 'chat', primary: true });
    expect(actions.map((a) => a.id)).toEqual([
      'general', 'find', 'continue', 'reports', 'documents', 'emails', 'tasks', 'resume',
      'new_claim', 'status', 'whatsapp', 'close',
    ]);
  });

  it('every action that would change claims data is disabled (pending) and carries no text to send', () => {
    const actions = claimsWelcomeActions(testClaim);
    const pending = actions.filter((a) => a.kind === 'pending').map((a) => a.id);
    expect(pending).toEqual(['new_claim', 'status', 'whatsapp', 'close']);
    for (const a of actions.filter((x) => x.kind === 'pending')) expect(a.text).toBeUndefined();
    for (const a of actions.filter((x) => x.kind === 'ask')) {
      expect(a.text).toBeTruthy();
      // read-only questions: no change verbs
      expect(a.text).not.toMatch(/תמחק|מחק|לארכב|ארכב|תסגר|סגור|תשני|לשנות|תעדכני|עדכן|שלח|תשלחי|פתחי תביעה|תפתחי/);
    }
  });

  it('without an open claim, general chat / find / continue / documents open with a question from Dalia', () => {
    const actions = claimsWelcomeActions(null);
    for (const id of ['general', 'find', 'continue', 'documents']) {
      const a = actions.find((x) => x.id === id)!;
      expect(['chat', 'question']).toContain(a.kind);
      expect(a.question).toMatch(/\?/);
      expect(a.question).not.toMatch(/תמחק|מחק|לארכב|ארכב|תשני|לשנות|תעדכני|שלח/);
    }
  });

  it('with an open claim the questions name that claim', () => {
    const actions = claimsWelcomeActions(testClaim);
    for (const id of ['find', 'continue', 'documents', 'emails', 'tasks']) {
      const a = actions.find((x) => x.id === id)!;
      expect(a.kind).toBe('ask');
      expect(a.text).toContain('DAL-2099-0001');
    }
  });
});

describe('claims welcome screen', () => {
  it('empty chat: shows the hub, general chat first, four main actions and "כל הפעולות"', async () => {
    renderClaims();
    const hub = await screen.findByTestId('claims-welcome-hub');
    const cards = hub.querySelectorAll('.garage-action-card');
    expect(cards).toHaveLength(4);
    expect(cards[0].getAttribute('data-testid')).toBe('claims-hub-general');
    expect(screen.queryByTestId('claims-hub-all')).toBeNull();
    fireEvent.click(screen.getByTestId('claims-hub-all-toggle'));
    expect(screen.getByTestId('claims-hub-all')).toBeDefined();
    for (const id of ['new_claim', 'status', 'whatsapp', 'close']) {
      expect((screen.getByTestId(`claims-hub-${id}`) as HTMLButtonElement).disabled).toBe(true);
    }
    // no saved conversation: "continue last action" is disabled, not pretending
    expect((screen.getByTestId('claims-hub-resume') as HTMLButtonElement).disabled).toBe(true);
    // the garage hub is not used in claims
    expect(screen.queryByTestId('garage-welcome-hub')).toBeNull();
  });

  it('disabled actions send nothing', async () => {
    renderClaims();
    fireEvent.click(await screen.findByTestId('claims-hub-all-toggle'));
    for (const id of ['new_claim', 'status', 'whatsapp', 'close']) fireEvent.click(screen.getByTestId(`claims-hub-${id}`));
    await new Promise((r) => setTimeout(r, 50));
    expect(chatBodies).toHaveLength(0);
    expect(createClaimsAiConversation).not.toHaveBeenCalled();
    expect(insertClaimsAiMessage).not.toHaveBeenCalled();
  });

  it('"שיחה כללית" on an empty chat opens the conversation: the hub gives way and Dalia asks, in Hebrew', async () => {
    const spoken = installSpeech();
    renderClaims();
    fireEvent.click(await screen.findByTestId('claims-hub-general'));
    // reported bug: the hub stayed on screen and nothing happened
    await waitFor(() => expect(screen.queryByTestId('claims-welcome-hub')).toBeNull());
    expect(screen.getByText(/על מה נדבר\?/)).toBeDefined();
    await waitFor(() => expect(spoken.length).toBeGreaterThan(0));
    expect(spoken.at(-1)).toMatchObject({ lang: 'he-IL' });
    expect(spoken.at(-1)!.text).toContain('על מה נדבר');
    // opening the conversation sends nothing and saves nothing
    expect(chatBodies).toHaveLength(0);
    expect(insertClaimsAiMessage).not.toHaveBeenCalled();
  });

  it('"איתור תביעה": Dalia asks, the answer goes to the existing claims chat with her question as context', async () => {
    installSpeech();
    renderClaims();
    fireEvent.click(await screen.findByTestId('claims-hub-find'));
    expect(await screen.findByText(/איזו תביעה לאתר\?/)).toBeDefined();
    expect(screen.queryByTestId('claims-welcome-hub')).toBeNull();
    const input = screen.getByTestId('claims-ai-input') as HTMLTextAreaElement;
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 'DAL-2099-0001' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(chatBodies.length).toBeGreaterThan(0));
    const sent = chatBodies[0].messages;
    expect(chatBodies[0].module).toBe('claims');
    expect(sent.at(-2)).toMatchObject({ role: 'assistant' });
    expect(sent.at(-2)!.content).toContain('איזו תביעה לאתר');
    expect(sent.at(-1)).toMatchObject({ role: 'user', content: 'DAL-2099-0001' });
    // Dalia's question stays on screen after the conversation is created
    expect(screen.getByText(/איזו תביעה לאתר\?/)).toBeDefined();
  });

  it('hands-free mode: after Dalia finishes her question the mic opens for the answer', async () => {
    const spoken = installSpeech();
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true, writable: true });
    renderClaims();
    fireEvent.click(await screen.findByTestId('claims-ai-voice-call-toggle'));
    await waitFor(() => expect(recognizers.length).toBeGreaterThan(0));
    const startsBefore = recognizers.reduce((n, r) => n + r.start.mock.calls.length, 0);
    fireEvent.click(screen.getByTestId('claims-hub-continue'));
    await waitFor(() => expect(spoken.some((u) => u.text.includes('באיזו תביעה נמשיך'))).toBe(true));
    const utter = spoken.find((u) => u.text.includes('באיזו תביעה נמשיך'))!;
    act(() => utter.onstart?.());
    await new Promise((r) => setTimeout(r, 700));
    act(() => utter.onend?.());
    await waitFor(() => expect(recognizers.reduce((n, r) => n + r.start.mock.calls.length, 0)).toBeGreaterThan(startsBefore), { timeout: 3000 });
  });

  it('"דוחות תביעות" asks the existing claims chat (module claims) and the conversation replaces the hub', async () => {
    renderClaims();
    fireEvent.click(await screen.findByTestId('claims-hub-reports'));
    await waitFor(() => expect(chatBodies.length).toBeGreaterThan(0));
    const body = chatBodies[0];
    expect(body.module).toBe('claims');
    expect(body.messages.at(-1)).toMatchObject({ role: 'user', content: 'דוח על כל התביעות הפתוחות' });
    await waitFor(() => expect(screen.queryByTestId('claims-welcome-hub')).toBeNull());
  });

  it('a saved conversation opens as before; the main menu shows the hub, and "continue" brings it back', async () => {
    listClaimsAiConversations.mockResolvedValue({ data: [conversation], error: null });
    listClaimsAiMessages.mockResolvedValue({ data: [savedAnswer], error: null });
    renderClaims();
    expect(await screen.findByText('תשובה שמורה מהשיחה הקודמת')).toBeDefined();
    expect(screen.queryByTestId('claims-welcome-hub')).toBeNull();

    fireEvent.click(screen.getByTestId('dalia-main-menu-btn'));
    expect(await screen.findByTestId('claims-welcome-hub')).toBeDefined();
    expect(screen.getByTestId('claims-hub-resume-banner').textContent).toContain('1 הודעות');
    expect(screen.queryByText('תשובה שמורה מהשיחה הקודמת')).toBeNull();

    fireEvent.click(screen.getByTestId('claims-hub-resume-chat'));
    expect(await screen.findByText('תשובה שמורה מהשיחה הקודמת')).toBeDefined();
    expect(screen.queryByTestId('claims-welcome-hub')).toBeNull();
  });

  it('open claim: the hub names the claim and its questions go to that claim', async () => {
    renderClaims(testClaim);
    const hub = await screen.findByTestId('claims-welcome-hub');
    expect(hub.textContent).toContain('DAL-2099-0001');
    fireEvent.click(screen.getByTestId('claims-hub-continue'));
    await waitFor(() => expect(chatBodies.length).toBeGreaterThan(0));
    expect(chatBodies[0].messages.at(-1)?.content).toBe('מה השלב הבא בטיפול בתביעה DAL-2099-0001?');
  });
});
