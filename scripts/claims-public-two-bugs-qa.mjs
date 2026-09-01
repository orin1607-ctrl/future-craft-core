/**
 * Public Staging QA after the two critical bugfixes. No real Gmail send.
 * node scripts/claims-public-two-bugs-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-two-bugs-2026-09-01');
mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), productionTouched: false, realEmailSendAttempted: false, base: PUBLIC, checks: [] };
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

try {
  const deployTxt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt`).then((r) => r.text());
  rec('public-bundle-ref', /feat\/incident-alerts-staging/.test(deployTxt), { deployTxt: deployTxt.trim() });
} catch (e) {
  rec('public-bundle-ref', false, { error: String(e) });
}

const st = await invoke('claims-gmail', { action: 'status' });
rec('gmail-connected', st.json?.connected === true, { email: st.json?.email, sendEnabled: st.json?.sendEnabled });
rec('gmail-send-enabled', st.json?.sendEnabled === true, st.json?.sendEnabled);
const validateExt = await invoke('claims-gmail', {
  action: 'validate_claim_send',
  claim_id: 'DAL-2026-0018',
  to: 'qa-preview-only@example.com',
  subject: 'בדיקת validate בלבד',
  body: 'אין שליחה.',
  file_ids: [],
});
rec('validate-external-ok', validateExt.json?.success === true && validateExt.json?.error !== 'recipient_not_allowlisted', {
  error: validateExt.json?.error,
});
const noConfirm = await invoke('claims-gmail', {
  action: 'send_claim',
  confirm: false,
  claim_id: 'DAL-2026-0018',
  to: 'qa-preview-only@example.com',
  subject: 'no send',
  body: 'no send',
  file_ids: [],
  idempotency_key: 'qa-no-send-2',
});
rec('confirm-still-required', noConfirm.json?.error === 'confirm_required', noConfirm.json?.error);

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

async function runAt(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await inject(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  rec(`${name}-loaded`, await page.getByText('ניהול תביעות').count() > 0);
  const dashBtn = page.locator('.ph-a button', { hasText: 'תיק חדש' });
  if (await dashBtn.count()) await dashBtn.click();
  else await page.getByRole('button', { name: /תיק חדש/ }).last().click();
  await page.waitForTimeout(700);
  const open = await page.evaluate(() => {
    const ov = document.querySelector('[data-testid="claims-new-modal"]') || [...document.querySelectorAll('.ov')].find((el) => (el.textContent || '').includes('פתיחת תיק חדש'));
    return ov ? getComputedStyle(ov).display !== 'none' : false;
  });
  rec(`${name}-modal-open`, open);
  rec(`${name}-form-visible`, await page.locator('[data-testid="intake-name"]').isVisible().catch(() => false));
  rec(`${name}-no-setFormKind`, !errors.some((e) => /setFormKind/.test(e)), { errors: errors.slice(0, 6) });
  if (await page.locator('[data-testid="intake-name"]').isVisible().catch(() => false)) {
    await page.locator('[data-testid="intake-name"]').fill('TEST-INTAKE PUBLIC QA');
    rec(`${name}-can-type`, (await page.locator('[data-testid="intake-name"]').inputValue()) === 'TEST-INTAKE PUBLIC QA');
    rec(`${name}-save-btn`, await page.getByRole('button', { name: /שמור/ }).count() > 0);
  } else {
    rec(`${name}-can-type`, false);
    rec(`${name}-save-btn`, false);
  }
  await page.screenshot({ path: join(OUT, `${name}-new-claim.png`) });
  if (open) await page.keyboard.press('Escape').catch(() => {});
  await page.locator('.ov.open .mcl').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);

  if (name === 'desktop') {
    await page.locator('text=TEST-INTAKE לקוח').first().click({ timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(800);
    const mailBtn = page.locator('[data-testid="claims-send-mail"]');
    if (await mailBtn.count()) {
      await mailBtn.click();
      await page.waitForTimeout(600);
      rec('mail-no-test-copy', (await page.getByText('שליחה חיה כבויה').count()) === 0 && (await page.getByText('שליחת TEST').count()) === 0);
      rec('mail-real-copy', (await page.getByText('שליחה ידנית אמיתית').count()) > 0);
      await page.locator('[data-testid="mail-to"]').fill('qa-preview-only@example.com');
      await page.locator('[data-testid="mail-subj"]').fill('QA preview only');
      await page.locator('[data-testid="mail-body"]').fill('אין שליחה אמיתית ב-QA זה.');
      await page.locator('[data-testid="mail-preview-btn"]').click();
      await page.waitForTimeout(1200);
      rec('mail-preview', await page.locator('[data-testid="mail-preview"]').count() > 0);
      const sendBtn = page.locator('[data-testid="mail-send-btn"]');
      rec('mail-send-enabled', await sendBtn.isEnabled());
      if (await sendBtn.isEnabled()) await sendBtn.click();
      await page.waitForTimeout(400);
      rec('mail-confirm-ui', await page.locator('[data-testid="mail-confirm"]').count() > 0);
      rec('did-not-confirm-send', true);
    } else {
      rec('mail-no-test-copy', false);
      rec('mail-real-copy', false);
      rec('mail-preview', false);
      rec('mail-send-enabled', false);
      rec('mail-confirm-ui', false);
      rec('did-not-confirm-send', true);
    }
  }
  await browser.close();
}

await runAt('desktop', { width: 1280, height: 900 });
await runAt('mobile', { width: 390, height: 844 });

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
process.exit(report.ok ? 0 : 1);
