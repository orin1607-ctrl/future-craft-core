// src/features/claims/daliaSpeechController.ts
// One owner for everything Dalia says out loud.
//
// - Every speak() gets a unique id. Starting a new one resolves the previous one as `cancelled`
//   (reason `superseded`), so a stale onend / timer can never finish — or start the mic for — a newer utterance.
// - Results are explicit: completed | failed | cancelled | blocked. Only `completed` means the user heard it.
// - Engines, in order for fixed (customer-data-free) sentences: pre-recorded clip → cloud TTS → on-device Hebrew voice.
//   For dynamic sentences: on-device Hebrew voice → cloud TTS (only if the server allows it and no PII is detected)
//   → a generic safe alternative sentence (via clip/cloud). The on-device engine is used only when the browser
//   really exposes a Hebrew voice; otherwise Android Chrome reads only the Latin letters ("AI").
// - cancel() is a no-op while idle, and the synth is only cancelled when it actually has something queued.

import {
  containsLikelyPii,
  isFixedDaliaPrompt,
  normalizeSpeechKey,
  speechClipId,
} from '../../../supabase/functions/_shared/daliaVoicePrompts';

export type SpeechOutcome = 'completed' | 'failed' | 'cancelled' | 'blocked';
export type SpeechEngine = 'clip' | 'cloud' | 'local' | 'none';

export interface SpeakResult {
  id: number;
  label: string;
  outcome: SpeechOutcome;
  engine: SpeechEngine;
  reason?: string;
  usedAlternative: boolean;
  attempts: string[];
  durationMs: number;
}

export interface SpeakOptions {
  /** Short PII-free label for diagnostics, e.g. `wf-step-2`. */
  label?: string;
  /** Fixed sentence to speak when `text` cannot be spoken without sending customer data out. */
  safeAlternative?: string;
}

export type CloudSynthResult =
  | { ok: true; url: string }
  | { ok: false; reason: string; status?: number };

export interface ClipManifest {
  version?: number;
  voice?: string | null;
  clips: Record<string, { file: string; text?: string }>;
}

export interface SpeechControllerDeps {
  synth?: SpeechSynthesis | null;
  Utterance?: (new (text: string) => SpeechSynthesisUtterance) | null;
  createAudio?: () => HTMLAudioElement;
  loadManifest?: () => Promise<ClipManifest | null>;
  /** Resolves a playable URL for the base path of clip files. */
  clipUrl?: (file: string) => string;
  cloudSynthesize?: ((text: string) => Promise<CloudSynthResult>) | null;
  log?: (event: string, detail?: string) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

type CloudStatus = 'unknown' | 'ready' | 'not_configured' | 'unavailable';

interface EngineOutcome {
  outcome: SpeechOutcome;
  reason?: string;
}

interface Run {
  id: number;
  cancelled: boolean;
  cancelReason?: string;
  /** Settles whichever engine attempt is in flight. */
  abortCurrent?: (outcome: EngineOutcome) => void;
}

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const LOCAL_START_TIMEOUT_MS = 4000;
const AUDIO_START_TIMEOUT_MS = 8000;
const MANIFEST_WAIT_MS = 1500;

export function pickHebrewVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || !voices.length) return null;
  const exact = voices.find((v) => {
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return l === 'he-il' || l === 'he' || l.startsWith('he-') || l === 'iw-il' || l === 'iw' || l.startsWith('iw-');
  });
  if (exact) return exact;
  const byName = voices.find((v) => {
    const n = (v.name || '').toLowerCase();
    return (
      n.includes('hebrew') ||
      n.includes('עברית') ||
      n.includes('asaf') ||
      n.includes('hila') ||
      n.includes('carmit') ||
      n.includes('he-il') ||
      n.includes('iw-il') ||
      n.includes('google he')
    );
  });
  return byName || null;
}

export class DaliaSpeechController {
  private seq = 0;
  private run: Run | null = null;
  private audio: HTMLAudioElement | null = null;
  private audioUnlocked = false;
  private manifest: ClipManifest | null = null;
  private manifestPromise: Promise<void> | null = null;
  private cloudStatus: CloudStatus = 'unknown';
  private cloudDynamicAllowed = true;
  private cloudCache = new Map<string, string>();
  private localNoStartCount = 0;
  private lastSynthCancelAt = -Infinity;
  private cloudRetryAt = 0;
  private history: SpeakResult[] = [];
  private listeners = new Set<() => void>();
  private deps: Required<Omit<SpeechControllerDeps, 'synth' | 'Utterance' | 'cloudSynthesize'>> &
    Pick<SpeechControllerDeps, 'synth' | 'Utterance' | 'cloudSynthesize'>;

