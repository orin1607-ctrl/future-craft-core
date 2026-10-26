import { describe, expect, it } from 'vitest';
import {
  applyInvoiceMatches,
  applyPaintCalc,
  claimSnapshotOf,
  computeTotals,
  matchInvoiceLines,
  newPartLine,
  newQuoteData,
  newWorkLine,
  normalizeQuoteData,
  parseInvoiceText,
  swapSide,
  workPricing,
  PAINT_MATERIALS_NAME,
} from './claimQuoteModel';
import type { PaintCalcData } from './claimPaintCalc';

const claim = { id: 'CLM-1', clientName: 'יוסי כהן', plate: '12-345-67', carMake: 'טויוטה', carModel: 'קורולה', claimNum: '998877', insCompany: 'הראל' };

function paint(labor: number, materials: number): PaintCalcData {
  return { laborCost: labor, materialsCost: materials, adjustedHours: labor / 380, total: (labor + materials) * 1.18 } as PaintCalcData;
}

describe('claim quote model', () => {
  it('pulls customer and vehicle details from the claim', () => {
    expect(claimSnapshotOf(claim)).toMatchObject({ clientName: 'יוסי כהן', plate: '12-345-67', carMake: 'טויוטה', carModel: 'קורולה', claimNum: '998877', insCompany: 'הראל' });
    const d = newQuoteData(claim);
    expect(d.categories).toEqual(['body', 'paint', 'mech']);
    expect(d.hourRate).toBe(380);
    expect(d.parts).toHaveLength(1);
  });

  it('prices by hours and by a global price in the same quote, with discounts and 18% VAT', () => {
    const d = newQuoteData(claim);
    d.works = [
      newWorkLine('body', 'החלפת כנף קדמית שמאל', 380, { hours: 2.5 }),
      newWorkLine('mech', 'פירוק והרכבה', 380, { pricing: 'global', globalPrice: 1000, discountType: 'percent', discountValue: 10 }),
      newWorkLine('alignment', 'כיוון פרונט', 380, { pricing: 'global', globalPrice: 250, discountType: 'amount', discountValue: 50 }),
    ];
    d.parts = [
      newPartLine({ name: 'כנף קדמית', qty: 1, unitGross: 1200, unitNet: 800 }),
      newPartLine({ name: 'פנס', qty: 2, unitGross: 300, unitNet: 200, discountType: 'amount', discountValue: 100 }),
      newPartLine({ name: 'לא כלול', qty: 1, unitGross: 999, unitNet: 500, included: false }),
    ];
    expect(workPricing(d.works[0]).final).toBe(950);
    const t = computeTotals(d);
    expect(t.body).toBe(950);
    expect(t.mech).toBe(1000);
    expect(t.extras).toBe(250);
    expect(t.parts).toBe(1800);
    expect(t.beforeDiscounts).toBe(4000);
    expect(t.discounts).toBe(250);
    expect(t.afterDiscounts).toBe(3750);
    expect(t.vat).toBe(675);
    expect(t.total).toBe(4425);
    expect(t.internal.supplierNetCost).toBe(1200);
    expect(t.internal.partsMargin).toBe(1700 - 1200);
    expect(t.internal.excludedPartsCount).toBe(1);
  });

  it('caps discounts at the line price', () => {
    const d = newQuoteData(claim);
    d.works = [newWorkLine('body', 'x', 380, { hours: 1, discountType: 'amount', discountValue: 5000 })];
    d.parts = [];
    expect(computeTotals(d).afterDiscounts).toBe(0);
  });

  it('splits the paint calculation into paint work and a separate paint-materials line, without double counting', () => {
    let d = newQuoteData(claim);
    d = applyPaintCalc(d, paint(3800, 1330), { id: 'pc1', version: 1 });
    expect(d.works.filter((w) => w.category === 'paint')).toHaveLength(1);
    expect(d.works[0].globalPrice).toBe(3800);
    const mats = d.parts.filter((p) => p.name === PAINT_MATERIALS_NAME);
    expect(mats).toHaveLength(1);
    expect(mats[0].unitGross).toBe(1330);
    let t = computeTotals(d);
    expect(t.paint).toBe(3800);
    expect(t.parts).toBe(1330);
    // Applying an updated calculation replaces the previous lines.
    d = applyPaintCalc(d, paint(4560, 1600), { id: 'pc2', version: 2 });
    t = computeTotals(d);
    expect(d.works.filter((w) => w.source === 'paint_calc')).toHaveLength(1);
    expect(d.parts.filter((p) => p.source === 'paint_materials')).toHaveLength(1);
    expect(t.paint).toBe(4560);
    expect(t.parts).toBe(1600);
    expect(d.paintCalcRef?.version).toBe(2);
  });

  it('reads invoice lines and matches them by SKU, showing differences without applying them', () => {
    const text = [
      'חשבונית מס 1234',
      'PARTS INVOICE 5521 E2E',
      'Vehicle 77231670 Claim 90231670',
      'רכב 12-345-67 תביעה 998877',
      'Mystery item 99999999.00',
      'Border trim 2 45.00',
      'כנף קדמית שמאל 53812-02B30 1 1450.00 1100.00',
      'פנס ראשי ימין 81110-0Z510 2 900.00 15%',
      'סה"כ 3250.00',
    ].join('\n');
    const all = parseInvoiceText(text);
    // Header lines are skipped; a part whose name merely contains "order" is kept.
    expect(all.map((l) => l.name)).toEqual(['Border trim', 'כנף קדמית שמאל', 'פנס ראשי ימין']);
    expect(all[0]).toMatchObject({ qty: 2, gross: 45 });
    const lines = all.slice(1);
    expect(lines[0]).toMatchObject({ sku: '53812-02B30', qty: 1, gross: 1450, net: 1100 });
    expect(lines[1]).toMatchObject({ sku: '81110-0Z510', qty: 2, gross: 900, net: 765, supplierDiscountPct: 15 });

    const parts = [newPartLine({ name: 'כנף קדמית', sku: '53812-02B30', qty: 1, unitGross: 1400 })];
    const m = matchInvoiceLines(parts, lines);
    expect(m[0].kind).toBe('changed');
    expect(m[1].kind).toBe('new');
    // Nothing changed until the user approves.
    expect(parts[0].unitGross).toBe(1400);

    const d = { ...newQuoteData(claim), parts };
    const next = applyInvoiceMatches(d, { docId: 'CDM-1', fileName: 'inv.pdf' }, [m[1]]);
    expect(next.parts).toHaveLength(2);
    expect(next.parts[0].unitGross).toBe(1400);
    expect(next.parts[1]).toMatchObject({ sku: '81110-0Z510', invoiceDocId: 'CDM-1', unitNet: 765 });
    const approvedAll = applyInvoiceMatches(d, { docId: 'CDM-1', fileName: 'inv.pdf' }, m);
    expect(approvedAll.parts[0]).toMatchObject({ unitGross: 1450, unitNet: 1100, invoiceDocId: 'CDM-1' });
  });

  it('drops the empty starter part row once invoice parts are added', () => {
    const d = newQuoteData(claim);
    const next = applyInvoiceMatches(d, { docId: 'D', fileName: 'f' }, [{ kind: 'new', line: { name: 'צמיג', sku: '', qty: 4, gross: 400, net: 300, supplierDiscountPct: 0 } }]);
    expect(next.parts).toHaveLength(1);
    expect(next.parts[0].name).toBe('צמיג');
  });

  it('swaps left and right sides', () => {
    expect(swapSide('החלפת כנף קדמית שמאל')).toBe('החלפת כנף קדמית ימין');
    expect(swapSide('מתיחת דופן קדמית ימין')).toBe('מתיחת דופן קדמית שמאל');
  });

  it('keeps stored values when normalising an older quote and always shows core categories', () => {
    const d = normalizeQuoteData({ works: [newWorkLine('electric', 'חשמל', 380, { hours: 1 })], categories: ['electric'], notes: 'שלום' }, claim);
    expect(d.categories).toEqual(['body', 'paint', 'mech', 'electric']);
    expect(d.notes).toBe('שלום');
    expect(d.parts).toEqual([]);
  });
});
