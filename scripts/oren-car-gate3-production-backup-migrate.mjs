/**
 * Oren Car Gate 3 — backup + additive migrations ONLY (no code deploy).
 * Production: qasomfndnjuixgjmjwcm / dalia-car.online
 * Does NOT run red-toggles migration. Does NOT sync Staging DB.
 * node scripts/oren-car-gate3-production-backup-migrate.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const VPS = 'root@72.60.36.182';
const WEB_BASE = '/root/future-craft-core';
const EXPECTED_MAIN = '7777a32006f55183418f42ea6d8eedf8c5825ea2';
const EXPECTED_BUNDLE = 'index-XzenxcjZ.js';

const MIG_DRIVER = join(ROOT, 'supabase/migrations/20260811180000_driver_card_option_b_staging.sql');
const MIG_VIS = join(ROOT, 'supabase/migrations/20260812120000_company_attention_visibility_toggles_staging.sql');
const MIG_RED = join(ROOT, 'supabase/migrations/20260811120000_company_attention_red_toggles_staging.sql');

const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(ROOT, 'docs/audit-reports/oren-car-gate3-production', TS);
mkdirSync(OUT, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  scope: 'gate3-backup-migrate-only',
  prodRef: PROD_REF,
  stagingRef: STAGING_REF,
  liveUrl: LIVE,
  expectedMain: EXPECTED_MAIN,
  expectedBundle: EXPECTED_BUNDLE,
  outDir: OUT,
  phases: {},
};

function getKeys(ref) {
  const raw = execSync(`supabase projects api-keys --project-ref ${ref} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key
      || keys.find((k) => k.name === 'anon')?.api_key,
  };
}

function sshKey() {
  const candidates = [
    join(process.env.USERPROFILE || '', '.ssh', 'cursor-dalia-vps'),
    join(process.env.USERPROFILE || '', '.ssh', 'github-actions-dalia'),
    join(process.env.USERPROFILE || '', '.ssh', 'id_ed25519'),
    join(process.env.USERPROFILE || '', '.ssh', 'id_rsa'),
  ];
  return candidates.find((k) => existsSync(k)) || null;
}

async function liveBundle() {
  try {
    const html = await (await fetch(LIVE)).text();
    return html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
  } catch {
    return 'fetch-failed';
  }
}

async function liveDeployTxt() {
  try {
    return (await (await fetch(`${LIVE}/PRODUCTION-DEPLOY.txt`)).text()).trim();
  } catch {
    return 'fetch-failed';
  }
}

async function columnExists(admin, table, columns) {
  const { error } = await admin.from(table).select(columns).limit(1);
  if (!error) return { exists: true, error: null };
  const missing = /does not exist/i.test(error.message || '');
  return { exists: false, missing, error: error.message || String(error) };
}

async function snapshot(admin) {
  const [
    { count: totalVehicles },
    { count: archivedVehicles },
    { count: totalDrivers },
    { count: companySettings },
    { count: documentTypeDefs },
  ] = await Promise.all([
    admin.from('vehicles').select('id', { count: 'exact', head: true }),
    admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('status', 'archived'),
    admin.from('drivers').select('id', { count: 'exact', head: true }),
    admin.from('company_settings').select('id', { count: 'exact', head: true }),
    admin.from('document_type_defs').select('key', { count: 'exact', head: true }),
  ]);
  return {
    totalVehicles: totalVehicles ?? 0,
    archivedVehicles: archivedVehicles ?? 0,
    activeFleetExpected: (totalVehicles ?? 0) - (archivedVehicles ?? 0),
    totalDrivers: totalDrivers ?? 0,
    companySettings: companySettings ?? 0,
    documentTypeDefs: documentTypeDefs ?? 0,
    liveBundle: await liveBundle(),
    liveDeployTxt: await liveDeployTxt(),
  };
}

async function backupTable(admin, table, filter) {
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
  const path = join(OUT, `backup-${table}.json`);
  writeFileSync(path, JSON.stringify(rows, null, 2));
  return { ok: true, rows: rows.length, bytes: statSync(path).size, path };
}

async function runSql(tmpWork, sqlPath, copyName) {
  const sql = readFileSync(sqlPath, 'utf8');
  writeFileSync(join(OUT, copyName), sql);
  if (/DROP\s+|TRUNCATE|DELETE\s+FROM/i.test(sql) && !/ON CONFLICT/i.test(sql)) {
    throw new Error(`Refusing SQL that looks destructive: ${copyName}`);
  }
  const out = execSync(`supabase db query --linked --workdir "${tmpWork}" -f "${sqlPath}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return out;
}

async function main() {
  const originMain = execSync('git rev-parse origin/main', { encoding: 'utf8' }).trim();
  report.originMain = originMain;
  if (originMain !== EXPECTED_MAIN) {
    report.fatal = `STOP: origin/main is ${originMain}, expected ${EXPECTED_MAIN}`;
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.error(report.fatal);
    process.exit(2);
  }

  const keys = getKeys(PROD_REF);
  if (!keys.service) throw new Error('Missing Production service_role key');
  const admin = createClient(PROD_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log('Phase 0: verify live + schema...');
  const beforeCols = {
    show_insurance_attention: await columnExists(admin, 'company_settings', 'show_insurance_attention'),
    show_insurance_attention_red: await columnExists(admin, 'company_settings', 'show_insurance_attention_red'),
    show_gaps_attention: await columnExists(admin, 'company_settings', 'show_gaps_attention'),
    show_gaps_attention_red: await columnExists(admin, 'company_settings', 'show_gaps_attention_red'),
    validity_years: await columnExists(admin, 'document_type_defs', 'key, validity_years'),
  };
  const countsBefore = await snapshot(admin);
  report.phases.verifyBefore = { originMain, countsBefore, beforeCols };
  if (countsBefore.liveBundle !== EXPECTED_BUNDLE) {
    report.fatal = `STOP: live bundle ${countsBefore.liveBundle} != ${EXPECTED_BUNDLE}`;
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.error(report.fatal);
    process.exit(2);
  }
  if (!beforeCols.show_insurance_attention_red.exists || !beforeCols.show_gaps_attention_red.exists) {
    report.fatal = 'STOP: unexpected — _red columns missing on Production';
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.error(report.fatal);
    process.exit(2);
  }

  console.log('Phase 1: DB snapshot...');
  const backup = { ok: false, files: {} };
  backup.files.company_settings = await backupTable(admin, 'company_settings');
  backup.files.document_type_defs = await backupTable(admin, 'document_type_defs');
  backup.countsBefore = countsBefore;
  writeFileSync(join(OUT, 'counts-before.json'), JSON.stringify(countsBefore, null, 2));
  backup.ok = backup.files.company_settings.ok && backup.files.document_type_defs.ok;
  report.phases.backupDb = backup;
  if (!backup.ok) throw new Error('DB backup failed');

  console.log('Phase 1b: VPS dist backup...');
  const key = sshKey();
  const sshPhase = { ok: false, keyFound: Boolean(key), keyName: key ? key.split(/[/\\]/).pop() : null };
  if (!key) {
    sshPhase.skipped = true;
    sshPhase.reason = 'No SSH key found';
    report.phases.backupDist = sshPhase;
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    throw new Error('STOP: dist backup failed — no SSH key');
  }
  const ssh = `ssh -i "${key}" -o StrictHostKeyChecking=no`;
  const remoteTar = `/root/pre-deploy-gate3-${TS}.tgz`;
  execSync(`${ssh} ${VPS} tar czf ${remoteTar} -C ${WEB_BASE} dist`, { stdio: 'pipe' });
  const lsOut = execSync(`${ssh} ${VPS} ls -la ${remoteTar}`, { encoding: 'utf8' });
  sshPhase.backupRemote = remoteTar;
  sshPhase.ls = lsOut.trim();
  sshPhase.bundleBefore = countsBefore.liveBundle;
  sshPhase.ok = Boolean(lsOut.includes('pre-deploy-gate3-') && sshPhase.bundleBefore === EXPECTED_BUNDLE);
  report.phases.backupDist = sshPhase;
  if (!sshPhase.ok) throw new Error(`STOP: dist backup verify failed ls=${lsOut.trim()} bundle=${sshPhase.bundleBefore}`);

  writeFileSync(
    join(OUT, 'restore-point.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        originMain: EXPECTED_MAIN,
        liveBundle: EXPECTED_BUNDLE,
        liveUrl: LIVE,
        prodRef: PROD_REF,
        vpsBackup: remoteTar,
        dbBackupDir: OUT,
        rollbackFrontend: `ssh ${VPS} "cd ${WEB_BASE} && tar xzf ${remoteTar} && nginx -t && systemctl reload nginx"`,
        rollbackDb: 'Additive only — do not DROP without Owner approval',
      },
      null,
      2,
    ),
  );

  const tmpWork = join(process.env.TEMP || '/tmp', `fcc-gate3-mig-${Date.now()}`);
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`supabase link --project-ref ${PROD_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });

  console.log('Phase 2: driver card / validity_years migration...');
  const mig1 = { ok: false, skipped: false, file: '20260811180000_driver_card_option_b_staging.sql' };
  if (beforeCols.validity_years.exists) {
    mig1.skipped = true;
    mig1.reason = 'validity_years already exists';
    mig1.ok = true;
  } else {
    if (!existsSync(MIG_RED)) {
      /* red migration must not be run; existence check only */
    }
    mig1.sqlPreview = readFileSync(MIG_DRIVER, 'utf8').slice(0, 200);
    mig1.output = (await runSql(tmpWork, MIG_DRIVER, mig1.file)).slice(0, 600);
    const afterVy = await columnExists(admin, 'document_type_defs', 'key, validity_years');
    mig1.after = afterVy;
    mig1.ok = afterVy.exists;
    const { data: types, error: typeErr } = await admin
      .from('document_type_defs')
      .select('key, validity_years, label_he')
      .in('key', ['traffic_info', 'traffic_ticket', 'health_declaration']);
    mig1.typeVerify = { rows: types, error: typeErr?.message || null };
  }
  report.phases.migrationDriverCard = mig1;
  if (!mig1.ok) throw new Error('validity_years migration failed');

  console.log('Phase 3: visibility toggles migration (NOT red)...');
  const mig2 = { ok: false, skipped: false, file: '20260812120000_company_attention_visibility_toggles_staging.sql' };
  if (beforeCols.show_insurance_attention.exists && beforeCols.show_gaps_attention.exists) {
    mig2.skipped = true;
    mig2.reason = 'visibility columns already exist';
    mig2.ok = true;
  } else {
    mig2.sqlPreview = readFileSync(MIG_VIS, 'utf8').slice(0, 250);
    mig2.output = (await runSql(tmpWork, MIG_VIS, mig2.file)).slice(0, 600);
    const afterVis = {
      show_insurance_attention: await columnExists(admin, 'company_settings', 'show_insurance_attention'),
      show_gaps_attention: await columnExists(admin, 'company_settings', 'show_gaps_attention'),
      show_insurance_attention_red: await columnExists(admin, 'company_settings', 'show_insurance_attention_red'),
      show_gaps_attention_red: await columnExists(admin, 'company_settings', 'show_gaps_attention_red'),
    };
    mig2.after = afterVis;
    mig2.ok =
      afterVis.show_insurance_attention.exists &&
      afterVis.show_gaps_attention.exists &&
      afterVis.show_insurance_attention_red.exists &&
      afterVis.show_gaps_attention_red.exists;
  }
  report.phases.migrationVisibility = mig2;
  if (!mig2.ok) throw new Error('visibility migration failed');

  console.log('Phase 4: verify counts unchanged...');
  const countsAfter = await snapshot(admin);
  const verify = {
    countsAfter,
    countsMatch:
      countsAfter.totalVehicles === countsBefore.totalVehicles &&
      countsAfter.archivedVehicles === countsBefore.archivedVehicles &&
      countsAfter.totalDrivers === countsBefore.totalDrivers &&
      countsAfter.companySettings === countsBefore.companySettings,
    redUntouched: true,
  };
  verify.ok = verify.countsMatch;
  writeFileSync(join(OUT, 'counts-after.json'), JSON.stringify(verify, null, 2));
  report.phases.verifyAfter = verify;
  if (!verify.ok) throw new Error('count mismatch after migration');

  report.endedAt = new Date().toISOString();
  report.ok = true;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  report.fatal = String(e.message || e);
  report.endedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
