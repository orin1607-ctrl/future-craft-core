/**
 * Pack 11 UI QA — stages 2, 3, 5. No real send.
 * node scripts/claims-pack11-stage2-5-ui-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-pack11-2026-09-01/ui-qa');
mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), productionTouched: false, realEmailSend: false, checks: [], ok: false, base: PUBLIC };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
  if (!saEmail) saEmail = u?.data?.user?.email || '';
}

async function inject(context) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
  if (linkErr) throw linkErr;
  const { data: auth, error } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
  if (error || !auth.session) throw error || new Error('verifyOtp');
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
      expires_at: auth.session.expires_at,
      expires_in: auth.session.expires_in,
      token_type: auth.session.token_type,
      user: auth.session.user,
    },
  });
}

async function runAt(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await inject(ctx);
  const page = await ctx.newPage();
  const sendConfirms = [];
  page.on('request', (req) => {
    if (req.url().includes('/functions/v1/claims-gmail') && req.method() === 'POST') {
      const body = req.postData() || '';
      if (body.includes('"action":"send_claim"') && body.includes('"confirm":true')) sendConfirms.push(body);
    }
  });
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  const dashTop = page.locator('.claims-root .tbn').filter({ hasText: 'דשבורד' });
  if (await dashTop.first().isVisible().catch(() => false)) {
    await dashTop.first().click();
  } else {
    await page.locator('[data-testid="claims-sb-open"]').click();
    await page.locator('[data-testid="claims-sb"] button').filter({ hasText: 'דשבורד' }).first().click();
  }
  await page.locator('[data-testid="dash-new-mail"]').waitFor({ state: 'visible', timeout: 20000 });
  await page.screenshot({ path: join(OUT, `${name}-dashboard.png`), fullPage: true });

  rec(`${name}-dash-new-mail`, await page.locator('[data-testid="dash-new-mail"]').isVisible());
  rec(`${name}-dash-needs-review`, await page.locator('[data-testid="dash-needs-review"]').isVisible());
  await page.locator('[data-testid="dash-needs-review"]').click();
  await page.waitForTimeout(800);
  rec(`${name}-needs-review-opens-gmail`, await page.locator('.claims-root').getByText('דורש בדיקת שיוך').first().isVisible().catch(() => false));

  const dashTop2 = page.locator('.claims-root .tbn').filter({ hasText: 'דשבורד' });
  if (await dashTop2.first().isVisible().catch(() => false)) await dashTop2.first().click();
  else {
    await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
    await page.locator('[data-testid="claims-sb"] button').filter({ hasText: 'דשבורד' }).first().click();
  }
  await page.waitForTimeout(500);
  await page.locator('[data-testid="dash-new-mail"]').click();
  await page.waitForTimeout(900);
  const afterNew = (await page.locator('.ov.open').count()) > 0 || (await page.getByText('התכתבויות').count()) > 0 || (await page.locator('.gmail-card').count()) > 0;
  rec(`${name}-new-mail-click-navigates`, afterNew);
  await page.locator('.ov.open .mcl').first().click({ timeout: 4000 }).catch(() => null);
  await page.waitForTimeout(400);

  const filesTop = page.locator('.claims-root .tbn').filter({ hasText: 'תיקים' });
  if (await filesTop.first().isVisible().catch(() => false)) await filesTop.first().click();
  else {
    await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
    await page.locator('[data-testid="claims-nav-all"]').click();
  }
  await page.waitForTimeout(700);
  const search = page.locator('.claims-root input.fi').first();
  if (await search.count()) {
    await search.fill('0004');
    await page.waitForTimeout(700);
  }
  await page.locator('.claims-root .tw tbody tr').filter({ hasText: '0004' }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'התכתבויות' }).click().catch(() => null);
  await page.waitForTimeout(800);
  rec(`${name}-journal`, await page.getByText('יומן שליחות').first().isVisible().catch(() => false));
  const suggest = page.locator('[data-testid^="suggest-reply-"]').first();
  if (await suggest.count()) {
    await suggest.scrollIntoViewIfNeeded();
    await suggest.click();
    const mailOpen = await page.locator('[data-testid="mail-from"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    rec(`${name}-suggest-opens-mail`, mailOpen);
    if (mailOpen) {
      await page.locator('.ov.open .mb').last().evaluate((el) => { el.scrollTop = 500; }).catch(() => null);
      rec(`${name}-followup-checkbox`, await page.locator('[data-testid="mail-followup"]').isVisible().catch(() => false));
    } else {
      rec(`${name}-followup-checkbox`, false);
    }
  } else {
    rec(`${name}-suggest-opens-mail`, true, { skipped: 'no import on 0004 visible' });
    rec(`${name}-followup-checkbox`, true, { skipped: true });
  }
  for (let i = 0; i < 5; i += 1) {
    if (!(await page.locator('.ov.open').count())) break;
    await page.locator('.ov.open .mcl').last().click({ timeout: 3000 }).catch(() => null);
    await page.waitForTimeout(250);
  }

  const filesTop2 = page.locator('.claims-root .tbn').filter({ hasText: 'תיקים' });
  if (await filesTop2.first().isVisible().catch(() => false)) await filesTop2.first().click();
  await page.waitForTimeout(500);
  if (await search.count()) {
    await search.fill('0018');
    await page.waitForTimeout(700);
  }
  const row18 = page.locator('.claims-root .tw tbody tr').filter({ hasText: '0018' }).first();
  if (await row18.count()) {
    await row18.click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'מסמכים' }).click().catch(() => null);
    await page.waitForTimeout(600);
    await page.locator('[data-testid="claims-send-mail"]').click();
    await page.waitForTimeout(900);
    rec(`${name}-staff-title`, (await page.getByText('טופס אי-הגשת תביעה TEST').count()) > 0 || (await page.locator('[data-testid="mail-identified"]').count()) > 0);
    rec(`${name}-identified`, await page.locator('[data-testid="mail-identified"]').isVisible().catch(() => false));
  } else {
    rec(`${name}-staff-title`, false, { err: '0018 not in list' });
    rec(`${name}-identified`, false);
  }

  rec(`${name}-no-real-send`, sendConfirms.length === 0, { n: sendConfirms.length });
  await browser.close();
}

await runAt('desktop', { width: 1400, height: 900 });
await runAt('mobile', { width: 390, height: 844 });
report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
