/**
 * Post-deploy smoke on published Staging Pages only.
 * node docs/audit-reports/oren-car-tasks-1-10-staging/qa-task11/pages-smoke.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/qa-task11/pages-smoke');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === 'qasomfndnjuixgjmjwcm') throw new Error('refused: production db');
if (BASE.includes('dalia-car.online') || BASE.includes('hostinger')) throw new Error('refused: production url');

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stagingRef: STAGING_REF,
  commitExpected: '7adc0d3',
  productionTouched: false,
  hostingerTouched: false,
  productionSupabaseTouched: false,
  googleAppsScriptTouched: false,
  checks: [],
  shots: [],
};

function rec(name, ok, extra = {}) {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(ok ? 'PASS' : 'FAIL', name, extra.error || extra.note || extra.value || '');
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
  await page.waitForTimeout(900);
  await page.waitForLoadState('networkidle').catch(() => null);
}

async function main() {
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text());
  rec('STAGING-DEPLOY.txt matches 7adc0d3', /7adc0d3/.test(deployTxt) && /feat\/incident-alerts-staging/.test(deployTxt), { deployTxt: deployTxt.trim() });
  rec('Not Production URL', !BASE.includes('dalia-car.online'));
  rec('Staging DB only', STAGING_REF === 'usfeoerkpcafxxlyuldl');

  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();
  const company = `QA-SMOKE-${runId}`;
  const email = `qa-smoke-${runId}@staging-e2e.local`;
  const password = `QaSmoke!${runId}`;
  const plate = `SMK${String(runId).slice(-5)}`;
  const ids = { users: [], vehicles: [], drivers: [], settings: [] };

  try {
    await admin.from('company_settings').insert({ company_name: company, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] });
    ids.settings.push(company);
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (cErr) throw cErr;
    ids.users.push(created.user.id);
    await admin.from('profiles').upsert({ id: created.user.id, full_name: 'QA Smoke FM', company_name: company, is_active: true, approval_status: 'approved', two_factor_approved: true });
    await admin.from('user_roles').delete().eq('user_id', created.user.id);
    await admin.from('user_roles').insert({ user_id: created.user.id, role: 'fleet_manager' });
    const { data: veh, error: vErr } = await admin.from('vehicles').insert({
      license_plate: plate,
      internal_number: '19',
      manufacturer: 'SmokeToyota',
      model: 'Corolla',
      company_name: company,
      status: 'active',
      year: 2020,
      vehicle_type: 'רכב פרטי',
      notes: 'הערת סמוק',
      show_notes_on_list: true,
    }).select('id').single();
    if (vErr) throw vErr;
    ids.vehicles.push(veh.id);
    const { data: drv, error: dErr } = await admin.from('drivers').insert({
      full_name: `נהג סמוק ${runId}`,
      company_name: company,
      phone: '0501112233',
      status: 'active',
      notes: 'הערת נהג סמוק',
      show_notes_on_list: true,
    }).select('id, full_name').single();
    if (dErr) throw dErr;
    ids.drivers.push(drv.id);
    const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
    if (signErr) throw signErr;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
    await inject(context, auth.session);
    const page = await context.newPage();

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('Site opens', /דליה|רכבים|התחבר|בית/.test(await page.locator('body').innerText()), { url: page.url() });
    await shot(page, '01-home.png');

    rec('Login session works (not login wall)', !/התחברות|סיסמה/.test((await page.locator('body').innerText()).slice(0, 400)) || /רכבים|נהגים|בית/.test(await page.locator('body').innerText()));

    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('Vehicles list opens', /SmokeToyota|רכבים/.test(await page.locator('body').innerText()));
    rec('Vehicle note on list when flag on', (await page.locator('body').innerText()).includes('הערת סמוק'));
    const search = page.locator('input[placeholder*="חיפוש"]').first();
    if (await search.count()) {
      await search.fill('19');
      await page.waitForTimeout(500);
    }
    rec('Internal number search 19', (await page.locator('body').innerText()).includes('SmokeToyota') && (await page.locator('body').innerText()).includes('19'));
    await shot(page, '02-vehicles-search.png');

    await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('Drivers list opens', (await page.locator('body').innerText()).includes(drv.full_name));
    rec('Driver note on list when flag on', (await page.locator('body').innerText()).includes('הערת נהג סמוק'));
    await shot(page, '03-drivers.png');

    await page.goto(`${BASE}/private-vehicle-inspection?vehicleId=${veh.id}&plate=${encodeURIComponent(plate)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('Tilta form +3 months', (await page.getByRole('button', { name: /\+3 חודשים/ }).count()) > 0);
    rec('Tilta form +6 months', (await page.getByRole('button', { name: /\+6 חודשים/ }).count()) > 0);
    await shot(page, '04-tilta.png');

    await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('Alerts page opens', /התרא/.test(await page.locator('body').innerText()) && !/TypeError/.test(await page.locator('body').innerText()));
    await shot(page, '05-alerts.png');

    await page.goto(`${BASE}/documents?vehicleId=${veh.id}&plate=${encodeURIComponent(plate)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('Vehicle documents page opens', /מסמכ|רישיון/.test(await page.locator('body').innerText()));
    await shot(page, '06-docs.png');

    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitList(page);
    rec('Reports page opens', /דוחות|ביקורות קצין רכב/.test(await page.locator('body').innerText()));
    rec('Officer inspections report visible', (await page.getByText('ביקורות קצין רכב').count()) > 0);
    await shot(page, '07-reports.png');

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
    rec('New vehicle types in form', (await page.locator('option:has-text("נגרר")').count()) > 0 && (await page.locator('option:has-text("טרקטור")').count()) > 0 && (await page.locator('option:has-text("ציוד הנדסי")').count()) > 0 && (await page.locator('option:has-text("רכב זעיר")').count()) > 0);
    rec('Old vehicle types still present', (await page.locator('option:has-text("רכב פרטי")').count()) > 0);
    await shot(page, '08-vehicle-types.png');

    await browser.close();
  } catch (e) {
    report.fatal = String(e?.stack || e);
    console.error(e);
  } finally {
    try {
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
      if (ids.settings.length) await admin.from('company_settings').delete().in('company_name', ids.settings);
      for (const uid of ids.users) {
        await admin.from('user_roles').delete().eq('user_id', uid);
        await admin.from('profiles').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid).catch(() => null);
      }
      report.cleanup = { ok: true };
    } catch (ce) {
      report.cleanup = { ok: false, error: String(ce) };
    }
  }

  report.pass = report.checks.every((c) => c.ok) && !report.fatal;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ pass: report.pass, fails: report.checks.filter((c) => !c.ok).map((c) => c.name), deployTxt: report.checks[0] }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
