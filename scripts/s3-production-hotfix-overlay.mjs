/**
 * S3 ONLY — Hostinger hotfix overlay on the live Production tree.
 * Base: 2e96b9b + expiry-officer overlay (current live). Then signed-URL + token RPC files.
 * Does NOT deploy full Staging. Does NOT change Auth/Login/Settings. Does NOT touch DB/C4/bucket/Edge.
 * node scripts/s3-production-hotfix-overlay.mjs
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const VPS = 'dalia-vps';
const WEB_BASE = '/root/future-craft-core';
const PROD_SOURCE = '2e96b9b1522cab8995b40738d02af5571a361d28';
const EXPIRY_FEATURE = '32c196e0';
const S1_TARBALL = '/root/s1-safety-backup-2026-08-19T061550Z.tgz';
const S1_SHA = '85658300f848e6048ee0a78f48ef7272ff5cab8cece8ccefeed7062feb060835';
const EXPECTED_LIVE_BUNDLE = 'index-CECbN36N.js';
const WORKTREE = 'C:\\Temp\\s3-signedurl-rpc-prod';
const ARTIFACTS = 'C:\\Temp\\s3-signedurl-rpc-artifacts';
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(ROOT, 'public/project-001/production-s3-hotfix-report.json');

const EXPIRY_FILES = [
  'scripts/generate-spa-route-shells.mjs',
  'src/App.tsx',
  'src/components/drivers/DriverHub.tsx',
  'src/components/expiry/ExpiryPendingCard.tsx',
  'src/components/expiry/ExpiryPendingInline.tsx',
  'src/components/expiry/ExpiryRenewDialog.tsx',
  'src/components/home/HomeAlertsWidget.tsx',
  'src/components/vehicles/VehicleDashboard.tsx',
  'src/components/vehicles/VehicleHub.tsx',
  'src/lib/expiryOfficerApproval.test.ts',
  'src/lib/expiryOfficerApproval.ts',
  'src/lib/fleetAlerts.ts',
  'src/lib/routeAccess.test.ts',
  'src/lib/routeAccess.ts',
  'src/pages/Drivers.tsx',
  'src/pages/ExpiryApprovals.tsx',
];

const S3_FILES = [
  'src/lib/documentUrl.ts',
  'src/lib/tokenScopedAccess.ts',
  'src/components/documents/DocumentViewer.tsx',
  'src/utils/printDeclaration.ts',
  'src/pages/SignDeclaration.tsx',
  'src/pages/TakeDrivingExam.tsx',
  'src/components/driving-exam/ExamRunner.tsx',
  'src/components/DriverDeclaration.tsx',
  'src/components/ImageUpload.tsx',
  'src/components/MultiImageUpload.tsx',
  'src/components/drivers/DriverDocumentsPanel.tsx',
  'src/lib/documentRequestClient.ts',
  'src/lib/uploadDocument.ts',
  'src/lib/vehicleHistory.ts',
  'src/lib/vehicleHubData.ts',
  'src/pages/Accidents.tsx',
  'src/pages/CustomerDocs.tsx',
  'src/pages/Documents.tsx',
  'src/pages/HealthDeclaration.tsx',
  'src/pages/VehicleExchange.tsx',
  'src/components/DeclarationPreviewModal.tsx',
  'src/components/documents/EntityDocumentRequestsPanel.tsx',
  'src/components/driving-exam/DriverExamsTab.tsx',
  'src/components/vehicles/VehicleDashboard.tsx',
  'src/lib/driverHubData.ts',
  'src/pages/DriverDeclarations.tsx',
];

const FORBIDDEN_OVERLAY = [
  'src/contexts/AuthContext.tsx',
  'src/pages/Login.tsx',
  'src/pages/Settings.tsx',
  'supabase/migrations',
  'supabase/functions',
];

const report = {
  id: 'production-s3-hotfix',
  at: new Date().toISOString(),
  step: 'S3',
  s4Started: false,
  c4Closed: false,
  bucketChanged: false,
  dbChanged: false,
  edgeChanged: false,
  fullStagingDeploy: false,
  tests: [],
  created: [],
  rollbackDone: false,
  verdict: 'FAIL',
};

function rec(name, ok, extra = {}) {
  const row = { name, ok, ...extra };
  report.tests.push(row);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) throw new Error(`STOP: ${name}`);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

function ssh(remote) {
  return execSync('ssh -o BatchMode=yes -o ConnectTimeout=20 dalia-vps bash -s', {
    encoding: 'utf8',
    input: `${remote}\n`,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function extractRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    if (payload.length && Array.isArray(payload[0]?.rows)) return payload[0].rows;
    return payload;
  }
  if (typeof payload === 'string') {
    try {
      return extractRows(JSON.parse(payload));
    } catch {
      return [];
    }
  }
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function dbSql(sql) {
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error('ABORT: SQL must be SELECT');
  const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-s3-ro');
  mkdirSync(tmpWork, { recursive: true });
  mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
  execSync(`npx --yes supabase link --project-ref ${PROD_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const sqlFile = join(tmpWork, 'query.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  const raw = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return extractRows(raw);
}

function bundleFromHtml(html) {
  return (String(html).match(/assets\/(index-[^"']+\.js)/) || [])[1] || (String(html).match(/(index-[^"']+\.js)/) || [])[1] || null;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function keys() {
  const raw = sh(`npx --yes supabase projects api-keys --project-ref ${PROD_REF} -o json`);
  const arr = JSON.parse(raw);
  return {
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

function rollbackLive(reason) {
  console.log(`ROLLBACK live dist: ${reason}`);
  const out = ssh(`
    set -e
    cd ${WEB_BASE}
    if [ -d dist-old ] && [ -f dist-old/index.html ]; then
      rm -rf dist-failed-s3
      mv dist dist-failed-s3 || true
      mv dist-old dist
      nginx -t && systemctl reload nginx
      echo ROLLBACK_DIST_OLD=yes
    else
      mkdir -p /tmp/s3-rollback-s1
      rm -rf /tmp/s3-rollback-s1/dist
      tar xzf ${S1_TARBALL} -C /tmp/s3-rollback-s1
      test -f /tmp/s3-rollback-s1/dist/index.html
      rm -rf dist-failed-s3
      mv dist dist-failed-s3 || true
      mv /tmp/s3-rollback-s1/dist dist
      nginx -t && systemctl reload nginx
      echo ROLLBACK_S1=yes
    fi
    grep -oE 'index-[^"'"'"'/]+\\.js' dist/index.html | head -1
  `);
  report.rollbackDone = true;
  report.rollbackReason = reason;
  report.rollbackRaw = out;
  return out;
}

function writeReport() {
  mkdirSync(join(ROOT, 'public/project-001'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

try {
  for (const f of S3_FILES) {
    if (FORBIDDEN_OVERLAY.some((bad) => f === bad || f.startsWith(String(bad)))) {
      throw new Error(`STOP: forbidden overlay file ${f}`);
    }
  }

  const liveBefore = await fetchText(LIVE + '/');
  const liveBundleBefore = bundleFromHtml(liveBefore.text);
  report.liveBundleBefore = liveBundleBefore;
  rec('live site before still old bundle', liveBefore.ok && liveBundleBefore === EXPECTED_LIVE_BUNDLE, {
    http: liveBefore.status,
    bundle: liveBundleBefore,
  });

  const s1 = ssh(`
    set -e
    test -f ${S1_TARBALL}
    SHA=$(sha256sum ${S1_TARBALL} | awk '{print $1}')
    echo SHA=$SHA
    echo BYTES=$(stat -c%s ${S1_TARBALL})
    echo LIVE_OK=$(test -f ${WEB_BASE}/dist/index.html && echo yes || echo no)
    echo LIVE_BUNDLE=$(grep -oE 'assets/index-[^"'"'"']+\\.js' ${WEB_BASE}/dist/index.html | head -1)
  `);
  report.s1Check = s1;
  rec('S1 tarball present and SHA matches', s1.includes(`SHA=${S1_SHA}`) && s1.includes('LIVE_OK=yes'), { s1 });

  const rpcs = dbSql(`
    SELECT p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_declaration_by_token','sign_declaration_by_token',
        'get_driving_exam_by_token','start_driving_exam_by_token','submit_driving_exam_by_token'
      )
    ORDER BY 1
  `).map((r) => r.name);
  rec('five RPCs still present from S2', rpcs.length === 5, { rpcs });

  const countsBefore = dbSql('SELECT bucket_id, count(*)::int AS files FROM storage.objects GROUP BY 1 ORDER BY 1');
  rec('documents file count still 370 before deploy', countsBefore.some((r) => r.bucket_id === 'documents' && Number(r.files) === 370), {
    countsBefore,
  });

  const c4Before = dbSql(`
    SELECT policyname FROM pg_policies
    WHERE policyname IN (
      'Anonymous can view by token','Anonymous can update by token',
      'Anon view exam by token','Anon submit exam by token'
    )
  `);
  rec('C4 policies still present before deploy', c4Before.length === 4, { names: c4Before.map((r) => r.policyname) });

  const bucketBefore = dbSql("SELECT id, public::text AS public FROM storage.buckets WHERE id = 'documents'")[0];
  rec('documents bucket still public before deploy', bucketBefore?.public === 'true', { bucketBefore });

  const stagingSha = sh('git rev-parse HEAD');
  const expirySha = sh(`git rev-parse ${EXPIRY_FEATURE}`);
  report.stagingSha = stagingSha;
  report.expirySha = expirySha;
  report.prodSource = PROD_SOURCE;

  if (existsSync(WORKTREE)) {
    try {
      sh(`git worktree remove "${WORKTREE}" --force`);
    } catch {
      rmSync(WORKTREE, { recursive: true, force: true });
    }
  }
  sh(`git worktree add --detach "${WORKTREE}" ${PROD_SOURCE}`);
  sh(`git checkout ${expirySha} -- ${EXPIRY_FILES.join(' ')}`, { cwd: WORKTREE });
  sh(`git checkout ${stagingSha} -- ${S3_FILES.join(' ')}`, { cwd: WORKTREE });

  const diffStat = sh('git diff --stat', { cwd: WORKTREE });
  report.worktreeDiffStat = diffStat;
  if (/supabase\/(migrations|functions)/i.test(diffStat) || /AuthContext|pages\/Login|pages\/Settings/.test(diffStat)) {
    throw new Error(`STOP: overlay escaped S3 scope\n${diffStat}`);
  }

  let leftoverPublicUrl = '';
  try {
    leftoverPublicUrl = sh('git grep -nF ".getPublicUrl(" -- src', { cwd: WORKTREE });
  } catch {
    leftoverPublicUrl = '';
  }
  rec('no getPublicUrl left in overlay src', !leftoverPublicUrl.trim(), { leftoverPublicUrl: leftoverPublicUrl.slice(0, 400) });

  const k = keys();
  if (!k.anon) throw new Error('STOP: missing Production anon key');
  const nm = join(WORKTREE, 'node_modules');
  if (!existsSync(nm)) {
    sh(`cmd /c mklink /J "${nm}" "${join(ROOT, 'node_modules')}"`);
  }
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: PROD_URL,
    VITE_SUPABASE_PROJECT_ID: PROD_REF,
    VITE_SUPABASE_PUBLISHABLE_KEY: k.anon,
    VITE_BASE_PATH: '/',
  };
  execSync('npm run build', { cwd: WORKTREE, env, stdio: 'inherit', shell: true });

  const distHtml = readFileSync(join(WORKTREE, 'dist', 'index.html'), 'utf8');
  const bundle = bundleFromHtml(distHtml);
  if (!bundle) throw new Error('STOP: no bundle in build');
  const js = readFileSync(join(WORKTREE, 'dist', 'assets', bundle.replace(/^assets\//, '')), 'utf8');
  report.build = {
    bundle,
    hasProdRef: js.includes(PROD_REF),
    hasStagingRef: js.includes(STAGING_REF),
    hasDeclarationRpc: js.includes('get_declaration_by_token'),
    hasSignRpc: js.includes('sign_declaration_by_token'),
    hasExamRpc: js.includes('get_driving_exam_by_token'),
    hasSignedUrl: js.includes('createSignedUrl') || js.includes('/object/sign/'),
    hasExpiryLabel: js.includes('ממתינים לאישור קצין רכב'),
    hasGetPublicUrl: js.includes('getPublicUrl'),
  };
  rec('build uses Production supabase ref', report.build.hasProdRef && !report.build.hasStagingRef, report.build);
  rec('build contains token RPCs', report.build.hasDeclarationRpc && report.build.hasSignRpc && report.build.hasExamRpc, report.build);
  rec('build contains signed URL helper', report.build.hasSignedUrl, report.build);
  rec('build keeps expiry officer', report.build.hasExpiryLabel, report.build);
  const bundleFile = bundle.replace(/^assets\//, '');
  rec('build bundle is not the old live bundle', bundleFile !== EXPECTED_LIVE_BUNDLE, { bundle, bundleFile });

  const smokeRaw = sh(`node "${join(ROOT, 'scripts/ci-smoke-report.mjs')}" --dist "${join(WORKTREE, 'dist')}" --supabase-ref ${PROD_REF}`);
  const smokeJson = smokeRaw.slice(smokeRaw.indexOf('{'));
  report.smoke = JSON.parse(smokeJson);
  rec('ci-smoke on overlay dist', report.smoke.passed === true, { failures: report.smoke.failures || [] });

  const deployTxt = `commit=s3-hotfix-overlay source=${PROD_SOURCE.slice(0, 7)} expiry=${expirySha.slice(0, 7)} stagingFiles=${stagingSha.slice(0, 7)} bundle=${bundle} deployed_at=${TS} reason=s3-signed-url-rpc-overlay-only\n`;
  writeFileSync(join(WORKTREE, 'dist', 'PRODUCTION-DEPLOY.txt'), deployTxt);
  report.deployTxt = deployTxt.trim();

  mkdirSync(ARTIFACTS, { recursive: true });
  const tarball = join(ARTIFACTS, `dist-s3-${TS}.tgz`);
  execSync(`tar -czf "${tarball}" -C "${WORKTREE}" dist`, { stdio: 'inherit', shell: true });
  report.localTarball = tarball;

  const remoteBackup = `/root/pre-s3-dist-${TS}.tgz`;
  const remoteTar = `/root/dist-s3-${TS}.tgz`;
  const backupOut = ssh(`tar czf ${remoteBackup} -C ${WEB_BASE} dist && echo BACKUP=${remoteBackup} && test -f ${S1_TARBALL} && echo S1_STILL=yes`);
  report.remoteBackup = remoteBackup;
  rec('extra pre-S3 dist tarball created on VPS', backupOut.includes(`BACKUP=${remoteBackup}`), { backupOut });

  sh(`scp -o BatchMode=yes "${tarball}" ${VPS}:${remoteTar}`);
  const swap = ssh(`
    set -e
    cd ${WEB_BASE}
    rm -rf dist-new
    mkdir dist-new
    tar -xzf ${remoteTar} -C dist-new --strip-components=1
    test -f dist-new/index.html
    test -f dist-new/assets/${bundleFile}
    rm -rf dist-old
    mv dist dist-old
    mv dist-new dist
    nginx -t
    systemctl reload nginx
    cat dist/PRODUCTION-DEPLOY.txt
    ls dist/assets/index-*.js
  `);
  report.vpsSwap = swap;
  rec('atomic dist swap on VPS', swap.includes(bundleFile) && swap.includes('s3-hotfix-overlay'), {
    swap: swap.slice(0, 800),
  });

  await new Promise((r) => setTimeout(r, 3000));
  const liveAfter = await fetchText(LIVE + '/');
  const liveBundleAfter = bundleFromHtml(liveAfter.text);
  report.liveBundleAfter = liveBundleAfter;
  const expectedAsset = bundle.startsWith('assets/') ? bundle : `assets/${bundle}`;
  if (!(liveAfter.ok && (liveBundleAfter === bundle || `assets/${liveBundleAfter}` === expectedAsset || liveBundleAfter === expectedAsset.replace(/^assets\//, '')))) {
    rollbackLive('live bundle mismatch after swap');
    throw new Error(`STOP: live bundle ${liveBundleAfter} expected ${bundle}`);
  }
  rec('live site new bundle', true, { http: liveAfter.status, bundle: liveBundleAfter });

  const liveJs = await fetchText(`${LIVE}/${expectedAsset.startsWith('assets/') ? expectedAsset : 'assets/' + expectedAsset}`);
  rec('live JS contains token RPC', liveJs.ok && liveJs.text.includes('get_declaration_by_token'), { http: liveJs.status });
  rec('live JS contains signed URL', liveJs.ok && (liveJs.text.includes('createSignedUrl') || liveJs.text.includes('/object/sign/')), {
    http: liveJs.status,
  });
  rec('live JS is Production not Staging', liveJs.text.includes(PROD_REF) && !liveJs.text.includes(STAGING_REF));

  const loginPage = await fetchText(LIVE + '/login');
  rec('login route still serves SPA', loginPage.ok, { http: loginPage.status });
  const signPage = await fetchText(LIVE + '/sign-declaration');
  rec('sign-declaration route still serves SPA', signPage.ok, { http: signPage.status });
  const examPage = await fetchText(LIVE + '/take-exam');
  rec('take-exam route still serves SPA', examPage.ok, { http: examPage.status });

  const countsAfter = dbSql('SELECT bucket_id, count(*)::int AS files FROM storage.objects GROUP BY 1 ORDER BY 1');
  rec('documents file count still 370 after deploy', countsAfter.some((r) => r.bucket_id === 'documents' && Number(r.files) === 370), {
    countsAfter,
  });
  const c4After = dbSql(`
    SELECT policyname FROM pg_policies
    WHERE policyname IN (
      'Anonymous can view by token','Anonymous can update by token',
      'Anon view exam by token','Anon submit exam by token'
    )
  `);
  rec('C4 policies still present after deploy', c4After.length === 4, { names: c4After.map((r) => r.policyname) });
  const bucketAfter = dbSql("SELECT id, public::text AS public FROM storage.buckets WHERE id = 'documents'")[0];
  rec('documents bucket still public after deploy', bucketAfter?.public === 'true', { bucketAfter });
  const rpcsAfter = dbSql(`
    SELECT p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_declaration_by_token','sign_declaration_by_token',
        'get_driving_exam_by_token','start_driving_exam_by_token','submit_driving_exam_by_token'
      )
    ORDER BY 1
  `).map((r) => r.name);
  rec('five RPCs unchanged after deploy', rpcsAfter.length === 5, { rpcsAfter });

  report.verdict = 'PASS';
  report.safeToRequestS4 = true;
  report.rollbackPlan = `Restore dist from ${remoteBackup} or ${S1_TARBALL}. DB untouched.`;
} catch (e) {
  report.verdict = 'FAIL';
  report.error = String(e.message || e).slice(0, 1200);
  if (report.vpsSwap && !report.rollbackDone) {
    try {
      rollbackLive(report.error);
    } catch (re) {
      report.rollbackError = String(re.message || re).slice(0, 800);
    }
  }
}

writeReport();
console.log(JSON.stringify({
  wrote: OUT,
  verdict: report.verdict,
  liveBundleBefore: report.liveBundleBefore,
  liveBundleAfter: report.liveBundleAfter,
  rollbackDone: report.rollbackDone,
  s4Started: false,
  error: report.error || null,
}, null, 2));
process.exit(report.verdict === 'PASS' ? 0 : 1);
