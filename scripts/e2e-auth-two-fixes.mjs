/**
 * Targeted E2E — Forgot Password success + Lockout Hebrew UI only.
 * localhost:8084 + Staging DB. No deploy.
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

const LOCKOUT_MSG =
  'החשבון ננעל זמנית ל־15 דקות בגלל מספר ניסיונות התחברות כושלים. נסה שוב מאוחר יותר או פנה למנהל מערכת.';

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const runId = Date.now();
const PASS = `E2e!${runId}`;
const OTP = '847291';
const cleanup = [];

async function hashValue(value) {
  const data = new TextEncoder().encode(value.trim());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function createUser(email, fullName) {
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
    two_factor_approved: false,
  });
  await admin.from('user_roles').delete().eq('user_id', id);
  await admin.from('user_roles').insert({ user_id: id, role: 'private_customer' });
  return { id, email };
}

async function seedOtp(email, purpose, code, userId = null) {
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
    metadata: {},
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

const resetUser = await createUser(`reset-fix-${runId}@staging-e2e.local`, 'איפוס סיסמה');
const lockUser = await createUser(`lock-fix-${runId}@staging-e2e.local`, 'נעילה');

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
const page = await ctx.newPage();
const results = [];

try {
  // ── Fix 1: Forgot Password success screen ─────────────────────
  await page.goto(`${LOCAL}forgot-password`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByPlaceholder(/הכנס אימייל/i).fill(resetUser.email);
  await page.getByRole('button', { name: /שלח קוד OTP/i }).click();
  await page.waitForTimeout(1500);

  await seedOtp(resetUser.email, 'password_reset', OTP, resetUser.id);
  await page.waitForTimeout(500);
  await enterOtp(page, OTP);
  await page.waitForTimeout(3500);

  const newPass = `New${PASS}`;
  const pwdInputs = page.locator('input[type="password"]');
  await pwdInputs.nth(0).fill(newPass);
  await pwdInputs.nth(1).fill(newPass);
  await page.getByRole('button', { name: /עדכן סיסמה/i }).click();
  await page.getByText('הסיסמה עודכנה בהצלחה').waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /חזרה להתחברות/i }).waitFor({ timeout: 5000 });
  await shot(page, '06-forgot-success.png');

  const body1 = await page.locator('body').innerText();
  const fix1Ok =
    body1.includes('הסיסמה עודכנה בהצלחה') && body1.includes('חזרה להתחברות');
  results.push({ id: '1', name: 'Forgot Password success screen', ok: fix1Ok });

  // ── Fix 2: Lockout Hebrew message ─────────────────────────────
  await admin.from('auth_account_lockouts').delete().eq('email', lockUser.email.toLowerCase());
  await page.goto(`${LOCAL}login`, { waitUntil: 'networkidle', timeout: 90000 });

  for (let i = 0; i < 5; i++) {
    await page.locator('input[type="email"]').fill(lockUser.email);
    await page.locator('input[type="password"]').fill('wrong-password');
    await page.getByRole('button', { name: /^התחבר$/i }).click();
    await page.waitForTimeout(900);
  }

  await page.locator('input[type="email"]').fill(lockUser.email);
  await page.locator('input[type="password"]').fill(PASS);
  await page.getByRole('button', { name: /^התחבר$/i }).click();
  await page.waitForTimeout(2000);
  await shot(page, '18-lockout-blocked-login.png');

  const body2 = await page.locator('body').innerText();
  const fix2Ok = body2.includes(LOCKOUT_MSG) && !body2.includes('non-2xx');
  results.push({ id: '2', name: 'Lockout Hebrew UI message', ok: fix2Ok, shown: body2.slice(0, 500) });
} catch (err) {
  results.push({ id: 'error', name: 'Unexpected error', ok: false, error: String(err) });
  await shot(page, '99-two-fixes-error.png').catch(() => {});
} finally {
  for (const id of cleanup) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await browser.close();
}

for (const r of results) {
  console.log(r.ok ? '✅' : '❌', `[${r.id}]`, r.name, r.error || '');
}
writeFileSync(join(OUT, 'e2e-two-fixes-report.json'), JSON.stringify({ run_at: new Date().toISOString(), results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
