/**
 * Read-only: reports whether env keys exist locally (never prints values).
 */
import { readFileSync, existsSync } from 'fs';

function parseEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function hasVal(v) {
  return !!(v && v.length > 3 && !/^(your_|xxx|changeme|placeholder|sk-test)/i.test(v));
}

const envFiles = ['.env', '.env.local', '.env.google', '.env.openai', '.env.ads'];
const merged = {};
for (const f of envFiles) Object.assign(merged, parseEnv(f));

const keys = [
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_GSC_SITE', 'GOOGLE_GA4_PROPERTY',
  'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'OPENAI_API_KEY', 'MARKETING_OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'ANTHROPIC_API_KEY',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN', 'DATABASE_URL', 'SUPABASE_DB_PASSWORD',
  'RESEND_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'GUPSHUP_API_KEY', 'PAYPAL_CLIENT_ID',
  'PAYPAL_SECRET', 'ELEVENLABS_API_KEY', 'LOVABLE_API_KEY', 'GITHUB_PAT', 'GMAIL_SEND_ENABLED',
];

let tokenMeta = { exists: false, hasRefresh: false, possiblyExpired: null };
if (existsSync('integrations/google/token.json')) {
  tokenMeta.exists = true;
  try {
    const t = JSON.parse(readFileSync('integrations/google/token.json', 'utf8'));
    tokenMeta.hasRefresh = !!t.refresh_token;
    tokenMeta.possiblyExpired = t.expiry_date ? Date.now() > t.expiry_date : null;
  } catch { /* ignore */ }
}

let dash = null;
if (existsSync('public/project-001/dashboard.json')) {
  dash = JSON.parse(readFileSync('public/project-001/dashboard.json', 'utf8'));
}

console.log(JSON.stringify({
  at: new Date().toISOString(),
  envFilesPresent: envFiles.filter((f) => existsSync(f)),
  oauthCredentials: existsSync('integrations/google/credentials.oauth.json'),
  token: tokenMeta,
  dashboard: dash ? {
    generatedAt: dash.generatedAt,
    lastSync: dash.lastSync?.timestamp,
    connections: Object.fromEntries(Object.entries(dash.connections || {}).map(([k, v]) => [k, { ok: !!v.ok, status: v.status }])),
    statsSample: { totalClicks: dash.stats?.totalClicks, ga4Sessions: dash.stats?.ga4Sessions },
  } : null,
  keysPresent: Object.fromEntries(keys.map((k) => [k, hasVal(merged[k])])),
}, null, 2));
