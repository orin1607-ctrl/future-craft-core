/**
 * Phase 0 — capture 7 screenshots of new-vehicle flow (local dev).
 * Usage:
 *   npm run dev
 *   node scripts/capture-phase0-flow.mjs
 * With live save + hub (staging login):
 *   set TEST_EMAIL=... & set TEST_PASSWORD=... & node scripts/capture-phase0-flow.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

const PORT = process.env.DEV_PORT || '8080';
const BASE = `http://localhost:${PORT}`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'phase0-flow');
const STAGING_HOST = 'usfeoerkpcafxxlyuldl.supabase.co';
const TEST_PLATE = `P0-${Date.now().toString().slice(-6)}`;
const TEST_INTERNAL = `INT-${TEST_PLATE}`;

mkdirSync(OUT, { recursive: true });

function loadEnv() {
  const env = {};
  for (const name of ['.env.local', '.env']) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[t.slice(0, eq).trim()] = v;
    }
  }
  return env;
}

const fileEnv = loadEnv();
const supabaseUrl = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const testEmail = process.env.TEST_EMAIL;
const testPassword = process.env.TEST_PASSWORD;
const isStaging = supabaseUrl?.includes(STAGING_HOST);

const report = {
  at: new Date().toISOString(),
  base: BASE,
  staging: isStaging,
  testPlate: TEST_PLATE,
  testInternal: TEST_INTERNAL,
  shots: [],
  checklist: {},
  auth: false,
};

async function shot(page, name, opts = {}) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: opts.fullPage ?? false });
  report.shots.push(name);
  console.log('OK', path);
}

async function captureIntroFlow(page) {
  await page.goto(`${BASE}/dev/vehicle-form-live`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('text=הוספת רכב חדש', { timeout: 30000 });
  await shot(page, '01-new-vehicle-opening.png');

  await page.getByPlaceholder('12-345-67').fill(TEST_PLATE);
  await page.getByPlaceholder('מספר פנימי בארגון...').fill(TEST_INTERNAL);
  await shot(page, '02-plate-and-internal-entered.png');

  await page.getByRole('button', { name: 'המשך לטופס המלא →' }).click();
  await page.waitForSelector('.vehicle-new-dalia', { timeout: 30000 });
  await page.waitForTimeout(600);
  await shot(page, '03-after-continue-to-full-form.png');

  await page.waitForSelector('text=פותח רכב', { timeout: 5000 }).catch(() => null);
  await shot(page, '04-full-dalia-form-opened.png', { fullPage: true });
}

async function injectSession(context, session) {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: storageKey, value: session },
  );
}

async function captureAuthenticatedFlow(browser) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !data.session) {
    throw new Error(error?.message || 'sign-in failed');
  }
  report.auth = true;

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await injectSession(context, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  });

  const page = await context.newPage();
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1500);

  const addBtn = page.locator('button[title="רכב חדש"]');
  if (await addBtn.count()) {
    await addBtn.click();
  } else {
    await page.getByRole('button', { name: /רכב חדש|הוספת רכב/i }).first().click();
  }
  await page.waitForSelector('text=הוספת רכב חדש', { timeout: 30000 });
  await shot(page, '01-new-vehicle-opening.png');

  await page.getByPlaceholder('12-345-67').fill(TEST_PLATE);
  await page.getByPlaceholder('מספר פנימי בארגון...').fill(TEST_INTERNAL);
  await shot(page, '02-plate-and-internal-entered.png');

  await page.getByRole('button', { name: 'המשך לטופס המלא →' }).click();
  await page.waitForSelector('.vehicle-new-dalia', { timeout: 30000 });
  await page.waitForTimeout(600);
  await shot(page, '03-after-continue-to-full-form.png');
  await shot(page, '04-full-dalia-form-opened.png', { fullPage: true });

  const saveBtn = page.getByRole('button', { name: 'שמור רכב חדש' });
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();
  await page.waitForSelector('text=הרכב נפתח בכרטיס החדש', { timeout: 120000 }).catch(async () => {
    await page.waitForSelector('text=נשמר בהצלחה', { timeout: 5000 }).catch(() => null);
  });
  await page.waitForTimeout(1200);
  await shot(page, '05-after-save.png');

  await page.waitForSelector('text=חזרה לרשימה', { timeout: 60000 });
  await shot(page, '06-vehicle-card-opened.png');

  const body = await page.textContent('body');
  report.checklist.plateOnCard = body?.includes(TEST_PLATE.replace(/-/g, '')) || body?.includes(TEST_PLATE);
  report.checklist.internalOnCard = body?.includes(TEST_INTERNAL);

  await shot(page, '07-vehicle-hub.png', { fullPage: true });

  await context.close();

  const { data: rows } = await supabase
    .from('vehicles')
    .select('id')
    .eq('license_plate', TEST_PLATE.replace(/[-\s]/g, ''));
  if (rows?.[0]?.id) {
    await supabase.from('vehicles').delete().eq('id', rows[0].id);
    report.cleanup = rows[0].id;
  }
}

async function capturePreviewFallback(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await captureIntroFlow(page);

  const saveBtn = page.getByRole('button', { name: 'שמור רכב חדש' });
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();
  await page.waitForTimeout(800);
  await shot(page, '05-after-save-preview-mode.png');

  await page.goto(`${BASE}/dev/vehicle-card`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(700);
  await shot(page, '06-vehicle-card-preview.png');
  await shot(page, '07-vehicle-hub-preview.png', { fullPage: true });
  report.note =
    'Steps 5–7 are preview/demo — set TEST_EMAIL + TEST_PASSWORD + staging .env for live save proof.';
  await page.close();
}

async function main() {
  const browser = await chromium.launch();

  try {
    if (testEmail && testPassword && isStaging) {
      await captureAuthenticatedFlow(browser);
      report.mode = 'authenticated-staging';
    } else {
      await capturePreviewFallback(browser);
      report.mode = 'dev-preview';
      if (!isStaging) report.envWarning = `Local .env is not dalia-staging (${STAGING_HOST})`;
      if (!testEmail || !testPassword) report.authSkip = 'TEST_EMAIL/TEST_PASSWORD not set';
    }

    const sample = await browser.newPage();
    await sample.goto(`${BASE}/dev/vehicle-form-live`, { waitUntil: 'networkidle', timeout: 60000 });
    const formBg = await sample.evaluate(() => {
      const el = document.querySelector('.vehicle-new-dalia');
      if (!el) return null;
      return getComputedStyle(el).backgroundColor;
    });
    report.checklist.darkFormBackground = formBg && formBg !== 'rgba(0, 0, 0, 0)' && formBg !== 'transparent';
    report.checklist.transitionWorks = report.shots.includes('04-full-dalia-form-opened.png');
    report.checklist.saveWorks = report.mode === 'authenticated-staging';
    report.checklist.hubOpens = report.shots.some((s) => s.includes('06-vehicle'));
    await sample.close();

    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log('\nReport →', join(OUT, 'report.json'));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
