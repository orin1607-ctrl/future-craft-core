/** Same microphone settings as the garage Dalia assistant (`public/ai-marketing/ai-assistant.js`). */
export const GARAGE_MIC = {
  lang: 'he-IL',
  interimResults: false,
  maxAlternatives: 1,
} as const;

export type VoicePick = { voice: SpeechSynthesisVoice | null; female: boolean; spoken: boolean };

const FEMALE_MARK = /female|woman|hila|carmit|naomi|yael|carmela/i;

export function pickHebrewVoice(voices: SpeechSynthesisVoice[]): VoicePick {
  const hebrew = voices.filter((voice) => voice.lang.toLowerCase().startsWith('he'));
  const female = hebrew.find((voice) => FEMALE_MARK.test(`${voice.name} ${voice.voiceURI}`));
  if (female) return { voice: female, female: true, spoken: false };
  return { voice: null, female: false, spoken: false };
}

/** Speaks only with a marked Hebrew female voice. A male or unmarked voice is not used. */
export function speakHebrew(text: string, voices: SpeechSynthesisVoice[]): VoicePick {
  const pick = pickHebrewVoice(voices);
  if (!pick.female || !pick.voice || typeof speechSynthesis === 'undefined') return pick;
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 500));
  utterance.lang = GARAGE_MIC.lang;
  utterance.voice = pick.voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
  return { ...pick, spoken: true };
}
