/**
 * Deploy garage-gmail to Staging only. Never Production.
 * node scripts/deploy-garage-gmail-staging.mjs
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
if (STAGING_REF === PROD_REF) throw new Error('refused production');

function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
    }
  }
  return env;
}

const fileEnv = loadEnv();
const token = (process.env.SUPABASE_ACCESS_TOKEN || fileEnv.SUPABASE_ACCESS_TOKEN || '').replace(/\r/g, '').trim();
if (!token) {
  console.log(JSON.stringify({ ok: false, error: 'missing_supabase_access_token', deploy: 'skipped' }));
  process.exit(2);
}
process.env.SUPABASE_ACCESS_TOKEN = token;
const out = execSync(`npx --yes supabase functions deploy garage-gmail --project-ref ${STAGING_REF} --use-api`, {
  encoding: 'utf8',
  stdio: 'pipe',
  timeout: 180000,
});
console.log(out);
console.log(JSON.stringify({ ok: true, project: STAGING_REF, productionTouched: false }));
