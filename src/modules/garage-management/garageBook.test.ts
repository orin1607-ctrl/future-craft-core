import { describe, expect, it } from 'vitest';
import {
  customerDisplayName,
  deriveCaseStatus,
  emptyCaseData,
  findDuplicateCustomers,
  isGarageSchemaMissing,
  normalizePhone,
  normalizePlate,
  sanitizeCaseData,
  vehicleLabel,
} from './garageBook';

describe('garage book helpers', () => {
  it('normalizes Israeli phones and plates', () => {
    expect(normalizePhone('050-123-4567')).toBe('0501234567');
    expect(normalizePhone('+972501234567')).toBe('0501234567');
    expect(normalizePlate('12-345-67')).toBe('1234567');
  });

  it('warns on duplicate phone / business id / name without merging', () => {
    const existing = [
      {
        id: '1',
        customer_number: 1281,
        customer_type: 'business' as const,
        name: '',
        company_name: 'חברת בדיקה בע"מ',
        phone: '03-9001234',
        second_phone: '',
        email: '',
        address: '',
        business_id: '512345678',
        contact_person: '',
        preferred_channel: '',
        notes: '',
      },
    ];
    expect(findDuplicateCustomers(existing, {
      customer_type: 'business',
      name: '',
      company_name: 'חברת בדיקה בע"מ',
      phone: '039001234',
      business_id: '',
    })).toHaveLength(1);
    expect(findDuplicateCustomers(existing, {
      customer_type: 'private',
      name: 'מישהו אחר',
      company_name: '',
      phone: '0500000000',
      business_id: '512345678',
    })).toHaveLength(1);
  });

  it('strips data URLs and base64 from case_data', () => {
    const cleaned = sanitizeCaseData({
      quoteCreated: true,
      signaturePng: 'data:image/png;base64,aaaa',
      photos: { fl: true, shot: 'data:image/jpeg;base64,bbbb' },
    });
    expect(cleaned.quoteCreated).toBe(true);
    expect((cleaned as { signaturePng?: string }).signaturePng).toBeUndefined();
    expect((cleaned.photos as { fl?: boolean }).fl).toBe(true);
    expect((cleaned.photos as { shot?: string }).shot).toBeUndefined();
  });

  it('derives status from flow flags', () => {
    expect(deriveCaseStatus(emptyCaseData())).toBe('בדיקת רכב');
    expect(deriveCaseStatus({ quoteCreated: true })).toBe('הצעה בהכנה');
    expect(deriveCaseStatus({ workFinished: true })).toBe('מוכן למסירה');
    expect(deriveCaseStatus({ caseClosed: true })).toBe('סגור');
  });

  it('builds display labels', () => {
    expect(customerDisplayName({ customer_type: 'private', name: 'ישראל', company_name: '' })).toBe('ישראל');
    expect(vehicleLabel({ make: 'Toyota', model: 'Corolla', year: 2021 })).toBe('Toyota · Corolla · 2021');
  });

  it('detects missing garage schema without treating it as a generic failure', () => {
    expect(isGarageSchemaMissing({ code: 'PGRST205', message: "Could not find the table 'public.garage_cases'" })).toBe(true);
    expect(isGarageSchemaMissing({ message: 'permission denied' })).toBe(false);
  });
});
