/**
 * Oren Car Production pre-flight for DriverHub 3-tile + design delta.
 * Read-only: git diff + live bundle + VPS dist backup. No DB changes. No deploy.
 */
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(ROOT, 'docs/audit-reports/oren-car-driverhub-3tiles-prod', TS);
mkdirSync(OUT, { recursive: true });

const LIVE = 'https://dalia-car.online';
const VPS = 'root@72.60.36.182';
const FILES = [
  'src/components/drivers/DriverHub.tsx',
  'src/lib/driverHubData.ts',
  'src/lib/driverHubData.test.ts',
  'src/components/documents/EntityDocumentRequestsPanel.tsx',
];

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

const report = {
  at: new Date().toISOString(),
  outDir: OUT,
  live: LIVE,
  vps: VPS,
  stagingHead: sh('git rev-parse HEAD'),
  stagingBranch: sh('git rev-parse --abbrev-ref HEAD'),
  originMain: sh('git rev-parse origin/main'),
  originMainSubject: sh('git log -1 --format=%s origin/main'),
  gitStatus: sh('git status -sb'),
  files: FILES,
};

const html = await (await fetch(LIVE + '/')).text();
report.liveBundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
report.liveIsDaliaCar = html.includes('dalia') || html.includes('דליה') || !!report.liveBundle;
try {
  const deployTxt = await (await fetch(LIVE + '/PRODUCTION-DEPLOY.txt')).text();
  report.liveDeployTxt = deployTxt.slice(0, 500);
} catch {
  report.liveDeployTxt = null;
}

report.diffStat = sh(`git diff --stat origin/main...HEAD -- ${FILES.join(' ')}`);
report.diffNameOnly = sh(`git diff --name-only origin/main...HEAD -- ${FILES.join(' ')}`).split(/\r?\n/).filter(Boolean);
report.srcDiffVsMain = sh('git diff --name-only origin/main...HEAD -- src/ supabase/').split(/\r?\n/).filter(Boolean);

const diffPath = join(OUT, 'delta.patch');
writeFileSync(diffPath, sh(`git diff origin/main...HEAD -- ${FILES.join(' ')}`));
report.deltaPatch = diffPath;

for (const f of FILES) {
  const safe = f.replace(/[\\/]/g, '__');
  const fromMain = sh(`git show origin/main:${f}`);
  writeFileSync(join(OUT, `main-${safe}`), fromMain);
  copyFileSync(join(ROOT, f), join(OUT, `staging-${safe}`));
}

report.restorePoint = {
  reason: 'pre-driverhub-3tiles-design-prod',
  originMain: report.originMain,
  liveBundle: report.liveBundle,
  liveDeployTxt: report.liveDeployTxt,
  files: FILES,
};

let backup = { ok: false };
try {
  const stamp = TS;
  const remote = `/root/pre-deploy-driverhub-3tiles-${stamp}.tgz`;
  const backupLog = sh(`ssh -o BatchMode=yes -o ConnectTimeout=20 ${VPS} "test -d /root/future-craft-core/dist && tar -czf ${remote} -C /root/future-craft-core dist && ls -lh ${remote} && (test -f /root/future-craft-core/dist/PRODUCTION-DEPLOY.txt && cat /root/future-craft-core/dist/PRODUCTION-DEPLOY.txt || echo NO-DEPLOY-TXT) && ls /root/future-craft-core/dist/assets/index-*.js 2>/dev/null | head -n 5"`);
  backup = { ok: true, remote, log: backupLog };
} catch (e) {
  backup = { ok: false, error: String(e.stderr || e.message || e) };
}
report.vpsBackup = backup;

report.noDbChange = true;
report.noMigration = true;
report.target = {
  product: 'Oren Car Production only',
  url: LIVE,
  vpsPath: '/root/future-craft-core/dist',
  supabase: 'qasomfndnjuixgjmjwcm (no writes planned)',
};

writeFileSync(join(OUT, 'preflight.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'restore-point.json'), JSON.stringify(report.restorePoint, null, 2));
console.log(JSON.stringify({
  outDir: OUT,
  originMain: report.originMain,
  liveBundle: report.liveBundle,
  liveDeployTxt: report.liveDeployTxt,
  diffStat: report.diffStat,
  diffFiles: report.diffNameOnly,
  extraSrcFiles: report.srcDiffVsMain.filter((f) => !FILES.includes(f)),
  vpsBackup: backup.ok ? backup.remote : backup.error,
}, null, 2));
