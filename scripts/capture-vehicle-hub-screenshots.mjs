/**
 * Capture Vehicle Hub preview screenshots (dev server required).
 * Usage: npm run dev  then  DEV_PORT=8082 node scripts/capture-vehicle-hub-screenshots.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const outDir = join(process.cwd(), 'test-results');
mkdirSync(outDir, { recursive: true });

const port = process.env.DEV_PORT || '8080';
const base = (path) => `http://localhost:${port}${path}`;

async function shot(page, url, name, width = 1280, fullPage = true) {
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(700);
  const outPath = join(outDir, name);
  await page.screenshot({ path: outPath, fullPage });
  console.log('OK', outPath);
}

const browser = await chromium.launch();

try {
  const desktop = await browser.newPage();
  const mobile = await browser.newPage();

  await shot(desktop, base('/dev/vehicle-card'), 'final-dashboard-desktop.png');
  await shot(mobile, base('/dev/vehicle-card'), 'final-dashboard-mobile.png', 390);

  await shot(desktop, base('/dev/vehicle-new-form'), 'final-new-vehicle-form-step1.png');
  await shot(desktop, base('/dev/vehicle-form-live'), 'final-new-vehicle-form-step1-live.png');
  await desktop.goto(base('/dev/vehicle-form-live/full'), { waitUntil: 'networkidle', timeout: 90000 });
  await desktop.waitForTimeout(600);
  await desktop.screenshot({
    path: join(outDir, 'final-new-vehicle-form-full-all-sections.png'),
    fullPage: true,
  });
  console.log('OK', join(outDir, 'final-new-vehicle-form-full-all-sections.png'));
  await shot(desktop, base('/dev/vehicle-form-live/full'), 'final-new-vehicle-form-gov-filled.png', 1280, false);
  await shot(desktop, base('/dev/vehicle-form-live'), 'final-new-vehicle-form-cancel.png', 1280, false);
  await shot(desktop, base('/vehicles'), 'final-vehicles-import-button.png', 1280, false).catch(() =>
    console.warn('Skip vehicles list — need login'),
  );
  await shot(desktop, base('/dev/vehicle-flows'), 'final-flows-guide.png');

  const hub = await browser.newPage();
  await hub.setViewportSize({ width: 1280, height: 900 });
  await hub.goto(base('/dev/vehicle-card'), { waitUntil: 'networkidle', timeout: 90000 });
  await hub.waitForTimeout(500);
  await hub.getByRole('button', { name: /ביטוחים ורישיונות/ }).click();
  await hub.waitForTimeout(400);
  await hub.screenshot({ path: join(outDir, 'final-insurance-drilldown.png'), fullPage: false });

  await hub.goto(base('/dev/vehicle-card'), { waitUntil: 'networkidle' });
  await hub.getByRole('button', { name: /חוסרים והתראות/ }).click();
  await hub.waitForTimeout(400);
  await hub.screenshot({ path: join(outDir, 'final-gaps-drilldown.png'), fullPage: false });

  await hub.goto(base('/dev/vehicle-card'), { waitUntil: 'networkidle' });
  await hub.getByText('פרטי רכב').first().click();
  await hub.waitForTimeout(400);
  await hub.screenshot({ path: join(outDir, 'final-details-section.png'), fullPage: true });

  await hub.goto(base('/dev/vehicle-card'), { waitUntil: 'networkidle' });
  await hub.getByText('היסטוריית רכב').click();
  await hub.waitForTimeout(400);
  await hub.screenshot({ path: join(outDir, 'final-history-section.png'), fullPage: true });

  await hub.goto(base('/dev/vehicle-card'), { waitUntil: 'networkidle' });
  await hub.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await hub.waitForTimeout(400);
  await hub.screenshot({
    path: join(outDir, 'final-bottom-actions.png'),
    fullPage: false,
  });

  await shot(desktop, base('/vehicle-hub-app-preview.html'), 'final-app-integrated-preview.png');

  async function appTab(tabId, name) {
    await desktop.goto(base('/vehicle-hub-app-preview.html'), { waitUntil: 'networkidle', timeout: 90000 });
    await desktop.waitForTimeout(400);
    await desktop.locator(`button[data-s="${tabId}"]`).click();
    await desktop.waitForTimeout(400);
    const outPath = join(outDir, name);
    await desktop.screenshot({ path: outPath, fullPage: true });
    console.log('OK', outPath);
  }
  await appTab('new', 'final-gov-registry-preview.png');
  await appTab('archive', 'final-archive-confirm-preview.png');
  await appTab('delete', 'final-delete-confirm-preview.png');
  await appTab('gaps', 'final-gaps-alerts-preview.png');
  await shot(desktop, base('/vehicle-hub-full-preview.html'), 'final-html-hub-desktop.png');

  try {
    await shot(desktop, base('/vehicle-import'), 'final-vehicle-import.png');
  } catch {
    console.warn('Skip /vehicle-import — need login');
  }

  await hub.close();
  await desktop.close();
  await mobile.close();
} finally {
  await browser.close();
}
