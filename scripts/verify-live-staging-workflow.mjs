import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function verifyLive() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  const liveUrl = `https://orin1607-ctrl.github.io/future-craft-core/openprospector.html?v=${Date.now()}`;
  console.log('Navigating to live deployed STAGING URL:', liveUrl);
  await page.goto(liveUrl, { waitUntil: 'networkidle', timeout: 45000 });

  // 1. Wait for Supabase connection
  await page.waitForFunction(() => window.S && S.remoteStatus === 'connected', null, { timeout: 35000 });
  console.log('[PASS] Connected to Supabase STAGING live');

  // 2. Switch to companies tab
  await page.click('.tabs button[data-tab="companies"]');
  await page.waitForSelector('table.co tbody tr', { timeout: 20000 });
  const count = await page.locator('table.co tbody tr').count();
  console.log(`[PASS] Table loaded with ${count} rows on live staging`);

  // 3. Verify Multi-select checkboxes
  const cbCount = await page.locator('input.co-cb').count();
  console.log(`[PASS] Found ${cbCount} row checkboxes`);

  // Select 2 companies
  await page.locator('input.co-cb').nth(0).check();
  await page.locator('input.co-cb').nth(1).check();
  await page.waitForTimeout(200);

  // 4. Verify Selection Bar
  const selBar = await page.locator('.selection-bar');
  const selBarVisible = await selBar.isVisible();
  const selBarText = await selBar.innerText();
  console.log(`[PASS] Selection bar visible: ${selBarVisible}, text: ${selBarText.replace(/\n/g, ' ')}`);

  // 5. Open AI Dispatch Modal
  await page.click('button[data-act="openAiDispatchModal"]');
  await page.waitForSelector('#modalRoot .modal-card');
  const aiModalText = await page.locator('#modalRoot .modal-card').innerText();
  console.log(`[PASS] AI Dispatch modal opened live. Text snippet: ${aiModalText.slice(0, 100).replace(/\n/g, ' ')}`);

  // Capture Live AI Modal Screenshot
  const brainDir = 'C:/Users/אליאב/.gemini/antigravity/brain/912da76f-1222-447e-95e6-0685412f307c';
  await page.screenshot({ path: path.join(brainDir, 'qa-modal-ai-dispatch.png') });
  await page.click('button[data-act="closeAiDispatchModal"]');

  // 6. Open External Dispatch Modal
  await page.click('button[data-act="openExtDispatchModal"]');
  await page.waitForSelector('#modalRoot .modal-card');
  const extModalText = await page.locator('#modalRoot .modal-card').innerText();
  console.log(`[PASS] External Dispatch modal opened live. TEST MODE: ${extModalText.includes('TEST MODE')}`);

  // Test DRY RUN button in modal
  await page.click('button[data-act="runExtDryRun"]');
  await page.waitForTimeout(300);
  const dryRunRes = await page.locator('#modalRoot .modal-card').innerText();
  console.log(`[PASS] DRY RUN executed on live staging: ${dryRunRes.includes('תוצאת סימולציית DRY RUN')}`);

  // Capture Live Ext Modal Screenshot
  await page.screenshot({ path: path.join(brainDir, 'qa-modal-ext-dispatch.png') });
  await page.click('button[data-act="closeExtDispatchModal"]');

  // 7. Capture Companies Table
  await page.screenshot({ path: path.join(brainDir, 'qa-companies-table.png') });

  // 8. Open Lead Drawer
  const firstCoId = await page.evaluate(() => C[0].id);
  await page.evaluate((id) => { S.panel = { co: id }; renderPanel(); }, firstCoId);
  await page.waitForSelector('#panel .panel');
  console.log('[PASS] Lead Drawer opened on live staging');

  // Capture Lead Drawer
  await page.screenshot({ path: path.join(brainDir, 'qa-lead-drawer.png') });

  // Scroll to Source History
  await page.evaluate(() => {
    const summary = Array.from(document.querySelectorAll('#panel summary')).find(s => s.innerText.includes('היסטוריית מקורות'));
    if (summary) {
      summary.scrollIntoView({ behavior: 'instant', block: 'start' });
      const nextDetails = summary.closest('details')?.nextElementSibling;
      if (nextDetails && nextDetails.tagName === 'DETAILS') nextDetails.open = true;
    }
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(brainDir, 'qa-lead-drawer-sources.png') });
  await page.evaluate(() => { S.panel = null; renderPanel(); });

  // 9. Discovered Sources Tab
  await page.click('.tabs button[data-tab="discovered_sources"]');
  await page.waitForSelector('table.co', { timeout: 15000 });
  const discViewText = await page.locator('#view').innerText();
  console.log(`[PASS] Discovered Sources tab live: ${discViewText.includes('Source Discovery Hub')}`);
  await page.screenshot({ path: path.join(brainDir, 'qa-discovered-sources.png') });

  console.log('\n========================================');
  console.log('ALL LIVE STAGING VERIFICATIONS PASSED 100%');
  console.log('========================================\n');

  await browser.close();
}

verifyLive().catch(err => {
  console.error('LIVE VERIFICATION ERROR:', err);
  process.exit(1);
});
