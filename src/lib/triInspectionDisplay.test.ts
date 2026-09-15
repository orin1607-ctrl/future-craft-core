import { describe, expect, it } from 'vitest';
import {
  formatInspectionDateHe,
  lastTriInspectionDisplay,
  pickLatestTriInspectionDate,
} from './triInspectionDisplay';

describe('last tri inspection date', () => {
  it('always returns a clear label, including when none was performed', () => {
    expect(lastTriInspectionDisplay(null).dateText).toBe('לא קיימת ביקורת קודמת');
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
