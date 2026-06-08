/**
 * Hebrew display proof — vehicle list, hub, card (localhost preview).
 * Usage: npm run dev && node scripts/capture-hebrew-fix.mjs [port]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PORT = process.argv[2] || process.env.DEV_PORT || '8080';
const BASE = `http://localhost:${PORT}`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'hebrew-fix');

mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  mode: 'localhost-preview',
  note: 'Hebrew fix verification — no push/deploy. Same UI strings as /vehicles after login.',
  shots: [],
};

async function shot(page, name, opts = {}) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: opts.fullPage !== false });
  report.shots.push(name);
  console.log('OK', path);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/dev/vehicles-list`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(600);
  await shot(page, '01-vehicles-list-hebrew.png', { fullPage: false });

  await page.goto(`${BASE}/dev/vehicle-card`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(800);
  await shot(page, '02-vehicle-hub-hebrew.png', { fullPage: false });

  await page.getByRole('button', { name: 'פרטי רכב' }).click();
  await page.waitForTimeout(600);
  await shot(page, '03-vehicle-card-full-panel-hebrew.png');

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\nSaved →', OUT);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
