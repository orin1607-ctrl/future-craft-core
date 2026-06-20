import { readFileSync, existsSync } from 'fs';
import { PATHS } from '../../google/_lib/paths.mjs';
import { loadGoogleAuthLibrary } from '../../google/_lib/auth.mjs';
import { P001 } from './config.mjs';

const P001_SCOPES = JSON.parse(readFileSync(P001.scopes, 'utf8')).additional_scopes || [];
const BASE_SCOPES = JSON.parse(readFileSync(PATHS.scopes, 'utf8')).default_login_scopes || [];

export function getP001Scopes() {
  return [...new Set([...BASE_SCOPES, ...P001_SCOPES])];
}

export function tokenHasP001Scopes() {
  if (!existsSync(PATHS.token)) return false;
  const token = JSON.parse(readFileSync(PATHS.token, 'utf8'));
  const granted = String(token.scope || '');
  return getP001Scopes().every((s) => granted.includes(s));
}

export async function getP001AuthClient({ forceLogin = false } = {}) {
  const google = await loadGoogleAuthLibrary();
  const { getOAuthClientConfig } = await import('../../google/_lib/auth.mjs');
  const { clientId, clientSecret, redirectUri } = getOAuthClientConfig();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const token = JSON.parse(readFileSync(PATHS.token, 'utf8'));
  oauth2.setCredentials(token);

  if (!forceLogin && tokenHasP001Scopes()) return oauth2;

  throw new Error('P001_SCOPES_MISSING');
}
