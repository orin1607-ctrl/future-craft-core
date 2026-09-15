/**
 * PUBLIC STAGING browser QA for regular fleet_manager (Fleet A secret).
 * Never Production. Does not change Gmail / RLS / schema.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PAGES = 'https://orin1607-ctrl.github.io/future-craft-core/';
const LOGIN = `${PAGES}login`;
const email = String(process.env.STAGING_QA_FLEET_A_EMAIL || '').trim();
const password = String(process.env.STAGING_QA_FLEET_A_PASSWORD || '').trim();
const outDir = 'docs/screenshots/garage-ops-live-qa';

function abort(msg) {
  console.error('ABORT:', msg);
  process.exit(2);
}

if (!email || !password) abort('STAGING_QA_FLEET_A_EMAIL/PASSWORD missing');

mkdirSync(outDir, { recursive: true });
const report = { at: new Date().toISOString(), pages: PAGES, checks: {}, notes: [] };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(25000);

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.goto(LOGIN, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: join(outDir, '00-loaded.png'), fullPage: true });
const emailInput = page.locator('input[type="email"], input[placeholder*="אימייל"]').first();
await emailInput.waitFor({ timeout: 20000 });
await emailInput.fill(email);
await page.locator('input[type="password"]').first().fill(password);
await page.getByRole('button', { name: 'התחבר' }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: join(outDir, '01-after-login.png'), fullPage: true });

const body = await page.locator('body').innerText();
report.checks.otp_gate = /קוד|OTP|אימות/.test(body) && !body.includes('דליה — מרכז שליטה');
report.checks.regular_fleet_home = body.includes('דליה — מרכז שליטה');
report.checks.not_garage_ops_home = !body.includes('מרכז תפעול למוסך');
report.checks.white_screen = body.trim().length < 20;

if (report.checks.regular_fleet_home) {
  await page.goto(`${PAGES}garage-management/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(outDir, '02-fleet-a-garage-management.png'), fullPage: true });
  const garageBody = await page.locator('body').innerText();
  report.checks.regular_fleet_blocked_from_garage_management = !garageBody.includes('תיק מוסך חדש');
  await page.goto(`${PAGES}claims/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(outDir, '03-fleet-a-claims.png'), fullPage: true });
  await page.goto(`${PAGES}reports/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(outDir, '04-fleet-a-reports.png'), fullPage: true });
}

report.console_errors = consoleErrors.slice(0, 20);
writeFileSync(join(outDir, 'browser-qa.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
if (report.checks.white_screen) process.exit(2);
if (!report.checks.regular_fleet_home && !report.checks.otp_gate) process.exit(2);
process.exit(0);
