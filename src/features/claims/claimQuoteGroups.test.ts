import { describe, expect, it } from 'vitest';
import {
  MATERIALS_GROUP,
  PARTS_GROUP,
  applyInvoiceMatches,
  applyPaintCalc,
  categoryLabel,
  computeTotals,
  customDomainKey,
  invoiceClaimCheck,
  libraryWorkCategory,
  newPartLine,
  newQuoteData,
  newWorkLine,
  normalizeQuoteData,
  paintSyncAction,
  partGroupOf,
  partGroupsOf,
  splitLibraryWorkCategory,
  workGroupsOf,
} from './claimQuoteModel';
import { buildQuoteReport, quoteReportTotals } from './claimQuoteReport';
import type { PaintCalcData } from './claimPaintCalc';

const claim = { id: 'C1', clientName: 'דנה', plate: '12-345-67', claimNum: '5551234' };
const paint = (labor: number, materials: number) => ({ laborCost: labor, materialsCost: materials, adjustedHours: 2 }) as PaintCalcData;

describe('work areas, categories and items', () => {
  it('names custom areas and stores categories as area::category in the library', () => {
    const key = customDomainKey('עבודות חשמל מתקדמות');
    expect(categoryLabel(key)).toBe('עבודות חשמל מתקדמות');
    expect(libraryWorkCategory(key, 'חיווט')).toBe(`${key}::חיווט`);
    expect(splitLibraryWorkCategory(`${key}::חיווט`)).toEqual({ domain: key, group: 'חיווט' });
    expect(splitLibraryWorkCategory('body')).toEqual({ domain: 'body', group: '' });
  });

  it('lists categories inside an area: general first, then added ones, then ones used by lines', () => {
    const d = newQuoteData(claim);
    d.workGroups = { body: ['חזית'] };
    d.works = [newWorkLine('body', 'x', 380, { group: 'צד שמאל' })];
    expect(workGroupsOf(d, 'body')).toEqual(['', 'חזית', 'צד שמאל']);
  });

  it('counts custom areas in "other works" and keeps the total', () => {
    const d = newQuoteData(claim);
    d.parts = [];
    d.works = [newWorkLine(customDomainKey('ריפוד'), 'תפירת מושב', 380, { pricing: 'global', globalPrice: 500 })];
    const t = computeTotals(d);
    expect(t.extras).toBe(500);
    expect(t.total).toBe(590);
  });
});

describe('parts categories', () => {
  it('always shows חלקים first and the fixed חומרים last', () => {
    const d = newQuoteData(claim);
    expect(partGroupsOf(d)).toEqual([PARTS_GROUP, MATERIALS_GROUP]);
    d.partGroups = ['צמיגים'];
    d.parts.push(newPartLine({ name: 'נורה', group: 'חשמל' }));
    expect(partGroupsOf(d)).toEqual([PARTS_GROUP, 'צמיגים', 'חשמל', MATERIALS_GROUP]);
  });

  it('puts older material-type lines and paint materials in חומרים', () => {
    expect(partGroupOf({ partType: 'material' })).toBe(MATERIALS_GROUP);
    expect(partGroupOf({ partType: 'new_original' })).toBe(PARTS_GROUP);
    const d = applyPaintCalc(newQuoteData(claim), paint(1000, 300), { id: 'p1', version: 1 });
    expect(d.parts.filter((p) => partGroupOf(p) === MATERIALS_GROUP)).toHaveLength(1);
  });

  it('adds approved invoice lines to the chosen category', () => {
    const d = newQuoteData(claim);
    const next = applyInvoiceMatches(d, { docId: 'D1', fileName: 'inv.pdf' }, [{ kind: 'new', line: { name: 'צמיג 205/55', sku: 'TY-205', qty: 4, gross: 400, net: 300, supplierDiscountPct: 0 } }], 'צמיגים');
    expect(next.parts[0]).toMatchObject({ group: 'צמיגים', unitNet: 300, unitGross: 400, invoiceDocId: 'D1' });
  });

  it('reads older stored quotes without the new fields', () => {
    const d = normalizeQuoteData({ parts: [newPartLine({ name: 'x' })] } as never, claim);
    expect(d.workGroups).toEqual({});
    expect(d.partGroups).toEqual([]);
    expect(d.ignoredInvoiceDocs).toEqual([]);
  });
});

describe('automatic paint sync', () => {
  it('applies when the quote has no paint lines and updates when a newer calculation exists', () => {
    const d = newQuoteData(claim);
    expect(paintSyncAction(d, null)).toBe('none');
    expect(paintSyncAction(d, { id: 'p1', version: 1, laborCost: 1000, materialsCost: 300 })).toBe('apply');
    const applied = applyPaintCalc(d, paint(1000, 300), { id: 'p1', version: 1 });
    expect(paintSyncAction(applied, { id: 'p1', version: 1, laborCost: 1000, materialsCost: 300 })).toBe('none');
    expect(paintSyncAction(applied, { id: 'p2', version: 2, laborCost: 1200, materialsCost: 350 })).toBe('update');
    const updated = applyPaintCalc(applied, paint(1200, 350), { id: 'p2', version: 2 });
    expect(updated.works.filter((w) => w.source === 'paint_calc')).toHaveLength(1);
    expect(updated.parts.filter((p) => p.source === 'paint_materials')).toHaveLength(1);
    expect(computeTotals(updated).paint).toBe(1200);
  });

  it('does not go back to an older calculation', () => {
    const applied = applyPaintCalc(newQuoteData(claim), paint(1200, 350), { id: 'p2', version: 2 });
    expect(paintSyncAction(applied, { id: 'p1', version: 1, laborCost: 1000, materialsCost: 300 })).toBe('none');
  });
});

