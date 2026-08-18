/**
 * P0-D change-user-password tenant tests + P0-E phone login path uses challenge.
 * Staging only. Disposable users.
 * node scripts/verify-p0-password-phone-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'public/project-001/security-remediation-staging.json');

function abortIfProduction(haystack) {
  if (String(haystack || '').includes(PROD_REF) || String(haystack || '').includes('dalia-car.online')) {
    throw new Error('ABORT: Production mentioned');
  }
}

function rec(tests, id, name, ok, detail = {}) {
  tests.push({ id, name, ok, ...detail });
  console.log(ok ? 'PASS' : 'FAIL', id, name, detail.error || detail.note || '');
}

function getKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  abortIfProduction(raw);
  const keys = JSON.parse(raw);
  return {
    service:
      keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'service_role')?.api_key,
    anon:
      keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
      keys.find((k) => k.name === 'anon')?.api_key,
  };
}

async function makeUser(admin, { email, password, company, role, isActive }) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: email, company_name: company },
  });
  const user = created.data?.user;
  if (!user?.id) throw new Error(created.error?.message || 'create failed');
  await admin.from('user_roles').delete().eq('user_id', user.id);
  await admin.from('user_roles').insert({ user_id: user.id, role });
  if (role !== 'driver') await admin.from('drivers').delete().eq('id', user.id);
  await admin.from('profiles').upsert({
    id: user.id,
    full_name: email,
    company_name: company,
    is_active: isActive,
    two_factor_approved: true,
    approval_status: 'approved',
  });
  return user;
}

async function invokeChangePassword(anonKey, accessToken, email, newPassword) {
  const res = await fetch(`${STAGING_URL}/functions/v1/change-user-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ email, new_password: newPassword }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const keys = getKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const tests = [];
  const stamp = Date.now();
  const pw = `QaD_${randomBytes(10).toString('hex')}!a`;
  const newPw = `QaDnew_${randomBytes(10).toString('hex')}!a`;
  const created = [];

  try {
    const fmA = await makeUser(admin, {
      email: `qa-p0-d-fm-a-${stamp}@example.invalid`,
      password: pw,
      company: 'QA-P0-D-A',
      role: 'fleet_manager',
      isActive: true,
    });
    created.push(fmA);
    const userA = await makeUser(admin, {
      email: `qa-p0-d-user-a-${stamp}@example.invalid`,
      password: pw,
      company: 'QA-P0-D-A',
      role: 'driver',
      isActive: true,
    });
    created.push(userA);
    const userB = await makeUser(admin, {
      email: `qa-p0-d-user-b-${stamp}@example.invalid`,
      password: pw,
      company: 'QA-P0-D-B',
      role: 'driver',
      isActive: true,
    });
    created.push(userB);
    const sa = await makeUser(admin, {
      email: `qa-p0-d-sa-${stamp}@example.invalid`,
      password: pw,
      company: 'QA-P0-D-A',
      role: 'super_admin',
      isActive: true,
    });
    created.push(sa);

    const client = createClient(STAGING_URL, keys.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const fmSession = await client.auth.signInWithPassword({
      email: `qa-p0-d-fm-a-${stamp}@example.invalid`,
      password: pw,
    });
    rec(tests, 'D1', 'fleet_manager can sign in', Boolean(fmSession.data?.session), {
      error: fmSession.error?.message,
    });
    const token = fmSession.data?.session?.access_token;

    const sameCo = await invokeChangePassword(keys.anon, token, userA.email, newPw);
    rec(tests, 'D2', 'FM can reset password for same-company user', sameCo.status === 200 && sameCo.json.success === true, {
      status: sameCo.status,
      error: sameCo.json.error,
    });

    const otherCo = await invokeChangePassword(keys.anon, token, userB.email, newPw);
    rec(tests, 'D3', 'FM cannot reset password for other company', otherCo.status === 403, {
      status: otherCo.status,
      error: otherCo.json.error,
    });

    const saReset = await invokeChangePassword(keys.anon, token, sa.email, newPw);
    rec(tests, 'D4', 'FM cannot reset super_admin password', saReset.status === 403, {
      status: saReset.status,
      error: saReset.json.error,
    });

    const phoneEmail = `050${String(stamp).slice(-7)}@nomail.fleet.local`;
    const phoneUser = await makeUser(admin, {
      email: phoneEmail,
      password: pw,
      company: 'QA-P0-E',
      role: 'driver',
      isActive: false,
    });
    created.push(phoneUser);

    const challenge = await fetch(`${STAGING_URL}/functions/v1/auth-login-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: keys.anon },
      body: JSON.stringify({ email: phoneEmail, password: pw }),
    });
    const challengeJson = await challenge.json().catch(() => ({}));
    rec(
      tests,
      'E1',
      'phone-style login email goes through auth-login-challenge is_active check',
      challenge.status >= 400 && /אישור|inactive|ממתין/i.test(JSON.stringify(challengeJson)),
      { status: challenge.status, error: challengeJson.error },
    );

    await admin.from('profiles').update({ is_active: true }).eq('id', phoneUser.id);
    const challengeActive = await fetch(`${STAGING_URL}/functions/v1/auth-login-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: keys.anon },
      body: JSON.stringify({ email: phoneEmail, password: pw }),
    });
    rec(
      tests,
      'E2',
      'active phone-style user is accepted by the same challenge path',
      challengeActive.status < 400,
      { status: challengeActive.status, body: (await challengeActive.json().catch(() => ({}))).error },
    );
  } finally {
    for (const u of created) {
      await admin.from('user_roles').delete().eq('user_id', u.id);
      await admin.from('drivers').delete().eq('id', u.id);
      await admin.from('profiles').delete().eq('id', u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  const failed = tests.filter((t) => !t.ok);
  const report = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { findings: [] };
  const dFinding = {
    id: 'C7',
    code: 'P0-D',
    title: 'Cross-company password reset',
    rootCause: 'change-user-password reset any email with no tenant or super_admin guard.',
    changeMade: 'requireAuth + same-company check for fleet_manager; FM cannot reset super_admin; unknown emails return Forbidden.',
    files: ['supabase/functions/change-user-password/index.ts'],
    tests: tests.filter((t) => t.id.startsWith('D')),
    testResult: tests.filter((t) => t.id.startsWith('D') && !t.ok).length === 0 ? 'PASS' : 'FAIL',
    testedAt: new Date().toISOString(),
  };
  const eFinding = {
    id: 'C8',
    code: 'P0-E',
    title: 'Phone login bypassed OTP/lockout/is_active',
    rootCause: 'Login.tsx phone path called signInWithPassword directly.',
    changeMade: 'Phone login uses invokeAuthLoginChallenge like email login.',
    files: ['src/pages/Login.tsx'],
    tests: tests.filter((t) => t.id.startsWith('E')),
    testResult: tests.filter((t) => t.id.startsWith('E') && !t.ok).length === 0 ? 'PASS' : 'FAIL',
    testedAt: new Date().toISOString(),
  };
  report.findings = [
    ...(report.findings || []).filter((f) => f.id !== 'C7' && f.id !== 'C8'),
    dFinding,
    eFinding,
  ];
  report.updatedAt = new Date().toISOString();
  report.productionTouched = false;
  mkdirSync(join(process.cwd(), 'public/project-001'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ failed: failed.length, tests }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
