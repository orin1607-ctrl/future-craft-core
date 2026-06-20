import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { P001 } from './_lib/config.mjs';
import { tokenHasP001Scopes } from './_lib/auth.mjs';

const ROOT = P001.root;

function run(cmd) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

async function main() {
  console.log('\n=== Project 001 — Phase 1 Verify ===\n');

  run('npm run google:verify');

  console.log('\n--- OAuth scopes for Project 001 ---');
  if (!tokenHasP001Scopes()) {
    console.log('❌ Missing Search Console + Analytics scopes');
    console.log('Owner Gate: npm run project-001:auth\n');
    process.exit(2);
  }
  console.log('✓ P001 OAuth scopes present');

  const cfgPath = existsSync(P001.config) ? P001.config : P001.configExample;
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const hasGa4 = cfg.ga4_property_id?.startsWith('properties/') && !cfg.ga4_property_id.includes('YOUR_');
  if (!hasGa4) {
    console.log('⚠️  ga4_property_id not configured — run project-001:probe after GA4 access granted\n');
    process.exit(1);
  }

  run('node scripts/project-001/project-001-probe.mjs');
  run('node scripts/project-001/project-001-sync.mjs');
  run('node scripts/project-001/project-001-sync.mjs');

  console.log('\n✓ Phase 1 verify complete (double sync OK)\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
