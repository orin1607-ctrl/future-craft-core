import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHARE_TTL,
  fileInShareAllowlist,
  filesBelongToClaim,
  resolveShareExpiry,
  shareStatusOf,
} from './claimSecureShare';

describe('claimSecureShare', () => {
  it('defaults to 48 hours', () => {
    expect(DEFAULT_SHARE_TTL).toBe('48h');
    const r = resolveShareExpiry('48h', '', 1_000_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Date.parse(r.expiresAt) - 1_000_000).toBe(48 * 3600_000);
  });

  it('rejects past custom expiry', () => {
    const r = resolveShareExpiry('custom', new Date(1_000).toISOString(), 50_000);
    expect(r.ok).toBe(false);
  });

  it('accepts only files of the same claim', () => {
    const files = [{ id: 'A', claim_id: 'C1' }, { id: 'B', claim_id: 'C1' }, { id: 'X', claim_id: 'C2' }];
    expect(filesBelongToClaim(['A', 'B'], files, 'C1').ok).toBe(true);
    expect(filesBelongToClaim(['A', 'X'], files, 'C1').ok).toBe(false);
    expect(filesBelongToClaim([], files, 'C1').ok).toBe(false);
  });

  it('blocks a file not on the share allowlist or on another claim', () => {
    expect(fileInShareAllowlist('A', ['A', 'B'], 'C1', 'C1')).toBe(true);
    expect(fileInShareAllowlist('Z', ['A', 'B'], 'C1', 'C1')).toBe(false);
    expect(fileInShareAllowlist('A', ['A'], 'C1', 'C2')).toBe(false);
  });

  it('marks revoked and expired', () => {
    expect(shareStatusOf({ expires_at: new Date(Date.now() + 3600_000).toISOString() })).toBe('active');
    expect(shareStatusOf({ expires_at: new Date(Date.now() - 1000).toISOString() })).toBe('expired');
    expect(shareStatusOf({ expires_at: new Date(Date.now() + 3600_000).toISOString(), revoked_at: new Date().toISOString() })).toBe('revoked');
  });
});
