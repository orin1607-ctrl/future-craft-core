#!/usr/bin/env node
/**
 * Environment health check — never prints secret values.
 *
 * Usage:
 *   node scripts/check-environment-health.mjs
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/check-environment-health.mjs
 *
 * Exit 0 = all critical checks OK (or WARN-only).
 * Exit 1 = one or more FAIL.
 */
import { existsSync, readFileSync } from 'fs';

const PROD = 'qasomfndnjuixgjmjwcm';
const STAGING = 'usfeoerkpcafxxlyuldl';
const LEGACY = 'kuenhflklivaxrmqbsee';
const PROD_URL = `https://${PROD}.supabase.co`;
const STAGING_URL = `https://${STAGING}.supabase.co`;
const LIVE = 'https://dalia-car.online';

const results = [];
function add(id, status, detail) {
  results.push({ id, status, detail });
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function decodeJwt(jwt) {
  try {
    const p = jwt.split('.')[1];
    return JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function httpJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

async function main() {
  const fileEnv = { ...parseEnvFile('.env'), ...parseEnvFile('.env.local') };
  const access =
    process.env.SUPABASE_ACCESS_TOKEN || fileEnv.SUPABASE_ACCESS_TOKEN || '';
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || '';
  const viteUrl = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || '';
  const viteRef =
    process.env.VITE_SUPABASE_PROJECT_ID || fileEnv.VITE_SUPABASE_PROJECT_ID || '';

  // --- Local env hygiene ---
  if (!viteUrl && !viteRef) {
    add('local_vite_env', 'WARN', 'No VITE_SUPABASE_* in .env / .env.local');
  } else if (viteRef === LEGACY || viteUrl.includes(LEGACY)) {
    add(
      'local_vite_env',
      'FAIL',
      `Points at LEGACY ref ${LEGACY} — use Staging ${STAGING} or Prod ${PROD} (.env.staging.example / .env.production.example)`,
    );
  } else if (viteRef === STAGING || viteUrl.includes(STAGING)) {
    add('local_vite_env', 'OK', `Staging ${STAGING}`);
  } else if (viteRef === PROD || viteUrl.includes(PROD)) {
    add('local_vite_env', 'OK', `Production ${PROD}`);
  } else {
    add('local_vite_env', 'WARN', `Unknown ref: ${viteRef || viteUrl}`);
  }

  add(
    'local_supabase_cli_session',
    existsSync(`${process.env.HOME || ''}/.supabase/access-token`) ? 'OK' : 'WARN',
    existsSync(`${process.env.HOME || ''}/.supabase/access-token`)
      ? 'CLI access-token file present'
      : 'No ~/.supabase/access-token — run supabase login on Orin machine for local Edge deploys',
  );

  // --- Access token ---
  if (!access) {
    add('access_token', 'FAIL', 'SUPABASE_ACCESS_TOKEN missing (env / .env.local)');
  } else {
    const r = await httpJson('https://api.supabase.com/v1/projects', {
      headers: { Authorization: `Bearer ${access}` },
    });
    if (r.status === 200 && Array.isArray(r.body)) {
      const refs = r.body.map((p) => p.id || p.ref).filter(Boolean);
      const hasStg = refs.includes(STAGING);
      const hasProd = refs.includes(PROD);
      add(
        'access_token',
        hasStg && hasProd ? 'OK' : 'WARN',
        `Management API OK · len=${access.length} · staging=${hasStg} · production=${hasProd}`,
      );
    } else {
      add(
        'access_token',
        'FAIL',
        `Management API HTTP ${r.status} — rotate token in Supabase Account → Access Tokens, update GitHub Secret`,
      );
    }
  }

  // --- Service role (optional locally; required in CI for some jobs) ---
  if (!serviceRole) {
    add('service_role', 'WARN', 'SUPABASE_SERVICE_ROLE_KEY not in local env (OK if only in GitHub Secrets)');
  } else {
    const payload = decodeJwt(serviceRole);
    if (!payload || payload.role !== 'service_role') {
      add('service_role', 'FAIL', 'JWT is not service_role');
    } else if (payload.ref === PROD) {
      add('service_role', 'OK', `Production service_role · ref=${PROD}`);
    } else if (payload.ref === STAGING) {
      add('service_role', 'OK', `Staging service_role · ref=${STAGING}`);
    } else {
      add('service_role', 'WARN', `service_role ref=${payload.ref}`);
    }
  }

  // --- Live frontend ---
  try {
    const htmlRes = await fetch(LIVE);
    const html = await htmlRes.text();
    const bundle = (html.match(/assets\/(index-[^"]+\.js)/) || [])[1] || null;
    const old = /BlJXIgah/.test(html);
    add(
      'frontend_production',
      old ? 'FAIL' : bundle ? 'OK' : 'WARN',
      old ? 'Old bundle BlJXIgah still live' : `bundle=${bundle}`,
    );
  } catch (e) {
    add('frontend_production', 'FAIL', String(e.message || e));
  }

  // --- Edge notify fingerprint (anon → expect auth error shape) ---
  try {
    const r = await httpJson(`${PROD_URL}/functions/v1/notify-accident-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: 'probe', Authorization: 'Bearer probe' },
      body: '{}',
    });
    add(
      'edge_notify_gateway',
      r.status === 401 || r.status === 400 || r.status === 200 ? 'OK' : 'WARN',
      `HTTP ${r.status} (function reachable)`,
    );
  } catch (e) {
    add('edge_notify_gateway', 'FAIL', String(e.message || e));
  }

  // --- Gupshup via service role session is heavy; document-only unless SRK present ---
  if (serviceRole && decodeJwt(serviceRole)?.ref === PROD) {
    try {
      // generateLink + verify for orin is too invasive for health; call check with SRK will fail auth
      // Probe function existence only
      const r = await httpJson(`${PROD_URL}/functions/v1/send-whatsapp-message`, {
        method: 'POST',
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'check_connection' }),
      });
      const configured = r.body && typeof r.body === 'object' ? r.body.configured : null;
      const msg = r.body && typeof r.body === 'object' ? r.body.message || r.body.error : '';
      if (configured === true) {
        add('gupshup_production', 'OK', 'GUPSHUP_API_KEY configured on Production Edge');
      } else if (configured === false || /GUPSHUP_API_KEY|not configured/i.test(String(msg))) {
        add(
          'gupshup_production',
          'FAIL',
          'GUPSHUP_API_KEY missing on Production Edge Secrets — copy from Staging Dashboard (do not paste in chat)',
        );
      } else {
        add(
          'gupshup_production',
          'WARN',
          `Could not confirm (HTTP ${r.status}; may need user JWT). Set GUPSHUP on Prod Edge Secrets.`,
        );
      }
    } catch (e) {
      add('gupshup_production', 'WARN', String(e.message || e));
    }
  } else {
    add(
      'gupshup_production',
      'WARN',
      'Skipped deep check — provide Prod SUPABASE_SERVICE_ROLE_KEY in env for CI/local health',
    );
  }

  // Staging gateway
  try {
    const r = await httpJson(`${STAGING_URL}/functions/v1/notify-accident-email`, {
      method: 'OPTIONS',
    });
    add('edge_staging_gateway', r.status < 500 ? 'OK' : 'FAIL', `OPTIONS HTTP ${r.status}`);
  } catch (e) {
    add('edge_staging_gateway', 'WARN', String(e.message || e));
  }

  const summary = {
    at: new Date().toISOString(),
    refs: { staging: STAGING, production: PROD, legacy_do_not_use: LEGACY },
    checks: results,
    counts: {
      ok: results.filter((r) => r.status === 'OK').length,
      warn: results.filter((r) => r.status === 'WARN').length,
      fail: results.filter((r) => r.status === 'FAIL').length,
    },
    remediation_doc: 'docs/ENVIRONMENT-AND-SECRETS-HE.md',
  };

  console.log(JSON.stringify(summary, null, 2));
  if (summary.counts.fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: String(e.message || e) }));
  process.exit(1);
});
