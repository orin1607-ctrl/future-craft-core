import { describe, expect, it } from 'vitest';
import { claimMatchesSearch, searchEmptyLabel } from './claimSearch';
import type { ClaimRecord } from './claimsConstants';

const eli = { id: 'DAL-2026-0020', clientName: 'אליהו אטיאס', plate: '12-345-67', claimNum: 'DAL-2026-0020', status: 'בטיפול' } as ClaimRecord;
const eli2 = { id: 'DAL-2026-0021', clientName: 'אליהו אטיאס', plate: '98-765-43', claimNum: 'DAL-2026-0021', status: 'חדש' } as ClaimRecord;
const similar = { id: 'DAL-2026-0099', clientName: 'אליהו כהן', plate: '11-111-11', status: 'בטיפול' } as ClaimRecord;

describe('claimMatchesSearch', () => {
  it('matches full name regardless of token order', () => {
    expect(claimMatchesSearch(eli, 'אליהו אטיאס')).toBe(true);
    expect(claimMatchesSearch(eli, 'אטיאס אליהו')).toBe(true);
  });
  it('matches partial first and last name', () => {
    expect(claimMatchesSearch(eli, 'אליהו')).toBe(true);
    expect(claimMatchesSearch(eli, 'אטיאס')).toBe(true);
  });
  it('returns every claim for the same client', () => {
    const q = 'אליהו אטיאס';
    expect([eli, eli2, similar].filter((c) => claimMatchesSearch(c, q)).map((c) => c.id)).toEqual(['DAL-2026-0020', 'DAL-2026-0021']);
  });
  it('does not leak a similar other customer on full name', () => {
    expect(claimMatchesSearch(similar, 'אליהו אטיאס')).toBe(false);
    expect(claimMatchesSearch(similar, 'אליהו')).toBe(true);
  });
  it('matches full and last name even when the query has RTL marks', () => {
    expect(claimMatchesSearch(eli, '\u200fאליהו \u200fאטיאס')).toBe(true);
    expect(claimMatchesSearch(eli, '\u200fאטיאס')).toBe(true);
    expect(claimMatchesSearch(similar, '\u200fאליהו \u200fאטיאס')).toBe(false);
  });
  it('empty query matches all', () => {
    expect(claimMatchesSearch(eli, '   ')).toBe(true);
  });
});

describe('searchEmptyLabel', () => {
  it('uses no-results copy when a query is active', () => {
    expect(searchEmptyLabel(true, 'אין תיקים')).toBe('לא נמצאו תוצאות');
    expect(searchEmptyLabel(false, 'אין תיקים')).toBe('אין תיקים');
  });
});
