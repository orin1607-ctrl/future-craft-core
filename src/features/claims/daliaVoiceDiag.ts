// src/features/claims/daliaVoiceDiag.ts
// Temporary, PII-free diagnostics for Dalia AI speech on mobile browsers (Brave/Android).
// Records only event names, timings, lengths and engine state — never spoken text or customer data.

type DiagEvent = { t: number; e: string; d?: string };

const MAX_EVENTS = 250;
const events: DiagEvent[] = [];
const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
let spyInstalled = false;

export const DIAG_BUILD = 'voice-diag-1 (base a7aec782)';

export function diagLog(e: string, d?: string): void {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  events.push({ t: Math.round(now - t0), e, d });
  if (events.length > MAX_EVENTS) events.shift();
}

function shortStack(): string {
  try {
    const lines = (new Error().stack || '').split('\n').slice(3, 6);
    return lines.map((l) => l.trim().replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\/[^/]+\//, '')).join(' < ');
  } catch {
    return '';
  }
}

/** Wraps speechSynthesis.cancel/speak/pause so ANY code that silences or starts speech is recorded. Behaviour is unchanged. */
export function installSynthSpy(): void {
  if (spyInstalled || typeof window === 'undefined' || !window.speechSynthesis) return;
  spyInstalled = true;
  const synth = window.speechSynthesis as any;
  for (const name of ['cancel', 'pause', 'resume', 'speak'] as const) {
    const orig = synth[name]?.bind(synth);
    if (!orig) continue;
    try {
      synth[name] = (...args: any[]) => {
        diagLog(`synth.${name}()`, `speaking=${synth.speaking} pending=${synth.pending} paused=${synth.paused} caller=${shortStack()}`);
        return orig(...args);
      };
    } catch {
      diagLog('spy-install-failed', name);
    }
  }
  diagLog('spy-installed');
}

export function probeSynth(label: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const s = window.speechSynthesis;
  diagLog(`probe ${label}`, `speaking=${s.speaking} pending=${s.pending} paused=${s.paused}`);
}

export function describeVoices(voices: SpeechSynthesisVoice[]): string {
  if (!voices.length) return 'voices=0';
  const langs = Array.from(new Set(voices.map((v) => (v.lang || '?').toLowerCase()))).slice(0, 14).join(',');
  const he = voices.filter((v) => /^(he|iw)/i.test(v.lang || '') || /hebrew|עברית/i.test(v.name || ''));
  const heDesc = he.length ? he.map((v) => `${v.name}[${v.lang},${v.localService ? 'local' : 'remote'}]`).join('; ') : 'NONE';
  const def = voices.find((v) => v.default);
  return `voices=${voices.length} langs=${langs} hebrew=${heDesc} default=${def ? `${def.name}[${def.lang}]` : 'none'}`;
}

export async function getDiagReport(): Promise<string> {
  const nav: any = typeof navigator !== 'undefined' ? navigator : {};
  const w: any = typeof window !== 'undefined' ? window : {};
  let brave = 'n/a';
  try {
    if (nav.brave?.isBrave) brave = String(await nav.brave.isBrave());
  } catch {
    brave = 'error';
  }
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = w.speechSynthesis?.getVoices?.() || [];
  } catch {}
  const lines: string[] = [
    `== Dalia voice diagnostics ==`,
    `build: ${DIAG_BUILD}`,
    `time: ${new Date().toISOString()}`,
    `ua: ${nav.userAgent || '?'}`,
    `brave: ${brave}`,
    `secureContext: ${w.isSecureContext}`,
    `visibility: ${typeof document !== 'undefined' ? document.visibilityState : '?'}`,
    `userActivation: active=${nav.userActivation?.isActive} hasBeen=${nav.userActivation?.hasBeenActive}`,
    `speechSynthesis: ${w.speechSynthesis ? 'available' : 'MISSING'}`,
    `synthState: speaking=${w.speechSynthesis?.speaking} pending=${w.speechSynthesis?.pending} paused=${w.speechSynthesis?.paused}`,
    `SpeechRecognition: ${w.SpeechRecognition || w.webkitSpeechRecognition ? 'available' : 'MISSING'}`,
    describeVoices(voices),
    `-- events (ms since page load) --`,
    ...events.map((x) => `${x.t}ms ${x.e}${x.d ? ' | ' + x.d : ''}`),
  ];
  return lines.join('\n');
}

export async function copyDiagReport(): Promise<{ ok: boolean; text: string }> {
  const text = await getDiagReport();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true, text };
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return { ok, text };
  } catch {
    return { ok: false, text };
  }
}
