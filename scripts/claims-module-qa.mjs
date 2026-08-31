/**
 * Staging-only QA for claims module. Does not touch Production.
 * node scripts/claims-module-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-module-staging-2026-08-31');
mkdirSync(OUT, { recursive: true });

function loadEnv(file) {
  const p = join(ROOT, file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv('.env.local');
loadEnv('.env');

const url = process.env.VITE_SUPABASE_URL || '';
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
if (!url.includes(STAGING_REF)) throw new Error('refused: VITE_SUPABASE_URL is not staging');
if (url.includes(PROD_REF)) throw new Error('refused: production url');

const sb = createClient(url, anon);
const tests = [];
function rec(id, ok, detail) {
  tests.push({ id, ok, detail });
}

const { data: anonClaims, error: anonErr } = await sb.from('claims_records').select('id').limit(1);
rec('anon-cannot-read-claims', !!anonErr || (anonClaims || []).length === 0, anonErr?.message || `rows=${(anonClaims || []).length}`);

const { data: anonAccess, error: accessErr } = await sb.from('claims_access').select('user_id').limit(1);
rec('anon-cannot-read-access', !!accessErr || (anonAccess || []).length === 0, accessErr?.message || `rows=${(anonAccess || []).length}`);

const { data: rpcAnon, error: rpcErr } = await sb.rpc('claims_can_access');
rec('anon-rpc-false', rpcAnon === false || rpcAnon === null || !!rpcErr, `rpc=${rpcAnon} err=${rpcErr?.message || ''}`);

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  telemarketingTouched: false,
  accidentsTouched: false,
  tests,
  passed: tests.every((t) => t.ok),
};
writeFileSync(join(OUT, 'qa-anon.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
