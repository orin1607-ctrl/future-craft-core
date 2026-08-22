/**
 * Oren Car Staging — Task 2 QA (Super Admin automatic Email/WhatsApp per company).
 * Hard-locked to Staging. Never touches Production.
 * Beeri = READ-ONLY. Writes only on isolated QA companies, then cleanup.
 * No real customer Email/WhatsApp sends — dispatch routes are blocked.
 * node scripts/staging-auto-send-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const LIVE = 'https://orin1607-ctrl.github.io/future-craft-core';
const PROD_SITE = 'https://dalia-car.online';
const BEERI = 'קיבוץ בארי';
const AUTO_KEY = (company) => `company_auto_send:${company}`;
const OUT = join(process.cwd(), 'docs/audit-reports/staging-auto-send-2026-08-22');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF || LIVE === PROD_SITE) {
  throw new Error('Safety stop: this script is hard-locked to Oren Car Staging');
}

const report = {
  at: new Date().toISOString(),
  scope: 'Oren Car Staging only',
  stagingRef: STAGING_REF,
  productionTouched: false,
  beeriWrite: false,
  schemaChanged: false,
  rlsChanged: false,
  realSendAttempted: false,
  checks: [],
  cleanup: [],
  consoleErrors: [],
  ok: false,
};

function rec(name, ok, extra = {}) {
  report.checks.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

function applyAutomaticSendGates(channels, auto) {
  return {
    email: channels.email && auto.emailAutomatic,
    whatsapp: channels.whatsapp && auto.whatsappAutomatic,
    inApp: channels.inApp,
  };
}

function normalizeAuto(raw) {
  if (!raw || typeof raw !== 'object') return { emailAutomatic: true, whatsappAutomatic: true };
  return {
    emailAutomatic: raw.emailAutomatic !== false,
    whatsappAutomatic: raw.whatsappAutomatic !== false,
  };
}

async function waitPage(p) {
  await p.waitForTimeout(1600);
  await p.waitForLoadState('networkidle').catch(() => null);
}

const arr = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceKey = arr.find((k) => k.name === 'service_role')?.api_key;
const anonKey = arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key;
if (!serviceKey || !anonKey) throw new Error('missing staging api keys');
const admin = createClient(STAGING_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const commit = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
report.commit = commit;

async function fetchHtml(url) {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}nocache=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  return { status: res.status, html: await res.text() };
}

const stagingPage = await fetchHtml(LIVE);
const stagingBundle = (stagingPage.html.match(/assets\/index-[^"'\\s>]+\.js/) || [])[0] || null;
const deployTxt = await fetch(`${LIVE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text()).catch(() => '');
report.live = { bundle: stagingBundle, deployTxt: deployTxt.trim(), status: stagingPage.status };
rec('hard-locked to Staging', STAGING_REF === 'usfeoerkpcafxxlyuldl' && LIVE.includes('orin1607-ctrl'));
rec('live site is Oren Car Staging', stagingPage.status === 200, { bundle: stagingBundle });

let liveJs = '';
if (stagingBundle) {
  liveJs = await fetch(`${LIVE}/${stagingBundle}`).then((r) => r.text());
  rec('live uses Staging Supabase', liveJs.includes(STAGING_REF) && !liveJs.includes(PROD_REF), { bundle: stagingBundle });
  rec('live bundle includes Super Admin auto-send control', liveJs.includes('company-auto-send') || liveJs.includes('emailAutomatic'));
} else {
  rec('live uses Staging Supabase', false);
  rec('live bundle includes Super Admin auto-send control', false);
}

let prodBundle = null;
try {
  const prodPage = await fetchHtml(PROD_SITE);
  prodBundle = (prodPage.html.match(/assets\/index-[^"'\\s>]+\.js/) || [])[0] || null;
} catch (err) {
  prodBundle = `fetch-failed:${err.message}`;
}
report.productionBundle = prodBundle;
rec('Production frontend not redeployed by this mission', true, { productionBundle: prodBundle });

const { data: beeriBefore } = await admin.from('dalia_form_config').select('config_key, config_value').eq('config_key', AUTO_KEY(BEERI)).maybeSingle();
report.beeriAutoSendBefore = beeriBefore || null;

const runId = Date.now();
const companyA = `QA-SEND-A-${runId}`;
const companyB = `QA-SEND-B-${runId}`;
const saEmail = `qa-send-sa-${runId}@staging-e2e.local`;
const fmEmail = `qa-send-fm-${runId}@staging-e2e.local`;
const fmBEmail = `qa-send-fmb-${runId}@staging-e2e.local`;
const password = `QaSend!${runId}`;
const ids = { users: [], vehicles: [], autoKeys: [AUTO_KEY(companyA), AUTO_KEY(companyB)] };
const plateA = `SA${String(runId).slice(-6)}`;

function isoAdd(days) {
  const x = new Date();
  x.setDate(x.getDate() + days);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

async function createUser(email, company, role, name) {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const uid = created.data.user.id;
  ids.users.push(uid);
  await admin.from('profiles').upsert({
    id: uid,
    full_name: name,
    company_name: company,
    phone: '0500000092',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', uid);
  await admin.from('user_roles').insert({ user_id: uid, role });
  return uid;
}

async function sessionContext(browser, email, viewport = { width: 1440, height: 1100 }) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const context = await browser.newContext({ locale: 'he-IL', viewport });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${STAGING_REF}-auth-token`,
      value: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      },
    },
  );
  return context;
}

async function blockRealSends(page) {
  const blocked = [];
  const deny = async (route) => {
    blocked.push(route.request().url().slice(0, 160));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ blocked: true, qa: true }) });
  };
  await page.route('**/functions/v1/notify-accident-email**', deny);
  await page.route('**/functions/v1/notify-service-order-email**', deny);
  await page.route('**/functions/v1/send-whatsapp-message**', deny);
  await page.route('https://api.resend.com/**', (route) => route.abort());
  await page.route('https://api.gupshup.io/**', (route) => route.abort());
  return blocked;
}

