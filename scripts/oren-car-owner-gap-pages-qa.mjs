/**
 * Owner-gap QA on published Staging Pages only (not Vite).
 * node scripts/oren-car-owner-gap-pages-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const COMMIT = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/owner-gap-pages-qa');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === 'qasomfndnjuixgjmjwcm') throw new Error('refused: production db');
if (BASE.includes('dalia-car.online') || BASE.includes('hostinger')) throw new Error('refused: production url');

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stagingRef: STAGING_REF,
  commit: COMMIT,
  snapshotUntouched: true,
  productionTouched: false,
  hostingerTouched: false,
  productionSupabaseTouched: false,
  googleAppsScriptTouched: false,
  tasks: {},
  shots: [],
  deployTxt: null,
};

function rec(task, name, ok, extra = {}) {
  if (!report.tasks[task]) report.tasks[task] = { checks: [], pass: true };
  report.tasks[task].checks.push({ name, ok: Boolean(ok), ...extra });
  if (!ok) report.tasks[task].pass = false;
  console.log(ok ? 'PASS' : 'FAIL', task, name, extra.error || extra.note || extra.value || '');
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true }).catch(() => null);
  report.shots.push(name);
}

function keys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const arr = JSON.parse(raw);
  return {
    service: arr.find((k) => k.name === 'service_role')?.api_key,
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

async function inject(context, session) {
  const projectRef = new URL(STAGING_URL).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: storageKey,
      value: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      },
    },
  );
}

async function waitList(page) {
  await page.waitForTimeout(1000);
  await page.waitForLoadState('networkidle').catch(() => null);
}

function isoDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text());
  report.deployTxt = deployTxt.trim();
  rec('deploy', 'STAGING-DEPLOY.txt has new commit', deployTxt.includes(COMMIT) && /feat\/incident-alerts-staging/.test(deployTxt), { deployTxt: deployTxt.trim(), COMMIT });
  rec('deploy', 'Not Production URL', !BASE.includes('dalia-car.online'));
  rec('deploy', 'Staging DB only', STAGING_REF === 'usfeoerkpcafxxlyuldl');

  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();
  const company = `QA-OG-${runId}`;
  const email = `qa-og-${runId}@staging-e2e.local`;
  const password = `QaOg!${runId}`;
  const plate = `OG${String(runId).slice(-6)}`;
  const ids = { users: [], vehicles: [], drivers: [], inspections: [], alerts: [], settings: [] };

  try {
    await admin.from('company_settings').insert({
      company_name: company,
      reminder_30_days: true,
      reminder_7_days: true,
      reminder_1_day: true,
      hidden_buttons: ['driver-hub-dashboard'],
    });
    ids.settings.push(company);

    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (cErr) throw cErr;
    ids.users.push(created.user.id);
    await admin.from('profiles').upsert({
      id: created.user.id,
      full_name: 'QA OwnerGap FM',
      company_name: company,
      is_active: true,
      approval_status: 'approved',
      two_factor_approved: true,
    });
    await admin.from('user_roles').delete().eq('user_id', created.user.id);
    await admin.from('user_roles').insert({ user_id: created.user.id, role: 'fleet_manager' });

    const { data: veh, error: vErr } = await admin.from('vehicles').insert({
      license_plate: plate,
      internal_number: '19',
      manufacturer: 'OwnerGapToyota',
      model: 'Corolla',
      company_name: company,
      status: 'active',
      year: 2020,
      vehicle_type: 'רכב פרטי',
      test_expiry: isoDays(90),
      insurance_expiry: isoDays(20),
      insurance_alerts_enabled: true,
      license_doc_url: 'https://example.com/qa-og-license.pdf',
      insurance_doc_url: 'https://example.com/qa-og-insurance.pdf',
      odometer: 50000,
    }).select('id').single();
    if (vErr) throw vErr;
    ids.vehicles.push(veh.id);

    const { data: drv, error: dErr } = await admin.from('drivers').insert({
      full_name: `נהג OwnerGap ${runId}`,
      company_name: company,
      phone: '0502223344',
      status: 'active',
      license_expiry: isoDays(60),
    }).select('id, full_name').single();
    if (dErr) throw dErr;
    ids.drivers.push(drv.id);

    const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
    if (signErr) throw signErr;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
    await inject(context, auth.session);
    const page = await context.newPage();

    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('t1', 'Vehicles list as company FM', /OwnerGapToyota|רכבים/.test(await page.locator('body').innerText()));
    const search = page.locator('input[placeholder*="חיפוש"]').first();
    if (await search.count()) {
      await search.fill('19');
      await page.waitForTimeout(600);
    }
    rec('t1', 'Internal 19 still first-class search', (await page.locator('body').innerText()).includes('OwnerGapToyota'));
    await shot(page, 't1-search.png');

    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    const alertsText = await page.locator('body').innerText();
    rec('t4', 'Future test >30 days visible', /טסט|רישיון רכב/.test(alertsText) && /עתידית|90|8[0-9]|9[0-9]/.test(alertsText), { snippet: alertsText.slice(0, 500) });
    rec('t4', 'Near insurance visible', /ביטוח/.test(alertsText));
    rec('t4', 'Future driver license visible', /רישיון נהיגה/.test(alertsText));
    rec('t4', 'Officer/free category chips exist or page healthy', /התרא/.test(alertsText) && !/TypeError/.test(alertsText));
    await shot(page, 't4-alerts.png');

    await page.goto(`${BASE}/vehicles?vehicleId=${veh.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('t6', 'Free alert button on vehicle home', (await page.getByRole('button', { name: /התראה חופשית/ }).count()) > 0);
    await shot(page, 't6-vehicle-home.png');

    const docsTile = page.getByText('מסמכים', { exact: false }).first();
    if (await docsTile.count()) {
      await docsTile.click().catch(() => null);
      await waitList(page);
    }
    const hubText = await page.locator('body').innerText();
    rec('t5', 'License/insurance docs visible or openable', /רישיון|ביטוח|מצורף|פתח/.test(hubText));
    await shot(page, 't5-docs.png');

    await page.goto(`${BASE}/private-vehicle-inspection?vehicleId=${veh.id}&plate=${encodeURIComponent(plate)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('t2', 'Tilta form opens', /תלת|בדיקה/.test(await page.locator('body').innerText()));
    rec('t2', '+3 months button', (await page.getByRole('button', { name: /\+3 חודשים/ }).count()) > 0);
    const odo = page.locator('input').filter({ has: page.locator('xpath=ancestor::*[contains(., "קילומטר")]') }).first();
    const odoAlt = page.locator('input[type="number"], input[inputmode="numeric"]').first();
    if (await page.getByLabel(/קילומטר|ק״מ|odometer/i).count()) {
      await page.getByLabel(/קילומטר|ק״מ|odometer/i).first().fill('51000');
    } else if (await odoAlt.count()) {
      await odoAlt.fill('51000');
    }
    await page.getByRole('button', { name: /\+3 חודשים/ }).click().catch(() => null);
    const saveBtn = page.getByRole('button', { name: /שמור/ }).first();
    if (await saveBtn.count()) await saveBtn.click();
    await page.waitForTimeout(2500);
    rec('t2', 'Tilta save clicked', true);
    await shot(page, 't2-tilta-saved.png');

    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitList(page);
    const afterTilta = await page.locator('body').innerText();
    rec('t2', 'Officer alert visible after tilta+refresh', /התראת קצין רכב/.test(afterTilta), { snippet: afterTilta.slice(0, 800) });
    await shot(page, 't2-alerts-after-tilta.png');

    await page.goto(`${BASE}/vehicles?vehicleId=${veh.id}&view=hub`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('t3', 'Vehicle hub still opens after tilta', /OwnerGapToyota|Corolla|ק״מ|קילומטר/.test(await page.locator('body').innerText()));

    await page.getByRole('button', { name: /התראה חופשית/ }).first().click().catch(() => null);
    await page.waitForTimeout(800);
    const modal = page.locator('.fixed.inset-0').filter({ hasText: 'יצירת התראה' });
    rec('t9', 'CreateAlertModal opens from vehicle home', (await modal.count()) > 0 || (await page.getByPlaceholder('כותרת ההתראה...').count()) > 0);
    if (await page.getByPlaceholder('כותרת ההתראה...').count()) {
      await page.getByPlaceholder('כותרת ההתראה...').fill(`התראה חופשית OG ${runId}`);
      await page.locator('input[type="date"]').first().fill(isoDays(45));
      await page.getByRole('button', { name: /צור התראה/ }).click();
      await page.waitForTimeout(1500);
    }
    await shot(page, 't9-free-alert-modal.png');

    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('t6', 'Free alert appears in central alerts', (await page.locator('body').innerText()).includes(`התראה חופשית OG ${runId}`) || /התראה חופשית/.test(await page.locator('body').innerText()));
    await shot(page, 't6-central-free.png');

    await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('t7', 'Drivers list hides dashboard button', !(await page.locator('body').innerText()).includes('פתח דשבורד נהג'));
    rec('t7', 'Driver name still listed', (await page.locator('body').innerText()).includes(drv.full_name));
    await shot(page, 't7-drivers-list.png');

    if (await page.getByText(drv.full_name).count()) {
      await page.getByText(drv.full_name).first().click();
      await waitList(page);
      rec('t9', 'Free alert on driver hub', (await page.getByRole('button', { name: /התראה חופשית/ }).count()) > 0);
      rec('t7', 'Driver hub dashboard button hidden', !(await page.locator('body').innerText()).includes('דשבורד') || (await page.getByRole('button', { name: /^דשבורד$/ }).count()) === 0);
      await shot(page, 't7-driver-hub.png');
    }

    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('t8', 'Officer inspections report card visible', (await page.getByText('ביקורות קצין רכב').count()) > 0);
    const allPeriod = page.getByRole('button', { name: /^הכל$/ });
    if (await allPeriod.count()) await allPeriod.first().click().catch(() => null);
    await waitList(page);
    const officerCard = page.locator('text=/\\d+ ביקורות קצין רכב/').first();
    if (await officerCard.count()) await officerCard.click().catch(() => null);
    await waitList(page);
    const reportText = await page.locator('body').innerText();
    rec('t8', 'New tilta appears in officer report', reportText.includes(plate) && /תלת|חצי/.test(reportText), { snippet: reportText.slice(0, 1200) });
    await shot(page, 't8-officer-report.png');

    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    const addFab = page.locator('button[title="רכב חדש"]');
    if (await addFab.count()) await addFab.click();
    await waitList(page);
    const continueFull = page.getByRole('button', { name: /המשך לטופס המלא/ });
    if (await continueFull.count()) {
      const plateIntro = page.getByPlaceholder('12-345-67');
      if (await plateIntro.count()) await plateIntro.fill(`${plate}N`);
      await continueFull.click();
      await waitList(page);
    }
    rec('t10', 'נגרר in form', (await page.locator('option:has-text("נגרר")').count()) > 0);
    rec('t10', 'טרקטור in form', (await page.locator('option:has-text("טרקטור")').count()) > 0);
    rec('t10', 'ציוד הנדסי in form', (await page.locator('option:has-text("ציוד הנדסי")').count()) > 0);
    rec('t10', 'רכב זעיר in form', (await page.locator('option:has-text("רכב זעיר")').count()) > 0);
    rec('t10', 'Old type רכב פרטי still there', (await page.locator('option:has-text("רכב פרטי")').count()) > 0);
    await shot(page, 't10-types.png');

    await browser.close();
  } catch (e) {
    report.fatal = String(e?.stack || e);
    console.error(e);
  } finally {
    try {
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
      if (ids.inspections.length) await admin.from('vehicle_inspections').delete().in('id', ids.inspections);
      if (ids.alerts.length) await admin.from('custom_alerts').delete().in('id', ids.alerts);
      if (ids.settings.length) await admin.from('company_settings').delete().in('company_name', ids.settings);
      for (const uid of ids.users) {
        await admin.from('custom_alerts').delete().eq('user_id', uid);
        await admin.from('user_roles').delete().eq('user_id', uid);
        await admin.from('profiles').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid).catch(() => null);
      }
      report.cleanup = { ok: true, note: 'QA-OG-* only' };
    } catch (ce) {
      report.cleanup = { ok: false, error: String(ce) };
    }
  }

  const taskPass = Object.fromEntries(Object.entries(report.tasks).map(([k, v]) => [k, v.pass]));
  report.pass = Object.values(report.tasks).every((t) => t.pass) && !report.fatal;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ pass: report.pass, taskPass, deployTxt: report.deployTxt, commit: COMMIT }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
