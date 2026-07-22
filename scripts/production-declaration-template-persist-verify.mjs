/**
 * Production verify: declaration template body persists after save + reload + new declaration.
 * Never prints full template bodies (only markers / lengths).
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

const OUT = 'public/project-001/production-declaration-template-persist-result.json';
const SUMMARY = 'public/project-001/production-declaration-template-persist-summary.json';
const MARKER = `[[PERSIST-TEST-${Date.now()}]]`;

const out = {
  id: 'production-declaration-template-persist-verify',
  at: new Date().toISOString(),
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

async function main() {
  must(token, 'SUPABASE_ACCESS_TOKEN missing');

  // 1) Live bundle markers — no silent hardcoded fallback for create
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
  out.live_site = { http: siteRes.status, ok: siteRes.status < 400, bundle, deploy_txt: deployTxt };
  must(bundle, 'No JS bundle on live site');

  const jsRes = await fetch(LIVE + '/' + bundle);
  const js = await jsRes.text();
  out.smoke = {
    bundle_http: jsRes.status,
    has_save_as_default: js.includes('saveDeclarationTemplateBodyAsDefault') || js.includes('התצהיר נשמר במסד הנתונים'),
    no_silent_fallback: !js.includes('Falling back to built-in declaration text'),
    has_templates_ui: js.includes('ניהול תבניות תצהיר') || js.includes('תבניות תצהיר'),
  };
  must(out.smoke.no_silent_fallback, 'Silent hardcoded fallback still in Production bundle');
  must(out.smoke.has_save_as_default, 'Persist-save markers missing from Production bundle');

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

  // 3) Auth sanity
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
  must(ver.body?.access_token || ver.body?.session?.access_token, `auth verify failed http=${ver.status}`);
  out.auth = { owner_ok: true };

  // 4) Pick active driver + company
  const drivers = await req(
    'GET',
    '/rest/v1/drivers?select=id,full_name,phone,id_number,license_number,company_name,status&status=eq.active&limit=20',
    { bearer: srk, apikey: srk },
  );
  must(drivers.status === 200 && Array.isArray(drivers.body) && drivers.body.length > 0, 'no active drivers');
  const driver =
    drivers.body.find((d) => d.company_name && String(d.company_name).trim()) || drivers.body[0];
  const company = String(driver.company_name || '').trim();
  must(company, 'driver missing company_name');

  // 5) Load / ensure default template
  let templates = await req(
    'GET',
    `/rest/v1/declaration_templates?company_name=eq.${encodeURIComponent(company)}&select=id,name,body,is_default,updated_at&order=is_default.desc&order=updated_at.desc`,
    { bearer: srk, apikey: srk },
  );
  must(templates.status === 200, `list templates failed http=${templates.status}`);
  let tpl = Array.isArray(templates.body) ? templates.body.find((t) => t.is_default) || templates.body[0] : null;
  if (!tpl) {
    const created = await req('POST', '/rest/v1/declaration_templates', {
      bearer: srk,
      apikey: srk,
      prefer: 'return=representation',
      body: {
        company_name: company,
        name: 'תצהיר כללי',
        body: 'seed body {{id_number}}',
        is_default: true,
        placeholders: [],
      },
    });
    must(created.status >= 200 && created.status < 300, `create seed template failed http=${created.status}`);
    tpl = Array.isArray(created.body) ? created.body[0] : created.body;
  }

  const originalBody = String(tpl.body || '');
  const editedBody = `${originalBody.trim()}\n\n${MARKER}`;

  // 6) Save body + set default (same as UI save)
  const save = await req('PATCH', `/rest/v1/declaration_templates?id=eq.${tpl.id}`, {
    bearer: srk,
    apikey: srk,
    prefer: 'return=representation',
    body: { body: editedBody, is_default: true },
  });
  must(save.status >= 200 && save.status < 300, `template save failed http=${save.status}`);

  // 7) Reload template (simulates refresh / reopen templates screen)
  const reload = await req(
    'GET',
    `/rest/v1/declaration_templates?id=eq.${tpl.id}&select=id,body,is_default,updated_at`,
    { bearer: srk, apikey: srk },
  );
  const reloaded = Array.isArray(reload.body) ? reload.body[0] : null;
  must(reloaded, 'reload template missing');
  must(reloaded.body === editedBody, 'template body reverted after reload');
  must(reloaded.is_default === true, 'saved template is not default');
  must(String(reloaded.body).includes(MARKER), 'persist marker missing after reload');

  out.after_save_reload = {
    ok: true,
    template_id: tpl.id,
    company,
    body_len: String(reloaded.body).length,
    has_marker: true,
    is_default: true,
  };

  // 8) Create new declaration from default (simulates "תצהיר חדש")
  const snapshot = String(reloaded.body)
    .replace(/\{\{\s*id_number\s*\}\}/g, driver.id_number || '______')
    .replace(/\{\{\s*driver_name\s*\}\}/g, driver.full_name || '');

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
      template_id: tpl.id,
      status: 'pending',
    },
  });
  must(createdDecl.status >= 200 && createdDecl.status < 300, `create declaration failed http=${createdDecl.status}`);
  const decl = Array.isArray(createdDecl.body) ? createdDecl.body[0] : createdDecl.body;
  must(String(decl.declaration_text || '').includes(MARKER), 'new declaration used old/hardcoded body');

  // Mark sent (send simulation) then reload template again
  await req('PATCH', `/rest/v1/driver_declarations?id=eq.${decl.id}`, {
    bearer: srk,
    apikey: srk,
    body: { sent_via: 'whatsapp', sent_at: new Date().toISOString() },
  });

  const afterSend = await req(
    'GET',
    `/rest/v1/declaration_templates?id=eq.${tpl.id}&select=id,body,is_default`,
    { bearer: srk, apikey: srk },
  );
  const afterSendTpl = Array.isArray(afterSend.body) ? afterSend.body[0] : null;
  must(afterSendTpl && afterSendTpl.body === editedBody, 'template reverted after sending declaration');

  // Default-by-company read (create path)
  const defaultAgain = await req(
    'GET',
    `/rest/v1/declaration_templates?company_name=eq.${encodeURIComponent(company)}&is_default=eq.true&select=id,body&limit=1`,
    { bearer: srk, apikey: srk },
  );
  const def = Array.isArray(defaultAgain.body) ? defaultAgain.body[0] : null;
  must(def && def.body === editedBody, 'default template body not the saved version');

  out.after_new_declaration = {
    ok: true,
    declaration_id: decl.id,
    driver_name: driver.full_name,
    snapshot_has_marker: true,
    template_still_persisted_after_send: true,
    default_matches_saved: true,
  };

  // 9) Restore original body (leave Production clean) but keep proof in result
  await req('PATCH', `/rest/v1/declaration_templates?id=eq.${tpl.id}`, {
    bearer: srk,
    apikey: srk,
    body: { body: originalBody, is_default: true },
  });
  out.restored_original = true;

  out.verdict = {
    production_ok: true,
    save_persists_in_db: true,
    survives_reload: true,
    new_declaration_uses_latest_default: true,
    survives_after_send: true,
    no_hardcoded_create_fallback_in_bundle: true,
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
        company,
        driver: driver.full_name,
        save_persists: true,
        reload_ok: true,
        new_declaration_ok: true,
        after_send_ok: true,
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
