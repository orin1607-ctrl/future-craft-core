/**
 * Post-token pipeline: probe → sync → export dashboard → owner-gates refresh
 */
import { execSync } from 'child_process';
import { P001 } from './_lib/config.mjs';
import { getAdsCredentials } from './_lib/ads-env.mjs';
import { buildAdsOwnerGate } from './_lib/owner-gates.mjs';

const run = (cmd) => {
  console.log(`\n>>> ${cmd}\n`);
  execSync(cmd, { cwd: P001.root, stdio: 'inherit', shell: true });
};

async function main() {
  const { developerToken } = getAdsCredentials();
  if (!developerToken) {
    const gate = buildAdsOwnerGate();
    console.log('\n=== Google Ads Connect — Owner Gate ===\n');
    console.log('1. קישור:', gate.directLink);
    console.log('2. העתק Developer Token → .env.ads');
    console.log('3. הרץ שוב: npm run project-001:ads-connect\n');
    process.exit(10);
  }

  console.log('\n=== Google Ads Connect ===\n');
  run('npm run project-001:ads-probe');
  run('npm run project-001:ads-sync');
  run('npm run project-001:export-dashboard');
  run('node scripts/project-001/project-001-owner-gates.mjs');
  console.log('\n✓ Google Ads connect pipeline finished\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
