/**
 * Oren Car — Production final deploy (code from LOCAL workspace, data untouched)
 * node scripts/oren-car-production-final-deploy.mjs [--skip-migrations] [--skip-ssh]
 *
 * CRITICAL: Never imports/syncs Staging data. Schema-only migrations. Counts must match before/after.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync, spawnSync } from 'child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const COMPANY = 'קיבוץ בארי';
const VPS = 'root@72.60.36.182';
const WEB_BASE = '/root/future-craft-core';
const SKIP_MIG = process.argv.includes('--skip-migrations');
const SKIP_SSH = process.argv.includes('--skip-ssh');

const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-production-deploy', `final-${TS}`);
mkdirSync(OUT, { recursive: true });

const LOCAL_COMMIT = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

const report = {
  startedAt: new Date().toISOString(),
  localCommit: LOCAL_COMMIT,
  prodRef: PROD_REF,
  liveUrl: LIVE,
  stagingDataTouched: false,
  outDir: OUT,
  phases: {},
};

function getKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${PROD_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
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

async function snapshotCounts(admin) {
  const { count: totalVehicles } = await admin.from('vehicles').select('id', { count: 'exact', head: true });
  const { count: totalDrivers } = await admin.from('drivers').select('id', { count: 'exact', head: true });
  const { count: beeriVehicles } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', COMPANY);
  const { count: beeriDrivers } = await admin
    .from('drivers')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', COMPANY);
  const { data: companies } = await admin.from('vehicles').select('company_name');
  const companySet = [...new Set((companies || []).map((r) => r.company_name).filter(Boolean))];
  const { data: beeriPlates } = await admin
    .from('vehicles')
    .select('license_plate, internal_number')
    .eq('company_name', COMPANY);
  const plates = beeriPlates || [];
  const dupPlates = plates.filter((v, i, a) => a.findIndex((x) => x.license_plate === v.license_plate) !== i);
  const { count: docMeta } = await admin.from('document_metadata').select('id', { count: 'exact', head: true });
  let liveBundle = null;
  try {
    const html = await (await fetch(LIVE)).text();
    liveBundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
  } catch {
    liveBundle = 'fetch-failed';
  }
  const insCol = await admin.from('vehicles').select('insurance_alerts_enabled').limit(1);
  const redCol = await admin.from('vehicles').select('insurance_alerts_red_enabled').limit(1);
  return {
    totalVehicles,
    totalDrivers,
    beeriVehicles,
    beeriDrivers,
    companies: companySet.length,
    companyNames: companySet.sort(),
    beeriDuplicatePlates: dupPlates.map((d) => d.license_plate),
    documentMetadata: docMeta,
    liveBundle,
    insuranceAlertsCol: !insCol.error,
    insuranceRedCol: !redCol.error,
  };
}

async function phaseBackup(admin) {
  const phase = { ok: false, files: {} };
  const tables = [
    { name: 'vehicles', filter: null },
    { name: 'drivers', filter: null },
    { name: 'document_metadata', filter: null },
    { name: 'company_settings', filter: null },
    { name: 'custom_alerts', filter: null },
    { name: 'faults', filter: (q) => q.limit(5000) },
    { name: 'accidents', filter: (q) => q.limit(5000) },
  ];
  for (const { name, filter } of tables) {
    try {
      const rows = await fetchAll(admin, name, filter);
      const path = join(OUT, `backup-${name}.json`);
      writeFileSync(path, JSON.stringify(rows, null, 2));
      phase.files[name] = { ok: true, rows: rows.length, bytes: statSync(path).size };
    } catch (e) {
      phase.files[name] = { ok: false, error: String(e.message || e).slice(0, 200) };
    }
  }
  phase.countsBefore = await snapshotCounts(admin);
  writeFileSync(join(OUT, 'counts-before.json'), JSON.stringify(phase.countsBefore, null, 2));
  phase.ok = phase.files.vehicles?.ok && phase.files.drivers?.ok;
  return phase;
}

async function phaseMigrations() {
  const phase = { ok: false, steps: [] };
  if (SKIP_MIG) {
    phase.skipped = true;
    phase.ok = true;
    return phase;
  }
  const migration = '20260809220000_vehicle_insurance_toggles_production_schema_only.sql';
  const path = join(ROOT, 'supabase/migrations', migration);
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-prod-final-${Date.now()}`);
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  try {
    execSync(`supabase link --project-ref ${PROD_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
    const out = execSync(`supabase db query --linked --workdir "${tmpWork}" -f "${path}"`, { encoding: 'utf8', stdio: 'pipe' });
    phase.steps.push({ migration, ok: true, output: out.slice(0, 300) });
    phase.ok = true;
  } catch (e) {
    phase.steps.push({ migration, ok: false, error: String(e.message || e).slice(0, 500) });
  }
  return phase;
}

async function phaseVerify(admin, before) {
  const phase = { ok: false };
  const after = await snapshotCounts(admin);
  phase.countsAfter = after;
  phase.countsMatch =
    after.totalVehicles === before.totalVehicles &&
    after.totalDrivers === before.totalDrivers &&
    after.beeriVehicles === before.beeriVehicles &&
    after.beeriDrivers === before.beeriDrivers &&
    after.documentMetadata === before.documentMetadata &&
    after.beeriDuplicatePlates.length === before.beeriDuplicatePlates.length;
  phase.insuranceColsAdded = after.insuranceAlertsCol && after.insuranceRedCol;
  phase.beeriNotReduced = after.beeriVehicles >= before.beeriVehicles;
  phase.ok = phase.countsMatch && phase.beeriNotReduced;
  writeFileSync(join(OUT, 'counts-after.json'), JSON.stringify(phase, null, 2));
  return phase;
}

function phaseBuild(keys) {
  const phase = { ok: false };
  const distDir = join(ROOT, 'dist');
  try {
    const env = {
      ...process.env,
      VITE_SUPABASE_URL: PROD_URL,
      VITE_SUPABASE_PROJECT_ID: PROD_REF,
      VITE_SUPABASE_PUBLISHABLE_KEY: keys.anon,
    };
    execSync('npm run build', { cwd: ROOT, env, stdio: 'pipe' });
    const html = readFileSync(join(distDir, 'index.html'), 'utf8');
    const bundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
    phase.bundle = bundle;
    const jsPath = join(distDir, 'assets', bundle);
    phase.bundleBytes = statSync(jsPath).size;
    const js = readFileSync(jsPath, 'utf8');
    phase.hasProdRef = js.includes(PROD_REF);
    phase.hasStagingRef = js.includes('usfeoerkpcafxxlyuldl');
    phase.hasInternalRed = js.includes('text-destructive') && js.includes('font-bold');
    phase.hasInsuranceToggle = js.includes('insurance_alerts_enabled') || js.includes('הפעל התראות ביטוח');
    const smoke = spawnSync('node', [join(ROOT, 'scripts/ci-smoke-report.mjs'), '--dist', distDir, '--supabase-ref', PROD_REF], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    phase.smokeExit = smoke.status;
    const tarball = join(OUT, `dist-local-${LOCAL_COMMIT.slice(0, 7)}.tgz`);
    if (process.platform === 'win32') {
      execSync(`tar -czf "${tarball}" -C "${ROOT}" dist`, { stdio: 'pipe', shell: true });
    } else {
      execSync(`tar -czf "${tarball}" -C "${ROOT}" dist`, { stdio: 'pipe' });
    }
    phase.tarball = tarball;
    phase.ok = !!bundle && phase.hasProdRef && !phase.hasStagingRef && phase.smokeExit === 0;
  } catch (e) {
    phase.error = String(e.message || e).slice(0, 800);
  }
  return phase;
}

function phaseSshDeploy(distDir) {
  const phase = { ok: false };
  if (SKIP_SSH) {
    phase.skipped = true;
    phase.reason = '--skip-ssh';
    phase.manual = [
      'GitHub → Actions → Deploy Production (dalia-car.online) → workflow_dispatch',
      `commit_sha: ${LOCAL_COMMIT}`,
      'או: העלאת dist מה-tarball ב-backup dir',
    ];
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
    phase.reason = 'No SSH key — use GitHub Actions deploy-production-vps.yml';
    phase.workflowDispatch = { commit_sha: LOCAL_COMMIT, workflow: 'deploy-production-vps.yml' };
    return phase;
  }
  const ssh = `ssh -i "${key}" -o StrictHostKeyChecking=no`;
  const scp = `scp -i "${key}" -o StrictHostKeyChecking=no`;
  try {
    execSync(`${ssh} ${VPS} "tar czf /root/pre-deploy-${TS}.tgz -C ${WEB_BASE} dist"`, { stdio: 'pipe' });
    phase.bundleBefore = execSync(`${ssh} ${VPS} "grep -o 'index-[^\\\"']*\\.js' ${WEB_BASE}/dist/index.html | head -1"`, { encoding: 'utf8' }).trim();
    execSync(`${scp} -r "${distDir}" ${VPS}:${WEB_BASE}/dist-new`, { stdio: 'pipe' });
    execSync(
      `${ssh} ${VPS} "cd ${WEB_BASE} && rm -rf dist-old && mv dist dist-old && mv dist-new dist && echo 'commit=${LOCAL_COMMIT} at=${TS}' > dist/PRODUCTION-DEPLOY.txt && nginx -t && systemctl reload nginx"`,
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
  const keys = getKeys();
  const admin = createClient(PROD_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log('Phase 1: Full Production backup...');
  report.phases.backup = await phaseBackup(admin);
  if (!report.phases.backup.ok) throw new Error('Backup failed — STOP');

  console.log('Phase 2: Schema-only migrations...');
  report.phases.migrations = await phaseMigrations();
  if (!report.phases.migrations.ok) throw new Error('Migration failed — STOP');

  console.log('Phase 3: Verify data integrity...');
  report.phases.verify = await phaseVerify(admin, report.phases.backup.countsBefore);
  if (!report.phases.verify.ok) throw new Error('Data integrity check failed — STOP');

  console.log('Phase 4: Build from LOCAL workspace...');
  report.phases.build = phaseBuild(keys);
  if (!report.phases.build.ok) throw new Error('Build failed');

  console.log('Phase 5: Deploy to VPS...');
  report.phases.deploy = phaseSshDeploy(join(ROOT, 'dist'));

  report.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'deploy-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    backup: report.phases.backup.ok,
    migrations: report.phases.migrations.ok,
    verify: report.phases.verify.ok,
    build: report.phases.build.ok,
    deploy: report.phases.deploy,
    beeriBefore: report.phases.backup.countsBefore.beeriVehicles,
    beeriAfter: report.phases.verify.countsAfter.beeriVehicles,
    out: OUT,
  }, null, 2));

  if (!report.phases.deploy.ok && !report.phases.deploy.skipped) process.exit(1);
}

main().catch((e) => {
  report.fatal = String(e.message || e);
  writeFileSync(join(OUT, 'deploy-report.json'), JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
