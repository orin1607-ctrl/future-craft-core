// Long voice conversation through the real Dalia garage window (24 exchanges) with a realistic FAKE phone:
// the fake voice really "speaks" for a while, cancel() interrupts like Chrome, the fake recognizer replays
// Android's repeated results. After every step the test checks the rules of one conversation:
//   - at most one sentence plays at any moment, and never a pre-recorded (male) clip
//   - the mic is never open while Dalia speaks, and at most one mic is open
//   - every answer is processed once, no question repeats by itself, progress is kept.
// It proves the control logic, not that a physical Samsung plays Hebrew audio.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimsAiWorkspace } from './ClaimsAiWorkspace';
import { DALIA_VOICE_PROMPTS as P } from '../../../supabase/functions/_shared/daliaVoicePrompts';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 } } })),
      refreshSession: vi.fn(async () => ({ data: { session: null } })),
    },
    functions: { invoke: vi.fn(async () => ({ data: null, error: { name: 'FunctionsHttpError', context: { status: 503, json: async () => ({ error: 'not_configured' }) } } })) },
  },
}));

vi.mock('./claimsAiStore', () => ({
  listClaimsAiConversations: vi.fn(async () => ({ data: [], error: null })),
  listClaimsAiMessages: vi.fn(async () => ({ data: [], error: null })),
  createClaimsAiConversation: vi.fn(async () => ({ data: { id: 'conv-1', title: 'שיחה חדשה' }, error: null })),
  archiveClaimsAiConversation: vi.fn(),
  insertClaimsAiMessage: vi.fn(async (m: { role: string; content: string }) => ({
    data: { id: `m-${Math.random()}`, conversation_id: 'conv-1', role: m.role, content: m.content, metadata: {}, created_at: new Date().toISOString() },
    error: null,
  })),
  renameClaimsAiConversation: vi.fn(),
  claimsAiSchemaMissing: () => false,
}));

// ---------------------------------------------------------------------------
// Realistic fake phone: voice + microphone, with rule-violation tracking
// ---------------------------------------------------------------------------

