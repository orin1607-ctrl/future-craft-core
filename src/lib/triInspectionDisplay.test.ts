import { describe, expect, it } from 'vitest';
import {
  composeInspectionNotes,
  formatInspectionDateHe,
  lastTriInspectionDisplay,
  parseInspectionNotes,
  pickLatestTriInspectionDate,
} from './triInspectionDisplay';

describe('last tri inspection date', () => {
  it('always returns a clear label, including when none was performed', () => {
    expect(lastTriInspectionDisplay(null).dateText).toBe('אין בדיקה קודמת');
    expect(lastTriInspectionDisplay('').hasDate).toBe(false);
    expect(lastTriInspectionDisplay('2026-03-12').dateText).toBe(formatInspectionDateHe('2026-03-12'));
    expect(lastTriInspectionDisplay('2026-03-12').hasDate).toBe(true);
  });

  it('picks the latest tri_semi_annual inspection actually performed', () => {
    const latest = pickLatestTriInspectionDate([
      { inspection_type: 'tri_semi_annual', inspection_date: '2025-06-01' },
      { inspection_type: 'semi_annual', inspection_date: '2026-08-01' },
      { inspection_type: 'tri_semi_annual', inspection_date: '2026-03-12' },
      { inspection_type: 'tri_semi_annual', inspection_date: '2026-01-20' },
    ]);
    expect(latest).toBe('2026-03-12');
  });
});

describe('inspection notes km + general remarks', () => {
  it('keeps the existing km-only payload when general notes are empty', () => {
    expect(composeInspectionNotes('18400', '')).toBe('קילומטראז׳: 18400');
    expect(parseInspectionNotes('קילומטראז׳: 18400')).toEqual({ km: '18400', generalNotes: '' });
  });

  it('stores long general notes after the km line without mixing into checklist items', () => {
    const saved = composeInspectionNotes('18400', 'התחלה של משפט ארוך שנמשך גם בשורה השנייה.');
    expect(saved.startsWith('קילומטראז׳: 18400')).toBe(true);
    expect(parseInspectionNotes(saved).generalNotes).toContain('התחלה של משפט ארוך');
    expect(parseInspectionNotes(saved).km).toBe('18400');
  });
});
