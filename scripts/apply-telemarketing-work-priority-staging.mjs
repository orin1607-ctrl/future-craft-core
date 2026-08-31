/**
 * Apply additive work-priority column + RPC on Orin Car Staging ONLY.
 * Stops if Tair is currently on a call / report / claimed lead.
 * node scripts/apply-telemarketing-work-priority-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260831120000_telemarketing_work_priority_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-work-priority-2026-08-31');
mkdirSync(OUT, { recursive: true });
if (!existsSync(SQL)) throw new Error('migration sql missing');
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-work-priority-staging');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sqlFile) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180000,
  });
}
function dbQueryText(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return dbQuery(tmp);
}

const keysRaw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(keysRaw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: openCalls } = await db.from('telemarketing_calls').select('id, company_name, started_at, status').eq('employee_id', TAIR).eq('status', 'in_progress');
const { data: openWork } = await db.from('telemarketing_work_sessions').select('id, company_name, started_at, status').eq('employee_id', TAIR).eq('status', 'in_progress');
const { data: claimed } = await db.from('telemarketing_lead_directory').select('id, lead_number, company_name, claimed_at').eq('claimed_by', TAIR);

const live = {
  openCalls: openCalls || [],
  openWork: openWork || [],
  claimed: claimed || [],
  tairBusy: (openCalls || []).length > 0 || (openWork || []).length > 0 || (claimed || []).length > 0,
};
writeFileSync(join(OUT, 'apply-live-check.json'), JSON.stringify(live, null, 2), 'utf8');

if (live.tairBusy) {
  const stop = { at: new Date().toISOString(), stopped: true, reason: 'Tair is busy — SQL not applied', live };
  writeFileSync(join(OUT, 'apply-stopped.json'), JSON.stringify(stop, null, 2), 'utf8');
  console.log(JSON.stringify(stop, null, 2));
  process.exit(2);
}

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, live, backup: null, apply: null, verify: null };

try {
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('refused: linked production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

  const backupOut = dbQueryText(`
    SELECT json_build_object(
      'directory_count', (SELECT count(*) FROM public.telemarketing_lead_directory),
      'tair_new', (SELECT count(*) FROM public.telemarketing_lead_directory WHERE assigned_to = '${TAIR}' AND lead_wave = 'new'),
      'tair_old', (SELECT count(*) FROM public.telemarketing_lead_directory WHERE assigned_to = '${TAIR}' AND lead_wave = 'old'),
      'priority_col_before', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='telemarketing_lead_directory' AND column_name='work_priority_at'),
      'claim_def_has_priority_before', (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='telemarketing_claim_next_lead' LIMIT 1) ILIKE '%work_priority_at%'
    );
  `);
  writeFileSync(join(OUT, 'schema-backup-before-apply.json'), backupOut, 'utf8');
  report.backup = { ok: true, linked };

  report.apply = { ok: true, output: String(dbQuery(SQL)).slice(0, 2500) };

  const verifyOut = dbQueryText(`
    SELECT json_build_object(
      'directory_count', (SELECT count(*) FROM public.telemarketing_lead_directory),
      'tair_new', (SELECT count(*) FROM public.telemarketing_lead_directory WHERE assigned_to = '${TAIR}' AND lead_wave = 'new'),
      'tair_old', (SELECT count(*) FROM public.telemarketing_lead_directory WHERE assigned_to = '${TAIR}' AND lead_wave = 'old'),
      'priority_col', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='telemarketing_lead_directory' AND column_name='work_priority_at'),
      'priority_rpc', EXISTS (SELECT 1 FROM pg_proc WHERE proname='telemarketing_set_work_priority'),
      'claim_def_has_priority', (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='telemarketing_claim_next_lead' LIMIT 1) ILIKE '%work_priority_at%',
      'priority_marked', (SELECT count(*) FROM public.telemarketing_lead_directory WHERE work_priority_at IS NOT NULL)
    );
  `);
  writeFileSync(join(OUT, 'apply-verify.json'), verifyOut, 'utf8');
  report.verify = { ok: true, output: String(verifyOut).slice(0, 4000) };
} catch (e) {
  report.apply = { ok: false, error: String(e?.stderr || e?.message || e) };
  writeFileSync(join(OUT, 'apply-error.json'), JSON.stringify(report, null, 2), 'utf8');
  console.error(report.apply.error);
  process.exit(1);
}

writeFileSync(join(OUT, 'apply-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