  constructor(deps: SpeechControllerDeps = {}) {
    this.deps = {
      synth: deps.synth ?? null,
      Utterance: deps.Utterance ?? null,
      createAudio: deps.createAudio ?? (() => new Audio()),
      loadManifest: deps.loadManifest ?? (async () => null),
      clipUrl: deps.clipUrl ?? ((file) => file),
      cloudSynthesize: deps.cloudSynthesize ?? null,
      log: deps.log ?? (() => {}),
      now: deps.now ?? (() => Date.now()),
      setTimer: deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
    };
    if (!this.deps.cloudSynthesize) this.cloudStatus = 'not_configured';
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Use the page's persistent <audio> element (needed for Brave / Android autoplay rules). */
  attachAudioElement(el: HTMLAudioElement | null): void {
    if (el && el !== this.audio) {
      this.audio = el;
      this.audioUnlocked = false;
    }
  }

  /** Call synchronously inside a user tap: unlocks the audio element and resumes a paused synth. */
  unlock(): void {
    try {
      if (this.deps.synth?.paused) this.deps.synth.resume();
    } catch {}
    if (this.audioUnlocked || this.run) return;
    const el = this.getAudio();
    try {
      el.muted = true;
      el.src = SILENT_WAV;
      const p = el.play();
      const done = () => {
        el.muted = false;
      };
      if (p && typeof p.then === 'function') {
        p.then(() => {
          this.audioUnlocked = true;
          done();
          this.deps.log('audio-unlocked');
        }).catch((e) => {
          done();
          this.deps.log('audio-unlock-failed', String((e as Error)?.name || e));
        });
      } else {
        done();
      }
    } catch (e) {
      this.deps.log('audio-unlock-threw', String((e as Error)?.message || e));
    }
  }

  /** Starts loading the clip manifest (call once early). */
  preload(): Promise<void> {
    if (!this.manifestPromise) {
      this.manifestPromise = this.deps
        .loadManifest()
        .then((m) => {
          this.manifest = m && m.clips ? m : { clips: {} };
          this.deps.log('clip-manifest', `clips=${Object.keys(this.manifest.clips).length}`);
          this.emit();
        })
        .catch((e) => {
          this.manifest = { clips: {} };
          this.deps.log('clip-manifest-failed', String((e as Error)?.message || e));
        });
    }
    return this.manifestPromise;
  }

  isActive(): boolean {
    return this.run !== null;
  }

  /** True when `id` is the most recent speak() call — used to drop stale follow-up timers. */
  isLatest(id: number): boolean {
    return id === this.seq;
  }

  /** Stops the current utterance, if any. No-op while idle. */
  cancel(reason = 'stopped'): void {
    const run = this.run;
    if (!run) return;
    run.cancelled = true;
    run.cancelReason = reason;
    this.deps.log('cancel', `id=${run.id} reason=${reason}`);
    run.abortCurrent?.({ outcome: 'cancelled', reason });
  }

  speak(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> {
    if (this.run) this.cancel('superseded');
    const id = ++this.seq;
    const run: Run = { id, cancelled: false };
    this.run = run;
    const label = opts.label || 'speech';
    const startedAt = this.deps.now();
    this.deps.log('speak', `id=${id} label=${label} len=${(text || '').length} fixed=${isFixedDaliaPrompt(text)}`);
    this.emit();

    return this.execute(run, text, opts).then((partial) => {
      const result: SpeakResult = {
        id,
        label,
        durationMs: this.deps.now() - startedAt,
        ...partial,
      };
      if (this.run === run) this.run = null;
      this.history.push(result);
      if (this.history.length > 20) this.history.shift();
      this.deps.log(
        'speak-result',
        `id=${id} label=${label} outcome=${result.outcome} engine=${result.engine} reason=${result.reason || '-'} alt=${result.usedAlternative} tried=${result.attempts.join('>') || '-'} ms=${result.durationMs}`,
      );
      this.emit();
      return result;
    });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getHebrewVoice(): SpeechSynthesisVoice | null {
    try {
      return pickHebrewVoice(this.deps.synth?.getVoices?.() || []);
    } catch {
      return null;
    }
  }

  getDiagnostics() {
    const he = this.getHebrewVoice();
    return {
      activeId: this.run?.id ?? null,
      lastId: this.seq,
      cloudStatus: this.cloudStatus,
      cloudDynamicAllowed: this.cloudDynamicAllowed,
      clipCount: this.manifest ? Object.keys(this.manifest.clips).length : null,
      localHebrewVoice: he ? `${he.name}[${he.lang}]` : null,
      localUnreliable: this.localNoStartCount >= 2,
      audioUnlocked: this.audioUnlocked,
      history: [...this.history],
    };
  }

  getDiagnosticsReport(): string {
    const d = this.getDiagnostics();
    const lines = [
      `-- speech controller --`,
      `engines: clip=${d.clipCount === null ? 'manifest-not-loaded' : `${d.clipCount} clips`} cloud=${d.cloudStatus}${d.cloudDynamicAllowed ? '' : '(fixed-only)'} local=${d.localHebrewVoice || 'NO-HEBREW-VOICE'}${d.localUnreliable ? '(unreliable)' : ''}`,
      `audioUnlocked=${d.audioUnlocked} active=${d.activeId ?? '-'} lastId=${d.lastId}`,
      ...d.history.map(
        (r) =>
          `#${r.id} ${r.label}: ${r.outcome.toUpperCase()} engine=${r.engine}${r.usedAlternative ? ' (safe-alternative)' : ''} reason=${r.reason || '-'} tried=${r.attempts.join('>') || '-'} ${r.durationMs}ms`,
      ),
    ];
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Engine selection
  // ---------------------------------------------------------------------------

  private async execute(
    run: Run,
    text: string,
    opts: SpeakOptions,
  ): Promise<Omit<SpeakResult, 'id' | 'label' | 'durationMs'>> {
    const attempts: string[] = [];
    const clean = normalizeSpeechKey(text);
    if (!clean) {
      return { outcome: 'failed', engine: 'none', reason: 'empty-text', usedAlternative: false, attempts };
    }

    const primary = await this.tryChain(run, clean, attempts);
    if (primary.outcome !== 'failed' || run.cancelled) {
      return { ...primary, outcome: run.cancelled ? 'cancelled' : primary.outcome, usedAlternative: false, attempts };
    }

    const alt = opts.safeAlternative ? normalizeSpeechKey(opts.safeAlternative) : '';
    if (alt && alt !== clean && isFixedDaliaPrompt(alt)) {
      attempts.push('alt');
      const second = await this.tryChain(run, alt, attempts);
      if (second.outcome !== 'failed' || run.cancelled) {
        return { ...second, outcome: run.cancelled ? 'cancelled' : second.outcome, usedAlternative: true, attempts };
      }
    }
    return { outcome: 'failed', engine: 'none', reason: primary.reason || 'no-hebrew-engine', usedAlternative: false, attempts };
  }

  private async tryChain(
    run: Run,
    text: string,
    attempts: string[],
  ): Promise<{ outcome: SpeechOutcome; engine: SpeechEngine; reason?: string }> {
    const fixed = isFixedDaliaPrompt(text);
    const order: SpeechEngine[] = fixed ? ['clip', 'cloud', 'local'] : ['local', 'cloud'];
    const reasons: string[] = [];
    let blocked: { engine: SpeechEngine; reason?: string } | null = null;

    for (const engine of order) {
      if (run.cancelled) return { outcome: 'cancelled', engine, reason: run.cancelReason };
      let res: EngineOutcome | null;
      if (engine === 'clip') res = await this.tryClip(run, text);
      else if (engine === 'cloud') res = await this.tryCloud(run, text, fixed);
      else res = await this.tryLocal(run, text);
      if (res === null) continue; // engine not applicable — not an attempt
      attempts.push(`${engine}:${res.outcome}${res.reason ? `(${res.reason})` : ''}`);
      if (res.outcome === 'completed' || res.outcome === 'cancelled') {
        return { outcome: res.outcome, engine, reason: res.reason };
      }
      if (res.outcome === 'blocked') blocked = blocked || { engine, reason: res.reason };
      if (res.reason) reasons.push(`${engine}:${res.reason}`);
    }
    if (blocked) return { outcome: 'blocked', engine: blocked.engine, reason: blocked.reason };
    return { outcome: 'failed', engine: 'none', reason: reasons.join(',') || 'no-hebrew-engine' };
  }

  private async tryClip(run: Run, text: string): Promise<EngineOutcome | null> {
    if (!this.manifestPromise) this.preload();
    if (!this.manifest) {
      await Promise.race([
        this.manifestPromise,
        new Promise<void>((r) => this.deps.setTimer(r, MANIFEST_WAIT_MS)),
      ]);
    }
    const entry = this.manifest?.clips[speechClipId(text)];
    if (!entry || run.cancelled) return null;
    return this.playUrl(run, this.deps.clipUrl(entry.file), 'clip');
  }

  private async tryCloud(run: Run, text: string, fixed: boolean): Promise<EngineOutcome | null> {
    const synth = this.deps.cloudSynthesize;
    if (!synth || this.cloudStatus === 'not_configured') return null;
    if (this.cloudStatus === 'unavailable' && this.deps.now() < this.cloudRetryAt) return null;
    if (!fixed && (!this.cloudDynamicAllowed || containsLikelyPii(text))) return null;
    const key = normalizeSpeechKey(text);
    let url = this.cloudCache.get(key);
    if (!url) {
      let res: CloudSynthResult;
      try {
        res = await synth(text);
      } catch (e) {
        res = { ok: false, reason: String((e as Error)?.message || e) };
      }
      if (run.cancelled) return { outcome: 'cancelled', reason: run.cancelReason };
      if (!res.ok) {
        if (res.reason === 'not_configured') this.cloudStatus = 'not_configured';
        else if (res.reason === 'dynamic_not_allowed') this.cloudDynamicAllowed = false;
        else {
          this.cloudStatus = 'unavailable';
          this.cloudRetryAt = this.deps.now() + 30000;
        }
        this.emit();
        return { outcome: 'failed', reason: res.reason };
      }
      url = res.url;
      this.cloudStatus = 'ready';
      if (this.cloudCache.size >= 60) {
        const first = this.cloudCache.keys().next().value as string;
        this.cloudCache.delete(first);
      }
      this.cloudCache.set(key, url);
    }
    return this.playUrl(run, url, 'cloud');
  }

  private getAudio(): HTMLAudioElement {
    if (!this.audio) this.audio = this.deps.createAudio();
    return this.audio;
  }

  private playUrl(run: Run, url: string, engine: SpeechEngine): Promise<EngineOutcome> {
    return new Promise<EngineOutcome>((resolve) => {
      if (run.cancelled) {
        resolve({ outcome: 'cancelled', reason: run.cancelReason });
        return;
      }
      const el = this.getAudio();
      let settled = false;
      let started = false;
      let startTimer: unknown = null;
      let endTimer: unknown = null;

      const cleanup = () => {
        el.removeEventListener('ended', onEnded);
        el.removeEventListener('error', onError);
        el.removeEventListener('playing', onPlaying);
        el.removeEventListener('loadedmetadata', onMeta);
        if (startTimer) this.deps.clearTimer(startTimer);
        if (endTimer) this.deps.clearTimer(endTimer);
        if (run.abortCurrent === settle) run.abortCurrent = undefined;
      };
      const settle = (out: EngineOutcome) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (out.outcome !== 'completed') {
          try {
            el.pause();
          } catch {}
        }
        this.deps.log(`${engine}-${out.outcome}`, `id=${run.id}${out.reason ? ` reason=${out.reason}` : ''}`);
        resolve(out);
      };
      const onEnded = () => settle(started ? { outcome: 'completed' } : { outcome: 'failed', reason: 'ended-without-playing' });
      const onError = () => settle({ outcome: 'failed', reason: `media-error-${el.error?.code ?? '?'}` });
      const onPlaying = () => {
        started = true;
        if (startTimer) {
          this.deps.clearTimer(startTimer);
          startTimer = null;
        }
        this.deps.log(`${engine}-playing`, `id=${run.id}`);
      };
      const onMeta = () => {
        const d = Number(el.duration);
        if (Number.isFinite(d) && d > 0) {
          if (endTimer) this.deps.clearTimer(endTimer);
          endTimer = this.deps.setTimer(() => settle({ outcome: 'failed', reason: 'end-timeout' }), d * 1000 + 4000);
        }
      };

      run.abortCurrent = settle;
      el.addEventListener('ended', onEnded);
      el.addEventListener('error', onError);
      el.addEventListener('playing', onPlaying);
      el.addEventListener('loadedmetadata', onMeta);
      startTimer = this.deps.setTimer(() => {
        if (!started) settle({ outcome: 'failed', reason: 'no-start' });
      }, AUDIO_START_TIMEOUT_MS);
      endTimer = this.deps.setTimer(() => settle({ outcome: 'failed', reason: 'end-timeout' }), 90000);

      try {
        el.muted = false;
        el.src = url;
        const p = el.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            if (!started) onPlaying();
            this.audioUnlocked = true;
          }).catch((err: { name?: string; message?: string }) => {
            if (settled) return;
            if (err?.name === 'NotAllowedError') settle({ outcome: 'blocked', reason: 'autoplay-blocked' });
            else if (err?.name === 'AbortError' && run.cancelled) settle({ outcome: 'cancelled', reason: run.cancelReason });
            else settle({ outcome: 'failed', reason: `play-${err?.name || 'error'}` });
          });
        }
      } catch (e) {
        settle({ outcome: 'failed', reason: `play-threw-${(e as Error)?.name || 'error'}` });
      }
    });
  }

