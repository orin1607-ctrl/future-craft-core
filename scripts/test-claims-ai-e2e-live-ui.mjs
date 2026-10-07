import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'backups', 'qa-shots-claims-ai');
mkdirSync(OUT, { recursive: true });

console.log('--- Step 1: Getting API keys & user ---');
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email || 'orin1607@gmail.com';

const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
const { data: auth } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });

console.log('Authenticated as:', saEmail);
const session = auth.session;

async function run() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    locale: 'he-IL',
    viewport: { width: 1400, height: 900 },
  });

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

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Browser Console Error]: ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.log(`[PAGE_ERROR] ${err.message}`));

  console.log('Navigating to', `${PUBLIC}/claims`);
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);

  // Look for a claim row in the table
  const claimRow = page.locator('.cl-row, tr[data-testid^="claim-row-"], .claims-table tbody tr').first();
  await claimRow.waitFor({ state: 'visible', timeout: 20000 });
  console.log('Found claim row, clicking to open modal...');
  await claimRow.click();
  await page.waitForTimeout(2000);

  // Click on Dalia AI button inside claim card
  const aiButton = page.locator('[data-testid="claims-ai-open-claim"]');
  await aiButton.waitFor({ state: 'visible', timeout: 10000 });
  console.log('Found claims-ai-open-claim button, clicking...');
  await aiButton.click();
  await page.waitForTimeout(2000);

  // Verify workspace is visible
  const workspace = page.locator('[data-testid="claims-ai-workspace"]');
  await workspace.waitFor({ state: 'visible', timeout: 10000 });
  console.log('Workspace is visible!');

  // Check context text
  const contextEl = page.locator('[data-testid="claims-ai-context"]');
  const contextText = await contextEl.textContent();
  console.log('Claim context displayed in AI:', contextText);

  // TEST 1: Ask about photos in claim
  console.log('Test 1: Asking "תראה לי את התמונות בתיק"...');
  const textarea = page.locator('[data-testid="claims-ai-input"]');
  const sendButton = page.locator('[data-testid="claims-ai-send"]');

  await textarea.fill('תראה לי את התמונות בתיק');
  await sendButton.click();

  // Wait for loading indicator to finish
  await page.waitForSelector('[data-testid="claims-ai-loading"]', { state: 'detached', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, '10-photos-query-result.png') });
  console.log('Saved 10-photos-query-result.png');

  const firstReply = await page.locator('[data-testid="claims-ai-thread"] .claims-ai-row.assistant .claims-ai-bubble').first().textContent();
  console.log('First AI reply summary:', firstReply?.slice(0, 150));

  // TEST 2: Trigger status update preview card
  console.log('Test 2: Requesting status update preview...');
  await textarea.fill('עדכן את סטטוס התיק ל-בטיפול מוסך');
  await sendButton.click();

  // Wait for loading indicator to finish
  await page.waitForSelector('[data-testid="claims-ai-loading"]', { state: 'detached', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, '11-preview-card-displayed.png') });
  console.log('Saved 11-preview-card-displayed.png');

  // Check preview card buttons
  const confirmBtn = page.locator('button:has-text("אישור")').first();
  const cancelBtn = page.locator('button:has-text("ביטול")').first();

  const isConfirmVisible = await confirmBtn.isVisible().catch(() => false);
  const isCancelVisible = await cancelBtn.isVisible().catch(() => false);
  console.log(`Action buttons visible: Confirm=${isConfirmVisible}, Cancel=${isCancelVisible}`);

  if (isCancelVisible) {
    console.log('Clicking "ביטול" button...');
    await cancelBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT, '12-preview-card-cancelled.png') });
    console.log('Saved 12-preview-card-cancelled.png');

    const cancelledNotice = page.locator('text=בוטלה').first();
    const isCancelledVisible = await cancelledNotice.isVisible().catch(() => false);
    console.log('Cancellation badge visible:', isCancelledVisible);
  }

  // TEST 3: Ask about the latest email
  console.log('Test 3: Asking about latest email...');
  await textarea.fill('מה המייל האחרון שהתקבל בתיק?');
  await sendButton.click();
  await page.waitForSelector('[data-testid="claims-ai-loading"]', { state: 'detached', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, '13-email-query-result.png') });
  console.log('Saved 13-email-query-result.png');

  await browser.close();
  console.log('=== UI Live Verification Complete! ===');
}

await run();
