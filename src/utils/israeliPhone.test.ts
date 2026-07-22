import { describe, expect, it } from 'vitest';
import {
  buildWaMeUrl,
  hasWhatsAppPhone,
  normalizeIsraeliPhoneForWhatsApp,
} from './israeliPhone';

describe('normalizeIsraeliPhoneForWhatsApp', () => {
  it('normalizes common Israeli mobile formats to 9725XXXXXXXX', () => {
    expect(normalizeIsraeliPhoneForWhatsApp('0541234567')).toBe('972541234567');
    expect(normalizeIsraeliPhoneForWhatsApp('054-1234567')).toBe('972541234567');
    expect(normalizeIsraeliPhoneForWhatsApp('054-123-4567')).toBe('972541234567');
    expect(normalizeIsraeliPhoneForWhatsApp('972541234567')).toBe('972541234567');
    expect(normalizeIsraeliPhoneForWhatsApp('+972541234567')).toBe('972541234567');
    expect(normalizeIsraeliPhoneForWhatsApp('+972 54-123-4567')).toBe('972541234567');
    expect(normalizeIsraeliPhoneForWhatsApp('972-54-1234567')).toBe('972541234567');
    expect(normalizeIsraeliPhoneForWhatsApp('54 123 4567')).toBe('972541234567');
    expect(normalizeIsraeliPhoneForWhatsApp('  054 123 4567  ')).toBe('972541234567');
    expect(normalizeIsraeliPhoneForWhatsApp('9720541234567')).toBe('972541234567');
    expect(normalizeIsraeliPhoneForWhatsApp('00972541234567')).toBe('972541234567');
  });

  it('rejects empty / invalid values', () => {
    expect(normalizeIsraeliPhoneForWhatsApp('')).toBeNull();
    expect(normalizeIsraeliPhoneForWhatsApp(null)).toBeNull();
    expect(normalizeIsraeliPhoneForWhatsApp(undefined)).toBeNull();
    expect(normalizeIsraeliPhoneForWhatsApp('123')).toBeNull();
    expect(normalizeIsraeliPhoneForWhatsApp('031234567')).toBeNull(); // landline
    expect(normalizeIsraeliPhoneForWhatsApp('abc')).toBeNull();
  });
});

describe('buildWaMeUrl', () => {
  it('builds a direct chat URL', () => {
    const url = buildWaMeUrl('054-1234567', 'שלום');
    expect(url).toBe(`https://wa.me/972541234567?text=${encodeURIComponent('שלום')}`);
  });

  it('returns null when phone is invalid', () => {
    expect(buildWaMeUrl('', 'x')).toBeNull();
    expect(hasWhatsAppPhone('0541234567')).toBe(true);
    expect(hasWhatsAppPhone('')).toBe(false);
  });
});
