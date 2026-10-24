import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DALIA_SAFE_ALTERNATIVES,
  DALIA_VOICE_PROMPTS,
  allFixedDaliaSentences,
  containsLikelyPii,
  isFixedDaliaPrompt,
  speechClipId,
} from '../../../supabase/functions/_shared/daliaVoicePrompts';

describe('fixed Dalia sentences (eligible for clips / cloud TTS)', () => {
  it('every Hebrew sentence literal the voice engine can speak is in the fixed list', () => {
    const src = readFileSync(`${process.cwd()}/src/features/claims/daliaVoiceEngine.ts`, 'utf8');
    // literals passed directly as a spoken sentence: say: '…', reask('…'), finish('…')
    const literals = [...src.matchAll(/(?:say:\s*|reask\(|finish\()'((?:[^'\\]|\\.)*[א-ת](?:[^'\\]|\\.)*)'/g)]
      .map((m) => m[1].replace(/\\'/g, "'"));
    const notFixed = literals.filter((l) => !isFixedDaliaPrompt(l));
    expect(notFixed).toEqual([]);
  });

  it('engine prompts and safe alternatives contain no customer data and are all fixed', () => {
    for (const p of [...Object.values(DALIA_VOICE_PROMPTS), ...Object.values(DALIA_SAFE_ALTERNATIVES)]) {
      expect(isFixedDaliaPrompt(p)).toBe(true);
      expect(containsLikelyPii(p)).toBe(false);
    }
  });

  it('the set is large enough to cover the nine workflows', () => {
    expect(allFixedDaliaSentences().length).toBeGreaterThan(100);
  });

  it('summaries with customer data are NOT treated as fixed', () => {
    expect(isFixedDaliaPrompt('סיימנו לאסוף את הפרטים: לקוח: דנה כהן. האם לשמור?')).toBe(false);
  });
});

describe('containsLikelyPii', () => {
  it('flags phones, ids, plates and e-mails; allows prices', () => {
    expect(containsLikelyPii('טלפון 052-1234567')).toBe(true);
    expect(containsLikelyPii('ת.ז 012345678')).toBe(true);
    expect(containsLikelyPii('רכב 12-345-67')).toBe(true);
    expect(containsLikelyPii('mail a@b.co')).toBe(true);
    expect(containsLikelyPii('המחיר ₪1,200 כולל מע"מ')).toBe(false);
  });
});

describe('speechClipId', () => {
  it('is stable and whitespace-insensitive', () => {
    expect(speechClipId('מה שם הספק?')).toBe(speechClipId('  מה   שם הספק? '));
    expect(speechClipId('מה שם הספק?')).not.toBe(speechClipId('מה שם הלקוח?'));
    expect(speechClipId('מה שם הספק?')).toMatch(/^[0-9a-f]{8}$/);
  });
});
