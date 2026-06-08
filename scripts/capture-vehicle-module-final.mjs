/**
 * Capture vehicle module completion screenshots (preview routes, no auth).
 * Usage: npm run dev  then  node scripts/capture-vehicle-module-final.mjs [port]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const port = process.argv[2] || process.env.DEV_PORT || '8080';
const outDir = join(process.cwd(), 'docs', 'screenshots', 'vehicle-module-final');
mkdirSync(outDir, { recursive: true });
const base = (path) => `http://localhost:${port}${path}`;

async function shot(page, url, name, opts = {}) {
  await page.setViewportSize({ width: opts.width || 1280, height: opts.height || 900 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(opts.wait || 600);
  const outPath = join(outDir, name);
  await page.screenshot({ path: outPath, fullPage: opts.fullPage !== false });
  console.log('OK', outPath);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();

  await shot(page, base('/dev/vehicle-form-live'), '01-new-vehicle-step1.png', { fullPage: false });
  await shot(page, base('/dev/vehicle-form-live/full'), '02-dalia-full-form.png');
  await page.goto(base('/dev/vehicle-form-live/full'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelectorAll('.d-sec').forEach((el) => el.classList.add('open')));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, '03-all-sections-open.png'), fullPage: true });
  console.log('OK', join(outDir, '03-all-sections-open.png'));

  await shot(page, base('/dev/vehicle-card'), '04-vehicle-hub-card.png', { fullPage: false });

  // Hub full panel preview via mock card
  await page.goto(base('/dev/vehicle-card'), { waitUntil: 'networkidle' });
  const detailsBtn = page.getByRole('button', { name: /פרטי רכב|כל שדות/ }).first();
  if (await detailsBtn.count()) {
    await detailsBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, '05-vehicle-hub-all-fields.png'), fullPage: true });
    console.log('OK', join(outDir, '05-vehicle-hub-all-fields.png'));
  }

  await shot(page, base('/dev/vehicle-new-dalia'), '06-dalia-form-standalone.png');
  await shot(page, base('/faults?plate=12-345-67&vehicleId=preview&context=vehicle'), '07-faults-scoped.png', { fullPage: false });

  console.log('\nScreenshots saved to', outDir);
} finally {
  await browser.close();
}
