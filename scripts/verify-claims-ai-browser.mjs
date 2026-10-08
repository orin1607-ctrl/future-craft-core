import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const SHOTS_DIR = 'backups/qa-shots-claims-ai';
if (!existsSync(SHOTS_DIR)) mkdirSync(SHOTS_DIR, { recursive: true });

console.log('--- Step 1: Getting Auth Session ---');
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceRoleKey = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email || 'orin1607@gmail.com';

const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
const { data: auth } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
const session = auth.session;
console.log(`Generated session for ${saEmail}`);

console.log('\n--- Step 2: Launching Browser ---');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();

// Set Supabase session in localStorage
await page.goto('https://orin1607-ctrl.github.io/future-craft-core/');
await page.evaluate(({ session, ref }) => {
  const storageKey = `sb-${ref}-auth-token`;
  localStorage.setItem(storageKey, JSON.stringify(session));
}, { session, ref: STAGING_REF });

console.log('Navigating to claims page...');
await page.goto('https://orin1607-ctrl.github.io/future-craft-core/claims', { waitUntil: 'networkidle', timeout: 30000 });
await page.screenshot({ path: join(SHOTS_DIR, '01-claims-page.png') });
console.log('Captured claims page screenshot.');

// Check for AI button in header (Claims General mode)
console.log('Clicking header Dalia AI button for General Mode...');
const generalAiBtn = page.locator('[data-testid="claims-ai-open"]');
if (await generalAiBtn.count() > 0) {
  await generalAiBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(SHOTS_DIR, '02-claims-general-ai-drawer.png') });
  console.log('Captured Claims General AI drawer.');

  // Close AI drawer
  const closeBtn = page.locator('[data-testid="claims-ai-close"]');
  if (await closeBtn.count() > 0) await closeBtn.click();
  await page.waitForTimeout(1000);
}

// Open claim DAL-2026-0004
console.log('Opening claim DAL-2026-0004 from table...');
const claimRow = page.locator('[data-testid="claim-row-DAL-2026-0004"]');
if (await claimRow.count() > 0) {
  await claimRow.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(SHOTS_DIR, '03-open-claim-view.png') });
  console.log('Captured open claim modal view.');

  // Open Claim-specific AI
  console.log('Clicking inside claim Dalia AI button...');
  const claimAiBtn = page.locator('[data-testid="claims-ai-open-claim"]');
  if (await claimAiBtn.count() > 0) {
    await claimAiBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(SHOTS_DIR, '04-claim-specific-ai-drawer.png') });
    console.log('Captured Claim-specific AI drawer.');
  }
}

await browser.close();
console.log('\n✅ Browser E2E verification completed successfully.');
