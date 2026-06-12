/**
 * FleetOS module 1 fix verification + screenshots (dev preview route).
 * Usage: node scripts/capture-fleetos-fix-report.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = process.argv[2] || 'http://localhost:4173/future-craft-core';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'fleetos-module1-fix');
const BAD = 'הרכב לא נמצא';

mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  checks: {},
  shots: [],
};

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  report.shots.push(name);
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'he-IL', isMobile: true });

  for (const [page, label] of [
    [desktop, 'desktop'],
    [mobile, 'mobile'],
  ]) {
    await page.goto(`${BASE}/dev/fleetos-module1`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(600);

    report.checks[`${label}_title`] = (await page.getByText('מיקום צי חכם').count()) > 0;
    report.checks[`${label}_searchBtn`] = (await page.getByRole('button', { name: 'חפש' }).count()) > 0;
    report.checks[`${label}_clearBtn`] = (await page.getByRole('button', { name: 'נקה סינון' }).count()) > 0;

    await page.getByPlaceholder('12-345-67').fill('98-765');
    await page.getByRole('button', { name: 'חפש' }).click();
    await page.waitForTimeout(400);
    report.checks[`${label}_filterApplied`] = (await page.getByText('(1)').count()) > 0;

    await page.getByRole('button', { name: 'נקה סינון' }).click();
    await page.waitForTimeout(300);

    await page.locator('button[title*="12-345-67"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('button[data-vehicle-id="preview-v1"]').click();
    await page.waitForTimeout(900);

    const toasts = await page.evaluate(() =>
      [...document.querySelectorAll('[data-sonner-toast], ol[data-sonner-toaster] li')]
        .map((n) => n.textContent?.trim() || '')
        .filter(Boolean),
    );
    report.checks[`${label}_hubNoBadToast`] = !toasts.some((t) => t.includes(BAD));
    report.checks[`${label}_hubPlate`] = (await page.locator('body').innerText()).includes('12-345-67');

    const backBtn = page.getByRole('button', { name: /חזרה/ }).first();
    if (await backBtn.count()) {
      await backBtn.click();
      await page.waitForTimeout(400);
    }

    await page.goto(`${BASE}/dev/fleetos-module1`, { waitUntil: 'networkidle', timeout: 60000 });
    await shot(page, `${label}-fleetos-status.png`);
  }

  report.checks.bottomNav = (await desktop.getByRole('navigation', { name: 'ניווט FleetOS AI' }).locator('button').count()) === 4;

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
