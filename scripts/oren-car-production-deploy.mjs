/**
 * Oren Car — Production deploy orchestrator (approved commit 16b3476).
 * Phases: backup → migrations → verify → build → package → SSH deploy (if key exists).
 * node scripts/oren-car-production-deploy.mjs [--skip-ssh]
 */
import { createClient } from '@supabase/supabase-js';
import { execSync, spawnSync } from 'child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

const ROOT = process.cwd();
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const COMMIT = '16b3476';
const COMPANY = 'קיבוץ בארי';
const VPS = 'root@72.60.36.182';
const WEB_BASE = '/root/future-craft-core';
const SKIP_SSH = process.argv.includes('--skip-ssh');

const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(ROOT, 'docs/audit-reports/oren-car-production-deploy', TS);
mkdirSync(OUT, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  endedAt: null,
  commit: COMMIT,
  prodRef: PROD_REF,
  backupDir: OUT,
  phases: {},
  rollback: {
    db: {
      migration3: 'ALTER TABLE company_settings DROP COLUMN IF EXISTS custom_gap_alerts_config;',
      migration2: 'DROP POLICY IF EXISTS "Fleet managers manage own company settings" ON public.company_settings;',
      migration1:
        'ALTER TABLE drivers DROP COLUMN IF EXISTS department; ALTER TABLE company_settings DROP COLUMN IF EXISTS custom_treatment_items, DROP COLUMN IF EXISTS custom_inspection_checklist; ALTER TABLE document_metadata DROP COLUMN IF EXISTS document_date, DROP COLUMN IF EXISTS display_name;',
    },
    code: 'Restore dist-old or pre-deploy tarball on VPS',
  },
};

