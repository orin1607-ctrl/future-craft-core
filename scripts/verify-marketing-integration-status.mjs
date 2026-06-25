/**
 * Autonomous integration status check — no secrets printed.
 * Usage: node scripts/verify-marketing-integration-status.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const EDGE_BASE = `https://${STAGING_REF}.supabase.co/functions/v1`;

function parseEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function hasKey(env, name) {
  const v = env[name];
  return !!(v && v.length > 4);
}

function runNpm(script) {
  const r = spawnSync('npm', ['run', script, '--silent'], { shell: true, encoding: 'utf8', cwd: process.cwd() });
  return { ok: r.status === 0, code: r.status, tail: (r.stdout || r.stderr || '').split('\n').slice(-4).join(' ').trim() };
}

const env = { ...parseEnv('.env'), ...parseEnv('.env.local'), ...parseEnv('.env.openai'), ...parseEnv('.env.ads') };
let dash = null;
if (existsSync('public/project-001/dashboard.json')) {
  dash = JSON.parse(readFileSync('public/project-001/dashboard.json', 'utf8'));
}

const services = [
  {
    id: 'gsc',
    name: 'Google Search Console',
    status: dash?.connections?.searchConsole?.ok ? 'connected' : 'pending',
    needsUser: false,
  },
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    status: dash?.connections?.analytics4?.ok ? 'connected' : 'pending',
    needsUser: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    status: hasKey(env, 'OPENAI_API_KEY') ? 'connected' : 'pending',
    needsUser: !hasKey(env, 'OPENAI_API_KEY'),
    userAction: 'https://platform.openai.com/api-keys → .env.openai OPENAI_API_KEY',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    status: hasKey(env, 'GEMINI_API_KEY') || hasKey(env, 'GOOGLE_AI_API_KEY') ? 'ready_local' : 'pending',
    needsUser: !(hasKey(env, 'GEMINI_API_KEY') || hasKey(env, 'GOOGLE_AI_API_KEY')),
    userAction: 'https://aistudio.google.com/apikey → .env.openai GEMINI_API_KEY',
  },
  {
    id: 'claude',
    name: 'Claude',
    status: hasKey(env, 'ANTHROPIC_API_KEY') ? 'ready_local' : 'pending',
    needsUser: !hasKey(env, 'ANTHROPIC_API_KEY'),
    userAction: 'https://console.anthropic.com/settings/keys → .env.openai ANTHROPIC_API_KEY',
  },
  {
    id: 'gbp',
    name: 'Google Business Profile',
    status: dash?.connections?.businessProfile?.status || 'unknown',
    needsUser: dash?.connections?.businessProfile?.status === 'pending_google_api_approval',
    userAction: 'https://support.google.com/business/contact/api_default',
  },
  {
    id: 'ads',
    name: 'Google Ads',
    status: dash?.connections?.googleAds?.status || 'unknown',
    needsUser: ['pending_production_access', 'pending_developer_token'].includes(dash?.connections?.googleAds?.status),
    userAction: 'https://ads.google.com/aw/apicenter → Basic Access',
  },
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    status: dash?.connections?.googleTagManager?.status || 'unknown',
    needsUser: dash?.connections?.googleTagManager?.status === 'pending_oauth_scope',
    userAction: 'npm run project-001:auth -- --force (browser OAuth)',
  },
];

const report = {
  at: new Date().toISOString(),
  staging: EDGE_BASE,
  dashboardGeneratedAt: dash?.generatedAt || null,
  services,
  connected: services.filter((s) => s.status === 'connected').length,
  pendingUser: services.filter((s) => s.needsUser).map((s) => ({ id: s.id, action: s.userAction })),
};

console.log(JSON.stringify(report, null, 2));
