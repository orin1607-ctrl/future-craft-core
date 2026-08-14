/**
 * Task 1 — full license upload verification (Staging only, cleans up after).
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ROOT = process.cwd();
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const OUT = join(ROOT, 'docs/audit-reports/oren-car-task1-license-verify');
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

const report = { at: new Date().toISOString(), desktop: {}, mobile: {}, cleanup: {} };

function tinyPng() {
  const p = join(tmpdir(), `qa-license-${Date.now()}.png`);
  writeFileSync(p, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  return p;
}

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

async function verifyDb(driver, qaLabel) {
  const { data: drv } = await admin.from('drivers').select('id,full_name,company_name,license_image_url').eq('id', driver.id).maybeSingle();
  const { data: meta } = await admin
    .from('document_metadata')
    .select('*')
    .eq('company_name', COMPANY)
    .eq('driver_name', driver.full_name)
    .eq('category', 'driver-license')
    .order('created_at', { ascending: false })
    .limit(5);
  const qaMeta = (meta || []).find((m) => (m.display_name || '').includes(qaLabel));
  let storageOk = false;
  if (qaMeta?.file_path) {
    const { data: listed } = await admin.storage.from('documents').list(qaMeta.file_path.split('/').slice(0, -1).join('/'));
    const fname = qaMeta.file_path.split('/').pop();
    storageOk = !!(listed || []).find((f) => f.name === fname);
    if (!storageOk) {
      const { data: blob } = await admin.storage.from('documents').download(qaMeta.file_path);
      storageOk = !!blob;
    }
  }
  return {
    companyMatch: drv?.company_name === COMPANY,
    licenseImageUrl: drv?.license_image_url || null,
    licenseUrlSet: !!drv?.license_image_url,
    metadataRow: qaMeta || null,
    metadataFound: !!qaMeta,
    storageOk,
    publicUrlReachable: false,
  };
}

async function runUploadFlow(page, label, driver) {
  const qaLabel = `QA-T1-${Date.now()}`;
  const r = { label, qaLabel, steps: {} };

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);

  const card = page.locator('.card-elevated').filter({ hasText: driver.full_name.split(' ')[0] }).first();
  await card.click();
  await page.waitForTimeout(1500);
  r.steps.openedDriverCard = (await page.locator('body').innerText()).includes(driver.full_name);
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-01-driver-card-before.png`), fullPage: true });

  const uploadBtn = page.getByRole('button', { name: /העלה מסמך/ });
  r.steps.hasUploadButton = (await uploadBtn.count()) > 0;
  await uploadBtn.click();
  await page.waitForTimeout(500);

  await page.locator('input[placeholder*="לדוגמה"]').fill(qaLabel);
  await page.locator('select').last().selectOption('driver-license');
  r.steps.formFilled = true;

  const filePath = tinyPng();
  const fileInput = page.locator('input[type="file"]').last();
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(4000);

  const body = await page.locator('body').innerText();
  r.steps.toastSuccess = body.includes('הועלה') || body.includes('נשמר');
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-02-after-upload.png`), fullPage: true });

  const db = await verifyDb(driver, qaLabel);
  r.db = db;
  if (db.licenseImageUrl) {
    try {
      const res = await fetch(db.licenseImageUrl, { method: 'HEAD' });
      db.publicUrlReachable = res.ok;
    } catch {
      db.publicUrlReachable = false;
    }
  }

  r.steps.uiShowsInPanel = body.includes(qaLabel) || body.includes('רישיון נהיגה');
  r.steps.uiShowsLicenseAttachment = body.includes('צילום רישיון נהיגה') || !!db.licenseUrlSet;

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const afterReload = await page.locator('body').innerText();
  r.steps.afterReloadPanel = afterReload.includes(qaLabel) || afterReload.includes('רישיון נהיגה');
  r.steps.afterReloadLicenseUrl = (await verifyDb(driver, qaLabel)).licenseUrlSet;
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-03-after-reload.png`), fullPage: true });

  r.pass =
    db.companyMatch &&
    db.metadataFound &&
    db.storageOk &&
    db.licenseUrlSet &&
    r.steps.afterReloadPanel &&
    r.steps.afterReloadLicenseUrl;

  r.cleanup = { metadataId: db.metadataRow?.id, filePath: db.metadataRow?.file_path };
  return r;
}

async function main() {
  const { data: driver } = await admin
    .from('drivers')
    .select('id, full_name, company_name, license_image_url')
    .eq('company_name', COMPANY)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!driver) throw new Error('No test driver');

  report.driver = { id: driver.id, name: driver.full_name, company: driver.company_name, licenseBefore: driver.license_image_url };

  const browser = await chromium.launch({ headless: true });

  const dCtx = await browser.newContext({ ...devices['Desktop Chrome'], locale: 'he-IL' });
  await injectSession(dCtx);
  const dPage = await dCtx.newPage();
  report.desktop = await runUploadFlow(dPage, 'desktop', driver);
  await dCtx.close();

  const mCtx = await browser.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  await injectSession(mCtx);
  const mPage = await mCtx.newPage();
  report.mobile = await runUploadFlow(mPage, 'mobile', driver);
  await mCtx.close();

  // Cleanup QA artifacts
  const metaId = report.desktop.cleanup?.metadataId;
  const fp = report.desktop.cleanup?.filePath;
  if (fp) await admin.storage.from('documents').remove([fp]);
  if (metaId) await admin.from('document_metadata').delete().eq('id', metaId);
  await admin.from('drivers').update({ license_image_url: driver.license_image_url }).eq('id', driver.id);
  report.cleanup = { removedMetadata: metaId, removedFile: fp, restoredLicenseUrl: true };

  report.overallPass = report.desktop.pass && report.mobile.pass;

  await browser.close();
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ overallPass: report.overallPass, desktop: report.desktop.pass, mobile: report.mobile.pass }, null, 2));
  process.exit(report.overallPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
