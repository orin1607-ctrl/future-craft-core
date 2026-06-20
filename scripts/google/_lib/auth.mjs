import { readFileSync } from 'fs';
import { createServer } from 'http';
import { URL } from 'url';
import { PATHS, loadJson, resolveCredentialsPath, resolveTokenPath } from './paths.mjs';
import { assertNotLegacyCredentials } from '../../project-001/_lib/legacy-guard.mjs';

const REDIRECT_PORT = 4521;
const REDIRECT_PATH = '/oauth2callback';
export const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}${REDIRECT_PATH}`;

function readCredentialsBlock() {
  const credPath = resolveCredentialsPath();
  const raw = JSON.parse(readFileSync(credPath, 'utf8'));
  const block = raw.installed || raw.web;
  if (!block) throw new Error('credentials.oauth.json must have installed or web block');
  return {
    block,
    clientType: raw.installed ? 'installed' : 'web',
    credPath,
  };
}

/** Block OAuth when credentials are clearly not a Project 001 GCP project. */
export function validateCredentialsForFleetOS() {
  const { block, clientType } = readCredentialsBlock();
  assertNotLegacyCredentials(block);
  const registered = block.redirect_uris || [];
  const playgroundOnly = clientType === 'web'
    && registered.length === 1
    && registered[0] === 'https://developers.google.com/oauthplayground';

  if (!playgroundOnly) return;

  console.error('\n❌ OAuth credentials belong to the wrong Google Cloud project\n');
  console.error('Detected: Web client for OAuth Playground only');
  console.error('GCP project in file:', block.project_id);
  console.error('Expected: burnished-craft-466809-v1 (My First Project)\n');
  console.error('Create OAuth in YOUR project:\n');
  console.error('  1. https://console.cloud.google.com/apis/credentials?project=burnished-craft-466809-v1');
  console.error('  2. OAuth consent → test user: orin1607@gmail.com');
  console.error('  3. CREATE CREDENTIALS → OAuth client ID → Web application');
  console.error('     Redirect URI: http://127.0.0.1:4521/oauth2callback');
  console.error('  4. Paste to integrations/google/credentials.oauth.paste.json');
  console.error('  5. npm run google:import-paste && npm run project-001:auth\n');
  process.exit(2);
}

/** Warn if downloaded JSON lacks our loopback URI (GCP may still be fixed without re-download). */
export function warnRedirectUriSetup() {
  const { block, clientType } = readCredentialsBlock();
  const registered = block.redirect_uris || [];
  if (registered.includes(REDIRECT_URI)) return;

  const projectId = block.project_id;
  const clientId = block.client_id;
  const consoleUrl = projectId && clientId
    ? `https://console.cloud.google.com/apis/credentials/oauthclient/${clientId}?project=${projectId}`
    : 'https://console.cloud.google.com/apis/credentials';

  console.warn('\n⚠️  OAuth redirect URI may be missing in Google Cloud Console\n');
  console.warn('Client type:', clientType === 'installed' ? 'Desktop (installed)' : 'Web');
  console.warn('Local JSON redirect URIs:', registered.length ? registered.join(', ') : '(none)');
  console.warn('Required for this project:\n  ', REDIRECT_URI);
  console.warn('\nIf you see redirect_uri_mismatch, add in GCP:');
  console.warn('  APIs & Services → Credentials → OAuth 2.0 Client IDs → your client');
  console.warn('  → Authorized redirect URIs → + ADD URI → SAVE');
  if (projectId) console.warn(`  Project: ${projectId}`);
  console.warn(`  Direct link: ${consoleUrl}\n`);
}

export function getOAuthClientConfig() {
  const { block } = readCredentialsBlock();
  assertNotLegacyCredentials(block);
  return {
    clientId: block.client_id,
    clientSecret: block.client_secret,
    redirectUri: REDIRECT_URI,
    projectId: block.project_id,
  };
}

export function getLoginScopes() {
  const scopesFile = loadJson(PATHS.scopes, { default_login_scopes: [] });
  return scopesFile.default_login_scopes || [];
}

export async function loadGoogleAuthLibrary() {
  try {
    const { google } = await import('googleapis');
    return google;
  } catch {
    throw new Error('Missing googleapis — run: npm install');
  }
}

