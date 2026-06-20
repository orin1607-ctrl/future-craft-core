/**
 * Cut over from legacy GCP (dalia-fleetos) to Project001AIMarketing only.
 * Archives legacy credentials/token, updates config, opens Owner Gate tabs.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { exec } from 'child_process';
import { join } from 'path';
import { PATHS } from '../google/_lib/paths.mjs';
import { P001 } from './_lib/config.mjs';
import {
  TARGET_PROJECT_ID,
  TARGET_PROJECT_NAME,
  isLegacyOAuthClient,
  isTargetProject,
  ownerGateNewOAuth,
  consoleLink,
  printOwnerGate,
} from './_lib/legacy-guard.mjs';

const ARCHIVE = join(PATHS.googleDir, 'archive');
const DRY = process.argv.includes('--dry-run');
const NO_OPEN = process.argv.includes('--no-open');

function archiveFile(src, destName) {
  if (!existsSync(src)) return null;
  mkdirSync(ARCHIVE, { recursive: true });
  const dest = join(ARCHIVE, destName);
  if (!DRY) copyFileSync(src, dest);
  return dest;
}

function removeActive(src) {
  if (!existsSync(src) || DRY) return;
  try {
    unlinkSync(src);
  } catch {
    renameSync(src, `${src}.removed-${Date.now()}`);
  }
}

function updateGcpJson() {
  const path = join(P001.dir, 'gcp.json');
  const cfg = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  cfg.project_name = TARGET_PROJECT_NAME;
  cfg.project_id = TARGET_PROJECT_ID;
  cfg.project_id_note = 'GCP Project ID string (not numeric). Update if Console shows a different ID.';
  delete cfg.legacy_project_id;
  delete cfg.legacy_project_note;
  cfg.oauth_redirect_uri = 'http://127.0.0.1:4521/oauth2callback';
  cfg.console_links = {
    project_home: consoleLink('home/dashboard'),
    apis_library: consoleLink('apis/library'),
    oauth_consent: consoleLink('apis/credentials/consent'),
    oauth_credentials: consoleLink('apis/credentials'),
    iam: consoleLink('iam-admin/iam'),
    service_accounts: consoleLink('iam-admin/serviceaccounts'),
  };
  if (!DRY) writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
  return cfg;
}

function updateEnvGoogle() {
  const path = PATHS.envGoogle;
  let raw = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (/^GOOGLE_CLOUD_PROJECT=.*/m.test(raw)) {
    raw = raw.replace(/^GOOGLE_CLOUD_PROJECT=.*/m, `GOOGLE_CLOUD_PROJECT=${TARGET_PROJECT_ID}`);
  } else {
    raw += `\nGOOGLE_CLOUD_PROJECT=${TARGET_PROJECT_ID}\n`;
  }
  if (!DRY) writeFileSync(path, raw);
}

function updateGoogleConfig() {
  if (!existsSync(PATHS.config)) return;
  const cfg = JSON.parse(readFileSync(PATHS.config, 'utf8'));
  cfg.gcp_project_id = TARGET_PROJECT_ID;
  if (!DRY) writeFileSync(PATHS.config, `${JSON.stringify(cfg, null, 2)}\n`);
}

function openUrls(urls) {
  if (NO_OPEN || DRY) return;
  for (const url of urls) {
    if (process.platform === 'win32') exec(`start "" "${url}"`);
    else if (process.platform === 'darwin') exec(`open "${url}"`);
    else exec(`xdg-open "${url}"`);
  }
}

async function main() {
  const report = {
    timestamp: new Date().toISOString(),
    dry_run: DRY,
    target: { name: TARGET_PROJECT_NAME, project_id: TARGET_PROJECT_ID },
    archived: {},
    removed: [],
    owner_gate: ownerGateNewOAuth(),
    next: 'npm run project-001:watch',
  };

  console.log('\n=== Project 001 — Migrate to Project001AIMarketing ===\n');
  console.log('Target:', TARGET_PROJECT_NAME, `(${TARGET_PROJECT_ID})`);
  if (DRY) console.log('(dry-run — no files changed)\n');

  if (existsSync(PATHS.credentials)) {
    const raw = JSON.parse(readFileSync(PATHS.credentials, 'utf8'));
    const block = raw.web || raw.installed || {};
    report.previous_credentials = {
      project_id: block.project_id,
      client_id: block.client_id,
      legacy: isLegacyOAuthClient(block.client_id, block.project_id),
    };
    if (report.previous_credentials.legacy) {
      report.archived.credentials = archiveFile(
        PATHS.credentials,
        'credentials.oauth.legacy-dalia-fleetos.json',
      );
      removeActive(PATHS.credentials);
      report.removed.push('integrations/google/credentials.oauth.json');
    } else if (isTargetProject(block.project_id)) {
      console.log('Credentials already on Project001AIMarketing — keeping active file.');
    } else {
      report.archived.credentials = archiveFile(
        PATHS.credentials,
        `credentials.oauth.unknown-${block.project_id || 'project'}.json`,
      );
      removeActive(PATHS.credentials);
      report.removed.push('integrations/google/credentials.oauth.json');
    }
  }

  if (existsSync(PATHS.token)) {
    report.archived.token = archiveFile(PATHS.token, 'token.legacy-dalia-fleetos.json');
    removeActive(PATHS.token);
    report.removed.push('integrations/google/token.json');
  }

  updateGcpJson();
  updateEnvGoogle();
  updateGoogleConfig();

  mkdirSync(P001.auditOut, { recursive: true });
  if (!DRY) {
    writeFileSync(`${P001.auditOut}/migration-status.json`, JSON.stringify(report, null, 2));
  }

  console.log('Config updated: integrations/project-001/gcp.json, .env.google');
  if (report.archived.credentials) console.log('Archived legacy credentials →', report.archived.credentials);
  if (report.archived.token) console.log('Archived legacy token →', report.archived.token);

  const gate = report.owner_gate;
  printOwnerGate(gate);

  if (!existsSync(PATHS.credentials)) {
    console.log('\nOpening GCP console (consent + credentials)...');
    openUrls([gate.urls.consent, gate.urls.credentials]);
    console.log('\nAfter paste + import, run:\n  npm run project-001:watch\n');
    console.log('Report:', `${P001.auditOut}/migration-status.json`);
    process.exit(10);
  }

  console.log('\n✓ Migration config complete. Active credentials present — run:\n  npm run project-001:continue\n');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
