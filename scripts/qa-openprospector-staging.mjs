import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Minimal static server for dist
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const distDir = path.resolve('dist');

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  let filePath = path.join(distDir, reqPath);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function runQA() {
  const port = 8995;
  await new Promise(r => server.listen(port, r));
  console.log(`[QA] Test server running at http://localhost:${port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const results = [];
  const logStep = (step, ok, details = '') => {
    results.push({ step, ok, details });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step} ${details}`);
  };

  try {
    // 1. Load dalia-marketing-center-v2.html
    await page.goto(`http://localhost:${port}/dalia-marketing-center-v2.html`, { waitUntil: 'networkidle' });
    const title = await page.title();
    logStep('Load Marketing V2 shell', title.includes('דליה'), `Title: ${title}`);

    // 2. Verify OpenProspector module card in dashboard
    const leadsCard = page.locator('button.mod[data-go="m/leads"]');
    const isLeadsVisible = await leadsCard.isVisible();
    const leadsText = await leadsCard.textContent();
    logStep('Find "איתור לקוחות ולידים" card with "מחובר" status', isLeadsVisible && leadsText.includes('מחובר'), `Text: ${leadsText.replace(/\s+/g, ' ').trim()}`);

    // 3. Click into OpenProspector
    await leadsCard.click();
    await page.waitForTimeout(500);

    // 4. Verify breadcrumbs & frame
    const crumbs = await page.locator('.crumbs').textContent().catch(() => '');
    logStep('Verify navigation to m/leads', crumbs.includes('איתור לקוחות ולידים'), `Crumbs: ${crumbs}`);

    const iframeLocator = page.frameLocator('#module-frame-leads');
    const iframeTitle = await iframeLocator.locator('#title').textContent().catch(() => '');
    logStep('OpenProspector embedded iframe loaded', iframeTitle.includes('איתור לקוחות'), `Title: ${iframeTitle}`);

    // 5. Test Tabs inside iframe
    const searchTab = iframeLocator.locator('.tabs button[data-tab="search"]');
    await searchTab.click();
    await page.waitForTimeout(300);
    const searchArea = await iframeLocator.locator('#q').isVisible();
    logStep('Tab: "חיפוש חדש" renders query input', searchArea);

    // 6. Test NLP Interpret simulation
    const exButton = iframeLocator.locator('button[data-ex]').first();
    await exButton.click();
    await iframeLocator.locator('button[data-act="interpret"]').click();
    await page.waitForTimeout(300);
    const interpVisible = await iframeLocator.locator('#interp .interp').isVisible();
    logStep('NLP Interpret: translates free query into criteria chips', interpVisible);

    // 7. Test Companies Tab
    const companiesTab = iframeLocator.locator('.tabs button[data-tab="companies"]');
    await companiesTab.click();
    await page.waitForTimeout(300);
    const rowsCount = await iframeLocator.locator('table.co tbody tr').count();
    logStep('Tab: "חברות שנמצאו" lists companies', rowsCount >= 8, `Count: ${rowsCount} rows`);

    // 8. Test Company Drawer
    const firstRow = iframeLocator.locator('table.co tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(400);
    const panelVisible = await iframeLocator.locator('#panel .panel').isVisible();
    const panelCoName = await iframeLocator.locator('#panel h2').textContent().catch(() => '');
    logStep('Drawer: Company detail panel opens', panelVisible, `Company: ${panelCoName}`);

    // 9. Test CRM transfer action
    const toCrmBtn = iframeLocator.locator('button[data-act="toCrm"]');
    await toCrmBtn.click();
    await page.waitForTimeout(300);
    const toastText = await iframeLocator.locator('#toast').textContent().catch(() => '');
    logStep('Action: "העבר ל-CRM" triggers confirmation', toastText.includes('CRM'), `Toast: ${toastText}`);

    // 10. Close panel & test Leads Kanban Board
    await iframeLocator.locator('button[data-act="closePanel"]').click();
    await page.waitForTimeout(300);
    const leadsTab = iframeLocator.locator('.tabs button[data-tab="leads"]');
    await leadsTab.click();
    await page.waitForTimeout(300);
    const columnsCount = await iframeLocator.locator('.board .col').count();
    logStep('Tab: "ניהול לידים" Kanban board renders', columnsCount === 7, `Columns: ${columnsCount}`);

    // 11. Test Mobile Viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    await companiesTab.click();
    await page.waitForTimeout(300);
    const isMobileResponsive = await iframeLocator.locator('table.co').isVisible();
    logStep('Mobile: 375px responsive layout renders cleanly', isMobileResponsive);

    // Capture desktop & mobile screenshot
    await page.screenshot({ path: path.join(distDir, 'qa-prospector-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(distDir, 'qa-prospector-desktop.png') });
    logStep('Screenshots saved to dist/', true);

  } catch (err) {
    console.error('[QA ERROR]', err);
    logStep('QA Execution', false, err.message);
  } finally {
    await browser.close();
    server.close();
  }

  const allPassed = results.every(r => r.ok);
  console.log(`\n================================`);
  console.log(`[QA RESULT] ${allPassed ? 'ALL TESTS PASSED SUCCESSFULLY!' : 'SOME TESTS FAILED'}`);
  console.log(`================================`);
  process.exit(allPassed ? 0 : 1);
}

runQA();
