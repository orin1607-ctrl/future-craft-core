import { describe, expect, it } from 'vitest';
import { formatGarageReviewedAt, garagePhotosOf, garageReviewLabel, garageShareIdsAllowed, garageStatusLabel, garageWorkerReviewLabel, isGarageAwaitingReview, isGaragePhoto, publicGarageClaimFields } from './claimGarage';

describe('claimGarage', () => {
  it('labels assignment statuses', () => {
    expect(garageStatusLabel('pending')).toBe('ממתין לצילום');
    expect(garageStatusLabel('in_progress')).toBe('צילום בתהליך');
    expect(garageStatusLabel('completed')).toBe('צילום הושלם');
    expect(garageStatusLabel('')).toBe('לא שויך');
  });

  it('labels review statuses without touching document workflow', () => {
    expect(garageReviewLabel('awaiting_review')).toBe('התקבל — לבדיקה');
    expect(garageReviewLabel('approved')).toBe('אושר');
    expect(garageReviewLabel('needs_update')).toBe('נדרש להשלים');
    expect(garageReviewLabel('')).toBe('');
    expect(garageWorkerReviewLabel('awaiting_review')).toBe('נשלח לבדיקה');
    expect(garageWorkerReviewLabel('needs_update')).toBe('נדרש להשלים');
    expect(isGarageAwaitingReview('awaiting_review')).toBe(true);
    expect(isGarageAwaitingReview('')).toBe(false);
    expect(formatGarageReviewedAt('2026-09-09T12:00:00.000Z')).toMatch(/2026|09/);
  });

  it('recognizes garage_photos classification only', () => {
    expect(isGaragePhoto({ doc_kind: 'garage_photo' })).toBe(true);
    expect(isGaragePhoto({ doc_meta: { staff_type: 'garage_photos' } })).toBe(true);
    expect(isGaragePhoto({ doc_kind: 'surveyor_photo' })).toBe(false);
    expect(isGaragePhoto({ doc_meta: { staff_type: 'damage_photos' } })).toBe(false);
    expect(garagePhotosOf([
      { id: 'g', doc_kind: 'garage_photo' },
      { id: 's', doc_kind: 'surveyor_photo' },
    ]).map((f) => f.id)).toEqual(['g']);
    expect(garageShareIdsAllowed(['g'], [{ id: 'g', claim_id: 'C1' }, { id: 'x', claim_id: 'C1' }], 'C1').ok).toBe(true);
    expect(garageShareIdsAllowed(['g', 'other'], [{ id: 'g', claim_id: 'C1' }], 'C1').ok).toBe(false);
    expect(garageShareIdsAllowed(['g'], [{ id: 'g', claim_id: 'C2' }], 'C1').ok).toBe(false);
  });

  it('exposes only public claim fields', () => {
    const pub = publicGarageClaimFields({
      id: 'DAL-1',
      client_name: 'ישראל',
      plate: '12-345-67',
      row_data: {
        clientName: 'ישראל',
        plate: '12-345-67',
        carModel: 'קורולה',
        garageName: 'מוסך אור',
        eventDate: '2026-09-01',
        notes: 'secret',
        lastStatusNote: 'internal',
      },
    });
    expect(pub).toEqual({
      id: 'DAL-1',
      client_name: 'ישראל',
      plate: '12-345-67',
      car_model: 'קורולה',
      garage_name: 'מוסך אור',
      event_date: '2026-09-01',
    });
    expect(JSON.stringify(pub)).not.toMatch(/secret|internal|notes/);
  });
});
