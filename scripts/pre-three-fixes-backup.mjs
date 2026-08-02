/**
 * Backup before three production-prep fixes (alerts / drivers / documents).
 * Staging only — read-only export of Beeri counts + project snapshot.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const COMPANY = 'קיבוץ בארי';
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const BACKUP_DIR = join(ROOT, 'backups', `pre-three-fixes-${TS}`);

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

async function fetchAll(client, table, company) {
  const rows = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('company_name', company)
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return rows;
}

function getServiceKey() {
  const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
  if (env.SUPABASE_SERVICE_ROLE_KEY) return env.SUPABASE_SERVICE_ROLE_KEY;
  if (env.SERVICE_ROLE_KEY) return env.SERVICE_ROLE_KEY;
  const STAGING_REF = 'usfeoerkpcafxxlyuldl';
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return (
    keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key ||
    keys.find((k) => k.name === 'service_role')?.api_key
  );
}

async function main() {
  const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = getServiceKey();
  if (!url || !key) throw new Error('Missing Supabase env');

  mkdirSync(BACKUP_DIR, { recursive: true });

  const supabase = createClient(url, key);
  const [vehicles, drivers] = await Promise.all([
    fetchAll(supabase, 'vehicles', COMPANY),
    fetchAll(supabase, 'drivers', COMPANY),
  ]);

  const report = {
    created_at: new Date().toISOString(),
    company: COMPANY,
    vehicle_count: vehicles.length,
    driver_count: drivers.length,
    assigned_vehicles: vehicles.filter((v) => v.assigned_driver_id).length,
    backup_dir: BACKUP_DIR,
  };

  writeFileSync(join(BACKUP_DIR, 'beeri-data.json'), JSON.stringify({ vehicles, drivers }, null, 2));
  writeFileSync(join(BACKUP_DIR, 'report.json'), JSON.stringify(report, null, 2));

  try {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${ROOT.replace(/'/g, "''")}\\src','${ROOT.replace(/'/g, "''")}\\supabase\\functions\\document-request','${ROOT.replace(/'/g, "''")}\\package.json' -DestinationPath '${join(BACKUP_DIR, 'project-snapshot.zip').replace(/'/g, "''")}' -Force"`,
      { stdio: 'inherit' },
    );
  } catch {
  }

  writeFileSync(join(ROOT, 'backups', 'pre-three-fixes-latest-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
