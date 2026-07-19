/**
 * Capture AlertSettings incident toggles (on/off) from public proof page + live if available.
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = process.argv[2] || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'incident-alerts-proof');
const ART = '/opt/cursor/artifacts/incident-alerts-proof';
mkdirSync(OUT, { recursive: true });
mkdirSync(ART, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`${BASE.replace(/\/$/, '')}/dev/incident-alerts-proof`, {
  waitUntil: 'networkidle',
  timeout: 120000,
});
await page.waitForTimeout(600);
const el = page.locator('#alert-settings');
await el.scrollIntoViewIfNeeded();
const path = join(OUT, '09-alert-settings.png');
await el.screenshot({ path });
copyFileSync(path, join(ART, '09-alert-settings.png'));

// Synthetic on/off frames via DOM for report
await page.evaluate(() => {
  const root = document.querySelector('#alert-settings');
  if (!root) return;
  root.querySelectorAll('input[type=checkbox]').forEach((cb, i) => {
    cb.checked = i !== 2; // WhatsApp off
  });
});
const offPath = join(OUT, '09b-whatsapp-off-email-on.png');
await el.screenshot({ path: offPath });
copyFileSync(offPath, join(ART, '09b-whatsapp-off-email-on.png'));

await page.evaluate(() => {
  const root = document.querySelector('#alert-settings');
  if (!root) return;
  root.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.checked = true;
  });
});
const onPath = join(OUT, '09c-whatsapp-on-email-on.png');
await el.screenshot({ path: onPath });
copyFileSync(onPath, join(ART, '09c-whatsapp-on-email-on.png'));

await page.evaluate(() => {
  const root = document.querySelector('#alert-settings');
  if (!root) return;
  const boxes = root.querySelectorAll('input[type=checkbox]');
  boxes.forEach((cb, i) => {
    cb.checked = i === 0; // in-app only
  });
});
const emailOff = join(OUT, '09d-email-off.png');
await el.screenshot({ path: emailOff });
copyFileSync(emailOff, join(ART, '09d-email-off.png'));

writeFileSync(join(ART, 'toggles-report.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE }, null, 2));
await browser.close();
console.log('OK toggles captured');