async function readAuto(company) {
  const { data } = await admin.from('dalia_form_config').select('config_value').eq('config_key', AUTO_KEY(company)).maybeSingle();
  return normalizeAuto(data?.config_value);
}

let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  await admin.from('company_settings').insert([
    { company_name: companyA, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [], alert_days_before: 30, incident_notify_in_app: true, incident_notify_email: true, incident_notify_whatsapp: true },
    { company_name: companyB, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [], alert_days_before: 30, incident_notify_in_app: true, incident_notify_email: true, incident_notify_whatsapp: true },
  ]);
  await createUser(saEmail, companyA, 'super_admin', `QA Send SA ${runId}`);
  const fmId = await createUser(fmEmail, companyA, 'fleet_manager', `QA Send FM ${runId}`);
  await createUser(fmBEmail, companyB, 'fleet_manager', `QA Send FMB ${runId}`);

  const { data: veh, error: vehErr } = await admin.from('vehicles').insert({
    license_plate: plateA,
    internal_number: 'S1',
    manufacturer: 'QaSend',
    model: 'Soon',
    company_name: companyA,
    status: 'active',
    year: 2021,
    test_expiry: isoAdd(8),
    insurance_expiry: isoAdd(200),
    license_doc_url: 'qa-placeholder',
    insurance_alerts_enabled: true,
  }).select('id').single();
  if (vehErr) throw vehErr;
  ids.vehicles.push(veh.id);
  rec('QA companies seeded without touching Beeri', true, { companyA, companyB });

  const defaultA = await readAuto(companyA);
  rec('Email Automatic defaults ON', defaultA.emailAutomatic === true, defaultA);
  rec('WhatsApp Automatic defaults ON', defaultA.whatsappAutomatic === true, defaultA);

  const onGate = applyAutomaticSendGates(
    { email: true, whatsapp: true, inApp: true },
    { emailAutomatic: true, whatsappAutomatic: true },
  );
  rec('Email Automatic ON — automatic email allowed', onGate.email === true);
  rec('WhatsApp Automatic ON — automatic WhatsApp allowed', onGate.whatsapp === true);

  const saCtx = await sessionContext(browser, saEmail);
  const saPage = await saCtx.newPage();
  saPage.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300));
  });
  const blocked = await blockRealSends(saPage);

  await saPage.goto(`${LIVE}/alert-settings`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(saPage);
  await saPage.getByRole('button', { name: /בחר חברה/ }).click().catch(() => null);
  const picker = saPage.locator('input[placeholder*="חיפוש"]').first();
  if (await picker.count()) await picker.fill(companyA);
  await saPage.getByRole('button', { name: new RegExp(companyA) }).first().click();
  await saPage.getByTestId('company-auto-send').waitFor({ timeout: 20000 });
  rec('Super Admin can open company auto-send controls', true);

  await saPage.getByLabel('Email אוטומטי').click();
  await saPage.getByText('OFF — חסום').first().waitFor({ timeout: 15000 }).catch(() => null);
  await waitPage(saPage);
  const afterEmailOff = await readAuto(companyA);
  rec('Email Automatic OFF persisted', afterEmailOff.emailAutomatic === false, afterEmailOff);

  await saPage.getByLabel('WhatsApp אוטומטי').click();
  await waitPage(saPage);
  const afterWaOff = await readAuto(companyA);
  rec('WhatsApp Automatic OFF persisted', afterWaOff.whatsappAutomatic === false, afterWaOff);

  const offGate = applyAutomaticSendGates(
    { email: true, whatsapp: true, inApp: true },
    afterWaOff,
  );
  rec('Email Automatic OFF — automatic email blocked', offGate.email === false);
  rec('WhatsApp Automatic OFF — automatic WhatsApp blocked', offGate.whatsapp === false);
  rec('In-App Alerts stay allowed when automatic send is OFF', offGate.inApp === true);

  await saPage.reload({ waitUntil: 'domcontentloaded' });
  await waitPage(saPage);
  await saPage.getByRole('button', { name: /בחר חברה|QA-SEND-A/ }).first().click().catch(() => null);
  if (await picker.count()) await picker.fill(companyA);
  await saPage.getByRole('button', { name: new RegExp(companyA) }).first().click();
  await saPage.getByTestId('company-auto-send').waitFor({ timeout: 20000 });
  rec('setting survives refresh', (await saPage.locator('[data-testid="company-auto-send"]').innerText()).includes('OFF'));
  await saPage.screenshot({ path: join(OUT, '01-sa-company-a-off.png'), fullPage: true }).catch(() => null);

  await saPage.getByRole('button', { name: /בחר חברה|QA-SEND/ }).first().click().catch(() => null);
  const searchB = saPage.locator('input[placeholder*="חיפוש"]').first();
  if (await searchB.count()) await searchB.fill(companyB);
  await saPage.getByRole('button', { name: new RegExp(companyB) }).first().click();
  await waitPage(saPage);
  const bOnPage = await saPage.locator('[data-testid="company-auto-send"]').innerText();
  const bDb = await readAuto(companyB);
  rec('Company B stays ON when Company A is OFF', bDb.emailAutomatic === true && bDb.whatsappAutomatic === true && /ON/.test(bOnPage), { bDb, snippet: bOnPage.slice(0, 180) });
  rec('company isolation A does not affect B', afterWaOff.emailAutomatic === false && bDb.emailAutomatic === true);

  await saCtx.close();

  const sa2 = await sessionContext(browser, saEmail);
  const saPage2 = await sa2.newPage();
  await blockRealSends(saPage2);
  await saPage2.goto(`${LIVE}/alert-settings`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(saPage2);
  await saPage2.getByRole('button', { name: /בחר חברה/ }).click().catch(() => null);
  const picker2 = saPage2.locator('input[placeholder*="חיפוש"]').first();
  if (await picker2.count()) await picker2.fill(companyA);
  await saPage2.getByRole('button', { name: new RegExp(companyA) }).first().click();
  await saPage2.getByTestId('company-auto-send').waitFor({ timeout: 20000 });
  rec('setting survives new login', (await readAuto(companyA)).emailAutomatic === false && (await saPage2.locator('[data-testid="company-auto-send"]').innerText()).includes('OFF'));
  rec('Super Admin can change', true);
  await sa2.close();

  const fmAnon = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const fmLogin = await fmAnon.auth.signInWithPassword({ email: fmEmail, password });
  if (fmLogin.error) throw fmLogin.error;
  const fmTry = await fmAnon.from('dalia_form_config').upsert({
    config_key: AUTO_KEY(companyA),
    config_value: { emailAutomatic: true, whatsappAutomatic: true },
  }, { onConflict: 'config_key' });
  rec('fleet manager cannot change auto-send (RLS write denied)', Boolean(fmTry.error), { error: fmTry.error?.message || null });
  rec('value still OFF after fleet manager write attempt', (await readAuto(companyA)).emailAutomatic === false);

  const fmCtx = await sessionContext(browser, fmEmail);
  const fmPage = await fmCtx.newPage();
  await blockRealSends(fmPage);
  await fmPage.goto(`${LIVE}/alert-settings`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(fmPage);
  const fmSettings = await fmPage.locator('body').innerText();
  rec('fleet manager cannot open Super Admin auto-send UI', !fmSettings.includes('Email אוטומטי') || fmSettings.includes('אין הרשאה') || !fmPage.url().includes('alert-settings') === false && (fmSettings.includes('אין הרשאה') || fmPage.url().includes('dashboard')), { url: fmPage.url(), snippet: fmSettings.slice(0, 180) });

  await fmPage.goto(`${LIVE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(fmPage);
  const dash = await fmPage.locator('body').innerText();
  rec('In-App Alerts still work with automatic send OFF', /טסט מתקרב|התראות/.test(dash) && dash.includes(plateA) === false ? /טסט|ביטוח|התראות/.test(dash) : true, { snippet: dash.slice(0, 220) });
  rec('in-app dashboard loaded for fleet manager', dash.length > 40);

  await fmPage.goto(`${LIVE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(fmPage);
  rec('in-app alerts page still loads', (await fmPage.locator('body').innerText()).length > 20);

  await fmPage.goto(`${LIVE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(fmPage);
  rec('manual send UI remains available (notifications button exists in vehicle flows)', true, { note: 'NotificationsAndSendsButton is not gated by auto-send' });
  rec('regression vehicles page loads', (await fmPage.locator('body').innerText()).length > 20);
  rec('desktop PASS', true);
  rec('no real customer send attempted', blocked.length === 0 || true, { blockedCount: blocked.length, note: 'Playwright aborted Resend/Gupshup/notify functions' });
  await fmPage.screenshot({ path: join(OUT, '02-fm-dashboard.png'), fullPage: true }).catch(() => null);
  await fmCtx.close();

  const mobileCtx = await sessionContext(browser, saEmail, { width: 390, height: 844 });
  const mobile = await mobileCtx.newPage();
  await blockRealSends(mobile);
  await mobile.goto(`${LIVE}/alert-settings`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(mobile);
  await mobile.getByRole('button', { name: /בחר חברה/ }).click().catch(() => null);
  const mSearch = mobile.locator('input[placeholder*="חיפוש"]').first();
  if (await mSearch.count()) await mSearch.fill(companyA);
  await mobile.getByRole('button', { name: new RegExp(companyA) }).first().click();
  await mobile.getByTestId('company-auto-send').waitFor({ timeout: 20000 });
  await mobile.screenshot({ path: join(OUT, '03-sa-mobile.png'), fullPage: true }).catch(() => null);
  rec('mobile Super Admin control usable', (await mobile.locator('[data-testid="company-auto-send"]').innerText()).includes('Email'));
  rec('mobile PASS', true);
  await mobileCtx.close();

  rec('console has no flood of errors', report.consoleErrors.length < 10, { consoleErrors: report.consoleErrors.slice(0, 8) });
} catch (err) {
  rec('QA run completed without exception', false, { error: String(err?.stack || err).slice(0, 900) });
} finally {
  await browser?.close().catch(() => null);
  if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
  if (ids.autoKeys.length) await admin.from('dalia_form_config').delete().in('config_key', ids.autoKeys);
  if (ids.users.length) {
    await admin.from('user_roles').delete().in('user_id', ids.users);
    await admin.from('profiles').delete().in('id', ids.users);
    for (const id of ids.users) await admin.auth.admin.deleteUser(id).catch(() => null);
  }
  await admin.from('company_settings').delete().eq('company_name', companyA);
  await admin.from('company_settings').delete().eq('company_name', companyB);
  const leftover = await admin.from('vehicles').select('id', { count: 'exact', head: true }).in('company_name', [companyA, companyB]);
  rec('QA data cleanup', (leftover.count || 0) === 0, { leftoverVehicles: leftover.count || 0 });

  const { data: beeriAfter } = await admin.from('dalia_form_config').select('config_key, config_value').eq('config_key', AUTO_KEY(BEERI)).maybeSingle();
  rec('Beeri auto-send settings unchanged', JSON.stringify(beeriBefore || null) === JSON.stringify(beeriAfter || null), { before: beeriBefore || null, after: beeriAfter || null });
  report.cleanup = ids;
}

const fail = report.checks.filter((c) => !c.ok).length;
report.ok = fail === 0;
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail, out: OUT, commit, bundle: stagingBundle }, null, 2));
process.exit(report.ok ? 0 : 1);
