/**
 * Post Production deploy verify (Hostinger + one WA send).
 * Never prints secret values. Stops after report files are written.
 */
import fs from 'node:fs';

const PROD = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const OWNER_EMAIL = 'orin1607@gmail.com';
const WA_DEST = '0534338601';
const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const srkEnv = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonEnv = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const deploySha = (process.env.DEPLOY_SHA || process.env.GITHUB_SHA || '').trim();

const OUT = 'public/project-001/production-owner-approved-result.json';
const SUMMARY = 'public/project-001/production-owner-approved-summary.json';

const out = {
  id: 'production-owner-approved-verify',
  at: new Date().toISOString(),
  production_deployed: true,
  host: LIVE,
  deploy_sha: deploySha || null,
  stop_after_report: true,
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

async function req(method, path, { body, bearer, apikey } = {}) {
  const headers = {
    apikey: apikey || bearer,
    Authorization: `Bearer ${bearer}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(PROD_URL + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, body: json };
}

async function main() {
  must(token, 'SUPABASE_ACCESS_TOKEN missing');

  // 1) Live Hostinger site
  const siteRes = await fetch(LIVE + '/', { redirect: 'follow' });
  const html = await siteRes.text();
  const bundle = (html.match(/assets\/index-[^"]+\.js/) || [])[0] || null;
  let deployTxt = null;
  try {
    const dt = await fetch(LIVE + '/PRODUCTION-DEPLOY.txt');
    deployTxt = dt.ok ? (await dt.text()).trim().slice(0, 300) : null;
  } catch {
    deployTxt = null;
  }
  out.live_site = {
    http: siteRes.status,
    ok: siteRes.status >= 200 && siteRes.status < 400,
    bundle,
    deploy_txt: deployTxt,
    sha_in_deploy_txt: deploySha ? Boolean(deployTxt && deployTxt.includes(deploySha.slice(0, 7))) : null,
  };

  // Smoke script markers
  const smoke = {
    has_assets: Boolean(bundle),
    mentions_supabase_prod: html.includes(PROD) || Boolean(bundle),
  };
  if (bundle) {
    const jsRes = await fetch(LIVE + '/' + bundle);
    const js = await jsRes.text();
    smoke.bundle_http = jsRes.status;
    smoke.has_allocate_incident = /allocate_incident/.test(js);
    smoke.no_assert_client_staging = !/assertClientStaging/.test(js);
  }
  out.smoke = smoke;

  // 2) Secrets names
  const secrets = await mgmt(`/projects/${PROD}/secrets`);
  const names = Array.isArray(secrets.json)
    ? secrets.json.map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean)
    : [];
  out.secrets = {
    http: secrets.status,
    GUPSHUP_API_KEY: names.includes('GUPSHUP_API_KEY'),
    RESEND_API_KEY: names.includes('RESEND_API_KEY'),
  };

  // 3) Auth + connection + one WA send
  let srk = srkEnv;
  let anon = anonEnv;
  if (!srk) {
    const keys = await mgmt(`/projects/${PROD}/api-keys`);
    must(keys.status === 200 && Array.isArray(keys.json), 'prod api-keys failed');
    srk =
      keys.json.find((k) => k.name === 'service_role' || (k.tags || []).includes('service_role'))?.api_key ||
      keys.json.find((k) => String(k.name || '').includes('service'))?.api_key;
    anon =
      anon ||
      keys.json.find((k) => k.name === 'anon' || (k.tags || []).includes('anon'))?.api_key;
  }
  must(srk, 'NO_PROD_SERVICE_ROLE');

  const gen = await req('POST', '/auth/v1/admin/generate_link', {
    body: { type: 'magiclink', email: OWNER_EMAIL },
    bearer: srk,
    apikey: srk,
  });
  must(gen.status === 200 && gen.body?.email_otp, `auth generate failed http=${gen.status}`);
  const ver = await req('POST', '/auth/v1/verify', {
    body: { type: 'magiclink', email: OWNER_EMAIL, token: gen.body.email_otp },
    bearer: anon || srk,
    apikey: anon || srk,
  });
  const at = ver.body?.access_token || ver.body?.session?.access_token;
  must(at, `auth verify failed http=${ver.status}`);

  const check = await req('POST', '/functions/v1/send-whatsapp-message', {
    body: { action: 'check_connection' },
    bearer: at,
    apikey: anon || srk,
  });
  out.gupshup = {
    http: check.status,
    configured: check.body?.configured ?? null,
    gupshup_verified: check.body?.gupshup_verified ?? null,
    gupshup_status: check.body?.gupshup_status ?? null,
    message: check.body?.message ?? null,
  };

  const dry = await req('POST', '/functions/v1/notify-accident-email', {
    body: {
      dry_run: true,
      type: 'fault',
      record: {
        id: '00000000-0000-4000-8000-000000000099',
        company_name: 'אילנה אטיאס',
        event_number: 'FLT-PROD-CHECK',
        fault_type: 'בדיקת פריסה',
        link: LIVE + '/faults',
      },
    },
    bearer: at,
    apikey: anon || srk,
  });
  out.edge_notify = {
    http: dry.status,
    is_new: dry.body?.dry_run === true && Array.isArray(dry.body?.would_whatsapp),
    would_whatsapp: dry.body?.would_whatsapp || [],
  };

  const MESSAGE = `בדיקת Production דליה — פריסה ל-Hostinger אושרה · ${new Date().toISOString()}`;
  const send = await req('POST', '/functions/v1/send-whatsapp-message', {
    body: { action: 'send', destination: WA_DEST, message: MESSAGE },
    bearer: at,
    apikey: anon || srk,
  });
  const messageId =
    send.body?.message_id ||
    send.body?.gupshup_response?.messageId ||
    send.body?.gupshup_response?.message_id ||
    send.body?.gupshup_response?.id ||
    null;
  out.whatsapp_send = {
    http: send.status,
    success: send.body?.success === true,
    gupshup_status: send.body?.gupshup_status ?? null,
    message_id: messageId,
    destination: WA_DEST,
    error: send.body?.error || null,
    note: send.body?.message || null,
  };

  const webhookProbe = await fetch(`${PROD_URL}/functions/v1/gupshup-webhook?check_system_alert=1&provider_message_id=rotation-probe-none`);
  out.gupshup_webhook = {
    http: webhookProbe.status,
    reachable: webhookProbe.status > 0 && webhookProbe.status < 500,
  };

  const ok =
    out.live_site.ok === true &&
    out.secrets.GUPSHUP_API_KEY === true &&
    out.gupshup.gupshup_verified === true &&
    out.whatsapp_send.success === true &&
    out.edge_notify.is_new === true;

  out.verdict = {
    hostinger_updated: out.live_site.ok === true && Boolean(out.live_site.bundle),
    health_ok: Boolean(out.smoke?.has_allocate_incident !== false && out.gupshup.gupshup_verified),
    whatsapp_sent_ok: out.whatsapp_send.success === true,
    production_system_ok: ok,
    stopped: true,
  };

  const summary = {
    id: 'production-owner-approved-summary',
    at: out.at,
    production_deployed: true,
    host: LIVE,
    deploy_sha: deploySha || null,
    live_bundle: out.live_site.bundle,
    deploy_txt: out.live_site.deploy_txt,
    gupshup_verified: out.gupshup.gupshup_verified,
    edge_notify_new: out.edge_notify.is_new,
    whatsapp_success: out.whatsapp_send.success,
    whatsapp_message_id: out.whatsapp_send.message_id,
    whatsapp_destination: WA_DEST,
    production_system_ok: ok,
    stopped: true,
    next: 'No further actions without explicit Owner approval',
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(OUT, JSON.stringify({ ...out, fatal: String(e.message || e) }, null, 2) + '\n');
  process.exit(1);
});
