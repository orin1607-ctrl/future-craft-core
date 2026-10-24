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
let recognizers: Array<{ start: ReturnType<typeof vi.fn>; lang: string; onresult: ((ev: unknown) => void) | null }> = [];

/** Minimal fake garage (test data only) — records what the voice workflow writes. */
function fakeGarage() {
  const customer = { id: 'c-new', customer_number: 501, customer_type: 'private', name: 'יוסי מזרחי', company_name: '', phone: '052-5551234' };
  const vehicleRow = { id: 'v-new', customer_id: 'c-new', plate: '1234599', make: 'טויוטה', model: 'קורולה' };
  return {
    actorName: '',
    searchCustomers: vi.fn(async () => []),
    getCustomer: vi.fn(async (id: string) => (id === 'c-new' ? customer : null)),
    listVehicles: vi.fn(async () => []),
    findVehicleByPlate: vi.fn(async () => null),
    listCustomerCases: vi.fn(async () => []),
    listCases: vi.fn(async () => []),
    getCase: vi.fn(async () => null),
    createCustomer: vi.fn(async () => ({ customer, duplicates: [] })),
    createVehicle: vi.fn(async () => vehicleRow),
    createCase: vi.fn(async () => ({ id: 'case-new', case_number: 'GM-T-1', case_data: {} })),
    saveCaseData: vi.fn(),
    closeCase: vi.fn(),
    listSuppliers: vi.fn(async () => []),
    createSupplier: vi.fn(),
    listInvoices: vi.fn(async () => []),
    createInvoice: vi.fn(),
  };
}
let garage = fakeGarage();
let openCase = vi.fn();

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
    <ClaimsAiWorkspace
      open
      onClose={vi.fn()}
      claim={null}
      userId="user-1"
      companyName="מוסך"
      module="garage"
      garageVoiceActions={garage as never}
      onOpenGarageCase={openCase}
    />,
  );
}