type Utter = { text: string; lang: string; onstart: (() => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const violations: string[] = [];
let spoken: string[] = [];
let speakingNow: Utter | null = null;
let recs: FakeRec[] = [];
/** Answer microphones (the stop-word listener that runs while Dalia speaks is not one of them). */
const activeRecs = () => recs.filter((r) => r.active && !r.daliaBarge);
const bargeRecs = () => recs.filter((r) => r.active && r.daliaBarge);
/** How long a fake sentence lasts, and whether opening a mic cuts the speech (some Android phones). */
let speechMs = 80;
let cutOnMic = false;
let micDenied = false;

class FakeRec {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((ev: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onstart: (() => void) | null = null;
  active = false;
  daliaBarge?: boolean;
  constructor() { recs.push(this); }
  start() {
    if (this.active) throw new Error('InvalidStateError');
    if (micDenied) {
      setTimeout(() => { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }, 0);
      return;
    }
    if (recs.some((r) => r !== this && r.active)) violations.push('two microphones open');
    if (speakingNow && !this.daliaBarge) violations.push(`mic opened while Dalia speaks: ${speakingNow.text}`);
    this.active = true;
    if (cutOnMic && speakingNow) {
      // this phone stops the speech as soon as a microphone opens
      const u = speakingNow;
      speakingNow = null;
      setTimeout(() => u.onend?.(), 0);
    }
  }
  stop() { this.end(); }
  abort() { this.end(); }
  private end() {
    if (!this.active) return;
    this.active = false;
    setTimeout(() => this.onend?.(), 0);
  }
}

function installPhone() {
  violations.length = 0;
  spoken = [];
  speakingNow = null;
  recs = [];
  speechMs = 80;
  cutOnMic = false;
  micDenied = false;
  const synth = {
    get speaking() { return !!speakingNow; },
    pending: false,
    paused: false,
    speak: vi.fn((u: Utter) => {
      if (speakingNow) violations.push(`two sentences at once: "${speakingNow.text}" + "${u.text}"`);
      if (activeRecs().length || bargeRecs().length) violations.push(`Dalia speaks while a mic is open: ${u.text}`);
      speakingNow = u;
      spoken.push(u.text);
      setTimeout(() => { if (speakingNow === u) u.onstart?.(); }, 10);
      setTimeout(() => {
        if (speakingNow !== u) return;
        speakingNow = null;
        u.onend?.();
      }, speechMs);
    }),
    cancel: vi.fn(() => {
      const u = speakingNow;
      speakingNow = null;
      if (u) setTimeout(() => { u.onerror?.({ error: 'interrupted' }); u.onend?.(); }, 0);
    }),
    resume: vi.fn(),
    pause: vi.fn(),
    getVoices: vi.fn(() => [{ lang: 'he-IL', name: 'Samsung עברית (נשי)' }]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeRec, configurable: true, writable: true });
  (globalThis as any).SpeechSynthesisUtterance = class {
    text: string; lang = ''; voice = null; rate = 1; pitch = 1; onstart = null; onend = null; onerror = null;
    constructor(t: string) { this.text = t; }
  };
}

/** The user speaks: Android-style repeated results into the open mic, then silence. */
async function userSays(text: string) {
  await waitFor(() => expect(activeRecs()).toHaveLength(1), { timeout: 3000 });
  const rec = activeRecs()[0];
  const half = text.split(' ').slice(0, Math.ceil(text.split(' ').length / 2)).join(' ');
  const r = (t: string, isFinal: boolean) => Object.assign([{ transcript: t }], { isFinal });
  act(() => {
    rec.onresult?.({ resultIndex: 0, results: [r(half, false)] });
    rec.onresult?.({ resultIndex: 0, results: [r(half, true), r(text, true)] });
    rec.onresult?.({ resultIndex: 0, results: [r(half, true), r(text, true), r(text, true)] }); // Android repeat
  });
}

function typeAnswer(text: string) {
  const input = screen.getByTestId('claims-ai-input') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form')!);
}

/** Waits for Dalia's next sentence and returns it. */
async function nextSentence(expected?: string | RegExp, timeout = 4000): Promise<string> {
  const before = spoken.length;
  await waitFor(() => expect(spoken.length).toBeGreaterThan(before), { timeout });
  await waitFor(() => expect(speakingNow).toBeNull(), { timeout: 2000 });
  const said = spoken[spoken.length - 1];
  if (typeof expected === 'string') expect(said).toBe(expected);
  else if (expected) expect(said).toMatch(expected);
  return said;
}

function userBubbles(text: string) {
  return screen.queryAllByText(text, { selector: '.claims-ai-row.user .claims-ai-bubble, .claims-ai-row.user .claims-ai-bubble *' }).length;
}

// ---------------------------------------------------------------------------
// Fake garage (test data only)
// ---------------------------------------------------------------------------

function fakeGarage() {
  const cust = (id: string, name: string, phone: string) => ({ id, customer_number: 100, customer_type: 'private', name, company_name: '', phone, second_phone: '', email: '', address: '', business_id: '', contact_person: '', preferred_channel: '', notes: '' });
  const c1 = cust('c1', 'בדיקה ישראלי', '050-0000001');
  const kase = (id: string, num: string, data: Record<string, unknown>) => ({
    id, case_number: num, customer_id: 'c1', vehicle_id: 'v1', status: 'בדיקת רכב', opened_by: 'u', opened_by_name: 'בודק',
    customer_name_snapshot: c1.name, vehicle_plate_snapshot: '1000001', vehicle_label_snapshot: 'טויוטה קורולה', case_data: data, created_at: '2026-10-20T08:00:00Z',
  });
  const cases = [
    kase('k42', 'GM-2026-0042', { quoteCreated: true, timeline: [], payments: [{ amount: 300, payment_method_label: 'מזומן', payment_date: new Date().toISOString().slice(0, 10), created_at: new Date().toISOString() }], totalPaid: 300 }),
    kase('k43', 'GM-2026-0043', { workStarted: true, quoteApproved: true, workOrderSaved: true, timeline: [] }),
  ];
  return {
    actorName: '',
    actorRole: 'fleet_manager',
    searchCustomers: vi.fn(async () => []),
    getCustomer: vi.fn(async () => c1),
    listVehicles: vi.fn(async () => []),
    findVehicleByPlate: vi.fn(async () => null),
    listCustomerCases: vi.fn(async () => cases),
    listCases: vi.fn(async () => cases),
    searchCases: vi.fn(async (t: { numberDigits?: string | null }) => cases.filter((c) => t.numberDigits && c.case_number.includes(t.numberDigits))),
    listAllCases: vi.fn(async () => cases),
    getCase: vi.fn(async (id: string) => cases.find((c) => c.id === id) || null),
    createCustomer: vi.fn(),
    createVehicle: vi.fn(),
    createCase: vi.fn(),
    saveCaseData: vi.fn(),
    closeCase: vi.fn(),
    uploadCaseMedia: vi.fn(),
    updateCustomerContact: vi.fn(),
    listSuppliers: vi.fn(async () => []),
    createSupplier: vi.fn(),
    listInvoices: vi.fn(async () => []),
    createInvoice: vi.fn(),
  };
}

let garage = fakeGarage();
const chatRequests: string[] = [];

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  garage = fakeGarage();
  chatRequests.length = 0;
  installPhone();
  // the manifest DOES exist here: with a device Hebrew voice its (male) clips must still never play
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    if (String(url).includes('/functions/v1/')) {
      const body = JSON.parse(String(init?.body || '{}'));
      chatRequests.push(body.messages?.[body.messages.length - 1]?.content || '');
      const text = 'תשובת צ׳אט מדומה.';
      const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(new Blob([sse]).stream(), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (String(url).endsWith('dalia-voice/manifest.json')) {
      return { ok: true, status: 200, json: async () => ({ version: 1, clips: { x: { file: 'clips/male.wav' } } }) };
    }
    return { ok: false, status: 404, json: async () => null };
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function clipPlays() {
  const playSpy = HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>;
  return playSpy.mock.contexts.map((el) => (el as HTMLMediaElement).src).filter((src) => src.includes('/clips/'));
}

describe('one continuous conversation — 24 exchanges', () => {
  it('one voice, one question at a time, every answer once, no repeats, progress kept', async () => {
    render(
      <div className="claims-root">
        <ClaimsAiWorkspace open onClose={vi.fn()} claim={null} userId="u-1" companyName="מוסך" module="garage" garageVoiceActions={garage as never} onOpenGarageCase={vi.fn()} />
      </div>,
    );
    const log: string[] = [];
    const step = async (label: string, fn: () => void | Promise<void>, expected?: string | RegExp) => {
      await fn();
      const said = await nextSentence(expected);
      log.push(`${label} → ${said}`);
      expect(violations, `after "${label}"`).toEqual([]);
    };

    // 1–3: new customer, answers by voice (Android repeats every phrase)
    await step('1 לקוח חדש', () => fireEvent.click(screen.getByTestId('garage-action-new-customer')), P.newCustomerChoice);
    await step('2 שם', () => userSays('יוסי בדיקה'), P.phone);
    expect(userBubbles('יוסי בדיקה')).toBe(1);
    await step('3 טלפון', () => userSays('0525551234'), P.customerTypeBiz);

    // 4–5: side question mid-flow, then back — the question is asked again only because the user chose to continue
    await step('4 שאלת צד', () => userSays('רגע, כמה תיקים פתוחים יש לנו היום?'), P.continueFlowAsk);
    expect(spoken.slice(-2)).toEqual(['תיקים פתוחים: 2.', P.continueFlowAsk]);
    await step('5 להמשיך', () => userSays('כן להמשיך'), P.customerTypeBiz);

    // 6–9: switch to the general chat button mid-flow (draft kept), small talk, data, a free question, "זהו"
    fireEvent.click(screen.getByTestId('dalia-bar-general_action'));
    await nextSentence(P.generalChatOpen);
    log.push('6 שיחה כללית');
    await step('7 מה נשמע', () => userSays('מה נשמע'), P.smallTalkHowAreYou);
    await step('8 כמה רכבים', () => userSays('כמה רכבים יש כרגע במוסך'), 'תיקים פתוחים: 2.');
    await step('9 זהו', () => userSays('זהו'), P.continueFlowAsk);

    // 10–12: back to the customer: name + phone were kept, the type question comes next (typing now)
    await step('10 חזרה ללקוח', () => userSays('כן'), P.customerTypeBiz);
    await step('11 הקלדה: פרטי', () => typeAnswer('פרטי'), P.confirmCustomer);
    expect(screen.getAllByText(/יוסי בדיקה/).length).toBeGreaterThan(0);
    await step('12 ביטול', () => userSays('בטל'), P.cancelled);
    expect(garage.createCustomer).not.toHaveBeenCalled();

    // 13–15: find a case
    await step('13 איתור תיק', () => fireEvent.click(screen.getByTestId('dalia-bar-find_case')), P.findOpen);
    await step('14 תיק 42', () => userSays('תיק 42'));
    await step('15 לא לפתוח', () => userSays('לא'));

    // 16–17: report
    fireEvent.click(screen.getByTestId('dalia-actions-toggle'));
    await step('16 דוחות', () => fireEvent.click(screen.getByTestId('dalia-bar-reports')), P.reportsOpen);
    await step('17 כמה כסף נכנס', () => userSays('כמה כסף נכנס השבוע'));

    // 18–19: stop Dalia mid-sentence, then answer with the mic; tapping the mic twice opens ONE mic
    fireEvent.click(screen.getByTestId('dalia-bar-new_customer'));
    await waitFor(() => expect(speakingNow?.text).toBe(P.newCustomerChoice));
    fireEvent.click(screen.getByTestId('claims-ai-composer-stop-speech'));
    await waitFor(() => expect(speakingNow).toBeNull());
    await new Promise((r) => setTimeout(r, 400));
    const mic = screen.getByTestId('claims-ai-mic');
    if (!activeRecs().length) fireEvent.click(mic);
    await waitFor(() => expect(activeRecs()).toHaveLength(1));
    fireEvent.click(mic);
    fireEvent.click(mic);
    await new Promise((r) => setTimeout(r, 300));
    expect(activeRecs().length).toBeLessThanOrEqual(1);
    expect(violations).toEqual([]);
    log.push('18 עצירה + מיקרופון כפול');
    if (!activeRecs().length) fireEvent.click(mic);
    await step('19 שם בדיבור', () => userSays('דני טסט'), P.phone);

    // 20–22: typing ↔ voice
    await step('20 הקלדה: טלפון', () => typeAnswer('0501234567'), P.customerTypeBiz);
    await step('21 דיבור: עסקי', () => userSays('עסקי'), P.businessId);
    await step('22 הקלדה: דלג', () => typeAnswer('דלג'), P.confirmCustomer);

    // 23–24: the same sentence twice in a row (double event) is processed once; a real answer still works
    typeAnswer('לא');
    typeAnswer('לא');
    const afterNo = await nextSentence();
    log.push(`23 "לא" כפול → ${afterNo}`);
    await new Promise((r) => setTimeout(r, 800));
    expect(spoken.filter((t) => t === afterNo).length).toBe(1);
    await step('24 מה רשמת', () => typeAnswer('מה רשמת'));

    // the whole conversation
    expect(log.length).toBeGreaterThanOrEqual(24);
    expect(violations).toEqual([]);
    expect(clipPlays()).toEqual([]); // no male clip, ever
    // no question repeated by itself: identical consecutive sentences only where the user asked for it
    for (let i = 1; i < spoken.length; i += 1) {
      if (spoken[i] === spoken[i - 1]) throw new Error(`repeated by itself: ${spoken[i]}\n${log.join('\n')}`);
    }
    expect(garage.createCustomer).not.toHaveBeenCalled();
    expect(chatRequests).toEqual([]);
  }, 120000);

  it('a chat reply that arrives after the user moved on is not spoken and does not reopen the mic', async () => {
    let releaseReply: () => void = () => {};
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/functions/v1/')) {
        await new Promise<void>((r) => { releaseReply = r; });
        const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: 'תשובה ישנה שהגיעה באיחור.' } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(new Blob([sse]).stream(), { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      return { ok: false, status: 404, json: async () => null };
    }));
    render(
      <div className="claims-root">
        <ClaimsAiWorkspace open onClose={vi.fn()} claim={null} userId="u-1" companyName="מוסך" module="garage" garageVoiceActions={garage as never} onOpenGarageCase={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('garage-action-general'));
    await nextSentence(P.generalChatOpen);
    await userSays('איך מחליפים מגב ברכב');
    await nextSentence(P.generalToChat);
    // the user moves on before the chat answered
    fireEvent.click(screen.getByTestId('dalia-bar-new_customer'));
    await nextSentence(P.newCustomerChoice);
    await waitFor(() => expect(activeRecs()).toHaveLength(1));
    await act(async () => { releaseReply(); await new Promise((r) => setTimeout(r, 600)); });
    expect(spoken).not.toContain('תשובה ישנה שהגיעה באיחור.');
    expect(spoken[spoken.length - 1]).toBe(P.newCustomerChoice);
    expect(violations).toEqual([]);
    // the open question still gets the answer
    await userSays('רינה בדיקה');
    await nextSentence(P.phone);
  }, 60000);

  it('closing Dalia mid-question leaves no ghost mic; after reopening only the new window answers', async () => {
    const view = render(
      <div className="claims-root">
        <ClaimsAiWorkspace open onClose={vi.fn()} claim={null} userId="u-1" companyName="מוסך" module="garage" garageVoiceActions={garage as never} onOpenGarageCase={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('garage-action-new-customer'));
    await nextSentence(P.newCustomerChoice);
    await userSays('יוסי בדיקה');
    await waitFor(() => expect(spoken).toContain(P.phone), { timeout: 4000 });
    view.unmount(); // closed while Dalia asks the next question (the "listen after speaking" timer is pending)
    await new Promise((r) => setTimeout(r, 1200));
    expect(activeRecs()).toHaveLength(0);

    render(
      <div className="claims-root">
        <ClaimsAiWorkspace open onClose={vi.fn()} claim={null} userId="u-1" companyName="מוסך" module="garage" garageVoiceActions={garage as never} onOpenGarageCase={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('garage-action-find-case'));
    await nextSentence(P.findOpen);
    await waitFor(() => expect(activeRecs()).toHaveLength(1));
    const before = spoken.length;
    await userSays('תיק 42');
    await nextSentence();
    await new Promise((r) => setTimeout(r, 1500));
    // exactly one reply, from the new window's conversation — nothing from the closed one
    expect(spoken.length).toBe(before + 1);
    expect(spoken.slice(before)).not.toContain(P.customerTypeBiz);
    expect(violations).toEqual([]);
  }, 60000);

  it('two quick button presses: only the last one talks', async () => {
    render(
      <div className="claims-root">
        <ClaimsAiWorkspace open onClose={vi.fn()} claim={null} userId="u-1" companyName="מוסך" module="garage" garageVoiceActions={garage as never} onOpenGarageCase={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('garage-action-close-case'));
    fireEvent.click(screen.getByTestId('garage-action-find-case'));
    await nextSentence();
    await new Promise((r) => setTimeout(r, 800));
    expect(spoken[spoken.length - 1]).toBe(P.findOpen);
    expect(violations).toEqual([]);
    expect(activeRecs().length).toBeLessThanOrEqual(1);
  }, 30000);
});


// ---------------------------------------------------------------------------
// Barge-in: "דליה, עצרי" while she speaks
// ---------------------------------------------------------------------------

const res = (t: string, isFinal: boolean) => Object.assign([{ transcript: t }], { isFinal });
function deliver(rec: FakeRec, text: string) {
  act(() => {
    rec.onresult?.({ resultIndex: 0, results: [res(text, false)] });
    rec.onresult?.({ resultIndex: 0, results: [res(text, true)] });
  });
}
function renderWindow() {
  return render(
    <div className="claims-root">
      <ClaimsAiWorkspace open onClose={vi.fn()} claim={null} userId="u-1" companyName="מוסך" module="garage" garageVoiceActions={garage as never} onOpenGarageCase={vi.fn()} />
    </div>,
  );
}

describe('עצירה קולית בזמן שדליה מדברת (barge-in)', () => {
  it('Dalia hearing her own sentence never stops her; "דליה, עצרי" stops at once and the same mic takes the answer', async () => {
    speechMs = 4000;
    renderWindow();
    fireEvent.click(screen.getByTestId('garage-action-new-customer'));
    await waitFor(() => expect(speakingNow?.text).toBe(P.newCustomerChoice));
    await waitFor(() => expect(bargeRecs()).toHaveLength(1), { timeout: 2000 });
    const rec = bargeRecs()[0];
    // echo: the mic picks up Dalia's own question — not a command
    deliver(rec, P.newCustomerChoice);
    await new Promise((r) => setTimeout(r, 200));
    expect(speakingNow?.text).toBe(P.newCustomerChoice);
    // the worker: "דליה, עצרי — יוסי בדיקה"
    deliver(rec, 'דליה עצרי');
    await waitFor(() => expect(speakingNow).toBeNull(), { timeout: 500 });
    expect(activeRecs()).toEqual([rec]); // the same microphone keeps listening
    speechMs = 80;
    deliver(rec, 'דליה עצרי יוסי בדיקה');
    await nextSentence(P.phone);
    expect(spoken.filter((t) => t === P.newCustomerChoice)).toHaveLength(1); // the stopped question is not repeated
    expect(screen.getAllByText(/יוסי בדיקה/).length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  }, 30000);

  it('stop + a new instruction in one breath: quote for the same customer, details kept, the open question asked once', async () => {
    renderWindow();
    fireEvent.click(screen.getByTestId('garage-action-new-customer'));
    await nextSentence(P.newCustomerChoice);
    speechMs = 4000; // the next question (phone) is long enough to interrupt
    await userSays('יוסי בדיקה');
    await waitFor(() => expect(speakingNow?.text).toBe(P.phone), { timeout: 4000 });
    await waitFor(() => expect(bargeRecs()).toHaveLength(1), { timeout: 2000 });
    const rec = bargeRecs()[0];
    speechMs = 80;
    deliver(rec, 'דליה עצרי תפתחי לי גם הצעת מחיר ללקוח הזה');
    await waitFor(() => expect(spoken).toContain(P.quoteAfterCustomer), { timeout: 4000 });
    await waitFor(() => expect(spoken[spoken.length - 1]).toBe(P.phone), { timeout: 4000 });
    await userSays('0525551234');
    await nextSentence(P.customerTypeBiz);
    expect(garage.createCustomer).not.toHaveBeenCalled();
    expect(violations).toEqual([]);
  }, 30000);

  it('"עצרי" alone: Dalia stops and waits for the next words — nothing is sent as an answer', async () => {
    speechMs = 4000;
    renderWindow();
    fireEvent.click(screen.getByTestId('garage-action-new-customer'));
    await waitFor(() => expect(bargeRecs()).toHaveLength(1), { timeout: 2500 });
    const rec = bargeRecs()[0];
    deliver(rec, 'עצרי');
    await waitFor(() => expect(speakingNow).toBeNull(), { timeout: 500 });
    await new Promise((r) => setTimeout(r, 1800)); // longer than the silence timeout
    expect(spoken).toHaveLength(1); // no reply, no repeat
    expect(activeRecs()).toHaveLength(1); // still listening
    speechMs = 80;
    deliver(rec, 'עצרי דנה טסט');
    await nextSentence(P.phone);
    expect(violations).toEqual([]);
  }, 30000);

  it('a phone that cuts speech when the mic opens: barge-in switches itself off, says so, and replays the cut question once', async () => {
    speechMs = 4000;
    cutOnMic = true;
    renderWindow();
    fireEvent.click(screen.getByTestId('garage-action-new-customer'));
    await waitFor(() => expect(screen.getByTestId('claims-ai-error').textContent).toContain('עצירה בקול כבויה'), { timeout: 4000 });
    await waitFor(() => expect(spoken).toHaveLength(2), { timeout: 3000 });
    expect(spoken).toEqual([P.newCustomerChoice, P.newCustomerChoice]); // replayed once because the phone cut it
    // the replay plays to the end: no stop-word listener anymore
    await new Promise((r) => setTimeout(r, 800));
    expect(bargeRecs()).toHaveLength(0);
    expect(speakingNow?.text).toBe(P.newCustomerChoice);
  }, 30000);

  it('microphone permission off: a clear message, voice listening stops, typing still works', async () => {
    micDenied = true;
    renderWindow();
    fireEvent.click(screen.getByTestId('garage-action-new-customer'));
    await waitFor(() => expect(screen.getByTestId('claims-ai-error').textContent).toContain('אין לדליה גישה למיקרופון'), { timeout: 4000 });
    typeAnswer('יוסי בדיקה');
    await waitFor(() => expect(spoken[spoken.length - 1]).toBe(P.phone), { timeout: 4000 });
  }, 30000);
});
