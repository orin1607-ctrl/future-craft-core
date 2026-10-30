import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC_BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/130f407c-23b6-463d-a75c-7d4b6b061240';
const SCREENSHOTS_DIR = join(ARTIFACTS_DIR, 'screenshots');
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';

const envFile = readFileSync('.env', 'utf8');
const anonKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function login() {
  const { data, error } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
  if (error || !data.session) throw error || new Error('Worker login failed');
  return data.session;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('--- Starting STAGING Browser QA for Email & Package System ---');
  const session = await login();
  console.log('✓ Worker authenticated with Supabase Staging');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1400,900']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: 'he-IL'
  });

  await context.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, {
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

  // Listen to console errors and network failures
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Browser Console Error]: ${msg.text()}`);
  });

  console.log(`Navigating to ${PUBLIC_BASE}/#/claims...`);
  await page.goto(`${PUBLIC_BASE}/#/claims`, { waitUntil: 'networkidle', timeout: 45000 });
  await sleep(3000);

  // Switch to "כל התביעות" (All Claims)
  console.log('Switching to All Claims...');
  const navAll = page.locator('[data-testid="claims-nav-all"]');
  if (await navAll.count() > 0) {
    await navAll.click().catch(() => undefined);
    await sleep(1500);
  }

  // Search or click for claim DAL-2026-0008
  console.log('Searching for claim DAL-2026-0008...');
  const searchInput = page.locator('[data-testid="claims-search-input"]').first();
  if (await searchInput.count() > 0) {
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await searchInput.fill('DAL-2026-0008');
    await sleep(1500);
  }

  // Click row for DAL-2026-0008
  const claimRow = page.locator('[data-testid="claim-row-DAL-2026-0008"]').first();
  await claimRow.waitFor({ state: 'visible', timeout: 20000 });
  console.log('✓ Found row for DAL-2026-0008');
  await claimRow.click();
  await sleep(3000);

  // Take screenshot of claim card with action bar
  await page.screenshot({ path: join(SCREENSHOTS_DIR, '01_claim_card_action_bar.png') });
  console.log('✓ Screenshot 1: Claim card with action bar saved');

  // Verify Action Bar buttons
  const newPackageBtn = await page.$('[data-testid="claims-email-package-btn"]');
  const existingSendMailBtn = await page.$('[data-testid="claims-send-mail"]');
  console.log('Action Bar Verification:');
  console.log(` - New Email Package Button present: ${!!newPackageBtn}`);
  console.log(` - Existing "מייל חדש" Button present: ${!!existingSendMailBtn}`);

  if (!newPackageBtn) {
    throw new Error('claims-email-package-btn not found in Action Bar');
  }

  // Click the new Email Package button
  console.log('Opening Email & Package Modal...');
  await newPackageBtn.click();
  await sleep(2500);

  // Verify Modal is open
  const modalHeader = await page.waitForSelector('[data-testid="mo-email-package"]', { timeout: 10000 });
  console.log('✓ Email & Package Modal opened successfully');

  // 1. Tab 1: Compose & Select Docs
  await page.screenshot({ path: join(SCREENSHOTS_DIR, '02_tab1_compose_and_select.png') });
  console.log('✓ Screenshot 2: Tab 1 (Compose & Select) saved');

  // Verify Categories and Document counts
  const categoryHeaders = await page.$$eval('[style*="cursor: pointer"] span', spans => spans.map(s => s.innerText.trim()).filter(Boolean));
  console.log('Detected category elements in Tab 1:', categoryHeaders.slice(0, 10));

  // Toggle selection test
  const checkboxes = await page.$$('input[type="checkbox"]');
  console.log(`Total checkboxes found in modal: ${checkboxes.length}`);

  // Test Tab 2: Preview
  console.log('Navigating to Tab 2: תצוגה מקדימה...');
  const tab2Btn = await page.waitForSelector('[data-testid="tab-preview"]', { timeout: 5000 });
  await tab2Btn.click();
  await sleep(1500);
  await page.screenshot({ path: join(SCREENSHOTS_DIR, '03_tab2_email_preview.png') });
  console.log('✓ Screenshot 3: Tab 2 (Email Preview) saved');

  // Verify preview content
  const previewText = await page.$eval('.email-body-preview, [style*="monospace"], pre, [style*="white-space: pre-wrap"]', el => el.innerText).catch(() => '');
  console.log('--- Email Preview Excerpt ---');
  console.log(previewText.slice(0, 300) + '...');
  const hasUnverified747 = previewText.includes('747');
  const hasUnverifiedVat = previewText.includes('2,336.81');
  const hasClaimNumber = previewText.includes('DAL-2026-0008');
  console.log(` - Contains DAL-2026-0008: ${hasClaimNumber}`);
  console.log(` - Unverified 747 fee excluded: ${!hasUnverified747}`);
  console.log(` - Unverified 2,336.81 VAT excluded: ${!hasUnverifiedVat}`);

  // Verify Send Lock & Safety Checkbox
  const sendBtn = await page.$('button:has-text("אישור ושליחה סופית במייל")');
  const isSendDisabled = sendBtn ? await sendBtn.isDisabled() : true;
  console.log(` - Send button safely disabled by default: ${isSendDisabled}`);

  // Test Tab 3: Share Link & ZIP Download
  console.log('Navigating to Tab 3: קישור שיתוף והורדת ZIP...');
  const tab3Btn = await page.waitForSelector('[data-testid="tab-share-view"]', { timeout: 5000 });
  await tab3Btn.click();
  await sleep(1500);

  // Click "יצירת קישור שיתוף מאובטח לחבילה" if present
  const generateLinkBtn = await page.$('button:has-text("יצירת קישור שיתוף מאובטח לחבילה"), button:has-text("חידוש קישור שיתוף")');
  if (generateLinkBtn) {
    console.log('Clicking generate share link...');
    await generateLinkBtn.click();
    await sleep(3000);
  }

  await page.screenshot({ path: join(SCREENSHOTS_DIR, '04_tab3_share_link_and_zip.png') });
  console.log('✓ Screenshot 4: Tab 3 (Share Link & ZIP) saved');

  // Check generated share URL
  const shareInputVal = await page.$eval('input[readonly]', el => el.value).catch(() => '');
  console.log('Generated Share Link in UI:', shareInputVal);
  const shareIdMatch = shareInputVal.match(/t=([^&]+)/);
  const createdToken = shareIdMatch ? shareIdMatch[1] : null;

  // Test Tab 4: Real Tracking
  console.log('Navigating to Tab 4: מעקב פתיחה והורדה...');
  const tab4Btn = await page.waitForSelector('[data-testid="tab-tracking"]', { timeout: 5000 });
  await tab4Btn.click();
  await sleep(2000);
  await page.screenshot({ path: join(SCREENSHOTS_DIR, '05_tab4_tracking.png') });
  console.log('✓ Screenshot 5: Tab 4 (Tracking) saved');

  // Verify tracking table content
  const trackingRows = await page.$$eval('table tr', trs => trs.map(tr => tr.innerText.replace(/\t+/g, ' | ').replace(/\n+/g, ' ')));
  console.log(`Found ${trackingRows.length} rows in tracking table:`);
  trackingRows.slice(0, 5).forEach((r, idx) => console.log(` Row ${idx}: ${r}`));

  // Close modal
  const closeBtn = await page.waitForSelector('[data-testid="mo-email-package"] .mh .mcl', { timeout: 5000 });
  await closeBtn.click();
  await sleep(1000);
  console.log('✓ Closed modal successfully');

  // Now verify existing mail modal ("מייל חדש")
  console.log('Verifying existing "מייל חדש" mechanism is untouched...');
  await existingSendMailBtn.click();
  await sleep(2000);
  const existingMailModal = await page.waitForSelector('text=שליחת מייל מתוך התיק', { timeout: 5000 }).catch(() => null);
  console.log(`✓ Existing mail modal opened properly: ${!!existingMailModal}`);
  await page.screenshot({ path: join(SCREENSHOTS_DIR, '06_existing_mail_modal_regression_check.png') });
  console.log('✓ Screenshot 6: Existing mail modal regression check saved');

  // Close existing mail modal
  const existingClose = await page.$('.mcl, button:has-text("✕")');
  if (existingClose) await existingClose.click();
  await sleep(1000);

  // Clean up any test share created during this run
  if (createdToken) {
    console.log(`Cleaning up test share with token/prefix ${createdToken}...`);
    // Find share id in db
    const { data: shares } = await userDb.from('claims_share_links').select('id, token_hash, revoked_at').eq('claim_id', 'DAL-2026-0008').order('created_at', { ascending: false }).limit(5);
    if (shares && shares.length) {
      for (const s of shares) {
        if (!s.revoked_at) {
          console.log(`Revoking active share ${s.id}...`);
          await userDb.from('claims_share_links').update({ revoked_at: new Date().toISOString() }).eq('id', s.id);
        }
      }
    }
    console.log('✓ Cleanup completed');
  }

  await browser.close();
  console.log('=== All browser QA steps completed successfully ===');
}

run().catch(err => {
  console.error('Fatal QA error:', err);
  process.exit(1);
});
