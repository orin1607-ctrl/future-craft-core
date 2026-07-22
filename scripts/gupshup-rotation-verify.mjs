/**
 * Post-rotation verify: Staging+Prod GUPSHUP secrets, Staging live send, Make 87/58 apikey probe.
 * Never prints secret values. No Production code deploy.
 */
import fs from 'node:fs';

const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const makeToken = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const OWNER_EMAIL = 'orin1607@gmail.com';
const WA_DEST = '0534338601';
const BOT_ID = 5797671;
const GUPSHUP_SEND_URL = 'https://api.gupshup.io/wa/api/v1/msg';
const OUT = 'public/project-001/gupshup-rotation-verify-result.json';
const SUMMARY = 'public/project-001/gupshup-rotation-verify-summary.json';

const out = {
  id: 'gupshup-rotation-verify',
  at: new Date().toISOString(),
  production_code_deployed: false,
  production_touched_code: false,
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function mgmt(path) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: token },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
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
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 400) };
  }
  return { status: res.status, body: parsed };
}

async function listSecretNames(ref) {
  const listed = await mgmt(`/projects/${ref}/secrets`);
  const names = Array.isArray(listed.json)
    ? listed.json.map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean)
    : [];
  return {
    http: listed.status,
    GUPSHUP_API_KEY: names.includes('GUPSHUP_API_KEY'),
    GUPSHUP_APP_NAME: names.includes('GUPSHUP_APP_NAME'),
    GUPSHUP_SOURCE: names.includes('GUPSHUP_SOURCE'),
    GUPSHUP_APP_ID: names.includes('GUPSHUP_APP_ID'),
    count: names.length,
  };
}

function jwtRef(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).ref;
  } catch {
    return null;
  }
}

async function authAsOwner(base, srk, anon) {
  const gen = await post(base, '/auth/v1/admin/generate_link', { type: 'magiclink', email: OWNER_EMAIL }, srk, srk);
  const otp = gen.body?.email_otp;
  must(otp, `AUTH_GENERATE_FAILED http=${gen.status}`);
  const ver = await post(base, '/auth/v1/verify', { type: 'magiclink', email: OWNER_EMAIL, token: otp }, anon || srk, anon || srk);
  const at = ver.body?.access_token || ver.body?.session?.access_token;
  must(at, `AUTH_VERIFY_FAILED http=${ver.status}`);
  return at;
}

async function getProjectKeys(ref) {
  const keys = await mgmt(`/projects/${ref}/api-keys`);
  must(keys.status === 200 && Array.isArray(keys.json), `api-keys failed ${ref} http=${keys.status}`);
  const srk =
    keys.json.find((k) => k.name === 'service_role' || (k.tags || []).includes('service_role'))?.api_key ||
    keys.json.find((k) => String(k.name || '').includes('service'))?.api_key;
  const anon = keys.json.find((k) => k.name === 'anon' || (k.tags || []).includes('anon'))?.api_key;
  return { srk, anon };
}

async function verifyGupshupKeyDirect(apiKey, appName, source) {
  if (!apiKey) return { ok: false, reason: 'missing_key' };
  const formBody = new URLSearchParams({
    channel: 'whatsapp',
    source,
    destination: '0',
    'src.name': appName,
    message: JSON.stringify({ type: 'text', text: 'rotation-key-probe' }),
  });
  const res = await fetch(GUPSHUP_SEND_URL, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
  });
  const text = await res.text();
  // 401/403 = bad key; other = key accepted
  return {
    ok: res.status !== 401 && res.status !== 403,
    http: res.status,
    key_length: apiKey.length,
    body_snip: text.slice(0, 120),
  };
}

function walkModules(node, acc = []) {
  if (!node) return acc;
  if (Array.isArray(node)) {
    for (const n of node) walkModules(n, acc);
    return acc;
  }
  if (typeof node === 'object') {
    if (typeof node.module === 'string') acc.push(node);
    if (Array.isArray(node.flow)) walkModules(node.flow, acc);
    if (Array.isArray(node.routes)) {
      for (const r of node.routes) walkModules(r?.flow || r, acc);
    }
    if (Array.isArray(node.subflows)) walkModules(node.subflows, acc);
    if (Array.isArray(node.onerror)) walkModules(node.onerror, acc);
  }
  return acc;
}

