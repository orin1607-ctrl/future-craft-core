import { describe, expect, it } from 'vitest';
import {
  ACCIDENT_INVESTIGATION_SAVE_ENABLED,
  DRIVER_FAULT_DEFAULT,
  DRIVER_FAULT_OPTIONS,
  INVESTIGATION_DONE_DEFAULT,
  INVESTIGATION_DONE_OPTIONS,
  accidentUpdatePayload,
} from './accidentFormSave';

const base = {
  originalDate: '2026-10-15T22:07:45.000Z',
  accidentDate: '2026-10-16',
  accidentTime: '01:07',
  vehiclePlate: 'DUMMY-1',
  driverName: 'נהג דמה',
  location: 'מגרש בדיקות',
  description: 'תיאור מקורי',
  hasInsurance: true,
  thirdParty: false,
  estimatedCost: '120',
  claimNumber: 'DUMMY-CLAIM',
  notes: 'הערה קיימת',
  imageUrls: [],
};

describe('accident form save', () => {
  it('does not rewrite the date when only another field changes', () => {
    const payload = accidentUpdatePayload({ ...base, notes: 'הערה חדשה' });
    expect(payload.notes).toBe('הערה חדשה');
    expect(payload.description).toBe('תיאור מקורי');
    expect(payload).not.toHaveProperty('date');
  });

  it('writes the date without clearing the other fields', () => {
    const payload = accidentUpdatePayload({ ...base, accidentTime: '02:15' });
    expect(payload.date).toBe('2026-10-15T23:15:00.000Z');
    expect(payload.notes).toBe('הערה קיימת');
    expect(payload.claim_number).toBe('DUMMY-CLAIM');
  });

  it('keeps investigation answers out of the payload', () => {
    expect(ACCIDENT_INVESTIGATION_SAVE_ENABLED).toBe(false);
    expect(DRIVER_FAULT_DEFAULT).toBe('undetermined');
    expect(INVESTIGATION_DONE_DEFAULT).toBe('not_done');
    expect(DRIVER_FAULT_OPTIONS.map((option) => option.label)).toEqual(['טרם נקבע', 'כן', 'לא']);
    expect(INVESTIGATION_DONE_OPTIONS.map((option) => option.label)).toEqual(['טרם בוצע', 'כן', 'לא']);
    const payload = accidentUpdatePayload(base);
    expect(payload).not.toHaveProperty('driver_at_fault');
    expect(payload).not.toHaveProperty('investigation_done');
    expect(payload).not.toHaveProperty('investigation_conclusions');
    expect(payload.notes).toBe('הערה קיימת');
  });
});