function getKeys(ref) {
  const raw = execSync(`supabase projects api-keys --project-ref ${ref} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

function fileOk(path, minBytes = 10) {
  if (!existsSync(path)) return { ok: false, error: 'missing', bytes: 0 };
  const bytes = statSync(path).size;
  return { ok: bytes >= minBytes, bytes };
}

async function fetchAll(admin, table, filter) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = admin.from(table).select('*').range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function counts(admin) {
  const beeriV = await admin.from('vehicles').select('id,license_plate,internal_number', { count: 'exact', head: false }).eq('company_name', COMPANY);
  const beeriD = await admin.from('drivers').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY);
  const assigned = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY).not('assigned_driver_id', 'is', null);
  const other = await admin.from('vehicles').select('id', { count: 'exact', head: true }).neq('company_name', COMPANY);
  const extra = (beeriV.data || []).find((v) => v.license_plate === '66645504');
  const plates = beeriV.data || [];
  const dup = plates.filter((v, i, a) => a.findIndex((x) => x.license_plate === v.license_plate) !== i);
  return {
    vehicles: beeriV.count,
    drivers: beeriD.count,
    assignments: assigned.count,
    otherVehicles: other.count,
    vehicle66645504: extra || null,
    duplicatePlates: dup.map((d) => d.license_plate),
  };
}

async function phaseBackup(admin) {
  const phase = { ok: false, files: {} };
  const tables = ['company_settings', 'drivers', 'document_metadata', 'vehicles'];
  for (const t of tables) {
    const rows =
      t === 'company_settings'
        ? await fetchAll(admin, t, (q) => q)
        : t === 'vehicles'
          ? await fetchAll(admin, t, (q) => q.eq('company_name', COMPANY))
          : await fetchAll(admin, t, (q) => q.eq('company_name', COMPANY));
    const path = join(OUT, `backup-${t}.json`);
    writeFileSync(path, JSON.stringify(rows, null, 2));
    phase.files[t] = fileOk(path, 2);
  }
  phase.countsBefore = await counts(admin);
  writeFileSync(join(OUT, 'counts-before.json'), JSON.stringify(phase.countsBefore, null, 2));
  phase.ok = Object.values(phase.files).every((f) => f.ok);
  return phase;
}

async function phaseMigrations() {
  const phase = { ok: false, steps: [] };
  const migrations = [
    '20260804120000_oren_car_seven_tasks_staging.sql',
    '20260805100000_fleet_manager_company_list_settings_rls.sql',
    '20260805120000_company_gap_alerts_config_staging.sql',
  ];
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-prod-mig-${Date.now()}`);
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  try {
    execSync(`supabase link --project-ref ${PROD_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
    for (const m of migrations) {
      const path = join(ROOT, 'supabase/migrations', m);
      const sql = readFileSync(path, 'utf8');
      writeFileSync(join(OUT, m), sql);
      try {
        const out = execSync(`supabase db query --linked --workdir "${tmpWork}" -f "${path}"`, { encoding: 'utf8', stdio: 'pipe' });
        phase.steps.push({ migration: m, ok: true, output: out.slice(0, 200) });
      } catch (e) {
        phase.steps.push({ migration: m, ok: false, error: String(e.message || e).slice(0, 500) });
      }
    }
  } catch (e) {
    phase.linkError = String(e.message || e);
  }
  phase.ok = phase.steps.length === 3 && phase.steps.every((s) => s.ok);
  return phase;
}

async function phaseVerify(admin) {
  const phase = { ok: false };
  const c = await counts(admin);
  phase.countsAfter = c;
  const { error: deptErr } = await admin.from('drivers').select('department').limit(1);
  const { error: listsErr } = await admin.from('company_settings').select('custom_treatment_items,custom_inspection_checklist,custom_gap_alerts_config').limit(1);
  const { error: metaErr } = await admin.from('document_metadata').select('document_date,display_name').limit(1);
  phase.columns = {
    drivers_department: !deptErr,
    company_lists: !listsErr,
    document_metadata_fields: !metaErr,
  };
  phase.dataIntegrity =
    c.vehicles === 300 &&
    c.drivers === 33 &&
    c.assignments === 36 &&
    c.duplicatePlates.length === 0 &&
    !!c.vehicle66645504 &&
    c.vehicle66645504.internal_number === '898';
  phase.ok = phase.dataIntegrity && Object.values(phase.columns).every(Boolean);
  writeFileSync(join(OUT, 'counts-after.json'), JSON.stringify(phase, null, 2));
  return phase;
}

function phaseBuild(keys) {
  const phase = { ok: false };
  const worktree = 'C:/Users/אליאב/AppData/Local/Temp/fcc-main-deploy';
  const distDir = join(worktree, 'dist');
  try {
    execSync(`git -C "${worktree}" fetch origin main`, { stdio: 'pipe' });
    execSync(`git -C "${worktree}" checkout ${COMMIT}`, { stdio: 'pipe' });
    const env = {
      ...process.env,
      VITE_SUPABASE_URL: PROD_URL,
      VITE_SUPABASE_PROJECT_ID: PROD_REF,
      VITE_SUPABASE_PUBLISHABLE_KEY: keys.anon,
    };
    execSync('bun install --frozen-lockfile', { cwd: worktree, env, stdio: 'pipe' });
    execSync('bun run build', { cwd: worktree, env, stdio: 'pipe' });
    const html = readFileSync(join(distDir, 'index.html'), 'utf8');
    const bundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
    phase.bundle = bundle;
    phase.bundleFile = fileOk(join(distDir, 'assets', bundle || ''), 1000);
    const js = readFileSync(join(distDir, 'assets', bundle), 'utf8');
    phase.hasProdRef = js.includes(PROD_REF);
    phase.hasStagingRef = js.includes('usfeoerkpcafxxlyuldl');
    const smoke = spawnSync('node', [join(ROOT, 'scripts/ci-smoke-report.mjs'), '--dist', distDir, '--supabase-ref', PROD_REF], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    phase.smoke = smoke.stdout || smoke.stderr;
    try {
      phase.smokeJson = JSON.parse(readFileSync(join(ROOT, 'reports/ci-smoke-production.json'), 'utf8'));
    } catch {
      writeFileSync(join(OUT, 'smoke-raw.txt'), phase.smoke);
    }
    const tarball = join(OUT, `dist-${COMMIT}.tgz`);
    execSync(`tar -czf "${tarball}" -C "${worktree}" dist`, { stdio: 'pipe', shell: true });
    phase.tarball = fileOk(tarball, 100000);
    phase.distDir = distDir;
    phase.ok = !!bundle && phase.bundleFile.ok && phase.hasProdRef && !phase.hasStagingRef && phase.tarball.ok;
  } catch (e) {
    phase.error = String(e.message || e).slice(0, 800);
    if (e.stdout) phase.stdout = String(e.stdout).slice(0, 500);
    if (e.stderr) phase.stderr = String(e.stderr).slice(0, 500);
  }
  return phase;
}

function phaseSshDeploy(distDir) {
  const phase = { ok: false, attempted: !SKIP_SSH };
  if (SKIP_SSH) {
    phase.skipped = true;
    phase.reason = 'SSH key not available — manual upload required';
    return phase;
  }
  const keyCandidates = [
    join(process.env.USERPROFILE || '', '.ssh', 'github-actions-dalia'),
    join(process.env.USERPROFILE || '', '.ssh', 'id_ed25519'),
    join(process.env.USERPROFILE || '', '.ssh', 'id_rsa'),
  ];
  const key = keyCandidates.find((k) => existsSync(k));
  if (!key) {
    phase.skipped = true;
    phase.reason = 'No SSH private key found';
    phase.manualCommands = [
      `scp "${join(OUT, `dist-${COMMIT}.tgz`)}" ${VPS}:/root/`,
      `ssh ${VPS} "cd ${WEB_BASE} && tar czf /root/pre-deploy-${TS}.tgz dist && tar xzf /root/dist-${COMMIT}.tgz && rm -rf dist-new && mv dist dist-old && mv dist-new dist 2>/dev/null || (rm -rf dist-new && cp -a dist dist-old && tar xzf /root/dist-${COMMIT}.tgz && mv dist dist-new && mv dist-new dist) && nginx -t && systemctl reload nginx"`,
    ];
    return phase;
  }
  const ssh = `ssh -i "${key}" -o StrictHostKeyChecking=no`;
  const scp = `scp -i "${key}" -o StrictHostKeyChecking=no`;
  try {
    execSync(`${ssh} ${VPS} "hostname && whoami"`, { stdio: 'pipe' });
    execSync(`${ssh} ${VPS} "tar czf /root/pre-deploy-${TS}.tgz -C ${WEB_BASE} dist"`, { stdio: 'pipe' });
    const before = execSync(`${ssh} ${VPS} "grep -o 'index-[^\\\"']*\\.js' ${WEB_BASE}/dist/index.html | head -1"`, { encoding: 'utf8' }).trim();
    phase.bundleBefore = before;
    writeFileSync(join(OUT, 'bundle-before.txt'), before);
    execSync(`${scp} -r "${distDir}" ${VPS}:${WEB_BASE}/dist-new`, { stdio: 'pipe' });
    const newBundle = execSync(`${ssh} ${VPS} "grep -o 'index-[^\\\"']*\\.js' ${WEB_BASE}/dist-new/index.html | head -1"`, { encoding: 'utf8' }).trim();
    phase.bundleNew = newBundle;
    execSync(
      `${ssh} ${VPS} "cd ${WEB_BASE} && rm -rf dist-old && mv dist dist-old && mv dist-new dist && nginx -t && systemctl reload nginx"`,
      { stdio: 'pipe' },
    );
    phase.bundleAfter = execSync(`${ssh} ${VPS} "grep -o 'index-[^\\\"']*\\.js' ${WEB_BASE}/dist/index.html | head -1"`, { encoding: 'utf8' }).trim();
    phase.ok = true;
  } catch (e) {
    phase.error = String(e.message || e).slice(0, 800);
  }
  return phase;
}

async function main() {
  const keys = getKeys(PROD_REF);
  const admin = createClient(PROD_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log('Phase 1: Backup...');
  report.phases.backup = await phaseBackup(admin);
  if (!report.phases.backup.ok) throw new Error('Backup failed');

  console.log('Phase 2: Migrations...');
  report.phases.migrations = await phaseMigrations();
  if (!report.phases.migrations.ok) throw new Error('Migration failed — STOP');

  console.log('Phase 3: Verify data...');
  report.phases.verify = await phaseVerify(admin);
  if (!report.phases.verify.ok) throw new Error('Post-migration verify failed — consider rollback');

  console.log('Phase 4: Build...');
  report.phases.build = phaseBuild(keys);
  if (!report.phases.build.ok) throw new Error('Build failed');

  console.log('Phase 5: SSH deploy...');
  report.phases.deploy = phaseSshDeploy(report.phases.build.distDir);

  report.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'deploy-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ backup: report.phases.backup.ok, migrations: report.phases.migrations.ok, verify: report.phases.verify.ok, build: report.phases.build.ok, deploy: report.phases.deploy.ok, out: OUT }, null, 2));

  if (!report.phases.deploy.ok && !report.phases.deploy.skipped) process.exit(1);
}

main().catch((e) => {
  report.endedAt = new Date().toISOString();
  report.fatal = String(e.message || e);
  writeFileSync(join(OUT, 'deploy-report.json'), JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
