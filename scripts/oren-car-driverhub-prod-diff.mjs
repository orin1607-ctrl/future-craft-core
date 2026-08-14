import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-driverhub-3tiles-prod/2026-08-13T16-00-25');
mkdirSync(OUT, { recursive: true });
const FILES = [
  'src/components/drivers/DriverHub.tsx',
  'src/lib/driverHubData.ts',
  'src/lib/driverHubData.test.ts',
  'src/components/documents/EntityDocumentRequestsPanel.tsx',
];
function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

const twoDotStat = sh(`git diff --stat origin/main HEAD -- ${FILES.join(' ')}`);
const twoDotNames = sh(`git diff --name-only origin/main HEAD -- ${FILES.join(' ')}`);
const twoDot = sh(`git diff origin/main HEAD -- ${FILES.join(' ')}`);
writeFileSync(join(OUT, 'delta-two-dot.patch'), twoDot);
writeFileSync(join(OUT, 'delta-two-dot-stat.txt'), `${twoDotStat}\n\n${twoDotNames}\n`);

const hubStat = sh('git diff --stat origin/main HEAD -- src/components/drivers/DriverHub.tsx');
const dataStat = sh('git diff --stat origin/main HEAD -- src/lib/driverHubData.ts');
const testStat = sh('git diff --stat origin/main HEAD -- src/lib/driverHubData.test.ts');
const panelStat = sh('git diff --stat origin/main HEAD -- src/components/documents/EntityDocumentRequestsPanel.tsx');

console.log(JSON.stringify({
  twoDotStat,
  twoDotNames: twoDotNames.split(/\r?\n/).filter(Boolean),
  hubStat,
  dataStat,
  testStat,
  panelStat,
  patchBytes: twoDot.length,
}, null, 2));
