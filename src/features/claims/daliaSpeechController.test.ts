// Unit tests for the Dalia speech controller. These use FAKE engines (synth, audio element, cloud):
// they prove the control logic (ids, outcomes, ordering, mic gating inputs) — NOT that a phone plays Hebrew.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DaliaSpeechController, pickHebrewVoice, type ClipManifest, type CloudSynthResult } from './daliaSpeechController';
import { DALIA_SAFE_ALTERNATIVES, speechClipId } from '../../../supabase/functions/_shared/daliaVoicePrompts';

const FIXED = 'מה שם הספק?';
const FIXED_2 = 'מה היצרן והדגם של הרכב?';
const DYNAMIC = 'סיימנו לאסוף את הפרטים: לקוח: ישראל ישראלי, טלפון: 0521234567.';
const DYNAMIC_NO_PII = 'הורדתי ₪200. המחיר המעודכן הוא ₪800. מה השלב הבא?';

class FakeUtterance {
  text: string;
  lang = '';
  voice: unknown = null;
  rate = 1;
  pitch = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function makeSynth(voices: Array<{ lang: string; name: string }>) {
  const spoken: FakeUtterance[] = [];
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    speak: vi.fn((u: FakeUtterance) => {
      spoken.push(u);
    }),
    cancel: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    getVoices: vi.fn(() => voices),
  };
  return { synth, spoken };
}

class FakeAudio {
  src = '';
  muted = false;
  duration = NaN;
  error: { code: number } | null = null;
  playBehaviour: 'ok' | 'not-allowed' = 'ok';
  played: string[] = [];
  private handlers = new Map<string, Set<() => void>>();
  addEventListener(name: string, fn: () => void) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(fn);
  }
  removeEventListener(name: string, fn: () => void) {
    this.handlers.get(name)?.delete(fn);
  }
  fire(name: string) {
    Array.from(this.handlers.get(name) || []).forEach((fn) => fn());
  }
  play() {
    this.played.push(this.src);
    if (this.playBehaviour === 'not-allowed') {
      const err = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
      return Promise.reject(err);
    }
    return Promise.resolve();
  }
  pause = vi.fn();
}

function makeController(opts: {
  voices?: Array<{ lang: string; name: string }>;
  cloud?: ((text: string) => Promise<CloudSynthResult>) | null;
  manifest?: ClipManifest | null;
} = {}) {
  const { synth, spoken } = makeSynth(opts.voices ?? []);
  const audio = new FakeAudio();
  const cloud = opts.cloud === undefined ? null : opts.cloud;
  const log = vi.fn();
  const ctrl = new DaliaSpeechController({
    synth: synth as unknown as SpeechSynthesis,
    Utterance: FakeUtterance as unknown as new (t: string) => SpeechSynthesisUtterance,
    createAudio: () => audio as unknown as HTMLAudioElement,
    loadManifest: async () => opts.manifest ?? { clips: {} },
    clipUrl: (f) => `/base/dalia-voice/${f}`,
    cloudSynthesize: cloud,
    log,
  });
  return { ctrl, synth, spoken, audio, log };
}

const HE_VOICE = [{ lang: 'he-IL', name: 'Google עברית' }];
const EN_ONLY = [{ lang: 'en-US', name: 'Google US English' }];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('pickHebrewVoice (Hebrew voice availability)', () => {
  it('finds he-IL, iw-IL (Android) and name-based Hebrew voices', () => {
    expect(pickHebrewVoice([{ lang: 'iw_IL', name: 'x' } as SpeechSynthesisVoice])?.lang).toBe('iw_IL');
    expect(pickHebrewVoice([{ lang: 'en-US', name: 'Microsoft Asaf' } as SpeechSynthesisVoice])?.name).toBe('Microsoft Asaf');
    expect(pickHebrewVoice(EN_ONLY as SpeechSynthesisVoice[])).toBeNull();
    expect(pickHebrewVoice([])).toBeNull();
  });
});

