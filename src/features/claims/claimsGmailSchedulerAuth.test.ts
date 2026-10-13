// Fictitious keys only.
import { describe, expect, it } from 'vitest';
import {
  isInternalSchedulerRequest,
  isStagingServiceRoleRequest,
  sameSecret,
} from '../../../supabase/functions/claims-gmail/schedulerAuth';

const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (payload: unknown, sig = 'sig') => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${sig}`;
const SERVICE_KEY = jwt({ role: 'service_role', ref: STAGING }, 'real-signature');

const headers = (h: Record<string, string>) => new Headers(h);

describe('claims-gmail scheduler auth', () => {
  it('refuses a forged token that only claims service_role for Staging (the hole being closed)', () => {
    const forged = jwt({ role: 'service_role', ref: STAGING }, 'attacker');
    expect(isStagingServiceRoleRequest(headers({ Authorization: `Bearer ${forged}` }), SERVICE_KEY, STAGING, PROD)).toBe(false);
    const unsigned = `${b64url({ alg: 'none' })}.${b64url({ role: 'service_role', ref: STAGING })}.`;
    expect(isStagingServiceRoleRequest(headers({ Authorization: `Bearer ${unsigned}` }), SERVICE_KEY, STAGING, PROD)).toBe(false);
  });

  it('accepts the exact Staging service key, refuses a Production key', () => {
    expect(isStagingServiceRoleRequest(headers({ Authorization: `Bearer ${SERVICE_KEY}` }), SERVICE_KEY, STAGING, PROD)).toBe(true);
    const prodKey = jwt({ role: 'service_role', ref: PROD }, 'p');
    expect(isStagingServiceRoleRequest(headers({ Authorization: `Bearer ${prodKey}` }), prodKey, STAGING, PROD)).toBe(false);
    expect(isStagingServiceRoleRequest(headers({}), SERVICE_KEY, STAGING, PROD)).toBe(false);
    expect(isStagingServiceRoleRequest(headers({ Authorization: `Bearer ${SERVICE_KEY}` }), '', STAGING, PROD)).toBe(false);
  });

  it('keeps the pg_cron path working (x-dalia-internal-key, as the 3-hour scan sends it)', () => {
    const cron = headers({ 'Content-Type': 'application/json', Authorization: 'Bearer internal-secret-x', 'x-dalia-internal-key': 'internal-secret-x' });
    expect(isInternalSchedulerRequest(cron, 'internal-secret-x')).toBe(true);
    expect(isInternalSchedulerRequest(headers({ 'x-dalia-internal-key': 'wrong' }), 'internal-secret-x')).toBe(false);
    expect(isInternalSchedulerRequest(headers({}), 'internal-secret-x')).toBe(false);
    expect(isInternalSchedulerRequest(headers({ 'x-dalia-internal-key': '' }), '')).toBe(false);
  });

  it('compares secrets in constant time and never matches empty values', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
  });
});
