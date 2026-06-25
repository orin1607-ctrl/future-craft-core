import { readFileSync, existsSync } from 'fs';
import { PATHS } from '../../google/_lib/paths.mjs';
import { loadGoogleAuthLibrary } from '../../google/_lib/auth.mjs';
import { P001 } from './config.mjs';

function loadScopeConfig() {
  return JSON.parse(readFileSync(P001.scopes, 'utf8'));
}

const BASE_SCOPES = JSON.parse(readFileSync(PATHS.scopes, 'utf8')).default_login_scopes || [];

export function getP001Scopes({ includeOptional = false } = {}) {
  const cfg = loadScopeConfig();
  const required = [...new Set([...BASE_SCOPES, ...(cfg.additional_scopes || [])])];
  if (!includeOptional) return required;
  return [...new Set([...required, ...(cfg.optional_scopes || [])])];
}

export function getGrantedScopes() {
  if (!existsSync(PATHS.token)) return '';
  const token = JSON.parse(readFileSync(PATHS.token, 'utf8'));
  return String(token.scope || '');
}

export function tokenHasScopes(scopes) {
  const granted = getGrantedScopes();
  return scopes.every((s) => granted.includes(s));
}

export function tokenHasP001Scopes() {
  return tokenHasScopes(getP001Scopes());
}

export function tokenHasOptionalScope(id) {
  const cfg = loadScopeConfig();
  const optional = cfg.optional_scopes || [];
  if (id === 'tagmanager') {
    return optional.some((s) => s.includes('tagmanager')) && tokenHasScopes(optional.filter((s) => s.includes('tagmanager')));
  }
  return tokenHasScopes(optional);
}

export async function getP001AuthClient({ forceLogin = false, includeOptional = false } = {}) {
  const google = await loadGoogleAuthLibrary();
  const { getOAuthClientConfig } = await import('../../google/_lib/auth.mjs');
  const { clientId, clientSecret, redirectUri } = getOAuthClientConfig();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const token = JSON.parse(readFileSync(PATHS.token, 'utf8'));
  oauth2.setCredentials(token);

  if (!forceLogin && tokenHasP001Scopes()) return oauth2;

  throw new Error('P001_SCOPES_MISSING');
}
