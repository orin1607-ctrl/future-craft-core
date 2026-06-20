import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const PATHS = {
  root: ROOT,
  googleDir: join(ROOT, 'integrations', 'google'),
  credentials: join(ROOT, 'integrations', 'google', 'credentials.oauth.json'),
  credentialsExample: join(ROOT, 'integrations', 'google', 'credentials.oauth.example.json'),
  token: join(ROOT, 'integrations', 'google', 'token.json'),
  config: join(ROOT, 'integrations', 'google', 'config.json'),
  configExample: join(ROOT, 'integrations', 'google', 'config.example.json'),
  scopes: join(ROOT, 'integrations', 'google', 'scopes.json'),
  services: join(ROOT, 'integrations', 'google', 'services.json'),
  auditOut: join(ROOT, 'docs', 'audit-reports', 'google-integration'),
  envGoogle: join(ROOT, '.env.google'),
  envGoogleExample: join(ROOT, '.env.google.example'),
};

export function loadJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadEnvGoogle() {
  const envPath = process.env.GOOGLE_ENV_FILE || PATHS.envGoogle;
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

export function resolveCredentialsPath() {
  const env = loadEnvGoogle();
  if (env.GOOGLE_OAUTH_CREDENTIALS) {
    return join(ROOT, env.GOOGLE_OAUTH_CREDENTIALS.replace(/^\.\//, ''));
  }
  if (process.env.GOOGLE_OAUTH_CREDENTIALS) {
    return join(ROOT, process.env.GOOGLE_OAUTH_CREDENTIALS.replace(/^\.\//, ''));
  }
  return PATHS.credentials;
}

export function resolveTokenPath() {
  const env = loadEnvGoogle();
  const p = env.GOOGLE_TOKEN_PATH || process.env.GOOGLE_TOKEN_PATH;
  if (p) return join(ROOT, p.replace(/^\.\//, ''));
  return PATHS.token;
}
