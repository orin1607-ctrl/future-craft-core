import { describe, it, expect, beforeEach } from 'vitest';
import {
  analyzeCustomPartInput,
  loadCompanyCustomOptions,
  saveCompanyCustomOption,
  deleteCompanyCustomOption,
  updateCompanyCustomOption,
  getCompanyStorageKey,
  type FastWorkItem
} from './claimPaintCustomOptions';

const MOCK_PARTS = [
  "כנף קדמית ימין",
  "כנף קדמית שמאל",
  "כנף אחורית ימין",
  "כנף אחורית שמאל",
  "כנף עליונה ימין",
  "כנף תחתונה שמאל",
  "דלת קדמית ימין",
  "דלת קדמית שמאל",
  "דלת אחורית ימין",
  "דלת אחורית שמאל",
  "דלת תא מטען",
  "פגוש קדמי",
  "פגוש אחורי",
  "מגן קדמי",
  "מגן אחורי",
  "מכסה מנוע",
  "מכסה תא מטען",
  "גג",
  "דופן אחורית ימין",
  "דופן אחורית שמאל",
  "סף עליון ימין",
  "סף תחתון שמאל",
  "סף פלסטיק ימין",
  "משקוף קדמי ימין",
  "משקוף אחורי שמאל",
  "קורה קדמית ימין"
];

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(globalThis, 'window', {
  value: {
    localStorage: localStorageMock
  },
  writable: true
});

describe('Smart Paint Calculation Analyzer (שיוך חכם למנגנון החישוב)', () => {
  it('correctly maps blend on right fender: "טשטוש כנף ימין"', () => {
    const res = analyzeCustomPartInput('טשטוש כנף ימין', 'כנף', MOCK_PARTS);
    expect(res.suggestedMode).toBe('blend');
    expect(res.suggestedPct).toBe(50);
    expect(res.suggestedPart).toContain('כנף');
    expect(res.suggestedPart).toContain('ימין');
    expect(res.confidence).toBe('high');
  });

  it('correctly maps new part on left fender: "כנף חדשה צד שמאל"', () => {
    const res = analyzeCustomPartInput('כנף חדשה צד שמאל', 'כנף', MOCK_PARTS);
    expect(res.suggestedMode).toBe('newpart');
    expect(res.suggestedPct).toBe(70);
    expect(res.suggestedPart).toContain('כנף');
    expect(res.suggestedPart).toContain('שמאל');
    expect(res.confidence).toBe('high');
  });

  it('correctly maps repair on fender: "כנף לאחר תיקון"', () => {
    const res = analyzeCustomPartInput('כנף לאחר תיקון', 'כנף', MOCK_PARTS);
    expect(res.suggestedMode).toBe('full');
    expect(res.suggestedPct).toBe(100);
    expect(res.suggestedPart).toContain('כנף');
    expect(res.confidence).toBe('high');
  });

  it('correctly maps bodywork on fender: "כנף לאחר פחחות"', () => {
    const res = analyzeCustomPartInput('כנף לאחר פחחות', 'כנף', MOCK_PARTS);
    expect(res.suggestedMode).toBe('full');
    expect(res.suggestedPct).toBe(100);
    expect(res.suggestedPart).toContain('כנף');
  });

  it('correctly maps rear door blend: "דלת אחורית טשטוש"', () => {
    const res = analyzeCustomPartInput('דלת אחורית טשטוש', 'דלת', MOCK_PARTS);
    expect(res.suggestedMode).toBe('blend');
    expect(res.suggestedPct).toBe(50);
    expect(res.suggestedPart).toContain('דלת אחורית');
    expect(res.confidence).toBe('high');
  });

  it('correctly maps new front bumper: "פגוש קדמי חדש"', () => {
    const res = analyzeCustomPartInput('פגוש קדמי חדש', 'פגוש / מגן', MOCK_PARTS);
    expect(res.suggestedMode).toBe('newpart');
    expect(res.suggestedPct).toBe(70);
    expect(res.suggestedPart).toBe('פגוש קדמי');
    expect(res.confidence).toBe('high');
  });

  it('correctly distinguishes right front fender: "כנף קדמית צד ימין"', () => {
    const res = analyzeCustomPartInput('כנף קדמית צד ימין', 'כנף', MOCK_PARTS);
    expect(res.suggestedPart).toBe('כנף קדמית ימין');
  });

  it('correctly distinguishes left rear fender: "כנף אחורית צד שמאל"', () => {
    const res = analyzeCustomPartInput('כנף אחורית צד שמאל', 'כנף', MOCK_PARTS);
    expect(res.suggestedPart).toBe('כנף אחורית שמאל');
  });

  it('handles ambiguous / free text safely with fallback: "חלק מיוחד"', () => {
    const res = analyzeCustomPartInput('חלק מיוחד', 'כנף', MOCK_PARTS);
    expect(res.suggestedPart).toBeDefined();
    expect(res.confidence).toBe('low');
    expect(res.suggestedMode).toBe('full');
  });
});

describe('Company Scoped Custom Options Persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('isolates options per company / garage', () => {
    const itemA: FastWorkItem = {
      key: 'custom_1',
      label: 'כנף קדמית ימין מיוחדת',
      part: 'כנף קדמית ימין',
      mode: 'newpart',
      pct: 70,
      category: 'כנף',
      isPermanent: true
    };

    const itemB: FastWorkItem = {
      key: 'custom_2',
      label: 'דלת ימין צבע מוסך אחר',
      part: 'דלת קדמית ימין',
      mode: 'full',
      pct: 100,
      category: 'דלת',
      isPermanent: true
    };

    saveCompanyCustomOption('מוסך אורן', itemA);
    saveCompanyCustomOption('מוסך יוני', itemB);

    const orenOptions = loadCompanyCustomOptions('מוסך אורן');
    const yoniOptions = loadCompanyCustomOptions('מוסך יוני');

    expect(orenOptions.length).toBe(1);
    expect(orenOptions[0].label).toBe('כנף קדמית ימין מיוחדת');

    expect(yoniOptions.length).toBe(1);
    expect(yoniOptions[0].label).toBe('דלת ימין צבע מוסך אחר');
  });

  it('supports updating and deleting custom options', () => {
    const item: FastWorkItem = {
      key: 'custom_edit_test',
      label: 'כנף ניסוי',
      part: 'כנף קדמית ימין',
      mode: 'full',
      pct: 100,
      category: 'כנף',
      isPermanent: true
    };

    saveCompanyCustomOption('מוסך אורן', item);
    expect(loadCompanyCustomOptions('מוסך אורן').length).toBe(1);

    // Update
    updateCompanyCustomOption('מוסך אורן', {
      ...item,
      label: 'כנף ניסוי מעודכנת',
      pct: 70,
      mode: 'newpart'
    });

    const updated = loadCompanyCustomOptions('מוסך אורן');
    expect(updated.length).toBe(1);
    expect(updated[0].label).toBe('כנף ניסוי מעודכנת');
    expect(updated[0].pct).toBe(70);

    // Delete
    deleteCompanyCustomOption('מוסך אורן', 'custom_edit_test');
    expect(loadCompanyCustomOptions('מוסך אורן').length).toBe(0);
  });
});
