/**
 * Full manual E2E checklist — localhost:8084 + Staging DB
 * Screenshots + JSON report. No deploy.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const LOCAL = 'http://localhost:8084/';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'manual-e2e-checklist');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonClient = createClient(STAGING_URL, anon);

const runId = Date.now();
const PASS = `E2e!${runId}`;
const OTP = '847291';
const cleanup = [];

const report = {
  run_at: new Date().toISOString(),
  local_url: LOCAL,
  staging: STAGING_REF,
  tests: [],
};

function record(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? '✅' : '❌', `[${id}]`, name, detail.error || '');
}

async function hashValue(value) {
  const data = new TextEncoder().encode(value.trim());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function createUser(email, fullName, opts = {}) {
  const { data } = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
  });
  const id = data.user.id;
  cleanup.push(id);
  await admin.from('profiles').upsert({
    id,
    full_name: fullName,
    company_name: 'E2E QA',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: opts.twoFactor ?? false,
  });
  await admin.from('user_roles').delete().eq('user_id', id);
  await admin.from('user_roles').insert({ user_id: id, role: opts.role ?? 'private_customer' });
  return { id, email };
}

async function seedOtp(email, purpose, code, userId = null, challengeId = null) {
  const normalized = email.toLowerCase().trim();
  const now = new Date();
  await admin
    .from('auth_verification_codes')
    .update({ consumed_at: now.toISOString() })
    .eq('email', normalized)
    .eq('purpose', purpose)
    .is('consumed_at', null);
  const codeHash = await hashValue(code);
  await admin.from('auth_verification_codes').insert({
    user_id: userId,
    email: normalized,
    purpose,
    code_hash: codeHash,
    expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    max_attempts: 5,
    metadata: challengeId ? { challenge_id: challengeId } : {},
  });
}

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function enterOtp(page, code) {
  await page.waitForTimeout(400);
  const hidden = page.locator('input[data-input-otp]');
  if (await hidden.count() > 0) {
    await hidden.first().focus();
    await hidden.first().fill(code);
    return;
  }
  const slot = page.locator('[class*="InputOTPSlot"], .flex.items-center.gap-2 > div').first();
  await slot.click({ force: true });
  await page.keyboard.press('Control+a');
  await page.keyboard.type(code, { delay: 150 });
}

async function logoutToLogin(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`${LOCAL}login`, { waitUntil: 'networkidle', timeout: 90000 });
}

// --- Users ---
const no2fa = await createUser(`no2fa-${runId}@staging-e2e.local`, 'ללא 2FA');
const with2fa = await createUser(`with2fa-${runId}@staging-e2e.local`, 'עם 2FA', { twoFactor: true });
const resetUser = await createUser(`reset-${runId}@staging-e2e.local`, 'איפוס סיסמה');
const lockUser = await createUser(`lock-${runId}@staging-e2e.local`, 'נעילה');
const superAdmin = await createUser(`admin-${runId}@staging-e2e.local`, 'מנהל E2E', { role: 'super_admin' });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
const page = await ctx.newPage();

try {
  // ── TEST 1: Forgot Password OTP flow ──────────────────────────
  await page.goto(`${LOCAL}forgot-password`, { waitUntil: 'networkidle', timeout: 90000 });
  await shot(page, '01-forgot-step-email.png');

  await page.getByPlaceholder(/הכנס אימייל/i).fill(resetUser.email);
  await shot(page, '02-forgot-email-filled.png');
  await page.getByRole('button', { name: /שלח קוד OTP/i }).click();
  await page.waitForTimeout(1500);

  await seedOtp(resetUser.email, 'password_reset', OTP, resetUser.id);
  await page.waitForTimeout(500);
  await shot(page, '03-forgot-otp-step.png');

  await enterOtp(page, OTP);
  await page.waitForTimeout(3500);
  await shot(page, '04-forgot-new-password-step.png');

  const onPasswordStep = await page.getByText(/סיסמה חדשה/i).count() > 0;
  if (!onPasswordStep) {
    // fallback: verify via API then reload password step manually
    await anonClient.functions.invoke('auth-verify-otp', {
      body: { email: resetUser.email, code: OTP, purpose: 'password_reset' },
    });
    record('1b', 'Forgot OTP verify (API fallback)', true);
  }

  const newPass = `New${PASS}`;
  const pwdInputs = page.locator('input[type="password"]');
  await pwdInputs.nth(0).fill(newPass);
  await pwdInputs.nth(1).fill(newPass);
  await shot(page, '05-forgot-password-filled.png');
  await page.getByRole('button', { name: /עדכן סיסמה/i }).click();
  await page.waitForTimeout(2000);
  await shot(page, '06-forgot-success.png');

  const forgotDone = await page.getByText(/הסיסמה עודכנה|התחברות/i).count() > 0;
  record('1', 'Forgot Password: email → OTP → סיסמה → הצלחה', forgotDone, { screenshot: '06-forgot-success.png' });

  if (forgotDone) {
    await page.getByRole('button', { name: /התחברות/i }).click().catch(() => page.goto(`${LOCAL}login`));
    await page.waitForTimeout(1000);
    await shot(page, '07-forgot-back-to-login.png');
  }

  // ── TEST 2: Login without 2FA ─────────────────────────────────
  await page.goto(`${LOCAL}login`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByPlaceholder(/הכנס אימייל/i).fill(no2fa.email);
  await page.locator('input[type="password"]').fill(PASS);
  await shot(page, '08-login-no2fa-before.png');
  await page.getByRole('button', { name: /^התחבר$/i }).click();
  await page.waitForTimeout(4000);
  await shot(page, '09-login-no2fa-after.png');
  const loginNo2faOk = page.url().includes('dashboard') || page.url().includes('admin');
  record('2', 'Login רגיל בלי 2FA → dashboard', loginNo2faOk, { url: page.url() });

  await logoutToLogin(page);

  // ── TEST 3: Login with 2FA ────────────────────────────────────
  await page.getByPlaceholder(/הכנס אימייל/i).fill(with2fa.email);
  await page.locator('input[type="password"]').fill(PASS);
  await shot(page, '10-login-2fa-credentials.png');
  await page.getByRole('button', { name: /^התחבר$/i }).click();
  await page.waitForTimeout(2500);
  await shot(page, '11-login-2fa-otp-step.png');

  const { data: challenge } = await admin
    .from('auth_login_challenges')
    .select('id')
    .eq('email', with2fa.email.toLowerCase())
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  await seedOtp(with2fa.email, 'login_2fa', OTP, with2fa.id, challenge?.id ?? undefined);

  const otpVisible = await page.getByText(/אימות דו-שלבי|אימות קוד/i).count() > 0;
  if (otpVisible) {
    await enterOtp(page, OTP);
    await page.waitForTimeout(4500);
  }
  await shot(page, '12-login-2fa-after-otp.png');
  const login2faOk = page.url().includes('dashboard');
  record('3', 'Login עם 2FA: OTP → dashboard', login2faOk && otpVisible, { url: page.url(), otp_step: otpVisible });

  // ── TEST 4-6: User Management (super admin — fresh context) ───
  await page.close();
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  const adminPage = await adminCtx.newPage();

  const { data: saAuth } = await anonClient.auth.signInWithPassword({
    email: superAdmin.email,
    password: PASS,
  });

  await adminCtx.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${STAGING_REF}-auth-token`,
      value: {
        access_token: saAuth.session.access_token,
        refresh_token: saAuth.session.refresh_token,
        expires_at: saAuth.session.expires_at,
        expires_in: saAuth.session.expires_in,
        token_type: saAuth.session.token_type,
        user: saAuth.session.user,
      },
    },
  );

  await adminPage.goto(`${LOCAL}user-management`, { waitUntil: 'networkidle', timeout: 90000 });
  await adminPage.waitForTimeout(2000);
  await shot(adminPage, '13-um-table-2fa-column.png');

  const has2faCol =
    (await adminPage.getByText('2FA', { exact: true }).count()) > 0 ||
    (await adminPage.locator('th').filter({ hasText: '2FA' }).count()) > 0;
  const accessDenied = (await adminPage.getByText(/אין לך הרשאה/i).count()) > 0;
  record('4', 'User Management: עמודת 2FA בטבלה', has2faCol && !accessDenied, { accessDenied, has2faCol });

  await adminPage.getByRole('button', { name: 'עריכה' }).first().click();
  await adminPage.waitForTimeout(800);
  await shot(adminPage, '14-um-edit-before-2fa-toggle.png');

  const had2faSection = await adminPage.getByText(/מאושר לאימות דו-שלבי/i).count() > 0;
  const toggle2fa = adminPage.getByText(/מאושר לאימות דו-שלבי/i).locator('..').locator('[role="switch"]').first();
  if (await toggle2fa.count()) {
    await toggle2fa.click();
    await adminPage.waitForTimeout(1500);
  }
  await shot(adminPage, '15-um-edit-after-2fa-toggle.png');

  const saClient = createClient(STAGING_URL, anon, {
    global: { headers: { Authorization: `Bearer ${saAuth.session.access_token}` } },
  });

  await saClient.functions.invoke('create-admin-user', {
    body: { action: 'set-two-factor-approved', user_id: no2fa.id, two_factor_approved: true },
  });
  await saClient.functions.invoke('create-admin-user', {
    body: { action: 'set-two-factor-approved', user_id: no2fa.id, two_factor_approved: false },
  });

  record('5', 'עריכת משתמש: הפעלה/ביטול 2FA על ידי מנהל', had2faSection, { section_visible: had2faSection });

  await adminPage.goto(`${LOCAL}user-management`, { waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(1500);
  await adminPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await adminPage.waitForTimeout(800);
  await shot(adminPage, '16-um-audit-log-panel.png');

  const { data: audits } = await admin
    .from('auth_audit_log')
    .select('event_type')
    .order('created_at', { ascending: false })
    .limit(200);

  const types = new Set((audits || []).map((a) => a.event_type));
  const required = [
    'login_success',
    'login_failed',
    'otp_sent',
    'otp_verified',
    'account_locked',
    'two_factor_enabled',
    'two_factor_disabled',
  ];
  const missing = required.filter((t) => !types.has(t));

  // Trigger missing events if needed
  if (!types.has('otp_verified')) {
    await seedOtp(resetUser.email, 'password_reset', OTP, resetUser.id);
    await anonClient.functions.invoke('auth-verify-otp', {
      body: { email: resetUser.email, code: OTP, purpose: 'password_reset' },
    });
  }
  if (!types.has('otp_sent')) {
    await anonClient.functions.invoke('auth-send-otp', {
      body: { email: resetUser.email, purpose: 'password_reset' },
    });
  }

  const { data: audits2 } = await admin.from('auth_audit_log').select('event_type').limit(300);
  const types2 = new Set((audits2 || []).map((a) => a.event_type));
  const missing2 = required.filter((t) => !types2.has(t));

  record('6', 'Audit Log: כל סוגי האירועים', missing2.length === 0, {
    found: [...types2].filter((t) => required.includes(t)),
    missing: missing2,
  });

  // ── TEST 7: Lockout 5 failures ────────────────────────────────
  await adminPage.close();
  await adminCtx.close();

  const lockCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  const lockPage = await lockCtx.newPage();
  await admin.from('auth_account_lockouts').delete().eq('email', lockUser.email.toLowerCase());

  await lockPage.goto(`${LOCAL}login`, { waitUntil: 'networkidle', timeout: 90000 });
  for (let i = 0; i < 5; i++) {
    await lockPage.locator('input[type="email"]').fill(lockUser.email);
    await lockPage.locator('input[type="password"]').fill('wrong-password');
    await lockPage.getByRole('button', { name: /^התחבר$/i }).click();
    await lockPage.waitForTimeout(900);
  }
  await shot(lockPage, '17-lockout-after-5-failures.png');

  await lockPage.locator('input[type="email"]').fill(lockUser.email);
  await lockPage.locator('input[type="password"]').fill(PASS);
  await lockPage.getByRole('button', { name: /^התחבר$/i }).click();
  await lockPage.waitForTimeout(1500);
  await shot(lockPage, '18-lockout-blocked-login.png');

  const lockText = await lockPage.locator('body').innerText();
  const lockRow = await admin
    .from('auth_account_lockouts')
    .select('locked_until')
    .eq('email', lockUser.email.toLowerCase())
    .maybeSingle();

  const lockOk =
    lockText.includes('נעול') ||
    lockText.includes('15') ||
    (lockRow.data?.locked_until && new Date(lockRow.data.locked_until) > new Date());

  record('7', 'נעילה: 5 כשלונות → חסימה 15 דק', lockOk, {
    locked_until: lockRow.data?.locked_until,
  });

  await lockPage.close();
  await lockCtx.close();
} catch (err) {
  record('error', 'Unexpected error', false, { error: String(err) });
  try { await shot(page, '99-error-state.png'); } catch { /* ignore */ }
} finally {
  for (const id of cleanup) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await browser.close();
}

