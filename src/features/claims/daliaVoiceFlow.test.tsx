// Integration tests: garage workflow buttons → speech controller → mic gating.
// Speech engines are FAKES here. These tests prove the order "speak → wait for real end → open mic",
// not that a physical phone plays Hebrew audio (that is checked by hand on the device).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsAiWorkspace } from './ClaimsAiWorkspace';

const { invoke, listClaimsAiMessages } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listClaimsAiMessages: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 't' } } })) },
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
  },
}));

vi.mock('./claimsAiStore', () => ({
  listClaimsAiConversations: vi.fn(async () => ({ data: [], error: null })),
  listClaimsAiMessages: (...a: unknown[]) => listClaimsAiMessages(...a),
  createClaimsAiConversation: vi.fn(),
  archiveClaimsAiConversation: vi.fn(),
  insertClaimsAiMessage: vi.fn(async () => ({ data: null, error: null })),
  renameClaimsAiConversation: vi.fn(),
  claimsAiSchemaMissing: () => false,
}));

type Utter = {
  text: string;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

let utterances: Utter[] = [];
let recognizers: Array<{ start: ReturnType<typeof vi.fn>; lang: string }> = [];

function installSpeech(voices: Array<{ lang: string; name: string }>) {
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
      getVoices: vi.fn(() => voices),
    },
    configurable: true,
    writable: true,
  });
  (globalThis as any).SpeechSynthesisUtterance = class {
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

function renderGarage() {
  return render(
    <ClaimsAiWorkspace open onClose={vi.fn()} claim={null} userId="user-1" companyName="מוסך" module="garage" />,
  );
}

const notConfigured = { data: null, error: { name: 'FunctionsHttpError', context: { status: 503, json: async () => ({ error: 'not_configured' }) } } };

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  invoke.mockReset();
  invoke.mockResolvedValue(notConfigured);
  listClaimsAiMessages.mockResolvedValue({ data: [], error: null });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => null })));
  // jsdom has no media playback; the audio-unlock tap just needs a resolved promise.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('garage voice workflows — mic only after the question was really spoken', () => {
  it('device Hebrew voice: mic opens only after onend (completed)', async () => {
    installSpeech([{ lang: 'he-IL', name: 'Google עברית' }]);
    renderGarage();
    fireEvent.click(await screen.findByTestId('garage-action-new-customer'));

    await waitFor(() => expect(utterances).toHaveLength(1));
    expect(utterances[0].text).toContain('מה שם הלקוח');
    expect(utterances[0].lang).toBe('he-IL');
    act(() => utterances[0].onstart?.());
    await new Promise((r) => setTimeout(r, 450));
    expect(recognizers).toHaveLength(0); // still speaking → mic closed

    act(() => utterances[0].onend?.());
    await waitFor(() => expect(recognizers).toHaveLength(1), { timeout: 1500 });
    expect(recognizers[0].start).toHaveBeenCalled();
    expect(recognizers[0].lang).toBe('he-IL');
  });

  it('speech error: mic is NOT opened, replay and answer buttons appear', async () => {
    installSpeech([{ lang: 'he-IL', name: 'Google עברית' }]);
    renderGarage();
    fireEvent.click(await screen.findByTestId('garage-action-intake'));
    await waitFor(() => expect(utterances).toHaveLength(1));
    act(() => utterances[0].onerror?.({ error: 'synthesis-failed' }));

    expect(await screen.findByTestId('claims-ai-voice-replay-btn')).toBeDefined();
    await new Promise((r) => setTimeout(r, 450));
    expect(recognizers).toHaveLength(0);
    expect(screen.getByTestId('claims-ai-error').textContent).toContain('לא הצליחה להשמיע');

    fireEvent.click(screen.getByTestId('claims-ai-voice-answer-btn'));
    expect(recognizers).toHaveLength(1);
  });

  it('no Hebrew voice and TTS not configured: nothing is read by an English voice, mic stays closed', async () => {
    installSpeech([{ lang: 'en-US', name: 'Google US English' }]);
    renderGarage();
    fireEvent.click(await screen.findByTestId('garage-action-new-customer'));

    expect(await screen.findByTestId('claims-ai-voice-replay-btn', {}, { timeout: 2500 })).toBeDefined();
    expect((window.speechSynthesis.speak as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('dalia-tts', { body: { text: expect.stringContaining('מה שם הלקוח') } });
    expect(recognizers).toHaveLength(0);
  });

  it('fast switching between two buttons: the stale end of the first never opens the mic over the second', async () => {
    installSpeech([{ lang: 'he-IL', name: 'Google עברית' }]);
    renderGarage();
    fireEvent.click(await screen.findByTestId('garage-action-new-customer'));
    await waitFor(() => expect(utterances).toHaveLength(1));
    const first = { ...utterances[0] };
    act(() => utterances[0].onstart?.());

    // The hub is hidden once a workflow starts; trigger a second utterance from the voice bar.
    fireEvent.click(screen.getByTestId('claims-ai-voice-quick-test-btn'));
    await waitFor(() => expect(utterances).toHaveLength(2), { timeout: 2500 });
    // Late events of the first utterance arrive after it was superseded.
    act(() => {
      first.onerror?.({ error: 'interrupted' });
      first.onend?.();
    });
    await new Promise((r) => setTimeout(r, 500));
    expect(recognizers).toHaveLength(0);
  });
});
