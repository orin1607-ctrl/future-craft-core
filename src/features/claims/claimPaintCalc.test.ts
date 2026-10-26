import { describe, it, expect } from 'vitest';
import type { PaintCalcData } from './claimPaintCalc';

describe('Paint Calculator Formula Integrity', () => {
  it('correctly calculates base hours, labor cost, materials and VAT', () => {
    const hourRate = 380;
    const materialPercent = 38;
    const vatPercent = 18;
    const generalHours = 2; // 2 * 380 = 760

    // Part: כנף קדמית, Group B base = 1.90, full repair 100% + 1 extra hour
    const baseHours = 1.90;
    const percent = 100;
    const extraHours = 1.0;
    const finalHours = baseHours * (percent / 100) + extraHours; // 2.90
    const partPrice = finalHours * hourRate; // 2.90 * 380 = 1102

    const totalBaseHours = baseHours; // 1.90
    const totalFinalHours = finalHours + generalHours; // 2.90 + 2 = 4.90
    const generalHoursCost = generalHours * hourRate; // 760
    const laborCost = partPrice + generalHoursCost; // 1102 + 760 = 1862
    const materialsCost = Math.round((laborCost * (materialPercent / 100) + Number.EPSILON) * 100) / 100; // 1862 * 0.38 = 707.56
    const subtotal = laborCost + materialsCost; // 2569.56
    const vatAmount = Math.round((subtotal * (vatPercent / 100) + Number.EPSILON) * 100) / 100; // 462.5208 -> 462.52
    const total = Math.round((subtotal + vatAmount + Number.EPSILON) * 100) / 100; // 3032.08

    expect(totalFinalHours).toBe(4.90);
    expect(laborCost).toBe(1862);
    expect(materialsCost).toBe(707.56);
    expect(vatAmount).toBe(462.52);
    expect(total).toBe(3032.08);
  });
});
