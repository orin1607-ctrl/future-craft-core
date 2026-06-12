/**
 * Full QA for FleetOS AI Module 1 (מצב צי) on LIVE GitHub Pages.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'fleetos-module1-qa');
const BAD = 'הרכב לא נמצא';

mkdirSync(OUT, { recursive: true });

function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const p = join(process.cwd(), name);
    if (!p || !existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
    }
  }
  return env;
}

const fileEnv = loadEnv();
const testEmail = process.env.TEST_EMAIL || fileEnv.TEST_EMAIL;
const testPassword = process.env.TEST_PASSWORD || fileEnv.TEST_PASSWORD;

async function getConsoleErrors(page) {
  return page.evaluate(() => window.__qaErrors || []);
}

async function getToasts(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-sonner-toast], ol[data-sonner-toaster] li')]
      .map((n) => n.textContent?.trim() || '')
      .filter(Boolean),
  );
}

async function injectSession(context, session) {
  const storageKey = `sb-${STAGING_REF}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    site: `${BASE}/fleetos-ai`,
    commit_expected: '11da658',
    checks: {},
    consoleErrors: [],
    shots: [],
  };

  const keys = JSON.parse(
    execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
  );
  const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
  const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
  const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anonClient = createClient(STAGING_URL, anon);

  let email = testEmail;
  let password = testPassword;
  let ephemeralUid = null;

  if (!email || !password) {
    const runId = Date.now();
    email = `m1-qa-${runId}@staging-e2e.local`;
    password = `Gp!${runId}`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    ephemeralUid = created.user.id;
    await admin.from('profiles').upsert({
      id: ephemeralUid,
      full_name: 'M1 QA',
      company_name: 'QA',
      is_active: true,
      approval_status: 'approved',
    });
    await admin.from('user_roles').delete().eq('user_id', ephemeralUid);
    await admin.from('user_roles').insert({ user_id: ephemeralUid, role: 'super_admin' });
    await new Promise((r) => setTimeout(r, 800));
    report.auth = 'ephemeral super_admin';
  } else {
    report.auth = 'TEST_EMAIL';
  }

  const { data: auth, error: authErr } = await anonClient.auth.signInWithPassword({ email, password });
  if (authErr || !auth.session) throw new Error(`signIn: ${authErr?.message}`);

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const consoleErrors = [];

  async function runViewport(name, viewport) {
    const context = await browser.newContext({ viewport, locale: 'he-IL' });
    await injectSession(context, auth.session);
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[${name}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => consoleErrors.push(`[${name}] PAGE: ${err.message}`));
    await page.addInitScript(() => {
      window.__qaErrors = [];
      const orig = console.error;
      console.error = (...args) => {
        window.__qaErrors.push(args.map(String).join(' '));
        orig.apply(console, args);
      };
    });

    async function shot(file) {
      const path = join(OUT, file);
      await page.screenshot({ path, fullPage: true });
      report.shots.push(file);
    }

    await page.goto(`${BASE}/fleetos-ai`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(`${name}-01-fleetos.png`);

    const body = await page.locator('body').innerText();
    report.checks[`${name}_title`] = body.includes('מיקום צי חכם');
    report.checks[`${name}_filterBar`] = body.includes('סינון צי');

    // Buttons
    report.checks[`${name}_refreshBtn`] = (await page.getByRole('button', { name: 'רענון' }).count()) > 0;
    report.checks[`${name}_searchBtn`] = (await page.getByRole('button', { name: 'חפש' }).count()) > 0;
    report.checks[`${name}_clearBtn`] = (await page.getByRole('button', { name: 'נקה סינון' }).count()) > 0;
    report.checks[`${name}_dashboardLink`] = (await page.getByRole('link', { name: /דשבורד/i }).count()) > 0;

    // Filter fields labels
    for (const label of ['מספר רישוי', 'מספר פנימי', 'נהג', 'חברה']) {
      report.checks[`${name}_field_${label}`] = body.includes(label);
    }

    const totalMatch = body.match(/מציג (\d+) מתוך (\d+)/);
    const totalCount = totalMatch ? Number(totalMatch[2]) : 0;
    report.checks[`${name}_vehicleCount`] = totalCount;

    // Plate filter
    if (totalCount > 0) {
      const firstPlate = await page.locator('button[data-vehicle-plate]').first().getAttribute('data-vehicle-plate');
      if (firstPlate) {
        const partial = firstPlate.replace(/-/g, '').slice(0, 4);
        await page.getByPlaceholder('12-345-67').fill(partial);
        await page.getByRole('button', { name: 'חפש' }).click();
        await page.waitForTimeout(500);
        const afterPlate = await page.locator('body').innerText();
        const countMatch = afterPlate.match(/מציג (\d+) מתוך (\d+)/);
        const shown = countMatch ? Number(countMatch[1]) : -1;
        report.checks[`${name}_plateFilter`] = shown > 0 && shown <= totalCount;
        await page.getByRole('button', { name: 'נקה סינון' }).click();
        await page.waitForTimeout(400);
      }
    }

    // Driver filter
    const driverInput = page.getByPlaceholder('שם נהג');
    if ((await driverInput.count()) && totalCount > 0) {
      await driverInput.fill('zzz-no-driver-xyz');
      await page.getByRole('button', { name: 'חפש' }).click();
      await page.waitForTimeout(500);
      const dBody = await page.locator('body').innerText();
      report.checks[`${name}_driverFilter`] = dBody.includes('מציג 0 מתוך') || dBody.includes('אין רכבים');
      await page.getByRole('button', { name: 'נקה סינון' }).click();
      await page.waitForTimeout(400);
    }

    // Internal filter (expand mobile extra filters if collapsed)
    const mobileExtra = page.getByRole('button', { name: /סינון נוסף|סינון מתקדם/i });
    if (await mobileExtra.count()) {
      const txt = await mobileExtra.textContent();
      if (txt?.includes('סינון') && name === 'mobile') await mobileExtra.click();
    }
    const internalInput = page.getByPlaceholder('D-101');
    if ((await internalInput.count()) && totalCount > 0) {
      await internalInput.fill('zzz-internal-xyz', { force: true });
      await page.getByRole('button', { name: 'חפש' }).click();
      await page.waitForTimeout(500);
      const iBody = await page.locator('body').innerText();
      report.checks[`${name}_internalFilter`] = iBody.includes('מציג 0 מתוך') || iBody.includes('אין רכבים');
      await page.getByRole('button', { name: 'נקה סינון' }).click();
      await page.waitForTimeout(400);
    }

    // Map pins
    const mapPins = page.locator('button[aria-label][aria-pressed]');
    report.checks[`${name}_mapPins`] = (await mapPins.count()) > 0;
    if ((await mapPins.count()) > 0) {
      const pin = mapPins.first();
      await pin.scrollIntoViewIfNeeded();
      await pin.click({ force: true });
      await page.waitForTimeout(400);
      const selectedPlate = await page.locator('button[data-vehicle-plate]').first().getAttribute('data-vehicle-plate');
      report.checks[`${name}_mapSelectUpdatesCard`] = !!selectedPlate;
    }
    await shot(`${name}-02-map-selected.png`);

    // Vehicle list toggle
    await page.getByRole('button', { name: /הצג רשימת רכבים/i }).click();
    await page.waitForTimeout(400);
    report.checks[`${name}_listToggle`] = (await page.getByText('הסתר רשימת רכבים').count()) > 0;
    await shot(`${name}-03-list-open.png`);

    // Hub open + back
    const hubBtn = page.locator('button[data-vehicle-id][data-vehicle-plate]').first();
    if ((await hubBtn.count()) > 0) {
      const vehicleId = await hubBtn.getAttribute('data-vehicle-id');
      const plate = await hubBtn.getAttribute('data-vehicle-plate');
      await hubBtn.click();
      await page.waitForURL(/vehicleId=/, { timeout: 30000 });
      await page.waitForTimeout(1500);
      await shot(`${name}-04-hub.png`);

      const hubBody = await page.locator('body').innerText();
      report.checks[`${name}_hubPlateMatch`] = hubBody.includes(plate?.replace(/-/g, '') || '___') || hubBody.includes(plate || '___');
      report.checks[`${name}_hubOpens`] = page.url().includes(vehicleId);

      const toasts = await getToasts(page);
      report.checks[`${name}_noBadToast`] = !toasts.some((t) => t.includes(BAD));

      const backBtn = page.getByRole('button', { name: /חזרה ל-FleetOS AI/i });
      if (await backBtn.count()) {
        await backBtn.click();
        await page.waitForURL(/fleetos-ai/, { timeout: 30000 });
        await page.waitForTimeout(800);
        report.checks[`${name}_backToFleetOS`] = page.url().includes('fleetos-ai');
        await shot(`${name}-05-back-fleetos.png`);
      } else {
        report.checks[`${name}_backToFleetOS`] = false;
      }
    } else {
      report.checks[`${name}_hubOpens`] = false;
      report.checks[`${name}_noVehicles`] = true;
    }

    // Bottom nav tabs (should show toast for unbuilt)
    const fuelTab = page.getByRole('button', { name: 'דלק וטעינה' });
    if (await fuelTab.count()) {
      await fuelTab.click();
      await page.waitForTimeout(600);
      const toasts = await getToasts(page);
      report.checks[`${name}_fuelTabToast`] = toasts.some((t) => t.includes('בבנייה'));
    }

    report.consoleErrors.push(...(await getConsoleErrors(page)));
    await context.close();
  }

  await runViewport('desktop', { width: 1280, height: 900 });
  await runViewport('mobile', { width: 390, height: 844 });

  report.consoleErrors = [...consoleErrors, ...report.consoleErrors];
  report.checks.noConsoleErrors = report.consoleErrors.length === 0;

  const passKeys = Object.entries(report.checks).filter(([k]) => !k.includes('vehicleCount') && !k.includes('noVehicles'));
  report.checks.allPass = passKeys.every(([, v]) => v === true);

  if (ephemeralUid) await admin.auth.admin.deleteUser(ephemeralUid);

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.checks.allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