describe('local Hebrew voice engine', () => {
  it('completed: resolves only after the utterance really ends', async () => {
    const { ctrl, spoken } = makeController({ voices: HE_VOICE });
    let done = false;
    const p = ctrl.speak(DYNAMIC_NO_PII, { label: 't' }).then((r) => {
      done = true;
      return r;
    });
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe('he-IL');
    spoken[0].onstart?.();
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);
    spoken[0].onend?.();
    const r = await p;
    expect(r).toMatchObject({ outcome: 'completed', engine: 'local', usedAlternative: false });
    expect(ctrl.isActive()).toBe(false);
  });

  it('failed: a synthesis error is NOT reported as success', async () => {
    const { ctrl, spoken } = makeController({ voices: HE_VOICE });
    const p = ctrl.speak(DYNAMIC_NO_PII);
    spoken[0].onstart?.();
    spoken[0].onerror?.({ error: 'synthesis-failed' });
    const r = await p;
    expect(r.outcome).toBe('failed');
    expect(r.reason).toContain('synthesis-failed');
  });

  it('failed: onend without onstart (engine produced no audio) is never success, even after a delay', async () => {
    const { ctrl, spoken } = makeController({ voices: HE_VOICE });
    const p = ctrl.speak(DYNAMIC_NO_PII);
    await vi.advanceTimersByTimeAsync(1500);
    spoken[0].onend?.();
    const r = await p;
    expect(r.outcome).toBe('failed');
    expect(r.reason).toContain('ended-without-start');
  });

  it('blocked: not-allowed error is reported as blocked', async () => {
    const { ctrl, spoken } = makeController({ voices: HE_VOICE });
    const p = ctrl.speak(DYNAMIC_NO_PII);
    spoken[0].onerror?.({ error: 'not-allowed' });
    expect((await p).outcome).toBe('blocked');
  });

  it('failed when the engine never starts (silent Android engine)', async () => {
    const { ctrl } = makeController({ voices: HE_VOICE });
    const p = ctrl.speak(DYNAMIC_NO_PII);
    await vi.advanceTimersByTimeAsync(4100);
    const r = await p;
    expect(r.outcome).toBe('failed');
    expect(r.reason).toContain('no-start');
  });

  it('does not cancel the synth before speaking when it is idle', () => {
    const { ctrl, synth } = makeController({ voices: HE_VOICE });
    void ctrl.speak(DYNAMIC_NO_PII);
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });
});

