import { describe, expect, it } from 'vitest';
import { emptyGarageGallery, GARAGE_MEDIA_CATEGORIES, garageMediaObjectPath, garageMediaPathCaseId } from './garageMedia';

describe('garage media contract', () => {
  it('keeps gallery categories keyed by garage_case_id and never claim_id', () => {
    expect(GARAGE_MEDIA_CATEGORIES.map((c) => c.label)).toContain('קבלת רכב');
    expect(GARAGE_MEDIA_CATEGORIES.map((c) => c.label)).toContain('תמונות להצעת מחיר');
    expect(GARAGE_MEDIA_CATEGORIES.map((c) => c.label)).toContain('תמונות קבלת רכב');
    expect(GARAGE_MEDIA_CATEGORIES.map((c) => c.label)).toContain('מסירה');
    const empty = emptyGarageGallery('case-1');
    expect(empty.angles).toEqual([]);
    expect(JSON.stringify(empty)).not.toContain('claim_id');
  });

  it('stores objects under garage_case_id/category, never claims-docs', () => {
    const path = garageMediaObjectPath({
      garageCaseId: 'case-abc',
      category: 'angles',
      fileName: 'front.jpg',
      mimeType: 'image/jpeg',
      id: 'media-1',
    });
    expect(path).toBe('case-abc/angles/media-1.jpg');
    expect(path).not.toContain('claims-docs');
    expect(path).not.toContain('claim_id');
  });

  it('exposes the case UUID as the first storage path segment for tenant Storage policies', () => {
    const caseId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const path = garageMediaObjectPath({
      garageCaseId: caseId,
      category: 'finish',
      fileName: 'rear.png',
      mimeType: 'image/png',
      id: 'media-9',
    });
    expect(garageMediaPathCaseId(path)).toBe(caseId);
    expect(garageMediaPathCaseId('other-shop-case/intake/x.jpg')).toBe('other-shop-case');
    expect(garageMediaPathCaseId('')).toBe('');
  });
});
