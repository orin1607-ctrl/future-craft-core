import { describe, expect, it } from 'vitest';
import { isHardcodedEmergencyFallback, resolveEmergencyDialNumber } from './resolveEmergencyPhone';

describe('resolveEmergencyDialNumber', () => {
  it('prefers the company emergency phone', () => {
    expect(
      resolveEmergencyDialNumber({
        companyEmergencyPhone: '03-1111111',
        daliaPhone: '03-2222222',
        categoryPhone: '*8888',
      }),
    ).toBe('03-1111111');
  });

  it('falls back to Dalia, never to *8888 or 100', () => {
    expect(
      resolveEmergencyDialNumber({
        companyEmergencyPhone: '',
        daliaPhone: '03-2222222',
        categoryPhone: '100',
      }),
    ).toBe('03-2222222');
    expect(
      resolveEmergencyDialNumber({
        companyEmergencyPhone: '*8888',
        daliaPhone: '',
        categoryPhone: '100',
      }),
    ).toBe('');
  });

  it('treats hardcoded fallbacks as unset', () => {
    expect(isHardcodedEmergencyFallback('*8888')).toBe(true);
    expect(isHardcodedEmergencyFallback('100')).toBe(true);
    expect(isHardcodedEmergencyFallback('03-1234567')).toBe(false);
  });
});
