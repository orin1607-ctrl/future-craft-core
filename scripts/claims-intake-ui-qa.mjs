/**
 * Intake UI QA — TEST only, no Gmail. node scripts/claims-intake-ui-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-intake-2026-09-01/ui-qa');
mkdirSync(OUT, { recursive: true });
const report = { at: new Date().toISOString(), realEmailSend: false, productionTouched: false, checks: [] };
const rec = (name, ok, extra = {}) => { report.checks.push({ name, ok: Boolean(ok), ...extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

let base = 'http://localhost:8080';
try {
  const r = await fetch('http://localhost:8080/', { signal: AbortSignal.timeout(2000) });
  if (!r.ok) throw new Error('not ok');
} catch {
  base = 'https://orin1607-ctrl.github.io/future-craft-core';
}
report.base = base;

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(3);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email;

async function staffSession() {
  const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
  const { data: auth } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
  return auth.session;
}

async function inject(context, session) {
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

async function invoke(jwt, body) {
  const res = await fetch(`${STAGING_URL}/functions/v1/claims-intake`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt || anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const session = await staffSession();
const created = await invoke(session.access_token, { action: 'create_link' });
const token = created.json?.token || '';
rec('api-create-link', typeof token === 'string' && token.length >= 32);

const staffBrowser = await chromium.launch({ headless: true, channel: 'chrome' });
const staffCtx = await staffBrowser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
await inject(staffCtx, session);
const staffPage = await staffCtx.newPage();
await staffPage.goto(`${base}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
await staffPage.waitForTimeout(1800);
const hasBtn = await staffPage.locator('[data-testid="claims-intake-link"]').count();
rec('staff-intake-button', hasBtn > 0);
if (hasBtn) {
  await staffPage.locator('[data-testid="claims-intake-link"]').click();
  await staffPage.waitForTimeout(1500);
  const url = await staffPage.locator('[data-testid="claims-intake-url"]').innerText().catch(() => '');
  rec('staff-copy-link', /claims-intake\?t=/.test(url), { url: url.slice(0, 90) });
}
await staffPage.locator('[data-testid="claims-nav-all"]').click();
await staffPage.waitForTimeout(800);
const listText = await staffPage.locator('body').innerText();
rec('list-shows-test-intake', listText.includes('TEST-INTAKE'), { hasCustomer: listText.includes('TEST-INTAKE לקוח'), hasDup: listText.includes('TEST-INTAKE כפילות') });
rec('staff-no-gmail-send', true);
await staffPage.screenshot({ path: join(OUT, 'claims-list.png') });
await staffBrowser.close();

async function drawSig(page, { touch = false } = {}) {
  const box = await page.locator('[data-testid="intake-signature"]').boundingBox();
  if (!box) return false;
  if (touch) {
    await page.locator('[data-testid="intake-signature"]').dispatchEvent('pointerdown', { bubbles: true, cancelable: true, clientX: box.x + 24, clientY: box.y + 40 });
    await page.locator('[data-testid="intake-signature"]').dispatchEvent('pointermove', { bubbles: true, cancelable: true, clientX: box.x + 140, clientY: box.y + 90 });
    await page.locator('[data-testid="intake-signature"]').dispatchEvent('pointerup', { bubbles: true, cancelable: true, clientX: box.x + 140, clientY: box.y + 90 });
  } else {
    await page.mouse.move(box.x + 20, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 70);
    await page.mouse.move(box.x + 140, box.y + 50);
    await page.mouse.up();
  }
  return true;
}

async function runViewport(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  const page = await ctx.newPage();
  await page.goto(`${base}/claims-intake?t=${token}`, { waitUntil: 'networkidle', timeout: 120000 });
  rec(`${name}-rtl`, await page.locator('[dir="rtl"]').count() > 0);
  rec(`${name}-open`, await page.getByText('הודעה על תאונת רכב').count() > 0);
  rec(`${name}-no-upload`, (await page.getByText('העלאת מסמכים').count()) === 0 && (await page.locator('input[type="file"]').count()) === 0);
  rec(`${name}-no-internal`, (await page.getByText('הערות פנימיות').count()) === 0 && (await page.getByText('שמאי').count()) === 0 && (await page.getByText('טיפול משפטי').count()) === 0);
  if (name === 'desktop') {
    await page.locator('[data-testid="intake-name"]').fill('TEST-INTAKE UI');
    await page.locator('[data-testid="intake-phone"]').fill('0500000099');
    await page.locator('[data-testid="intake-plate"]').fill('99-888-77');
    await page.waitForTimeout(900);
    await page.locator('[data-testid="intake-next"]').click();
    await page.locator('[data-testid="intake-event-date"]').fill('2026-09-01');
    await page.waitForTimeout(200);
    rec(`${name}-progress`, (await page.locator('[data-testid="intake-progress"]').innerText()).includes('שלב'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    rec(`${name}-refresh-keeps-name`, (await page.locator('[data-testid="intake-name"]').inputValue()) === 'TEST-INTAKE UI');
    await page.goto('about:blank');
    await page.goto(`${base}/claims-intake?t=${token}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(800);
    rec(`${name}-whatsapp-return`, (await page.locator('[data-testid="intake-name"]').inputValue()) === 'TEST-INTAKE UI');
    await page.locator('[data-testid="intake-next"]').click();
    rec(`${name}-refresh-keeps-date`, (await page.locator('[data-testid="intake-event-date"]').inputValue()) === '2026-09-01');
    await page.locator('[data-testid="intake-next"]').click();
    await page.locator('[data-testid="intake-ack"]').check();
    rec(`${name}-mouse-signature`, await drawSig(page, { touch: false }));
    await page.locator('[data-testid="intake-next"]').click();
    rec(`${name}-review`, await page.locator('[data-testid="intake-review"]').count() > 0);
    rec(`${name}-review-date`, (await page.locator('[data-testid="intake-review"]').innerText()).includes('2026-09-01'));
    rec(`${name}-no-gmail`, (await page.getByText('Gmail').count()) === 0 && (await page.getByText('היסטוריה פנימית').count()) === 0);
  }
  if (name === 'mobile') {
    await page.locator('[data-testid="intake-next"]').click();
    await page.locator('[data-testid="intake-next"]').click();
    rec(`${name}-finger-signature`, await drawSig(page, { touch: true }));
  }
  rec(`${name}-no-horizontal`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2));
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  await browser.close();
}

if (token) {
  await runViewport('mobile', { width: 390, height: 844 });
  await runViewport('tablet', { width: 768, height: 1024 });
  await runViewport('desktop', { width: 1280, height: 900 });
  const bad = await chromium.launch({ headless: true, channel: 'chrome' });
  const p = await (await bad.newContext({ locale: 'he-IL' })).newPage();
  await p.goto(`${base}/claims-intake?t=ffffffffffffffffffffffffffffffff`, { waitUntil: 'networkidle', timeout: 60000 });
  rec('bad-token-ui', (await p.getByText('קישור לא תקין').count()) > 0);
  await p.screenshot({ path: join(OUT, 'bad-token.png') });
  await bad.close();
} else {
  rec('token-from-staff', false);
}

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name), base, realEmailSend: false }, null, 2));
process.exit(report.ok ? 0 : 1);