function extractApikey(mod) {
  if (!mod) return null;
  const headers = mod.mapper?.headers || mod.mapper?.header || null;
  let raw = null;
  if (Array.isArray(headers)) {
    const hit = headers.find((h) => /^(api[_-]?key)$/i.test(String(h?.name || h?.key || '')));
    raw = hit?.value ?? hit?.Value ?? null;
  } else if (headers && typeof headers === 'object') {
    raw = headers.apikey || headers.apiKey || headers.Apikey || headers['api-key'] || null;
  }
  // Also common Make http mapper shape
  if (!raw && mod.mapper) {
    raw = mod.mapper.apikey || mod.mapper.apiKey || null;
  }
  if (typeof raw !== 'string') return null;
  // Skip Make template expressions — cannot validate without runtime
  if (raw.includes('{{') || raw.includes('}}')) {
    return { kind: 'template_expression', length: raw.length };
  }
  return { kind: 'literal', length: raw.length, value: raw };
}

async function makeGet(path) {
  const res = await fetch(`${MAKE_BASE}${path}`, {
    headers: { Authorization: `Token ${makeToken}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text: text.slice(0, 500) };
}

async function inspectMakeModule(bp, id, appName, source) {
  const mod = walkModules(bp).find((m) => Number(m.id) === Number(id)) || null;
  if (!mod) return { present: false };
  const url = String(mod.mapper?.url || '');
  const extracted = extractApikey(mod);
  const result = {
    present: true,
    module: mod.module,
    url_host_ok: /api\.gupshup\.io/i.test(url),
    apikey: extracted
      ? { kind: extracted.kind, length: extracted.length }
      : { kind: 'not_found_in_mapper', length: 0 },
    gupshup_probe: null,
    needs_update: null,
  };
  if (extracted?.kind === 'literal' && extracted.value) {
    const probe = await verifyGupshupKeyDirect(extracted.value, appName, source);
    result.gupshup_probe = { ok: probe.ok, http: probe.http, key_length: probe.key_length };
    result.needs_update = !probe.ok;
    // wipe value
    extracted.value = undefined;
  } else if (extracted?.kind === 'template_expression') {
    result.needs_update = 'unknown_template';
    result.note = 'apikey is a Make expression — cannot validate offline; send היי to business line to verify module 87';
  } else {
    result.needs_update = 'unknown_missing';
    result.note = 'apikey not found in mapper headers — check Connection credentials in Make UI';
  }
  return result;
}

async function main() {
  must(token, 'SUPABASE_ACCESS_TOKEN missing');

  out.staging_secrets = await listSecretNames(STAGING);
  out.production_secrets = await listSecretNames(PROD);

  // Staging keys + connection + send
  const stagingKeys = await getProjectKeys(STAGING);
  must(stagingKeys.srk, 'NO_STAGING_SERVICE_ROLE');
  must(jwtRef(stagingKeys.srk) !== PROD, 'ABORT_PRODUCTION_KEY');
  const stagingBase = `https://${STAGING}.supabase.co`;
  const stagingAt = await authAsOwner(stagingBase, stagingKeys.srk, stagingKeys.anon);

  const stCheck = await post(
    stagingBase,
    '/functions/v1/send-whatsapp-message',
    { action: 'check_connection' },
    stagingAt,
    stagingKeys.anon || stagingKeys.srk,
  );
  out.staging_connection = {
    http: stCheck.status,
    configured: stCheck.body?.configured ?? null,
    gupshup_verified: stCheck.body?.gupshup_verified ?? null,
    gupshup_status: stCheck.body?.gupshup_status ?? null,
    app_name: stCheck.body?.app_name ?? null,
    source: stCheck.body?.source ?? null,
    message: stCheck.body?.message ?? null,
    key_length: stCheck.body?.GUPSHUP_API_KEY_length ?? stCheck.body?.api_key_length ?? null,
  };

  const insp = await post(
    stagingBase,
    '/functions/v1/send-whatsapp-message',
    { action: 'inspect_outbound_permissions' },
    stagingAt,
    stagingKeys.anon || stagingKeys.srk,
  );
  out.staging_inspect = {
    http: insp.status,
    key_length: insp.body?.api_key?.length ?? null,
    belongs_to_app: insp.body?.analysis?.api_key_belongs_to_dalia_vehicle_app ?? null,
    app_id: insp.body?.app?.id ?? null,
  };

  const MESSAGE = `בדיקת רוטציה Gupshup Staging — ${new Date().toISOString()}`;
  const send = await post(
    stagingBase,
    '/functions/v1/send-whatsapp-message',
    { action: 'send', destination: WA_DEST, message: MESSAGE },
    stagingAt,
    stagingKeys.anon || stagingKeys.srk,
  );
  const messageId =
    send.body?.message_id ||
    send.body?.gupshup_response?.messageId ||
    send.body?.gupshup_response?.message_id ||
    send.body?.gupshup_response?.id ||
    null;
  out.staging_send = {
    http: send.status,
    success: send.body?.success === true,
    gupshup_status: send.body?.gupshup_status ?? null,
    message_id: messageId,
    destination: WA_DEST,
    error: send.body?.error || send.body?.message || null,
  };

  // Production connection only (no send)
  const prodKeys = await getProjectKeys(PROD);
  must(prodKeys.srk, 'NO_PROD_SERVICE_ROLE');
  const prodBase = `https://${PROD}.supabase.co`;
  // Prefer Prod auth for Prod edge — generate link on Prod
  let prodAt = null;
  try {
    prodAt = await authAsOwner(prodBase, prodKeys.srk, prodKeys.anon);
  } catch (e) {
    out.production_auth_error = String(e.message || e);
  }
  if (prodAt) {
    const prCheck = await post(
      prodBase,
      '/functions/v1/send-whatsapp-message',
      { action: 'check_connection' },
      prodAt,
      prodKeys.anon || prodKeys.srk,
    );
    out.production_connection = {
      http: prCheck.status,
      configured: prCheck.body?.configured ?? null,
      gupshup_verified: prCheck.body?.gupshup_verified ?? null,
      gupshup_status: prCheck.body?.gupshup_status ?? null,
      message: prCheck.body?.message ?? null,
      key_length: prCheck.body?.GUPSHUP_API_KEY_length ?? prCheck.body?.api_key_length ?? null,
    };
  } else {
    out.production_connection = { skipped: true, reason: 'auth_failed' };
  }

  // Make 87 / 58
  const appName = out.staging_connection.app_name || 'DaliaVehicle';
  const source = out.staging_connection.source || '972546500305';
  if (makeToken) {
    const bpRes = await makeGet(`/scenarios/${BOT_ID}/blueprint`);
    const bp = bpRes.json?.response?.blueprint || bpRes.json?.blueprint || bpRes.json;
    out.make = {
      http: bpRes.status,
      scenario: BOT_ID,
      module_87: null,
      module_58: null,
    };
    if (bpRes.status >= 200 && bpRes.status < 300 && bp) {
      out.make.module_87 = await inspectMakeModule(bp, 87, appName, source);
      out.make.module_58 = await inspectMakeModule(bp, 58, appName, source);
    } else {
      out.make.error = bpRes.text;
    }
  } else {
    out.make = { skipped: true, reason: 'MAKE_API_TOKEN missing' };
  }

  const stagingOk =
    out.staging_secrets.GUPSHUP_API_KEY === true &&
    out.staging_connection.gupshup_verified === true &&
    out.staging_send.success === true;
  const prodOk =
    out.production_secrets.GUPSHUP_API_KEY === true &&
    (out.production_connection?.gupshup_verified === true ||
      out.production_connection?.configured === true);
  const make87Needs =
    out.make?.module_87?.needs_update === true
      ? true
      : out.make?.module_87?.needs_update === false
        ? false
        : out.make?.module_87?.needs_update || null;
  const make58Needs =
    out.make?.module_58?.needs_update === true
      ? true
      : out.make?.module_58?.needs_update === false
        ? false
        : out.make?.module_58?.needs_update || null;

  out.verdict = {
    staging_secret_ok: out.staging_secrets.GUPSHUP_API_KEY === true,
    staging_connection_ok: out.staging_connection.gupshup_verified === true,
    staging_send_ok: out.staging_send.success === true,
    production_secret_ok: out.production_secrets.GUPSHUP_API_KEY === true,
    production_connection_ok: out.production_connection?.gupshup_verified === true,
    make_87_needs_update: make87Needs,
    make_58_needs_update: make58Needs,
    rotation_success: Boolean(stagingOk && out.production_secrets.GUPSHUP_API_KEY),
    rotation_success_strict: Boolean(stagingOk && prodOk),
  };

  // If Make 87 key still validates against Gupshup, no update required even if different from Edge
  if (make87Needs === false) {
    out.verdict.make_note_he = 'מודול 87: apikey עדיין תקף מול Gupshup — אין חובה לעדכן';
  } else if (make87Needs === true) {
    out.verdict.make_note_he = 'מודול 87: apikey נדחה (401/403) — חובה לעדכן את ה-apikey ב-Make לערך החדש';
  }

  const summary = {
    id: 'gupshup-rotation-verify-summary',
    at: out.at,
    staging_verified: out.verdict.staging_connection_ok,
    staging_send_ok: out.verdict.staging_send_ok,
    staging_message_id: out.staging_send.message_id,
    production_secret_present: out.verdict.production_secret_ok,
    production_verified: out.verdict.production_connection_ok,
    make_87_needs_update: make87Needs,
    make_58_needs_update: make58Needs,
    rotation_success: out.verdict.rotation_success_strict || out.verdict.rotation_success,
    production_code_deployed: false,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));

  if (!out.verdict.staging_connection_ok || !out.verdict.staging_send_ok) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    OUT,
    JSON.stringify({ ...out, fatal: String(e.message || e) }, null, 2) + '\n',
  );
  process.exit(1);
});
