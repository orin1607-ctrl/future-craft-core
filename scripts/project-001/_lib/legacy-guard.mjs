/** Block all use of the legacy GCP project (dalia-fleetos / 840269841580). */
export const LEGACY_PROJECT_IDS = new Set(['840269841580', 'dalia-fleetos']);
export const LEGACY_CLIENT_PREFIXES = ['840269841580-', '743929143577-'];
export const LEGACY_CLIENT_PREFIX = '840269841580-';
export const TARGET_PROJECT_ID = 'project001aimarketing';
export const TARGET_PROJECT_NAME = 'Project001AIMarketing';

export function isLegacyProjectId(projectId) {
  if (!projectId) return false;
  const id = String(projectId).trim().toLowerCase();
  return LEGACY_PROJECT_IDS.has(id) || LEGACY_PROJECT_IDS.has(String(projectId).trim());
}

export function isLegacyOAuthClient(clientId, projectId) {
  if (clientId && LEGACY_CLIENT_PREFIXES.some((p) => String(clientId).startsWith(p))) return true;
  return isLegacyProjectId(projectId);
}

export function isTargetProject(projectId) {
  if (!projectId) return false;
  return String(projectId).trim().toLowerCase() === TARGET_PROJECT_ID;
}

export function consoleLink(path, projectId = TARGET_PROJECT_ID) {
  return `https://console.cloud.google.com/${path}?project=${projectId}`;
}

export function ownerGateNewOAuth() {
  return {
    id: 'oauth_client_project001',
    title: 'צור OAuth Web Client ב-burnished-craft-466809-v1',
    urls: {
      consent: consoleLink('apis/credentials/consent'),
      credentials: consoleLink('apis/credentials'),
      create_client: consoleLink('apis/credentials/oauthclient'),
    },
    steps: [
      'OAuth consent screen → App name: Project 001 AI Marketing → Test user: orin1607@gmail.com',
      'CREATE CREDENTIALS → OAuth client ID → Web application',
      'Authorized redirect URI: http://127.0.0.1:4521/oauth2callback',
      'לחץ Download JSON — הקובץ ייובא אוטומטית מ-Downloads',
    ],
    auto_import: 'npm run project-001:watch (מאזין פעיל)',
  };
}

export function assertNotLegacyCredentials(block, { exit = true } = {}) {
  if (!block?.client_id) return;
  if (!isLegacyOAuthClient(block.client_id, block.project_id)) return;

  const gate = ownerGateNewOAuth();
  console.error('\n❌ Legacy GCP project blocked (dalia-fleetos / 840269841580)\n');
  console.error('Project 001 runs only on GCP project burnished-craft-466809-v1 (My First Project).\n');
  console.error('Owner Gate — create new OAuth client:');
  console.error('  ', gate.urls.credentials);
  for (const step of gate.steps) console.error('  →', step);
  console.error('\nThen:', gate.auto_continue, '\n');
  if (exit) process.exit(2);
  return gate;
}

export function printOwnerGate(gate) {
  console.log(`\n[${gate.id}] ${gate.title}`);
  if (gate.urls) {
    for (const [k, url] of Object.entries(gate.urls)) console.log(`  ${k}:`, url);
  }
  if (gate.steps) for (const s of gate.steps) console.log('  →', s);
  if (gate.action) console.log('  →', gate.action);
  if (gate.url) console.log('  URL:', gate.url);
}
