/**
 * Live QA — Task 5 gap alerts template (Staging only)
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const OUT = join(ROOT, 'docs/audit-reports/oren-car-gap-alerts-task5-qa');
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

function getKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

const { service, anon } = getKeys();
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  task5: {},
  regression: {},
  consoleErrors: [],
  networkErrors: [],
  screenshots: [],
};

async function injectSession(context) {
  const anonClient = createClient(STAGING_URL, anon);
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  const otp = linkData.properties?.email_otp;
  const { data: auth } = await anonClient.auth.verifyOtp({ email: EMAIL, token: otp, type: 'email' });
  const ref = new URL(STAGING_URL).hostname.split('.')[0];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${ref}-auth-token`,
      value: {
        access_token: auth.session.access_token,
        refresh_token: auth.session.refresh_token,
        expires_at: auth.session.expires_at,
        expires_in: auth.session.expires_in,
        token_type: auth.session.token_type,
        user: auth.session.user,
      },
    },
  );
}

function attach(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(`[${label}] ${m.text().slice(0, 300)}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if ((u.includes('supabase.co') || u.includes('future-craft-core')) && r.status() >= 400) {
      report.networkErrors.push(`[${label}] ${r.status()} ${u.slice(0, 180)}`);
    }
  });
}

async function shot(page, name) {
  const path = join(OUT, 'screenshots', name);
  await page.screenshot({ path, fullPage: true });
  report.screenshots.push(`screenshots/${name}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ...devices['Desktop Chrome'], locale: 'he-IL' });
  await injectSession(ctx);
  const page = await ctx.newPage();
  attach(page, 'desktop');

  // Lists dialog — third tab
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const listsBtn = page.getByRole('button', { name: /רשימות טיפול ובדיקה/ });
  report.task5.headerButton = (await listsBtn.count()) > 0;
  await shot(page, '01-vehicles-header.png');

  if (report.task5.headerButton) {
    await listsBtn.click();
    await page.waitForTimeout(800);
    const tabTreatment = page.getByRole('button', { name: 'סוגי טיפול' });
    const tabInspection = page.getByRole('button', { name: 'בדיקת תלת-חצי' });
    const tabGaps = page.getByRole('button', { name: 'חוסרים והתראות' });
    report.task5.tabTreatment = (await tabTreatment.count()) > 0;
    report.task5.tabInspection = (await tabInspection.count()) > 0;
    report.task5.tabGaps = (await tabGaps.count()) > 0;
    await shot(page, '02-dialog-treatment-tab.png');

    await tabGaps.click();
    await page.waitForTimeout(800);
    const body = await page.locator('[role="dialog"]').innerText();
    report.task5.gapsTabHasMissingDocs = body.includes('חוסר מסמכים');
    report.task5.gapsTabHasCompletionNote = body.includes('דורש השלמה') && body.includes('סיכום');
    await shot(page, '03-dialog-gaps-tab.png');

    // Rename first visible editable row
    const renameBtn = page.locator('[role="dialog"] button', { hasText: 'חוסר מסמכים' });
    if ((await renameBtn.count()) > 0) {
      await renameBtn.click();
      await page.locator('[role="dialog"] input').first().fill('QA-חוסר מסמכים');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }
    await page.getByRole('button', { name: 'שמור' }).click();
    await page.waitForTimeout(1500);
    report.task5.save = true;
    await shot(page, '04-dialog-gaps-saved.png');
  }

  // Vehicle card gaps sheet
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  const firstPlate = page.locator('a[href*="/vehicles/"]').first();
  if ((await firstPlate.count()) > 0) {
    await firstPlate.click();
    await page.waitForTimeout(2500);
    const gapsTile = page.getByText('חוסרים והתראות').first();
    if ((await gapsTile.count()) > 0) {
      await gapsTile.click();
      await page.waitForTimeout(1000);
      const sheetText = await page.locator('body').innerText();
      report.task5.vehicleSheetCustomLabel = sheetText.includes('QA-חוסר מסמכים');
      report.task5.vehicleSheetHasCompletion = sheetText.includes('דורש השלמה');
      await shot(page, '05-vehicle-gaps-sheet.png');
    }
  }

  // Regression: treatment tab still works
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  await listsBtn.click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'סוגי טיפול' }).click();
  const treatmentBody = await page.locator('[role="dialog"]').innerText();
  report.regression.treatmentHasOil = treatmentBody.includes('החלפת שמן');
  await shot(page, '06-regression-treatment-tab.png');

  // Cleanup DB
  await admin.from('company_settings').update({ custom_gap_alerts_config: null }).eq('company_name', COMPANY);
  report.task5.dbCleaned = true;

  await browser.close();
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
