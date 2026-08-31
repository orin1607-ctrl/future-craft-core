/**
 * Phase-2 claims QA — Staging only.
 * node scripts/claims-phase2-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-module-phase2-staging-2026-08-31');
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
if (!url.includes(STAGING_REF) || url.includes(PROD_REF)) throw new Error('refused: not staging');

const sb = createClient(url, anon);
const tests = [];
const rec = (id, ok, detail) => tests.push({ id, ok, detail });

const { data: recs, error: recErr } = await sb.from('claims_records').select('id').limit(1);
rec('anon-cannot-read-claims', !!recErr || (recs || []).length === 0, recErr?.message || `rows=${(recs || []).length}`);

const { data: docs, error: docsErr } = await sb.from('claims_documents').select('id').limit(1);
rec('anon-cannot-read-docs', !!docsErr || (docs || []).length === 0, docsErr?.message || `rows=${(docs || []).length}`);

const { data: links, error: linkErr } = await sb.from('claims_upload_links').select('id').limit(1);
rec('anon-cannot-read-links', !!linkErr || (links || []).length === 0, linkErr?.message || `rows=${(links || []).length}`);

const bogus = await fetch(`${url}/functions/v1/claims-docs?action=public_get&token=${'a'.repeat(64)}`, {
  headers: { apikey: anon },
});
const bogusJson = await bogus.json().catch(() => ({}));
rec('bogus-token-denied', !bogus.ok || bogusJson.success === false, `status=${bogus.status} err=${bogusJson.error || ''}`);

const guessId = await fetch(`${url}/functions/v1/claims-docs?action=public_get&token=DAL-2026-0001`, {
  headers: { apikey: anon },
});
const guessJson = await guessId.json().catch(() => ({}));
rec('claim-id-not-a-token', !guessId.ok || guessJson.success === false, `status=${guessId.status}`);

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  telemarketingTouched: false,
  accidentsTouched: false,
  documentRequestsTouched: false,
  gmailTouched: false,
  whatsappTouched: false,
  tests,
  passed: tests.every((t) => t.ok),
};
writeFileSync(join(OUT, 'qa-anon.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
