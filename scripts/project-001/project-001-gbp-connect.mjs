/**
 * Post-GBP-approval pipeline: probe → sync → export → owner-gates refresh
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
    console.log(`(optional: ${cmd})`);
    return false;
  }
};

async function main() {
  console.log('\n=== Google Business Profile Connect ===\n');
  const probeOk = run('npm run project-001:gbp-probe', { optional: true });
  if (!probeOk) {
    console.log('\n❌ GBP still blocked — see docs/audit-reports/project-001/OWNER-GATES-GBP-ADS.md (Gate 1)\n');
    run('node scripts/project-001/project-001-owner-gates.mjs', { optional: true });
    process.exit(1);
  }
  run('npm run project-001:gbp-sync');
  run('npm run project-001:export-dashboard');
  run('node scripts/project-001/project-001-owner-gates.mjs', { optional: true });
  console.log('\n✓ GBP connect pipeline finished\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