export async function getAuthenticatedClient({ forceLogin = false, scopes: customScopes } = {}) {
  const google = await loadGoogleAuthLibrary();
  const { clientId, clientSecret, redirectUri } = getOAuthClientConfig();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const tokenPath = resolveTokenPath();
  const scopes = customScopes ?? getLoginScopes();

  if (!forceLogin) {
    const { existsSync, readFileSync, writeFileSync } = await import('fs');
    if (existsSync(tokenPath)) {
      const tokens = JSON.parse(readFileSync(tokenPath, 'utf8'));
      oauth2.setCredentials(tokens);
      oauth2.on('tokens', (t) => {
        const merged = { ...tokens, ...t };
        writeFileSync(tokenPath, JSON.stringify(merged, null, 2));
      });
      return oauth2;
    }
  }

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });

  console.log('\n=== Google OAuth — owner approval required ===\n');
  console.log('Open this URL in your browser (logged in as Google account owner):\n');
  console.log(authUrl);
  console.log('\nWaiting for redirect to', redirectUri, '...\n');

  try {
    const { exec } = await import('child_process');
    if (process.platform === 'win32') {
      exec(`start "" "${authUrl}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${authUrl}"`);
    } else {
      exec(`xdg-open "${authUrl}"`);
    }
  } catch {
    /* browser open optional */
  }

  const code = await waitForAuthCode();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  console.log('Token saved:', tokenPath);
  return oauth2;
}

function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', `http://127.0.0.1:${REDIRECT_PORT}`);
        if (url.pathname !== REDIRECT_PATH) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const err = url.searchParams.get('error');
        if (err) {
          res.writeHead(400);
          res.end(`OAuth error: ${err}`);
          server.close();
          if (err === 'redirect_uri_mismatch') {
            warnRedirectUriSetup();
          }
          reject(new Error(err));
          return;
        }
        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          res.end('Missing code');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body dir="rtl"><h2>התחברות Google הצליחה</h2><p>אפשר לסגור את החלון ולחזור ל-Cursor.</p></body></html>');
        server.close();
        resolve(code);
      } catch (e) {
        server.close();
        reject(e);
      }
    });
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {});
    server.on('error', reject);
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout (30 min) — try again'));
    }, 30 * 60 * 1000);
  });
}

export async function probeGoogleApis(auth) {
  const google = await loadGoogleAuthLibrary();
  const results = {};

  try {
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const me = await oauth2.userinfo.get();
    results.userinfo = { ok: true, email: me.data.email, name: me.data.name };
  } catch (e) {
    results.userinfo = { ok: false, error: e.message };
  }

  for (const [key, fn] of [
    ['drive', async () => {
      const drive = google.drive({ version: 'v3', auth });
      const r = await drive.about.get({ fields: 'user,storageQuota' });
      return { email: r.data.user?.emailAddress };
    }],
    ['sheets', async () => {
      const sheets = google.sheets({ version: 'v4', auth });
      await sheets.spreadsheets.create({ requestBody: { properties: { title: `Dalia-conn-test-${Date.now()}` } } });
      return { ok: true, note: 'test spreadsheet created — delete manually if needed' };
    }],
    ['gmail', async () => {
      const scope = String(auth.credentials?.scope || '');
      if (scope.includes('gmail.send')) {
        return { note: 'gmail.send scope active (send-only integration)' };
      }
      const gmail = google.gmail({ version: 'v1', auth });
      const r = await gmail.users.getProfile({ userId: 'me' });
      return { email: r.data.emailAddress };
    }],
    ['calendar', async () => {
      const cal = google.calendar({ version: 'v3', auth });
      const r = await cal.calendarList.list({ maxResults: 1 });
      return { calendars: r.data.items?.length ?? 0 };
    }],
    ['docs', async () => {
      const docs = google.docs({ version: 'v1', auth });
      const r = await docs.documents.create({ requestBody: { title: `Dalia-conn-test-${Date.now()}` } });
      return { documentId: r.data.documentId };
    }],
    ['apps_script', async () => {
      const script = google.script({ version: 'v1', auth });
      try {
        await script.projects.get({ scriptId: 'dalia-connection-probe-invalid' });
      } catch (e) {
        const status = e.response?.status ?? e.code;
        if (status === 404 || status === 400) {
          return { ok: true, note: 'Apps Script API reachable' };
        }
        throw e;
      }
      return { ok: true };
    }],
  ]) {
    try {
      results[key] = { ok: true, ...(await fn()) };
    } catch (e) {
      results[key] = { ok: false, error: e.message?.slice(0, 200) };
    }
  }

  return results;
}
