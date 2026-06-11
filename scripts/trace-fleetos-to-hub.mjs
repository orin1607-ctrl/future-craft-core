/**
 * Trace: Dashboard → FleetOS AI → select vehicle → open hub (dev preview path).
 * Usage: node scripts/trace-fleetos-to-hub.mjs [port]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PORT = process.argv[2] || '8080';
const BASE = `http://localhost:${PORT}`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'fleetos-module1');

const CASES = [
  { plate: '12-345-67', id: 'preview-v1', label: 'toyota' },
  { plate: '98-765-43', id: 'preview-v2', label: 'mazda' },
  { plate: '11-222-33', id: 'preview-v3', label: 'kia' },
  { plate: '77-888-99', id: 'preview-v4', label: 'hyundai' },
  { plate: '55-444-22', id: 'preview-v5', label: 'skoda' },
];

const BAD = /הרכב לא נמצא/;

mkdirSync(OUT, { recursive: true });

async function getToasts(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-sonner-toast], [data-sonner-toaster] li')]
      .map((n) => n.textContent?.trim() || '')
      .filter(Boolean),
  );
}

async function runCase(page, c) {
  const trace = { ...c, steps: [] };

  await page.goto(`${BASE}/dev/fleetos-dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  trace.steps.push('dashboard');
  await page.getByRole('link', { name: /מיקום צי חכם/i }).click();
  await page.waitForURL(/fleetos-module1/, { timeout: 15000 });
  trace.steps.push('fleetos');

  await page.locator(`button[title*="${c.plate}"]`).first().click();
  await page.waitForTimeout(400);
  trace.steps.push('selected');
  await page.screenshot({ path: join(OUT, `11-trace-selected-${c.label}.png`) });

  const btn = page.locator(`button[data-vehicle-id="${c.id}"]`);
  trace.sentVehicleId = await btn.getAttribute('data-vehicle-id');
  trace.sentPlate = await btn.getAttribute('data-vehicle-plate');

  await btn.click();
  await page.waitForURL(new RegExp(`vehicleId=${c.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
    timeout: 20000,
  });
  await page.waitForTimeout(1000);
  trace.steps.push('hub');
  trace.finalUrl = page.url();

  trace.toasts = await getToasts(page);
  trace.badToast = trace.toasts.some((t) => BAD.test(t));
  const body = await page.locator('body').innerText();
  trace.hubShowsPlate = body.includes(c.plate);
  trace.ok = trace.sentVehicleId === c.id && trace.hubShowsPlate && !trace.badToast;

  await page.screenshot({ path: join(OUT, `12-trace-hub-${c.label}.png`), fullPage: true });
  return trace;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  const report = { at: new Date().toISOString(), base: BASE, cases: [], allOk: false };

  for (const c of CASES) {
    report.cases.push(await runCase(page, c));
  }

  report.allOk = report.cases.every((x) => x.ok);
  writeFileSync(join(OUT, 'fleetos-hub-trace-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
