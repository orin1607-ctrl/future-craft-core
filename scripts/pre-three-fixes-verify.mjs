/**
 * Post-fix verification — Beeri counts unchanged (read-only).
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMPANY = 'קיבוץ בארי';

function loadEnvFile(name) {
  const p = join(ROOT, name);
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function getServiceKey() {
  const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
  if (env.SUPABASE_SERVICE_ROLE_KEY) return env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = execSync('supabase projects api-keys --project-ref usfeoerkpcafxxlyuldl -o json', { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return keys.find((k) => k.name === 'service_role')?.api_key;
}

async function count(client, table) {
  const { count, error } = await client.from(table).select('id', { count: 'exact', head: true }).eq('company_name', COMPANY);
  if (error) throw error;
  return count || 0;
}

async function main() {
  const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
  const supabase = createClient(env.VITE_SUPABASE_URL, getServiceKey());
  const report = {
    at: new Date().toISOString(),
    vehicles: await count(supabase, 'vehicles'),
    drivers: await count(supabase, 'drivers'),
    expected: { vehicles: 299, drivers: 33 },
    ok: false,
  };
  report.ok = report.vehicles === 299 && report.drivers === 33;
  const out = join(ROOT, 'backups', 'pre-three-fixes-verify.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
