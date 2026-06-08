/**
 * Visual proof screenshots — dalia-staging UI (local build + .env.local).
 * Live DB flow: set TEST_EMAIL + TEST_PASSWORD.
 *
 * Usage:
 *   npm run dev
 *   node scripts/capture-staging-visual-proof.mjs [port]
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = process.argv[2] || process.env.DEV_PORT || '8080';
const BASE = `http://localhost:${PORT}`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'staging-visual-proof');
const STAGING_HOST = 'usfeoerkpcafxxlyuldl.supabase.co';

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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
  project: 'dalia-staging',
  projectId: 'usfeoerkpcafxxlyuldl',
  base: BASE,
  mode: 'preview-ui',
  stagingEnv: isStaging,
  shots: [],
  note: '',
};

async function shot(page, name, opts = {}) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: opts.fullPage !== false });
  report.shots.push(name);
  console.log('OK', path);
}

async function openHubDetails(page) {
  await page.goto(`${BASE}/dev/vehicle-card`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'פרטי רכב' }).click();
  await page.waitForTimeout(600);
}

async function injectSession(context, session) {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
}

async function capturePreview(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/dev/vehicle-form-live`, { waitUntil: 'networkidle', timeout: 90000 });
  await shot(page, '01-new-vehicle-opening.png', { fullPage: false });

  await page.goto(`${BASE}/dev/vehicle-form-live/edit`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.evaluate(() => document.querySelectorAll('.d-sec').forEach((el) => el.classList.add('open')));
  await page.waitForTimeout(400);
  await shot(page, '02-edit-vehicle-dalia-form.png');

  await page.goto(`${BASE}/dev/vehicle-card`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(500);
  await shot(page, '03-vehicle-hub-home.png', { fullPage: false });

  await openHubDetails(page);
  await shot(page, '04-vehicle-dalia-full-panel-all-sections.png');

  await page.goto(`${BASE}/dev/faults-scoped`, { waitUntil: 'networkidle', timeout: 90000 });
  await shot(page, '05-faults-scoped-from-vehicle.png', { fullPage: false });

  await page.goto(`${BASE}/dev/documents-scoped`, { waitUntil: 'networkidle', timeout: 90000 });
  await shot(page, '06-documents-scoped-from-vehicle.png', { fullPage: false });

  await page.goto(`${BASE}/dev/faults-scoped`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /חזרה לכרטיס הרכב/ }).click();
  await page.waitForURL('**/dev/vehicle-card**', { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(page, '07-back-to-vehicle-card.png', { fullPage: false });

  await page.goto(`${BASE}/dev/staging-proof-flow`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(500);
  await shot(page, '08-save-reload-edit-hub-flow.png');

  await page.close();
}

async function captureLiveStaging(browser) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !data.session) throw new Error(error?.message || 'sign-in failed');

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
  const testPlate = `VIS${Date.now().toString().slice(-6)}`;
  const testInternal = `INT-${testPlate}`;

  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('button[title="רכב חדש"]').click();
  await page.waitForSelector('text=הוספת רכב חדש', { timeout: 30000 });
  await shot(page, '01-new-vehicle-opening-LIVE.png', { fullPage: false });

  await page.getByPlaceholder('12-345-67').fill(testPlate);
  await page.getByPlaceholder('מספר פנימי בארגון...').fill(testInternal);
  await page.getByRole('button', { name: 'המשך לטופס המלא →' }).click();
  await page.waitForSelector('.vehicle-new-dalia', { timeout: 30000 });
  await page.getByLabel(/יצרן/i).first().fill('טויוטה');
  await page.locator('input[name="model"]').fill('קורולה');
  await page.locator('input[name="vehicle_color"]').fill('לבן');
  await page.getByRole('button', { name: 'שמור רכב חדש' }).click();
  await page.waitForTimeout(3000);
  await shot(page, '08a-save-LIVE.png', { fullPage: false });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '08b-reload-hub-LIVE.png', { fullPage: false });

  await page.getByRole('button', { name: /עריכה/i }).first().click().catch(() =>
    page.getByRole('button', { name: /עריכת רכב/i }).first().click(),
  );
  await page.waitForSelector('.vehicle-new-dalia', { timeout: 30000 });
  await shot(page, '02-edit-vehicle-LIVE.png');

  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle' });
  await page.getByText(testPlate.replace(/-/g, ''), { exact: false }).first().click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'פרטי רכב' }).click();
  await shot(page, '04-full-panel-LIVE.png');

  const vehicleId = new URL(page.url()).searchParams.get('vehicleId') || '';
  const plateQ = encodeURIComponent(testPlate);
  await page.goto(`${BASE}/faults?plate=${plateQ}&vehicleId=${vehicleId}&context=vehicle`, {
    waitUntil: 'networkidle',
  });
  await shot(page, '05-faults-scoped-LIVE.png', { fullPage: false });

  await page.goto(`${BASE}/documents?plate=${plateQ}&vehicleId=${vehicleId}&context=vehicle`, {
    waitUntil: 'networkidle',
  });
  await shot(page, '06-documents-scoped-LIVE.png', { fullPage: false });

  await page.getByRole('link', { name: /חזרה לכרטיס הרכב/ }).click();
  await page.waitForTimeout(1000);
  await shot(page, '07-back-to-card-LIVE.png', { fullPage: false });

  report.testPlate = testPlate;
  report.mode = 'live-staging-db';
  report.note = 'Live screenshots against dalia-staging with authenticated session.';

  const { data: rows } = await supabase.from('vehicles').select('id').eq('license_plate', testPlate.replace(/[-\s]/g, ''));
  if (rows?.[0]?.id) {
    await supabase.from('vehicles').delete().eq('id', rows[0].id);
    report.cleanup = rows[0].id;
  }

  await context.close();
}

async function main() {
  const browser = await chromium.launch();
  try {
    if (testEmail && testPassword && isStaging) {
      await captureLiveStaging(browser);
    } else {
      await capturePreview(browser);
      report.note =
        'Preview UI (same components as staging). For LIVE dalia-staging DB proof set TEST_EMAIL + TEST_PASSWORD in environment.';
      if (!isStaging) report.envWarning = 'Use .env.local with usfeoerkpcafxxlyuldl for staging.';
    }
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log('\nSaved →', OUT);
    console.log('Report →', join(OUT, 'report.json'));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
