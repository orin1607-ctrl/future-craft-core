/**
 * Sync all providers + export dashboard (GTM/GBP/Ads optional when blocked).
 */
import { execSync } from 'child_process';
import { P001 } from './_lib/config.mjs';

const run = (cmd, { optional = false } = {}) => {
  console.log(`\n>>> ${cmd}\n`);
  try {
    execSync(cmd, { cwd: P001.root, stdio: 'inherit', shell: true });
    return true;
  } catch {
    if (!optional) throw new Error(`Failed: ${cmd}`);
    console.log(`(skipped optional: ${cmd})`);
    return false;
  }
};

async function main() {
  run('npm run project-001:sync');
  run('npm run project-001:gbp-sync', { optional: true });
  run('npm run project-001:ads-sync', { optional: true });
  run('npm run project-001:gtm-sync', { optional: true });
  run('npm run project-001:export-dashboard');
  console.log('\n✓ sync-and-export finished\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
