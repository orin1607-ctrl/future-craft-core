/**
 * Production secrets verify + complete (no Production deploy of code).
 * - Validates SUPABASE_ACCESS_TOKEN (Management API)
 * - Lists Edge secret NAMES on Staging + Production (never values)
 * - If VPS env has GUPSHUP/RESEND values, copies missing ones to Production via Management API
 * - Verifies Production WA check_connection + Resend name presence
 * NEVER prints secret values.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const OWNER_EMAIL = 'orin1607@gmail.com';
const OUT = 'public/project-001/prod-secrets-verify-result.json';
const SUMMARY = 'public/project-001/prod-secrets-verify-summary.json';

const NEEDED = [
  'GUPSHUP_API_KEY',
  'GUPSHUP_SOURCE',
  'GUPSHUP_APP_NAME',
  'RESEND_API_KEY',
  'RESEND_FROM',
];

const out = {
  id: 'prod-secrets-verify',
  at: new Date().toISOString(),
  production_code_deployed: false,
  production_touched_code: false,
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function mgmt(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json, text: text.slice(0, 500) };
}

async function listSecretNames(token, ref) {
  const listed = await mgmt(token, `/projects/${ref}/secrets`);
  const names = Array.isArray(listed.json)
    ? listed.json.map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean)
    : [];
  const present = {};
  for (const n of NEEDED) present[n] = names.includes(n);
  return { http: listed.status, present, count: names.length };
}

async function setSecrets(token, ref, pairs) {
  // pairs: [{name, value}] — values never logged
  const payload = pairs.map(({ name, value }) => ({ name, value }));
  const res = await mgmt(token, `/projects/${ref}/secrets`, {
    method: 'POST',
    body: payload,
  });
  return {
    http: res.status,
    ok: res.status >= 200 && res.status < 300,
    names: pairs.map((p) => p.name),
    error: res.status >= 300 ? res.text : null,
  };
}

async function post(base, path, body, bearer, apikey) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      apikey: apikey || bearer,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function redactLen(v) {
  if (typeof v !== 'string' || !v) return { present: false, len: 0 };
  return { present: true, len: v.length };
}

/** Read key=value from VPS via SSH — returns map of names→values (caller must not log values). */
function loadFromVps() {
  const host = (process.env.VPS_HOST || '').trim();
  const user = (process.env.VPS_USER || '').trim();
  const key = (process.env.VPS_SSH_KEY || '').trim();
  if (!host || !user || !key) {
    return { ok: false, reason: 'VPS SSH secrets missing in Actions', found: {} };
  }
  const keyPath = '/tmp/prod-secrets-vps.key';
  fs.writeFileSync(keyPath, key.endsWith('\n') ? key : key + '\n', { mode: 0o600 });
  try {
    execSync(`ssh-keyscan -H ${host} >> ~/.ssh/known_hosts 2>/dev/null || true`, {
      stdio: 'ignore',
    });
  } catch {
    /* ignore */
  }
  const remote = `
set +e
python3 - <<'PY'
from pathlib import Path
import re, json
want = ${JSON.stringify(NEEDED)}
found = {}
roots = [Path('/root/dalia-ops'), Path('/root')]
for root in roots:
  if not root.exists():
    continue
  for p in root.rglob('*'):
    if not p.is_file() or p.stat().st_size > 400_000:
      continue
    name = p.name
    if not (name.startswith('.env') or name.endswith('.env') or name.endswith('.sh') or 'secret' in name.lower()):
      # still allow plain .env* under dalia-ops
      if 'dalia-ops' not in str(p):
        continue
    try:
      text = p.read_text(errors='ignore')
    except Exception:
      continue
    for line in text.splitlines():
      line=line.strip()
      if not line or line.startswith('#') or '=' not in line:
        continue
      k,v = line.split('=',1)
      k=k.strip(); v=v.strip().strip('"').strip("'")
      if k in want and v and k not in found:
        found[k]=v
print(json.dumps(found))
PY
`;
  try {
    const raw = execSync(
      `ssh -i ${keyPath} -o StrictHostKeyChecking=no -o ConnectTimeout=25 ${user}@${host} bash -s`,
      { input: remote, encoding: 'utf8', timeout: 120000 },
    );
    const line = raw
      .trim()
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .pop();
    const found = line ? JSON.parse(line) : {};
    const meta = {};
    for (const [k, v] of Object.entries(found)) meta[k] = redactLen(v);
    return { ok: true, found, meta };
  } catch (e) {
    return {
      ok: false,
      reason: String(e.message || e).slice(0, 200),
      found: {},
    };
  } finally {
    try {
      fs.unlinkSync(keyPath);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  const srk = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anon = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.ANON || '').trim();

  out.access_token = {
    present: Boolean(token),
    len: token.length,
  };
  must(token, 'SUPABASE_ACCESS_TOKEN missing in Actions');

  const projects = await mgmt(token, '/projects');
  out.access_token.valid = projects.status === 200;
  out.access_token.projects_http = projects.status;
  must(projects.status === 200, `SUPABASE_ACCESS_TOKEN invalid HTTP ${projects.status}`);

  out.staging_secrets = await listSecretNames(token, STAGING);
  out.production_secrets_before = await listSecretNames(token, PROD);

  // Optional: values from GitHub Actions secrets (if Owner stored them)
  const fromGh = {};
  for (const n of NEEDED) {
    const v = (process.env[n] || '').trim();
    if (v) fromGh[n] = v;
  }
  out.from_github_actions = Object.fromEntries(
    Object.entries(fromGh).map(([k, v]) => [k, redactLen(v)]),
  );

  const vps = loadFromVps();
  out.vps_scan = {
    ok: vps.ok,
    reason: vps.reason || null,
    found_meta: vps.meta || {},
  };

  // Merge sources: prefer GH Actions env, then VPS
  const available = { ...vps.found, ...fromGh };

  // Defaults for non-secret identity fields if key exists
  if (available.GUPSHUP_API_KEY) {
    if (!available.GUPSHUP_SOURCE) available.GUPSHUP_SOURCE = '972546500305';
    if (!available.GUPSHUP_APP_NAME) available.GUPSHUP_APP_NAME = 'DaliaVehicle';
  }

  const missingBefore = NEEDED.filter((n) => !out.production_secrets_before.present[n]);
  const toSet = [];
  for (const name of missingBefore) {
    if (available[name]) toSet.push({ name, value: available[name] });
  }
  // Also set SOURCE/APP_NAME if key is being set or already present but names missing
  if (
    (available.GUPSHUP_API_KEY || out.production_secrets_before.present.GUPSHUP_API_KEY) &&
    available.GUPSHUP_SOURCE &&
    !out.production_secrets_before.present.GUPSHUP_SOURCE
  ) {
    if (!toSet.find((x) => x.name === 'GUPSHUP_SOURCE')) {
      toSet.push({ name: 'GUPSHUP_SOURCE', value: available.GUPSHUP_SOURCE });
    }
  }
  if (
    (available.GUPSHUP_API_KEY || out.production_secrets_before.present.GUPSHUP_API_KEY) &&
    available.GUPSHUP_APP_NAME &&
    !out.production_secrets_before.present.GUPSHUP_APP_NAME
  ) {
    if (!toSet.find((x) => x.name === 'GUPSHUP_APP_NAME')) {
      toSet.push({ name: 'GUPSHUP_APP_NAME', value: available.GUPSHUP_APP_NAME });
    }
  }

  out.will_set = toSet.map((x) => x.name);
  if (toSet.length) {
    out.set_result = await setSecrets(token, PROD, toSet);
  } else {
    out.set_result = { skipped: true, reason: 'nothing_to_set_or_no_values' };
  }

  out.production_secrets_after = await listSecretNames(token, PROD);

  // Live probes on Production (no secret values)
  must(srk && anon, 'SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_PUBLISHABLE_KEY required for Prod probe');
  const base = `https://${PROD}.supabase.co`;
  const gen = await post(
    base,
    '/auth/v1/admin/generate_link',
    { type: 'magiclink', email: OWNER_EMAIL },
    srk,
    srk,
  );
  const ver = await post(
    base,
    '/auth/v1/verify',
    { type: 'magiclink', email: OWNER_EMAIL, token: gen.body.email_otp },
    anon,
    anon,
  );
  const at = ver.body?.access_token || ver.body?.session?.access_token;
  must(at, 'Prod auth probe failed');

  const wa = await post(base, '/functions/v1/send-whatsapp-message', { action: 'check_connection' }, at, anon);
  out.production_wa = {
    http: wa.status,
    configured: wa.body?.configured ?? null,
    gupshup_verified: wa.body?.gupshup_verified ?? null,
    app_name: wa.body?.app_name ?? null,
    source: wa.body?.source ?? null,
    message: String(wa.body?.message || wa.body?.error || '').slice(0, 180),
  };

  // Resend: name presence + optional dry notify shape (may fail auth on old edge — still useful)
  out.production_resend = {
    name_present: {
      RESEND_API_KEY: out.production_secrets_after.present.RESEND_API_KEY === true,
      RESEND_FROM: out.production_secrets_after.present.RESEND_FROM === true,
    },
  };

  const blockers = [];
  if (!out.access_token.valid) blockers.push('SUPABASE_ACCESS_TOKEN_invalid');
  if (!out.production_secrets_after.present.GUPSHUP_API_KEY) blockers.push('GUPSHUP_API_KEY_missing_on_prod');
  if (out.production_wa.configured !== true) blockers.push('production_wa_not_configured');
  if (!out.production_resend.name_present.RESEND_API_KEY) blockers.push('RESEND_API_KEY_missing_on_prod');

  out.blockers = blockers;
  out.ready_for_production_deploy = blockers.length === 0;
  out.owner_actions =
    blockers.length === 0
      ? []
      : [
          !out.production_secrets_after.present.GUPSHUP_API_KEY
            ? {
                secret: 'GUPSHUP_API_KEY',
                where: `https://supabase.com/dashboard/project/${PROD}/settings/functions`,
                how: 'Copy from Gupshup portal (DaliaVehicle) or Staging Dashboard — do not paste in chat',
              }
            : null,
          !out.production_resend.name_present.RESEND_API_KEY
            ? {
                secret: 'RESEND_API_KEY',
                where: `https://supabase.com/dashboard/project/${PROD}/settings/functions`,
                how: 'Copy from Staging Edge Secrets or Resend dashboard',
              }
            : null,
          out.production_wa.configured !== true && out.production_secrets_after.present.GUPSHUP_API_KEY
            ? {
                secret: 'GUPSHUP_* verify',
                where: 'Production Edge',
                how: 'Key name present but check_connection failed — verify key/app/source match Staging',
              }
            : null,
        ].filter(Boolean);

  const summary = {
    id: 'prod-secrets-verify-summary',
    at: out.at,
    access_token_valid: out.access_token.valid === true,
    production_wa_configured: out.production_wa.configured === true,
    resend_api_key_present: out.production_resend.name_present.RESEND_API_KEY === true,
    secrets_set_names: out.will_set,
    set_ok: out.set_result?.ok === true || out.set_result?.skipped === true,
    blockers: out.blockers,
    ready_for_production_deploy: out.ready_for_production_deploy,
    production_code_deployed: false,
    report_doc: 'docs/audit-reports/claims-incident-process/PROD-SECRETS-VERIFY-HE.md',
  };

  fs.mkdirSync('public/project-001', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  out.error = String(e?.message || e);
  out.ready_for_production_deploy = false;
  try {
    fs.mkdirSync('public/project-001', { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    fs.writeFileSync(
      SUMMARY,
      JSON.stringify(
        {
          id: 'prod-secrets-verify-summary',
          at: new Date().toISOString(),
          ready_for_production_deploy: false,
          error: out.error,
          production_code_deployed: false,
        },
        null,
        2,
      ),
    );
  } catch {
    /* ignore */
  }
  console.error(e);
  process.exit(1);
});
