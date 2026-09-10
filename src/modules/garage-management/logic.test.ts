import { describe, expect, it } from 'vitest';
import { nextCaseNumber, quoteTotals } from './logic';
import { createInitialState } from './seed';

describe('garage-management demo logic', () => {
  it('increments case numbers from seeded work', () => {
    const state = createInitialState();
    expect(nextCaseNumber(state.cases)).toBe('1055');
  });

  it('splits works and supplied parts, then adds 18% VAT', () => {
    const c = createInitialState().cases[0];
    const t = quoteTotals(c);
    expect(t.works).toBe(2350);
    expect(t.parts).toBe(1250);
    expect(t.vat).toBe(648);
    expect(t.total).toBe(4248);
  });

  it('does not charge parts the customer supplies', () => {
    const t = quoteTotals({
      works: [],
      partsLines: [
        { id: '1', name: 'a', sku: '', qty: 1, price: 100, supplier: 'us' },
        { id: '2', name: 'b', sku: '', qty: 1, price: 500, supplier: 'customer' },
      ],
    });
    expect(t.parts).toBe(100);
    expect(t.subtotal).toBe(100);
  });
});
