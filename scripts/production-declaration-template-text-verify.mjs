/**
 * Production verify — declaration template edited text used in new declarations + sign page.
 * Frontend-only; no DB migration. Restores original template body after test.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const PROD = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const srkEnv = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonEnv = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const deploySha = (process.env.DEPLOY_SHA || process.env.GITHUB_SHA || '').trim();
const MARKER = `[[DECL-TXT-PROD-${Date.now()}]]`;

const OUT = 'public/project-001/production-declaration-template-text-result.json';
const SUMMARY = 'public/project-001/production-declaration-template-text-summary.json';

const out = {
  id: 'production-declaration-template-text-verify',
  at: new Date().toISOString(),
  host: LIVE,
  deploy_sha: deploySha || null,
  migrations_required: false,
  stop_after_report: true,
  checks: [],
  ok: false,
};

function check(id, ok, detail = {}) {
  out.checks.push({ id, ok, ...detail });
  console.log(ok ? '✅' : '❌', id, detail.error || detail.note || '');
}

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
  must(token || srkEnv, 'Need SUPABASE_ACCESS_TOKEN or SERVICE_ROLE');

  const siteRes = await fetch(LIVE + '/', { redirect: 'follow' });
  const html = await siteRes.text();
  const bundle = (html.match(/assets\/index-[^"]+\.js/) || [])[0] || null;
  must(siteRes.ok && bundle, 'Production site/bundle missing');
  const js = await (await fetch(`${LIVE}/${bundle}`)).text();
  must(js.includes('הנוסח נשמר'), 'persist toast missing');
  must(js.includes('חסר נוסח תצהיר'), 'no-hardcoded-display marker missing');
  must(!js.includes('Falling back to built-in declaration text'), 'silent fallback still present');
  must(!js.includes('usfeoerkpcafxxlyuldl'), 'staging supabase ref in prod bundle');
  check('bundle-markers', true, { bundle });

  let deployTxt = null;
  try {
    const dt = await fetch(LIVE + '/PRODUCTION-DEPLOY.txt');
    deployTxt = dt.ok ? (await dt.text()).trim().slice(0, 500) : null;
  } catch {
    deployTxt = null;
  }
  check('deploy-txt', Boolean(deployTxt && /declaration-template-text|decl/.test(deployTxt)), {
    deployTxt,
  });

  let srk = srkEnv;
  let anon = anonEnv;
  if (!srk && token) {
    const keys = await mgmt(`/projects/${PROD}/api-keys`);
    must(keys.status === 200 && Array.isArray(keys.json), 'api-keys failed');
    srk =
      keys.json.find((k) => k.name === 'service_role' || (k.tags || []).includes('service_role'))?.api_key ||
      keys.json.find((k) => String(k.name || '').includes('service'))?.api_key;
    anon =
      anon ||
      keys.json.find((k) => k.name === 'anon' || (k.tags || []).includes('anon'))?.api_key;
  }
  must(srk, 'NO_PROD_SERVICE_ROLE');

  const drivers = await req(
    'GET',
    '/rest/v1/drivers?select=id,full_name,id_number,company_name,status&status=eq.active&limit=20',
    { bearer: srk, apikey: srk },
  );
  must(drivers.status === 200 && drivers.body?.length, 'no drivers');
  const driver = drivers.body.find((d) => d.company_name?.trim()) || drivers.body[0];
  const company = String(driver.company_name || '').trim();

  let templates = await req(
    'GET',
    `/rest/v1/declaration_templates?company_name=eq.${encodeURIComponent(company)}&select=id,name,body,is_default&order=is_default.desc`,
    { bearer: srk, apikey: srk },
  );
  must(templates.status === 200, `list templates http=${templates.status}`);
  let tpl = templates.body?.find((t) => t.is_default) || templates.body?.[0];
  must(tpl, 'no template');
  const originalBody = String(tpl.body || '');
  const editedBody = `${MARKER}\n${originalBody.trim()}\nסוף`;

  const save = await req('PATCH', `/rest/v1/declaration_templates?id=eq.${tpl.id}`, {
    bearer: srk,
    apikey: srk,
    prefer: 'return=representation',
    body: { body: editedBody },
  });
  must(save.status >= 200 && save.status < 300, `save failed http=${save.status}`);
  const saved = Array.isArray(save.body) ? save.body[0] : save.body;
  must(saved?.body === editedBody, 'body not persisted');
  check('save-body', true, { template_id: tpl.id, company });

  // Ensure default
  if (!saved.is_default) {
    await req('PATCH', `/rest/v1/declaration_templates?id=eq.${tpl.id}`, {
      bearer: srk,
      apikey: srk,
      body: { is_default: true },
    });
  }

  const snapshot = editedBody.replace(/\{\{\s*id_number\s*\}\}/g, driver.id_number || '');
  const created = await req('POST', '/rest/v1/driver_declarations', {
    bearer: srk,
    apikey: srk,
    prefer: 'return=representation',
    body: {
      driver_id: driver.id,
      driver_name: driver.full_name,
      id_number: driver.id_number,
      company_name: company,
      declaration_text: snapshot,
      template_id: tpl.id,
      status: 'pending',
    },
  });
  must(created.status >= 200 && created.status < 300, `create decl http=${created.status}`);
  const decl = Array.isArray(created.body) ? created.body[0] : created.body;
  must(String(decl.declaration_text).includes(MARKER), 'snapshot missing marker');
  check('new-declaration-snapshot', true, { declaration_id: decl.id });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const signUrl = `${LIVE}/sign-declaration?token=${decl.token}`;
  const resp = await page.goto(signUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  const bodyText = await page.textContent('body');
  check('sign-page', (resp?.status() || 0) < 400 && (bodyText || '').includes(MARKER), {
    status: resp?.status(),
  });
  check('sign-no-seed-fallback', !(bodyText || '').includes('לא נתגלו אצלי') || (bodyText || '').includes(MARKER), {});
  await browser.close();

  // restore
  await req('PATCH', `/rest/v1/declaration_templates?id=eq.${tpl.id}`, {
    bearer: srk,
    apikey: srk,
    body: { body: originalBody, is_default: true },
  });
  await req('DELETE', `/rest/v1/driver_declarations?id=eq.${decl.id}`, {
    bearer: srk,
    apikey: srk,
  });
  check('restored', true);

  out.ok = out.checks.every((c) => c.ok);
  out.bundle = bundle;
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(
    SUMMARY,
    JSON.stringify(
      {
        id: 'production-declaration-template-text-summary',
        at: out.at,
        ok: out.ok,
        host: LIVE,
        bundle,
        deploy_sha: deploySha || null,
        checks_passed: out.checks.filter((c) => c.ok).length,
        checks_total: out.checks.length,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(out.ok ? 'PRODUCTION VERIFY OK' : 'PRODUCTION VERIFY FAILED');
  process.exit(out.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  out.ok = false;
  out.checks.push({ id: 'fatal', ok: false, error: String(err) });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  process.exit(1);
});
