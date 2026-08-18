/**
 * Apply H14 practical exam company scope + verify. Staging only.
 * node scripts/apply-verify-h14-practical-exams-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes, randomUUID } from 'crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const MIGRATION = join(process.cwd(), 'supabase/migrations/20260818224000_h14_practical_exams_company_scope.sql');
const OUT = join(process.cwd(), 'public/project-001/security-remediation-staging.json');

function abortIfProduction(haystack) {
  if (String(haystack || '').includes(PROD_REF) || String(haystack || '').includes('dalia-car.online')) {
    throw new Error('ABORT Production');
  }
}

function rec(tests, id, name, ok, detail = {}) {
  tests.push({ id, name, ok, ...detail });
  console.log(ok ? 'PASS' : 'FAIL', id, name, detail.error || detail.note || '');
}

function dbQuery(sql) {
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-h14-practical');
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

async function main() {
  abortIfProduction(readFileSync(MIGRATION, 'utf8'));
  dbQuery(readFileSync(MIGRATION, 'utf8'));

  const keys = getKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const tests = [];
  const stamp = Date.now();
  const pw = `QaH14_${randomBytes(10).toString('hex')}!`;
  const created = [];
  let examB = null;

  try {
    const mk = async (email, company) => {
      const createdUser = await admin.auth.admin.createUser({
        email,
        password: pw,
        email_confirm: true,
        user_metadata: { full_name: email, company_name: company },
      });
      const user = createdUser.data?.user;
      if (!user?.id) throw new Error(createdUser.error?.message || 'create failed');
      await admin.from('user_roles').delete().eq('user_id', user.id);
      await admin.from('user_roles').insert({ user_id: user.id, role: 'fleet_manager' });
      await admin.from('drivers').delete().eq('id', user.id);
      await admin.from('profiles').upsert({
        id: user.id,
        full_name: email,
        company_name: company,
        is_active: true,
        two_factor_approved: true,
        approval_status: 'approved',
      });
      created.push(user);
      return user;
    };

    const fmA = await mk(`qa-h14-a-${stamp}@example.invalid`, 'QA-H14-A');
    const fmB = await mk(`qa-h14-b-${stamp}@example.invalid`, 'QA-H14-B');

    const insB = await admin.from('practical_driving_exams').insert({
      driver_id: randomUUID(),
      driver_name: 'QA H14 B',
      company_name: 'QA-H14-B',
      examiner_name: 'QA',
      created_by: fmB.id,
    }).select('id').single();
    examB = insB.data;
    rec(tests, 'H14-1', 'inserted company B exam fixture', Boolean(examB?.id), { error: insB.error?.message });

    const clientA = createClient(STAGING_URL, keys.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await clientA.auth.signInWithPassword({ email: `qa-h14-a-${stamp}@example.invalid`, password: pw });

    const upd = await clientA.from('practical_driving_exams').update({ notes: 'cross-tenant' }).eq('id', examB.id).select('id');
    rec(tests, 'H14-2', 'company A FM cannot UPDATE company B exam', Boolean(upd.error) || !upd.data?.length, {
      error: upd.error?.message,
      count: upd.data?.length ?? null,
    });

    const del = await clientA.from('practical_driving_exams').delete().eq('id', examB.id).select('id');
    rec(tests, 'H14-3', 'company A FM cannot DELETE company B exam', Boolean(del.error) || !del.data?.length, {
      error: del.error?.message,
      count: del.data?.length ?? null,
    });

    const still = await admin.from('practical_driving_exams').select('id').eq('id', examB.id).maybeSingle();
    rec(tests, 'H14-4', 'company B exam still exists', still.data?.id === examB.id, { error: still.error?.message });
  } finally {
    if (examB?.id) await admin.from('practical_driving_exams').delete().eq('id', examB.id);
    for (const u of created) {
      await admin.from('user_roles').delete().eq('user_id', u.id);
      await admin.from('drivers').delete().eq('id', u.id);
      await admin.from('profiles').delete().eq('id', u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  const failed = tests.filter((t) => !t.ok);
  const report = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { findings: [] };
  report.findings = [
    ...(report.findings || []).filter((f) => f.id !== 'H14'),
    {
      id: 'H14',
      code: 'HIGH',
      title: 'practical_driving_exams cross-company UPDATE/DELETE',
      rootCause: 'UPDATE/DELETE policies allowed any fleet_manager.',
      changeMade: 'Policies now require company_name = get_user_company(auth.uid()) for fleet_manager.',
      files: ['supabase/migrations/20260818224000_h14_practical_exams_company_scope.sql'],
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
