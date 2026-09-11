import { describe, expect, it } from 'vitest';
import { emptyGarageGallery, GARAGE_MEDIA_CATEGORIES } from './garageMedia';

describe('garage media contract', () => {
  it('keeps gallery categories keyed by garage_case_id and never claim_id', () => {
    expect(GARAGE_MEDIA_CATEGORIES.map((c) => c.label)).toContain('4 זוויות');
    expect(GARAGE_MEDIA_CATEGORIES.map((c) => c.label)).toContain('לפני מסירה');
    const empty = emptyGarageGallery('case-1');
    expect(empty.angles).toEqual([]);
    expect(JSON.stringify(empty)).not.toContain('claim_id');
  });
});
