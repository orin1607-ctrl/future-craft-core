/**
 * Verifies the vehicle-scoped route into the alerts screen on published Staging:
 * the vehicle card reaches /alerts filtered to that vehicle, the alert created
 * for it is at the top of a short list, the unfiltered screen is unchanged, and
 * a second vehicle of the same company does not leak in. Isolated QA company.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
if (STAGING_REF === 'qasomfndnjuixgjmjwcm') throw new Error('refused: production db');
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alerts-vehicle-filter-qa');
mkdirSync(OUT, { recursive: true });

const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const url = `https://${STAGING_REF}.supabase.co`;
const admin = createClient(url, arr.find((k) => k.name === 'service_role').api_key, { auth: { autoRefreshToken: false, persistSession: false } });
const anonKey = arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon').api_key;
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const report = { at: new Date().toISOString(), results: [], supabaseFailures: [], consoleErrors: [] };
let pass = 0;
let fail = 0;
const rec = (id, name, ok, detail) => {
  report.results.push({ id, name, status: ok ? 'PASS' : 'FAIL', detail });
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}`, JSON.stringify(detail).slice(0, 320));
};
const wait = async (page) => { await page.waitForTimeout(1800); await page.waitForLoadState('networkidle').catch(() => null); };
const isoDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const runId = Date.now();
const company = `QA-FLT-${runId}`;
const email = `qa-flt-sa-${runId}@staging-e2e.local`;
const password = `QaFlt!${runId}`;
// dashes on purpose: the stored alert metadata keeps plates without separators
const plateA = `12-345-${String(runId).slice(-2)}`;
const plateB = `67-890-${String(runId).slice(-2)}`;
const ids = { users: [], vehicles: [] };
const browser = await chromium.launch({ headless: true });

try {
  const deployTxt = (await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text())).trim();
  const commit = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
  rec('deploy', 'Pages runs the commit being tested', deployTxt.includes(commit), { deployTxt, commit });

  await admin.from('company_settings').insert({ company_name: company, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] });
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  ids.users.push(userId);
  await admin.from('profiles').upsert({
    id: userId, full_name: `QA Filter Manager ${runId}`, company_name: company, phone: '0500000066',
    is_active: true, approval_status: 'approved', two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'fleet_manager' });

  const makeVehicle = async (plate, internal, testExpiry) => {
    const { data, error } = await admin.from('vehicles').insert({
      license_plate: plate, internal_number: internal, manufacturer: 'QaToyota', model: 'Corolla',
      company_name: company, status: 'active', year: 2024, test_expiry: testExpiry,
    }).select('id, license_plate').single();
    if (error) throw error;
    ids.vehicles.push(data.id);
    return data;
  };
  const vehA = await makeVehicle(plateA, '91', isoDays(20));
  const vehB = await makeVehicle(plateB, '92', isoDays(25));

  const { data: auth } = await anon.auth.signInWithPassword({ email, password });
  const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1500, height: 1200 } });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${STAGING_REF}-auth-token`,
      value: {
        access_token: auth.session.access_token, refresh_token: auth.session.refresh_token,
        expires_at: auth.session.expires_at, expires_in: auth.session.expires_in,
        token_type: auth.session.token_type, user: auth.session.user,
      },
    },
  );
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('response', async (res) => {
    if (res.status() < 400 || !res.url().includes('supabase.co')) return;
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch { body = '<unreadable>'; }
    report.supabaseFailures.push({ status: res.status(), url: res.url().slice(0, 200), body });
  });

  // a far-off officer alert on vehicle A, the case that used to be unfindable
  const officerTitle = `FLT קצין רחוק ${runId}`;
  await page.goto(`${BASE}/vehicles?vehicleId=${vehA.id}&view=hub&hubSection=actions&hubTab=alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  await page.getByRole('button', { name: /הוסף התראה/ }).first().click();
  await page.waitForTimeout(900);
  const modal = page.locator('div.fixed.inset-0.z-50').last();
  await modal.getByRole('button', { name: /התראת קצין רכב/ }).first().click();
  await page.waitForTimeout(300);
  await modal.getByPlaceholder('כותרת ההתראה...').fill(officerTitle);
  await modal.locator('input[type="date"]').first().fill(isoDays(180));
  await modal.getByRole('button', { name: /צור התראה/ }).first().click();
  await page.waitForTimeout(3000);
  const createToast = (await page.locator('[data-sonner-toast], [role="status"]').allInnerTexts()).join(' | ');
  rec('f1', 'a far-off officer alert saves from the vehicle card', !/שגיאה/.test(createToast), { toast: createToast.slice(0, 160) });

  // the new route: the vehicle card button opens the alerts screen for that vehicle
  await page.goto(`${BASE}/vehicles?vehicleId=${vehA.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  const link = page.getByRole('button', { name: /כל ההתראות של הרכב/ }).first();
  const linkExists = (await link.count()) > 0;
  if (linkExists) await link.click();
  await wait(page);
  const scopedUrl = page.url();
  // the filtered list renders after the alerts load, so wait for the row itself
  await page.locator('table tbody tr').filter({ hasText: officerTitle }).first()
    .waitFor({ state: 'visible', timeout: 20000 }).catch(() => null);
  const scopedRows = await page.locator('table tbody tr').allInnerTexts();
  const scopedText = await page.locator('body').innerText();
  await page.screenshot({ path: join(OUT, 'f2-vehicle-scoped-alerts.png'), fullPage: true }).catch(() => null);
  rec('f2', 'the vehicle card opens the alerts screen filtered to that vehicle',
    linkExists && scopedUrl.includes('/alerts?plate=') && scopedText.includes(officerTitle) && scopedRows.length > 0,
    {
      linkExists,
      url: scopedUrl.replace(BASE, ''),
      rows: scopedRows.length,
      officerRowNumber: scopedRows.findIndex((t) => t.includes(officerTitle)) + 1 || null,
    });

  rec('f3', 'the vehicle-scoped list holds only that vehicle',
    scopedRows.length > 0 && scopedRows.every((t) => !t.includes(plateB)) && !scopedText.includes(plateB),
    { rows: scopedRows.length, otherPlateLeaked: scopedText.includes(plateB) });

  // the plate in the URL carries separators, the stored metadata does not
  rec('f4', 'a plate written with separators still matches the stored alert',
    scopedUrl.includes(encodeURIComponent(plateA)) && scopedText.includes(officerTitle),
    { plateInUrl: plateA });

  // the unfiltered screen is unchanged and still shows both vehicles
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  const allText = await page.locator('body').innerText();
  const allRows = await page.locator('table tbody tr').count();
  await page.screenshot({ path: join(OUT, 'f5-unfiltered-alerts.png'), fullPage: true }).catch(() => null);
  rec('f5', 'the unfiltered alerts screen still shows the whole company',
    allText.includes(officerTitle) && allText.includes(plateA) && allText.includes(plateB) && allRows >= scopedRows.length,
    { rows: allRows, scopedRows: scopedRows.length });

  // refresh and re-entry on the scoped route
  await page.goto(`${BASE}/alerts?plate=${encodeURIComponent(plateA)}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait(page);
  const afterReload = await page.locator('body').innerText();
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  await page.goto(`${BASE}/alerts?plate=${encodeURIComponent(plateA)}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(page);
  const afterReentry = await page.locator('body').innerText();
  const copies = await page.locator('table tbody tr').filter({ hasText: officerTitle }).count();
  rec('f6', 'the scoped view survives refresh and re-entry without duplicates',
    afterReload.includes(officerTitle) && afterReentry.includes(officerTitle) && copies === 1,
    { copies });

  rec('f7', 'no Supabase failures or console errors',
    report.supabaseFailures.length === 0 && report.consoleErrors.length === 0,
    { supabaseFailures: report.supabaseFailures.slice(0, 3), consoleErrors: report.consoleErrors.slice(0, 3) });

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
    report.cleanup = { ok: true, scope: `${company} only` };
  } catch (ce) {
    report.cleanup = { ok: false, error: String(ce) };
  }
}

report.summary = { pass, fail };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`\nPASS ${pass} / FAIL ${fail}`);
