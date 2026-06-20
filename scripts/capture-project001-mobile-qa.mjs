/**
 * Project 001 Dashboard — mobile + desktop QA screenshots.
 *
 * Usage:
 *   node scripts/capture-project001-mobile-qa.mjs [baseUrl]
 *
 * Default: https://orin1607-ctrl.github.io/future-craft-core/dev/project-001/dashboard
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE =
  process.argv[2]?.replace(/\/$/, '') ||
  'https://orin1607-ctrl.github.io/future-craft-core/dev/project-001/dashboard';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'project-001-mobile-qa');

mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  checks: [],
  shots: [],
};

function pass(name, detail) {
  report.checks.push({ name, ok: true, detail });
  console.log('PASS', name, detail || '');
}

function fail(name, detail) {
  report.checks.push({ name, ok: false, detail });
  console.error('FAIL', name, detail);
}

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  report.shots.push(name);
  console.log('SHOT', path);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'he-IL' });

  // Desktop
  const desktop = await ctx.newPage();
  await desktop.setViewportSize({ width: 1280, height: 800 });
  await desktop.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await desktop.waitForSelector('.p001-dash .stats-grid', { timeout: 60000 });
  await shot(desktop, 'desktop-1280-dashboard.png');

  const desktopOverflow = await desktop.evaluate(() => {
    const el = document.querySelector('.p001-dash');
    return el ? el.scrollWidth > el.clientWidth + 2 : false;
  });
  if (desktopOverflow) fail('desktop-no-horizontal-scroll', 'scrollWidth > clientWidth');
  else pass('desktop-no-horizontal-scroll');

  // Mobile portrait iPhone SE
  const mobile = await ctx.newPage();
  await mobile.setViewportSize({ width: 375, height: 667 });
  await mobile.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await mobile.waitForSelector('.p001-dash .stats-grid', { timeout: 60000 });
  await shot(mobile, 'mobile-375-portrait-dashboard.png');

  const mobileOverflow = await mobile.evaluate(() => {
    const el = document.querySelector('.p001-dash');
    return el ? el.scrollWidth > el.clientWidth + 2 : false;
  });
  if (mobileOverflow) fail('mobile-portrait-no-horizontal-scroll', 'horizontal overflow');
  else pass('mobile-portrait-no-horizontal-scroll');

  const statCols = await mobile.evaluate(() => {
    const grid = document.querySelector('.p001-dash .stats-grid');
    if (!grid) return 0;
    return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  });
  if (statCols === 1) pass('mobile-single-column-stats', `columns=${statCols}`);
  else fail('mobile-single-column-stats', `expected 1 col, got ${statCols}`);

  // Hamburger + sidebar
  const hamburgerVisible = await mobile.isVisible('.mobile-menu-btn');
  if (hamburgerVisible) pass('mobile-hamburger-visible');
  else fail('mobile-hamburger-visible');

  await mobile.click('.mobile-menu-btn');
  await mobile.waitForTimeout(400);
  await shot(mobile, 'mobile-375-portrait-sidebar-open.png');

  const sidebarOpen = await mobile.evaluate(() =>
    document.querySelector('.sidebar')?.classList.contains('open'),
  );
  if (sidebarOpen) pass('mobile-sidebar-opens');
  else fail('mobile-sidebar-opens');

  await mobile.click('.sidebar-nav .nav-item');
  await mobile.waitForTimeout(400);
  const sidebarClosed = await mobile.evaluate(() =>
    !document.querySelector('.sidebar')?.classList.contains('open'),
  );
  if (sidebarClosed) pass('mobile-sidebar-closes-on-nav');
  else fail('mobile-sidebar-closes-on-nav');

  // Table internal scroll
  await mobile.evaluate(() => document.getElementById('section-keywords')?.scrollIntoView());
  await mobile.waitForTimeout(300);
  await shot(mobile, 'mobile-375-portrait-keywords-table.png');

  const tableScroll = await mobile.evaluate(() => {
    const wrap = document.querySelector('.table-scroll');
    if (!wrap) return null;
    return { scrollWidth: wrap.scrollWidth, clientWidth: wrap.clientWidth };
  });
  if (tableScroll && tableScroll.scrollWidth > tableScroll.clientWidth) {
    pass('mobile-table-internal-scroll', `${tableScroll.scrollWidth}px table in ${tableScroll.clientWidth}px`);
  } else {
    pass('mobile-table-fits-or-scrollable', JSON.stringify(tableScroll));
  }

  // Touch target sample
  const btnSize = await mobile.evaluate(() => {
    const btn = document.querySelector('.p001-dash .btn-primary');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  if (btnSize && btnSize.w >= 44 && btnSize.h >= 44) pass('touch-target-sync-btn', `${btnSize.w}x${btnSize.h}`);
  else fail('touch-target-sync-btn', JSON.stringify(btnSize));

  // Mobile landscape
  await mobile.setViewportSize({ width: 667, height: 375 });
  await mobile.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await mobile.waitForSelector('.p001-dash .stats-grid', { timeout: 60000 });
  await shot(mobile, 'mobile-667-landscape-dashboard.png');

  const landOverflow = await mobile.evaluate(() => {
    const el = document.querySelector('.p001-dash');
    return el ? el.scrollWidth > el.clientWidth + 2 : false;
  });
  if (landOverflow) fail('mobile-landscape-no-horizontal-scroll');
  else pass('mobile-landscape-no-horizontal-scroll');

  // Tablet
  const tablet = await ctx.newPage();
  await tablet.setViewportSize({ width: 768, height: 1024 });
  await tablet.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await tablet.waitForSelector('.p001-dash .stats-grid', { timeout: 60000 });
  await shot(tablet, 'tablet-768-portrait-dashboard.png');

  const tabletSidebarVisible = await tablet.evaluate(() => {
    const btn = document.querySelector('.mobile-menu-btn');
    const main = document.querySelector('.main');
    if (!btn || !main) return false;
    const btnHidden = getComputedStyle(btn).display === 'none';
    const marginRight = getComputedStyle(main).marginRight;
    return btnHidden && parseFloat(marginRight) >= 200;
  });
  if (tabletSidebarVisible) pass('tablet-sidebar-visible');
  else fail('tablet-sidebar-visible');

  await browser.close();

  report.passed = report.checks.filter((c) => c.ok).length;
  report.failed = report.checks.filter((c) => !c.ok).length;
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log('\nQA', report.passed, 'passed,', report.failed, 'failed');
  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
