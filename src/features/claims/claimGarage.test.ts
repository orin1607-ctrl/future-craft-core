import { describe, expect, it } from 'vitest';
import { garageStatusLabel, isGaragePhoto, publicGarageClaimFields } from './claimGarage';

describe('claimGarage', () => {
  it('labels assignment statuses', () => {
    expect(garageStatusLabel('pending')).toBe('ממתין לצילום');
    expect(garageStatusLabel('in_progress')).toBe('צילום בתהליך');
    expect(garageStatusLabel('completed')).toBe('צילום הושלם');
    expect(garageStatusLabel('')).toBe('לא שויך');
  });

  it('recognizes garage_photos classification only', () => {
    expect(isGaragePhoto({ doc_kind: 'garage_photo' })).toBe(true);
    expect(isGaragePhoto({ doc_meta: { staff_type: 'garage_photos' } })).toBe(true);
    expect(isGaragePhoto({ doc_kind: 'surveyor_photo' })).toBe(false);
    expect(isGaragePhoto({ doc_meta: { staff_type: 'damage_photos' } })).toBe(false);
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
