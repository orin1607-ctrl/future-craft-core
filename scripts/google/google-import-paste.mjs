/**
 * Build credentials.oauth.json from one-time paste (new Google Console — no Download JSON).
 *
 * Create integrations/google/credentials.oauth.paste.json:
 * { "client_id": "....apps.googleusercontent.com", "client_secret": "GOCSPX-...", "project_id": "your-gcp-project" }
 *
 * Or set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_CLOUD_PROJECT in .env.google
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { PATHS, loadEnvGoogle } from './_lib/paths.mjs';
import { analyzeCredentialFile, syncConfigProjectId } from './_lib/credentials.mjs';
import { isLegacyOAuthClient, ownerGateNewOAuth } from '../project-001/_lib/legacy-guard.mjs';

const PASTE = join(PATHS.googleDir, 'credentials.oauth.paste.json');

function fromPasteFile() {
  if (!existsSync(PASTE)) return null;
  const raw = JSON.parse(readFileSync(PASTE, 'utf8'));
  if (!raw.client_id || !raw.client_secret) return null;
  return raw;
}

function fromEnv() {
  const env = loadEnvGoogle();
  const client_id = env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
  const client_secret = env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const project_id = env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!client_id || !client_secret) return null;
  return { client_id, client_secret, project_id };
}

const src = fromPasteFile() || fromEnv();
if (!src) {
  console.error('No paste source. Create integrations/google/credentials.oauth.paste.json');
  process.exit(1);
}

if (isLegacyOAuthClient(src.client_id, src.project_id)) {
  console.error('\n❌ Paste rejected — legacy project (dalia-fleetos / 840269841580)');
  const gate = ownerGateNewOAuth();
  console.error('Create OAuth in:', gate.urls.credentials);
  process.exit(2);
}

const isWeb = String(src.client_type || '').toLowerCase() === 'web';
const block = {
  client_id: src.client_id.trim(),
  project_id: src.project_id?.trim() || 'unknown-project',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_secret: src.client_secret.trim(),
  redirect_uris: isWeb
    ? ['http://127.0.0.1:4521/oauth2callback']
    : ['http://127.0.0.1:4521/oauth2callback', 'urn:ietf:wg:oauth:2.0:oob'],
};

const credentials = isWeb ? { web: block } : { installed: block };
mkdirSync(dirname(PATHS.credentials), { recursive: true });
writeFileSync(PATHS.credentials, `${JSON.stringify(credentials, null, 2)}\n`);

if (src.project_id) syncConfigProjectId(src.project_id);

const analysis = analyzeCredentialFile(PATHS.credentials);
if (!analysis?.isUsable) {
  console.error('Built credentials but validation failed:', analysis);
  process.exit(2);
}

if (existsSync(PASTE)) {
  try { unlinkSync(PASTE); } catch { /* keep if locked */ }
}

console.log('✅ Built', PATHS.credentials);
console.log('   project:', analysis.projectId, '| type:', analysis.clientType);
