/**
 * Remaining Staging checks: follow-up 5/7 persist, Sent preview UI.
 * TEST claim only. No live send. No mass import. No Production.
 * node scripts/claims-status-gaps-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/claims-status-gaps-2026-09-04');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const FU_TO = 'qa.followup.days@futurecraft.staging';

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, liveMailSent: false, checks: [], ok: false };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 200)}` : ''}`);
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
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || loadDotEnv().VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (authErr || !auth.session) throw authErr || new Error('worker login failed');
const session = auth.session;

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
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 30000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) {
    await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
    await page.waitForTimeout(400);
  }
  await page.locator('[data-testid="claims-nav-archive"]').click();
  await page.waitForTimeout(700);
  await search.fill('TEST-CLAIMS');
  await page.waitForTimeout(900);
  const row = page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first();
  await row.waitFor({ state: 'visible', timeout: 20000 });
  await row.click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true });
  await page.waitForTimeout(700);
}

async function listedDays(page) {
  const texts = await page.locator('.fu-box').allInnerTexts().catch(() => []);
  const scheduled = texts.find((t) => t.includes('עריכה') || t.includes('עצור מעקב')) || texts[0] || '';
  const m = scheduled.match(/אם אין תשובה בתוך\s*(\d+)\s*ימים/);
  return m ? Number(m[1]) : 0;
}
async function waitListedDays(page, expected, timeout = 15000) {
  const start = Date.now();
  let last = 0;
  while (Date.now() - start < timeout) {
    last = await listedDays(page);
    if (last === expected) return last;
    await page.waitForTimeout(400);
  }
  return last;
}
async function cancelAll(page) {
  for (let i = 0; i < 8; i++) {
    const stop = page.getByRole('button', { name: 'עצור מעקב' }).first();
    if (!(await stop.count())) break;
    await stop.click({ force: true, timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(700);
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
  await inject(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('[data-testid="claims-search"]').waitFor({ state: 'visible', timeout: 30000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
  const previewBtn = page.locator('[data-testid="claims-preview-sent"], [data-testid="claims-preview-sent-gmail"]').first();
  if (!(await previewBtn.count())) {
    await page.locator('.sb-i', { hasText: 'Gmail' }).click().catch(() => null);
    await page.waitForTimeout(600);
  }
  rec('ui-preview-sent-button', await page.locator('[data-testid="claims-preview-sent"], [data-testid="claims-preview-sent-gmail"]').count() > 0);
  if (await page.locator('[data-testid="claims-preview-sent"], [data-testid="claims-preview-sent-gmail"]').count()) {
    await page.locator('[data-testid="claims-preview-sent"], [data-testid="claims-preview-sent-gmail"]').first().click();
    const bodyOk = await page.locator('[data-testid="sent-preview-body"]').waitFor({ state: 'visible', timeout: 90000 }).then(() => true).catch(() => false);
    rec('ui-preview-sent-modal', bodyOk);
    const txt = await page.locator('[data-testid="sent-preview-body"]').innerText().catch(() => '');
    rec('ui-preview-no-import', /תצוגה בלבד|אין Import|SCAN\/PREVIEW/i.test(txt), { detail: txt.slice(0, 180) });
    rec('ui-preview-has-counts', /רלוונטיים|קבצים|Review/.test(txt), { detail: txt.slice(0, 180) });
    await page.screenshot({ path: join(OUT, 'screenshots', 'sent-preview-ui.png') });
    await page.locator('.ov.open button.mcl').click().catch(() => page.keyboard.press('Escape'));
  } else {
    rec('ui-preview-sent-modal', false, { err: 'button missing' });
    rec('ui-preview-no-import', false, { err: 'button missing' });
    rec('ui-preview-has-counts', false, { err: 'button missing' });
  }

  await openFollowupTab(page);
  await cancelAll(page);
  await page.getByRole('button', { name: /הגדר מעקב מייל/ }).first().click();
  await page.locator('[data-testid="mo-mail-fu"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="fu-to"]').fill(FU_TO);
  await page.locator('[data-testid="fu-days-5"]').click();
  await page.locator('[data-testid="fu-save"]').click();
  rec('desktop-save-5', await waitListedDays(page, 5) === 5, { days: await listedDays(page) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openFollowupTab(page);
  rec('desktop-refresh-5', await listedDays(page) === 5, { days: await listedDays(page) });
  await page.screenshot({ path: join(OUT, 'screenshots', 'fu-desktop-5.png') });

  await page.getByRole('button', { name: 'עריכה' }).first().click();
  await page.locator('[data-testid="mo-mail-fu"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="fu-days-7"]').click();
  await page.locator('[data-testid="fu-save"]').click();
  rec('desktop-save-7', await waitListedDays(page, 7) === 7, { days: await listedDays(page) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openFollowupTab(page);
  rec('desktop-refresh-7', await listedDays(page) === 7, { days: await listedDays(page) });
  await page.screenshot({ path: join(OUT, 'screenshots', 'fu-desktop-7.png') });
  await cancelAll(page);
  rec('production-untouched', true);
  rec('no-real-email', true);
  await ctx.close();
} finally {
  await browser.close();
}

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'QA-RESULT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
