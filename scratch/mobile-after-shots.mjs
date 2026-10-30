import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const LOCAL_BASE = 'http://127.0.0.1:5173';
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/130f407c-23b6-463d-a75c-7d4b6b061240';
const AFTER_DIR = join(ARTIFACTS_DIR, 'mobile_after');
mkdirSync(AFTER_DIR, { recursive: true });

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
  const session = await login();
  console.log('✓ Worker authenticated');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const widths = [360, 390, 430];

  for (const w of widths) {
    console.log(`\n========================================`);
    console.log(`=== Testing AFTER Mobile Viewport ${w}x800 ===`);
    console.log(`========================================`);

    const context = await browser.newContext({
      viewport: { width: w, height: 800 },
      isMobile: true,
      hasTouch: true,
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
    await page.goto(`${LOCAL_BASE}/#/claims`, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2500);

    // 1. Test Filter Buttons Clicking & Display
    console.log(`[Viewport ${w}px] Testing Filter Buttons...`);
    const btnInsurance = page.locator('[data-testid="filter-insurance-cases"]');
    const btnGarage = page.locator('[data-testid="filter-garage-cases"]');
    const btnAll = page.locator('[data-testid="filter-all-cases"]');

    // Click "רק תיקי תביעות"
    await btnInsurance.click();
    await sleep(1000);
    const isInsuranceActive = (await btnInsurance.getAttribute('class'))?.includes('active');
    console.log(` - Click "רק תיקי תביעות" -> active: ${isInsuranceActive}`);

    // Capture screenshot of filter bar with "רק תיקי תביעות" active
    await page.screenshot({ path: join(AFTER_DIR, `after_${w}_01_filter_insurance_active.png`) });

    // Click "תיקי מוסך"
    await btnGarage.click();
    await sleep(1000);
    const isGarageActive = (await btnGarage.getAttribute('class'))?.includes('active');
    console.log(` - Click "תיקי מוסך" -> active: ${isGarageActive}`);

    // Click "כל התיקים"
    await btnAll.click();
    await sleep(1000);
    const isAllActive = (await btnAll.getAttribute('class'))?.includes('active');
    console.log(` - Click "כל התיקים" -> active: ${isAllActive}`);

    // Return to "רק תיקי תביעות" to open DAL-2026-0008
    await btnInsurance.click();
    await sleep(1000);

    // Ensure we are in all-claims mode
    const navAll = page.locator('[data-testid="claims-nav-all"]');
    if (await navAll.count() > 0) {
      await navAll.click().catch(() => undefined);
      await sleep(1000);
    }

    // Search DAL-2026-0008
    const searchInput = page.locator('[data-testid="claims-search-input"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('DAL-2026-0008');
      await sleep(1500);
    }

    // 2. Open Claim Card
    console.log(`[Viewport ${w}px] Opening Claim Card DAL-2026-0008...`);
    const claimRow = page.locator('[data-testid="claim-row-DAL-2026-0008"]').first();
    await claimRow.waitFor({ state: 'visible', timeout: 15000 });
    await claimRow.click();
    await sleep(2500);

    await page.screenshot({ path: join(AFTER_DIR, `after_${w}_02_claim_card.png`) });
    console.log(`✓ Shot: after_${w}_02_claim_card.png`);

    // 3. Open Financial Audit Modal
    console.log(`[Viewport ${w}px] Opening Financial Audit Modal...`);
    const auditBtn = page.locator('[data-testid="claims-card-financial-audit-btn"]');
    if (await auditBtn.count() > 0) {
      await auditBtn.click();
      await sleep(2000);
      await page.screenshot({ path: join(AFTER_DIR, `after_${w}_03_audit_modal.png`) });
      console.log(`✓ Shot: after_${w}_03_audit_modal.png`);

      // Close audit modal
      const closeAudit = page.locator('.cfa-close-btn').first();
      if (await closeAudit.count() > 0) await closeAudit.click();
      await sleep(1000);
    } else {
      console.log('⚠ Audit button not found');
    }

    // 4. Open Email Package Modal
    console.log(`[Viewport ${w}px] Opening Email Package Modal...`);
    const emailPkgBtn = page.locator('[data-testid="claims-email-package-btn"]');
    if (await emailPkgBtn.count() > 0) {
      await emailPkgBtn.click();
      await sleep(2500);

      // Tab 1: Docs View
      await page.screenshot({ path: join(AFTER_DIR, `after_${w}_04_email_pkg_tab1_docs.png`) });
      console.log(`✓ Shot: after_${w}_04_email_pkg_tab1_docs.png`);

      // Tab 1: Details View (toggle subnav)
      const subnavDetails = page.locator('[data-testid="mobile-subnav-details"]');
      if (await subnavDetails.count() > 0) {
        await subnavDetails.click();
        await sleep(1000);
        await page.screenshot({ path: join(AFTER_DIR, `after_${w}_05_email_pkg_tab1_details.png`) });
        console.log(`✓ Shot: after_${w}_05_email_pkg_tab1_details.png`);
      }

      // Tab 2: Preview
      const tab2 = page.locator('[data-testid="tab-preview"]');
      if (await tab2.count() > 0) {
        await tab2.click();
        await sleep(1000);
        await page.screenshot({ path: join(AFTER_DIR, `after_${w}_06_email_pkg_tab2_preview.png`) });
        console.log(`✓ Shot: after_${w}_06_email_pkg_tab2_preview.png`);
      }

      // Tab 3: Share & ZIP
      const tab3 = page.locator('[data-testid="tab-share-view"]');
      if (await tab3.count() > 0) {
        await tab3.click();
        await sleep(1000);
        await page.screenshot({ path: join(AFTER_DIR, `after_${w}_07_email_pkg_tab3_zip.png`) });
        console.log(`✓ Shot: after_${w}_07_email_pkg_tab3_zip.png`);
      }

      // Tab 4: Tracking
      const tab4 = page.locator('[data-testid="tab-tracking"]');
      if (await tab4.count() > 0) {
        await tab4.click();
        await sleep(1000);
        await page.screenshot({ path: join(AFTER_DIR, `after_${w}_08_email_pkg_tab4_tracking.png`) });
        console.log(`✓ Shot: after_${w}_08_email_pkg_tab4_tracking.png`);
      }

      // Close modal
      const closePkg = page.locator('[data-testid="mo-email-package"] .mcl').first();
      if (await closePkg.count() > 0) await closePkg.click();
      await sleep(1000);
    }

    await context.close();
  }

  await browser.close();
  console.log('=== All Mobile AFTER Tests Completed Successfully ===');
}

run().catch(console.error);
