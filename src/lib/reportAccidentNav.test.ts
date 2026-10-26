import { describe, expect, it } from 'vitest';
import {
  accidentCardPath,
  buildReportsReturnPath,
  parseReportsSearch,
  readAccidentReportReturn,
} from './reportAccidentNav';

describe('accident card from reports', () => {
  it('keeps the report filters on the way back', () => {
    const path = buildReportsReturnPath({
      period: 'custom',
      from: '2026-01-01',
      to: '2026-03-31',
      company: 'קיבוץ בארי',
      vehicle: '12-345-67',
      expanded: 'ops_accidents',
      types: ['ops_accidents'],
    });
    const parsed = parseReportsSearch(path.slice('/reports'.length));
    expect(parsed.period).toBe('custom');
    expect(parsed.from).toBe('2026-01-01');
    expect(parsed.to).toBe('2026-03-31');
    expect(parsed.company).toBe('קיבוץ בארי');
    expect(parsed.vehicle).toBe('12-345-67');
    expect(parsed.expanded).toBe('ops_accidents');
    expect(parsed.types).toEqual(['ops_accidents']);
  });

  it('opens the original accident id and no other id', () => {
    const back = buildReportsReturnPath({ period: 'month', expanded: 'accidents' });
    const a = accidentCardPath('accident-a', back);
    const b = accidentCardPath('accident-b', back);
    expect(a).toContain('id=accident-a');
    expect(b).toContain('id=accident-b');
    expect(a).not.toContain('accident-b');
    const params = new URLSearchParams(a.slice('/accidents?'.length));
    expect(readAccidentReportReturn(params)).toBe(back);
  });

  it('ignores a return path that is not the reports page', () => {
    const params = new URLSearchParams('from=reports&return=https://evil.example/reports');
    expect(readAccidentReportReturn(params)).toBeNull();
    const other = new URLSearchParams('id=abc');
    expect(readAccidentReportReturn(other)).toBeNull();
  });
});
