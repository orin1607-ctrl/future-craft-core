/**
 * Watch for credentials.oauth.paste.json → import → auth → full continue pipeline.
 */
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { PATHS } from '../google/_lib/paths.mjs';
import { tryImportPasteCredentials, analyzeCredentialFile, tryInstallKnownProjectOAuth } from '../google/_lib/credentials.mjs';
import { P001 } from './_lib/config.mjs';
import { ownerGateNewOAuth, printOwnerGate, isLegacyOAuthClient } from './_lib/legacy-guard.mjs';

const maxWait = Number(process.env.P001_WATCH_MS || 60 * 60 * 1000);
const interval = Number(process.env.P001_WATCH_INTERVAL_MS || 3000);
const OUT = P001.auditOut;

mkdirSync(OUT, { recursive: true });
const log = (msg) => console.log(`[project-001:watch] ${msg}`);

function writeStatus(extra = {}) {
  writeFileSync(join(OUT, 'watch-status.json'), JSON.stringify({
    at: new Date().toISOString(),
    ...extra,
  }, null, 2));
}

const start = Date.now();
printOwnerGate(ownerGateNewOAuth());
log(`Watching Downloads + integrations/google for client_secret*.json (up to ${Math.round(maxWait / 60000)}m)...`);

while (Date.now() - start < maxWait) {
  tryImportPasteCredentials();
  if (tryInstallKnownProjectOAuth().installed) {
    log('known OAuth client installed from Downloads');
    break;
  }
  try {
    execSync('node scripts/google/google-import-paste.mjs', { cwd: P001.root, stdio: 'pipe', shell: true });
  } catch { /* waiting */ }
  try {
    execSync('node scripts/google/google-pick-credentials.mjs', { cwd: P001.root, stdio: 'pipe', shell: true });
  } catch { /* waiting */ }
  const cred = existsSync(PATHS.credentials) ? analyzeCredentialFile(PATHS.credentials) : null;
  if (cred?.isUsable && !isLegacyOAuthClient(cred.clientId, cred.projectId)) {
    log(`credentials ready: ${cred.projectId}`);
    writeStatus({ credentials: cred.projectId, phase: 'auth' });
    break;
  }
  await new Promise((r) => setTimeout(r, interval));
}

const cred = existsSync(PATHS.credentials) ? analyzeCredentialFile(PATHS.credentials) : null;
if (!cred?.isUsable || isLegacyOAuthClient(cred.clientId, cred.projectId)) {
  log('timeout — no Project001AIMarketing credentials');
  writeStatus({ error: 'timeout' });
  process.exit(1);
}

log('running continue pipeline...');
writeStatus({ phase: 'continue' });
execSync('npm run project-001:continue', { cwd: P001.root, stdio: 'inherit', shell: true });
writeStatus({ phase: 'complete', complete: true });
log('done');
