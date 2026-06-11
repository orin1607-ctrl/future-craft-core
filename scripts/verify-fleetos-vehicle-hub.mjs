/**
 * FleetOS → Vehicle Hub — 5 vehicles, no "הרכב לא נמצא" toast.
 * Usage: npm run dev && node scripts/verify-fleetos-vehicle-hub.mjs [port]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PORT = process.argv[2] || '8080';
const BASE = `http://localhost:${PORT}`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'fleetos-module1');

mkdirSync(OUT, { recursive: true });

const CASES = [
  { plate: '12-345-67', id: 'preview-v1', label: 'toyota' },
  { plate: '98-765-43', id: 'preview-v2', label: 'mazda-fault' },
  { plate: '11-222-33', id: 'preview-v3', label: 'kia-garage' },
  { plate: '77-888-99', id: 'preview-v4', label: 'hyundai-offline' },
  { plate: '55-444-22', id: 'preview-v5', label: 'skoda-no-driver' },
];

const BAD_TOAST = 'הרכב לא נמצא';

const report = {
  at: new Date().toISOString(),
  base: BASE,
  cases: [],
  consoleErrors: [],
  allOk: false,
};

async function collectToasts(page) {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll('[data-sonner-toast], [data-sonner-toaster] [data-content], ol[data-sonner-toaster] li');
    return [...nodes].map((n) => n.textContent?.trim() || '').filter(Boolean);
  });
}

async function runCase(page, { plate, id, label }) {
  const caseReport = { plate, expectedId: id, label, toasts: [] };

  await page.goto(`${BASE}/dev/fleetos-module1`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(500);

  await page.locator(`button[title*="${plate}"]`).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `09-selected-${label}.png`) });

  const hubBtn = page.locator(`button[data-vehicle-id="${id}"]`);
  caseReport.buttonVehicleId = await hubBtn.getAttribute('data-vehicle-id');
  caseReport.buttonPlate = await hubBtn.getAttribute('data-vehicle-plate');

  await hubBtn.click();
  await page.waitForURL(new RegExp(`vehicleId=${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
    timeout: 20000,
  });
  await page.waitForTimeout(1200);

  caseReport.toasts = await collectToasts(page);
  caseReport.badToast = caseReport.toasts.some((t) => t.includes(BAD_TOAST));

  const body = await page.locator('body').innerText();
  caseReport.url = page.url();
  caseReport.urlHasId = caseReport.url.includes(`vehicleId=${id}`);
  caseReport.hubShowsPlate = body.includes(plate);

  await page.screenshot({ path: join(OUT, `10-hub-${label}.png`), fullPage: true });

  caseReport.ok =
    caseReport.urlHasId &&
    caseReport.hubShowsPlate &&
    caseReport.buttonVehicleId === id &&
    caseReport.buttonPlate === plate &&
    !caseReport.badToast;

  report.cases.push(caseReport);

  await page.goto(`${BASE}/dev/fleetos-module1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });

  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (e) => report.consoleErrors.push(e.message));

  for (const c of CASES) {
    await runCase(page, c);
  }

  report.allOk = report.cases.every((c) => c.ok);
  report.noBadToastAnywhere = report.cases.every((c) => !c.badToast);
  report.consoleClean = report.consoleErrors.filter((e) => !e.includes('favicon')).length === 0;

  writeFileSync(join(OUT, 'hub-verify-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  process.exit(report.allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
