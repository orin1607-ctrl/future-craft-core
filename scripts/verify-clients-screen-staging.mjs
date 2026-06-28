/**
 * Verify dalia-c.com appears on חברות ולקוחות (desktop + mobile viewport).
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, devices } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const OUT = join(P001.root, 'docs', 'audit-reports', 'clients-screen-fix');
const STAGING = process.env.STAGING_PAGES_URL || 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html';

mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), checks: [], ok: false, errors: [] };

function pass(name, detail) {
  report.checks.push({ name, ok: true, detail });
  console.log('✅', name, detail || '');
}

function fail(name, detail) {
  report.errors.push({ name, detail });
  report.checks.push({ name, ok: false, detail });
  console.error('❌', name, detail || '');
}

async function verifyViewport(page, label) {
  await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4500);

  await page.evaluate(function () {
    if (typeof goScreen === 'function') goScreen('screen-clients');
  });
  await page.waitForTimeout(2000);

  const domainVisible = await page.locator('#coco-live-clients-list').getByText('dalia-c.com').first().isVisible().catch(function () { return false; });
  if (!domainVisible) fail(label + ': domain visible', 'dalia-c.com not in #coco-live-clients-list');
  else pass(label + ': domain visible', 'dalia-c.com in clients list');

  const link = page.locator('#coco-live-clients-list a[href="https://dalia-c.com/"]').first();
  const href = await link.getAttribute('href').catch(function () { return null; });
  if (href !== 'https://dalia-c.com/') fail(label + ': site link', 'missing https://dalia-c.com/ link');
  else pass(label + ': site link', href);

  const ownerVisible = await page.locator('#coco-live-clients-list').getByText(/יוני אטיאס/).first().isVisible().catch(function () { return false; });
  if (!ownerVisible) fail(label + ': owner', 'יוני אטיאס not visible');
  else pass(label + ': owner', 'יוני אטיאס');

  const seoVisible = await page.locator('#coco-live-clients-list').getByText(/SEO|קידום/).first().isVisible().catch(function () { return false; });
  if (!seoVisible) fail(label + ': campaign', 'SEO campaign not visible');
  else pass(label + ': campaign', 'SEO / קידום');

  const gscVisible = await page.locator('#coco-live-clients-list').getByText(/Search Console|GSC/i).first().isVisible().catch(function () { return false; });
  if (!gscVisible) fail(label + ': GSC', 'Search Console not visible');
  else pass(label + ': GSC', 'Search Console row');

  await page.evaluate(function () {
    var tabs = document.querySelectorAll('#screen-clients .nav-tab');
    for (var i = 0; i < tabs.length; i++) {
      if (/נכסי לקוח/.test(tabs[i].textContent || '')) {
        if (typeof setTab === 'function') setTab(tabs[i], 'tab-clients-assets');
        break;
      }
    }
  });
  await page.waitForTimeout(1500);

  const assetsDomain = await page.locator('#coco-live-clients-assets').getByText('dalia-c.com').first().isVisible().catch(function () { return false; });
  if (!assetsDomain) fail(label + ': assets tab', 'dalia-c.com not in assets tab');
  else pass(label + ': assets tab', 'dalia-c.com in נכסי לקוח');

  await page.evaluate(function () {
    if (typeof goScreen === 'function') goScreen('screen-goals');
  });
  await page.waitForTimeout(2000);
  const goals = await page.locator('#coco-live-goals-list .goal-acc-item').count();
  if (goals < 28) fail(label + ': goals still work', 'expected 28 accordions, got ' + goals);
  else pass(label + ': goals still work', goals + ' accordions');

  await page.evaluate(function () {
    if (typeof goScreen === 'function') goScreen('screen-actions');
  });
  await page.waitForTimeout(2000);
  const actions = await page.locator('#coco-live-actions-pending .action-card').count();
  if (actions < 50) fail(label + ': actions still work', 'expected many action cards, got ' + actions);
  else pass(label + ': actions still work', actions + ' action cards');
}

try {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await verifyViewport(await desktop.newPage(), 'desktop');

  const iphone = devices['iPhone 13'];
  const mobileCtx = await browser.newContext({ ...iphone });
  await verifyViewport(await mobileCtx.newPage(), 'mobile');

  await browser.close();
} catch (e) {
  fail('browser', e.message);
}

report.ok = report.errors.length === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('\nReport:', join(OUT, 'report.json'));
process.exit(report.ok ? 0 : 1);
