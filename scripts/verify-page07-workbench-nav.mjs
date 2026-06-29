/**
 * Verify page-07 workbench: Preview + compare + before/after accordion on Staging.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.PREVIEW_VER || 'v3-live-demo-2';
const STAGING = process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}&page=page-07`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'page-07-nav-probe');
const SHOTS = join(OUT, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const report = { at: new Date().toISOString(), stagingUrl: STAGING, ver: VER, checks: {}, ok: false };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
await page.waitForFunction(
  () => document.getElementById('screen-actions')?.classList.contains('active') ||
    (typeof goScreen === 'function' && (goScreen('screen-actions'), true)),
  { timeout: 30000 }
);
await page.waitForFunction(
  () => document.getElementById('coco-live-actions-pending')?.getAttribute('data-coco-act-ready') === 'true',
  { timeout: 90000 }
);
await page.waitForTimeout(2500);

report.checks.deepLink = await page.evaluate(() => ({
  view: window.ActionsWorkbench ? 'workbench-expected' : null,
  wbTitle: document.querySelector('.coco-act-lite-wb-title')?.textContent?.trim() || null,
  onPage07: /השירותים שלנו/.test(document.querySelector('.coco-act-lite-wb-title')?.textContent || ''),
}));

if (!report.checks.deepLink.onPage07) {
  await page.evaluate(() => {
    document.querySelector('[data-act-list-page="1"]')?.click();
    ActionsWorkbench.openWorkbench('page-07');
  });
  await page.waitForTimeout(2000);
}

await page.screenshot({ path: join(SHOTS, '01-workbench.png') });

report.checks.previewBtn = await page.evaluate(() => ({
  found: !!document.querySelector('[data-act-lite-preview="page-07"]'),
  label: document.querySelector('[data-act-lite-preview]')?.textContent?.trim(),
}));

await page.evaluate(() => document.querySelector('[data-act-lite-preview]')?.click());
await page.waitForTimeout(800);
report.checks.previewModal = await page.evaluate(() => ({
  modal: document.getElementById('coco-act-lite-preview-modal')?.style.display === 'flex',
  tabs: Array.from(document.querySelectorAll('[data-lite-preview-mode]')).map((b) => b.textContent.trim()),
  hasBefore: (document.querySelector('[data-lite-preview-before]')?.value || '').includes('Title (לפני)'),
  hasAfter: (document.querySelector('[data-lite-preview-html]')?.value || '').includes('אחרי'),
}));
await page.screenshot({ path: join(SHOTS, '02-preview-after.png') });

await page.evaluate(() => document.querySelector('[data-lite-preview-mode="compare"]')?.click());
await page.waitForTimeout(600);
report.checks.compare = await page.evaluate(() => ({
  beforeFrame: !!document.getElementById('coco-act-lite-preview-frame-before'),
  afterFrame: !!document.getElementById('coco-act-lite-preview-frame'),
  beforeLen: document.getElementById('coco-act-lite-preview-frame-before')?.getAttribute('srcdoc')?.length || 0,
  afterLen: document.getElementById('coco-act-lite-preview-frame')?.getAttribute('srcdoc')?.length || 0,
}));
await page.screenshot({ path: join(SHOTS, '03-compare.png') });

await page.evaluate(() => document.querySelector('.coco-act-lite-preview-close')?.click());
await page.evaluate(() => document.querySelector('[data-act-acc-toggle]')?.click());
await page.waitForTimeout(600);
report.checks.accordion = await page.evaluate(() => ({
  baBefore: document.querySelectorAll('.coco-act-ba-before').length,
  baAfter: document.querySelectorAll('.coco-act-ba-after').length,
  approve: document.querySelector('[data-act-approve]')?.textContent?.trim(),
}));
await page.screenshot({ path: join(SHOTS, '04-accordion-approve.png') });

report.checks.notifyHook = await page.evaluate(() => typeof window.COCO_AI_CONTROL?.notifyPageReadyForApproval === 'function');

report.ok =
  report.checks.previewBtn.found &&
  report.checks.previewModal.modal &&
  report.checks.previewModal.tabs.length >= 3 &&
  report.checks.compare.beforeFrame &&
  report.checks.compare.beforeLen > 200 &&
  report.checks.accordion.baBefore >= 1 &&
  report.checks.accordion.approve;

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log('OK:', report.ok, 'Report:', join(OUT, 'report.json'));
process.exit(report.ok ? 0 : 1);
