/**
 * Gap tests: UM wizard roles, OTP expiry, OTP one-time, account_unlocked
 * Staging only — usfeoerkpcafxxlyuldl
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs', 'audit-reports');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(STAGING_URL, anon);

const runId = Date.now();
const pass = `Gap!${runId}`;
const report = { at: new Date().toISOString(), staging: STAGING_REF, tests: {} };

async function verifyOtp(body) {
  const res = await fetch(`${STAGING_URL}/functions/v1/auth-verify-otp`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function hashValue(value) {
  const data = new TextEncoder().encode(value.trim());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function log(name, ok, detail = {}) {
  report.tests[name] = { ok, ...detail };
  console.log(ok ? '✅' : '❌', name, detail.error || '');
}

// ── Setup super_admin ─────────────────────────────────────────
const saEmail = `gap-sa-${runId}@staging-e2e.local`;
const { data: sa } = await admin.auth.admin.createUser({ email: saEmail, password: pass, email_confirm: true });
const saId = sa.user.id;
await admin.from('profiles').upsert({
  id: saId, full_name: 'Gap SA', company_name: 'E2E QA', is_active: true, approval_status: 'approved',
});
await admin.from('user_roles').delete().eq('user_id', saId);
await admin.from('user_roles').insert({ user_id: saId, role: 'super_admin' });
await new Promise((r) => setTimeout(r, 600));
const { data: saAuth } = await client.auth.signInWithPassword({ email: saEmail, password: pass });
const saToken = saAuth.session.access_token;

async function createViaAdmin(body) {
  const res = await fetch(`${STAGING_URL}/functions/v1/create-admin-user`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${saToken}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

// ── 1. UM Wizard — 4 roles ────────────────────────────────────
const roles = [
  {
    key: 'private_customer',
    body: {
      email: `gap-pc-${runId}@staging-e2e.local`,
      password: pass,
      full_name: 'לקוח פרטי Gap',
      role: 'private_customer',
      approval_status: 'approved',
      is_active: true,
    },
  },
  {
    key: 'business_customer',
    body: {
      email: `gap-bc-${runId}@staging-e2e.local`,
      password: pass,
      full_name: 'לקוח עסקי Gap',
      role: 'business_customer',
      company_name: 'E2E Business Ltd',
      contact_role: 'מנהל רכש',
      activity_field: 'הסעות',
      approval_status: 'approved',
      is_active: true,
    },
  },
  {
    key: 'fleet_manager',
    body: {
      email: `gap-fm-${runId}@staging-e2e.local`,
      password: pass,
      full_name: 'מנהל צי Gap',
      role: 'fleet_manager',
      company_name: 'E2E QA',
      approval_status: 'approved',
      is_active: true,
    },
  },
  {
    key: 'driver',
    body: {
      email: `gap-dr-${runId}@staging-e2e.local`,
      password: pass,
      full_name: 'נהג Gap',
      role: 'driver',
      company_name: 'E2E QA',
      phone: '0501234567',
      license_number: '12345678',
      approval_status: 'approved',
      is_active: true,
    },
  },
];

const createdIds = [];
for (const r of roles) {
  const result = await createViaAdmin(r.body);
  const ok = result.status === 200 && !result.error && result.user_id;
  if (result.user_id) createdIds.push(result.user_id);
  log(`um_wizard_${r.key}`, ok, { status: result.status, user_id: result.user_id, error: result.error });
}

// ── 2. OTP expiry (10 min) ────────────────────────────────────
const expEmail = `gap-exp-${runId}@staging-e2e.local`;
const expCode = '123456';
const { data: expUser } = await admin.auth.admin.createUser({ email: expEmail, password: pass, email_confirm: true });
await admin.from('profiles').upsert({ id: expUser.user.id, full_name: 'Exp', company_name: 'E2E', is_active: true, approval_status: 'approved' });
const expHash = await hashValue(expCode);
await admin.from('auth_verification_codes').insert({
  user_id: expUser.user.id,
  email: expEmail,
  purpose: 'password_reset',
  code_hash: expHash,
  expires_at: new Date(Date.now() - 60_000).toISOString(),
  max_attempts: 5,
});
const expVerify = await verifyOtp({ email: expEmail, code: expCode, purpose: 'password_reset' });
log('otp_expiry_10min', expVerify.data?.success === false && expVerify.data?.error?.includes('פג'), {
  status: expVerify.status,
  response: expVerify.data,
});

// ── 3. OTP one-time use ───────────────────────────────────────
const onceEmail = `gap-once-${runId}@staging-e2e.local`;
const onceCode = '654321';
const { data: onceUser } = await admin.auth.admin.createUser({ email: onceEmail, password: pass, email_confirm: true });
await admin.from('profiles').upsert({ id: onceUser.user.id, full_name: 'Once', company_name: 'E2E', is_active: true, approval_status: 'approved' });
const onceHash = await hashValue(onceCode);
await admin.from('auth_verification_codes').insert({
  user_id: onceUser.user.id,
  email: onceEmail,
  purpose: 'password_reset',
  code_hash: onceHash,
  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  max_attempts: 5,
});
const first = await verifyOtp({ email: onceEmail, code: onceCode, purpose: 'password_reset' });
const second = await verifyOtp({ email: onceEmail, code: onceCode, purpose: 'password_reset' });
log('otp_one_time_use', first.data?.success === true && second.data?.success === false, {
  first: first.data,
  second: second.data,
});

// ── 4. account_unlocked audit ─────────────────────────────────
const lockEmail2 = `gap-unlock-${runId}@staging-e2e.local`;
const { data: lockUser } = await admin.auth.admin.createUser({ email: lockEmail2, password: pass, email_confirm: true });
const lockId = lockUser.user.id;
await admin.from('profiles').upsert({ id: lockId, full_name: 'Lock', company_name: 'E2E', is_active: true, approval_status: 'approved' });
await admin.from('user_roles').insert({ user_id: lockId, role: 'driver' });

for (let i = 0; i < 5; i++) {
  await client.functions.invoke('auth-login-challenge', { body: { email: lockEmail2, password: 'wrong' } });
}

// Expire lock manually (simulate 15 min passed) then successful login
await admin.from('auth_account_lockouts').update({
  locked_until: new Date(Date.now() - 1000).toISOString(),
}).eq('email', lockEmail2.toLowerCase());

const loginOk = await client.functions.invoke('auth-login-challenge', {
  body: { email: lockEmail2, password: pass },
});

const { data: unlockAudit } = await admin
  .from('auth_audit_log')
  .select('event_type, email, success, details')
  .eq('email', lockEmail2.toLowerCase())
  .eq('event_type', 'account_unlocked')
  .order('created_at', { ascending: false })
  .limit(1);

log('account_unlocked_audit', unlockAudit?.length === 1 && loginOk.data?.success === true, {
  login_success: loginOk.data?.success,
  audit: unlockAudit?.[0] ?? null,
  note: unlockAudit?.length ? null : 'account_unlocked may not fire when lock expires via isAccountLocked before clearLoginFailures',
});

// cleanup
for (const id of [...createdIds, expUser.user.id, onceUser.user.id, lockId, saId]) {
  await admin.auth.admin.deleteUser(id).catch(() => {});
}

writeFileSync(join(OUT, 'gap-tests-report.json'), JSON.stringify(report, null, 2));
const failed = Object.values(report.tests).filter((t) => !t.ok).length;
console.log('\nGap tests failed:', failed);
process.exit(failed > 0 ? 1 : 0);
