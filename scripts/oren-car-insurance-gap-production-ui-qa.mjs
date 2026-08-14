/**
 * Production UI QA — insurance gap fix (read-only browser)
 * node scripts/oren-car-insurance-gap-production-ui-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PROD = 'qasomfndnjuixgjmjwcm';
const BASE = 'https://dalia-car.online';
const EMAIL = 'k.auto@beeri.co.il';
const VEHICLE_ID = 'd0120681-5805-4d20-b267-bce756394ec4';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-insurance-gap-fix/production-qa');
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${PROD} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
const admin = createClient(`https://${PROD}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonClient = createClient(`https://${PROD}.supabase.co`, anon);

const report = { at: new Date().toISOString(), base: BASE, vehicleId: VEHICLE_ID, items: {}, consoleErrors: [], networkErrors: [] };

const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
const { data: auth } = await anonClient.auth.verifyOtp({ email: EMAIL, token: linkData.properties.email_otp, type: 'email' });

const browser = await chromium.launch({ headless: true });
for (const [label, ctxOpts] of [
  ['desktop', {}],
  ['mobile', devices['iPhone 13']],
]) {
  const context = await browser.newContext({ ...ctxOpts, locale: 'he-IL' });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${PROD}-auth-token`,
    value: {
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
      expires_at: auth.session.expires_at,
      expires_in: auth.session.expires_in,
      token_type: auth.session.token_type,
      user: auth.session.user,
    },
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(`${label}: ${m.text()}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && (u.includes('supabase') || u.includes('dalia-car'))) {
      report.networkErrors.push(`${label}: ${r.status()} ${u.slice(0, 120)}`);
    }
  });

  await page.goto(`${BASE}/vehicles?vehicleId=${VEHICLE_ID}&view=hub`, { waitUntil: 'networkidle', timeout: 120000 });
  const loggedIn = !page.url().includes('/login');
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-01-hub.png`), fullPage: true });

  await page.getByRole('button', { name: /ביטוחים ורישיונות/ }).click();
  await page.waitForTimeout(1000);
  const insText = await page.locator('body').innerText();
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-02-insurance.png`), fullPage: true });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: /חוסרים והתראות/ }).click();
  await page.waitForTimeout(1000);
  const gapsText = await page.locator('body').innerText();
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-03-gaps.png`), fullPage: true });

  report.items[label] = {
    loggedIn,
    insuranceShowsValid: /בתוקף/.test(insText),
    gapsNoFalseInsuranceGap: !/חוסר ביטוח[\s\S]{0,40}כן/.test(gapsText) && !/חוסר ביטוח\nכן/.test(gapsText),
    gapsInsuranceValue: (gapsText.match(/חוסר ביטוח[\s\S]{0,30}/) || [''])[0],
  };
  await context.close();
}

await browser.close();
report.accidentsOk = !report.networkErrors.some((e) => e.includes('accidents') && e.includes('400'));
report.overall =
  report.items.desktop?.loggedIn &&
  report.items.mobile?.loggedIn &&
  report.items.desktop?.gapsNoFalseInsuranceGap &&
  report.items.mobile?.gapsNoFalseInsuranceGap &&
  report.consoleErrors.length === 0 &&
  !report.networkErrors.some((e) => e.includes(' 400 ') || e.includes(' 500 '))
    ? 'PASS'
    : 'FAIL';
writeFileSync(join(OUT, 'ui-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.overall === 'PASS' ? 0 : 1);
