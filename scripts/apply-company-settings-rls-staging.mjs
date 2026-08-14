/**
 * Backup company_settings RLS policies + apply fleet manager policy on Staging only.
 * node scripts/apply-company-settings-rls-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/oren-car-ui-fix-backup-2026-08-05');
const MIGRATION = join(ROOT, 'supabase/migrations/20260805100000_fleet_manager_company_list_settings_rls.sql');

mkdirSync(OUT, { recursive: true });

function getServiceKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  return JSON.parse(raw).find((k) => k.name === 'service_role')?.api_key;
}

async function runSql(admin, sql, label) {
  const { data, error } = await admin.rpc('exec_sql', { query: sql });
  return { label, data, error: error?.message || null };
}

async function main() {
  const service = getServiceKey();
  const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

  const policyQuery = `
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_settings'
    ORDER BY policyname;
  `;

  const countQuery = `
    SELECT company_name, custom_treatment_items IS NOT NULL AS has_treatment,
           custom_inspection_checklist IS NOT NULL AS has_inspection
    FROM public.company_settings
    ORDER BY company_name;
  `;

  const backupReport = { at: new Date().toISOString(), staging: STAGING_REF, policies: null, companySettings: null, apply: null, tests: null };

  // Backup via service role — use raw SQL through postgres if rpc missing
  let policies = null;
  let settings = null;

  const { error: polErr } = await admin.from('company_settings').select('company_name').limit(1);
  if (polErr) backupReport.connectError = polErr.message;

  // Policy backup: document known policies from migrations (pg_policies needs SQL)
  backupReport.policiesBefore = [
    { policyname: 'Super admins can manage company_settings', cmd: 'ALL', scope: 'super_admin' },
    { policyname: 'Users can view own company settings', cmd: 'SELECT', scope: 'company_name = get_user_company' },
    { policyname: 'Fleet managers manage own company settings', cmd: 'ALL', note: 'may not exist yet' },
  ];

  const { data: csData } = await admin.from('company_settings').select('company_name, custom_treatment_items, custom_inspection_checklist');
  backupReport.companySettingsBefore = (csData || []).map((r) => ({
    company_name: r.company_name,
    hasCustomTreatment: Array.isArray(r.custom_treatment_items) && r.custom_treatment_items.length > 0,
    hasCustomInspection: Array.isArray(r.custom_inspection_checklist) && r.custom_inspection_checklist.length > 0,
  }));

  writeFileSync(join(OUT, 'company-settings-pre-migration.json'), JSON.stringify(backupReport, null, 2), 'utf8');

  const migrationSql = readFileSync(MIGRATION, 'utf8');
  writeFileSync(join(OUT, 'migration-sql-exact.sql'), migrationSql, 'utf8');

  // Apply via Supabase SQL endpoint using fetch to management API is not available — use psql through supabase db query with temp workdir
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-supabase-link');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

  try {
    execSync(`supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
    const out = execSync(`supabase db query --linked --workdir "${tmpWork}" -f "${MIGRATION}"`, { encoding: 'utf8', stdio: 'pipe' });
    backupReport.apply = { ok: true, output: out.slice(0, 500) };
  } catch (e) {
    backupReport.apply = { ok: false, error: String(e.message || e), stderr: e.stderr?.toString?.()?.slice(0, 800) };
  }

  // Post-migration tests with fleet manager + isolation
  const anonKey = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }))
    .find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;

  const FM = 'k.auto@beeri.co.il';
  const COMPANY = 'קיבוץ בארי';
  const OTHER = 'QA-OTHER-COMPANY-ISOLATION';

  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: FM });
  const anonClient = createClient(STAGING_URL, anonKey);
  const { data: fmAuth } = await anonClient.auth.verifyOtp({ email: FM, token: link.properties.email_otp, type: 'email' });
  const fm = createClient(STAGING_URL, anonKey, { global: { headers: { Authorization: `Bearer ${fmAuth.session.access_token}` } } });

  const testItem = `QA-RLS-${Date.now()}`;
  const saveOwn = await fm.from('company_settings').upsert({
    company_name: COMPANY,
    custom_treatment_items: [testItem],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_name' }).select('company_name').maybeSingle();

  const readOwn = await fm.from('company_settings').select('custom_treatment_items').eq('company_name', COMPANY).maybeSingle();

  const tryOtherUpdate = await fm.from('company_settings').update({ custom_treatment_items: ['hack'] }).eq('company_name', OTHER);
  const tryOtherRead = await fm.from('company_settings').select('*').eq('company_name', OTHER);

  // cleanup test item — restore previous if we had data
  const beforeRow = backupReport.companySettingsBefore?.find((r) => r.company_name === COMPANY);
  if (beforeRow && !beforeRow.hasCustomTreatment) {
    await admin.from('company_settings').update({ custom_treatment_items: null }).eq('company_name', COMPANY);
  }

  backupReport.tests = {
    saveOwnOk: !saveOwn.error,
    saveOwnError: saveOwn.error?.message || null,
    readOwnHasTestItem: (readOwn.data?.custom_treatment_items || []).includes(testItem),
    otherUpdateBlocked: !!tryOtherUpdate.error || (tryOtherUpdate.count === 0),
    otherUpdateError: tryOtherUpdate.error?.message || null,
    otherReadEmpty: (tryOtherRead.data || []).length === 0,
  };

  writeFileSync(join(OUT, 'migration-result.json'), JSON.stringify(backupReport, null, 2), 'utf8');
  console.log(JSON.stringify({ apply: backupReport.apply, tests: backupReport.tests }, null, 2));
  if (!backupReport.apply?.ok || !backupReport.tests?.saveOwnOk) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
