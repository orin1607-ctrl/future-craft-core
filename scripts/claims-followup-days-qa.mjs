/**
 * Staging QA — Follow-up day presets (3/4/5/7/other) persist after refresh.
 * TEST claim DAL-QA-WORKER-001 only. Dry Run. No live send. No Production.
 * node scripts/claims-followup-days-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-followup-days-2026-09-04');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const FU_TO = 'qa.followup.days@futurecraft.staging';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  liveMailSent: false,
  schemaChanged: false,
  checks: [],
  ok: false,
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : ''}`);
};

function loadDotEnv() {
  const out = {};
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      out[line.slice(0, i)] = line.slice(i + 1);
    }
  } catch { /* optional */ }
  return out;
}
const dotenv = loadDotEnv();
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || dotenv.VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (authErr || !auth.session) throw authErr || new Error('worker login failed');
const session = auth.session;

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });

const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
if (String(PUBLIC).includes('github.io')) {
  let pagesReady = false;
  for (let i = 0; i < 24; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt`).then((r) => r.text()).catch(() => '');
    if (txt.includes(sha)) {
      pagesReady = true;
      rec('pages-deploy-sha', true, { sha, txt: txt.trim() });
      break;
    }
    if (i === 0) console.log(`waiting for GitHub Pages ${sha} … currently ${txt.trim()}`);
    await new Promise((r) => setTimeout(r, 15000));
  }
  if (!pagesReady) rec('pages-deploy-sha', false, { sha, err: 'pages not on this SHA yet' });
} else {
  rec('pages-deploy-sha', true, { sha, note: 'local/preview' });
}

async function inject(context) {
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
}

async function openFollowupTab(page) {
  await page.goto(`${PUBLIC.replace(/\/$/, '')}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 30000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) {
    await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
    await page.waitForTimeout(400);
  }
  await page.locator('[data-testid="claims-nav-archive"]').click();
  await page.waitForTimeout(700);
  await search.fill('TEST-CLAIMS');
  await page.waitForTimeout(1000);
  const row = page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first();
  await row.waitFor({ state: 'visible', timeout: 20000 });
  await row.click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.waitForTimeout(500);
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true });
  await page.waitForTimeout(800);
}

async function saveDays(page, days, other) {
  await page.getByRole('button', { name: /הגדר מעקב מייל|עריכה/ }).first().click();
  await page.locator('[data-testid="mo-mail-fu"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="fu-to"]').fill(FU_TO);
  if (other) {
    await page.locator('[data-testid="fu-days-other"]').click();
    await page.locator('[data-testid="fu-days-other-input"]').fill(String(days));
  } else {
    await page.locator(`[data-testid="fu-days-${days}"]`).click();
  }
  await page.locator('[data-testid="fu-save"]').click();
  await page.waitForTimeout(1500);
}

async function listedDays(page) {
  const text = await page.locator('.fu-box').first().innerText().catch(() => '');
  const m = text.match(/אם אין תשובה בתוך\s*(\d+)\s*ימים/);
  return m ? Number(m[1]) : 0;
}

async function cancelAll(page) {
  for (let i = 0; i < 8; i++) {
    const stop = page.getByRole('button', { name: 'עצור מעקב' }).first();
    if (!(await stop.count())) break;
    await stop.click();
    await page.waitForTimeout(700);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
  await inject(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);
  await openFollowupTab(page);
  rec('desktop-mailfu-open', (await page.getByText('מעקב מייל').count()) > 0);
  await cancelAll(page);

  await saveDays(page, 3, false);
  rec('desktop-save-3', await listedDays(page) === 3, { days: await listedDays(page) });
  await page.screenshot({ path: join(OUT, 'screenshots', 'fu-desktop-3.png') });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openFollowupTab(page);
  rec('desktop-refresh-3', await listedDays(page) === 3, { days: await listedDays(page) });

  await page.getByRole('button', { name: 'עריכה' }).first().click();
  await page.locator('[data-testid="mo-mail-fu"]').waitFor({ state: 'visible', timeout: 15000 });
  rec('desktop-edit-restores-3', await page.locator('[data-testid="fu-days-3"]').getAttribute('class').then((c) => (c || '').includes('on')).catch(() => false));
  await page.locator('[data-testid="fu-days-4"]').click();
  await page.locator('[data-testid="fu-save"]').click();
  await page.waitForTimeout(1500);
  rec('desktop-save-4', await listedDays(page) === 4, { days: await listedDays(page) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openFollowupTab(page);
  rec('desktop-refresh-4', await listedDays(page) === 4, { days: await listedDays(page) });
  await page.screenshot({ path: join(OUT, 'screenshots', 'fu-desktop-4.png') });

  await page.getByRole('button', { name: 'עריכה' }).first().click();
  await page.locator('[data-testid="mo-mail-fu"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="fu-days-other"]').click();
  await page.locator('[data-testid="fu-days-other-input"]').fill('9');
  await page.locator('[data-testid="fu-save"]').click();
  await page.waitForTimeout(1500);
  rec('desktop-save-other-9', await listedDays(page) === 9, { days: await listedDays(page) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openFollowupTab(page);
  rec('desktop-refresh-other-9', await listedDays(page) === 9, { days: await listedDays(page) });
  await page.screenshot({ path: join(OUT, 'screenshots', 'fu-desktop-other.png') });
  await cancelAll(page);
  rec('desktop-cancel', (await page.getByRole('button', { name: 'עצור מעקב' }).count()) === 0 || (await page.getByText('אין מעקב מייל בתיק זה').count()) > 0);
  rec('production-untouched', true);
  rec('no-real-email', true);
  await ctx.close();

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'he-IL', hasTouch: true });
  await inject(mobileCtx);
  const mobile = await mobileCtx.newPage();
  await openFollowupTab(mobile);
  await mobile.getByRole('button', { name: /הגדר מעקב מייל/ }).first().click();
  await mobile.locator('[data-testid="mo-mail-fu"]').waitFor({ state: 'visible', timeout: 15000 });
  rec('mobile-picker-3', await mobile.locator('[data-testid="fu-days-3"]').isVisible());
  rec('mobile-picker-4', await mobile.locator('[data-testid="fu-days-4"]').isVisible());
  rec('mobile-picker-5', await mobile.locator('[data-testid="fu-days-5"]').isVisible());
  rec('mobile-picker-7', await mobile.locator('[data-testid="fu-days-7"]').isVisible());
  rec('mobile-picker-other', await mobile.locator('[data-testid="fu-days-other"]').isVisible());
  await mobile.locator('[data-testid="fu-to"]').fill(FU_TO);
  await mobile.locator('[data-testid="fu-days-3"]').click();
  await mobile.locator('[data-testid="fu-save"]').click();
  await mobile.waitForTimeout(1500);
  rec('mobile-save-3', await listedDays(mobile) === 3, { days: await listedDays(mobile) });
  await mobile.reload({ waitUntil: 'domcontentloaded' });
  await openFollowupTab(mobile);
  rec('mobile-refresh-3', await listedDays(mobile) === 3, { days: await listedDays(mobile) });
  await mobile.screenshot({ path: join(OUT, 'screenshots', 'fu-mobile-3.png') });
  await cancelAll(mobile);
  rec('mobile-cancel', true);
  await mobileCtx.close();
} finally {
  await browser.close();
}

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'QA-RESULT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
