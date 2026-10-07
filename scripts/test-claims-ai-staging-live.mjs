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

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

// Find super admin user
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email;

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
  const consoleLogs = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));

  console.log('Navigating to', `${PUBLIC}/claims`);
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: join(OUT, '01-claims-screen.png') });
  console.log('Saved 01-claims-screen.png');

  // Look for a claim row in the table
  const claimRow = page.locator('.cl-row, tr[data-testid^="claim-row-"], .claims-table tbody tr').first();
  await claimRow.waitFor({ state: 'visible', timeout: 15000 });
  console.log('Found claim row, clicking to open modal...');
  await claimRow.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: join(OUT, '02-claim-card-modal.png') });
  console.log('Saved 02-claim-card-modal.png');

  // Click on Dalia AI button inside claim card
  const aiButton = page.locator('[data-testid="claims-ai-open-claim"]');
  await aiButton.waitFor({ state: 'visible', timeout: 10000 });
  console.log('Found claims-ai-open-claim button, clicking...');
  await aiButton.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: join(OUT, '03-claims-ai-workspace-opened.png') });
  console.log('Saved 03-claims-ai-workspace-opened.png');

  // Verify workspace is visible
  const workspace = page.locator('[data-testid="claims-ai-workspace"]');
  const wsVisible = await workspace.isVisible();
  console.log('Workspace visible:', wsVisible);

  // Check context text
  const contextEl = page.locator('[data-testid="claims-ai-context"]');
  const contextText = await contextEl.textContent();
  console.log('Claim context displayed in AI:', contextText);

  // Type question
  const question = 'על איזה תיק אני עובד עכשיו?';
  const textarea = page.locator('[data-testid="claims-ai-input"]');
  await textarea.fill(question);
  await page.screenshot({ path: join(OUT, '04-question-typed.png') });

  // Click send
  const sendButton = page.locator('[data-testid="claims-ai-send"]');
  console.log('Clicking send...');
  await sendButton.click();

  // Wait for loading to finish and response to appear
  console.log('Waiting for AI response...');
  await page.waitForSelector('[data-testid="claims-ai-thread"] .claims-ai-row.assistant', { timeout: 30000 });
  // Wait until loading indicator disappears
  await page.waitForSelector('[data-testid="claims-ai-loading"]', { state: 'detached', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  await page.screenshot({ path: join(OUT, '05-ai-response-received.png') });
  console.log('Saved 05-ai-response-received.png');

  const assistantBubble = page.locator('[data-testid="claims-ai-thread"] .claims-ai-row.assistant .claims-ai-bubble').first();
  const replyText = await assistantBubble.textContent();
  console.log('=== AI REPLY IN UI ===\n', replyText, '\n======================');

  // Check if error bubble appeared
  const errorBubble = page.locator('[data-testid="claims-ai-error"]');
  const hasError = await errorBubble.isVisible().catch(() => false);
  if (hasError) {
    const errorText = await errorBubble.textContent();
    console.error('Error banner visible in UI:', errorText);
  }

  // TEST REFRESH PERSISTENCE
  console.log('Testing refresh persistence...');
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);

  // Re-open the same claim row
  const claimRowAfterReload = page.locator('.cl-row, tr[data-testid^="claim-row-"], .claims-table tbody tr').first();
  await claimRowAfterReload.click();
  await page.waitForTimeout(1500);

  // Click Dalia AI button
  await page.locator('[data-testid="claims-ai-open-claim"]').click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: join(OUT, '06-after-refresh.png') });
  console.log('Saved 06-after-refresh.png');

  // Verify the conversation and assistant reply still exist!
  const rowsAfter = await page.locator('[data-testid="claims-ai-thread"] .claims-ai-row').count();
  const assistantBubbleAfter = page.locator('[data-testid="claims-ai-thread"] .claims-ai-row.assistant .claims-ai-bubble').first();
  const replyAfter = (await assistantBubbleAfter.isVisible()) ? await assistantBubbleAfter.textContent() : '';

  console.log('Messages count after refresh:', rowsAfter);
  console.log('Assistant message preserved after refresh:', replyAfter.slice(0, 100));

  await browser.close();

  const success = !hasError && replyText && replyText.length > 10 && rowsAfter > 0;
  console.log('TEST RESULT:', success ? 'PASSED ✅' : 'FAILED ❌');
}

await run();