describe('cancellation, rapid switching and stale callbacks', () => {
  it('cancel(): resolves cancelled, stops own utterance; cancel while idle is a no-op', async () => {
    const { ctrl, synth, spoken } = makeController({ voices: HE_VOICE });
    ctrl.cancel();
    expect(synth.cancel).not.toHaveBeenCalled();
    const p = ctrl.speak(DYNAMIC_NO_PII);
    spoken[0].onstart?.();
    ctrl.cancel('stopped');
    const r = await p;
    expect(r).toMatchObject({ outcome: 'cancelled', reason: 'stopped' });
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('a new speak() supersedes the old one; the old onend cannot finish the new one', async () => {
    const { ctrl, spoken } = makeController({ voices: HE_VOICE });
    const first = ctrl.speak(DYNAMIC_NO_PII, { label: 'first' });
    spoken[0].onstart?.();
    const firstHandlers = { onend: spoken[0].onend, onerror: spoken[0].onerror };
    const second = ctrl.speak('תשובה שנייה בלי פרטים', { label: 'second' });
    const r1 = await first;
    expect(r1).toMatchObject({ outcome: 'cancelled', reason: 'superseded' });
    expect(ctrl.isLatest(r1.id)).toBe(false);

    // Late events from the first utterance (Chrome fires 'interrupted' + onend after cancel)
    firstHandlers.onerror?.({ error: 'interrupted' });
    firstHandlers.onend?.();
    await vi.advanceTimersByTimeAsync(200); // speak is delayed after a cancel
    expect(ctrl.isActive()).toBe(true);

    const u2 = spoken[spoken.length - 1];
    expect(u2.text).toBe('תשובה שנייה בלי פרטים');
    u2.onstart?.();
    u2.onend?.();
    const r2 = await second;
    expect(r2.outcome).toBe('completed');
    expect(ctrl.isLatest(r2.id)).toBe(true);
    expect(r2.id).toBeGreaterThan(r1.id);
  });

  it('rapid switching between many actions leaves exactly one live utterance', async () => {
    const { ctrl, spoken } = makeController({ voices: HE_VOICE });
    const results = [ctrl.speak('א בדיקה'), ctrl.speak('ב בדיקה'), ctrl.speak('ג בדיקה')];
    await vi.advanceTimersByTimeAsync(200);
    const last = spoken[spoken.length - 1];
    expect(last.text).toBe('ג בדיקה');
    last.onstart?.();
    last.onend?.();
    const [a, b, c] = await Promise.all(results);
    expect(a.outcome).toBe('cancelled');
    expect(b.outcome).toBe('cancelled');
    expect(c.outcome).toBe('completed');
  });
});

describe('fallback when the browser has NO Hebrew voice (Samsung Chrome/Brave case)', () => {
  it('never hands Hebrew text to a non-Hebrew voice (which reads only "AI")', async () => {
    const { ctrl, synth } = makeController({ voices: EN_ONLY });
    const p = ctrl.speak(FIXED);
    await vi.advanceTimersByTimeAsync(2000);
    const r = await p;
    expect(synth.speak).not.toHaveBeenCalled();
    expect(r.outcome).toBe('failed');
    expect(r.reason).toContain('no-hebrew-voice');
  });

  it('uses a pre-recorded clip first for a fixed prompt (no cloud call)', async () => {
    const cloud = vi.fn(async () => ({ ok: true as const, url: 'blob:cloud' }));
    const manifest = { clips: { [speechClipId(FIXED)]: { file: 'clips/a.mp3' } } };
    const { ctrl, audio } = makeController({ voices: EN_ONLY, cloud, manifest });
    const p = ctrl.speak(FIXED);
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.src).toBe('/base/dalia-voice/clips/a.mp3');
    audio.fire('playing');
    audio.fire('ended');
    const r = await p;
    expect(r).toMatchObject({ outcome: 'completed', engine: 'clip' });
    expect(cloud).not.toHaveBeenCalled();
  });

  it('uses cloud TTS for a fixed prompt without a clip', async () => {
    const cloud = vi.fn(async () => ({ ok: true as const, url: 'blob:cloud-1' }));
    const { ctrl, audio } = makeController({ voices: EN_ONLY, cloud });
    const p = ctrl.speak(FIXED_2);
    await vi.advanceTimersByTimeAsync(0);
    expect(cloud).toHaveBeenCalledWith(FIXED_2);
    expect(audio.src).toBe('blob:cloud-1');
    audio.fire('playing');
    audio.fire('ended');
    expect(await p).toMatchObject({ outcome: 'completed', engine: 'cloud' });
  });

  it('audio element rejected by autoplay policy → blocked (not completed)', async () => {
    const cloud = vi.fn(async () => ({ ok: true as const, url: 'blob:x' }));
    const { ctrl, audio } = makeController({ voices: EN_ONLY, cloud });
    audio.playBehaviour = 'not-allowed';
    const p = ctrl.speak(FIXED_2);
    await vi.advanceTimersByTimeAsync(10);
    expect((await p).outcome).toBe('blocked');
  });

  it('cloud not configured → failed with the reason, and later calls skip cloud', async () => {
    const cloud = vi.fn(async () => ({ ok: false as const, reason: 'not_configured', status: 503 }));
    const { ctrl } = makeController({ voices: EN_ONLY, cloud });
    const p1 = ctrl.speak(FIXED_2);
    await vi.advanceTimersByTimeAsync(10);
    const r1 = await p1;
    expect(r1.outcome).toBe('failed');
    expect(r1.reason).toContain('not_configured');
    const p2 = ctrl.speak(FIXED);
    await vi.advanceTimersByTimeAsync(10);
    await p2;
    expect(cloud).toHaveBeenCalledTimes(1);
    expect(ctrl.getDiagnostics().cloudStatus).toBe('not_configured');
  });

  it('customer data is never sent to the cloud; a generic safe sentence is spoken instead', async () => {
    const cloud = vi.fn(async (t: string) => ({ ok: true as const, url: `blob:${t.length}` }));
    const { ctrl, audio } = makeController({ voices: EN_ONLY, cloud });
    const p = ctrl.speak(DYNAMIC, { safeAlternative: DALIA_SAFE_ALTERNATIVES.confirm });
    await vi.advanceTimersByTimeAsync(0);
    expect(cloud).toHaveBeenCalledTimes(1);
    expect(cloud).toHaveBeenCalledWith(DALIA_SAFE_ALTERNATIVES.confirm);
    audio.fire('playing');
    audio.fire('ended');
    expect(await p).toMatchObject({ outcome: 'completed', engine: 'cloud', usedAlternative: true });
  });

  it('dynamic text is not retried in the cloud after the server says dynamic_not_allowed', async () => {
    const cloud = vi.fn(async () => ({ ok: false as const, reason: 'dynamic_not_allowed', status: 403 }));
    const { ctrl } = makeController({ voices: EN_ONLY, cloud });
    const p1 = ctrl.speak(DYNAMIC_NO_PII);
    await vi.advanceTimersByTimeAsync(10);
    expect((await p1).outcome).toBe('failed');
    const p2 = ctrl.speak('עוד משפט דינמי');
    await vi.advanceTimersByTimeAsync(10);
    await p2;
    expect(cloud).toHaveBeenCalledTimes(1);
  });

  it('a device Hebrew voice is still used when it exists and cloud is down', async () => {
    const cloud = vi.fn(async () => ({ ok: false as const, reason: 'provider_error', status: 502 }));
    const { ctrl, spoken } = makeController({ voices: HE_VOICE, cloud });
    const p = ctrl.speak(FIXED_2);
    await vi.advanceTimersByTimeAsync(10);
    expect(spoken).toHaveLength(1);
    spoken[0].onstart?.();
    spoken[0].onend?.();
    expect(await p).toMatchObject({ outcome: 'completed', engine: 'local' });
  });
});

describe('diagnostics report', () => {
  it('shows the chosen engine and each outcome, without spoken text', async () => {
    const cloud = vi.fn(async () => ({ ok: false as const, reason: 'not_configured', status: 503 }));
    const { ctrl } = makeController({ voices: EN_ONLY, cloud });
    const p = ctrl.speak(FIXED_2, { label: 'wf-start-new_customer' });
    await vi.advanceTimersByTimeAsync(10);
    await p;
    const report = ctrl.getDiagnosticsReport();
    expect(report).toContain('cloud=not_configured');
    expect(report).toContain('local=NO-HEBREW-VOICE');
    expect(report).toContain('wf-start-new_customer: FAILED');
    expect(report).not.toContain(FIXED_2);
  });
});
