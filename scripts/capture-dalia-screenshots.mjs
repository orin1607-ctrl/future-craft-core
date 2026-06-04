/**
 * Captures UI preview screenshots for VehicleNewFormDalia.
 * Usage: node scripts/capture-dalia-screenshots.mjs [baseUrl]
 * Requires: npx playwright (chromium)
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'docs', 'screenshots', 'vehicle-new-dalia');
const base = process.argv[2] || 'http://localhost:8080';
const url = `${base.replace(/\/$/, '')}/dev/vehicle-new-dalia`;

async function openAllSections(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.d-sec').forEach((el) => el.classList.add('open'));
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(60000);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.vehicle-new-dalia');

  const shots = [];

  // 1 full page (default - sec1 open)
  await page.screenshot({ path: path.join(outDir, '01-full-page-top.png'), fullPage: false });
  shots.push('01-full-page-top.png');

  // Quick start
  const qs = page.locator('#quick-start');
  await qs.screenshot({ path: path.join(outDir, '02-quick-start.png') });
  shots.push('02-quick-start.png');

  // Open all sections
  await openAllSections(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(outDir, '03-all-sections-headers.png'), fullPage: true });
  shots.push('03-all-sections-headers.png (full scroll)');

  // Ownership - select route and expand pledge
  await page.selectOption('select[name="ownership_route"]', { label: 'ליסינג תפעולי' });
  await page.waitForTimeout(400);
  await page.locator('#sec2').screenshot({ path: path.join(outDir, '04-ownership-leasing-operational.png') });
  shots.push('04-ownership-leasing-operational.png');

  await page.selectOption('select[name="ownership_route"]', { label: 'הלוואה / מימון' });
  await page.check('text=האם הרכב משועבד');
  await page.check('text=קיימת הלוואת מימון');
  await page.waitForTimeout(300);
  await page.locator('#sec2').screenshot({ path: path.join(outDir, '05-ownership-loan-pledge.png') });
  shots.push('05-ownership-loan-pledge.png');

  // Insurance
  await page.locator('#sec3').screenshot({ path: path.join(outDir, '06-insurance-licenses.png') });
  shots.push('06-insurance-licenses.png');

  // Maintenance
  await page.selectOption('select[name="maintenance_method"]', { label: 'תחזוקה עצמאית' });
  await page.waitForTimeout(200);
  await page.locator('#sec5').screenshot({ path: path.join(outDir, '07-maintenance.png') });
  shots.push('07-maintenance.png');

  // Documents - add sample
  const addDocCard = page.locator('#sec6 .d-card').filter({ hasText: 'הוספת מסמך' });
  await addDocCard.locator('input').nth(1).fill('פוליסת ביטוח 2025');
  await page.getByRole('button', { name: 'הוסף להיסטוריה' }).click();
  await page.locator('#sec6').screenshot({ path: path.join(outDir, '08-documents.png') });
  shots.push('08-documents.png');

  // Summary
  await page.getByRole('button', { name: 'בדוק נתונים' }).click();
  await page.waitForTimeout(400);
  await page.locator('#sec7').screenshot({ path: path.join(outDir, '09-summary-before-save.png') });
  shots.push('09-summary-before-save.png');

  await browser.close();
  console.log('Saved to', outDir);
  shots.forEach((s) => console.log(' -', s));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