describe('which claim an invoice belongs to', () => {
  const me = { id: 'C1', plate: '12-345-67', claimNum: '5551234', clientName: 'דנה' };
  const other = { id: 'C2', plate: '98-765-43', claimNum: '7779999', clientName: 'יוסי' };
  it('matches by plate or claim number', () => {
    expect(invoiceClaimCheck('רכב 1234567 פנס 900', me, [me, other]).status).toBe('match');
    expect(invoiceClaimCheck('Claim 5551234', me, [me, other]).status).toBe('match');
  });
  it('flags an invoice that names another claim', () => {
    const r = invoiceClaimCheck('Vehicle 98-765-43 headlamp', me, [me, other]);
    expect(r.status).toBe('other');
    expect(r.otherClaims.map((c) => c.id)).toEqual(['C2']);
  });
  it('says unknown when no plate or claim number appears', () => {
    expect(invoiceClaimCheck('Front fender 1 1450.00', me, [me, other]).status).toBe('unknown');
  });
});

describe('invoices & quotes report', () => {
  const claims = [
    { id: 'C1', clientName: 'דנה', plate: '12-345-67', claimNum: '5551234' },
    { id: 'C2', clientName: 'יוסי', plate: '98-765-43', claimNum: '7779999' },
  ];
  const mk = (claimId: string, parts: ReturnType<typeof newPartLine>[], invoices: Array<{ docId: string }>) => ({
    id: `Q-${claimId}`,
    claim_id: claimId,
    quote_no: 1,
    version: 1,
    updated_at: '2026-10-26T10:00:00Z',
    data: { ...newQuoteData({ id: claimId }), parts, invoices: invoices.map((i) => ({ ...i, sha: i.docId, fileName: `${i.docId}.pdf`, uploadedAt: '', readSource: 'pdf_text' as const, lines: [] })) },
  });

  it('keeps each claim separate and shows supplier cost, sale and difference', () => {
    const rows = buildQuoteReport([
      mk('C1', [newPartLine({ name: 'כנף', qty: 1, unitGross: 1450, unitNet: 1100, invoiceDocId: 'D1' }), newPartLine({ name: 'פנס', qty: 2, unitGross: 300, unitNet: 200, discountType: 'amount', discountValue: 100 })], [{ docId: 'D1' }, { docId: 'D1' }]),
      mk('C2', [newPartLine({ name: 'צמיג', qty: 4, unitGross: 400, unitNet: 300 }), newPartLine({ name: 'לא כלול', qty: 1, unitGross: 999, unitNet: 500, included: false })], []),
      mk('GONE', [newPartLine({ name: 'x', qty: 1, unitGross: 1, unitNet: 1 })], []),
    ], claims);
    expect(rows.map((r) => r.claimId).sort()).toEqual(['C1', 'C2']);
    const c1 = rows.find((r) => r.claimId === 'C1')!;
    expect(c1.supplierCost).toBe(1500);
    expect(c1.sale).toBe(1950);
    expect(c1.diff).toBe(450);
    expect(c1.invoices).toHaveLength(1);
    expect(c1.invoices[0].linkedParts).toBe(1);
    const c2 = rows.find((r) => r.claimId === 'C2')!;
    expect(c2.supplierCost).toBe(1200);
    expect(c2.sale).toBe(1600);
    expect(c2.parts.find((p) => p.name === 'לא כלול')?.sale).toBe(0);
    const t = quoteReportTotals(rows);
    expect(t).toMatchObject({ claims: 2, quotes: 2, invoices: 1, supplierCost: 2700, sale: 3550, diff: 850 });
  });

  it('skips quotes that were never saved', () => {
    const q = { ...mk('C1', [], []), version: 0 };
    expect(buildQuoteReport([q], claims)).toEqual([]);
  });
});

describe('typing prices and hours', () => {
  it('keeps what a person types, with . or , as the decimal point', async () => {
    const { cleanNumericInput, parseNumericInput } = await import('./claimQuoteModel');
    const typed = (s: string) => {
      let box = '';
      for (const ch of s) box = cleanNumericInput(box + ch);
      return { box, value: parseNumericInput(box) };
    };
    expect(typed('2,5')).toEqual({ box: '2.5', value: 2.5 });
    expect(typed('0')).toEqual({ box: '0', value: 0 });
    expect(typed('0.5')).toEqual({ box: '0.5', value: 0.5 });
    expect(typed('2.')).toEqual({ box: '2.', value: 2 });
    expect(typed('1250.50')).toEqual({ box: '1250.50', value: 1250.5 });
    expect(typed('1.2.3')).toEqual({ box: '1.23', value: 1.23 });
    expect(typed('₪ 380')).toEqual({ box: '380', value: 380 });
    expect(typed('.')).toEqual({ box: '.', value: 0 });
    expect(typed('')).toEqual({ box: '', value: 0 });
  });
});
