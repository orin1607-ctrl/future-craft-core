/**
 * QA: Edge Functions reject anonymous (anon-key) calls after security hardening.
 * Staging only — read-only probes, no data mutation.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'docs', 'audit-reports', 'security-hardening');
mkdirSync(OUT_DIR, { recursive: true });

function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
      if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

const fileEnv = loadEnv();
const env = { ...process.env, ...fileEnv };
const BASE = fileEnv.VITE_SUPABASE_URL || 'https://usfeoerkpcafxxlyuldl.supabase.co';
const ANON = fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!ANON) {
  console.error('Missing VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

if (!BASE.includes('usfeoerkpcafxxlyuldl')) {
  console.error('Refusing to run QA against non-staging project:', BASE);
  process.exit(1);
}

const PROTECTED = [
  { name: 'help-ai-chat', method: 'POST', body: { messages: [{ role: 'user', content: 'test' }] } },
  { name: 'twilio-outbound-call', method: 'POST', body: { to: '0500000000' } },
  { name: 'paypal-charge', method: 'POST', body: { action: 'test_connection' } },
  { name: 'send-password-reset', method: 'POST', body: { email: 'probe@example.com' } },
  { name: 'notify-accident-email', method: 'POST', body: { record: { company_name: 'x' } } },
  { name: 'notify-service-order-email', method: 'POST', body: { record: { company_name: 'x' } } },
  { name: 'send-supplier-order-email', method: 'POST', body: { to: 'x@x.com', order: { company_name: 'x' } } },
  { name: 'elevenlabs-conversation-token', method: 'POST', body: { agentId: 'test' } },
  { name: 'book-pickup-slot', method: 'POST', body: { company_name: 'x' } },
  { name: 'vehicle-lookup', method: 'GET', url: `${BASE}/functions/v1/vehicle-lookup?plate=1234567` },
];

async function probe(fn) {
  const url = fn.url || `${BASE}/functions/v1/${fn.name}`;
  const res = await fetch(url, {
    method: fn.method,
    headers: {
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
    },
    body: fn.method === 'POST' ? JSON.stringify(fn.body) : undefined,
  });
  let body = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text; }
  const blocked = res.status === 401 || res.status === 403;
  return { function: fn.name, status: res.status, blocked, body };
}

const results = [];
for (const fn of PROTECTED) {
  results.push(await probe(fn));
}

const report = {
  at: new Date().toISOString(),
  staging: BASE,
  all_blocked: results.every((r) => r.blocked),
  results,
};

writeFileSync(join(OUT_DIR, 'edge-auth-qa.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.all_blocked ? 0 : 1);
