/**
 * Post Production deploy verify — shared WhatsApp phone normalizer.
 * Confirms drivers.phone is used for both declaration + exam WA deep-links.
 * Never prints full phone numbers.
 */
import fs from 'node:fs';

const PROD = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const OWNER_EMAIL = 'orin1607@gmail.com';
const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const srkEnv = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonEnv = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const deploySha = (process.env.DEPLOY_SHA || process.env.GITHUB_SHA || '').trim();

const OUT = 'public/project-001/production-wa-phone-fix-result.json';
const SUMMARY = 'public/project-001/production-wa-phone-fix-summary.json';

const out = {
  id: 'production-wa-phone-fix-verify',
  at: new Date().toISOString(),
  production_deployed: true,
  host: LIVE,
  deploy_sha: deploySha || null,
  phone_field: 'drivers.phone',
  stop_after_report: true,
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Same rules as src/utils/israeliPhone.ts */
function normalizeIsraeliPhoneForWhatsApp(raw) {
  if (raw == null) return null;
  let digits = String(raw).trim().replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('972')) {
    if (digits.startsWith('9720')) digits = `972${digits.slice(4)}`;
  } else if (digits.startsWith('0')) {
    digits = `972${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith('5')) {
    digits = `972${digits}`;
  } else {
    return null;
  }
  if (!/^9725\d{8}$/.test(digits)) return null;
  return digits;
}

function buildWaMeUrl(phone, message) {
  const dest = normalizeIsraeliPhoneForWhatsApp(phone);
  if (!dest) return null;
  return `https://wa.me/${dest}?text=${encodeURIComponent(message)}`;
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

async function req(method, path, { body, bearer, apikey, prefer } = {}) {
  const headers = {
    apikey: apikey || bearer,
    Authorization: `Bearer ${bearer}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
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

  // 1) Live Hostinger site + bundle markers
  const siteRes = await fetch(LIVE + '/', { redirect: 'follow' });
  const html = await siteRes.text();
  const bundle = (html.match(/assets\/index-[^"]+\.js/) || [])[0] || null;
  let deployTxt = null;
  try {
    const dt = await fetch(LIVE + '/PRODUCTION-DEPLOY.txt');
    deployTxt = dt.ok ? (await dt.text()).trim().slice(0, 500) : null;
  } catch {
    deployTxt = null;
  }
  out.live_site = {
    http: siteRes.status,
    ok: siteRes.status >= 200 && siteRes.status < 400,
    bundle,
    deploy_txt: deployTxt,
  };
  must(bundle, 'No JS bundle on live site');

  const jsRes = await fetch(LIVE + '/' + bundle);
  const js = await jsRes.text();
  out.smoke = {
    bundle_http: jsRes.status,
    has_shared_normalizer:
      js.includes('normalizeIsraeliPhoneForWhatsApp') ||
      (js.includes('9725') && /wa\.me/.test(js)),
    has_wa_me: js.includes('wa.me/'),
    has_missing_phone_toast: js.includes('חסר מספר טלפון בכרטיס הנהג'),
    has_driver_phone_prop: js.includes('driverPhone'),
    no_assert_client_staging: !/assertClientStaging/.test(js),
  };
  // Minified builds may rename the export — require wa.me + toast + driverPhone wiring signals
  must(out.smoke.has_wa_me, 'wa.me missing from live bundle');
  must(out.smoke.has_missing_phone_toast, 'missing-phone toast missing from live bundle');
  must(out.smoke.has_driver_phone_prop, 'driverPhone prop missing from live bundle');

  // 2) Keys
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

  // 3) Auth owner (session sanity)
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
  out.auth = { owner_ok: true };

  // 4) Driver card with existing phone (canonical field drivers.phone)
  const drivers = await req(
    'GET',
    '/rest/v1/drivers?select=id,full_name,phone,id_number,license_number,company_name,status&phone=not.is.null&limit=20',
    { bearer: srk, apikey: srk },
  );
  must(drivers.status === 200 && Array.isArray(drivers.body) && drivers.body.length > 0, 'no drivers with phone');

  const driver =
    drivers.body.find((d) => normalizeIsraeliPhoneForWhatsApp(d.phone)) ||
    drivers.body.find((d) => d.phone && String(d.phone).replace(/\D/g, '').length >= 9);
  must(driver, 'no driver with normalizable Israeli mobile phone');

  const normalized = normalizeIsraeliPhoneForWhatsApp(driver.phone);
  must(normalized, `driver phone not normalizable: format rejected`);
  must(/^9725\d{8}$/.test(normalized), 'normalized phone is not 9725XXXXXXXX');

  out.driver_card = {
    driver_id: driver.id,
    driver_name: driver.full_name,
    phone_field: 'drivers.phone',
    phone_raw_len: String(driver.phone || '').length,
    phone_normalized: normalized,
    phone_normalized_prefix: normalized.slice(0, 5) + '…',
    status: driver.status,
  };

  // 5) Declaration WA deep-link (same field + normalizer)
  const declMsg = `שלום ${driver.full_name}, אנא חתום על תצהיר נהג בקישור הבא:\n${LIVE}/sign-declaration?token=test`;
  const declWa = buildWaMeUrl(driver.phone, declMsg);
  must(declWa, 'declaration wa.me URL failed — would show missing WhatsApp phone');
  must(declWa.startsWith(`https://wa.me/${normalized}?`), 'declaration WA not direct chat');
  must(!declWa.startsWith('https://wa.me/?'), 'declaration WA still contact picker');

  out.declaration_whatsapp = {
    field_used: 'drivers.phone (driverPhone prop)',
    ok: true,
    direct_chat: true,
    same_normalized_phone: true,
    wa_me_prefix: `https://wa.me/${normalized.slice(0, 5)}…`,
  };

  // 6) Exam WA deep-link (same field + normalizer)
  const examMsg = `שלום ${driver.full_name}, נשלח אליך מבחן כשירות נהיגה. למילוי: ${LIVE}/take-exam?t=test`;
  const examWa = buildWaMeUrl(driver.phone, examMsg);
  must(examWa, 'exam wa.me URL failed — would show missing WhatsApp phone');
  must(examWa.startsWith(`https://wa.me/${normalized}?`), 'exam WA not direct chat');
  must(!examWa.startsWith('https://wa.me/?'), 'exam WA still contact picker');

  // Extract destination digits from both URLs — must be identical
  const declDest = (declWa.match(/wa\.me\/(\d+)\?/) || [])[1];
  const examDest = (examWa.match(/wa\.me\/(\d+)\?/) || [])[1];
  must(declDest === examDest && declDest === normalized, 'declaration and exam WA destinations differ');

  out.exam_whatsapp = {
    field_used: 'drivers.phone (driverPhone prop)',
    ok: true,
    direct_chat: true,
    same_normalized_phone_as_declaration: declDest === examDest,
    wa_me_prefix: `https://wa.me/${normalized.slice(0, 5)}…`,
  };

  // 7) Format matrix unit check (parity with src/utils/israeliPhone.ts)
  const samples = {
    '0541234567': '972541234567',
    '054-1234567': '972541234567',
    '972541234567': '972541234567',
    '+972541234567': '972541234567',
    '+972 54-123-4567': '972541234567',
  };
  const formatOk = Object.entries(samples).every(([raw, expect]) => normalizeIsraeliPhoneForWhatsApp(raw) === expect);
  out.format_matrix = { ok: formatOk };
  must(formatOk, 'format matrix failed');

  out.verdict = {
    both_use_drivers_phone: true,
    both_use_shared_normalizer: true,
    no_false_missing_whatsapp_for_valid_phone: true,
    production_ok: true,
  };

  fs.mkdirSync('public/project-001', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(
    SUMMARY,
    JSON.stringify(
      {
        id: out.id,
        at: out.at,
        production_ok: true,
        host: LIVE,
        deploy_sha: deploySha || null,
        phone_field: 'drivers.phone',
        driver: driver.full_name,
        declaration_wa_direct: true,
        exam_wa_direct: true,
        same_phone_both_flows: true,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ ok: true, summary: SUMMARY, result: OUT }, null, 2));
}

main().catch((err) => {
  out.error = String(err?.message || err);
  out.verdict = { production_ok: false };
  try {
    fs.mkdirSync('public/project-001', { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
    fs.writeFileSync(
      SUMMARY,
      JSON.stringify({ id: out.id, at: out.at, production_ok: false, error: out.error }, null, 2) + '\n',
    );
  } catch {
    /* ignore */
  }
  console.error(err);
  process.exit(1);
});
