import { describe, expect, it } from 'vitest';
import {
  calculateRepairAmount,
  checkPlateMatch,
  normalizePlate,
  parseCleanNumber,
  parseLeviYitzhakText,
} from './leviYitzhakParser';

describe('leviYitzhakParser', () => {
  it('normalizes license plates correctly', () => {
    expect(normalizePlate('12-345-67')).toBe('1234567');
    expect(normalizePlate('123-45-678')).toBe('12345678');
    expect(normalizePlate('  987 65 432 ')).toBe('98765432');
  });

  it('detects matching plates and mismatches', () => {
    expect(checkPlateMatch('12-345-67', '1234567').match).toBe(true);
    expect(checkPlateMatch('12-345-67', '99-999-99').match).toBe(false);
    expect(checkPlateMatch('12-345-67', '99-999-99').warning).toContain('אינו תואם');
    // If one is missing, no false warning
    expect(checkPlateMatch('', '1234567').match).toBe(true);
  });

  it('calculates repair amount by percentage dynamically', () => {
    expect(calculateRepairAmount(100000, 10)).toBe(10000);
    expect(calculateRepairAmount('85,000', '12.5')).toBe(10625);
    expect(calculateRepairAmount('₪ 74,500', '15')).toBe(11175);
    expect(calculateRepairAmount(0, 10)).toBe(0);
    expect(calculateRepairAmount(50000, 0)).toBe(0);
  });

  it('parses typical Levi Itzhak text output', () => {
    const sampleText = `
      לוי יצחק - מחירון רכב
      תאריך בדיקה: 28/10/2026
      מספר רישוי: 12-345-67
      תוצר ודגם: יונדאי איוניק
      שנת ייצור: 2021
      מועד עלייה לכביש: 05/2021
      רמת גימור: Premium
      סוג בעלות: פרטית
      קילומטראז': 48,000
      יד: 1
      מחיר בסיס: ₪95,000
      הפחתה קילומטראז': -2.5%
      תוספת חודשי עלייה: +1.5%
      שווי רכב משוקלל סופי: ₪92,500
    `;

    const parsed = parseLeviYitzhakText(sampleText);
    expect(parsed.plate).toBe('12-345-67');
    expect(parsed.carMake).toBe('יונדאי');
    expect(parsed.carModel).toBe('איוניק');
    expect(parsed.carYear).toBe('2021');
    expect(parsed.roadDate).toBe('05/2021');
    expect(parsed.ramatGimur).toBe('Premium');
    expect(parsed.ownershipType).toBe('פרטית');
    expect(parsed.mileage).toBe('48000');
    expect(parsed.prevOwners).toBe('1');
    expect(parsed.basicPrice).toBe('95000');
    expect(parsed.weightedPrice).toBe('92500');
    expect(parsed.valuationDate).toBe('28/10/2026');
    expect(parsed.valuationSource).toBe('מחירון לוי יצחק');
    expect(parsed.additionsDeductions).toContain('הפחתה קילומטראז');
  });

  it('parses 8-digit plates and different labels', () => {
    const text8 = `
      דוח שווי רכב לוי יצחק
      הופק ב: 15/09/2026
      לוחית: 987-65-432
      דגם: טויוטה קורולה
      שנה: 2022
      רמת גימור: GLI
      עלייה לכביש: 10/2022
      מקוריות: ליסינג
      מד אוץ: 62,500
      מספר בעלויות: 2
      מחיר מחירון בסיסי: 110,000
      שווי משוקלל: 103,400
    `;
    const p8 = parseLeviYitzhakText(text8);
    expect(p8.plate).toBe('987-65-432');
    expect(p8.carMake).toBe('טויוטה');
    expect(p8.carModel).toBe('קורולה');
    expect(p8.carYear).toBe('2022');
    expect(p8.ramatGimur).toBe('GLI');
    expect(p8.roadDate).toBe('10/2022');
    expect(p8.ownershipType).toBe('ליסינג');
    expect(p8.mileage).toBe('62500');
    expect(p8.prevOwners).toBe('2');
    expect(p8.basicPrice).toBe('110000');
    expect(p8.weightedPrice).toBe('103400');
    expect(p8.valuationDate).toBe('15/09/2026');
  });
});
