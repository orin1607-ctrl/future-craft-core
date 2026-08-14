/**
 * Two parts, both on published Staging:
 *  A. read-only — does the per-vehicle alerts view of the reporting company show
 *     the officer alert created from the tri/semi inspection.
 *  B. the required truth test (א–ה) in an isolated QA company, run the way the
 *     owner works: a super admin with the company chosen in the scope picker,
 *     no impersonation. Cleans up after itself.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
if (STAGING_REF === PROD_REF) throw new Error('refused: production db');
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const REAL_COMPANY = 'קיבוץ בארי';
const REAL_PLATE = '79002402';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alerts-owner-mode-qa');
mkdirSync(OUT, { recursive: true });

const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const url = `https://${STAGING_REF}.supabase.co`;
const admin = createClient(url, arr.find((k) => k.name === 'service_role').api_key, { auth: { autoRefreshToken: false, persistSession: false } });
const anonKey = arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon').api_key;
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const report = { at: new Date().toISOString(), base: BASE, results: [], consoleErrors: [], supabaseFailures: [] };
let pass = 0;
let fail = 0;
const rec = (id, name, ok, detail) => {
  report.results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail });
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}`, JSON.stringify(detail).slice(0, 340));
};

const isoDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const wait = async (page) => { await page.waitForTimeout(1800); await page.waitForLoadState('networkidle').catch(() => null); };

async function sessionContext(browser, email, password, viewport = { width: 1500, height: 1200 }) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const context = await browser.newContext({ locale: 'he-IL', viewport });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${STAGING_REF}-auth-token`,
      value: {
        access_token: data.session.access_token, refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at, expires_in: data.session.expires_in,
        token_type: data.session.token_type, user: data.session.user,
      },
    },
  );
  return context;
}

const runId = Date.now();
const company = `QA-OWN-${runId}`;
const saEmail = `qa-own-sa-${runId}@staging-e2e.local`;
const fmEmail = `qa-own-fm-${runId}@staging-e2e.local`;
const password = `QaOwn!${runId}`;
const plateA = `OA${String(runId).slice(-6)}`;
const plateB = `OB${String(runId).slice(-6)}`;
const ids = { users: [], vehicles: [] };
const browser = await chromium.launch({ headless: true });

try {
  const deployTxt = (await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text())).trim();
  const commit = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
  report.deployTxt = deployTxt;
  report.commit = commit;
  rec('deploy', 'Pages runs the commit that is being tested', deployTxt.includes(commit), { deployTxt, commit });

  // ── part A: the reporting company, read-only ──
  const { data: realVehicle } = await admin
    .from('vehicles')
    .select('id, license_plate, next_inspection_date, company_name')
    .eq('company_name', REAL_COMPANY)
    .eq('license_plate', REAL_PLATE)
    .maybeSingle();

  const roCreated = await admin.auth.admin.createUser({
    email: `qa-ro-sa-${runId}@staging-e2e.local`, password, email_confirm: true,
  });
  const roId = roCreated.data.user.id;
  ids.users.push(roId);
  await admin.from('profiles').upsert({
    id: roId, full_name: `QA RO Super ${runId}`, company_name: null,
    is_active: true, approval_status: 'approved', two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', roId);
  await admin.from('user_roles').insert({ user_id: roId, role: 'super_admin' });

  const roContext = await sessionContext(browser, `qa-ro-sa-${runId}@staging-e2e.local`, password);
  const roPage = await roContext.newPage();
  await roPage.goto(`${BASE}/alerts/log?vehicleId=${realVehicle?.id || ''}&plate=${encodeURIComponent(REAL_PLATE)}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(roPage);
  const perVehicleText = await roPage.locator('body').innerText();
  await roPage.screenshot({ path: join(OUT, 'a1-per-vehicle-view.png'), fullPage: true }).catch(() => null);
  rec('a1', 'per-vehicle alerts view of the reporting company shows its officer alert',
    perVehicleText.includes('התראת קצין רכב') && perVehicleText.includes(REAL_PLATE),
    {
      company: REAL_COMPANY,
      plate: REAL_PLATE,
      vehicleNextInspection: realVehicle?.next_inspection_date ?? null,
      officerTextPresent: perVehicleText.includes('התראת קצין רכב'),
    });
  await roContext.close();

  // ── part B: isolated QA company, owner's working mode ──
  await admin.from('company_settings').insert({ company_name: company, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] });

  const makeUser = async (email, role, companyName, fullName) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    ids.users.push(data.user.id);
    await admin.from('profiles').upsert({
      id: data.user.id, full_name: fullName, company_name: companyName, phone: '0500000077',
      is_active: true, approval_status: 'approved', two_factor_approved: true,
    });
    await admin.from('user_roles').delete().eq('user_id', data.user.id);
    await admin.from('user_roles').insert({ user_id: data.user.id, role });
    return data.user.id;
  };
  const superAdminId = await makeUser(saEmail, 'super_admin', null, `QA Own Super ${runId}`);
  await makeUser(fmEmail, 'fleet_manager', company, `QA Own Manager ${runId}`);

  const makeVehicle = async (plate, internal) => {
    const { data, error } = await admin.from('vehicles').insert({
      license_plate: plate, internal_number: internal, manufacturer: 'QaMazda', model: '3',
      company_name: company, status: 'active', year: 2023,
    }).select('id, license_plate').single();
    if (error) throw error;
    ids.vehicles.push(data.id);
    return data;
  };
  const vehA = await makeVehicle(plateA, '81');
  const vehB = await makeVehicle(plateB, '82');

  const context = await sessionContext(browser, saEmail, password);
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('response', async (res) => {
    if (res.status() < 400 || !res.url().includes('supabase.co')) return;
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch { body = '<unreadable>'; }
    report.supabaseFailures.push({ status: res.status(), url: res.url().slice(0, 200), body });
  });

  const toasts = async () => (await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts()).join(' | ');
  const clearToasts = async () => page.evaluate(() => document.querySelectorAll('[data-sonner-toast]').forEach((e) => e.remove())).catch(() => null);

  // choose the company in the scope picker, exactly like the owner does
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  const picker = page.locator('select').filter({ hasText: company }).first();
  const pickerFound = (await picker.count()) > 0;
  if (pickerFound) await picker.selectOption({ label: company }).catch(() => null);
  await wait(page);
  const screenText = await page.locator('body').innerText();
  rec('b0', 'the alerts screen loads for a super admin whose scope covers the QA company',
    screenText.includes('התראות ועדכונים'),
    { company, nativeScopeSelectFound: pickerFound, scope: pickerFound ? company : 'all companies' });

  const alertsScreen = async (categoryLabel) => {
    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await wait(page);
    if (categoryLabel) {
      const btn = page.getByRole('button', { name: new RegExp(categoryLabel) }).first();
      if (await btn.count()) await btn.click();
      await page.waitForTimeout(1200);
    }
    return page.locator('body').innerText();
  };

  const triSemi = async (vehicle, months) => {
    await clearToasts();
    await page.goto(`${BASE}/private-vehicle-inspection?vehicleId=${vehicle.id}&plate=${encodeURIComponent(vehicle.license_plate)}&context=vehicle`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await wait(page);
    await page.locator('input[placeholder*="עובד"]').first().fill(`QA Own Super ${runId}`);
    await page.getByRole('button', { name: new RegExp(`\\+${months} חודשים`) }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /שמור בדיקה/ }).first().click();
    await page.waitForTimeout(4500);
    return toasts();
  };

  // א. tri/semi +3 → save → refresh → visible
  const t3 = await triSemi(vehA, 3);
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(page);
  const seenA = await alertsScreen('התראת קצין רכב');
  await page.screenshot({ path: join(OUT, 'b1-trisemi-3.png'), fullPage: true }).catch(() => null);
  rec('b1', 'א. tri/semi +3 months → save → refresh → officer alert visible',
    /נוצרה התראת קצין רכב/.test(t3) && !/לא נוצרה/.test(t3) && seenA.includes(`התראת קצין רכב · ${plateA}`),
    { toast: t3.slice(0, 200), visible: seenA.includes(`התראת קצין רכב · ${plateA}`) });

  // ב. tri/semi +6 → save → refresh → visible
  const t6 = await triSemi(vehB, 6);
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(page);
  const seenB = await alertsScreen('התראת קצין רכב');
  await page.screenshot({ path: join(OUT, 'b2-trisemi-6.png'), fullPage: true }).catch(() => null);
  rec('b2', 'ב. tri/semi +6 months → save → refresh → officer alert visible',
    /נוצרה התראת קצין רכב/.test(t6) && !/לא נוצרה/.test(t6) && seenB.includes(`התראת קצין רכב · ${plateB}`),
    { toast: t6.slice(0, 200), visible: seenB.includes(`התראת קצין רכב · ${plateB}`) });

  // ג + ד. manual officer and free alerts from the vehicle card
  const createFromVehicle = async (vehicle, typeLabel, title, dateStr) => {
    await clearToasts();
    await page.goto(`${BASE}/vehicles?vehicleId=${vehicle.id}&view=hub&hubSection=actions&hubTab=alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await wait(page);
    await page.getByRole('button', { name: /הוסף התראה/ }).first().click();
    await page.waitForTimeout(900);
    const modal = page.locator('div.fixed.inset-0.z-50').last();
    await modal.getByRole('button', { name: new RegExp(typeLabel) }).first().click();
    await page.waitForTimeout(300);
    await modal.getByPlaceholder('כותרת ההתראה...').fill(title);
    await modal.locator('input[type="date"]').first().fill(dateStr);
    await modal.getByRole('button', { name: /צור התראה/ }).first().click();
    await page.waitForTimeout(3000);
    return toasts();
  };

  const officerTitle = `OWN קצין ידני ${runId}`;
  const freeTitle = `OWN חופשית ידנית ${runId}`;

  const tOfficer = await createFromVehicle(vehA, 'התראת קצין רכב', officerTitle, isoDays(48));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(page);
  const seenOfficer = await alertsScreen('התראת קצין רכב');
  const { data: officerRow } = await admin.from('custom_alerts')
    .select('alert_type, company_name, alert_date, user_id, is_active')
    .eq('title', `${officerTitle} · ${plateA}`).maybeSingle();
  await page.screenshot({ path: join(OUT, 'b3-manual-officer.png'), fullPage: true }).catch(() => null);
  rec('b3', 'ג. manual officer alert → save → refresh → visible',
    !/שגיאה/.test(tOfficer) && officerRow?.alert_type === 'officer' && officerRow?.company_name === company &&
    officerRow?.user_id === superAdminId && seenOfficer.includes(officerTitle),
    { toast: tOfficer.slice(0, 200), row: officerRow, visible: seenOfficer.includes(officerTitle) });

  const tFree = await createFromVehicle(vehA, 'התראה חופשית', freeTitle, isoDays(40));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(page);
  const seenFree = await alertsScreen('התראה חופשית');
  const { data: freeRow } = await admin.from('custom_alerts')
    .select('alert_type, company_name, alert_date, user_id, is_active')
    .eq('title', `${freeTitle} · ${plateA}`).maybeSingle();
  await page.screenshot({ path: join(OUT, 'b4-manual-free.png'), fullPage: true }).catch(() => null);
  rec('b4', 'ד. manual free alert → save → refresh → visible',
    !/שגיאה/.test(tFree) && freeRow?.alert_type === 'free' && freeRow?.company_name === company &&
    seenFree.includes(freeTitle),
    { toast: tFree.slice(0, 200), row: freeRow, visible: seenFree.includes(freeTitle) });

  // ה. leave the screen and come back
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  const backOfficer = await alertsScreen('התראת קצין רכב');
  const officerRows = await page.locator('tr').filter({ hasText: `התראת קצין רכב · ${plateA}` }).count();
  const backFree = await alertsScreen('התראה חופשית');
  const freeRows = await page.locator('tr').filter({ hasText: freeTitle }).count();
  await page.screenshot({ path: join(OUT, 'b5-after-reentry.png'), fullPage: true }).catch(() => null);
  rec('b5', 'ה. leaving the screen and re-entering keeps every alert, once each',
    backOfficer.includes(`התראת קצין רכב · ${plateA}`) && backOfficer.includes(`התראת קצין רכב · ${plateB}`) &&
    backOfficer.includes(officerTitle) && backFree.includes(freeTitle) && officerRows === 1 && freeRows === 1,
    { officerRowsForPlateA: officerRows, freeRows });

  rec('b6', 'no Supabase failures during the whole flow', report.supabaseFailures.length === 0,
    { supabaseFailures: report.supabaseFailures.slice(0, 4), consoleErrors: report.consoleErrors.slice(0, 4) });

  await context.close();
} catch (e) {
  report.fatal = String(e?.stack || e);
  fail += 1;
  console.error(e);
} finally {
  await browser.close().catch(() => null);
  try {
    await admin.from('custom_alerts').delete().eq('company_name', company);
    await admin.from('vehicle_inspections').delete().eq('company_name', company);
    await admin.from('vehicle_tasks').delete().eq('company_name', company);
    if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
    await admin.from('company_settings').delete().eq('company_name', company);
    for (const uid of ids.users) {
      await admin.from('custom_alerts').delete().eq('user_id', uid);
      await admin.from('user_roles').delete().eq('user_id', uid);
      await admin.from('profiles').delete().eq('id', uid);
      await admin.auth.admin.deleteUser(uid).catch(() => null);
    }
    report.cleanup = { ok: true, scope: `${company} + temporary QA users only` };
  } catch (ce) {
    report.cleanup = { ok: false, error: String(ce) };
  }
}

report.summary = { pass, fail };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`\nPASS ${pass} / FAIL ${fail}`);
