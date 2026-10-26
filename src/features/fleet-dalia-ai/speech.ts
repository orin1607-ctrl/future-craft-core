/** Same microphone settings as the garage Dalia assistant (`public/ai-marketing/ai-assistant.js`). */
export const GARAGE_MIC = {
  lang: 'he-IL',
  interimResults: false,
  maxAlternatives: 1,
} as const;

/** Settings for continuous hands-free voice mode */
export const CONTINUOUS_MIC_CONFIG = {
  lang: 'he-IL',
  interimResults: true,
  maxAlternatives: 1,
  continuous: true,
} as const;

export type VoicePick = { voice: SpeechSynthesisVoice | null; female: boolean; spoken: boolean };

export type SpeakOptions = {
  allowFallback?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err?: unknown) => void;
};

const FEMALE_MARK = /female|woman|hila|carmit|naomi|yael|carmela/i;

export function cleanSpokenText(text: string): string {
  return text
    .replace(/\[\[nav:[^\]]+\]\]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#*_~`]/g, '')
    .replace(/\|.*\|/g, '')
    .replace(/[•-]\s+/g, ', ')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

export function pickHebrewVoice(voices: SpeechSynthesisVoice[], allowFallback = false): VoicePick {
  const hebrew = voices.filter((voice) => voice.lang.toLowerCase().startsWith('he'));
  if (hebrew.length === 0) return { voice: null, female: false, spoken: false };
  const female = hebrew.find((voice) => FEMALE_MARK.test(`${voice.name} ${voice.voiceURI}`));
  if (female) return { voice: female, female: true, spoken: false };
  if (allowFallback) return { voice: hebrew[0], female: false, spoken: false };
  return { voice: null, female: false, spoken: false };
}

/** Immediate interruption (barge-in): stops any active speech synthesis */
export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
}

/** Speaks with a Hebrew voice. Supports female preference, barge-in, and completion callbacks. */
export function speakHebrew(
  text: string,
  voices: SpeechSynthesisVoice[],
  options?: SpeakOptions,
): VoicePick {
  const allowFallback = options?.allowFallback ?? false;
  const pick = pickHebrewVoice(voices, allowFallback);
  if (!pick.voice || typeof speechSynthesis === 'undefined') return pick;
  if (!pick.female && !allowFallback) return pick;

  const spokenClean = cleanSpokenText(text);
  if (!spokenClean) return pick;

  const utterance = new SpeechSynthesisUtterance(spokenClean);
  utterance.lang = GARAGE_MIC.lang;
  utterance.voice = pick.voice;
  utterance.rate = 1.05;
  utterance.pitch = pick.female ? 1.0 : 1.15;

  utterance.onstart = () => {
    options?.onStart?.();
  };
  utterance.onend = () => {
    options?.onEnd?.();
  };
  utterance.onerror = (e) => {
    options?.onError?.(e);
    options?.onEnd?.();
  };

  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
  return { ...pick, spoken: true };
}
