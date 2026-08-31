/**
 * Staging local QA — Oren Car mobile sidebar overlay.
 * Targets Vite http://localhost:8080 (current Layout/BottomNav). No Production.
 * node scripts/oren-car-mobile-sidebar-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const BASE = 'http://localhost:8080';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-mobile-sidebar-2026-09-01/qa');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stagingRef: STAGING_REF,
  productionTouched: false,
  checks: [],
  consoleErrors: [],
  networkErrors: [],
  ok: false,
};

function rec(name, ok, extra = {}) {
  report.checks.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(3);
if (!saRole?.length) throw new Error('no staging super_admin');
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email;
if (!saEmail) throw new Error('no super_admin email');

async function inject(context) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
  if (linkErr) throw linkErr;
  const { data: auth, error } = await client.auth.verifyOtp({
    email: saEmail,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (error || !auth.session) throw error || new Error('verifyOtp');
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${STAGING_REF}-auth-token`,
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

const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function runViewport(name, viewport) {
  const ctx = await browser.newContext({ locale: 'he-IL', viewport });
  await inject(ctx);
  const page = await ctx.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push({ name, text: msg.text().slice(0, 240) });
  });
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() >= 500 && (u.includes('localhost:8080') || u.includes('supabase.co'))) {
      report.networkErrors.push({ name, status: res.status(), url: u.slice(0, 180) });
    }
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(900);

  const openBtn = page.locator('[data-testid="mobile-nav-open"]');
  const drawer = page.locator('[data-testid="mobile-nav-drawer"]');
  const overlay = page.locator('[data-testid="mobile-nav-overlay"]');
  const desktopAsideVisible = await page.locator('aside[aria-label="תפריט ניווט"]').evaluate((el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 40;
  }).catch(() => false);

  if (viewport.width < 768) {
    rec(`${name}-hamburger-visible`, await openBtn.isVisible());
    rec(`${name}-drawer-closed-by-default`, !(await overlay.isVisible()));
    await openBtn.click();
    await page.waitForTimeout(300);
    rec(`${name}-drawer-opens`, await drawer.isVisible() && await overlay.isVisible());
    const drawerText = await drawer.innerText();
    rec(`${name}-oren-links`, drawerText.includes('רשימת רכבים') && drawerText.includes('מעקב רכבים') && drawerText.includes('התראות'));
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    rec(`${name}-no-horizontal-scroll`, !overflowX, { scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) });
    await page.locator('[data-testid="mobile-nav-close"]').click();
    await page.waitForTimeout(200);
    rec(`${name}-close-x`, !(await overlay.isVisible()));
    await openBtn.click();
    await page.waitForTimeout(200);
    await overlay.click({ position: { x: 10, y: 200 } });
    await page.waitForTimeout(200);
    rec(`${name}-close-backdrop`, !(await overlay.isVisible()));
    await openBtn.click();
    await page.waitForTimeout(200);
    await drawer.getByRole('link', { name: 'התראות' }).click();
    await page.waitForTimeout(800);
    rec(`${name}-navigate-closes`, page.url().includes('/alerts') && !(await overlay.isVisible()));
  } else {
    rec(`${name}-hamburger-hidden`, !(await openBtn.isVisible()));
    rec(`${name}-sidebar-visible`, desktopAsideVisible);
    const asideText = await page.locator('aside[aria-label="תפריט ניווט"]').innerText();
    rec(`${name}-oren-links`, asideText.includes('רשימת רכבים') && asideText.includes('מעקב רכבים'));
  }

  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  await ctx.close();
}

try {
  await runViewport('mobile-390', { width: 390, height: 844 });
  await runViewport('tablet-768', { width: 768, height: 1024 });
  await runViewport('desktop-1280', { width: 1280, height: 800 });
} finally {
  await browser.close();
}

rec('console-clean', report.consoleErrors.length === 0, { n: report.consoleErrors.length, sample: report.consoleErrors.slice(0, 3) });
rec('network-no-5xx', report.networkErrors.length === 0, { n: report.networkErrors.length });
report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, pass: report.checks.filter((c) => c.ok).length, fail: report.checks.filter((c) => !c.ok).length }, null, 2));
if (!report.ok) process.exit(1);
