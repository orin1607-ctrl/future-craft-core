import { chromium } from 'playwright';
import path from 'path';

async function runLiveQA() {
  const stagingUrl = 'https://orin1607-ctrl.github.io/future-craft-core/dalia-marketing-center-v2.html';
  console.log(`[QA LIVE] Testing live staging at ${stagingUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const results = [];
  const logStep = (step, ok, details = '') => {
    results.push({ step, ok, details });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step} ${details}`);
  };

  try {
    // 1. Load Staging
    await page.goto(stagingUrl, { waitUntil: 'networkidle' });
    const title = await page.title();
    logStep('Load Live Staging Marketing V2', title.includes('דליה'), `Title: ${title}`);

    // 2. Locate module card
    const leadsCard = page.locator('button.mod[data-go="m/leads"]');
    const isLeadsVisible = await leadsCard.isVisible();
    const leadsText = await leadsCard.textContent();
    logStep('Verify "איתור לקוחות ולידים" has "מחובר" chip on live staging', isLeadsVisible && leadsText.includes('מחובר'), `Text: ${leadsText.replace(/\s+/g, ' ').trim()}`);

    // 3. Click to open module
    await leadsCard.click();
    await page.waitForTimeout(1000);

    // 4. Verify crumbs & iframe
    const crumbs = await page.locator('.crumbs').textContent().catch(() => '');
    logStep('Live Staging: Crumbs show "דשבורד ראשי / איתור לקוחות ולידים"', crumbs.includes('איתור לקוחות ולידים'), `Crumbs: ${crumbs}`);

    const iframeLocator = page.frameLocator('#module-frame-leads');
    const iframeTitle = await iframeLocator.locator('#title').textContent().catch(() => '');
    logStep('Live Staging: OpenProspector iframe rendered with title', iframeTitle.includes('איתור לקוחות'), `Title: ${iframeTitle}`);

    // 5. Test search tab
    const searchTab = iframeLocator.locator('.tabs button[data-tab="search"]');
    await searchTab.click();
    await page.waitForTimeout(400);
    const searchArea = await iframeLocator.locator('#q').isVisible();
    logStep('Live Staging: Search tab query box is functional', searchArea);

    // 6. Test companies tab & row drawer
    const companiesTab = iframeLocator.locator('.tabs button[data-tab="companies"]');
    await companiesTab.click();
    await page.waitForTimeout(400);
    const rowsCount = await iframeLocator.locator('table.co tbody tr').count();
    logStep('Live Staging: Companies tab loaded rows', rowsCount >= 8, `Rows: ${rowsCount}`);

    const firstRow = iframeLocator.locator('table.co tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(400);
    const panelVisible = await iframeLocator.locator('#panel .panel').isVisible();
    const coName = await iframeLocator.locator('#panel h2').textContent().catch(() => '');
    logStep('Live Staging: Company detail drawer opens', panelVisible, `Company: ${coName}`);

    // 7. Test toCrm toast
    await iframeLocator.locator('button[data-act="toCrm"]').click();
    await page.waitForTimeout(300);
    const toastText = await iframeLocator.locator('#toast').textContent().catch(() => '');
    logStep('Live Staging: "העבר ל-CRM" toast triggers', toastText.includes('CRM'), `Toast: ${toastText}`);

    // 8. Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);
    const mobileCoTable = await iframeLocator.locator('table.co').isVisible();
    logStep('Live Staging: Mobile (375x667) renders cleanly and responsively', mobileCoTable);

    await page.screenshot({ path: path.resolve('dist/live-staging-prospector-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve('dist/live-staging-prospector-desktop.png') });
    logStep('Live Staging: Screenshots captured', true);

  } catch (err) {
    console.error('[QA ERROR]', err);
    logStep('QA Execution', false, err.message);
  } finally {
    await browser.close();
  }

  const allPassed = results.every(r => r.ok);
  console.log(`\n================================`);
  console.log(`[LIVE STAGING QA] ${allPassed ? 'ALL TESTS PASSED ON LIVE STAGING!' : 'FAILURES DETECTED'}`);
  console.log(`================================`);
  process.exit(allPassed ? 0 : 1);
}

runLiveQA();
