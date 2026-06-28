/**
 * Verify asset flow chain — active asset sync across marketing screens (Staging).
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const OUT = join(P001.root, 'docs', 'audit-reports', 'asset-flow-chain');
const STAGING = process.env.STAGING_PAGES_URL || 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html';

mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), checks: [], chain: null, ok: false, errors: [] };

function pass(name, detail) {
  report.checks.push({ name, ok: true, detail });
  console.log('✅', name, detail || '');
}

function fail(name, detail) {
  report.errors.push({ name, detail });
  report.checks.push({ name, ok: false, detail });
  console.error('❌', name, detail || '');
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newContext({ viewport: { width: 1280, height: 900 } }).then((c) => c.newPage());

try {
  await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4500);

  const noNewClientInClients = await page.evaluate(() => {
    var btns = document.querySelectorAll('#screen-clients .btn, #screen-clients button');
    for (var i = 0; i < btns.length; i++) {
      if (/לקוח חדש/i.test(btns[i].textContent || '') && btns[i].offsetParent !== null) return false;
    }
    return true;
  });
  if (!noNewClientInClients) fail('no new client button in clients screen');
  else pass('no new client button', 'screen-clients has no visible לקוח חדש');

  await page.evaluate(() => { if (typeof goScreen === 'function') goScreen('screen-clients'); });
  await page.waitForTimeout(1500);

  const domainInList = await page.locator('#coco-live-clients-list').getByText('dalia-c.com').first().isVisible();
  if (!domainInList) fail('active asset in list', 'dalia-c.com missing');
  else pass('active asset in list', 'dalia-c.com visible');

  await page.evaluate(() => {
    if (typeof setTab === 'function') {
      var t = document.querySelector('#screen-clients .nav-tab[onclick*="tab-clients-setup"]');
      if (t) setTab(t, 'tab-clients-setup');
    }
  });
  await page.waitForTimeout(800);
  const setupBtn = await page.locator('#coco-live-setup-actions').getByText(/הוספת נכס חדש/).isVisible();
  if (!setupBtn) fail('setup add asset button');
  else pass('setup add asset button', '➕ הוספת נכס חדש on הגדרת לקוח');

  await page.evaluate(() => {
    if (typeof setTab === 'function') {
      var t = document.querySelector('#screen-clients .nav-tab[onclick*="tab-clients-integrations"]');
      if (t) setTab(t, 'tab-clients-integrations');
    }
  });
  await page.waitForTimeout(800);
  const apiBtn = await page.locator('#coco-live-api-actions').getByText(/חיבור API חדש/).isVisible();
  if (!apiBtn) fail('api add button');
  else pass('api add button', '➕ חיבור API חדש on חיבורי API');

  await page.evaluate(() => { if (typeof goScreen === 'function') goScreen('screen-agents'); });
  await page.waitForTimeout(1500);
  const assistantBtn = await page.locator('#coco-add-assistant-btn').isVisible();
  if (!assistantBtn) fail('assistant add button');
  else pass('assistant add button', '➕ חיבור עוזר חדש on העוזרים');

  report.chain = await page.evaluate(() => {
    return window.AssetFlowSsot && AssetFlowSsot.getChainSnapshot ? AssetFlowSsot.getChainSnapshot() : null;
  });

  if (!report.chain || !report.chain.unified) fail('chain unified', JSON.stringify(report.chain));
  else pass('chain unified', 'client + asset + site in flowContext');

  if (!report.chain || report.chain.step2_domain !== 'dalia-c.com') fail('chain asset domain', report.chain && report.chain.step2_domain);
  else pass('chain step2 asset', report.chain.step2_domain);

  if (!report.chain || !report.chain.step3_campaign) fail('chain campaign');
  else pass('chain step3 campaign', report.chain.step3_campaign);

  const assetChip = await page.locator('#coco-unified-asset-chip').textContent();
  if (!assetChip || !assetChip.includes('dalia-c.com')) fail('context asset chip', assetChip || '');
  else pass('context asset chip', assetChip.trim());

  await page.evaluate(() => { if (typeof goScreen === 'function') goScreen('screen-goals'); });
  await page.waitForTimeout(2000);
  const goals = await page.locator('#coco-live-goals-list .goal-acc-item').count();
  if (goals < 28) fail('goals bound to asset', 'accordions=' + goals);
  else pass('goals bound to asset', goals + ' page accordions');

  await page.evaluate(() => { if (typeof goScreen === 'function') goScreen('screen-actions'); });
  await page.waitForTimeout(2000);
  const actions = await page.locator('#coco-live-actions-pending .action-card').count();
  if (actions < 50) fail('actions bound to asset', 'cards=' + actions);
  else pass('actions bound to asset', actions + ' action cards');

  await page.evaluate(() => {
    if (typeof AssetFlowSsot !== 'undefined' && AssetFlowSsot.openAddAssetModal) AssetFlowSsot.openAddAssetModal();
  });
  await page.waitForTimeout(500);
  const modalVisible = await page.locator('#modal-add-asset.open').isVisible();
  if (!modalVisible) fail('add asset modal');
  else pass('add asset modal', 'modal opens (infrastructure)');

} catch (e) {
  fail('browser', e.message);
}

await browser.close();

report.ok = report.errors.length === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\nChain snapshot:', JSON.stringify(report.chain, null, 2));
console.log('Report:', join(OUT, 'report.json'));
process.exit(report.ok ? 0 : 1);
