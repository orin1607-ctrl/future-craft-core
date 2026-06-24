/**
 * Upload Google OAuth credentials to Supabase Edge secrets (staging only).
 * Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in env
 * or integrations/google/token.json + credentials.oauth.json
 *
 * Usage: node scripts/setup-marketing-google-secrets.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';

function loadJson(p) {
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const creds = loadJson(join('integrations/google/credentials.oauth.json'));
const token = loadJson(join('integrations/google/token.json'));
const config = loadJson(join('integrations/google/config.json')) || {};

const secrets = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || creds?.installed?.client_id || creds?.web?.client_id,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || creds?.installed?.client_secret || creds?.web?.client_secret,
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN || token?.refresh_token,
  GOOGLE_GSC_SITE: process.env.GOOGLE_GSC_SITE || config.gsc_site || 'https://dalia-c.com/',
  GOOGLE_GA4_PROPERTY: process.env.GOOGLE_GA4_PROPERTY || config.ga4_property || 'properties/427711798',
};

const missing = Object.entries(secrets).filter(([k, v]) => !v && k.startsWith('GOOGLE_CLIENT') || k === 'GOOGLE_REFRESH_TOKEN').map(([k]) => k);
if (missing.length) {
  console.error('Missing secrets:', missing.join(', '));
  process.exit(2);
}

for (const [name, value] of Object.entries(secrets)) {
  if (!value) continue;
  const r = spawnSync('npx', ['supabase', 'secrets', 'set', `${name}=${value}`, '--project-ref', STAGING_REF], {
    cwd: process.cwd(),
    shell: true,
    encoding: 'utf8',
  });
  console.log(name, r.status === 0 ? 'OK' : (r.stderr || r.stdout || 'FAIL'));
}

console.log('Done. Deploy functions: npx supabase functions deploy marketing-google-sync marketing-gemini-chat --project-ref', STAGING_REF);
