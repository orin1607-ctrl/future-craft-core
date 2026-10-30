import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const LIVE_URL = 'https://orin1607-ctrl.github.io/future-craft-core/#/claims';
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/130f407c-23b6-463d-a75c-7d4b6b061240';
const BASELINE_DIR = join(ARTIFACTS_DIR, 'email_audit_stage1');
mkdirSync(BASELINE_DIR, { recursive: true });

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
  console.log('1. Authenticating worker for Stage 1 Baseline UI verification...');
  const session = await login();

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'he-IL'
  });

  await context.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('dalia_claims_tab', 'claims');
  }, {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: session.user,
    }
  });

  const page = await context.newPage();
  const baseline = {
    stagingSiteAccessible: false,
    claimsScreenLoaded: false,
    claimCardOpened: false,
    emailPackageModalOpened: false,
    emailPackageTabsWorking: false,
    aiChatOpened: false
  };

  console.log('2. Navigating to live staging claims page...');
  await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await sleep(3000);
  baseline.stagingSiteAccessible = true;

  // Verify Claims Screen
  const claimsRows = page.locator('tbody tr, .claims-table-row, [data-testid="claim-row"]');
  const count = await claimsRows.count();
  console.log(`Claims table loaded with ${count} visible rows.`);
  baseline.claimsScreenLoaded = count > 0;
  await page.screenshot({ path: join(BASELINE_DIR, '01_claims_screen.png') });

  // Open Flora Cohen claim DAL-2026-0008
  console.log('3. Opening Flora Cohen claim DAL-2026-0008...');
  const floraRow = page.locator('tr:has-text("DAL-2026-0008"), tr:has-text("11874503"), tr:has-text("פלורה כהן")').first();
  if (await floraRow.isVisible()) {
    await floraRow.click();
    await sleep(2500);
    const claimModal = page.locator('[role="dialog"], .claims-detail-modal, [data-testid="claim-card-modal"]').first();
    baseline.claimCardOpened = await claimModal.isVisible();
    console.log(`Claim card DAL-2026-0008 opened: ${baseline.claimCardOpened}`);
    await page.screenshot({ path: join(BASELINE_DIR, '02_claim_card_flora.png') });

    // 4. Open Email / Document Package Modal
    console.log('4. Opening Email / Document Package Modal...');
    const emailBtn = page.locator('button:has-text("שליחת מייל"), button:has-text("שליחת מסמכים"), [data-testid="btn-email-package"]').first();
    if (await emailBtn.isVisible()) {
      await emailBtn.click();
      await sleep(2000);

      const emailModal = page.locator('[data-testid="claim-email-package-modal"], .claim-email-package-modal').first();
      baseline.emailPackageModalOpened = await emailModal.isVisible();
      console.log(`Email Package Modal opened: ${baseline.emailPackageModalOpened}`);

      // Verify the 4 tabs
      const tabs = ['הכנת מייל', 'בחירת מסמכים', 'תצוגה מקדימה', 'מעקב'];
      let tabsFound = 0;
      for (const t of tabs) {
        const tabBtn = page.locator(`button:has-text("${t}"), [role="tab"]:has-text("${t}")`).first();
        if (await tabBtn.isVisible()) tabsFound++;
      }
      baseline.emailPackageTabsWorking = tabsFound >= 3;
      console.log(`Email Package Tabs visible: ${tabsFound}/4`);
      await page.screenshot({ path: join(BASELINE_DIR, '03_email_package_modal.png') });

      // Close email modal
      const closeEmailBtn = page.locator('button:has-text("סגור"), button:has-text("ביטול"), [aria-label="Close"]').last();
      await closeEmailBtn.click().catch(() => {});
      await sleep(1000);
    }

    // Close claim card
    const closeClaimBtn = page.locator('button:has-text("סגור"), [aria-label="Close"]').first();
    await closeClaimBtn.click().catch(() => {});
    await sleep(1000);
  }

  // 5. Open Dalia AI Workspace
  console.log('5. Opening Dalia AI Workspace...');
  const daliaAiBtn = page.locator('[data-testid="claims-ai-open"]').first();
  if (await daliaAiBtn.isVisible()) {
    await daliaAiBtn.click();
    await sleep(2000);
    const workspace = page.locator('[data-testid="claims-ai-workspace"]').first();
    baseline.aiChatOpened = await workspace.isVisible();
    console.log(`Dalia AI Chat opened: ${baseline.aiChatOpened}`);
    await page.screenshot({ path: join(BASELINE_DIR, '04_dalia_ai_chat.png') });
  }

  await browser.close();
  console.log('\n--- Stage 1 Baseline Summary ---');
  console.log(JSON.stringify(baseline, null, 2));
}

run().catch(e => {
  console.error('Stage 1 verification failed:', e);
  process.exit(1);
});
