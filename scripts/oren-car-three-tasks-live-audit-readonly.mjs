/**
 * Read-only live audit — no DB writes, no UI mutations that persist.
 * node scripts/oren-car-three-tasks-live-audit-readonly.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const V917_UUID = '3378a2db-6492-44d8-82e9-577444c49794';
const V917_PLATE = '15094302';
const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-three-tasks-staging', 'live-audit-2026-08-09');
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

function getKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

const { service, anon } = getKeys();
const url = `https://${STAGING_REF}.supabase.co`;
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  readonly: true,
  noChangesMade: true,
  live: {},
  db: {},
  ui: {},
  gaps: [],
};

async function dbAudit() {
  const { count: off } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', COMPANY)
    .eq('insurance_alerts_enabled', false);
  const { count: total } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', COMPANY);
  const { data: settings } = await admin
    .from('company_settings')
    .select('alert_days_before, reminder_30_days, reminder_7_days, reminder_1_day')
    .eq('company_name', COMPANY)
    .maybeSingle();
  const { data: v917 } = await admin
    .from('vehicles')
    .select('id, license_plate, internal_number, test_expiry, insurance_expiry, insurance_alerts_enabled')
    .eq('company_name', COMPANY)
    .eq('internal_number', '917');
  const daysUntil = (d) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);

  const { data: allBeeri } = await admin
    .from('vehicles')
    .select('license_plate, internal_number, test_expiry')
    .eq('company_name', COMPANY)
    .not('test_expiry', 'is', null);

  const tier = { over30: 0, window30: [], window7: [], window1: [] };
  for (const v of allBeeri || []) {
    const dl = daysUntil(v.test_expiry);
    if (dl === null || dl > 30) {
      if (dl !== null && dl > 30) tier.over30++;
      continue;
    }
    if (dl >= 8) tier.window30.push({ plate: v.license_plate, internal: v.internal_number, days: dl });
    else if (dl >= 2) tier.window7.push({ plate: v.license_plate, internal: v.internal_number, days: dl });
    else tier.window1.push({ plate: v.license_plate, internal: v.internal_number, days: dl });
  }

  report.db = {
    project: STAGING_REF,
    columnReadable: true,
    beeriInsuranceOff: off,
    beeriTotal: total,
    settings,
    v917: (v917 || []).map((v) => ({ ...v, test_days_left: daysUntil(v.test_expiry) })),
    testTierCounts: {
      over30: tier.over30,
      in30window: tier.window30.length,
      in7window: tier.window7.length,
      in1window: tier.window1.length,
      samples30: tier.window30.slice(0, 3),
      samples7: tier.window7.slice(0, 3),
      samples1: tier.window1.slice(0, 3),
    },
  };
}

async function injectSession(context) {
  const anonClient = createClient(url, anon);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (linkErr) throw linkErr;
  const otp = linkData.properties?.email_otp;
  const { data: auth, error: verifyErr } = await anonClient.auth.verifyOtp({ email: EMAIL, token: otp, type: 'email' });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp failed');
  const storageKey = `sb-${STAGING_REF}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: storageKey,
      value: {
        access_token: auth.session.access_token,
        refresh_token: auth.session.refresh_token,
        expires_at: auth.session.expires_at,
        expires_in: auth.session.expires_in,
        token_type: auth.session.token_type,
        user: auth.session.user,
      },
    },
  );
}

async function shot(page, name) {
  const rel = `screenshots/${name}`;
  await page.screenshot({ path: join(OUT, rel), fullPage: true });
  return rel;
}

async function runViewport(browser, viewport, tag) {
  const bucket = { console: [], network: [] };
  const ctx = await browser.newContext({ locale: 'he-IL', ...devices[viewport] });
  await injectSession(ctx);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') bucket.console.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) bucket.network.push({ url: r.url(), status: r.status() });
  });

  const ui = { tag, paths: [], shots: [] };

  // Live bundle meta from window if exposed
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const buildMeta = await page.evaluate(() => ({
    commit: window.__BUILD_COMMIT__ || document.querySelector('meta[name="build-commit"]')?.getAttribute('content') || null,
    href: location.href,
  }));
  if (tag === 'desktop') report.live.buildMeta = buildMeta;

  // Vehicle tracking — main screen
  await page.goto(`${BASE}/vehicle-tracking`, { waitUntil: 'networkidle', timeout: 120000 });
  ui.paths.push('תפריט/ניווט → מעקב רכבים (/vehicle-tracking)');
  const beforeAlertFilter = await page.locator('tbody tr').count().catch(() => 0);
  const alertTile = page.locator('button').filter({ hasText: 'עם התראות' }).first();
  const alertTileCount = await alertTile.locator('p.text-2xl').textContent().catch(() => '?');
  ui.alertTileCount = alertTileCount?.trim();
  await alertTile.click();
  await page.waitForTimeout(800);
  const afterAlertFilter = await page.locator('tbody tr').count().catch(() => 0);
  const tileActive = await alertTile.evaluate((el) => el.className.includes('border-primary'));
  ui.alertTileClick = { beforeRows: beforeAlertFilter, afterRows: afterAlertFilter, tileHighlighted: tileActive };
  ui.shots.push(await shot(page, `${tag}-01-tracking-alert-tile.png`));

  // Advanced filter — alert kind
  await page.getByRole('button', { name: 'סינון מתקדם' }).click();
  await page.waitForTimeout(500);
  const alertKindSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'טסט' }) }).first();
  ui.hasAlertKindFilter = (await alertKindSelect.count()) > 0;
  ui.shots.push(await shot(page, `${tag}-02-tracking-filter-panel.png`));

  // Search 917 plate
  await page.locator('input[placeholder*="123"]').fill(V917_PLATE);
  await page.getByRole('button', { name: 'החל סינון' }).click();
  await page.waitForTimeout(1000);
  const rowText = await page.locator('tbody').innerText().catch(() => '');
  const testChipInRow = /טסט/.test(rowText) && rowText.includes(V917_PLATE);
  ui.vehicle917 = { rowVisible: rowText.includes(V917_PLATE), testChipInRow };
  ui.shots.push(await shot(page, `${tag}-03-tracking-917-row.png`));

  // Click first alert chip if any
  const chip = page.locator(`tbody tr:has-text("${V917_PLATE}") a.status-badge`).first();
  if (await chip.count()) {
    const href = await chip.getAttribute('href');
    ui.sampleAlertLink = href;
    const usesUuid = href?.includes('vehicleId=') || href?.includes(V917_UUID);
    ui.alertLinkUsesUuid = !!usesUuid;
  }

  // Insurance toggle path
  await page.goto(`${BASE}/vehicles?vehicleId=${V917_UUID}&view=hub&hubSection=manage`, {
    waitUntil: 'networkidle',
    timeout: 120000,
  });
  ui.paths.push('רכבים → כרטיס רכב (hub) → ניהול רכב (hubSection=manage)');
  const bodyManage = await page.locator('body').innerText();
  ui.toggle = {
    labelVisible: bodyManage.includes('הפעל התראות ביטוח'),
    helperText: bodyManage.includes('כבוי — אין התראות ביטוח') || bodyManage.includes('כבוי - אין התראות ביטוח'),
    switchState: await page.locator('button[role="switch"]').first().getAttribute('data-state').catch(() => null),
  };
  ui.shots.push(await shot(page, `${tag}-04-insurance-toggle-manage.png`));

  // Alerts page insurance mentions
  await page.goto(`${BASE}/alerts`, { waitUntil: 'networkidle', timeout: 120000 });
  const alertsBody = await page.locator('body').innerText();
  ui.alertsInsuranceMentions = (alertsBody.match(/ביטוח/g) || []).length;
  ui.shots.push(await shot(page, `${tag}-05-alerts-page.png`));

  // FleetOS if accessible
  await page.goto(`${BASE}/fleetos-ai`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
  if (!page.url().includes('/login')) {
    ui.fleetosLoaded = true;
    ui.shots.push(await shot(page, `${tag}-06-fleetos.png`));
  } else {
    ui.fleetosLoaded = false;
  }

  // Regression vehicles
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  ui.vehiclesListOk = !(await page.locator('body').innerText()).includes('טוען') && (await page.locator('body').innerText()).length > 200;
  ui.shots.push(await shot(page, `${tag}-07-vehicles-list.png`));

  ui.consoleErrors = [...new Set(bucket.console)].slice(0, 10);
  ui.networkErrors = bucket.network.filter((n) => !n.url.includes('favicon')).slice(0, 10);

  report.ui[tag] = ui;
  await ctx.close();
}

async function main() {
  // Fetch live index + bundle name
  const indexRes = await fetch(`${BASE}/`);
  const indexHtml = await indexRes.text();
  const bundleMatch = indexHtml.match(/assets\/(index-[^"]+\.js)/);
  report.live.url = BASE;
  report.live.bundle = bundleMatch ? bundleMatch[1] : null;
  if (report.live.bundle) {
    const jsRes = await fetch(`${BASE}/assets/${report.live.bundle}`);
    const js = await jsRes.text();
    report.live.bundleContainsCommit8c94383 = js.includes('8c94383');
    report.live.bundleContainsExpiryTier = js.includes('expiryReminderTier');
    report.live.bundleContainsInsuranceToggle = js.includes('insurance_alerts_enabled');
    report.live.bundleContainsStagingRef = js.includes(STAGING_REF);
  }

  const ghRes = await fetch('https://api.github.com/repos/orin1607-ctrl/future-craft-core/commits/main');
  const ghMain = await ghRes.json();
  report.live.githubMainSha = ghMain.sha?.slice(0, 7);
  report.live.githubMainMessage = ghMain.commit?.message?.split('\n')[0];

  await dbAudit();

  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, 'Desktop Chrome', 'desktop');
    await runViewport(browser, 'iPhone 13', 'mobile');
  } finally {
    await browser.close();
  }

  // Gap analysis
  report.gaps.push({
    id: 'no-alerts-tab',
    severity: 'documentation',
    text: 'אין לשונית נפרדת "התראות" במעקב רכב — ההתראות בעמודת צ\'יפים בטבלה + אריח "עם התראות" + סינון מתקדם.',
  });
  if (!report.ui.desktop?.alertTileClick?.tileHighlighted && report.ui.desktop?.alertTileCount === '0') {
    report.gaps.push({
      id: 'alert-tile-zero',
      severity: 'ux',
      text: 'אריח "עם התראות" מציג 0 — לחיצה מסננת לרשימה ריקה ולכן נראית כאילו לא קורה כלום.',
    });
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
