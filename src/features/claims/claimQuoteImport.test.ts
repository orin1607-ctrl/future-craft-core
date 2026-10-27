import { describe, expect, it } from 'vitest';
import { applyPaintCalc, newQuoteData, newWorkLine, partPricing, workPricing } from './claimQuoteModel';
import type { PaintCalcData } from './claimPaintCalc';
import { mergeClaimQuoteImport, parseClaimQuoteText } from './claimQuoteImport';

const SAMPLE = `מחיר שעת עבודה: 400 ₪.
עבודות:
- פירוק והרכבת פגוש קדמי — 3 שעות — 1,200 ₪ — הנחה 10% — מחיר סופי 1,080 ₪.
- פחחות דלת קדמית שמאל — מחיר ידני 1,500 ₪.
- יישור דופן שמאל — מחיר ידני 600 ₪.
חלקים:
- פנס ראשי שמאל — כמות 1 — מחיר 900 ₪.
- ביטנה קדמית שמאל — כמות 1 — מחיר 350 ₪.`;

const claim = { clientName: 'בדיקה', plate: '11-111-11' };

function paint(): PaintCalcData {
  return { laborCost: 2500, materialsCost: 800, adjustedHours: 6, total: 3300 } as PaintCalcData;
}

describe('claim quote import', () => {
  it('reads the sample paste into works, hours, manual prices and parts', () => {
    const parsed = parseClaimQuoteText(SAMPLE);
    expect(parsed.hourRate).toBe(400);
    expect(parsed.works.map((w) => w.label)).toEqual([
      'פירוק והרכבת פגוש קדמי',
      'פחחות דלת קדמית שמאל',
      'יישור דופן שמאל',
    ]);
    expect(parsed.works[0]).toMatchObject({ pricing: 'hours', hours: 3, discountType: 'percent', discountValue: 10, category: 'body' });
    expect(parsed.works[1]).toMatchObject({ pricing: 'global', price: 1500 });
    expect(parsed.works[2]).toMatchObject({ pricing: 'global', price: 600 });
    expect(parsed.parts).toEqual([
      { name: 'פנס ראשי שמאל', qty: 1, unitGross: 900, discountType: 'none', discountValue: 0 },
      { name: 'ביטנה קדמית שמאל', qty: 1, unitGross: 350, discountType: 'none', discountValue: 0 },
    ]);
  });

  it('adds rows beside an existing line and leaves the paint calculator untouched', () => {
    const base = applyPaintCalc(newQuoteData(claim), paint(), { id: 'paint-1', version: 2 });
    base.works.unshift(newWorkLine('body', 'החלפת מראה', 380, { pricing: 'hours', hours: 2, hourRate: 380 }));
    const paintWork = base.works.find((w) => w.source === 'paint_calc')!;
    const paintPart = base.parts.find((p) => p.source === 'paint_materials')!;
    const { next, changes } = mergeClaimQuoteImport(base, parseClaimQuoteText(SAMPLE));

    expect(next.hourRate).toBe(400);
    expect(next.works.find((w) => w.label === 'החלפת מראה')).toMatchObject({ hours: 2, hourRate: 400, pricing: 'hours' });
    const keptPaint = next.works.find((w) => w.source === 'paint_calc')!;
    expect(keptPaint.id).toBe(paintWork.id);
    expect(keptPaint.globalPrice).toBe(2500);
    expect(next.works.filter((w) => w.source === 'paint_calc')).toHaveLength(1);
    const keptMat = next.parts.find((p) => p.source === 'paint_materials')!;
    expect(keptMat.id).toBe(paintPart.id);
    expect(keptMat.unitGross).toBe(800);
    expect(next.parts.filter((p) => p.source === 'paint_materials')).toHaveLength(1);

    const bumper = next.works.find((w) => w.label === 'פירוק והרכבת פגוש קדמי')!;
    expect(workPricing(bumper).final).toBe(1080);
    expect(workPricing(next.works.find((w) => w.label === 'פחחות דלת קדמית שמאל')!).final).toBe(1500);
    expect(partPricing(next.parts.find((p) => p.name === 'פנס ראשי שמאל')!).final).toBe(900);
    expect(changes.some((c) => c.action === 'keep' && c.kind === 'paint')).toBe(true);
    expect(next.works.filter((w) => w.label === 'פירוק והרכבת פגוש קדמי')).toHaveLength(1);
  });

  it('updates the same row on a second import and does not copy a paint line from the text', () => {
    const first = mergeClaimQuoteImport(newQuoteData(claim), parseClaimQuoteText(SAMPLE)).next;
    const again = `מחיר שעת עבודה: 400 ₪.
עבודות:
- פירוק והרכבת פגוש קדמי — 4 שעות — הנחה 10%
- עבודת צבע לפי מחשבון הצבע — מחיר ידני 9,999 ₪.
חלקים:
- פנס ראשי שמאל — כמות 2 — מחיר 900 ₪.`;
    const { next } = mergeClaimQuoteImport(first, parseClaimQuoteText(again));
    const bumpers = next.works.filter((w) => w.label === 'פירוק והרכבת פגוש קדמי');
    expect(bumpers).toHaveLength(1);
    expect(bumpers[0].hours).toBe(4);
    expect(workPricing(bumpers[0]).original).toBe(1600);
    expect(next.works.some((w) => /9,999|9999/.test(String(w.globalPrice)) || w.label.includes('מחשבון'))).toBe(false);
    expect(next.parts.filter((p) => p.name === 'פנס ראשי שמאל')).toHaveLength(1);
    expect(next.parts.find((p) => p.name === 'פנס ראשי שמאל')!.qty).toBe(2);
    expect(next.works.some((w) => w.label === 'יישור דופן שמאל')).toBe(true);
  });

  it('reads a Word file and reports a real error when the text is missing', async () => {
    const { readQuoteFile } = await import('./claimQuoteImport');
    const xml = `<w:document><w:p><w:r><w:t>מחיר שעת עבודה: 400 ₪.</w:t></w:r></w:p><w:p><w:r><w:t>עבודות:</w:t></w:r></w:p><w:p><w:r><w:t>- פחחות דלת קדמית שמאל — מחיר ידני 1,500 ₪.</w:t></w:r></w:p></w:document>`;
    const name = new TextEncoder().encode('word/document.xml');
    const data = new TextEncoder().encode(xml);
    const local = new Uint8Array(30 + name.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const read = await readQuoteFile({ name: 'quote.docx', type: '', bytes: local });
    expect(read.error).toBe('');
    expect(parseClaimQuoteText(read.text).works[0]).toMatchObject({ label: 'פחחות דלת קדמית שמאל', price: 1500 });
    const bad = await readQuoteFile({ name: 'quote.docx', type: '', bytes: new Uint8Array([1, 2, 3]) });
    expect(bad.text).toBe('');
    expect(bad.error).toContain('quote.docx');
    expect(bad.error).not.toMatch(/נקרא בהצלחה/);
  });
});
