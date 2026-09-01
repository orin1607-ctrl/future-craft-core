/**
 * Direct-mail pack UI QA on DAL-2026-0014. No real send.
 * node scripts/claims-direct-mail-ui-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-direct-mail-2026-09-01/ui-qa');
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

async function open0014(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1600);
  const search = page.locator('.claims-root input.fi').first();
  if (await search.count()) {
    await search.fill('0014');
    await page.waitForTimeout(800);
  }
  const row = page.locator('.claims-root .tw tbody tr').filter({ hasText: '0014' }).first();
  await row.click();
  await page.waitForTimeout(1200);
}

async function runAt(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await inject(ctx);
  const page = await ctx.newPage();
  const sendBodies = [];
  page.on('request', (req) => {
    if (req.url().includes('claims-gmail') && req.method() === 'POST') sendBodies.push(req.postData() || '');
  });
  await open0014(page);

  await page.getByRole('button', { name: 'מסמכים' }).click();
  await page.waitForTimeout(900);
  rec(`${name}-source-gmail-he`, (await page.getByText('התקבל במייל').count()) > 0);
  rec(`${name}-file-shortage-pdf`, (await page.getByText('עדכון מצב מסמכים צג.pdf').count()) > 0);
  rec(`${name}-file-letter-pdf`, (await page.getByText('שרות-מכתב ללקוח.pdf').count()) > 0);
  rec(`${name}-related-select`, (await page.locator('[data-testid^="doc-edit-"]').count()) > 0);
  await page.locator('[data-testid^="doc-edit-"]').first().click().catch(() => null);
  await page.waitForTimeout(400);
  rec(`${name}-related-manual`, (await page.getByText('קשור למסמך (ידני)').count()) > 0);

  await page.getByRole('button', { name: 'התכתבויות' }).click();
  await page.waitForTimeout(900);
  rec(`${name}-direct-subject`, (await page.getByText('בקשה להשלמת מסמכים').count()) > 0);
  rec(`${name}-reply-btn`, (await page.locator('[data-testid^="mail-reply-"]').count()) > 0);
  rec(`${name}-forward-btn`, (await page.locator('[data-testid^="mail-forward-"]').count()) > 0);

  const reply = page.locator('[data-testid^="mail-reply-"]').first();
  await reply.scrollIntoViewIfNeeded();
  await reply.click();
  await page.locator('[data-testid="mail-from"]').waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
  const toVal = await page.locator('[data-testid="mail-to"]').inputValue().catch(() => '');
  const subj = await page.locator('[data-testid="mail-subj"]').inputValue().catch(() => '');
  rec(`${name}-reply-to`, /5555555\.co\.il/i.test(toVal), { toVal: toVal.slice(0, 80) });
  rec(`${name}-reply-re`, /^Re:/i.test(subj), { subj: subj.slice(0, 80) });
  rec(`${name}-reply-thread`, (await page.getByText('תגובה לאותו Thread').count()) > 0);
  await page.locator('.ov.open .mcl').last().click({ timeout: 4000 }).catch(() => null);
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: 'התכתבויות' }).click().catch(() => null);
  const fwd = page.locator('[data-testid^="mail-forward-"]').first();
  await fwd.scrollIntoViewIfNeeded();
  await fwd.click();
  await page.locator('[data-testid="mail-from"]').waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
  const fwdTo = await page.locator('[data-testid="mail-to"]').inputValue().catch(() => '');
  const fwdSubj = await page.locator('[data-testid="mail-subj"]').inputValue().catch(() => '');
  rec(`${name}-forward-empty-to`, fwdTo.trim() === '', { fwdTo });
  rec(`${name}-forward-fwd`, /^Fwd:/i.test(fwdSubj), { fwdSubj: fwdSubj.slice(0, 80) });
  rec(`${name}-preview-before-send`, await page.locator('[data-testid="mail-preview-btn"]').isVisible());
  rec(`${name}-send-disabled-without-preview`, await page.locator('[data-testid="mail-send-btn"]').isDisabled());
  await page.locator('.ov.open .mcl').last().click({ timeout: 4000 }).catch(() => null);
  await page.waitForTimeout(400);

  const suggest = page.locator('[data-testid^="suggest-reply-"]').first();
  if (await suggest.count()) {
    await suggest.scrollIntoViewIfNeeded();
    await suggest.click();
    const opened = await page.locator('[data-testid="mail-from"]').waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false);
    rec(`${name}-suggest-opens`, opened);
    rec(`${name}-suggest-no-confirm-send`, opened ? !(await page.locator('[data-testid="mail-confirm-send"]').isVisible().catch(() => false)) : false);
    await page.locator('.ov.open .mcl').last().click({ timeout: 4000 }).catch(() => null);
  } else rec(`${name}-suggest-opens`, false);

  await page.getByRole('button', { name: 'משימות' }).click();
  await page.waitForTimeout(800);
  rec(`${name}-mail-task`, (await page.getByText('השלמת מסמכים לפי הבקשה במייל').count()) > 0);
  rec(`${name}-needs-review`, (await page.getByText('דורש בדיקת עובד').count()) > 0);
  rec(`${name}-task-internal-note`, (await page.getByText('הערה פנימית למשימה').count()) > 0);
  rec(`${name}-goto-mail`, (await page.locator('[data-testid^="task-goto-mail-"]').count()) > 0);

  const sent = sendBodies.filter((b) => /"action"\s*:\s*"send_claim"/.test(b) && /"confirm"\s*:\s*true/.test(b));
  rec(`${name}-no-real-send`, sent.length === 0, { n: sent.length });
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => null);
  await browser.close();
}

await runAt('desktop', { width: 1440, height: 900 });
await runAt('mobile', { width: 390, height: 844 });
report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
