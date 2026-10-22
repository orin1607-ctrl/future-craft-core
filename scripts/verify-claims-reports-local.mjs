// scripts/verify-claims-reports-local.mjs
// Local verification script for Claims Reports Hub and Unified Cases Filter.
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const REF = 'usfeoerkpcafxxlyuldl';
const URL = `https://${REF}.supabase.co`;
const OUT = 'C:/Users/אליאב/.gemini/antigravity/brain/88ba5372-3049-43c2-938b-80dddc42cbe1';

if (!fs.existsSync(OUT)) {
  fs.mkdirSync(OUT, { recursive: true });
}

// 1. Get auth token
console.log('Fetching auth token for staging user...');
const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const admin = createClient(URL, serviceKey);

const email = 'orin1607@gmail.com';
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (linkErr) throw linkErr;
const { data: auth, error: authErr } = await createClient(URL, anonKey).auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: 'magiclink',
});
if (authErr) throw authErr;

// 2. Start vite preview server
const PORT = 4179;
console.log(`Starting preview server on port ${PORT}...`);
const preview = spawn('cmd.exe', ['/c', `bun x vite preview --port ${PORT} --strictPort`], {
  cwd: 'C:/Users/אליאב/Projects/oren-garage-flow-staging',
  stdio: 'pipe',
});

preview.stdout.on('data', (d) => console.log('[preview stdout]', d.toString().trim()));
preview.stderr.on('data', (d) => console.log('[preview stderr]', d.toString().trim()));

// Wait 4 seconds for preview server
await new Promise((r) => setTimeout(r, 4000));

