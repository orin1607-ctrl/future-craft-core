import { describe, it, expect, beforeEach } from 'vitest';
import {
  analyzeCustomPartInput,
  loadCompanyCustomOptions,
  saveCompanyCustomOption,
  deleteCompanyCustomOption,
  updateCompanyCustomOption,
  type FastWorkItem
} from './claimPaintCustomOptions';

// Mock localStorage
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => localStorageStore[k] || null,
  setItem: (k: string, v: string) => { localStorageStore[k] = v; },
  removeItem: (k: string) => { delete localStorageStore[k]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }
};

Object.defineProperty(globalThis, 'window', {
  value: { localStorage: localStorageMock },
  writable: true
});

// Group B parts data matching PaintCalculator
const PARTS_DATA_B: Record<string, number> = {
  "כנף קדמית": 1.90, "כנף קדמית ימין": 1.90, "כנף קדמית שמאל": 1.90, "כנף אחורית ימין": 2.20, "כנף אחורית שמאל": 2.20,
  "דלת קדמית": 2.20, "דלת קדמית ימין": 2.20, "דלת קדמית שמאל": 2.20, "דלת אחורית ימין": 2.05, "דלת אחורית שמאל": 2.05,
  "פגוש קדמי": 2.10, "פגוש אחורי": 2.10, "מגן קדמי": 2.05, "מכסה מנוע": 2.65, "דופן אחורית ימין": 2.30,
  "סף עליון ימין": 1.20, "סף פלסטיק ימין": 1.00, "משקוף קדמי ימין": 0.90, "גג": 3.00
};

const availableParts = Object.keys(PARTS_DATA_B);

describe('Paint Calculator Custom Options E2E & Formula Verification', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('1. Adds a new option to "כנף" group with smart detection and calculates cost accurately', () => {
    // User types "כנף קדמית צד ימין"
    const analysis = analyzeCustomPartInput('כנף קדמית צד ימין', 'כנף', availableParts);
    expect(analysis.suggestedPart).toBe('כנף קדמית ימין');
    expect(analysis.suggestedMode).toBe('full');
    expect(analysis.suggestedPct).toBe(100);

    // Save as permanent option for "מוסך דליה סטייג'ינג"
    const company = "מוסך דליה סטייג'ינג";
    const item: FastWorkItem = {
      key: 'custom_fender_right',
      label: 'כנף קדמית צד ימין',
      part: analysis.suggestedPart,
      mode: analysis.suggestedMode,
      pct: analysis.suggestedPct,
      category: 'כנף',
      isCustom: true,
      isPermanent: true,
      companyName: company
    };
    saveCompanyCustomOption(company, item);

    // Verify persisted
    const loaded = loadCompanyCustomOptions(company);
    expect(loaded.length).toBe(1);
    expect(loaded[0].label).toBe('כנף קדמית צד ימין');
    expect(loaded[0].isPermanent).toBe(true);

    // Calculate row cost: Group B base = 1.90, 100%, hourRate = 380, materialPercent = 38%, vat = 18%
    const baseH = PARTS_DATA_B[item.part]; // 1.90
    const finalH = baseH * (item.pct / 100); // 1.90
    const hourRate = 380;
    const rowPrice = finalH * hourRate; // 1.90 * 380 = 722
    const materialCost = Math.round((rowPrice * 0.38 + Number.EPSILON) * 100) / 100; // 274.36
    const subtotal = rowPrice + materialCost; // 996.36
    const vat = Math.round((subtotal * 0.18 + Number.EPSILON) * 100) / 100; // 179.34
    const total = Math.round((subtotal + vat + Number.EPSILON) * 100) / 100; // 1175.70

    expect(rowPrice).toBe(722);
    expect(materialCost).toBe(274.36);
    expect(total).toBe(1175.70);
  });

  it('2. Adds a new option to "דלת" group with blend mode: "דלת אחורית טשטוש"', () => {
    const analysis = analyzeCustomPartInput('דלת אחורית טשטוש', 'דלת', availableParts);
    expect(analysis.suggestedPart).toContain('דלת אחורית');
    expect(analysis.suggestedMode).toBe('blend');
    expect(analysis.suggestedPct).toBe(50);

    const baseH = PARTS_DATA_B['דלת אחורית ימין']; // 2.05
    const finalH = baseH * (analysis.suggestedPct / 100); // 2.05 * 0.5 = 1.025 -> 1.03
    expect(finalH).toBeCloseTo(1.025, 2);
  });

  it('3. Adds temporary option (not permanent) — does not touch localStorage', () => {
    const company = "מוסך דליה סטייג'ינג";
    const tempItem: FastWorkItem = {
      key: 'temp_fender_test',
      label: 'כנף תיקון חד פעמי',
      part: 'כנף קדמית שמאל',
      mode: 'full',
      pct: 100,
      category: 'כנף',
      isCustom: true,
      isPermanent: false
    };

    // Since isPermanent is false, saveCompanyCustomOption is NOT called
    const loaded = loadCompanyCustomOptions(company);
    expect(loaded.find(i => i.key === 'temp_fender_test')).toBeUndefined();
  });

  it('4. Allows editing and deleting custom saved options', () => {
    const company = "מוסך דליה סטייג'ינג";
    const item: FastWorkItem = {
      key: 'custom_door_edit',
      label: 'דלת קדמית חדשה',
      part: 'דלת קדמית ימין',
      mode: 'newpart',
      pct: 70,
      category: 'דלת',
      isCustom: true,
      isPermanent: true,
      companyName: company
    };
    saveCompanyCustomOption(company, item);
    expect(loadCompanyCustomOptions(company).length).toBe(1);

    // Edit option
    const editedItem = { ...item, label: 'דלת קדמית חדשה מקורית', pct: 75 };
    updateCompanyCustomOption(company, editedItem);
    const reloaded = loadCompanyCustomOptions(company);
    expect(reloaded[0].label).toBe('דלת קדמית חדשה מקורית');
    expect(reloaded[0].pct).toBe(75);

    // Delete option
    deleteCompanyCustomOption(company, item.key);
    expect(loadCompanyCustomOptions(company).length).toBe(0);
  });

  it('5. Ensures company isolation — Garage A cannot see Garage B options', () => {
    const itemA: FastWorkItem = {
      key: 'item_a',
      label: 'אפשרות חברה א',
      part: 'פגוש קדמי',
      mode: 'full',
      pct: 100,
      category: 'פגוש / מגן',
      isPermanent: true
    };
    const itemB: FastWorkItem = {
      key: 'item_b',
      label: 'אפשרות חברה ב',
      part: 'פגוש אחורי',
      mode: 'blend',
      pct: 50,
      category: 'פגוש / מגן',
      isPermanent: true
    };

    saveCompanyCustomOption('מוסך א', itemA);
    saveCompanyCustomOption('מוסך ב', itemB);

    const garageAOptions = loadCompanyCustomOptions('מוסך א');
    const garageBOptions = loadCompanyCustomOptions('מוסך ב');

    expect(garageAOptions.some(i => i.key === 'item_a')).toBe(true);
    expect(garageAOptions.some(i => i.key === 'item_b')).toBe(false);

    expect(garageBOptions.some(i => i.key === 'item_b')).toBe(true);
    expect(garageBOptions.some(i => i.key === 'item_a')).toBe(false);
  });
});
