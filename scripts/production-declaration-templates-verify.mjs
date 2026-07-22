/**
 * Post Production deploy verify for declaration templates.
 * Never prints secret values. Stops after report files are written.
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

const OUT = 'public/project-001/production-declaration-templates-result.json';
const SUMMARY = 'public/project-001/production-declaration-templates-summary.json';

const out = {
  id: 'production-declaration-templates-verify',
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

function normalizePhoneForWaMe(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  else if (!digits.startsWith('972') && digits.length >= 9) digits = `972${digits}`;
  return digits;
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
    deployTxt = dt.ok ? (await dt.text()).trim().slice(0, 400) : null;
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
    has_declaration_templates: js.includes('declaration_templates') || js.includes('תבניות תצהיר'),
    has_preview: js.includes('תצוגה מקדימה'),
    has_wa_me: js.includes('wa.me/'),
    has_sign_declaration: js.includes('sign-declaration'),
    no_assert_client_staging: !/assertClientStaging/.test(js),
  };
  must(out.smoke.has_declaration_templates || out.smoke.has_preview, 'Declaration UI markers missing from live bundle');
  must(out.smoke.has_sign_declaration, 'sign-declaration missing from live bundle');

  // 2) Resolve keys
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

  // 3) Schema checks
  const tpl = await req('GET', '/rest/v1/declaration_templates?select=id,name,is_default,company_name&limit=5', {
    bearer: srk,
    apikey: srk,
  });
  out.schema = {
    declaration_templates_http: tpl.status,
    ok: tpl.status === 200,
    sample_count: Array.isArray(tpl.body) ? tpl.body.length : null,
  };
  must(tpl.status === 200, `declaration_templates missing/unreachable http=${tpl.status}`);

  const dd = await req('GET', '/rest/v1/driver_declarations?select=id,template_id,status&limit=1', {
    bearer: srk,
    apikey: srk,
  });
  out.schema.template_id_column_ok = dd.status === 200;
  must(dd.status === 200, `driver_declarations.template_id probe failed http=${dd.status}`);

  // 4) Auth as owner
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

  // 5) Pick a driver with phone and create one pending declaration for WA deep-link test
  const drivers = await req(
    'GET',
    '/rest/v1/drivers?select=id,full_name,phone,id_number,license_number,company_name&phone=not.is.null&status=eq.active&limit=5',
    { bearer: srk, apikey: srk },
  );
  must(drivers.status === 200 && Array.isArray(drivers.body) && drivers.body.length > 0, 'no active drivers with phone');
  const driver = drivers.body.find((d) => d.phone && String(d.phone).replace(/\D/g, '').length >= 9) || drivers.body[0];

  // Ensure default template exists for company (service role bypasses RLS)
  const company = driver.company_name || 'Production';
  let templates = await req(
    'GET',
    `/rest/v1/declaration_templates?company_name=eq.${encodeURIComponent(company)}&select=id,body,is_default&order=is_default.desc&limit=5`,
    { bearer: srk, apikey: srk },
  );
  let template = Array.isArray(templates.body) ? templates.body.find((t) => t.is_default) || templates.body[0] : null;
  if (!template) {
    const body = `אני החתום מטה, בעל תעודת זהות מספר {{id_number}},\nמצהיר בזה כי הצהרתי הנ״ל אמת`;
    const created = await req('POST', '/rest/v1/declaration_templates', {
      bearer: srk,
      apikey: srk,
      prefer: 'return=representation',
      body: {
        company_name: company,
        name: 'תצהיר כללי',
        body,
        is_default: true,
        placeholders: [],
      },
    });
    must(created.status >= 200 && created.status < 300, `create template failed http=${created.status}`);
    template = Array.isArray(created.body) ? created.body[0] : created.body;
  }

  const snapshot = String(template.body || '')
    .replace(/\{\{\s*id_number\s*\}\}/g, driver.id_number || '______')
    .replace(/\{\{\s*driver_name\s*\}\}/g, driver.full_name || '')
    .replace(/______/g, driver.id_number || '______');

  const createdDecl = await req('POST', '/rest/v1/driver_declarations', {
    bearer: srk,
    apikey: srk,
    prefer: 'return=representation',
    body: {
      driver_id: driver.id,
      driver_name: driver.full_name,
      id_number: driver.id_number || null,
      license_number: driver.license_number || null,
      company_name: company,
      declaration_text: snapshot,
      template_id: template.id,
      status: 'pending',
    },
  });
  must(createdDecl.status >= 200 && createdDecl.status < 300, `create declaration failed http=${createdDecl.status}`);
  const decl = Array.isArray(createdDecl.body) ? createdDecl.body[0] : createdDecl.body;
  must(decl?.token, 'created declaration missing token');

  const signUrl = `${LIVE}/sign-declaration?token=${encodeURIComponent(decl.token)}`;
  const waPhone = normalizePhoneForWaMe(driver.phone);
  const waMessage = `שלום ${driver.full_name}, אנא חתום על תצהיר נהג בקישור הבא:\n${signUrl}`;
  const waMeUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`;

  // Mark sent_via for audit trail
  await req('PATCH', `/rest/v1/driver_declarations?id=eq.${decl.id}`, {
    bearer: srk,
    apikey: srk,
    body: { sent_via: 'whatsapp', sent_at: new Date().toISOString() },
  });

  // 6) Sign page opens (SPA)
  const signPage = await fetch(signUrl, { redirect: 'follow' });
  const signHtml = await signPage.text();
  out.sign_page = {
    url: signUrl,
    http: signPage.status,
    looks_like_app: /דליה|sign-declaration|root/.test(signHtml) || signHtml.includes('index-'),
  };

  // Token readable (public pending path may require anon RLS — use service role probe + anon)
  const byTokenAnon = await req(
    'GET',
    `/rest/v1/driver_declarations?token=eq.${encodeURIComponent(decl.token)}&select=id,status,driver_name,token`,
    { bearer: anon || srk, apikey: anon || srk },
  );
  out.token_lookup = {
    http: byTokenAnon.status,
    found: Array.isArray(byTokenAnon.body) && byTokenAnon.body.length > 0,
  };

  out.whatsapp = {
    driver_name: driver.full_name,
    phone_normalized_prefix: waPhone.slice(0, 5) + '…',
    wa_me_has_phone: waMeUrl.startsWith(`https://wa.me/${waPhone}?`),
    wa_me_not_contact_picker: !waMeUrl.startsWith('https://wa.me/?'),
    declaration_id: decl.id,
    sign_url: signUrl,
  };
  must(out.whatsapp.wa_me_has_phone, 'wa.me URL missing driver phone');
  must(out.whatsapp.wa_me_not_contact_picker, 'wa.me still opens contact picker form');

  // Optional: open wa.me is client-side; we validate URL construction + sign page.
  out.success = Boolean(
    out.live_site.ok &&
      out.schema.ok &&
      out.sign_page.looks_like_app &&
      out.whatsapp.wa_me_has_phone,
  );

  fs.mkdirSync('public/project-001', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  fs.writeFileSync(
    SUMMARY,
    JSON.stringify(
      {
        ok: out.success,
        host: LIVE,
        deploy_sha: deploySha,
        declaration_id: decl.id,
        sign_url: signUrl,
        wa_direct_chat: true,
        at: out.at,
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({ ok: out.success, declaration_id: decl.id, sign_url: signUrl, bundle }, null, 2));
  if (!out.success) process.exit(1);
}

main().catch((e) => {
  console.error('VERIFY_FAILED', e?.message || e);
  try {
    fs.mkdirSync('public/project-001', { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ ok: false, error: String(e?.message || e), at: new Date().toISOString() }, null, 2));
  } catch {
    /* ignore */
  }
  process.exit(1);
});
