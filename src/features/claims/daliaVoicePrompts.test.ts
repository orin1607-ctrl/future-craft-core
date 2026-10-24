import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { getWorkflowStep, initWorkflowState, type DaliaWorkflowType } from './daliaVoiceWorkflows';
import { cleanTextForSpeech } from './ClaimsAiWorkspace';
import {
  DALIA_SAFE_ALTERNATIVES,
  containsLikelyPii,
  isFixedDaliaPrompt,
  speechClipId,
} from '../../../supabase/functions/_shared/daliaVoicePrompts';

const TYPES: DaliaWorkflowType[] = [
  'new_customer', 'existing_customer', 'intake', 'quote', 'invoices_credits', 'general_expenses',
  'find_case', 'close_case', 'resume_action', 'context_quote_add_work', 'context_quote_add_part',
  'context_quote_supplement', 'context_pay_balance', 'context_pay_record',
];

describe('fixed Dalia prompts (eligible for clips / cloud TTS)', () => {
  it('every question of every workflow without customer data is in the shared fixed list', () => {
    const missing: string[] = [];
    const checked = new Set<string>();
    for (const type of TYPES) {
      for (const subType of [undefined, 'supplement']) {
        for (let step = 0; step < 9; step += 1) {
          const state = { ...initWorkflowState(type), stepIndex: step, subType };
          const spec = getWorkflowStep(state);
          // Summaries built from collected answers are dynamic by design; everything else must be fixed.
          if (/\$\{|לקוח:|רכב:|₪|רשמתי|נוספה|נוסף חלק|תוספת:|רישום תשלום|מצאתי את הלקוח/.test(spec.promptText)) continue;
          if (spec.promptText.startsWith('סיימנו') || spec.promptText.startsWith('סיכום')) continue;
          const spoken = cleanTextForSpeech(spec.promptText);
          checked.add(spoken);
          if (!isFixedDaliaPrompt(spoken)) missing.push(`${type}#${step}: ${spoken}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(checked.size).toBeGreaterThan(35);
  });

  it('safe alternatives are fixed and contain no customer data', () => {
    for (const alt of Object.values(DALIA_SAFE_ALTERNATIVES)) {
      expect(isFixedDaliaPrompt(alt)).toBe(true);
      expect(containsLikelyPii(alt)).toBe(false);
    }
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