const results = {
  desktop: {},
  mobile: {},
  passed: true,
};

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  // 3. Test Desktop
  {
    console.log('\n--- Running Desktop Verification ---');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
    await ctx.addInitScript(
      ({ s, u }) => localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u)),
      { s: REF, u: auth.session }
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`http://localhost:${PORT}/claims`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    // Navigate to claims list
    const claimsNavBtn = page.locator('[data-testid="claims-nav-all"]');
    if (await claimsNavBtn.isVisible()) {
      await claimsNavBtn.click();
      await page.waitForTimeout(1000);
    }

    // Check 3-way toggle buttons
    const filterAll = page.locator('[data-testid="filter-all-cases"]');
    const filterIns = page.locator('[data-testid="filter-insurance-cases"]');
    const filterGar = page.locator('[data-testid="filter-garage-cases"]');
    const reportsHubBtn = page.locator('[data-testid="claims-btn-reports-hub"]');

    const hasFilters = (await filterAll.isVisible()) && (await filterIns.isVisible()) && (await filterGar.isVisible());
    const hasHubBtn = await reportsHubBtn.isVisible();
    const txtAll = await filterAll.innerText().catch(() => '');
    const txtIns = await filterIns.innerText().catch(() => '');
    const txtGar = await filterGar.innerText().catch(() => '');

    console.log('Filter pills:', { txtAll, txtIns, txtGar, hasHubBtn });

    // Filter to garage cases only
    await filterGar.click();
    await page.waitForTimeout(600);
    const garageRowsCount = await page.locator('tbody tr').count();

    // Filter to insurance cases only
    await filterIns.click();
    await page.waitForTimeout(600);
    const insRowsCount = await page.locator('tbody tr').count();

    // Back to all cases
    await filterAll.click();
    await page.waitForTimeout(600);
    const allRowsCount = await page.locator('tbody tr').count();

    await page.screenshot({ path: path.join(OUT, 'claims-unified-list-desktop.png') });

    // Open Reports view via prominent button
    if (await reportsHubBtn.isVisible()) {
      await reportsHubBtn.click();
    } else {
      const tbReports = page.locator('button.tbn:has-text("דוחות")').first();
      await tbReports.click();
    }
    await page.waitForTimeout(2000);

    // Check Reports Elements
    const reportsTitle = await page.locator('.cr-title').innerText().catch(() => '');
    const kpiCount = await page.locator('.cr-kpi-card').count();
    const finCount = await page.locator('.cr-fin-card').count();
    const hasBackBtn = await page.locator('.cr-btn-back').isVisible();
    const hasExportBtn = await page.locator('.cr-btn-export').first().isVisible();
    const hasPrintBtn = await page.locator('.cr-btn-print').isVisible();
    const hasPeriodSelect = await page.locator('[data-testid="reports-period-select"]').isVisible();
    const hasSourceSelect = await page.locator('[data-testid="reports-source-select"]').isVisible();

    console.log('Reports Hub metrics:', {
      reportsTitle,
      kpiCount,
      finCount,
      hasBackBtn,
      hasExportBtn,
      hasPrintBtn,
      hasPeriodSelect,
      hasSourceSelect,
    });

    // Test Drilldown Modal by clicking first KPI card
    const firstKpi = page.locator('[data-testid="kpi-total-cases"]');
    await firstKpi.click();
    await page.waitForTimeout(800);
    const drilldownModal = page.locator('[data-testid="drilldown-modal"]');
    const isDrilldownOpen = await drilldownModal.isVisible();
    const drilldownRowCount = await page.locator('.cr-modal-box tbody tr').count();
    console.log('Drilldown Modal:', { isDrilldownOpen, drilldownRowCount });

    await page.screenshot({ path: path.join(OUT, 'claims-drilldown-modal-desktop.png') });

    // Close Drilldown Modal
    await page.locator('[data-testid="drilldown-modal-close"]').click();
    await page.waitForTimeout(500);

    // Test Period Comparison Tab
    const compTab = page.locator('[data-testid="reports-tab-comparison"]');
    await compTab.click();
    await page.waitForTimeout(600);
    const compTableVisible = await page.locator('[data-testid="period-comparison-table"]').isVisible();
    console.log('Period Comparison Tab:', { compTableVisible });

    // Test Garage Works Tab
    const garTab = page.locator('[data-testid="reports-tab-garage_works"]');
    await garTab.click();
    await page.waitForTimeout(600);
    const garTableVisible = await page.locator('[data-testid="garage-works-table"]').isVisible();
    console.log('Garage Works Tab:', { garTableVisible });

    // Test Master Table Tab
    const masterTab = page.locator('[data-testid="reports-tab-table"]');
    await masterTab.click();
    await page.waitForTimeout(600);
    const masterTableVisible = await page.locator('[data-testid="reports-details-table"]').isVisible();
    console.log('Master Table Tab:', { masterTableVisible });

    await page.screenshot({ path: path.join(OUT, 'claims-reports-hub-desktop.png') });

    // Test Back button
    await page.locator('.cr-btn-back').click();
    await page.waitForTimeout(1000);
    const returnedToClaims = await page.locator('[data-testid="claims-origin-filters"]').isVisible();

    results.desktop = {
      hasFilters,
      filterTexts: { txtAll, txtIns, txtGar },
      counts: { allRowsCount, insRowsCount, garageRowsCount },
      reports: {
        reportsTitle,
        kpiCount,
        finCount,
        hasBackBtn,
        hasExportBtn,
        hasPrintBtn,
        hasPeriodSelect,
        hasSourceSelect,
        isDrilldownOpen,
        drilldownRowCount,
        compTableVisible,
        garTableVisible,
        masterTableVisible,
      },
      returnedToClaims,
      errors,
    };
    await ctx.close();
  }

  // 4. Test Mobile
  {
    console.log('\n--- Running Mobile Verification ---');
    const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'he-IL' });
    await ctx.addInitScript(
      ({ s, u }) => localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u)),
      { s: REF, u: auth.session }
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`http://localhost:${PORT}/claims`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    // Open Mobile sidebar and go to Claims
    const sbBtn = page.locator('[data-testid="claims-sb-open"]');
    if (await sbBtn.isVisible()) {
      await sbBtn.click();
      await page.waitForTimeout(600);
      await page.locator('[data-testid="claims-nav-all"]').click();
      await page.waitForTimeout(1000);
    }

    const hasFiltersMobile = await page.locator('[data-testid="claims-origin-filters"]').isVisible();
    const mobileRowsCount = await page.locator('.claim-mcard').count();
    console.log('Mobile view claims:', { hasFiltersMobile, mobileRowsCount });

    // Open reports from top bar or sidebar
    const repBtn = page.locator('[data-testid="claims-btn-reports-hub"]');
    if (await repBtn.isVisible()) {
      await repBtn.click();
    } else {
      await sbBtn.click();
      await page.waitForTimeout(500);
      await page.locator('.sb-i:has-text("דוחות")').click();
    }
    await page.waitForTimeout(2000);

    const reportsVisibleMobile = await page.locator('.cr-title').isVisible();
    const kpiCountMobile = await page.locator('.cr-kpi-card').count();

    await page.screenshot({ path: path.join(OUT, 'claims-reports-hub-mobile.png') });

    results.mobile = {
      hasFiltersMobile,
      mobileRowsCount,
      reportsVisibleMobile,
      kpiCountMobile,
      errors,
    };
    await ctx.close();
  }
} catch (err) {
  console.error('Verification error:', err);
  results.passed = false;
  results.error = String(err.message || err);
} finally {
  if (browser) await browser.close();
  preview.kill();
}

console.log('\n--- Final Verification Summary ---');
console.log(JSON.stringify(results, null, 2));

if (!results.passed || (results.desktop.errors && results.desktop.errors.length > 0)) {
  process.exit(1);
} else {
  console.log('SUCCESS: All checks passed!');
  process.exit(0);
}
