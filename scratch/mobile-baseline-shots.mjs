import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC_BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/130f407c-23b6-463d-a75c-7d4b6b061240';
const BEFORE_DIR = join(ARTIFACTS_DIR, 'mobile_before');
mkdirSync(BEFORE_DIR, { recursive: true });

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
    console.log(`\n=== Testing Mobile Viewport ${w}x800 ===`);
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
    await page.goto(`${PUBLIC_BASE}/#/claims`, { waitUntil: 'networkidle', timeout: 45000 });
    await sleep(2500);

    // 1. Top Filter Bar Shot
    await page.screenshot({ path: join(BEFORE_DIR, `before_${w}_01_top_filters.png`) });
    console.log(`✓ Shot: before_${w}_01_top_filters.png`);

    // Switch to All Claims and search DAL-2026-0008
    const navAll = page.locator('[data-testid="claims-nav-all"]');
    if (await navAll.count() > 0) {
      await navAll.click().catch(() => undefined);
      await sleep(1000);
    }

    const searchInput = page.locator('[data-testid="claims-search-input"]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('DAL-2026-0008');
      await sleep(1000);
    }

    // 2. Open Claim Card
    const claimRow = page.locator('[data-testid="claim-row-DAL-2026-0008"]').first();
    await claimRow.waitFor({ state: 'visible', timeout: 15000 });
    await claimRow.click();
    await sleep(2500);

    await page.screenshot({ path: join(BEFORE_DIR, `before_${w}_02_claim_card.png`) });
    console.log(`✓ Shot: before_${w}_02_claim_card.png`);

    // 3. Open Financial Audit Modal
    const auditBtn = page.locator('[data-testid="claims-audit-btn"]');
    if (await auditBtn.count() > 0) {
      await auditBtn.click();
      await sleep(2000);
      await page.screenshot({ path: join(BEFORE_DIR, `before_${w}_03_audit_modal.png`) });
      console.log(`✓ Shot: before_${w}_03_audit_modal.png`);
      // Close audit modal
      const closeAudit = page.locator('[data-testid="cfa-close-btn"], .cfa-close-btn, .modal .mcl').first();
      if (await closeAudit.count() > 0) await closeAudit.click();
      await sleep(1000);
    }

    // 4. Open Email Package Modal
    const emailPkgBtn = page.locator('[data-testid="claims-email-package-btn"]');
    if (await emailPkgBtn.count() > 0) {
      await emailPkgBtn.click();
      await sleep(2000);
      await page.screenshot({ path: join(BEFORE_DIR, `before_${w}_04_email_package_tab1.png`) });
      console.log(`✓ Shot: before_${w}_04_email_package_tab1.png`);

      // Tab 2
      const tab2 = page.locator('[data-testid="tab-preview"]');
      if (await tab2.count() > 0) {
        await tab2.click();
        await sleep(1000);
        await page.screenshot({ path: join(BEFORE_DIR, `before_${w}_05_email_package_tab2.png`) });
      }

      // Close email package modal
      const closePkg = page.locator('[data-testid="mo-email-package"] .mcl').first();
      if (await closePkg.count() > 0) await closePkg.click();
      await sleep(1000);
    }

    await context.close();
  }

  await browser.close();
  console.log('=== Mobile Baseline Shots Finished ===');
}

run().catch(console.error);
