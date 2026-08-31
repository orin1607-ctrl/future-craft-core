import { describe, expect, it } from 'vitest';
import { macroForCity, matchesMacro } from './leadGeo';

describe('lead geo grouping', () => {
  it('maps known cities without inventing a city name', () => {
    expect(macroForCity('ראשון לציון')).toBe('שפלה');
    expect(macroForCity('תל אביב יפו')).toBe('מרכז');
    expect(macroForCity('חיפה')).toBe('צפון');
    expect(macroForCity('באר שבע')).toBe('דרום');
    expect(macroForCity('יישוב לא מוכר 123')).toBeNull();
  });

  it('empty region matches ללא אזור only', () => {
    expect(matchesMacro('', 'ללא אזור')).toBe(true);
    expect(matchesMacro('חולון', 'ללא אזור')).toBe(false);
    expect(matchesMacro('חולון', 'מרכז')).toBe(true);
  });
});
