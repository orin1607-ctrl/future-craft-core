import { describe, expect, it } from 'vitest';
import {
  composeInspectionNotes,
  formatInspectionDateHe,
  lastTriInspectionDisplay,
  parseInspectionNotes,
  pickLatestPerformedInspectionDate,
  pickLatestTriInspectionDate,
  localTodayYmd,
  TRI_FAMILY_INSPECTION_TYPES,
} from './triInspectionDisplay';

describe('last tri inspection date', () => {
  it('always returns a clear label, including when none was performed', () => {
    expect(lastTriInspectionDisplay(null).dateText).toBe('לא קיימת בדיקה קודמת');
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

describe('last inspection performed — never a future date', () => {
  const today = '2026-09-28';

  it('ignores a future inspection_date and returns the last one performed', () => {
    expect(pickLatestTriInspectionDate([
      { inspection_type: 'tri_semi_annual', inspection_date: '2026-12-28' },
      { inspection_type: 'tri_semi_annual', inspection_date: '2026-09-28' },
      { inspection_type: 'tri_semi_annual', inspection_date: '2026-06-01' },
    ], today)).toBe('2026-09-28');
  });

  it('returns null when only future inspections exist', () => {
    expect(pickLatestTriInspectionDate([
      { inspection_type: 'tri_semi_annual', inspection_date: '2027-03-28' },
    ], today)).toBeNull();
  });

  it('vehicle card: uses inspection_date of the tri/semi family, not next_due_date', () => {
    expect(pickLatestPerformedInspectionDate([
      { inspection_type: 'quarterly', inspection_date: '2026-09-28', next_due_date: '2026-12-28' } as never,
      { inspection_type: 'semi_annual', inspection_date: '2026-04-01', next_due_date: '2026-10-01' } as never,
      { inspection_type: 'monthly', inspection_date: '2026-09-27' },
    ], TRI_FAMILY_INSPECTION_TYPES, today)).toBe('2026-09-28');
  });

  it('formats today as local YYYY-MM-DD', () => {
    expect(localTodayYmd(new Date(2026, 8, 28, 23, 30))).toBe('2026-09-28');
  });
});
