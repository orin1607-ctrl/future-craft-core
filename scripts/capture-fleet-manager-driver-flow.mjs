/**
 * Capture fleet manager → driver → driver dashboard flow (dev preview).
 * Usage: npm run dev && node scripts/capture-fleet-manager-driver-flow.mjs [port]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PORT = process.argv[2] || process.env.DEV_PORT || '8080';
const BASE = `http://localhost:${PORT}`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'fleet-manager-driver-flow');

mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  route: '/dev/fleet-manager-driver-flow',
  shots: [],
};

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  report.shots.push(name);
  console.log('OK', path);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/dev/fleet-manager-driver-flow`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(800);
  await shot(page, '01-full-flow-all-steps.png');

  await page.locator('text=שלב 1').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, '02-step1-fleet-manager-card.png');

  await page.locator('text=שלב 2').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, '03-step2-driver-open-dashboard-button.png');

  await page.locator('text=שלב 3').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, '04-step3-scoped-driver-dashboard.png');

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('Done.', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
