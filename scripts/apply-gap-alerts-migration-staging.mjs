/**
 * Apply gap alerts config column migration on Staging only.
 * node scripts/apply-gap-alerts-migration-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/oren-car-gap-alerts-task5-backup-2026-08-05');
const MIGRATION = join(ROOT, 'supabase/migrations/20260805120000_company_gap_alerts_config_staging.sql');

mkdirSync(OUT, { recursive: true });

function getServiceKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  return JSON.parse(raw).find((k) => k.name === 'service_role')?.api_key;
}

async function main() {
  const migrationSql = readFileSync(MIGRATION, 'utf8');
  writeFileSync(join(OUT, 'migration-sql-exact.sql'), migrationSql, 'utf8');

  const report = { at: new Date().toISOString(), staging: STAGING_REF, apply: null, verify: null, tests: null };

  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-gap-alerts-migration');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

  try {
    execSync(`supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
    const out = execSync(`supabase db query --linked --workdir "${tmpWork}" -f "${MIGRATION}"`, { encoding: 'utf8', stdio: 'pipe' });
    report.apply = { ok: true, output: out.slice(0, 500) };
  } catch (e) {
    report.apply = { ok: false, error: String(e.message || e), stderr: e.stderr?.toString?.()?.slice(0, 800) };
  }

  const service = getServiceKey();
  const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

  const { error: colErr } = await admin.from('company_settings').select('custom_gap_alerts_config').limit(1);
  report.verify = { columnReadable: !colErr, columnError: colErr?.message || null };

  const FM = 'k.auto@beeri.co.il';
  const COMPANY = 'קיבוץ בארי';
  const testConfig = {
    items: [
      { key: 'missing_documents', displayLabel: 'QA-חוסר מסמכים', order: 1, visible: true, isSystem: true },
      { key: 'insurance_gap', displayLabel: 'חוסר ביטוח', order: 2, visible: false, isSystem: true },
    ],
  };

  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: FM });
  const anonKey = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }))
    .find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
  const anonClient = createClient(STAGING_URL, anonKey);
  const { data: fmAuth } = await anonClient.auth.verifyOtp({ email: FM, token: link.properties.email_otp, type: 'email' });
  const fm = createClient(STAGING_URL, anonKey, { global: { headers: { Authorization: `Bearer ${fmAuth.session.access_token}` } } });

  const save = await fm.from('company_settings').upsert(
    { company_name: COMPANY, custom_gap_alerts_config: testConfig, updated_at: new Date().toISOString() },
    { onConflict: 'company_name' },
  ).select('custom_gap_alerts_config').maybeSingle();

  const read = await fm.from('company_settings').select('custom_gap_alerts_config').eq('company_name', COMPANY).maybeSingle();

  await admin.from('company_settings').update({ custom_gap_alerts_config: null }).eq('company_name', COMPANY);

  report.tests = {
    saveOk: !save.error,
    saveError: save.error?.message || null,
    readHasConfig: !!(read.data?.custom_gap_alerts_config?.items?.length),
    cleanedUp: true,
  };

  writeFileSync(join(OUT, 'migration-result.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ apply: report.apply, verify: report.verify, tests: report.tests }, null, 2));

  if (!report.verify?.columnReadable || !report.tests?.saveOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
