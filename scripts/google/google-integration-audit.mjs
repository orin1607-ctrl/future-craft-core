/**
 * Google integration audit — read-only inventory (no OAuth required).
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PATHS, loadJson, resolveCredentialsPath, resolveTokenPath } from './_lib/paths.mjs';
import { analyzeCredentialFile } from './_lib/credentials.mjs';

mkdirSync(PATHS.auditOut, { recursive: true });

const credPath = resolveCredentialsPath();
const tokenPath = resolveTokenPath();
const credAnalysis = existsSync(credPath) ? analyzeCredentialFile(credPath) : null;
const config = loadJson(PATHS.config) || loadJson(PATHS.configExample, {});
const services = loadJson(PATHS.services, { services: [] });
const scopes = loadJson(PATHS.scopes, {});

let googleapisInstalled = false;
try {
  await import('googleapis');
  googleapisInstalled = true;
} catch {
  googleapisInstalled = false;
}

const report = {
  at: new Date().toISOString(),
  scope: 'Google integration audit — read-only',
  infrastructure: {
    integrations_dir: 'integrations/google',
    scripts_dir: 'scripts/google',
    docs: 'docs/GOOGLE_INTEGRATION.md',
    env_example: '.env.google.example',
  },
  files: {
    credentials_oauth: existsSync(credPath) ? credPath.replace(/\\/g, '/') : null,
    credentials_example: existsSync(PATHS.credentialsExample),
    token: existsSync(tokenPath) ? tokenPath.replace(/\\/g, '/') : null,
    config: existsSync(PATHS.config),
    config_example: existsSync(PATHS.configExample),
    env_google: existsSync(PATHS.envGoogle),
    apps_script_template: existsSync(join(PATHS.googleDir, 'apps-script', 'Code.gs')),
    clasp_config: existsSync(join(PATHS.googleDir, 'apps-script', '.clasp.json')),
  },
  npm: {
    googleapis_installed: googleapisInstalled,
  },
  connection: {
    oauth_configured: existsSync(credPath),
    credentials_usable: credAnalysis?.isUsable ?? false,
    credentials_project_id: credAnalysis?.projectId ?? null,
    credentials_client_type: credAnalysis?.clientType ?? null,
    credentials_playground_only: credAnalysis?.isPlaygroundOnly ?? false,
    token_present: existsSync(tokenPath),
    connected: existsSync(credPath) && existsSync(tokenPath) && (credAnalysis?.isUsable ?? false),
  },
  services_catalog: services.services || [],
  scopes_bundles: Object.keys(scopes.bundles || {}),
  default_login_scopes: scopes.default_login_scopes || [],
  config_snapshot: config,
  permissions_granted: existsSync(tokenPath)
    ? { note: 'Run npm run google:check for live scope verification' }
    : { note: 'No token yet — owner OAuth required' },
  limitations: [],
  next_owner_step: null,
};

if (!existsSync(credPath)) {
  report.limitations.push('OAuth credentials file missing');
  report.next_owner_step =
    'Google Cloud Console → Credentials → Dalia Login → Download JSON → integrations/google/credentials.oauth.json';
} else if (credAnalysis?.isPlaygroundOnly) {
  report.limitations.push('Credentials are OAuth Playground Web client from foreign GCP project');
  report.next_owner_step =
    'Download JSON from your Dalia Login client → reply Google credentials ready';
}

if (!existsSync(tokenPath)) {
  report.limitations.push('No OAuth token — run npm run google:auth after credentials');
}

if (!googleapisInstalled) {
  report.limitations.push('Run npm install (googleapis devDependency)');
}

writeFileSync(join(PATHS.auditOut, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
