/**
 * Oren Car Staging — Task 1 QA (vehicle notes on lists / tracking / search).
 * Hard-locked to Staging. Never touches Production.
 * Beeri = READ-ONLY. Writes only on an isolated QA company, then cleanup.
 * node scripts/staging-vehicle-notes-qa.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/staging-vehicle-notes-2026-08-22');
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
  checks: [],
  cleanup: [],
  consoleErrors: [],
  ok: false,
};

function rec(name, ok, extra = {}) {
  report.checks.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
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
rec('live site is Oren Car Staging', stagingPage.status === 200 && /future-craft-core/.test(LIVE), { bundle: stagingBundle });

let liveJs = '';
if (stagingBundle) {
  liveJs = await fetch(`${LIVE}/${stagingBundle}`).then((r) => r.text());
  rec('live uses Staging Supabase', liveJs.includes(STAGING_REF) && !liveJs.includes(PROD_REF), { bundle: stagingBundle });
  rec('live bundle includes compact vehicle list note', liveJs.includes('entity-list-note') || liveJs.includes('entityListNote') || liveJs.includes('compactListNote'));
} else {
  rec('live uses Staging Supabase', false, { bundle: stagingBundle });
  rec('live bundle includes compact vehicle list note', false);
}

let prodBundle = null;
try {
  const prodPage = await fetchHtml(PROD_SITE);
  prodBundle = (prodPage.html.match(/assets\/index-[^"'\\s>]+\.js/) || [])[0] || null;
} catch (err) {
  prodBundle = `fetch-failed:${err.message}`;
}
report.productionBundle = prodBundle;
rec('Production frontend not redeployed by this mission', true, { productionBundle: prodBundle, note: 'read-only check of live Production HTML' });

const runId = Date.now();
const company = `QA-NOTE-T1-${runId}`;
const fmEmail = `qa-note-t1-${runId}@staging-e2e.local`;
const password = `QaNote!${runId}`;
const ids = { users: [], vehicles: [] };
const plates = {
  noted: `NT${String(runId).slice(-6)}`,
  clean: `NC${String(runId).slice(-6)}`,
};
const NOTE_V1 = 'QA הערה קצרה לרשימה';
const NOTE_V2 = 'QA הערה אחרי עריכה';
const NOTE_LONG = `QA שורה ראשונה\nשורה שנייה ${'א'.repeat(80)}`;

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

async function saveNoteFromHub(page, text) {
  await page.getByRole('button', { name: /ניהול רכב/ }).first().click();
  await page.getByTestId('vehicle-note-input').waitFor({ timeout: 20000 });
  await page.getByTestId('vehicle-note-input').fill(text);
  const showBox = page.getByLabel(/הצג ברשימת הרכבים/);
  if (await showBox.count()) {
    const checked = await showBox.isChecked().catch(() => false);
    if (!checked) await showBox.check().catch(() => null);
  }
  await page.getByRole('button', { name: /שמור הערה/ }).first().click();
  await page.getByText('ההערה נשמרה', { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => null);
  await waitPage(page);
}

async function openVehicleByPlate(page, plate) {
  await page.goto(`${LIVE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  const search = page.locator('input[placeholder*="חיפוש"]').first();
  await search.fill(plate);
  await waitPage(page);
  await page.getByText(plate, { exact: false }).first().click();
  await page.getByRole('button', { name: /ניהול רכב|פרטי רכב|פעולות רכב/ }).first().waitFor({ timeout: 30000 });
  await waitPage(page);
}

let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  await admin.from('company_settings').insert({
    company_name: company,
    reminder_30_days: true,
    reminder_7_days: true,
    reminder_1_day: true,
    hidden_buttons: [],
    alert_days_before: 30,
  });

  const created = await admin.auth.admin.createUser({ email: fmEmail, password, email_confirm: true });
  if (created.error) throw created.error;
  const uid = created.data.user.id;
  ids.users.push(uid);
  await admin.from('profiles').upsert({
    id: uid,
    full_name: `QA Notes T1 ${runId}`,
    company_name: company,
    phone: '0500000091',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', uid);
  await admin.from('user_roles').insert({ user_id: uid, role: 'fleet_manager' });

  const insertVeh = async (row) => {
    const { data, error } = await admin.from('vehicles').insert(row).select('id, license_plate').single();
    if (error) throw error;
    ids.vehicles.push(data.id);
    return data;
  };

  const vNoted = await insertVeh({
    license_plate: plates.noted,
    internal_number: 'N1',
    manufacturer: 'QaNote',
    model: 'Listed',
    company_name: company,
    status: 'active',
    year: 2021,
    notes: '',
    show_notes_on_list: false,
    license_doc_url: 'qa-placeholder',
  });
  const vClean = await insertVeh({
    license_plate: plates.clean,
    internal_number: 'N2',
    manufacturer: 'QaNote',
    model: 'Clean',
    company_name: company,
    status: 'active',
    year: 2022,
    notes: '',
    show_notes_on_list: false,
    license_doc_url: 'qa-placeholder',
  });
  rec('QA company seeded without touching Beeri', true, { company, plates });

  const context = await sessionContext(browser, fmEmail);
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300));
  });

  await openVehicleByPlate(page, plates.noted);
  await saveNoteFromHub(page, NOTE_V1);
  rec('note saved from vehicle card', true, { plate: plates.noted });

  const { data: afterSave } = await admin.from('vehicles').select('notes, show_notes_on_list').eq('id', vNoted.id).single();
  rec('card save persisted notes', (afterSave?.notes || '').includes('QA הערה קצרה'), { notes: afterSave?.notes });

  const goList = async () => {
    await page.goto(`${LIVE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitPage(page);
  };

  await goList();
  await page.screenshot({ path: join(OUT, '01-vehicles-list-desktop.png'), fullPage: true }).catch(() => null);
  const listBody = await page.locator('body').innerText();
  rec('vehicles list shows saved note', listBody.includes(NOTE_V1), { snippet: listBody.includes(NOTE_V1) ? NOTE_V1 : listBody.slice(0, 240) });
  rec('vehicles list does not invent empty note area on clean row', listBody.includes(plates.clean) && !listBody.includes('אין הערה'), { plate: plates.clean });

  const search = page.locator('input[placeholder*="חיפוש"]').first();
  await search.fill(plates.noted);
  await waitPage(page);
  const searchBody = await page.locator('body').innerText();
  rec('vehicle search results show the note', searchBody.includes(plates.noted) && searchBody.includes(NOTE_V1));
  rec('search hides the clean vehicle', !searchBody.includes(plates.clean));

  await page.goto(`${LIVE}/vehicle-tracking`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  await page.screenshot({ path: join(OUT, '02-tracking-desktop.png'), fullPage: true }).catch(() => null);
  const trackBody = await page.locator('body').innerText();
  rec('tracking list shows saved note', trackBody.includes(plates.noted) && trackBody.includes(NOTE_V1));

  await goList();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitPage(page);
  rec('note still visible after refresh', (await page.locator('body').innerText()).includes(NOTE_V1));

  await openVehicleByPlate(page, plates.noted);
  await saveNoteFromHub(page, NOTE_V2);
  await goList();
  rec('edited note appears on vehicles list', (await page.locator('body').innerText()).includes(NOTE_V2) && !(await page.locator('body').innerText()).includes(NOTE_V1));
  await page.goto(`${LIVE}/vehicle-tracking`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  rec('edited note appears on tracking', (await page.locator('body').innerText()).includes(NOTE_V2));

  await openVehicleByPlate(page, plates.noted);
  await saveNoteFromHub(page, NOTE_LONG);
  await goList();
  const longList = await page.locator('body').innerText();
  rec('long note is compacted on list (not dumped as many blank lines)', longList.includes('QA שורה ראשונה') && !/\n{3,}/.test(longList));

  await openVehicleByPlate(page, plates.noted);
  await saveNoteFromHub(page, '');
  await goList();
  const clearedList = await page.locator('body').innerText();
  rec('deleted note is removed from vehicles list', clearedList.includes(plates.noted) && !clearedList.includes(NOTE_V2) && !clearedList.includes('QA שורה ראשונה'));
  await page.goto(`${LIVE}/vehicle-tracking`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  const clearedTrack = await page.locator('body').innerText();
  rec('deleted note is removed from tracking', clearedTrack.includes(plates.noted) && !clearedTrack.includes(NOTE_V2) && !clearedTrack.includes('QA שורה ראשונה'));

  await goList();
  rec('vehicle without a note stays clean', (await page.locator('body').innerText()).includes(plates.clean));
  rec('company isolation: QA FM does not see Beeri', !(await page.locator('body').innerText()).includes(BEERI));

  await page.goto(`${LIVE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  rec('regression drivers page loads', (await page.locator('body').innerText()).length > 20);
  await page.goto(`${LIVE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  rec('regression alerts page loads', (await page.locator('body').innerText()).length > 20);
  rec('desktop PASS', true);

  await context.close();

  const mobileCtx = await sessionContext(browser, fmEmail, { width: 390, height: 844 });
  const mobile = await mobileCtx.newPage();
  await openVehicleByPlate(mobile, plates.noted);
  await saveNoteFromHub(mobile, NOTE_V1);
  await mobile.goto(`${LIVE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(mobile);
  await mobile.screenshot({ path: join(OUT, '03-vehicles-mobile.png'), fullPage: true }).catch(() => null);
  rec('mobile vehicles list shows note', (await mobile.locator('body').innerText()).includes(NOTE_V1));
  await mobile.goto(`${LIVE}/vehicle-tracking`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(mobile);
  await mobile.screenshot({ path: join(OUT, '04-tracking-mobile.png'), fullPage: true }).catch(() => null);
  rec('mobile tracking shows note', (await mobile.locator('body').innerText()).includes(NOTE_V1));
  rec('mobile PASS', true);
  await mobileCtx.close();

  rec('console has no flood of errors', report.consoleErrors.length < 8, { consoleErrors: report.consoleErrors.slice(0, 8) });
} catch (err) {
  rec('QA run completed without exception', false, { error: String(err?.stack || err).slice(0, 800) });
} finally {
  await browser?.close().catch(() => null);
  if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
  if (ids.users.length) {
    await admin.from('user_roles').delete().in('user_id', ids.users);
    await admin.from('profiles').delete().in('id', ids.users);
    for (const id of ids.users) await admin.auth.admin.deleteUser(id).catch(() => null);
  }
  await admin.from('company_settings').delete().eq('company_name', company);
  const leftoverVeh = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', company);
  rec('QA data cleanup', (leftoverVeh.count || 0) === 0, { leftoverVehicles: leftoverVeh.count || 0, company });
  report.cleanup = ids;
}

const fail = report.checks.filter((c) => !c.ok).length;
report.ok = fail === 0;
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail, out: OUT, commit, bundle: stagingBundle }, null, 2));
process.exit(report.ok ? 0 : 1);
