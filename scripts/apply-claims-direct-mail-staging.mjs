/**
 * Deploy claims-gmail + claims-docs to Oren Car Staging only.
 * No Production. No SQL schema change. No send.
 * node scripts/apply-claims-direct-mail-staging.mjs
 */
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-direct-mail-2026-09-01');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, edge: null, verify: null };
try {
  const parts = [];
  for (const fn of ['claims-docs', 'claims-gmail']) {
    const out = execSync(`npx --yes supabase functions deploy ${fn} --project-ref ${STAGING_REF} --use-api`, {
      encoding: 'utf8', stdio: 'pipe', timeout: 240000, cwd: ROOT,
    });
    if (String(out).includes(PROD_REF)) throw new Error('deploy mentioned production');
    parts.push({ fn, output: String(out).slice(0, 500) });
  }
  report.edge = { ok: true, parts };
} catch (e) {
  report.edge = { ok: false, error: String(e.message || e).slice(0, 2000), stderr: e.stderr?.toString?.()?.slice(0, 1200) || null };
}
writeFileSync(join(OUT, 'edge-deploy.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.edge?.ok) process.exit(1);
