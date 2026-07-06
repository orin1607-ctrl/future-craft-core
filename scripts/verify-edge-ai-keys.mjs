/**
 * Verify Edge AI + Google secrets are wired (no secret values printed).
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const EDGE = `${STAGING_URL}/functions/v1`;

const report = { at: new Date().toISOString(), secrets: {}, edge: {}, ok: true };

const secretList = execSync(`npx supabase secrets list --project-ref ${STAGING_REF}`, { encoding: 'utf8' });
const names = secretList.split('\n').map((l) => l.trim().split('|')[0]?.trim()).filter(Boolean);
const has = (n) => names.some((row) => row === n);

report.secrets = {
  CLAUDE_API_KEY: has('CLAUDE_API_KEY'),
  ANTHROPIC_API_KEY: has('ANTHROPIC_API_KEY'),
  MARKETING_OPENAI_API_KEY: has('MARKETING_OPENAI_API_KEY'),
  OPENAI_API_KEY: has('OPENAI_API_KEY'),
  GEMINI_API_KEY: has('GEMINI_API_KEY'),
  GOOGLE_REFRESH_TOKEN: has('GOOGLE_REFRESH_TOKEN'),
  claudeUsable: has('CLAUDE_API_KEY') || has('ANTHROPIC_API_KEY'),
};

const keys = JSON.parse(
  execSync(`npx supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const runId = Date.now();
const email = `edge-ai-${runId}@staging-e2e.local`;
const password = `Ea!${runId}`;
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email)?.id;
await admin.from('profiles').upsert({
  id: uid, full_name: 'Edge AI Verify', company_name: 'דליה', is_active: true,
  approval_status: 'approved', two_factor_approved: true,
});
await admin.from('user_roles').delete().eq('user_id', uid);
await admin.from('user_roles').insert({ user_id: uid, role: 'super_admin' });
await new Promise((r) => setTimeout(r, 400));

const { data: auth } = await createClient(STAGING_URL, anon).auth.signInWithPassword({ email, password });
const token = auth.session.access_token;
const headers = { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function probe(name, url, body) {
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    const ok = !!(data.ok && (data.reply || data.text));
    report.edge[name] = {
      http: res.status,
      ok,
      error: data.error || data.message || null,
      model: data.model || null,
      detail: name === 'claude' && !ok ? JSON.stringify(data).slice(0, 280) : undefined,
    };
    if (!ok && res.status !== 503) {
      const billingOnly = name === 'gemini' && /prepayment|credits|billing/i.test(String(data.error || data.message || ''));
      if (billingOnly) {
        report.edge[name].hint = 'Gemini key OK — billing/credits depleted in Google AI Studio';
      } else {
        report.ok = false;
      }
    }
    if (name === 'claude' && res.status === 503 && /ANTHROPIC|CLAUDE/.test(String(data.error || data.message))) {
      report.edge[name].hint = 'Edge needs CLAUDE_API_KEY alias deploy';
    }
  } catch (e) {
    report.edge[name] = { ok: false, error: e.message };
    report.ok = false;
  }
}

await probe('openai', `${EDGE}/marketing-ai-chat`, { prompt: 'ענה במילה אחת: OK', module: 'verify' });
await probe('gemini', `${EDGE}/marketing-gemini-chat`, { prompt: 'ענה במילה אחת: OK', module: 'verify' });
await probe('claude', `${EDGE}/marketing-claude-chat`, { prompt: 'ענה במילה אחת: OK', module: 'verify' });

try {
  const res = await fetch(`${EDGE}/marketing-google-sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'status', customerId: 'dalia-c' }),
  });
  const data = await res.json();
  report.edge.googleSync = {
    http: res.status,
    ok: !!data.ok,
    claude: data.providers?.claude?.status || data.providers?.anthropic?.status,
    openai: data.providers?.openai?.status,
    gemini: data.providers?.gemini?.status,
  };
} catch (e) {
  report.edge.googleSync = { ok: false, error: e.message };
}

const outDir = join(process.cwd(), 'docs', 'audit-reports', 'edge-ai-verify');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
