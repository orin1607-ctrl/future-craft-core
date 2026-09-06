/**
 * Focused leftover STAGING checks: follow-up cancel, customer link isolation.
 * TEST claim only. No Gmail mailbox mutation. No Production.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-final-closeout-2026-09-06');
mkdirSync(OUT, { recursive: true });

function loadDotEnv() {
  const out = {};
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}
const env = loadDotEnv();
const db = createClient(`https://${STAGING_REF}.supabase.co`, env.VITE_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await db.auth.signInWithPassword({
  email: 'qa.claims.worker.1788292403067@futurecraft.staging',
  password: 'QaWorker2026!',
});
if (error || !data.session) throw error || new Error('login');
db.auth.setSession(data.session);
const session = data.session;

const report = { at: new Date().toISOString(), checks: [] };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.detail ? ` · ${extra.detail}` : extra.err ? ` · ${extra.err}` : ''}`);
};

const { data: claims } = await db.from('claims_records').select('id, client_name, row_data').like('client_name', 'TEST-FINAL-%').order('created_at', { ascending: false }).limit(8);
const claim = (claims || []).find((c) => !c.row_data?.deletedAt);
rec('have-test-claim', Boolean(claim?.id), { detail: claim?.id || '' });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
const page = await ctx.newPage();
await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
if (claim?.id) {
  await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
  await page.waitForTimeout(600);
  await page.locator(`[data-testid="claim-row-${claim.id}"]`).click();
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 30000 });
  if (await page.locator('[data-testid="claims-tab-group-mail"]:visible').count()) {
    await page.locator('[data-testid="claims-tab-group-mail"]:visible').click();
  }
  if (await page.locator('[data-testid="claims-tab-sub-mailfu"]:visible').count()) {
    await page.locator('[data-testid="claims-tab-sub-mailfu"]:visible').click();
  }
  await page.waitForTimeout(800);
  const cancel = page.locator('[data-testid^="fu-cancel-"]:visible').first();
  rec('followup-cancel-visible', await cancel.count() > 0);
  if (await cancel.count()) {
    await cancel.click();
    await page.waitForTimeout(1000);
    rec('followup-cancel-clicked', true);
  }
  await page.locator('[data-testid="claims-sign-link"]').click().catch(() => undefined);
  await page.waitForTimeout(1500);
  const intakeUrl = await page.locator('[data-testid="claims-intake-url"]').innerText().catch(() => '');
  rec('customer-sign-link', /claims-intake\?t=/.test(intakeUrl) || /http/.test(intakeUrl), { detail: intakeUrl.slice(0, 180) });
  const tokenMatch = intakeUrl.match(/[?&]t=([A-Za-z0-9._-]+)/);
  if (tokenMatch) {
    const pub = await browser.newContext({ locale: 'he-IL' });
    const pp = await pub.newPage();
    await pp.goto(`${PUBLIC}/claims-intake?t=${tokenMatch[1]}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await pp.waitForTimeout(2000);
    const body = await pp.locator('body').innerText();
    rec('customer-no-internal', !/היסטוריה פנימית|משימה פתוחה|עובד מטפל|Gmail|row_data/i.test(body));
    rec('customer-form-visible', await pp.locator('[data-testid="intake-name"], #in_name, .intake-form').count() > 0, { detail: body.slice(0, 160) });
    await pub.close();
  }
}
await browser.close();
writeFileSync(join(OUT, 'focus-report.json'), JSON.stringify(report, null, 2));
process.exit(report.checks.some((c) => !c.ok) ? 1 : 0);
