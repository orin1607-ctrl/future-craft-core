/**
 * Oren Car Production deploy — DriverHub 3-tile + design delta ONLY.
 * Builds from origin/main + 4 approved files. No DB / migration / nginx.conf change.
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const VPS_HOST = 'dalia-vps';
const WEB_BASE = '/root/future-craft-core';
const SRC_HEAD = 'c667595cc4799fc65d92c84fdcfa5fa992432d62';
const FILES = [
  'src/components/drivers/DriverHub.tsx',
  'src/lib/driverHubData.ts',
  'src/lib/driverHubData.test.ts',
  'src/components/documents/EntityDocumentRequestsPanel.tsx',
];
const WORKTREE = join(process.env.TEMP || 'C:\\Temp', 'oren-car-3tiles-prod');
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(ROOT, 'docs/audit-reports/oren-car-driverhub-3tiles-prod', `deploy-${TS}`);
mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  outDir: OUT,
  srcHead: SRC_HEAD,
  prodRef: PROD_REF,
  live: LIVE,
  files: FILES,
  dbChange: false,
  migration: false,
  nginxConfigChanged: false,
};

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

function keys() {
  const raw = sh(`supabase projects api-keys --project-ref ${PROD_REF} -o json`);
  const arr = JSON.parse(raw);
  return {
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

async function main() {
  report.originMainBefore = sh('git rev-parse origin/main');
  const htmlBefore = await (await fetch(LIVE + '/')).text();
  report.liveBundleBefore = htmlBefore.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;

  if (existsSync(WORKTREE)) {
    try { sh(`git worktree remove "${WORKTREE}" --force`); } catch { rmSync(WORKTREE, { recursive: true, force: true }); }
  }
  sh(`git fetch origin main`);
  sh(`git worktree add -b feat/oren-car-driverhub-3tiles-prod "${WORKTREE}" origin/main`);
  sh(`git checkout ${SRC_HEAD} -- ${FILES.join(' ')}`, { cwd: WORKTREE });
  const wtStatus = sh('git status -sb', { cwd: WORKTREE });
  report.worktreeStatus = wtStatus;
  const wtDiff = sh(`git diff --cached --stat`, { cwd: WORKTREE });
  report.worktreeDiffStat = wtDiff;
  writeFileSync(join(OUT, 'worktree-diff.patch'), sh(`git diff --cached`, { cwd: WORKTREE }));

  const msgFile = join(OUT, 'COMMIT_MSG.txt');
  writeFileSync(
    msgFile,
    'ux(oren-car): DriverHub 3 tiles + navy design on Production\n\nDocuments+requests in one tile; exams+accidents; history. Keep old deep-links. UI only — no DB/schema change.\n',
  );
  sh(`git commit -F "${msgFile}"`, { cwd: WORKTREE });
  report.prodCommit = sh('git rev-parse HEAD', { cwd: WORKTREE });
  report.prodSubject = sh('git log -1 --format=%s', { cwd: WORKTREE });

  sh('git push -u origin HEAD', { cwd: WORKTREE });
  sh('git push origin HEAD:main', { cwd: WORKTREE });
  sh('git fetch origin main');
  report.originMainAfter = sh('git rev-parse origin/main');
  if (report.originMainAfter !== report.prodCommit) {
    throw new Error(`main HEAD mismatch after push: ${report.originMainAfter} != ${report.prodCommit}`);
  }

  const k = keys();
  const nm = join(WORKTREE, 'node_modules');
  if (!existsSync(nm)) {
    sh(`cmd /c mklink /J "${nm}" "${join(ROOT, 'node_modules')}"`);
  }
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: PROD_URL,
    VITE_SUPABASE_PROJECT_ID: PROD_REF,
    VITE_SUPABASE_PUBLISHABLE_KEY: k.anon,
  };
  sh('npm run build', { cwd: WORKTREE, env });
  const distHtml = readFileSync(join(WORKTREE, 'dist', 'index.html'), 'utf8');
  const bundle = distHtml.match(/assets\/(index-[^"']+\.js)/)?.[1];
  if (!bundle) throw new Error('build produced no index bundle');
  const js = readFileSync(join(WORKTREE, 'dist', 'assets', bundle), 'utf8');
  report.build = {
    bundle,
    hasProdRef: js.includes(PROD_REF),
    hasStagingRef: js.includes(STAGING_REF),
    hasThreeTiles: js.includes('מבחנים ותאונות') && js.includes('היסטוריה והערות'),
    hasOldFourTile: js.includes('בקשות ושליחה') && js.includes('מסמכים ורישיון'),
  };
  if (!report.build.hasProdRef || report.build.hasStagingRef) {
    throw new Error(`bundle env mismatch: ${JSON.stringify(report.build)}`);
  }
  if (!report.build.hasThreeTiles) throw new Error('bundle missing 3-tile labels');

  const deployTxt = `commit=${report.prodCommit} bundle=${bundle} at=${new Date().toISOString()} reason=driverhub-3tiles-design\n`;
  writeFileSync(join(WORKTREE, 'dist', 'PRODUCTION-DEPLOY.txt'), deployTxt);
  report.deployTxt = deployTxt.trim();

  const tarball = join(OUT, `dist-${report.prodCommit.slice(0, 7)}.tgz`);
  sh(`tar -czf "${tarball}" -C "${WORKTREE}" dist`, { shell: true });
  report.tarball = tarball;

  const remoteTar = `/root/dist-driverhub-3tiles-${TS}.tgz`;
  sh(`scp -o BatchMode=yes "${tarball}" ${VPS_HOST}:${remoteTar}`);
  const swap = sh(
    `ssh -o BatchMode=yes ${VPS_HOST} "cd ${WEB_BASE} && rm -rf dist-new && mkdir dist-new && tar -xzf ${remoteTar} -C dist-new --strip-components=1 && test -f dist-new/index.html && rm -rf dist-old && mv dist dist-old && mv dist-new dist && cat dist/PRODUCTION-DEPLOY.txt && ls dist/assets/index-*.js"`,
  );
  report.vpsSwap = swap;
  // no nginx.conf edit; reload not required for static swap

  await new Promise((r) => setTimeout(r, 2000));
  const htmlAfter = await (await fetch(LIVE + '/', { headers: { 'Cache-Control': 'no-cache' } })).text();
  report.liveBundleAfter = htmlAfter.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
  try {
    report.liveDeployTxtAfter = (await (await fetch(LIVE + '/PRODUCTION-DEPLOY.txt', { headers: { 'Cache-Control': 'no-cache' } })).text()).trim();
  } catch {
    report.liveDeployTxtAfter = null;
  }
  report.ok = report.liveBundleAfter === bundle || report.vpsSwap.includes(bundle);

  writeFileSync(join(OUT, 'deploy-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok,
    originMainBefore: report.originMainBefore,
    originMainAfter: report.originMainAfter,
    prodCommit: report.prodCommit,
    liveBundleBefore: report.liveBundleBefore,
    liveBundleAfter: report.liveBundleAfter,
    build: report.build,
    vpsSwap: report.vpsSwap,
    outDir: OUT,
  }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  report.fatal = String(e.stderr || e.message || e);
  writeFileSync(join(OUT, 'deploy-report.json'), JSON.stringify(report, null, 2));
  console.error(report.fatal);
  process.exit(1);
});
