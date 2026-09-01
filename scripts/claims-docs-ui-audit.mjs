/**
 * Public Staging UI audit for Claims docs/surveyor. Read-only.
 * node scripts/claims-docs-ui-audit.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-docs-display-audit-2026-09-01');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saUser.data.user.email });
const { data: auth } = await client.auth.verifyOtp({ email: saUser.data.user.email, token: linkData.properties.email_otp, type: 'email' });

const report = { at: new Date().toISOString(), productionTouched: false, mutated: false, checks: [], claims: {} };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

async function run(claimId, viewport, label) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
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
  const errors = [];
  const docsRes = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('response', async (res) => {
    if (res.url().includes('/functions/v1/claims-docs') && res.request().method() === 'POST') {
      const post = res.request().postData() || '';
      const json = await res.json().catch(() => ({}));
      if (post.includes('list_docs')) docsRes.push({ status: res.status(), files: Array.isArray(json.files) ? json.files.length : 0, error: json.error || null, success: json.success });
    }
  });
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.locator('.tbn', { hasText: 'תיקים' }).click();
  await page.waitForTimeout(400);
  await page.locator('input[placeholder="🔎 חיפוש..."]').fill(claimId);
  await page.waitForTimeout(400);
  await page.locator('td', { hasText: claimId }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  const listHit = docsRes.find((d) => d.files > 0) || docsRes[docsRes.length - 1];
  rec(`${label}-${claimId}-list-docs-net`, Boolean(listHit && listHit.success !== false && listHit.files > 0), listHit || { docsRes });

  await page.locator('.ov.open .tab', { hasText: 'מסמכים' }).click();
  await page.waitForTimeout(700);
  const docsText = await page.locator('.ov.open .mb').innerText({ timeout: 15000 });
  const n = Number((/קבצים שהתקבלו \((\d+)\)/.exec(docsText) || [])[1] || 0);
  rec(`${label}-${claimId}-docs-header`, n === (listHit?.files || -1), { n, api: listHit?.files });
  rec(`${label}-${claimId}-docs-not-empty`, !/אין קבצים עדיין/.test(docsText) && n > 0);
  await page.screenshot({ path: join(OUT, `${label}-${claimId}-docs.png`), fullPage: false });

  const galBtn = page.getByRole('button', { name: /הצג גלריה/ });
  const galCount = await galBtn.count();
  if (galCount) {
    await galBtn.first().click();
    await page.waitForTimeout(1500);
  }
  const imgCount = await page.locator('.ov.open .gal-item img').count();
  rec(`${label}-${claimId}-docs-gallery-imgs`, galCount === 0 || imgCount > 0, { galCount, imgCount });
  await page.screenshot({ path: join(OUT, `${label}-${claimId}-docs-gal.png`) });

  await page.locator('.ov.open .tab', { hasText: 'דוח שמאי' }).click();
  await page.waitForTimeout(2000);
  const surv = await page.locator('.ov.open .mb').innerText();
  const photos = Number((/תמונות הדוח \((\d+)\)/.exec(surv) || [])[1] || 0);
  const untagged = Number((/תמונות בתיק \((\d+)\)/.exec(surv) || [])[1] || 0);
  const emptyMarked = /אין דוח שמאי מסומן בתיק/.test(surv);
  const noPdf = /אין קובץ דוח PDF מסומן/.test(surv);
  const survImgs = await page.locator('.ov.open .gal-item img').count();
  rec(`${label}-${claimId}-surveyor-visible`, photos > 0 || untagged > 0 || /דוח שמאי/.test(surv) || /תמונות בתיק/.test(surv));
  rec(`${label}-${claimId}-surveyor-not-blank-if-photos`, (photos === 0 && untagged === 0) || survImgs > 0, { photos, untagged, survImgs, emptyMarked, noPdf, surv: surv.slice(0, 350) });
  await page.screenshot({ path: join(OUT, `${label}-${claimId}-surveyor.png`) });

  await page.locator('.ov.open .tab', { hasText: 'התכתבויות' }).click();
  await page.waitForTimeout(600);
  const gin = await page.locator('.ov.open .mb').innerText();
  const ginN = Number((/התכתבויות \((\d+)\)/.exec(gin) || [])[1] || 0);
  rec(`${label}-${claimId}-imports`, ginN >= 0, { ginN, snippet: gin.slice(0, 200) });

  rec(`${label}-${claimId}-no-console`, errors.filter((e) => !/ResizeObserver/.test(e)).length === 0, { errors: errors.slice(0, 6) });
  report.claims[`${label}:${claimId}`] = { n, apiFiles: listHit?.files, photos, untagged, survImgs, ginN, emptyMarked, noPdf, errors };
  await browser.close();
}

await run('DAL-2026-0004', { width: 1400, height: 900 }, 'desktop');
await run('DAL-2026-0008', { width: 1400, height: 900 }, 'desktop');
await run('DAL-2026-0017', { width: 1400, height: 900 }, 'desktop');
await run('DAL-2026-0004', { width: 390, height: 844 }, 'mobile');

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'ui-audit.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name), claims: report.claims }, null, 2));
process.exit(report.ok ? 0 : 1);
