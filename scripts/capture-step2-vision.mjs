import { chromium } from 'playwright';
import { join } from 'path';

const port = process.env.DEV_PORT || '8082';
const outDir = join(process.cwd(), 'test-results');

async function shot(page, url, name, fullPage = true) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(600);
  const path = join(outDir, name);
  await page.screenshot({ path, fullPage });
  console.log('OK', path);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });

const base = `http://localhost:${port}`;
await shot(page, `${base}/dev/vehicle-new-step2-vision`, 'vision-step2-hub-shell.png');

// section 2 open, section 1 closed
await page.locator('[data-form-accordion="s1"] > button').first().click();
await page.waitForTimeout(200);
await page.locator('[data-form-accordion="s2"] > button').first().click();
await page.waitForTimeout(300);
await page.screenshot({
  path: join(outDir, 'vision-step2-accordion-toggle.png'),
  fullPage: true,
});
console.log('OK', join(outDir, 'vision-step2-accordion-toggle.png'));

// Hub details for comparison
await shot(page, `${base}/dev/vehicle-card`, 'vision-hub-reference-home.png', false);
await page.getByRole('button', { name: 'פרטי רכב' }).click();
await page.waitForTimeout(400);
await page.screenshot({
  path: join(outDir, 'vision-hub-details-reference.png'),
  fullPage: true,
});
console.log('OK', join(outDir, 'vision-hub-details-reference.png'));

await browser.close();
