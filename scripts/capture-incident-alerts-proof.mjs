/**
 * Capture screenshots of /dev/incident-alerts-proof (no login).
 * Usage: node scripts/capture-incident-alerts-proof.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = process.argv[2] || process.env.PROOF_BASE || 'http://127.0.0.1:4173/future-craft-core';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'incident-alerts-proof');
const ART = '/opt/cursor/artifacts/incident-alerts-proof';
mkdirSync(OUT, { recursive: true });
mkdirSync(ART, { recursive: true });

const sections = [
  ['01-fault-form', '#fault-form'],
  ['02-accident-form', '#accident-form'],
  ['03-success-event-number', '#success'],
  ['04-vehicle-tracking', '#tracking'],
  ['05-vehicle-card-hub', '#vehicle-card'],
  ['06-driver-card', '#driver-card'],
  ['07-fleet-manager-dashboard', '#fleet-dash'],
  ['08-driver-dashboard', '#driver-dash'],
  ['09-alert-settings', '#alert-settings'],
  ['10-whatsapp-preview', '#wa-preview'],
  ['11-email-preview', '#email-preview'],
];

const report = { at: new Date().toISOString(), base: BASE, shots: [] };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

const url = `${BASE.replace(/\/$/, '')}/dev/incident-alerts-proof`;
await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(800);

const fullPath = join(OUT, '00-full-page.png');
await page.screenshot({ path: fullPath, fullPage: true });
report.shots.push('00-full-page.png');
copyFileSync(fullPath, join(ART, '00-full-page.png'));

for (const [name, sel] of sections) {
  const el = page.locator(sel);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const path = join(OUT, `${name}.png`);
  await el.screenshot({ path });
  report.shots.push(`${name}.png`);
  copyFileSync(path, join(ART, `${name}.png`));
  console.log('OK', name);
}

// Also desktop viewport full page
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await desk.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
const deskFull = join(OUT, '00-full-page-desktop.png');
await desk.screenshot({ path: deskFull, fullPage: true });
report.shots.push('00-full-page-desktop.png');
copyFileSync(deskFull, join(ART, '00-full-page-desktop.png'));

await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
