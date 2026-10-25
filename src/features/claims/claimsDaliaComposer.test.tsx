// Claims window gets Dalia's large composer (stage 2 of the claims AI upgrade).
// Speech engines and storage are FAKES; nothing here reaches Supabase or real claims.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsAiWorkspace } from './ClaimsAiWorkspace';

const { invoke, listClaimsAiConversations, listClaimsAiMessages } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listClaimsAiConversations: vi.fn(),
  listClaimsAiMessages: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 't' } } })) },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

vi.mock('./claimsAiStore', () => ({
  listClaimsAiConversations: (...a: unknown[]) => listClaimsAiConversations(...a),
  listClaimsAiMessages: (...a: unknown[]) => listClaimsAiMessages(...a),
  createClaimsAiConversation: vi.fn(),
  archiveClaimsAiConversation: vi.fn(),
  insertClaimsAiMessage: vi.fn(async () => ({ data: null, error: null })),
  renameClaimsAiConversation: vi.fn(),
  claimsAiSchemaMissing: () => false,
}));

type Utter = { text: string; lang: string; onstart: (() => void) | null; onend: (() => void) | null };
let utterances: Utter[] = [];
let recognizers: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];

function installSpeech() {
  utterances = [];
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
      speak: vi.fn((u: Utter) => utterances.push(u)),
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
}

const conversation = {
  id: 'conv-test', user_id: 'u', claim_id: null, module: 'claims', garage_case_id: null,
  title: 'בדיקה', created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z', archived: false,
};
const answer = {
  id: 'msg-test', conversation_id: 'conv-test', user_id: 'u', role: 'assistant',
  content: 'יש 3 תביעות פתוחות לבדיקה.', metadata: {}, created_at: '2026-10-25T10:00:01Z',
};

function renderModule(module: 'claims' | 'reports' | 'dashboard') {
  return render(<ClaimsAiWorkspace open onClose={vi.fn()} claim={null} userId="u" companyName={null} module={module} />);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  installSpeech();
  invoke.mockReset();
  invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context: { status: 503, json: async () => ({ error: 'not_configured' }) } } });
  listClaimsAiConversations.mockResolvedValue({ data: [], error: null });
  listClaimsAiMessages.mockResolvedValue({ data: [], error: null });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => null })));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('claims Dalia composer', () => {
  it('claims window uses the large composer but keeps its own window look', async () => {
    renderModule('claims');
    const root = await screen.findByTestId('claims-ai-workspace');
    expect(root.className).toContain('dalia-claims-window');
    expect(root.className).not.toContain('dalia-garage-window');
    expect(screen.queryByTestId('claims-ai-maximize-btn')).toBeNull();
    const form = screen.getByTestId('claims-ai-input').closest('form')!;
    expect(form.className).toContain('dalia-composer');
    expect(screen.getByTestId('claims-ai-mic')).toBeDefined();
    expect(screen.getByTestId('claims-ai-auto-speak-toggle')).toBeDefined();
  });

  it('expand button enlarges and shrinks the writing area', async () => {
    renderModule('claims');
    const expand = await screen.findByTestId('claims-ai-expand-input');
    const form = screen.getByTestId('claims-ai-input').closest('form')!;
    expect(form.className).not.toContain('is-expanded');
    fireEvent.click(expand);
    expect(form.className).toContain('is-expanded');
    expect(expand.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(expand);
    expect(form.className).not.toContain('is-expanded');
  });

  it('attach menu offers camera, gallery and PDF; the garage-only license button is absent', async () => {
    renderModule('claims');
    const toggle = (await screen.findAllByTestId('claims-ai-attach-btn'))[0];
    expect(toggle.textContent).toContain('📎');
    fireEvent.click(toggle);
    expect(screen.getByTestId('claims-ai-attach-popover')).toBeDefined();
    expect(screen.getByTestId('claims-ai-camera-btn')).toBeDefined();
    expect(screen.getByTestId('claims-ai-gallery-btn')).toBeDefined();
    expect(screen.getAllByTestId('claims-ai-attach-btn')).toHaveLength(2); // toggle + "צרף מסמך / PDF"
    expect(screen.queryByTestId('claims-ai-license-btn')).toBeNull();
    expect((screen.getByTestId('claims-ai-file-input') as HTMLInputElement).accept).toContain('application/pdf');
  });

  it('reading an answer aloud uses the Hebrew voice and shows a stop button that stops it', async () => {
    listClaimsAiConversations.mockResolvedValue({ data: [conversation], error: null });
    listClaimsAiMessages.mockResolvedValue({ data: [answer], error: null });
    renderModule('claims');
    fireEvent.click(await screen.findByTestId('claims-ai-speak-msg-test'));
    await waitFor(() => expect(utterances.length).toBeGreaterThan(0));
    expect(utterances.at(-1)!.lang).toBe('he-IL');
    act(() => utterances.at(-1)!.onstart?.());
    const stop = await screen.findByTestId('claims-ai-composer-stop-speech');
    fireEvent.click(stop);
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('claims-ai-composer-stop-speech')).toBeNull());
  });

  it('dictation stops when Dalia starts reading, so she never records herself', async () => {
    listClaimsAiConversations.mockResolvedValue({ data: [conversation], error: null });
    listClaimsAiMessages.mockResolvedValue({ data: [answer], error: null });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true, writable: true });
    renderModule('claims');
    const mic = await screen.findByTestId('claims-ai-mic');
    await waitFor(() => expect((mic as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(mic);
    await waitFor(() => expect(mic.getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(await screen.findByTestId('claims-ai-speak-msg-test'));
    await waitFor(() => expect(mic.getAttribute('aria-pressed')).toBe('false'));
  });

  it('reports and dashboard windows keep their previous composer', async () => {
    const { unmount } = renderModule('reports');
    let root = await screen.findByTestId('claims-ai-workspace');
    expect(root.className).not.toContain('dalia-claims-window');
    expect(screen.getByTestId('claims-ai-input').closest('form')!.className).not.toContain('dalia-composer');
    expect(screen.queryByTestId('claims-ai-expand-input')).toBeNull();
    unmount();
    renderModule('dashboard');
    root = await screen.findByTestId('claims-ai-workspace');
    expect(root.className).not.toContain('dalia-claims-window');
    expect(screen.queryByTestId('claims-ai-expand-input')).toBeNull();
  });
});
