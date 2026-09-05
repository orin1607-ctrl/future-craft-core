import { describe, expect, it } from 'vitest';
import { buildWaMeUrl, normalizeWhatsAppDigits } from './driverOutboundNotify';

describe('buildWaMeUrl', () => {
  it('normalizes local Israeli numbers and encodes text', () => {
    expect(normalizeWhatsAppDigits('050-123-4567')).toBe('972501234567');
    expect(buildWaMeUrl('0501234567', 'שלום')).toBe(
      `https://wa.me/972501234567?text=${encodeURIComponent('שלום')}`,
    );
  });
});
