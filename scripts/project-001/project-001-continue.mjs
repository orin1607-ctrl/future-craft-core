/**
 * Post-migration pipeline: credentials → auth → connections → GBP → Ads → OpenAI
 */
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { PATHS } from '../google/_lib/paths.mjs';
import { analyzeCredentialFile, tryImportPasteCredentials, tryInstallKnownProjectOAuth } from '../google/_lib/credentials.mjs';
import { P001 } from './_lib/config.mjs';
import { resolveProjectId } from './_lib/gcp.mjs';
import {
  isLegacyOAuthClient,
  isTargetProject,
  ownerGateNewOAuth,
  printOwnerGate,
  TARGET_PROJECT_ID,
} from './_lib/legacy-guard.mjs';

const run = (cmd, { optional = false } = {}) => {
  console.log(`\n>>> ${cmd}\n`);
  try {
    execSync(cmd, { cwd: P001.root, stdio: 'inherit', shell: true });
    return true;
  } catch {
    if (!optional) throw new Error(`Failed: ${cmd}`);
    console.log(`(optional step skipped: ${cmd})`);
    return false;
  }
};

function tryInstallCredentials() {
  tryImportPasteCredentials();
  if (tryInstallKnownProjectOAuth().installed) return;
  try {
    execSync('node scripts/google/google-import-paste.mjs', { cwd: P001.root, stdio: 'pipe', shell: true });
  } catch { /* no paste/env source */ }
  try {
    execSync('node scripts/google/google-pick-credentials.mjs', { cwd: P001.root, stdio: 'pipe', shell: true });
  } catch { /* no downloads */ }
}

function loadAdsEnv() {
  const paths = ['.env.ads', '.env.google'];
  const out = {};
  for (const p of paths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  return out;
}

async function main() {
  console.log('\n=== Project 001 — Continue (Project001AIMarketing only) ===\n');

  const { id: projectId } = resolveProjectId();
  if (!projectId || projectId !== TARGET_PROJECT_ID) {
    console.error('Set integrations/project-001/gcp.json → project_id:', TARGET_PROJECT_ID);
    process.exit(1);
  }

  tryImportPasteCredentials();
  tryInstallCredentials();
  const cred = existsSync(PATHS.credentials) ? analyzeCredentialFile(PATHS.credentials) : null;

  if (!cred?.isUsable) {
    printOwnerGate(ownerGateNewOAuth());
    console.log('\nWaiting for credentials — run: npm run project-001:watch\n');
    process.exit(10);
  }

  if (isLegacyOAuthClient(cred.clientId, cred.projectId)) {
    printOwnerGate(ownerGateNewOAuth());
    process.exit(2);
  }

  if (!isTargetProject(cred.projectId)) {
    console.warn('Warning: OAuth project_id is', cred.projectId, '— expected', TARGET_PROJECT_ID);
  }

  console.log('\n--- Enable APIs (open tabs if not done) ---');
  run('node scripts/project-001/project-001-enable-apis.mjs --no-open', { optional: true });

  if (!existsSync(PATHS.token)) {
    run('npm run project-001:auth');
  } else {
    const token = JSON.parse(readFileSync(PATHS.token, 'utf8'));
    const needsReauth = cred.projectId && !isTargetProject(cred.projectId);
    const scope = String(token.scope || '');
    const missingScopes = !scope.includes('business.manage') || !scope.includes('webmasters');
    if (needsReauth || missingScopes) {
      console.log('Token needs refresh for Project001AIMarketing scopes...');
      run('npm run project-001:auth -- --force');
    }
  }

  run('npm run google:verify', { optional: true });
  run('npm run project-001:connections', { optional: true });
  run('npm run project-001:probe', { optional: true });
  run('npm run project-001:sync', { optional: true });
  run('npm run project-001:verify', { optional: true });

  run('npm run project-001:gbp-probe', { optional: true });
  run('npm run project-001:gbp-sync', { optional: true });

  const adsEnv = loadAdsEnv();
  if (adsEnv.GOOGLE_ADS_DEVELOPER_TOKEN) {
    run('npm run project-001:ads-connect', { optional: true });
  } else {
    console.log('\n--- Google Ads Owner Gate ---');
    console.log('Guide: docs/audit-reports/project-001/OWNER-GATES-GBP-ADS.md');
    console.log('URL: https://ads.google.com/aw/apicenter');
    console.log('→ Copy Developer token → .env.ads → npm run project-001:ads-connect');
  }

  run('npm run project-001:owner-gates', { optional: true });

  if (existsSync('.env.openai') && !readFileSync('.env.openai', 'utf8').match(/OPENAI_API_KEY=\s*$/m)) {
    run('npm run project-001:openai-probe', { optional: true });
  } else {
    console.log('\n--- OpenAI Owner Gate ---');
    console.log('URL: https://platform.openai.com/api-keys');
    console.log('→ לחץ Create new secret key → הדבק ב-.env.openai');
  }

  run('npm run project-001:gcp-audit', { optional: true });
  run('node scripts/project-001/project-001-final-report.mjs', { optional: true });
  console.log('\n✓ Continue pipeline finished\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
