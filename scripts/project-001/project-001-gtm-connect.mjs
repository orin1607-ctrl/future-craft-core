/**
 * Post-GTM-OAuth pipeline: probe → sync → export → owner-gates refresh
 */
import { execSync } from 'child_process';
import { P001 } from './_lib/config.mjs';
import { tokenHasOptionalScope } from './_lib/auth.mjs';

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
  console.log('\n=== Google Tag Manager Connect ===\n');
  if (!tokenHasOptionalScope('tagmanager')) {
    console.log('❌ חסר scope tagmanager.readonly');
    console.log('הרץ: npm run project-001:auth -- --force (דפדפן — אישור OAuth)\n');
    run('node scripts/project-001/project-001-owner-gates.mjs', { optional: true });
    process.exit(10);
  }

  const probeOk = run('npm run project-001:gtm-probe');
  if (!probeOk) {
    run('node scripts/project-001/project-001-owner-gates.mjs', { optional: true });
    process.exit(1);
  }
  run('npm run project-001:gtm-sync');
  run('npm run project-001:export-dashboard');
  run('node scripts/project-001/project-001-owner-gates.mjs', { optional: true });
  console.log('\n✓ GTM connect pipeline finished\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
