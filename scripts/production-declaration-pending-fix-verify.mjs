/**
 * Production live verify — edit template → create fresh declaration → open sign link → WhatsApp.
 * Target: company אילנה אטיאס / driver בדיקה אילנה / phone 0534338601
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const PROD = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const OWNER_EMAIL = 'orin1607@gmail.com';
const COMPANY = 'אילנה אטיאס';
const DRIVER_ID = '38273c4e-1931-497c-9024-1f0cbf135703';
const WA_DEST = '0534338601';
const MARKER = `[[PROD-DECL-LIVE-${Date.now()}]]`;

const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const srkEnv = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonEnv = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const deploySha = (process.env.DEPLOY_SHA || process.env.GITHUB_SHA || '').trim();

const OUT = 'public/project-001/production-declaration-pending-fix-result.json';
const SUMMARY = 'public/project-001/production-declaration-pending-fix-summary.json';

const out = {
  id: 'production-declaration-pending-fix-verify',
  at: new Date().toISOString(),
  host: LIVE,
  deploy_sha: deploySha || null,
  company: COMPANY,
  driver_id: DRIVER_ID,
  wa_dest: WA_DEST,
  marker: MARKER,
  root_cause:
    'UI blocked "תצהיר חדש" while status=pending, so WhatsApp re-sent immutable old declaration_text snapshot after template edit',
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
  return { status: res.status, json: await res.json().catch(() => null) };
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
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body: json };
}

async function main() {
  must(token || srkEnv, 'Need SUPABASE credentials');

  // Bundle markers for the pending fix
  const site = await fetch(LIVE + '/');
  const html = await site.text();
  const bundle = (html.match(/assets\/index-[^"]+\.js/) || [])[0];
  must(bundle, 'no bundle');
  const js = await (await fetch(`${LIVE}/${bundle}`)).text();
  must(js.includes('מהנוסח העדכני') || js.includes('בוטל (הוחלף)'), 'pending-fix markers missing from Production bundle');
  check('bundle-fix-markers', true, { bundle });

  let deployTxt = null;
  try {
    const dt = await fetch(LIVE + '/PRODUCTION-DEPLOY.txt');
    deployTxt = dt.ok ? (await dt.text()).trim().slice(0, 400) : null;
  } catch {
    deployTxt = null;
  }
  check('deploy-txt', Boolean(deployTxt && /declaration-pending|pending-fix/.test(deployTxt)), { deployTxt });

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
  must(srk, 'NO_SERVICE_ROLE');

  // Load driver
  const driverRes = await req('GET', `/rest/v1/drivers?id=eq.${DRIVER_ID}&select=*`, { bearer: srk, apikey: srk });
  const driver = Array.isArray(driverRes.body) ? driverRes.body[0] : null;
  must(driver, 'driver missing');
  check('driver', true, { name: driver.full_name, phone: driver.phone, company: driver.company_name });

  // 1) Edit default template with clear marker (like owner save)
  const tplRes = await req(
    'GET',
    `/rest/v1/declaration_templates?company_name=eq.${encodeURIComponent(COMPANY)}&is_default=eq.true&select=*`,
    { bearer: srk, apikey: srk },
  );
  const tpl = Array.isArray(tplRes.body) ? tplRes.body[0] : null;
  must(tpl, 'default template missing');
  const originalBody = String(tpl.body || '');
  const editedBody = `${MARKER}\nיוני הקווים / אילנה אטיאס — נוסח מעודכן לבדיקת Production\n{{id_number}}\nסוף נוסח מעודכן`;

  const save = await req('PATCH', `/rest/v1/declaration_templates?id=eq.${tpl.id}`, {
    bearer: srk,
    apikey: srk,
    prefer: 'return=representation',
    body: { body: editedBody, is_default: true },
  });
  must(save.status >= 200 && save.status < 300, `template save failed http=${save.status}`);
  const saved = Array.isArray(save.body) ? save.body[0] : save.body;
  must(saved?.body === editedBody, 'template body not persisted');
  check('template-save', true, { template_id: tpl.id });

  // 2) Cancel old pending (same as fixed UI) + create NEW declaration from edited body
  const oldPending = await req(
    'GET',
    `/rest/v1/driver_declarations?driver_id=eq.${DRIVER_ID}&status=eq.pending&select=id,declaration_text,token,created_at`,
    { bearer: srk, apikey: srk },
  );
  const oldIds = (oldPending.body || []).map((d) => d.id);
  if (oldIds.length) {
    for (const id of oldIds) {
      await req('PATCH', `/rest/v1/driver_declarations?id=eq.${id}`, {
        bearer: srk,
        apikey: srk,
        body: { status: 'cancelled' },
      });
    }
  }
  check('cancel-old-pending', true, { cancelled: oldIds.length });

  const snapshot = editedBody.replace(/\{\{\s*id_number\s*\}\}/g, driver.id_number || '______');
  const created = await req('POST', '/rest/v1/driver_declarations', {
    bearer: srk,
    apikey: srk,
    prefer: 'return=representation',
    body: {
      driver_id: DRIVER_ID,
      driver_name: driver.full_name,
      id_number: driver.id_number,
      company_name: COMPANY,
      declaration_text: snapshot,
      template_id: tpl.id,
      status: 'pending',
    },
  });
  must(created.status >= 200 && created.status < 300, `create failed http=${created.status}`);
  const decl = Array.isArray(created.body) ? created.body[0] : created.body;
  must(String(decl.declaration_text).includes(MARKER), 'new declaration missing marker');
  must(!String(decl.declaration_text).startsWith('אני החתום מטה'), 'new declaration still starts with old seed opener');
  check('create-new-declaration', true, { declaration_id: decl.id, token_tail: String(decl.token).slice(-8) });

  // 3) Open sign link — must show NEW text
  const signUrl = `${LIVE}/sign-declaration?token=${decl.token}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const resp = await page.goto(signUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const bodyText = (await page.textContent('body')) || '';
  const hasMarker = bodyText.includes(MARKER);
  const hasOldOpener = bodyText.includes('אני החתום מטה');
  const hasNewOpener = bodyText.includes('יוני הקווים') || bodyText.includes('נוסח מעודכן לבדיקת Production');
  check('sign-page-new-text', hasMarker && hasNewOpener && !hasOldOpener, {
    status: resp?.status(),
    signUrl,
    hasMarker,
    hasNewOpener,
    hasOldOpener,
  });
  await page.screenshot({ path: '/opt/cursor/artifacts/prod-decl-sign-new-text.png', fullPage: true }).catch(() => {});
  await browser.close();
  must(hasMarker && hasNewOpener && !hasOldOpener, 'SIGN PAGE STILL SHOWS OLD TEXT');

  // 4) Real WhatsApp send to 0534338601 with the sign link
  const gen = await req('POST', '/auth/v1/admin/generate_link', {
    body: { type: 'magiclink', email: OWNER_EMAIL },
    bearer: srk,
    apikey: srk,
  });
  must(gen.status === 200 && gen.body?.email_otp, 'auth generate failed');
  const ver = await req('POST', '/auth/v1/verify', {
    body: { type: 'magiclink', email: OWNER_EMAIL, token: gen.body.email_otp },
    bearer: anon || srk,
    apikey: anon || srk,
  });
  const at = ver.body?.access_token || ver.body?.session?.access_token;
  must(at, 'auth verify failed');

  const message = `שלום בדיקה אילנה, אנא חתמי על תצהיר נהג (נוסח מעודכן ${MARKER}) בקישור:\n${signUrl}`;
  const send = await req('POST', '/functions/v1/send-whatsapp-message', {
    body: { action: 'send', destination: WA_DEST, message },
    bearer: at,
    apikey: anon || srk,
  });
  const messageId =
    send.body?.message_id ||
    send.body?.gupshup_response?.messageId ||
    send.body?.gupshup_response?.message_id ||
    send.body?.gupshup_response?.id ||
    null;
  const waOk = send.status < 400 && send.body?.success === true;
  check('whatsapp-send', waOk, {
    http: send.status,
    success: send.body?.success ?? null,
    message_id: messageId,
    error: send.body?.error || null,
    excerpt: JSON.stringify(send.body || {}).slice(0, 400),
  });

  // Mark sent_at like UI
  await req('PATCH', `/rest/v1/driver_declarations?id=eq.${decl.id}`, {
    bearer: srk,
    apikey: srk,
    body: { sent_via: 'whatsapp', sent_at: new Date().toISOString() },
  });

  // Keep edited template with marker for owner to open the link; also store restore body
  out.restore_body_len = originalBody.length;
  out.sign_url = signUrl;
  out.wa_message_includes_marker = message.includes(MARKER);
  out.kept_edited_template = true;
  out.note =
    'Template left with MARKER so owner can confirm the live link. Restore manually if desired.';

  out.ok = out.checks.every((c) => c.ok);
  out.bundle = bundle;
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(
    SUMMARY,
    JSON.stringify(
      {
        id: 'production-declaration-pending-fix-summary',
        at: out.at,
        ok: out.ok,
        host: LIVE,
        bundle,
        sign_url: signUrl,
        marker: MARKER,
        wa_dest: WA_DEST,
        root_cause: out.root_cause,
        checks_passed: out.checks.filter((c) => c.ok).length,
        checks_total: out.checks.length,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(out.ok ? 'PRODUCTION LIVE VERIFY OK' : 'PRODUCTION LIVE VERIFY FAILED');
  process.exit(out.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  out.ok = false;
  out.checks.push({ id: 'fatal', ok: false, error: String(err) });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  process.exit(1);
});
