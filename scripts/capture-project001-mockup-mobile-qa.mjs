/**
 * Project 001 Mockup — mobile QA (iPhone + Android viewports).
 * Usage: node scripts/capture-project001-mockup-mobile-qa.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE =
  process.argv[2]?.replace(/\/$/, '') ||
  'https://orin1607-ctrl.github.io/future-craft-core/project-001-mockup';
const EXPECT_VERSION = process.argv[3] || '6ceb18b-m4';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'project-001-mockup-qa');

mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), base: BASE, expectVersion: EXPECT_VERSION, checks: [], shots: [] };

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

async function runViewport(browser, label, contextOptions, viewport) {
  const ctx = await browser.newContext({ ...contextOptions, locale: 'he-IL', ...viewport });
  const page = await ctx.newPage();
  const cacheBust = `?v=${EXPECT_VERSION}&t=${Date.now()}`;
  await page.goto(BASE + cacheBust, { waitUntil: 'networkidle', timeout: 120000 });

  const version = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="mockup-version"]')?.getAttribute('content');
    const badge = document.getElementById('buildBadge')?.textContent?.trim();
    const title = document.title;
    const hasBottomNav = !!document.getElementById('bottomNav')?.children.length;
    const hasGlobalAsk = !!document.getElementById('globalAskInput');
    const hasStrategy = document.getElementById('screenTitle')?.textContent?.includes('אסטרטגיה');
    return { meta, badge, title, hasBottomNav, hasGlobalAsk, hasStrategy };
  });

  if (version.meta === EXPECT_VERSION || version.badge?.includes(EXPECT_VERSION)) {
    pass(`${label}-version`, `meta=${version.meta} badge=${version.badge}`);
  } else {
    fail(`${label}-version`, JSON.stringify(version));
  }

  if (version.hasBottomNav) pass(`${label}-bottom-nav`);
  else fail(`${label}-bottom-nav`);

  if (version.hasGlobalAsk) pass(`${label}-global-ask`);
  else fail(`${label}-global-ask`);

  await page.waitForSelector('#screenBody .brain-hero, #screenBody .card, #screenBody .task-next', {
    timeout: 30000,
  }).catch(() => {});

  await shot(page, `${label}-home.png`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  if (!overflow) pass(`${label}-no-page-overflow`);
  else fail(`${label}-no-page-overflow`, `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`);

  const btn = await page.evaluate(() => {
    const el = document.querySelector('.action-bar .btn-ai');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  if (btn && btn.h >= 44) pass(`${label}-touch-target-ai`, `${btn.w}x${btn.h}`);
  else fail(`${label}-touch-target-ai`, JSON.stringify(btn));

  await page.click('#menuBtn');
  await page.waitForTimeout(350);
  const sidebarOpen = await page.evaluate(() => document.getElementById('sidebar')?.classList.contains('open'));
  if (sidebarOpen) pass(`${label}-sidebar-opens`);
  else fail(`${label}-sidebar-opens`);

  await shot(page, `${label}-sidebar-open.png`);

  await page.evaluate(() => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('overlayScrim')?.classList.remove('show');
  });
  await page.waitForTimeout(200);

  await page.click('.bottom-nav .bn-item[data-mod="site"]');
  await page.waitForTimeout(400);
  const siteTitle = await page.textContent('#screenTitle');
  if (siteTitle?.includes('אתר')) pass(`${label}-bottom-nav-site`, siteTitle);
  else fail(`${label}-bottom-nav-site`, siteTitle);

  await shot(page, `${label}-site-module.png`);

  await page.click('[data-action="recommend"]');
  await page.waitForTimeout(400);
  const modalVisible = await page.evaluate(() => !document.getElementById('modalBackdrop')?.classList.contains('hidden'));
  if (modalVisible) pass(`${label}-ai-modal`);
  else fail(`${label}-ai-modal`);

  await shot(page, `${label}-ai-modal.png`);

  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();

  await runViewport(
    browser,
    'iphone-13',
    devices['iPhone 13'],
    {},
  );

  await runViewport(
    browser,
    'pixel-7',
    devices['Pixel 7'],
    {},
  );

  // Landscape Android
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'he-IL', viewport: { width: 915, height: 412 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?v=${EXPECT_VERSION}&landscape=1`, { waitUntil: 'networkidle', timeout: 120000 });
  await shot(page, 'pixel-7-landscape.png');
  await ctx.close();

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
