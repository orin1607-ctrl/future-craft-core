/**
 * Oren Car — Production deploy: insurance gap fix + company attention toggles
 * CODE ONLY + additive schema migration if columns missing.
 * node scripts/oren-car-insurance-gap-production-deploy.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const VPS = 'root@72.60.36.182';
const WEB_BASE = '/root/future-craft-core';
const MIGRATION = join(
  ROOT,
  'supabase/migrations/20260811120000_company_attention_red_toggles_staging.sql',
);

const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-insurance-gap-fix', `production-${TS}`);
mkdirSync(OUT, { recursive: true });

const LOCAL_COMMIT = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const report = {
  startedAt: new Date().toISOString(),
  localCommit: LOCAL_COMMIT,
  prodRef: PROD_REF,
  liveUrl: LIVE,
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

async function snapshotCounts(admin) {
  const [{ count: totalVehicles }, { count: totalDrivers }, { count: companySettings }] = await Promise.all([
    admin.from('vehicles').select('id', { count: 'exact', head: true }),
    admin.from('drivers').select('id', { count: 'exact', head: true }),
    admin.from('company_settings').select('id', { count: 'exact', head: true }),
  ]);
  let liveBundle = null;
  try {
    const html = await (await fetch(LIVE)).text();
    liveBundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
  } catch {
    liveBundle = 'fetch-failed';
  }
  return { totalVehicles, totalDrivers, companySettings, liveBundle };
}

async function checkAttentionColumns(admin) {
  const { error } = await admin.from('company_settings').select('show_insurance_attention_red, show_gaps_attention_red').limit(1);
  return { exists: !error, error: error?.message || null };
}

async function phaseBackup(admin) {
  const phase = { ok: false };
  const tables = ['vehicles', 'drivers', 'company_settings', 'document_metadata'];
  phase.files = {};
  for (const t of tables) {
    const { data, error } = await admin.from(t).select('*').limit(5000);
    if (error) {
      phase.files[t] = { ok: false, error: error.message };
      continue;
    }
    const path = join(OUT, `backup-${t}.json`);
    writeFileSync(path, JSON.stringify(data, null, 2));
    phase.files[t] = { ok: true, rows: data.length, bytes: statSync(path).size };
  }
  phase.countsBefore = await snapshotCounts(admin);
  phase.columnCheckBefore = await checkAttentionColumns(admin);
  writeFileSync(join(OUT, 'counts-before.json'), JSON.stringify(phase, null, 2));
  phase.ok = phase.files.vehicles?.ok && phase.files.drivers?.ok;
  return phase;
}

async function phaseMigration(admin, colBefore) {
  const phase = { ok: true, skipped: false, sql: null };
  if (colBefore.exists) {
    phase.skipped = true;
    phase.reason = 'columns already exist';
    return phase;
  }
  phase.sql = readFileSync(MIGRATION, 'utf8');
  writeFileSync(join(OUT, 'migration-sql-exact.sql'), phase.sql);
  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-prod-ins-gap-${Date.now()}`);
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  try {
    execSync(`supabase link --project-ref ${PROD_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
    const out = execSync(`supabase db query --linked --workdir "${tmpWork}" -f "${MIGRATION}"`, { encoding: 'utf8', stdio: 'pipe' });
    phase.output = out.slice(0, 400);
  } catch (e) {
    phase.ok = false;
    phase.error = String(e.message || e).slice(0, 800);
    return phase;
  }
  const colAfter = await checkAttentionColumns(admin);
  phase.columnCheckAfter = colAfter;
  phase.ok = colAfter.exists;
  return phase;
}

async function phaseVerify(admin, before) {
  const after = await snapshotCounts(admin);
  const phase = {
    countsAfter: after,
    countsMatch:
      after.totalVehicles === before.totalVehicles &&
      after.totalDrivers === before.totalDrivers &&
      after.companySettings === before.companySettings,
    ok: false,
  };
  phase.ok = phase.countsMatch;
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
    const js = readFileSync(join(distDir, 'assets', bundle), 'utf8');
    phase.hasProdRef = js.includes(PROD_REF);
    phase.hasStagingRef = js.includes('usfeoerkpcafxxlyuldl');
    phase.hasInsuranceCoverage = js.includes('vehicleInsuranceCoverage') || js.includes('missingMandatoryDocLabel');
    const smoke = spawnSync('node', [join(ROOT, 'scripts/ci-smoke-report.mjs'), '--dist', distDir, '--supabase-ref', PROD_REF], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    phase.smokeExit = smoke.status;
    const tarball = join(OUT, `dist-${LOCAL_COMMIT.slice(0, 7)}.tgz`);
    execSync(`tar -czf "${tarball}" -C "${ROOT}" dist`, { stdio: 'pipe', shell: true });
    phase.tarball = tarball;
    phase.ok = !!bundle && phase.hasProdRef && !phase.hasStagingRef && phase.smokeExit === 0;
  } catch (e) {
    phase.error = String(e.message || e).slice(0, 800);
  }
  return phase;
}

function phaseSshDeploy(distDir) {
  const phase = { ok: false };
  const keyCandidates = [
    join(process.env.USERPROFILE || '', '.ssh', 'github-actions-dalia'),
    join(process.env.USERPROFILE || '', '.ssh', 'id_ed25519'),
    join(process.env.USERPROFILE || '', '.ssh', 'id_rsa'),
  ];
  const key = keyCandidates.find((k) => existsSync(k));
  if (!key) {
    phase.skipped = true;
    phase.reason = 'No SSH key found';
    return phase;
  }
  const ssh = `ssh -i "${key}" -o StrictHostKeyChecking=no`;
  const scp = `scp -i "${key}" -o StrictHostKeyChecking=no`;
  try {
    execSync(`${ssh} ${VPS} "tar czf /root/pre-deploy-ins-gap-${TS}.tgz -C ${WEB_BASE} dist"`, { stdio: 'pipe' });
    phase.backupRemote = `/root/pre-deploy-ins-gap-${TS}.tgz`;
    phase.bundleBefore = execSync(`${ssh} ${VPS} "grep -o 'index-[^\\\"']*\\.js' ${WEB_BASE}/dist/index.html | head -1"`, {
      encoding: 'utf8',
    }).trim();
    execSync(`${scp} -r "${distDir}" ${VPS}:${WEB_BASE}/dist-new`, { stdio: 'pipe' });
    execSync(
      `${ssh} ${VPS} "cd ${WEB_BASE} && rm -rf dist-old && mv dist dist-old && mv dist-new dist && echo 'commit=${LOCAL_COMMIT} at=${TS} reason=insurance-gap-fix' > dist/PRODUCTION-DEPLOY.txt && nginx -t && systemctl reload nginx"`,
      { stdio: 'pipe' },
    );
    phase.bundleAfter = execSync(`${ssh} ${VPS} "grep -o 'index-[^\\\"']*\\.js' ${WEB_BASE}/dist/index.html | head -1"`, {
      encoding: 'utf8',
    }).trim();
    phase.ok = phase.bundleBefore !== phase.bundleAfter;
  } catch (e) {
    phase.error = String(e.message || e).slice(0, 800);
  }
  return phase;
}

async function main() {
  const keys = getKeys();
  const admin = createClient(PROD_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log('Phase 1: backup...');
  report.phases.backup = await phaseBackup(admin);
  if (!report.phases.backup.ok) throw new Error('backup failed');

  console.log('Phase 2: migration (if needed)...');
  report.phases.migration = await phaseMigration(admin, report.phases.backup.columnCheckBefore);
  if (!report.phases.migration.ok) throw new Error('migration failed');

  console.log('Phase 3: verify counts...');
  report.phases.verify = await phaseVerify(admin, report.phases.backup.countsBefore);
  if (!report.phases.verify.ok) throw new Error('verify failed');

  console.log('Phase 4: production build...');
  report.phases.build = phaseBuild(keys);
  if (!report.phases.build.ok) throw new Error('build failed');

  console.log('Phase 5: SSH deploy...');
  report.phases.deploy = phaseSshDeploy(join(ROOT, 'dist'));
  if (!report.phases.deploy.ok) throw new Error(report.phases.deploy.skipped ? 'SSH skipped — deploy manually' : 'deploy failed');

  report.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'deploy-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  report.fatal = String(e.message || e);
  writeFileSync(join(OUT, 'deploy-report.json'), JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
