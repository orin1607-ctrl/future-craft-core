/**
 * Phase 0 — preview screenshots via real "continue" click (no DB).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = `http://localhost:${process.env.DEV_PORT || '8080'}`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'phase0-flow');
const PLATE = '99-888-77';
const INTERNAL = 'INT-001';

mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}/dev/vehicle-form-live`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(OUT, '01-new-vehicle-opening.png') });

  await page.locator('input[placeholder="12-345-67"]').fill(PLATE);
  await page.locator('input[placeholder="מספר פנימי בארגון..."]').fill(INTERNAL);
  await page.screenshot({ path: join(OUT, '02-plate-and-internal-entered.png') });

  await page.locator('button:has-text("המשך")').click();
  await page.waitForSelector('.vehicle-new-dalia', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(OUT, '03-after-continue-to-full-form.png') });
  await page.screenshot({ path: join(OUT, '04-full-dalia-form-opened.png'), fullPage: true });

  const formBg = await page.evaluate(() => {
    const el = document.querySelector('.vehicle-new-dalia');
    return el ? getComputedStyle(el).backgroundColor : null;
  });

  writeFileSync(
    join(OUT, 'report.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        plate: PLATE,
        internal: INTERNAL,
        pageErrors: errors,
        transitionOk: errors.length === 0 && (await page.locator('.vehicle-new-dalia').count()) > 0,
        formBackgroundColor: formBg,
      },
      null,
      2,
    ),
  );

  console.log('errors', errors);
  console.log('Done →', OUT);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
