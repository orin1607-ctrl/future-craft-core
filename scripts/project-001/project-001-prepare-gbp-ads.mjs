/**
 * Dev prep check: run GBP + Ads probes and regenerate owner-gates doc (no user action).
 */
import { execSync } from 'child_process';
import { P001 } from './_lib/config.mjs';

const run = (cmd, { optional = false } = {}) => {
  console.log(`\n>>> ${cmd}\n`);
  try {
    execSync(cmd, { cwd: P001.root, stdio: 'inherit', shell: true });
    return true;
  } catch {
    if (!optional) return false;
    return false;
  }
};

async function main() {
  console.log('\n=== Project 001 — GBP + Ads Dev Prep ===\n');
  run('npm run project-001:gbp-probe', { optional: true });
  run('npm run project-001:ads-probe', { optional: true });
  run('node scripts/project-001/project-001-owner-gates.mjs');
  console.log('\n✓ Prep complete — owner instructions: docs/audit-reports/project-001/OWNER-GATES-GBP-ADS.md\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
