/**
 * Follow-up probes for Staging full audit. No Production. No customer file bytes.
 * node scripts/verify-staging-audit-followup.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'public/project-001/staging-full-audit-followup.json');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function abortIfProduction(haystack, label = 'input') {
  const t = String(haystack || '');
  if (t.includes(PROD_REF) || t.includes('dalia-car.online')) {
    throw new Error(`ABORT: ${label} mentions Production.`);
  }
}

function rec(tests, id, name, ok, detail = {}) {
  tests.push({ id, name, ok, ...detail });
  console.log(ok ? 'PASS' : 'FAIL', `[${id}]`, name, detail.error || detail.note || '');
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

function dbQuery(sql) {
  abortIfProduction(sql, 'sql');
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-staging-followup');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  abortIfProduction(out, 'db output');
  return out;
}

function parseRows(raw) {
  try {
    const j = JSON.parse(raw);
    return j.rows || [];
  } catch {
    return [];
  }
}

async function main() {
  abortIfProduction(process.env.DATABASE_URL, 'DATABASE_URL');
  const keys = getKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(STAGING_URL, keys.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const tests = [];
  const stamp = Date.now();
  const password = `QaFu_${randomBytes(12).toString('hex')}!`;
  const createdUsers = [];
  const createdFiles = [];

  rec(tests, 'G0', 'Production not targeted', true, { stagingRef: STAGING_REF });

  const declPolicies = parseRows(dbQuery(`
    SELECT tablename, policyname, roles::text, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('driver_declarations', 'driving_exams')
    ORDER BY tablename, policyname;
  `));
  const leftoverAnonTrue = declPolicies.filter(
    (p) => String(p.roles || '').includes('anon') && String(p.qual || '') === 'true',
  );
  rec(tests, 'C4-LIVE-POL', 'live anon USING(true) policies on declarations/exams', leftoverAnonTrue.length === 0, {
    leftover: leftoverAnonTrue.map((p) => `${p.tablename}:${p.policyname}:${p.cmd}`),
    allPolicies: declPolicies.map((p) => `${p.tablename}:${p.policyname}:${p.cmd}:${p.roles}`),
  });

  const rpcRows = parseRows(dbQuery(`
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_declaration_by_token',
        'sign_declaration_by_token',
        'get_driving_exam_by_token',
        'start_driving_exam_by_token',
        'submit_driving_exam_by_token'
      )
    ORDER BY 1;
  `));
  rec(tests, 'C4-RPC', 'token RPCs exist', rpcRows.length >= 5, {
    functions: rpcRows.map((r) => r.proname),
  });

  const anonAll = await anon.from('driver_declarations').select('id');
  rec(tests, 'C4-DUMP', 'anon cannot list declaration ids', !(anonAll.data || []).length, {
    count: anonAll.data?.length ?? null,
    error: anonAll.error?.message,
  });

  const examAll = await anon.from('driving_exams').select('id');
  rec(tests, 'C5-DUMP', 'anon cannot list exam ids', !(examAll.data || []).length, {
    count: examAll.data?.length ?? null,
    error: examAll.error?.message,
  });

  const noCompany = parseRows(dbQuery(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT IN (
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'company_name'
      )
    ORDER BY 1;
  `));
  rec(tests, 'DATA-NO-CO', 'catalogued public tables without company_name', true, {
    count: noCompany.length,
    tables: noCompany.map((t) => `${t.table_name}:rls=${t.rls}`),
  });

  const roles = parseRows(dbQuery(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role'
    ORDER BY e.enumsortorder;
  `));
  rec(tests, 'ROLES', 'app_role enum', true, { roles: roles.map((r) => r.enumlabel) });

  const counters = await admin.from('incident_event_counters').select('company_name').limit(20);
  rec(tests, 'ISO-COUNTERS-ADMIN', 'incident_event_counters readable by service role', !counters.error, {
    error: counters.error?.message,
    count: counters.data?.length ?? null,
  });

  let c6Tracked = '';
  try {
    c6Tracked = execSync('git ls-files -- "integrations/google/*"', { encoding: 'utf8' });
  } catch {
    c6Tracked = '';
  }
  rec(tests, 'C6-GIT', 'Google OAuth token file not tracked in git', !/token\.gmail/i.test(c6Tracked), {
    note: /token\.gmail/i.test(c6Tracked) ? 'OPEN HIGH/CRITICAL — token file still tracked' : 'not in git index',
    files: c6Tracked.trim().split(/\r?\n/).filter(Boolean).slice(0, 8),
  });

  const otp = await fetch(`${STAGING_URL}/functions/v1/auth-send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: keys.anon },
    body: JSON.stringify({ probe: true }),
  });
  rec(tests, 'EDGE-OTP-PUBLIC', 'auth-send-otp is a public login endpoint (400 on bad body is expected)', otp.status === 400 || otp.status === 401 || otp.status === 422, {
    status: otp.status,
    note: 'not a Critical; login OTP must be callable without a session',
  });

  const deploy = await fetch(`${STAGING_URL}/functions/v1/deploy-control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: keys.anon },
    body: JSON.stringify({ probe: true }),
  });
  rec(tests, 'EDGE-DEPLOY', 'deploy-control not deployed on Staging (404) or auth-protected', deploy.status === 404 || deploy.status === 401 || deploy.status === 403, {
    status: deploy.status,
  });

  try {
    const companyA = `QA-FU-A-${stamp}`;
    const companyB = `QA-FU-B-${stamp}`;
    const fmA = await admin.auth.admin.createUser({
      email: `qa-fu-a-${stamp}@example.invalid`,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'QA FU A', company_name: companyA },
    });
    const fmB = await admin.auth.admin.createUser({
      email: `qa-fu-b-${stamp}@example.invalid`,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'QA FU B', company_name: companyB },
    });
    if (fmA.data?.user) createdUsers.push(fmA.data.user);
    if (fmB.data?.user) createdUsers.push(fmB.data.user);
    for (const [user, company] of [[fmA.data.user, companyA], [fmB.data.user, companyB]]) {
      if (!user) continue;
      await admin.from('user_roles').delete().eq('user_id', user.id);
      await admin.from('user_roles').insert({ user_id: user.id, role: 'fleet_manager' });
      await admin.from('drivers').delete().eq('id', user.id);
      await admin.from('profiles').upsert({
        id: user.id,
        full_name: `QA FU ${company}`,
        company_name: company,
        is_active: true,
        two_factor_approved: true,
        approval_status: 'approved',
      });
    }

    const pathB = `admin-uploads/${fmB.data.user.id}-secret.png`;
    const up = await admin.storage.from('documents').upload(pathB, PNG, { contentType: 'image/png', upsert: true });
    if (!up.error) createdFiles.push(pathB);
    rec(tests, 'H-FM-LIST-SETUP', 'uploaded disposable file under admin-uploads', !up.error, {
      error: up.error?.message,
    });

    const signA = await admin.auth.signInWithPassword({
      email: `qa-fu-a-${stamp}@example.invalid`,
      password,
    });
    const clientA = createClient(STAGING_URL, keys.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${signA.data.session.access_token}` } },
    });
    const listed = await clientA.storage.from('documents').list('admin-uploads', { limit: 20 });
    const leaked = (listed.data || []).some((f) => f.name === `${fmB.data.user.id}-secret.png`);
    rec(tests, 'H-FM-LIST', 'FM A cannot list other-company files in admin-uploads', !leaked, {
      leaked,
      names: (listed.data || []).map((f) => f.name).slice(0, 10),
      error: listed.error?.message,
      note: leaked ? 'OPEN HIGH — shared prefix listable by any FM' : 'no cross-tenant filename visible in sample',
    });

    const countersA = await clientA.from('incident_event_counters').select('company_name');
    const leakedCounters = (countersA.data || []).filter((r) => r.company_name && r.company_name !== companyA);
    rec(tests, 'ISO-COUNTERS-FM', 'FM A cannot see other companies in incident_event_counters', leakedCounters.length === 0, {
      seen: countersA.data?.length ?? null,
      leaked: leakedCounters.length,
      error: countersA.error?.message,
    });

    const logsIns = await clientA.from('system_logs').insert({
      action: 'qa-followup',
      details: { qa: true },
      company_name: companyB,
    }).select('id');
    rec(tests, 'H-LOGS-INS', 'FM cannot insert system_logs for another company', Boolean(logsIns.error) || !(logsIns.data || []).length, {
      error: logsIns.error?.message,
      count: logsIns.data?.length ?? null,
      note: (!logsIns.error && logsIns.data?.length) ? 'OPEN HIGH — INSERT not tenant-scoped' : undefined,
    });
    if (logsIns.data?.[0]?.id) {
      await admin.from('system_logs').delete().eq('id', logsIns.data[0].id);
    }
  } finally {
    for (const f of createdFiles) {
      await admin.storage.from('documents').remove([f]);
    }
    for (const u of createdUsers) {
      await admin.from('user_roles').delete().eq('user_id', u.id);
      await admin.from('drivers').delete().eq('id', u.id);
      await admin.from('profiles').delete().eq('id', u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  const failed = tests.filter((t) => !t.ok);
  const report = {
    at: new Date().toISOString(),
    environment: 'staging',
    stagingRef: STAGING_REF,
    productionTouched: false,
    failedCount: failed.length,
    passCount: tests.filter((t) => t.ok).length,
    tests,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ failed: failed.length, pass: report.passCount, failedIds: failed.map((t) => t.id) }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
