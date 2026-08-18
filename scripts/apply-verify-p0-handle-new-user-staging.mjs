/**
 * Apply + verify C2 handle_new_user. Staging only.
 * node scripts/apply-verify-p0-handle-new-user-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const MIGRATION = join(process.cwd(), 'supabase/migrations/20260818223000_p0_handle_new_user_ignore_client_role.sql');
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

function dbQuery(sql) {
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-p0-handle-new-user');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
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
  };
}

async function main() {
  abortIfProduction(readFileSync(MIGRATION, 'utf8'), 'migration');
  dbQuery(readFileSync(MIGRATION, 'utf8'));

  const keys = getKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const tests = [];
  const stamp = Date.now();
  const email = `qa-p0-c2-${stamp}@example.invalid`;
  const password = `QaC2_${randomBytes(12).toString('hex')}!`;
  let user = null;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'QA C2 Hijack',
        company_name: 'QA-P0-C2',
        role: 'super_admin',
      },
    });
    user = created.data?.user;
    rec(tests, 'C2-1', 'created user with malicious super_admin metadata', Boolean(user?.id), {
      error: created.error?.message,
    });
    if (!user?.id) throw new Error('no user');

    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
    const roleList = (roles || []).map((r) => r.role);
    rec(tests, 'C2-2', 'signup metadata did not grant super_admin', !roleList.includes('super_admin') && roleList.includes('driver'), {
      roles: roleList,
    });

    const { data: profile } = await admin.from('profiles').select('is_active, company_name').eq('id', user.id).single();
    rec(tests, 'C2-3', 'new user is_active is false', profile?.is_active === false, { is_active: profile?.is_active });
  } finally {
    if (user?.id) {
      await admin.from('user_roles').delete().eq('user_id', user.id);
      await admin.from('drivers').delete().eq('id', user.id);
      await admin.from('profiles').delete().eq('id', user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
  }

  const failed = tests.filter((t) => !t.ok);
  const report = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { findings: [] };
  report.findings = [
    ...(report.findings || []).filter((f) => f.id !== 'C2'),
    {
      id: 'C2',
      code: 'P0-signup',
      title: 'handle_new_user trusts client role metadata',
      rootCause: 'Signup metadata role was cast to app_role; super_admin was auto-activated.',
      changeMade: 'handle_new_user always assigns driver and is_active=false. Privileged users are created only via create-admin-user.',
      files: ['supabase/migrations/20260818223000_p0_handle_new_user_ignore_client_role.sql'],
      tests,
      testResult: failed.length === 0 ? 'PASS' : 'FAIL',
      testedAt: new Date().toISOString(),
    },
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