const notConfigured = { data: null, error: { name: 'FunctionsHttpError', context: { status: 503, json: async () => ({ error: 'not_configured' }) } } };

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  garage = fakeGarage();
  openCase = vi.fn();
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

  it('voice-test button plays the committed Hebrew test clip (no Google key, no device voice)', async () => {
    installSpeech([{ lang: 'en-US', name: 'Google US English' }]);
    const manifest = JSON.parse(
      (await import('node:fs')).readFileSync(`${process.cwd()}/public/dalia-voice/manifest.json`, 'utf8'),
    );
    const fetchMock = vi.fn(async (url: string) =>
      String(url).endsWith('dalia-voice/manifest.json')
        ? { ok: true, status: 200, json: async () => manifest }
        : { ok: false, status: 404, json: async () => null },
    );
    vi.stubGlobal('fetch', fetchMock);
    const playSpy = HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>;
    renderGarage();
    fireEvent.click(await screen.findByTestId('dalia-test-voice-btn'));

    await waitFor(() => {
      const srcs = playSpy.mock.contexts.map((el) => (el as HTMLMediaElement).src);
      expect(srcs.some((s) => s.endsWith('/dalia-voice/clips/686bc0e4.wav'))).toBe(true);
    }, { timeout: 2500 });
    expect(invoke).not.toHaveBeenCalled();
    expect(window.speechSynthesis.speak as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
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

  it('spoken answer goes into the workflow and Dalia asks the next question', async () => {
    installSpeech([{ lang: 'he-IL', name: 'Google עברית' }]);
    renderGarage();
    fireEvent.click(await screen.findByTestId('garage-action-new-customer'));
    await waitFor(() => expect(utterances).toHaveLength(1));
    act(() => {
      utterances[0].onstart?.();
      utterances[0].onend?.();
    });
    await waitFor(() => expect(recognizers).toHaveLength(1), { timeout: 1500 });
    // the worker answers by voice
    act(() => {
      recognizers[0].onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'קוראים לו יוסי מזרחי' }], { isFinal: true })] });
    });
    // silence detection (1.3s) → workflow → next fixed question
    await waitFor(() => expect(utterances.map((u) => u.text)).toContain('מה מספר הטלפון שלו?'), { timeout: 3500 });
    expect(screen.getAllByText('קוראים לו יוסי מזרחי').length).toBeGreaterThan(0);
  });

  it('full typed conversation → confirmation → saved through the garage actions → case opened', async () => {
    installSpeech([{ lang: 'he-IL', name: 'Google עברית' }]);
    renderGarage();
    fireEvent.click(await screen.findByTestId('garage-action-new-customer'));
    await waitFor(() => expect(utterances).toHaveLength(1));
    const input = screen.getByTestId('claims-ai-input') as HTMLTextAreaElement;
    const say = async (text: string, expectNext: string) => {
      fireEvent.change(input, { target: { value: text } });
      fireEvent.submit(input.closest('form')!);
      await waitFor(() => expect(utterances[utterances.length - 1].text).toBe(expectNext), { timeout: 2000 });
    };
    await say('יוסי מזרחי', 'מה מספר הטלפון שלו?');
    await say('0525551234', 'האם מדובר בלקוח פרטי או עסקי?');
    await say('פרטי', 'סיכמתי את פרטי הלקוח על המסך. האם לאשר את פתיחת הלקוח?');
    expect(garage.createCustomer).not.toHaveBeenCalled();
    await say('כן', 'הלקוח נפתח. תרצה לשייך לו רכב? אפשר לשלוח צילום של רישיון הרכב ואנסה למלא את הפרטים, או להגיד לי את הפרטים בדיבור. מה אתה מעדיף?');
    expect(garage.createCustomer).toHaveBeenCalledWith({ customer_type: 'private', name: 'יוסי מזרחי', company_name: '', phone: '052-5551234', business_id: '' }, { force: false });
    await say('בדיבור', 'מה מספר הרישוי של הרכב?');
    await say('1234599', 'מה היצרן והדגם של הרכב?');
    await say('טויוטה קורולה', 'באיזו שנה יוצר הרכב? אפשר לומר "לא ידוע".');
    await say('לא ידוע', 'פרטי הרכב מוצגים על המסך. האם לשמור את הרכב ללקוח?');
    await say('כן', 'הרכב נשמר. תרצה לפתוח לו עבודה חדשה?');
    expect(garage.createVehicle).toHaveBeenCalledWith({ customer_id: 'c-new', plate: '1234599', make: 'טויוטה', model: 'קורולה', year: null, color: '', vin: '' });
    await say('כן', 'מה הבעיה או התקלה ברכב?');
    await say('החלפת שמן', 'האם הרכב הגיע עכשיו למוסך?');
    await say('לא', 'סיכמתי את הפרטים על המסך. האם לאשר ולשמור?');
    expect(garage.createCase).not.toHaveBeenCalled();
    await say('כן', 'תיק העבודה נפתח. פותחת את התיק.');
    expect(garage.createCase).toHaveBeenCalledTimes(1);
    // the case opens only after the result sentence finished playing
    expect(openCase).not.toHaveBeenCalled();
    const last = utterances[utterances.length - 1];
    act(() => {
      last.onstart?.();
      last.onend?.();
    });
    await waitFor(() => expect(openCase).toHaveBeenCalledWith('case-new'));
  });

  it('personal greeting with the signed-in worker name; the fixed sentence is played when the personal one cannot be', async () => {
    installSpeech([{ lang: 'he-IL', name: 'Google עברית' }]);
    garage.actorName = 'מאיר כהן';
    renderGarage();
    expect((await screen.findByTestId('garage-welcome-title')).textContent).toContain('שלום מאיר');
    fireEvent.click(screen.getByTestId('garage-action-new-customer'));
    await waitFor(() => expect(utterances).toHaveLength(1));
    expect(utterances[0].text).toBe('מאיר, איזה לקוח תרצה לפתוח? מה שם הלקוח או החברה?');
    // the device voice fails on the personal sentence → the fixed sentence (pre-recorded) is tried next
    act(() => utterances[0].onerror?.({ error: 'synthesis-failed' }));
    await waitFor(() => expect(utterances.map((u) => u.text)).toContain('איזה לקוח תרצה לפתוח? מה שם הלקוח או החברה?'), { timeout: 2500 });
  });

  it('answer buttons under the latest turn answer Dalia; a list opens in the drawer and closes back to the chat', async () => {
    installSpeech([{ lang: 'he-IL', name: 'Google עברית' }]);
    const rows = Array.from({ length: 30 }, (_, i) => ({
      id: `k${i}`, case_number: `GM-2026-${String(i + 1).padStart(4, '0')}`, customer_id: 'c', vehicle_id: 'v', status: '',
      customer_name_snapshot: `לקוח ${i}`, vehicle_plate_snapshot: `12345${String(i).padStart(2, '0')}`, vehicle_label_snapshot: '', case_data: {},
      opened_by: '', opened_by_name: '', created_at: '2026-10-20T08:00:00Z',
    }));
    (garage as unknown as { listAllCases: () => Promise<unknown[]> }).listAllCases = vi.fn(async () => rows);
    renderGarage();
    fireEvent.click(await screen.findByTestId('garage-action-find-case'));
    await waitFor(() => expect(screen.getAllByTestId('dalia-choice').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('dalia-choice')[0]); // "כל התיקים הפתוחים"
    const open = await screen.findByTestId('dalia-open-list');
    expect(open.textContent).toContain('30');
    fireEvent.click(open);
    const drawer = await screen.findByTestId('dalia-drawer');
    expect(drawer.querySelectorAll('.dalia-drawer-row').length).toBe(30);
    // the composer stays available while the list is open
    expect(screen.getByTestId('claims-ai-input')).toBeDefined();
    fireEvent.change(screen.getByTestId('dalia-drawer-filter'), { target: { value: 'לקוח 7' } });
    expect(drawer.querySelectorAll('.dalia-drawer-row').length).toBe(1);
    fireEvent.click(screen.getAllByTestId('dalia-open-case')[0]);
    expect(openCase).toHaveBeenCalledWith('k7');
    expect(screen.queryByTestId('dalia-drawer')).toBeNull();
  });

  it('a requested photo is taken with the camera button and goes to the workflow (not to the chat)', async () => {
    installSpeech([{ lang: 'he-IL', name: 'Google עברית' }]);
    const readDocument = vi.fn();
    void readDocument;
    renderGarage();
    fireEvent.click(await screen.findByTestId('garage-action-new-customer'));
    await waitFor(() => expect(utterances).toHaveLength(1));
    const input = screen.getByTestId('claims-ai-input') as HTMLTextAreaElement;
    const answer = async (text: string) => {
      fireEvent.change(input, { target: { value: text } });
      fireEvent.submit(input.closest('form')!);
    };
    await answer('יוסי מזרחי');
    await waitFor(() => expect(utterances.at(-1)?.text).toBe('מה מספר הטלפון שלו?'));
    await answer('0525551234');
    await waitFor(() => expect(utterances.at(-1)?.text).toBe('האם מדובר בלקוח פרטי או עסקי?'));
    await answer('פרטי');
    await waitFor(() => expect(utterances.at(-1)?.text).toContain('האם לאשר את פתיחת הלקוח'));
    await answer('כן');
    await waitFor(() => expect(utterances.at(-1)?.text).toContain('תרצה לשייך לו רכב'));
    await answer('צילום רישיון');
    await waitFor(() => expect(screen.getAllByTestId('dalia-upload-camera').some((b) => !(b as HTMLButtonElement).disabled)).toBe(true));
    const cam = screen.getByTestId('dalia-voice-camera-input') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'license.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1, 2, 3]).buffer });
    fireEvent.change(cam, { target: { files: [file] } });
    // no reader in the test → read fails → Dalia continues by speech (asks the plate), nothing invented
    await waitFor(() => expect(utterances.at(-1)?.text).toBe('לא הצלחתי לקרוא את הרישיון. נמשיך בדיבור. מה מספר הרישוי של הרכב?'), { timeout: 3000 });
    expect(screen.getAllByText(/license\.jpg/).length).toBeGreaterThan(0);
  });

  it('garage window: maximize toggle and compact actions bar; claims module keeps its look', async () => {
    installSpeech([{ lang: 'he-IL', name: 'Google עברית' }]);
    const { unmount } = renderGarage();
    const root = await screen.findByTestId('claims-ai-workspace');
    expect(root.className).toContain('dalia-garage-window');
    fireEvent.click(screen.getByTestId('claims-ai-maximize-btn'));
    expect(root.className).toContain('is-maximized');
    fireEvent.click(screen.getByTestId('garage-action-reports'));
    expect(await screen.findByTestId('dalia-actions-bar')).toBeDefined();
    expect(screen.getByTestId('dalia-bar-general_action')).toBeDefined();
    unmount();
    render(<ClaimsAiWorkspace open onClose={vi.fn()} claim={null} userId="u" companyName={null} module="claims" />);
    const claimsRoot = await screen.findByTestId('claims-ai-workspace');
    expect(claimsRoot.className).not.toContain('dalia-garage-window');
    expect(screen.queryByTestId('claims-ai-maximize-btn')).toBeNull();
    expect(screen.getByTestId('claims-ai-attach-btn').textContent).toContain('📎');
  });
});
