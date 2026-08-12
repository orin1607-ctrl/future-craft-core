/**
 * Apply company attention VISIBILITY toggles migration on Staging only.
 * node scripts/apply-company-attention-visibility-migration-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20260812120000_company_attention_visibility_toggles_staging.sql',
);
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-attention-visibility');

mkdirSync(OUT, { recursive: true });

function getServiceKey() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  return JSON.parse(raw).find((k) => k.name === 'service_role')?.api_key;
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    staging: STAGING_REF,
    scope: 'Staging only — no Production',
    apply: null,
    verify: null,
  };
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-attention-visibility-migration');
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  try {
    execSync(`supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    const out = execSync(`supabase db query --linked --workdir "${tmpWork}" -f "${MIGRATION}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    report.apply = { ok: true, output: String(out).slice(0, 400) };
  } catch (e) {
    report.apply = { ok: false, error: String(e.message || e).slice(0, 800) };
  }

  const service = getServiceKey();
  const admin = createClient(STAGING_URL, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin
    .from('company_settings')
    .select('company_name, show_insurance_attention, show_gaps_attention, show_insurance_attention_red, show_gaps_attention_red')
    .limit(3);
  report.verify = {
    columnReadable: !error,
    error: error?.message || null,
    sample: data || null,
  };
  writeFileSync(join(OUT, 'migration-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.apply?.ok || !report.verify?.columnReadable) process.exit(1);
}

main();
