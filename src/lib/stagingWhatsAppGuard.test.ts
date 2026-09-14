import { describe, expect, it } from 'vitest';
import { isDriverEventWhatsAppAllowed, isStagingWhatsAppAllowed } from './stagingWhatsAppGuard';

describe('isStagingWhatsAppAllowed', () => {
  it('allows only the staging project ref', () => {
    expect(isStagingWhatsAppAllowed('https://usfeoerkpcafxxlyuldl.supabase.co')).toBe(true);
  });

  it('blocks both known production project refs', () => {
    expect(isStagingWhatsAppAllowed('https://qasomfndnjuixgjmjwcm.supabase.co')).toBe(false);
    expect(isStagingWhatsAppAllowed('https://kuenhflklivaxrmqbsee.supabase.co')).toBe(false);
  });

  it('blocks empty or unknown hosts', () => {
    expect(isStagingWhatsAppAllowed('')).toBe(false);
    expect(isStagingWhatsAppAllowed(undefined)).toBe(false);
  });
});

describe('isDriverEventWhatsAppAllowed', () => {
  it('allows only live Production qasomfndnjuixgjmjwcm', () => {
    expect(isDriverEventWhatsAppAllowed('https://qasomfndnjuixgjmjwcm.supabase.co')).toBe(true);
  });

  it('blocks staging, the other production ref, and empty', () => {
    expect(isDriverEventWhatsAppAllowed('https://usfeoerkpcafxxlyuldl.supabase.co')).toBe(false);
    expect(isDriverEventWhatsAppAllowed('https://kuenhflklivaxrmqbsee.supabase.co')).toBe(false);
    expect(isDriverEventWhatsAppAllowed('')).toBe(false);
  });
});
