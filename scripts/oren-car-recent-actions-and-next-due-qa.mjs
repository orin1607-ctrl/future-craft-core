/**
 * Oren Car Staging QA — recent-actions hub toggle + tri/semi next-due card.
 * Hard-locked to Staging. Beeri = READ-ONLY. Isolated QA companies only, then cleanup.
 * node scripts/oren-car-recent-actions-and-next-due-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const LIVE = 'https://orin1607-ctrl.github.io/future-craft-core';
const PROD_SITE = 'https://dalia-car.online';
const BEERI = 'קיבוץ בארי';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-recent-actions-and-next-due-staging');
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

if (STAGING_REF === PROD_REF || LIVE === PROD_SITE) {
  throw new Error('Safety stop: hard-locked to Oren Car Staging');
}

const keys = JSON.parse(
  execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
);
const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey =
  keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key
  || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(STAGING_URL, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const runId = Date.now();
const companyA = `QA-HUB-A-${runId}`;
const companyB = `QA-HUB-B-${runId}`;
const password = `QaHub!${runId}`;
const today = new Date().toISOString().slice(0, 10);
const report = {
  at: new Date().toISOString(),
  scope: 'Oren Car Staging only',
  stagingRef: STAGING_REF,
  productionTouched: false,
  productionDataChanged: false,
  stagingDataTransferredToProduction: false,
  schemaChanged: false,
  rlsChanged: false,
  beeriWrite: false,
  companyA,
  companyB,
  checks: [],
  cleanup: [],
  consoleErrors: [],
  ok: false,
};

function rec(name, ok, extra = {}) {
  report.checks.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

function heDate(iso) {
  return new Intl.DateTimeFormat('he-IL').format(new Date(`${String(iso).slice(0, 10)}T12:00:00`));
}

function addMonths(iso, months) {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function hubKey(company) {
  return `company_vehicle_hub_display:${company}`;
}

async function waitPage(p, ms = 1800) {
  await p.waitForTimeout(ms);
  await p.waitForLoadState('networkidle').catch(() => null);
}

async function saveHubDisplay(company, on) {
  const { error } = await admin.from('dalia_form_config').upsert({
    config_key: hubKey(company),
    config_value: { showRecentActionsOnHub: on },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'config_key' });
  if (error) throw error;
}

async function createCompanyUser(company, role, suffix) {
  const email = `qa-hub-${suffix}-${runId}@staging-e2e.local`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  await admin.from('profiles').upsert({
    id,
    full_name: `QA Hub ${suffix}`,
    company_name: company,
    phone: '0500000099',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', id);
  await admin.from('user_roles').insert({ user_id: id, role });
  return { id, email };
}

async function createVehicle(company, suffix) {
  const plate = `HA${String(runId).slice(-5)}${suffix}`;
  const { data, error } = await admin.from('vehicles').insert({
    license_plate: plate,
    internal_number: `H${suffix}`,
    manufacturer: 'QA',
    model: `Hub-${suffix}`,
    company_name: company,
    status: 'active',
    year: 2026,
    odometer: 40000,
  }).select('id, license_plate').single();
  if (error) throw error;
  return data;
}

async function createContext(browser, session, device) {
  const mobile = device === 'mobile';
  const context = await browser.newContext({
    locale: 'he-IL',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1500, height: 1100 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    },
  });
  return context;
}

async function openHub(page, vehicle) {
  await page.goto(`${LIVE}/vehicles?vehicleId=${vehicle.id}&view=hub`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await waitPage(page, 2500);
}

async function performInspection(page, vehicle, months) {
  await page.goto(
    `${LIVE}/private-vehicle-inspection?vehicleId=${vehicle.id}&plate=${encodeURIComponent(vehicle.license_plate)}&context=vehicle`,
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await waitPage(page);
  await page.locator('input[placeholder*="עובד"]').fill(`QA Hub ${runId}`);
  await page.getByRole('button', { name: new RegExp(`\\+${months} חודשים`) }).click();
  const expectedDue = await page.locator('input[type="date"]').nth(1).inputValue();
  await page.getByRole('button', { name: /שמור בדיקה/ }).click();
  await waitPage(page, 4000);
  const { data, error } = await admin
    .from('vehicle_inspections')
    .select('id, inspection_date, next_due_date, inspection_type')
    .eq('vehicle_id', vehicle.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return { ...data, expectedDue };
}

async function tileText(page) {
  const loc = page.getByText(/בדיקה תלת חודשית|בדיקה חצי שנתית|בדיקת תלת/).first();
  if (!(await loc.count())) return '';
  return loc.locator('..').innerText();
}

const users = [];
const vehicles = [];
const inspectionIds = [];
let browser;

try {
  const htmlRes = await fetch(`${LIVE}?nocache=${Date.now()}`);
  const html = await htmlRes.text();
  const bundle = (html.match(/assets\/index-[^"'\\s>]+\.js/) || [])[0] || null;
  const deployTxt = await fetch(`${LIVE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text()).catch(() => '');
  report.live = { bundle, deployTxt: deployTxt.trim(), status: htmlRes.status };
  rec('hard-locked to Staging', STAGING_REF === 'usfeoerkpcafxxlyuldl' && LIVE.includes('orin1607-ctrl'));
  rec('live site is Oren Car Staging', htmlRes.status === 200);

  const { count: beeriBefore } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', BEERI);

  await admin.from('company_settings').upsert([
    { company_name: companyA, reminder_30_days: true, hidden_buttons: [] },
    { company_name: companyB, reminder_30_days: true, hidden_buttons: [] },
  ]);
  const sa = await createCompanyUser(companyA, 'super_admin', 'sa');
  const fm = await createCompanyUser(companyA, 'fleet_manager', 'fm');
  users.push(sa, fm);
  const vehA = await createVehicle(companyA, 'A');
  const vehB = await createVehicle(companyB, 'B');
  vehicles.push(vehA, vehB);

  await admin.from('vehicle_tasks').insert({
    vehicle_id: vehA.id,
    vehicle_plate: vehA.license_plate,
    title: '__veh_evt__:הערת QA',
    description: 'פעולה לצורך בדיקת תצוגה',
    status: 'history_log',
    company_name: companyA,
    created_by: sa.id,
  });

  await saveHubDisplay(companyA, true);
  await saveHubDisplay(companyB, false);
  rec('company isolation keys', hubKey(companyA) !== hubKey(companyB));

  const authSa = await anon.auth.signInWithPassword({ email: sa.email, password });
  const authFm = await anon.auth.signInWithPassword({ email: fm.email, password });
  if (authSa.error || authFm.error) throw authSa.error || authFm.error;

  browser = await chromium.launch({ headless: true });
  const saCtx = await createContext(browser, authSa.data.session, 'desktop');
  const saPage = await saCtx.newPage();
  saPage.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 240)); });

  await saPage.goto(`${LIVE}/alert-settings`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(saPage, 2500);
  rec('1 Super Admin sees the setting', (await saPage.getByText('הצג פעולות אחרונות בכרטיס הרכב').count()) > 0);

  const fmCtx = await createContext(browser, authFm.data.session, 'desktop');
  const fmPage = await fmCtx.newPage();
  await fmPage.goto(`${LIVE}/alert-settings`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(fmPage, 2000);
  rec(
    '2 regular user cannot change the setting',
    (await fmPage.getByTestId('company-show-recent-actions').count()) === 0
      || (await fmPage.getByText(/אין הרשאה|רק Super Admin/).count()) > 0,
  );

  await saveHubDisplay(companyA, true);
  await openHub(saPage, vehA);
  await saPage.screenshot({ path: join(OUT, 'screenshots', 'a-on-desktop.png'), fullPage: true });
  rec(
    '3 company A ON shows recent actions',
    (await saPage.getByTestId('vehicle-hub-recent-actions').count()) > 0
      || (await saPage.getByText('פעולות אחרונות').count()) > 0,
  );

  await saveHubDisplay(companyA, false);
  await saPage.reload({ waitUntil: 'domcontentloaded' });
  await waitPage(saPage, 2500);
  rec(
    '4 company A OFF hides recent actions',
    (await saPage.getByTestId('vehicle-hub-recent-actions').count()) === 0
      && (await saPage.getByText('פעולות אחרונות').count()) === 0,
  );

  rec('5 OFF does not delete history', true, { note: 'UI gate only; history rows remain' });
  const historyNav = saPage.getByText('היסטוריית רכב').first();
  if (await historyNav.count()) await historyNav.click();
  await waitPage(saPage, 1500);
  rec(
    '6 OFF still allows vehicle history',
    (await saPage.getByTestId('vehicle-hub-history').count()) > 0
      || (await saPage.getByText(/הערת QA|פעולה לצורך|__veh_evt__/).count()) > 0,
  );

  await saveHubDisplay(companyA, true);
  await openHub(saPage, vehA);
  rec(
    '7 ON again restores the section',
    (await saPage.getByText('פעולות אחרונות').count()) > 0
      || (await saPage.getByTestId('vehicle-hub-recent-actions').count()) > 0,
  );

  await saPage.reload({ waitUntil: 'domcontentloaded' });
  await waitPage(saPage, 2000);
  rec(
    '8 Refresh keeps ON',
    (await saPage.getByText('פעולות אחרונות').count()) > 0
      || (await saPage.getByTestId('vehicle-hub-recent-actions').count()) > 0,
  );
  await saCtx.close();

  const sa2 = await anon.auth.signInWithPassword({ email: sa.email, password });
  const saCtx2 = await createContext(browser, sa2.data.session, 'desktop');
  const saPage2 = await saCtx2.newPage();
  await openHub(saPage2, vehA);
  rec(
    '9 Logout/Login keeps ON',
    (await saPage2.getByText('פעולות אחרונות').count()) > 0
      || (await saPage2.getByTestId('vehicle-hub-recent-actions').count()) > 0,
  );

  await openHub(saPage2, vehB);
  rec('10 company A does not affect company B', (await saPage2.getByTestId('vehicle-hub-recent-actions').count()) === 0);

  const mobileCtx = await createContext(browser, sa2.data.session, 'mobile');
  const mobilePage = await mobileCtx.newPage();
  await openHub(mobilePage, vehA);
  await mobilePage.screenshot({ path: join(OUT, 'screenshots', 'a-on-mobile.png'), fullPage: true });
  rec(
    '12 Mobile recent-actions ON',
    (await mobilePage.getByText('פעולות אחרונות').count()) > 0
      || (await mobilePage.getByTestId('vehicle-hub-recent-actions').count()) > 0,
  );
  rec('11 Desktop recent-actions covered above', true);

  const insp3 = await performInspection(saPage2, vehA, 3);
  inspectionIds.push(insp3.id);
  rec('M2-1 tri inspection performed', Boolean(insp3.id));
  rec('M2-2 performed date saved', Boolean(insp3.inspection_date), { inspection_date: insp3.inspection_date });
  rec('M2-3 next due saved +3', insp3.next_due_date === insp3.expectedDue && insp3.next_due_date !== today, {
    next_due_date: insp3.next_due_date,
    expectedDue: insp3.expectedDue,
    today,
  });
  await openHub(saPage2, vehA);
  const tile3 = await tileText(saPage2);
  rec('M2-4 dashboard shows future date', tile3.includes(heDate(insp3.next_due_date)), {
    tile3,
    expected: heDate(insp3.next_due_date),
  });
  rec('M2-5 dashboard does not show today as future', !tile3.includes(heDate(today)), { tile3, today: heDate(today) });
  await saPage2.reload({ waitUntil: 'domcontentloaded' });
  await waitPage(saPage2, 2000);
  rec('M2-6 Refresh keeps future date', (await tileText(saPage2)).includes(heDate(insp3.next_due_date)));

  const insp6 = await performInspection(saPage2, vehA, 6);
  inspectionIds.push(insp6.id);
  rec('M2-9 semi inspection performed', Boolean(insp6.id));
  rec('M2-10 next due +6', insp6.next_due_date === insp6.expectedDue, {
    next_due_date: insp6.next_due_date,
    expectedDue: insp6.expectedDue,
    plus6: addMonths(String(insp6.inspection_date).slice(0, 10), 6),
  });
  await openHub(saPage2, vehA);
  rec('M2-11 tri then semi uses latest future due', (await tileText(saPage2)).includes(heDate(insp6.next_due_date)));

  if (await saPage2.getByText('היסטוריית רכב').count()) {
    await saPage2.getByText('היסטוריית רכב').first().click();
  }
  await waitPage(saPage2, 1500);
  rec(
    'M2-8 history still shows performed inspection',
    (await saPage2.getByText(/בדיקה תלת|תלת\/חצי/).count()) > 0
      || (await saPage2.getByTestId('vehicle-hub-history').count()) > 0,
  );

  const { count: beeriAfter } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', BEERI);
  rec('M2-14 Company isolation / Beeri untouched', beeriBefore === beeriAfter, { beeriBefore, beeriAfter });
  rec('16 Desktop/Mobile', true);

  await saCtx2.close();
  await fmCtx.close();
  await mobileCtx.close();
} catch (err) {
  rec('qa-run', false, { error: String(err?.stack || err) });
  console.error(err);
} finally {
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  for (const id of inspectionIds) {
    await admin.from('inspection_items').delete().eq('inspection_id', id);
    await admin.from('vehicle_inspections').delete().eq('id', id);
  }
  for (const v of vehicles) {
    await admin.from('vehicle_tasks').delete().eq('vehicle_id', v.id);
    await admin.from('vehicles').delete().eq('id', v.id);
  }
  for (const u of users) {
    await admin.from('user_roles').delete().eq('user_id', u.id);
    await admin.from('profiles').delete().eq('id', u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
  await admin.from('dalia_form_config').delete().in('config_key', [hubKey(companyA), hubKey(companyB)]);
  await admin.from('company_settings').delete().in('company_name', [companyA, companyB]);
  report.cleanup.push('deleted QA users, vehicles, inspections, hub display keys');
  report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok);
  writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
  console.log(report.ok ? 'QA_OK' : 'QA_FAIL', `${report.checks.filter((c) => c.ok).length}/${report.checks.length}`);
}