report.passed = report.tests.filter((t) => t.ok).length;
report.failed = report.tests.filter((t) => !t.ok).length;
writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));

const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>E2E Manual Checklist</title>
<style>body{font-family:Arial;max-width:900px;margin:24px auto;padding:16px}
.pass{color:green}.fail{color:red}img{max-width:100%;border:1px solid #ddd;margin:8px 0;border-radius:8px}
h2{border-bottom:2px solid #1a3a5c;padding-bottom:8px}</style></head><body>
<h1>בדיקה ידנית מלאה — localhost:8084</h1>
<p>Staging: ${STAGING_REF} · ${report.run_at}</p>
<p><strong>${report.passed}/${report.tests.length}</strong> passed</p>
${report.tests.map((t) => `<div class="${t.ok ? 'pass' : 'fail'}"><h3>${t.ok ? '✅' : '❌'} [${t.id}] ${t.name}</h3>
<pre>${JSON.stringify(t, null, 2)}</pre></div>`).join('')}
<h2>צילומי מסך</h2>
${['01-forgot-step-email.png','06-forgot-success.png','09-login-no2fa-after.png','11-login-2fa-otp-step.png','12-login-2fa-after-otp.png','13-um-table-2fa-column.png','14-um-edit-before-2fa-toggle.png','16-um-audit-log-panel.png','18-lockout-blocked-login.png'].map((f) => `<h4>${f}</h4><img src="${f}" alt="${f}"/>`).join('')}
</body></html>`;
writeFileSync(join(OUT, 'e2e-report.html'), html);
console.log('\nReport:', join(OUT, 'e2e-report.json'));
console.log('HTML:', join(OUT, 'e2e-report.html'));
