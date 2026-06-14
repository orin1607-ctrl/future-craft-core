/**
 * Capture document UX QA preview page (no auth required).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE = process.env.PREVIEW_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'document-ux-qa');
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  await page.goto(`${BASE}/dev/document-ux-preview`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT, 'document-ux-cards.png'), fullPage: true });
  console.log('saved document-ux-cards.png');

  await page.getByRole('button', { name: 'צפייה' }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, 'document-ux-pdf-preview.png'), fullPage: false });
  console.log('saved document-ux-pdf-preview.png');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'צפייה' }).nth(1).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, 'document-ux-image-preview.png'), fullPage: false });
  console.log('saved document-ux-image-preview.png');

  await browser.close();
  console.log('DONE', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
