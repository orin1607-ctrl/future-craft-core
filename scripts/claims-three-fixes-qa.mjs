/**
 * Public Staging QA: email LTR, customer intake mobile, single new-claim button.
 * Real Gmail send ONLY to yoni19111977@gmail.com. Staging only.
 * node scripts/claims-three-fixes-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const TO = 'yoni19111977@gmail.com';
const CLAIM = 'DAL-2026-0018';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-three-fixes-2026-09-01');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  fullMerge: false,
  to: TO,
  claim: CLAIM,
  send: null,
  checks: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(3);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email;
const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
const { data: auth } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
const jwt = auth.session.access_token;

async function invoke(fn, body) {
  const res = await fetch(`${STAGING_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const deployTxt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt`).then((r) => r.text()).catch((e) => String(e));
report.deployTxt = String(deployTxt).trim();
rec('public-staging-only', /feat\/incident-alerts-staging/.test(deployTxt) && !/production/i.test(deployTxt), { deployTxt: report.deployTxt });

const counts = await admin.from('vehicles').select('id', { count: 'exact', head: true });
const acc = await admin.from('accidents').select('id', { count: 'exact', head: true });
rec('vehicles-untouched', counts.count === 437, { vehicles: counts.count });
rec('accidents-untouched', acc.count === 11, { accidents: acc.count });

async function inject(context) {
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

async function overflowMetrics(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
}

async function runClaimsUi(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await inject(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  rec(`${name}-loaded`, (await page.getByText('ניהול תביעות').count()) > 0);
  const newCount = await page.getByRole('button', { name: /תיק חדש/ }).count();
  rec(`${name}-one-new-button`, newCount === 1, { newCount });
  rec(`${name}-toolbar-new`, (await page.locator('[data-testid="claims-open-new"]').count()) === 1);
  rec(`${name}-no-dash-new`, (await page.locator('[data-testid="claims-open-new-dash"]').count()) === 0);
  rec(`${name}-no-list-new`, (await page.locator('[data-testid="claims-open-new-list"]').count()) === 0);
  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForTimeout(700);
  rec(`${name}-modal-open`, await page.locator('[data-testid="claims-new-modal"].open').count() > 0 || await page.locator('[data-testid="intake-name"]').isVisible());
  rec(`${name}-form-visible`, await page.locator('[data-testid="intake-name"]').isVisible().catch(() => false));
  rec(`${name}-no-setFormKind`, !errors.some((e) => /setFormKind/.test(e)), { errors: errors.slice(0, 4) });
  await page.screenshot({ path: join(OUT, `${name}-new-claim.png`) });
  await page.locator('.ov.open .mcl').first().click({ timeout: 4000 }).catch(() => {});
  await browser.close();
}

await runClaimsUi('desktop', { width: 1280, height: 900 });
await runClaimsUi('mobile', { width: 390, height: 844 });

const created = await invoke('claims-intake', { action: 'create_link' });
const token = created.json?.token || '';
rec('create-customer-link', typeof token === 'string' && token.length >= 32);
const publicUrl = `${PUBLIC}/claims-intake?t=${token}`;
report.publicIntakeUrl = publicUrl.replace(token, token.slice(0, 8) + '…');

async function runIntake(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 800, hasTouch: viewport.width < 800 });
  const page = await ctx.newPage();
  await page.goto(publicUrl, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1200);
  rec(`${name}-intake-loaded`, await page.locator('[data-testid="intake-progress"]').count() > 0);
  rec(`${name}-brand`, (await page.getByText('ניהול תביעות').count()) > 0);
  rec(`${name}-single-h1`, (await page.locator('h1').count()) === 1);
  const ov = await overflowMetrics(page);
  rec(`${name}-no-hscroll`, !ov.overflowX, ov);
  const nextH = await page.locator('[data-testid="intake-next"]').evaluate((el) => el.getBoundingClientRect().height).catch(() => 0);
  rec(`${name}-next-large`, nextH >= 44, { nextH });
  await page.locator('[data-testid="intake-name"]').fill('TEST QA MOBILE');
  await page.locator('[data-testid="intake-phone"]').fill('0501112233');
  await page.locator('[data-testid="intake-plate"]').fill('12-345-67');
  await page.screenshot({ path: join(OUT, `${name}-intake-client.png`) });
  await page.locator('[data-testid="intake-next"]').click();
  await page.waitForTimeout(400);
  rec(`${name}-event-step`, await page.locator('[data-testid="intake-event-date"]').isVisible().catch(() => false));
  await page.locator('[data-testid="intake-event-date"]').fill('2026-08-01');
  await page.locator('[data-testid="intake-next"]').click();
  await page.waitForTimeout(400);
  rec(`${name}-sign-step`, await page.locator('[data-testid="intake-ack"]').count() > 0);
  await page.locator('[data-testid="intake-ack"]').check();
  const box = await page.locator('[data-testid="intake-signature"]').boundingBox();
  if (box) {
    await page.mouse.move(box.x + 30, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 90);
    await page.mouse.up();
  }
  rec(`${name}-finger-sign`, Boolean(box));
  await page.screenshot({ path: join(OUT, `${name}-intake-sign.png`) });
  await page.locator('[data-testid="intake-next"]').click();
  await page.waitForTimeout(400);
  rec(`${name}-review`, await page.locator('[data-testid="intake-review"]').count() > 0);
  const ov2 = await overflowMetrics(page);
  rec(`${name}-review-no-hscroll`, !ov2.overflowX, ov2);
  await page.screenshot({ path: join(OUT, `${name}-intake-review.png`) });
  await browser.close();
}

await runIntake('phone390', { width: 390, height: 844 });
await runIntake('android412', { width: 412, height: 915 });
await runIntake('tablet768', { width: 768, height: 1024 });
await runIntake('intake-desktop', { width: 1280, height: 900 });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
await inject(ctx);
const page = await ctx.newPage();
const sendRes = [];
page.on('response', async (res) => {
  if (res.url().includes('/functions/v1/claims-gmail') && res.request().method() === 'POST') {
    const json = await res.json().catch(() => ({}));
    const post = res.request().postData() || '';
    sendRes.push({ action: /"action":"([^"]+)"/.exec(post)?.[1], status: res.status(), json });
  }
});
await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(1600);
await page.getByText(CLAIM).first().click({ timeout: 12000 });
await page.waitForTimeout(900);
rec('opened-test-claim', await page.locator('[data-testid="claims-send-mail"]').count() > 0);
await page.locator('[data-testid="claims-send-mail"]').click();
await page.waitForTimeout(700);
await page.locator('[data-testid="mail-to"]').fill(TO);
const toDir = await page.locator('[data-testid="mail-to"]').evaluate((el) => el.getAttribute('dir'));
const toVal = await page.locator('[data-testid="mail-to"]').inputValue();
rec('mail-to-ltr', toDir === 'ltr');
rec('mail-to-keeps-address', toVal === TO, { toVal });
await page.locator('[data-testid="mail-subj"]').fill(`TEST QA SEND ${CLAIM} ${new Date().toISOString()}`);
await page.locator('[data-testid="mail-body"]').fill('בדיקת שליחה אמיתית מאושרת לכתובת הבדיקה בלבד. אין נמענים נוספים.');
await page.locator('[data-testid="mail-preview-btn"]').click();
await page.waitForTimeout(1500);
rec('mail-preview', await page.locator('[data-testid="mail-preview"]').count() > 0);
const invalidToast = await page.getByText(/כתובת To לא תקינה|כתובת שגויה|כתובת To\/CC לא תקינה/).count();
rec('no-invalid-address-toast', invalidToast === 0, { invalidToast });
const sendBtn = page.locator('[data-testid="mail-send-btn"]');
rec('send-enabled', await sendBtn.isEnabled());
await sendBtn.click();
await page.waitForTimeout(500);
await page.locator('[data-testid="mail-ack"]').check();
await page.locator('[data-testid="mail-confirm-send"]').click();
await page.waitForTimeout(8000);
const sentCall = sendRes.find((s) => s.action === 'send_claim' && s.json?.success === true);
report.send = sentCall?.json || sendRes[sendRes.length - 1]?.json || null;
rec('gmail-success', Boolean(sentCall?.json?.success), report.send);
rec('gmail-to', String(sentCall?.json?.to || '').toLowerCase().includes(TO), { to: sentCall?.json?.to });
rec('gmail-message-id', Boolean(sentCall?.json?.gmail_message_id), { id: sentCall?.json?.gmail_message_id });
rec('gmail-thread-id', Boolean(sentCall?.json?.gmail_thread_id), { id: sentCall?.json?.gmail_thread_id });
await page.screenshot({ path: join(OUT, 'mail-after-send.png') });
await browser.close();

if (sentCall?.json?.gmail_message_id) {
  const { data: outbox } = await admin.from('claims_gmail_outbox').select('*').eq('gmail_message_id', sentCall.json.gmail_message_id);
  rec('outbox-one', (outbox || []).length === 1, { n: (outbox || []).length });
  const { data: hist } = await admin.from('claims_history').select('id, row_data').eq('claim_id', CLAIM).order('created_at', { ascending: false }).limit(8);
  rec('history-logged', (hist || []).some((h) => String(h.row_data?.gmail_message_id || '') === sentCall.json.gmail_message_id || /נשלח מייל/.test(String(h.row_data?.action || ''))));
  const { data: comm } = await admin.from('claims_comm_log').select('id, row_data').eq('claim_id', CLAIM).order('created_at', { ascending: false }).limit(8);
  rec('comm-logged', (comm || []).some((h) => String(h.row_data?.gmail_message_id || '') === sentCall.json.gmail_message_id || String(h.row_data?.email || '').toLowerCase().includes(TO)));
  rec('duplicate-one-outbox-row', (outbox || []).length === 1);
}

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  ok: report.ok,
  fail: report.checks.filter((c) => c.ok === false).map((c) => c.name),
  messageId: report.send?.gmail_message_id,
  threadId: report.send?.gmail_thread_id,
  to: report.send?.to,
  subject: report.send?.subject,
}, null, 2));
process.exit(report.ok ? 0 : 1);
