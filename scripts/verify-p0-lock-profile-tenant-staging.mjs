/**
 * P0-B / P0-C tests — Staging only. Disposable QA users.
 * node scripts/verify-p0-lock-profile-tenant-staging.mjs
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

function abortIfProduction(haystack, label) {
  if (String(haystack || '').includes(PROD_REF) || String(haystack || '').includes('dalia-car.online')) {
    throw new Error(`ABORT: ${label} mentions Production.`);
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
  abortIfProduction(raw, 'api-keys');
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

async function main() {
  const keys = getKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const tests = [];
  const stamp = Date.now();
  const password = `QaP0C_${randomBytes(12).toString('hex')}!`;
  const email = `qa-p0-c-${stamp}@example.invalid`;
  let user = null;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'QA P0 C', company_name: 'QA-P0-C' },
    });
    user = created.data?.user;
    rec(tests, 'P1', 'created disposable QA user', Boolean(user?.id), { error: created.error?.message });
    if (!user?.id) throw new Error('no user');

    await admin.from('profiles').upsert({
      id: user.id,
      full_name: 'QA P0 C',
      company_name: 'QA-P0-C',
      is_active: true,
      two_factor_approved: true,
      approval_status: 'approved',
    });

    const client = createClient(STAGING_URL, keys.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const sign = await client.auth.signInWithPassword({ email, password });
    rec(tests, 'P2', 'active user can sign in', Boolean(sign.data?.session), { error: sign.error?.message });

    const nameOk = await client.from('profiles').update({ full_name: 'QA P0 C renamed' }).eq('id', user.id);
    rec(tests, 'P3', 'user can still update own display name', !nameOk.error, { error: nameOk.error?.message });

    const companyTry = await client.from('profiles').update({ company_name: 'QA-P0-C-HIJACK' }).eq('id', user.id);
    rec(tests, 'P4', 'user cannot change own company_name', Boolean(companyTry.error), {
      error: companyTry.error?.message,
      note: companyTry.error ? 'rejected' : 'UNEXPECTED success',
    });

    const { data: afterCompany } = await admin.from('profiles').select('company_name').eq('id', user.id).single();
    rec(tests, 'P5', 'company_name unchanged after client attempt', afterCompany?.company_name === 'QA-P0-C', {
      value: afterCompany?.company_name,
    });

    const activeTry = await client.from('profiles').update({ is_active: false }).eq('id', user.id);
    rec(tests, 'P6', 'user cannot change own is_active', Boolean(activeTry.error), {
      error: activeTry.error?.message,
    });

    const adminToggle = await admin.from('profiles').update({ is_active: false }).eq('id', user.id);
    rec(tests, 'P7', 'service role can deactivate user', !adminToggle.error, { error: adminToggle.error?.message });

    await client.auth.signOut();
    const inactiveSign = await client.auth.signInWithPassword({ email, password });
    rec(tests, 'P8', 'Supabase Auth still issues a session for inactive user (app must drop it)', Boolean(inactiveSign.data?.session), {
      note: 'expected: JWT exists; AuthContext/edge must reject',
      error: inactiveSign.error?.message,
    });

    const { data: profile } = await client.from('profiles').select('is_active, company_name').eq('id', user.id).maybeSingle();
    rec(tests, 'P9', 'inactive profile loads as is_active=false for session check', profile?.is_active === false, {
      is_active: profile?.is_active,
    });

    const challenge = await fetch(`${STAGING_URL}/functions/v1/auth-login-challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: keys.anon,
      },
      body: JSON.stringify({ email, password }),
    });
    const challengeJson = await challenge.json().catch(() => ({}));
    rec(
      tests,
      'P10',
      'auth-login-challenge rejects inactive account',
      challenge.status >= 400 && /אישור|inactive|ממתין/i.test(JSON.stringify(challengeJson)),
      { status: challenge.status, error: challengeJson.error },
    );
  } finally {
    if (user?.id) {
      await admin.from('user_roles').delete().eq('user_id', user.id);
      await admin.from('profiles').delete().eq('id', user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
  }

  const failed = tests.filter((t) => !t.ok);
  const report = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { findings: [] };
  const finding = {
    id: 'C3',
    code: 'P0-B/C',
    title: 'Mutable company_name / is_active on profiles',
    rootCause: 'profiles UPDATE allowed any column for id=auth.uid(); session restore skipped is_active.',
    changeMade:
      'BEFORE UPDATE trigger locks company_name/is_active/approval/2FA except service_role and super_admin; Settings no longer submits company_name; AuthContext signs out inactive sessions; edgeAuth rejects inactive users.',
    files: [
      'supabase/migrations/20260818222000_p0_lock_profile_tenant_fields.sql',
      'src/pages/Settings.tsx',
      'src/contexts/AuthContext.tsx',
      'supabase/functions/_shared/edgeAuth.ts',
    ],
    tests,
    testResult: failed.length === 0 ? 'PASS' : 'FAIL',
    testedAt: new Date().toISOString(),
  };
  report.findings = [...(report.findings || []).filter((f) => f.id !== 'C3'), finding];
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
