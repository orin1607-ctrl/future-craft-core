import { chromium } from 'playwright';
import { join } from 'path';

const port = process.env.DEV_PORT || '8082';
const out = join(process.cwd(), 'test-results', 'final-new-vehicle-form-step2-accordion.png');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`http://localhost:${port}/dev/vehicle-form-live/full`, {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await page.waitForTimeout(500);
await page.locator('[data-form-accordion="s1"] > button').first().click();
await page.waitForTimeout(300);
await page.locator('[data-form-accordion="s2"] > button').first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
console.log('OK', out);
await browser.close();
