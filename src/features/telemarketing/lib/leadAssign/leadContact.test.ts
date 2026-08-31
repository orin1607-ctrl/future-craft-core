import { describe, expect, it } from 'vitest';
import { leadHasEmail, leadHasMobile, matchesContactFilter } from './leadContact';

const row = (partial: { phone?: string; email?: string; extra?: Record<string, string> }) => ({
  phone: partial.phone || '',
  email: partial.email || '',
  extra: partial.extra || {},
});

describe('lead contact filters', () => {
  it('detects mobile from extra phone fields', () => {
    const r = row({ phone: '03-1234567', extra: { phone1: '0501234567' } });
    expect(leadHasMobile(r)).toBe(true);
    expect(matchesContactFilter(r, 'both')).toBe(true);
  });

  it('does not invent email or mobile', () => {
    const r = row({ phone: '03-1234567' });
    expect(leadHasMobile(r)).toBe(false);
    expect(leadHasEmail(r)).toBe(false);
    expect(matchesContactFilter(r, 'no_phone')).toBe(false);
    expect(matchesContactFilter(r, 'email')).toBe(false);
    expect(matchesContactFilter(r, 'full')).toBe(false);
  });
});
