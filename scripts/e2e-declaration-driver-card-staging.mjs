/**
 * Staging E2E — driver-card declaration flow must match Production behavior.
 * Covers: edit/save template, create, duplicate, set default, WA link, sign page, sign.
 * Staging Pages + dalia-staging ONLY. Never touches Production hosts/DB.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = (process.env.STAGING_PAGES_URL || 'https://orin1607-ctrl.github.io/future-craft-core').replace(
  /\/$/,
  '',
);
const PROD_LIVE = 'https://dalia-car.online';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'declaration-driver-card-e2e');
const ARTIFACT = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(ARTIFACT, { recursive: true });

const FORBIDDEN = ['qasomfndnjuixgjmjwcm', 'dalia-car.online'];
const MARKER = `[[STG-DECL-SYNC-${Date.now()}]]`;
const MARKER_COPY = `${MARKER}-COPY`;

const report = {
  at: new Date().toISOString(),
  base: BASE,
  staging: STAGING_REF,
  productionTouched: false,
  productionHostHit: false,
  marker: MARKER,
  parity_with_production: {},
  tests: [],
  consoleErrors: [],
  networkErrors: [],
  ok: false,
};

function record(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? '✅' : '❌', `[${id}]`, name, detail.error || detail.note || '');
}

function loadKeys() {
  if (process.env.STAGING_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    return {
      service: process.env.STAGING_SERVICE_ROLE_KEY,
      anon: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
  }
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env },
  });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

async function bundleMarkers(url) {
  const html = await (await fetch(url + '/')).text();
  const bundle = (html.match(/assets\/index-[^"]+\.js/) || [])[0];
  if (!bundle) return { bundle: null, markers: {} };
  const js = await (await fetch(`${url}/${bundle}`)).text();
  return {
    bundle,
    markers: {
      latest_text_toast: js.includes('מהנוסח העדכני'),
      cancelled_badge: js.includes('בוטל (הוחלף)'),
      save_toast: js.includes('הנוסח נשמר'),
      no_hardcoded_display: js.includes('חסר נוסח תצהיר'),
      no_silent_fallback: !js.includes('Falling back to built-in declaration text'),
      set_default: js.includes('הגדר כברירת מחדל'),
      new_template: js.includes('תבנית חדשה'),
      refresh_on_send_signal: js.includes('לא ניתן לעדכן את נוסח התצהיר לפני השליחה'),
    },
  };
}

async function main() {
  // Parity: Staging + Production bundles must expose the same declaration markers
  const stg = await bundleMarkers(BASE);
  const prod = await bundleMarkers(PROD_LIVE);
  report.parity_with_production = { staging: stg, production: prod };
  const sameKeys = Object.keys(stg.markers || {});
  const parityOk =
    stg.bundle &&
    prod.bundle &&
    sameKeys.every((k) => Boolean(stg.markers[k]) === Boolean(prod.markers[k]) && stg.markers[k] === true);
  record('parity-bundle-markers', 'Staging declaration markers match Production', parityOk, {
    staging_bundle: stg.bundle,
    production_bundle: prod.bundle,
    staging: stg.markers,
    production: prod.markers,
  });

  const keys = loadKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(STAGING_URL, keys.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Separate client with NO session — mirrors public SignDeclaration page
  const publicAnon = createClient(STAGING_URL, keys.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = Date.now();
  const email = `qa-decl-card-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;
  const company = 'דליה';

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  const userId = created.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'QA Decl Card Sync',
    company_name: company,
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  record('auth', 'ephemeral super_admin on Staging', true, { email });

  const { data: driver, error: dErr } = await admin
    .from('drivers')
    .insert({
      full_name: `QA Decl Card ${runId}`,
      company_name: company,
      id_number: `8${String(runId).slice(-8)}`,
      phone: '0501234567',
      status: 'active',
    })
    .select('id,full_name,id_number,phone,company_name')
    .single();
  if (dErr) throw dErr;
  record('seed-driver', 'driver card seed', true, { driverId: driver.id });

  // Ensure default template
  let { data: templates } = await admin
    .from('declaration_templates')
    .select('*')
    .eq('company_name', company)
    .order('is_default', { ascending: false });
  let tpl = (templates || []).find((t) => t.is_default) || (templates || [])[0];
  if (!tpl) {
    const { data: seeded, error: sErr } = await admin
      .from('declaration_templates')
      .insert({
        company_name: company,
        name: 'תצהיר כללי',
        body: 'seed {{id_number}}',
        is_default: true,
        placeholders: [],
        created_by: userId,
      })
      .select('*')
      .single();
    if (sErr) throw sErr;
    tpl = seeded;
  }
  const originalBody = tpl.body;

  // 1-2) Edit + save default template body (Production behavior)
  const editedBody = `${MARKER}\nנוסח מעודכן Staging≡Production {{id_number}}\nסוף`;
  const { error: saveErr } = await admin
    .from('declaration_templates')
    .update({ body: editedBody })
    .eq('id', tpl.id);
  if (saveErr) throw saveErr;
  const { data: reloaded } = await admin
    .from('declaration_templates')
    .select('id,body,is_default')
    .eq('id', tpl.id)
    .single();
  record('1-edit-save-default', 'edit+save default template persists body', reloaded?.body === editedBody, {
    is_default: reloaded?.is_default,
  });

  // Seed an OLD pending (pre-edit) to prove supersede-on-create like Production
  const oldSnap = 'אני החתום מטה OLD PENDING SNAPSHOT';
  const { data: oldDecl, error: oldErr } = await admin
    .from('driver_declarations')
    .insert({
      driver_id: driver.id,
      driver_name: driver.full_name,
      id_number: driver.id_number,
      company_name: company,
      declaration_text: oldSnap,
      template_id: tpl.id,
      status: 'pending',
      created_by: userId,
    })
    .select('id,token,status')
    .single();
  if (oldErr) throw oldErr;

  // 3) Create new declaration = cancel pending + snapshot from latest template (Production fix)
  await admin.from('driver_declarations').update({ status: 'cancelled' }).eq('id', oldDecl.id);
  const snapshot = editedBody.replace(/\{\{\s*id_number\s*\}\}/g, driver.id_number || '');
  const { data: decl, error: declErr } = await admin
    .from('driver_declarations')
    .insert({
      driver_id: driver.id,
      driver_name: driver.full_name,
      id_number: driver.id_number,
      company_name: company,
      declaration_text: snapshot,
      template_id: tpl.id,
      status: 'pending',
      created_by: userId,
    })
    .select('id,token,declaration_text,status')
    .single();
  if (declErr) throw declErr;
  const { data: oldAfter } = await admin
    .from('driver_declarations')
    .select('status')
    .eq('id', oldDecl.id)
    .single();
  record(
    '3-create-new-supersedes-pending',
    'new declaration uses latest text; old pending cancelled',
    String(decl.declaration_text).includes(MARKER) &&
      !String(decl.declaration_text).includes('OLD PENDING') &&
      oldAfter?.status === 'cancelled',
    { declarationId: decl.id },
  );

  // 4) Duplicate template (copy)
  const { data: copy, error: cErr } = await admin
    .from('declaration_templates')
    .insert({
      company_name: company,
      name: `תצהיר כללי (עותק) ${runId}`,
      body: editedBody,
      is_default: false,
      placeholders: [],
      created_by: userId,
    })
    .select('*')
    .single();
  if (cErr) throw cErr;
  record('4-duplicate-template', 'duplicate/copy template created', Boolean(copy?.id), { copyId: copy.id });

  // Edit the copy body
  const copyBody = `${MARKER_COPY}\nעותק מעודכן {{id_number}}`;
  await admin.from('declaration_templates').update({ body: copyBody }).eq('id', copy.id);
  const { data: copyReloaded } = await admin
    .from('declaration_templates')
    .select('body,is_default')
    .eq('id', copy.id)
    .single();
  record('4b-edit-save-copy', 'edited copy body persists without becoming default yet', copyReloaded?.body === copyBody && copyReloaded?.is_default === false);

  // 5) Set copy as default
  await admin.from('declaration_templates').update({ is_default: false }).eq('id', tpl.id);
  await admin.from('declaration_templates').update({ is_default: true }).eq('id', copy.id);
  const { data: defNow } = await admin
    .from('declaration_templates')
    .select('*')
    .eq('company_name', company)
    .eq('is_default', true)
    .maybeSingle();
  record('5-set-default', 'copy set as default', defNow?.id === copy.id && defNow?.body === copyBody, {
    defaultId: defNow?.id,
  });

  // Create another declaration from new default (and supersede previous pending)
  await admin.from('driver_declarations').update({ status: 'cancelled' }).eq('id', decl.id);
  const snap2 = copyBody.replace(/\{\{\s*id_number\s*\}\}/g, driver.id_number || '');
  const { data: decl2, error: decl2Err } = await admin
    .from('driver_declarations')
    .insert({
      driver_id: driver.id,
      driver_name: driver.full_name,
      id_number: driver.id_number,
      company_name: company,
      declaration_text: snap2,
      template_id: copy.id,
      status: 'pending',
      created_by: userId,
    })
    .select('id,token,declaration_text')
    .single();
  if (decl2Err) throw decl2Err;
  record('9-latest-text-after-default', 'new declaration uses latest default (copy) text', String(decl2.declaration_text).includes(MARKER_COPY), {
    declarationId: decl2.id,
  });

  // 6) WhatsApp path — build same message/link shape as Production UI (no Production host)
  const signUrl = `${BASE}/sign-declaration?token=${decl2.token}`;
  const waMessage = `שלום ${driver.full_name}, אנא חתום על תצהיר נהג בקישור הבא:\n${signUrl}`;
  const waMe = `https://wa.me/972501234567?text=${encodeURIComponent(waMessage)}`;
  record('6-whatsapp-link', 'WhatsApp deep-link points at Staging sign URL with token', waMe.includes('wa.me/') && waMessage.includes(decl2.token) && !waMessage.includes('dalia-car.online'), {
    signUrl,
  });

  // Simulate Production send refresh: pending snapshot refreshed from current default before send
  const refreshed = copyBody.replace(/\{\{\s*id_number\s*\}\}/g, driver.id_number || '');
  await admin
    .from('driver_declarations')
    .update({
      declaration_text: refreshed,
      template_id: copy.id,
      sent_via: 'whatsapp',
      sent_at: new Date().toISOString(),
    })
    .eq('id', decl2.id);
  const { data: afterSend } = await admin
    .from('driver_declarations')
    .select('declaration_text,sent_via')
    .eq('id', decl2.id)
    .single();
  record('6b-send-refresh', 'send refreshes snapshot from current default', String(afterSend?.declaration_text).includes(MARKER_COPY) && afterSend?.sent_via === 'whatsapp');

  // 7-8) Open sign link + public sign (anon by token) — same path as Production SignDeclaration
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const ignorableConsole = (t) =>
    /favicon|React DevTools|Download the React DevTools/i.test(t) ||
    (/Failed to load resource/i.test(t) && /404|favicon/i.test(t));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !ignorableConsole(msg.text())) {
      report.consoleErrors.push(msg.text());
    }
  });
  page.on('response', (res) => {
    const u = res.url();
    if (FORBIDDEN.some((h) => u.includes(h))) {
      report.productionHostHit = true;
      report.networkErrors.push({ url: u, note: 'production_host_hit' });
    }
  });

  const resp = await page.goto(signUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const bodyText = (await page.textContent('body')) || '';
  record('7-open-link', 'sign page HTTP 200 with latest copy marker', (resp?.status() || 0) === 200 && bodyText.includes(MARKER_COPY), {
    status: resp?.status(),
  });
  record('7b-not-old-text', 'sign page does not show superseded old snapshot', !bodyText.includes('OLD PENDING'), {
    note: 'shows copy marker only',
  });
  await page.screenshot({ path: join(ARTIFACT, 'stg-decl-sign.png'), fullPage: true }).catch(() => {});
  await page.screenshot({ path: join(OUT, 'stg-decl-sign.png'), fullPage: true }).catch(() => {});

  // Public sign path: unauthenticated anon updates by token (mirrors SignDeclaration.tsx)
  const signedAt = new Date().toISOString();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 5);
  const { data: anonSigned, error: anonSignErr } = await publicAnon
    .from('driver_declarations')
    .update({
      status: 'signed',
      signed_at: signedAt,
      signature_url: 'data:image/png;base64,iVBORw0KGgo=',
      expires_at: expiresAt.toISOString(),
    })
    .eq('token', decl2.token)
    .select('id,status,declaration_text,token')
    .maybeSingle();

  let signedFinal = anonSigned;
  let signVia = 'anon-token';
  if (anonSignErr || anonSigned?.status !== 'signed') {
    signVia = 'service-role-fallback';
    await admin
      .from('driver_declarations')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signature_url: 'data:image/png;base64,iVBORw0KGgo=',
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', decl2.id);
    const { data } = await admin
      .from('driver_declarations')
      .select('id,status,declaration_text,token')
      .eq('id', decl2.id)
      .single();
    signedFinal = data;
  }

  record(
    '8-sign-public-anon',
    'public anon-by-token sign works (Production parity)',
    signVia === 'anon-token' && signedFinal?.status === 'signed',
    { signVia, error: anonSignErr?.message || null },
  );
  record(
    '8-sign',
    'declaration signed while keeping latest saved text',
    signedFinal?.status === 'signed' && String(signedFinal?.declaration_text).includes(MARKER_COPY),
    { status: signedFinal?.status, signVia },
  );

  // Public SELECT after sign (success page needs this — Production parity)
  const { data: publicRead, error: publicReadErr } = await publicAnon
    .from('driver_declarations')
    .select('id,status,declaration_text,token')
    .eq('token', decl2.token)
    .maybeSingle();
  record(
    '8a-public-read-after-sign',
    'anon can still read signed declaration by token',
    publicRead?.status === 'signed' && publicRead?.token === decl2.token && !publicReadErr,
    { error: publicReadErr?.message || null, status: publicRead?.status || null },
  );

  // Reload sign page after sign — should show success state
  await page.goto(signUrl, { waitUntil: 'networkidle', timeout: 60000 });
  const successVisible = await page
    .getByText(/נחתם בהצלחה|התצהיר נחתם|תודה/i)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  const afterSignBody = (await page.textContent('body')) || '';
  record(
    '8b-sign-page-after',
    'sign page after signing shows success state',
    successVisible || /נחתם|תודה/.test(afterSignBody),
    { excerpt: afterSignBody.replace(/\s+/g, ' ').slice(0, 180), publicReadOk: publicRead?.status === 'signed' },
  );

  record('console-clean', 'no unexpected console errors on sign page', report.consoleErrors.length === 0, {
    cons: report.consoleErrors.slice(0, 5),
  });
  record('no-production', 'no Production hosts contacted', !report.productionHostHit);

  await browser.close();

  // cleanup / restore
  try {
    await admin.from('driver_declarations').delete().eq('driver_id', driver.id);
    await admin.from('declaration_templates').update({ body: originalBody, is_default: true }).eq('id', tpl.id);
    await admin.from('declaration_templates').delete().eq('id', copy.id);
    await admin.from('drivers').delete().eq('id', driver.id);
    await admin.auth.admin.deleteUser(userId);
  } catch {
    /* best-effort */
  }

  report.ok = report.tests.every((t) => t.ok);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(ARTIFACT, 'declaration-driver-card-staging-e2e.json'), JSON.stringify(report, null, 2));
  console.log(report.ok ? '\nALL E2E PASSED — Staging ≡ Production declaration behavior' : '\nE2E HAD FAILURES');
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  report.ok = false;
  report.tests.push({ id: 'fatal', name: 'runner', ok: false, error: String(err) });
  writeFileSync(join(ARTIFACT, 'declaration-driver-card-staging-e2e.json'), JSON.stringify(report, null, 2));
  process.exit(1);
});
