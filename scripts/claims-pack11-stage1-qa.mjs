/**
 * Stage 1 QA: mail picker thumbnails + exact selection. No real send.
 * node scripts/claims-pack11-stage1-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-pack11-2026-09-01/stage1-qa');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const report = { at: new Date().toISOString(), productionTouched: false, realEmailSend: false, checks: [], ok: false, base: PUBLIC };

function rec(name, ok, extra = {}) {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(3);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email;

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
  const sendCalls = [];
  page.on('request', (req) => {
    if (req.url().includes('claims-gmail') && req.method() === 'POST') sendCalls.push(req.postData() || '');
  });
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1600);
  const search = page.locator('.claims-root input.fi').first();
  if (await search.count()) {
    await search.fill('0018');
    await page.waitForTimeout(600);
  }
  let row = page.locator('.claims-root .tw tbody tr').filter({ hasText: '0018' }).first();
  if (!(await row.count())) {
    if (await search.count()) {
      await search.fill('0004');
      await page.waitForTimeout(600);
    }
    row = page.locator('.claims-root .tw tbody tr').filter({ hasText: '0004' }).first();
  }
  await row.click();
  await page.waitForTimeout(1000);
  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.waitForTimeout(1200);

  rec(`${name}-modal-open`, await page.locator('[data-testid="mail-to"]').isVisible());
  const thumbs = page.locator('[data-testid^="mail-file-thumb-"]');
  const thumbN = await thumbs.count();
  rec(`${name}-image-thumbs`, thumbN > 0, { thumbN });
  rec(`${name}-thumb-has-img`, thumbN ? await thumbs.first().locator('img').count() > 0 : false);

  const firstBox = page.locator('[data-testid^="mail-file-"]').filter({ hasNot: page.locator('[data-testid^="mail-file-thumb-"], [data-testid^="mail-file-preview-"], [data-testid^="mail-file-row-"]') }).first();
  const fileCbs = page.locator('input[data-testid^="mail-file-"]');
  const nFiles = await fileCbs.count();
  rec(`${name}-files-present`, nFiles > 1, { nFiles });

  if (thumbN) {
    const before = await fileCbs.first().isChecked();
    await page.locator('[data-testid^="mail-file-preview-"]').first().click();
    await page.waitForTimeout(600);
    const previewOpen = await page.locator('.doc-preview-img, .doc-preview-frame').count() > 0;
    rec(`${name}-large-preview`, previewOpen);
    const afterPreview = await fileCbs.first().isChecked();
    rec(`${name}-preview-does-not-select`, afterPreview === before);
    if (previewOpen) await page.getByRole('button', { name: 'סגור תצוגה' }).click().catch(() => undefined);
  } else {
    rec(`${name}-large-preview`, false, { skip: 'no thumbs' });
    rec(`${name}-preview-does-not-select`, false);
  }

  await page.locator('[data-testid="mail-clear-files"]').click();
  await page.waitForTimeout(200);
  if (nFiles >= 2) {
    await fileCbs.nth(0).check();
    await fileCbs.nth(1).check();
    await page.waitForTimeout(400);
    rec(`${name}-select-two`, await fileCbs.nth(0).isChecked() && await fileCbs.nth(1).isChecked());
    const selected = page.locator('[data-testid="mail-selected-list"] [data-testid^="mail-selected-"]');
    rec(`${name}-selected-list-two`, await selected.count() === 2, { n: await selected.count() });
    await fileCbs.nth(1).uncheck();
    await page.waitForTimeout(300);
    rec(`${name}-unselect-one`, await fileCbs.nth(0).isChecked() && !(await fileCbs.nth(1).isChecked()));
    rec(`${name}-selected-list-one`, await selected.count() === 1);
  }

  await page.locator('[data-testid="mail-to"]').fill('pack11-qa@example.com');
  await page.locator('[data-testid="mail-subj"]').fill('Pack11 Stage1 QA — DO NOT SEND');
  const body = page.locator('[data-testid="mail-body"]');
  if (await body.count()) await body.fill('QA body — no send');
  await page.locator('[data-testid="mail-preview-btn"]').click();
  await page.locator('[data-testid="mail-preview"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);
  const prevFiles = page.locator('[data-testid="mail-preview-files"] li');
  rec(`${name}-preview-only-selected`, await prevFiles.count() === 1, { n: await prevFiles.count() });

  await page.screenshot({ path: join(OUT, `${name}.png`) });
  rec(`${name}-no-real-send`, !sendCalls.some((s) => s.includes('send_claim') && s.includes('confirm')));
  await browser.close();
}

await runAt('desktop', { width: 1440, height: 900 });
await runAt('mobile', { width: 390, height: 844 });
report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
