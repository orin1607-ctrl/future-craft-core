/**
 * Upload marketing-related secrets to Supabase Staging from local files.
 * Never prints secret values.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';

function loadJson(p) {
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function parseEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function setSecret(name, value) {
  if (!value) return { name, ok: false, reason: 'missing' };
  const r = spawnSync('npx', ['supabase', 'secrets', 'set', `${name}=${value}`, '--project-ref', STAGING_REF], {
    cwd: process.cwd(),
    shell: true,
    encoding: 'utf8',
  });
  const ok = r.status === 0;
  return { name, ok, reason: ok ? 'ok' : (r.stderr || r.stdout || 'fail').slice(0, 120) };
}

const creds = loadJson(join('integrations/google/credentials.oauth.json'));
const token = loadJson(join('integrations/google/token.json'));
const config = loadJson(join('integrations/google/config.json')) || {};
const openai = parseEnv('.env.openai');
const local = parseEnv('.env.local');
const ads = parseEnv('.env.ads');
const build = parseEnv('.env.build');

const secrets = {
  GOOGLE_CLIENT_ID: creds?.installed?.client_id || creds?.web?.client_id,
  GOOGLE_CLIENT_SECRET: creds?.installed?.client_secret || creds?.web?.client_secret,
  GOOGLE_REFRESH_TOKEN: token?.refresh_token,
  GOOGLE_GSC_SITE: config.gsc_site || 'https://dalia-c.com/',
  GOOGLE_GA4_PROPERTY: config.ga4_property || 'properties/427711798',
  MARKETING_OPENAI_API_KEY: openai.OPENAI_API_KEY,
  OPENAI_API_KEY: openai.OPENAI_API_KEY,
  GOOGLE_ADS_DEVELOPER_TOKEN: ads.GOOGLE_ADS_DEVELOPER_TOKEN,
  GOOGLE_ADS_CUSTOMER_ID: ads.GOOGLE_ADS_CUSTOMER_ID,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: ads.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  GEMINI_API_KEY: openai.GEMINI_API_KEY || openai.GOOGLE_AI_API_KEY || local.GEMINI_API_KEY || local.GOOGLE_AI_API_KEY,
  ANTHROPIC_API_KEY: openai.ANTHROPIC_API_KEY || local.ANTHROPIC_API_KEY,
  MARKETING_ANTHROPIC_API_KEY: openai.ANTHROPIC_API_KEY || local.ANTHROPIC_API_KEY,
  CLAUDE_API_KEY: openai.ANTHROPIC_API_KEY || local.ANTHROPIC_API_KEY || openai.CLAUDE_API_KEY || local.CLAUDE_API_KEY,
  V0_API_KEY: build.V0_API_KEY || build.VERCEL_V0_API_KEY,
  WORDPRESS_SITE_URL: build.WORDPRESS_SITE_URL,
  WORDPRESS_USERNAME: build.WORDPRESS_USERNAME,
  WORDPRESS_APP_PASSWORD: build.WORDPRESS_APP_PASSWORD,
  FIGMA_ACCESS_TOKEN: build.FIGMA_ACCESS_TOKEN,
  FIGMA_FILE_KEY: build.FIGMA_FILE_KEY,
  WEBFLOW_API_TOKEN: build.WEBFLOW_API_TOKEN,
  WEBFLOW_SITE_ID: build.WEBFLOW_SITE_ID,
  BUILDER_IO_API_KEY: build.BUILDER_IO_API_KEY,
  PLASMIC_API_TOKEN: build.PLASMIC_API_TOKEN,
  PLASMIC_PROJECT_ID: build.PLASMIC_PROJECT_ID,
  RUNWAY_API_KEY: build.RUNWAY_API_KEY,
  GOOGLE_STITCH_API_KEY: build.GOOGLE_STITCH_API_KEY || build.GEMINI_API_KEY,
};

const results = [];
for (const [name, value] of Object.entries(secrets)) {
  if (!value) {
    results.push({ name, ok: false, reason: 'missing locally' });
    continue;
  }
  results.push(setSecret(name, value));
}

console.log(JSON.stringify({ project: STAGING_REF, results }, null, 2));
const failed = results.filter((r) => !r.ok);
process.exit(failed.some((r) => /GOOGLE_CLIENT|GOOGLE_REFRESH|MARKETING_OPENAI|OPENAI_API/.test(r.name) && !r.ok) ? 1 : 0);
