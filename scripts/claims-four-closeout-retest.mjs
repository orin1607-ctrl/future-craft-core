/**
 * Follow-up public STAGING QA on DAL-2026-0021: mail focus, PDF open, missing-doc block, mail pick.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const CLAIM = 'DAL-2026-0021';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-four-closeout-2026-09-06');
const ART = '/opt/cursor/artifacts';
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
const db = createClient(`https://${STAGING_REF}.supabase.co`, anon, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error } = await db.auth.signInWithPassword({
  email: 'qa.claims.worker.1788292403067@futurecraft.staging',
  password: 'QaWorker2026!',
});
if (error || !auth.session) throw error || new Error('login');
db.auth.setSession(auth.session);

const mid = `qa-closeout-miss-${Date.now()}`;
const tsk = `TSK-QA-MISS-${Date.now()}`;
await db.from('claims_tasks').insert({
  id: tsk,
  claim_id: CLAIM,
  row_data: {
    id: tsk, claimId: CLAIM, action: 'חשבונית מוסך', gmailMessageId: mid,
    requestKind: 'doc', docState: 'missing', done: 'false', workStatus: 'open', source: 'QA-CLOSEOUT',
  },
});

const report = { at: new Date().toISOString(), claimId: CLAIM, checks: [] };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.detail ? ` · ${String(extra.detail).slice(0, 200)}` : extra.err ? ` · ${extra.err}` : ''}`);
};

async function shot(page, name) {
  const p = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  if (existsSync(ART)) copyFileSync(p, join(ART, `claims-closeout-${name}.png`));
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
const page = await ctx.newPage();
await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
if (await page.getByRole('button', { name: /הכול/ }).count()) await page.getByRole('button', { name: /הכול/ }).first().click().catch(() => undefined);
const row = page.locator(`[data-testid="claim-row-${CLAIM}"]`);
await row.waitFor({ timeout: 20000 });
const badge = row.locator('[data-testid="claim-alert-mail_action"]');
rec('re-counter-present', await badge.count() > 0, { detail: await badge.innerText().catch(() => '') });
await badge.click();
await page.waitForSelector('[data-testid="mail-correspondence"]', { timeout: 20000 });
await page.waitForSelector('.gmail-card', { timeout: 20000 });
const subjects = await page.locator('.gmail-card').evaluateAll((els) => els.map((e) => e.textContent || ''));
rec('re-mail-subjects', subjects.some((s) => s.includes('TEST-CLOSEOUT נא להגיב')) && subjects.some((s) => s.includes('רישיון נהיגה')), { detail: subjects.map((s) => s.slice(0, 80)).join(' | ') });
rec('re-mail-mid', await page.locator('[data-mail-mid="qa-closeout-1788727661315-a"]').count() > 0);
await shot(page, 're-mail-focus');

await page.locator('[data-testid="claims-open-docs"]').click();
await page.waitForTimeout(800);
const viewBtn = page.locator('[data-testid="claim-doc-type-accident_notice"] >> text=צפייה');
rec('re-pdf-view-btn', await viewBtn.count() > 0);
if (await viewBtn.count()) {
  await viewBtn.click();
  await page.waitForTimeout(1500);
  rec('re-pdf-preview', await page.locator('iframe, embed, object, [data-testid*="preview"]').count() > 0 || await page.locator('a[href*="http"]').count() > 0);
  await shot(page, 're-pdf-open');
}

await page.locator('[data-testid="claims-send-mail"]').click();
await page.waitForTimeout(1000);
await page.locator('[data-testid="mail-pick-signed-form"]').click();
await page.locator('[data-testid="mail-pick-license-front"]').click();
await page.locator('[data-testid="mail-pick-license-back"]').click();
await page.waitForTimeout(600);
const checks = await page.locator('input[type="checkbox"]:checked').count();
rec('re-mail-picks', checks >= 3, { detail: `checked=${checks}` });
await shot(page, 're-mail-picks');
await page.keyboard.press('Escape').catch(() => undefined);
await page.waitForTimeout(400);
await page.locator('.ov.open .mcl').last().click().catch(() => undefined);
await page.waitForTimeout(500);
if (await page.locator('[data-testid="claims-card-snapshot"]').count() === 0) {
  await page.locator(`[data-testid="claim-row-${CLAIM}"]`).click();
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 20000 });
}
await page.locator('[data-testid="claims-tab-group-work"]').click({ force: true });
await page.locator('[data-testid="claims-tab-sub-tasks"]').click();
await page.waitForSelector(`[data-testid="task-status-${tsk}"]`, { timeout: 15000 });
await page.locator(`[data-testid="task-status-${tsk}"]`).selectOption('done');
await page.waitForTimeout(800);
const { data: after } = await db.from('claims_tasks').select('row_data').eq('id', tsk).maybeSingle();
rec('re-missing-block', after?.row_data?.done !== 'true', { detail: JSON.stringify(after?.row_data) });
const toast = await page.locator('.toast, [class*="toast"]').innerText().catch(() => '');
rec('re-missing-toast', /חסר מסמך/.test(toast + (await page.content())), { detail: toast });
await shot(page, 're-missing-block');

await browser.close();
writeFileSync(join(OUT, 'retest.json'), JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok).map((c) => c.name);
console.log(JSON.stringify({ failed }, null, 2));
process.exit(failed.length ? 1 : 0);
