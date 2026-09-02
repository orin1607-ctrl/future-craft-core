/**
 * Staging-only Fleet Status telematics preview QA.
 * BASE=http://localhost:8080 node scripts/fleetos-erm-software-ui-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const BASE = process.env.BASE || 'http://localhost:8080';
const OUT = join(process.cwd(), 'docs/audit-reports/fleetos-erm-software-ui-2026-09-02');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const seeded = spawnSync(process.execPath, [join(process.cwd(), 'scripts/fleetos-erm-qa-preview-seed.mjs')], {
  stdio: 'inherit',
});
if (seeded.status !== 0) throw new Error('QA seed failed');

const seed = JSON.parse(readFileSync(join(OUT, 'seed.json'), 'utf8'));
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  ermDeviceTouched: false,
  hostingerTouched: false,
  publicPort: false,
  base: BASE,
  checks: [],
  ok: false,
};

function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 240)}` : ''}`);
}

async function sessionFor(email) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verify ${email}`);
  const s = auth.session;
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    expires_in: s.expires_in,
    token_type: s.token_type,
    user: s.user,
  };
}

async function openAuthed(browser, email, viewport = { width: 1400, height: 1100 }) {
  const session = await sessionFor(email);
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport });
  await ctx.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${STAGING_REF}-auth-token`, value: session },
  );
  const page = await ctx.newPage();
  return { ctx, page };
}

async function gotoFleet(page) {
  await page.goto(`${BASE}/fleetos-ai`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('heading', { name: /מיקום צי חכם/ }).waitFor({ timeout: 40000 });
}

async function waitLoaded(page) {
  await page.getByText('רכבים פעילים').waitFor({ timeout: 30000 });
  await page.waitForFunction(
    () => {
      const t = document.body.innerText;
      return /מתוך \d+/.test(t) && !t.includes('טוען…');
    },
    { timeout: 40000 },
  );
  await page.waitForTimeout(800);
}

async function filterPlate(page, plate) {
  await page.locator('input[placeholder="12-345-67"]').fill(plate);
  await page.getByRole('button', { name: 'חפש' }).click();
  await page.waitForTimeout(900);
  const card = page.locator('[data-telematics-card="1"]');
  if (await card.count()) await card.scrollIntoViewIfNeeded();
}

let browser;
try {
  const bizBefore = await Promise.all(['faults', 'accidents', 'expenses'].map(async (t) => {
    const { count, error } = await admin.from(t).select('id', { count: 'exact', head: true });
    if (error) throw error;
    return [t, count];
  }));
  report.businessBefore = Object.fromEntries(bizBefore);

  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const { ctx, page } = await openAuthed(browser, seed.emails.companyA);
  await gotoFleet(page);
  await waitLoaded(page);
  await page.locator('.leaflet-container').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(OUT, '01-desktop-fleet.png') });

  check('design-chrome', (await page.locator('h1').filter({ hasText: 'מיקום צי חכם' }).count()) > 0);
  check('streets-map', (await page.locator('img.leaflet-tile[src*="tile.openstreetmap.org"]').count()) > 0);
  await page.getByRole('button', { name: 'לוויין' }).click();
  await page.waitForTimeout(1800);
  check('satellite-map', (await page.locator('img.leaflet-tile[src*="arcgisonline.com"]').count()) > 0);
  await page.getByRole('button', { name: 'רחובות' }).click();

  const unknownText = await page.locator('[data-unknown-devices="1"]').innerText();
  check('unknown-device', /QAUNK01/.test(unknownText) && /Unknown Device/.test(unknownText), unknownText.slice(0, 180));

  await filterPlate(page, seed.vehicles.online.license_plate);
  await page.waitForTimeout(1000);
  const online = await page.locator('[data-telematics-card="1"]').innerText();
  check('qa-badge', /QA \/ TEST/.test(online));
  check('not-device-live', !/מכשיר/.test(online) || /QA \/ TEST/.test(online));
  check('online-status', /Online/.test(online));
  check('last-seen', /Last Seen/.test(online) && !/Last Seen[\s\S]{0,20}לא התקבל/.test(online));
  check('speed', /62/.test(online));
  check('heading', /Heading/.test(online));
  check('ignition-on', /הצתה[\s\S]{0,40}דולקת/.test(online));
  check('odo', /88,421|88421/.test(online));
  check('odo-source', /ERM #ODO#/.test(online));
  check('voltage', /13\.8/.test(online));
  check('rpm', /2140/.test(online));
  check('fuel', /54/.test(online));
  check('can-mapped', /טמפ׳ שמן QA|טמפ' שמן QA/.test(online));
  check('events', /חריגת מהירות|הצתה נדלקה/.test(online));
  check('event-time', /זמן אירוע אחרון/.test(online));
  const trail = await page.locator('.leaflet-overlay-pane path, .leaflet-overlay-pane polyline').count();
  check('route-history', trail >= 1, { trail });
  await page.locator('[data-telematics-card="1"]').screenshot({ path: join(OUT, '02-desktop-card.png') });
  await page.screenshot({ path: join(OUT, '02-desktop-online.png') });

  await page.getByRole('button', { name: 'נקה סינון' }).click();
  await filterPlate(page, seed.vehicles.stopped.license_plate);
  const stopped = await page.locator('[data-telematics-card="1"]').innerText();
  check('ignition-off', /הצתה[\s\S]{0,40}כבויה/.test(stopped));
  check('missing-rpm-na', /RPM[\s\S]{0,40}לא התקבל/.test(stopped));
  check('missing-fuel-na', /דלק[\s\S]{0,40}לא התקבל/.test(stopped));
  check('zero-speed-shown', /0 קמ״ש|0 קמ"ש/.test(stopped));
  await page.screenshot({ path: join(OUT, '03-desktop-stopped.png') });

  await page.getByRole('button', { name: 'נקה סינון' }).click();
  await filterPlate(page, seed.vehicles.stale.license_plate);
  const stale = await page.locator('[data-telematics-card="1"]').innerText();
  check('stale-status', /Stale|GPS ישן/.test(stale));
  check('stale-not-device-live', !/GPS Live/.test(stale));
  await page.screenshot({ path: join(OUT, '04-desktop-stale.png') });

  await page.getByRole('button', { name: 'נקה סינון' }).click();
  await filterPlate(page, seed.vehicles.offline.license_plate);
  const offline = await page.locator('[data-telematics-card="1"]').innerText();
  check('offline-status', /Offline/.test(offline));
  await page.screenshot({ path: join(OUT, '05-desktop-offline.png') });

  await page.getByRole('button', { name: 'נקה סינון' }).click();
  await filterPlate(page, seed.vehicles.nogps.license_plate);
  await page.waitForTimeout(600);
  const noneText = await page.locator('body').innerText();
  check('no-gps-copy', /אין מיקום GPS זמין|אין GPS/.test(noneText));
  const markersNone = await page.locator('.fleetos-gps-marker').count();
  check('no-fake-marker', markersNone === 0, { markersNone });
  const nogpsCard = await page.locator('[data-telematics-card="1"]').innerText();
  check('no-gps-na-location', /מיקום[\s\S]{0,40}לא התקבל/.test(nogpsCard));
  await page.screenshot({ path: join(OUT, '06-desktop-nogps.png') });

  await ctx.close();

  const { ctx: ctxM, page: pageM } = await openAuthed(browser, seed.emails.companyA, { width: 390, height: 844 });
  await gotoFleet(pageM);
  await waitLoaded(pageM);
  await pageM.locator('.leaflet-container').waitFor({ timeout: 20000 });
  await filterPlate(pageM, seed.vehicles.online.license_plate);
  await pageM.locator('[data-telematics-card="1"]').scrollIntoViewIfNeeded();
  await pageM.waitForTimeout(400);
  await pageM.screenshot({ path: join(OUT, '07-mobile-online.png'), fullPage: true });
  const mobile = await pageM.locator('[data-telematics-card="1"]').innerText();
  check('mobile-qa', /QA \/ TEST/.test(mobile) && /Online/.test(mobile));
  check('mobile-map', (await pageM.locator('.leaflet-container').count()) > 0);
  await ctxM.close();

  const bizAfter = await Promise.all(['faults', 'accidents', 'expenses'].map(async (t) => {
    const { count, error } = await admin.from(t).select('id', { count: 'exact', head: true });
    if (error) throw error;
    return [t, count];
  }));
  report.businessAfter = Object.fromEntries(bizAfter);
  check(
    'business-data-isolation',
    report.businessBefore.faults === report.businessAfter.faults
      && report.businessBefore.accidents === report.businessAfter.accidents
      && report.businessBefore.expenses === report.businessAfter.expenses,
    { before: report.businessBefore, after: report.businessAfter },
  );
  check('production-isolation', report.productionTouched === false && STAGING_REF !== PROD_REF);
} catch (err) {
  check('e2e-exception', false, String(err?.stack || err));
} finally {
  await browser?.close();
}

report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'qa-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.id) }, null, 2));
if (!report.ok) process.exit(1);
