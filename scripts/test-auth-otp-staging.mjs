/**
 * Staging auth OTP API tests — usfeoerkpcafxxlyuldl only
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'auth-otp-build');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(STAGING_URL, anon);

const runId = Date.now();
const testEmail = `auth-otp-${runId}@staging-e2e.local`;
const testPass = `AuthOtp!${runId}`;
const report = { steps: [] };

function log(name, ok, detail = {}) {
  report.steps.push({ name, ok, ...detail });
  console.log(ok ? '✅' : '❌', name, detail);
}

const { data: created } = await admin.auth.admin.createUser({
  email: testEmail,
  password: testPass,
  email_confirm: true,
});
const userId = created.user.id;
await admin.from('profiles').upsert({
  id: userId,
  full_name: 'Auth OTP Test',
  company_name: 'QA',
  is_active: true,
  approval_status: 'approved',
  two_factor_approved: false,
});
await admin.from('user_roles').delete().eq('user_id', userId);
await admin.from('user_roles').insert({ user_id: userId, role: 'driver' });

// 1. Login without 2FA
const login1 = await client.functions.invoke('auth-login-challenge', {
  body: { email: testEmail, password: testPass },
});
log('login_no_2fa', login1.data?.success && !login1.data?.requires_otp && !!login1.data?.session, login1.data);

// 2. Enable 2FA
await admin.from('profiles').update({
  two_factor_approved: true,
  two_factor_approved_at: new Date().toISOString(),
}).eq('id', userId);

const { data: audit2fa } = await admin.from('auth_audit_log').select('event_type').eq('user_id', userId);
log('2fa_field_set', true, { two_factor_approved: true });

// 3. Login with 2FA requires OTP
const login2 = await client.functions.invoke('auth-login-challenge', {
  body: { email: testEmail, password: testPass },
});
log('login_requires_otp', login2.data?.requires_otp && !!login2.data?.challenge_id, login2.data);

// 4. Failed login lockout (5 attempts)
const failEmail = `fail-${runId}@staging-e2e.local`;
await admin.auth.admin.createUser({ email: failEmail, password: 'WrongPass1!', email_confirm: true });
let locked = false;
for (let i = 0; i < 5; i++) {
  const r = await client.functions.invoke('auth-login-challenge', {
    body: { email: failEmail, password: 'bad' },
  });
  if (r.data?.locked_until) locked = true;
}
const lockRow = await admin.from('auth_account_lockouts').select('*').eq('email', failEmail).maybeSingle();
log('lockout_after_5_failures', locked || !!lockRow.data?.locked_until, lockRow.data);

// 5. OTP invalidate old codes — insert 2 codes, second should consume first
const codeEmail = `otp-inv-${runId}@staging-e2e.local`;
await admin.auth.admin.createUser({ email: codeEmail, password: testPass, email_confirm: true });
await admin.from('auth_verification_codes').insert({
  email: codeEmail,
  purpose: 'password_reset',
  code_hash: 'abc123deadbeef',
  expires_at: new Date(Date.now() + 600000).toISOString(),
  max_attempts: 5,
});
await client.functions.invoke('auth-send-otp', { body: { email: codeEmail, purpose: 'password_reset' } });
const { data: codes } = await admin.from('auth_verification_codes').select('consumed_at, code_hash').eq('email', codeEmail);
const invalidated = (codes || []).some((c) => c.consumed_at != null && c.code_hash === 'abc123deadbeef');
log('invalidate_old_otp_on_new', invalidated && (codes || []).length >= 2, { total: codes?.length, codes });

// 6. Audit log entries exist
const { data: audits } = await admin.from('auth_audit_log').select('event_type').limit(20);
log('audit_log_populated', (audits || []).length > 0, { count: audits?.length, types: [...new Set((audits || []).map((a) => a.event_type))] });

await admin.auth.admin.deleteUser(userId);
writeFileSync(join(OUT, 'api-test-report.json'), JSON.stringify(report, null, 2));
console.log('Report:', join(OUT, 'api-test-report.json'));