  private tryLocal(run: Run, text: string): Promise<EngineOutcome | null> {
    const synth = this.deps.synth;
    const Utter = this.deps.Utterance;
    if (!synth || !Utter) return Promise.resolve(null);
    const voice = this.getHebrewVoice();
    if (!voice) return Promise.resolve({ outcome: 'failed', reason: 'no-hebrew-voice' });
    if (this.localNoStartCount >= 2) return Promise.resolve({ outcome: 'failed', reason: 'local-unreliable' });

    return new Promise<EngineOutcome>((resolve) => {
      if (run.cancelled) {
        resolve({ outcome: 'cancelled', reason: run.cancelReason });
        return;
      }
      let settled = false;
      let started = false;
      let ownsSynth = false;
      const timers: unknown[] = [];
      const speakAt = this.deps.now();
      const u = new Utter(text);

      const settle = (out: EngineOutcome) => {
        if (settled) return;
        settled = true;
        timers.forEach((t) => this.deps.clearTimer(t));
        u.onstart = null;
        u.onend = null;
        u.onerror = null;
        if (run.abortCurrent === settle) run.abortCurrent = undefined;
        // Only our own utterance is ever cancelled here, never a newer one (a newer speak() supersedes us first).
        if (out.outcome !== 'completed' && ownsSynth) {
          try {
            synth.cancel();
            this.lastSynthCancelAt = this.deps.now();
          } catch {}
        }
        this.deps.log(`local-${out.outcome}`, `id=${run.id}${out.reason ? ` reason=${out.reason}` : ''}`);
        resolve(out);
      };
      run.abortCurrent = settle;

      try {
        u.voice = voice;
      } catch {}
      u.lang = voice.lang || 'he-IL';
      u.rate = 1;
      u.pitch = 1;
      u.onstart = () => {
        started = true;
        this.localNoStartCount = 0;
        this.deps.log('local-onstart', `id=${run.id} afterMs=${this.deps.now() - speakAt}`);
      };
      u.onend = () => {
        // No onstart means the engine never produced audio (seen on Android with an unusable voice).
        if (!started) settle({ outcome: 'failed', reason: 'ended-without-start' });
        else settle({ outcome: 'completed' });
      };
      u.onerror = (ev: SpeechSynthesisErrorEvent) => {
        const err = String(ev?.error || 'unknown');
        if (run.cancelled) settle({ outcome: 'cancelled', reason: run.cancelReason });
        else if (err === 'not-allowed') settle({ outcome: 'blocked', reason: 'not-allowed' });
        else settle({ outcome: 'failed', reason: err });
      };

      const doSpeak = () => {
        if (settled || run.cancelled) return;
        try {
          if (synth.paused) synth.resume();
          ownsSynth = true;
          synth.speak(u);
        } catch (e) {
          settle({ outcome: 'failed', reason: `speak-threw-${(e as Error)?.name || 'error'}` });
          return;
        }
        timers.push(
          this.deps.setTimer(() => {
            if (!started && !synth.speaking) {
              this.localNoStartCount += 1;
              settle({ outcome: 'failed', reason: 'no-start' });
            }
          }, LOCAL_START_TIMEOUT_MS),
        );
        // Chrome sometimes drops onend: poll after the expected duration.
        const expectMs = 1500 + text.length * 90;
        const pollFn = () => {
          if (settled) return;
          if (started && !synth.speaking && !synth.pending) settle({ outcome: 'completed', reason: 'onend-missing' });
          else timers.push(this.deps.setTimer(pollFn, 500));
        };
        timers.push(this.deps.setTimer(pollFn, expectMs));
        timers.push(this.deps.setTimer(() => settle({ outcome: 'failed', reason: 'end-timeout' }), expectMs * 3 + 15000));
      };

      // Cancel only when the synth really has something queued; Chrome may drop an utterance spoken
      // in the same tick as cancel(), so give it a short gap.
      let needsCancel = false;
      try {
        needsCancel = !!(synth.speaking || synth.pending);
      } catch {}
      if (needsCancel) {
        try {
          synth.cancel();
          this.lastSynthCancelAt = this.deps.now();
        } catch {}
      }
      if (this.deps.now() - this.lastSynthCancelAt < 120) {
        timers.push(this.deps.setTimer(doSpeak, 120));
      } else {
        doSpeak();
      }
    });
  }

  private emit(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }
}
