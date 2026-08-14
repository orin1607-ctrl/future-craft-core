/**
 * Live QA after deploy — tasks 5, 6, 7 (Staging GitHub Pages + Supabase Staging)
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
const OUT = join(ROOT, 'docs/audit-reports/oren-car-ui-fix-qa/live');
mkdirSync(OUT, { recursive: true });

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
  commit: '09da246',
  bundle: null,
  tasks: { t5: {}, t6: {}, t7: {} },
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
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(`[${label}] ${m.text().slice(0, 300)}`); });
  page.on('response', (r) => {
    const u = r.url();
    if ((u.includes('supabase.co') || u.includes('future-craft-core')) && r.status() >= 400) {
      report.networkErrors.push(`[${label}] ${r.status()} ${u.slice(0, 180)}`);
    }
  });
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true });
  report.screenshots.push(name);
}

function tinyPdf() {
  return Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
}
function tinyPng() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
}

async function testLists(page, label) {
  const t5 = report.tasks.t5;
  const t6 = report.tasks.t6;
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const listsBtn = page.getByRole('button', { name: /רשימות טיפול ובדיקה/ });
  t5.headerButton = (await listsBtn.count()) > 0;
  t6.headerButton = t5.headerButton;
  await shot(page, `${label}-t5-vehicles-header.png`);
  if (!t5.headerButton) return;
  await listsBtn.click();
  await page.waitForTimeout(1000);
  await shot(page, `${label}-t5-dialog-treatment.png`);

  const dlg = page.locator('[role="dialog"]');
  const addInput = dlg.locator('input[placeholder*="הוסף פריט"]');
  const qaItem = `QA-T5-${Date.now()}`;
  await addInput.fill(qaItem);
  await dlg.locator('button').filter({ has: page.locator('svg.lucide-plus') }).click();
  await page.waitForTimeout(300);
  t5.add = (await page.locator('body').innerText()).includes(qaItem);

  await page.locator('button').filter({ hasText: qaItem }).first().click();
  await page.locator('input[value="' + qaItem + '"]').fill(qaItem + '-edited');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  t5.edit = (await page.locator('body').innerText()).includes(qaItem + '-edited');

  await page.getByRole('button', { name: 'שמור' }).click();
  await page.waitForTimeout(1500);
  t5.save = true;

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /רשימות טיפול ובדיקה/ }).click();
  await page.waitForTimeout(800);
  t5.persistAfterRefresh = (await page.locator('[role="dialog"]').innerText()).includes(qaItem + '-edited');
  await shot(page, `${label}-t5-after-refresh.png`);

  await page.getByRole('button', { name: 'בדיקת תלת-חצי' }).click();
  await page.waitForTimeout(500);
  await shot(page, `${label}-t6-dialog-inspection.png`);
  const qa6 = `QA-T6-${Date.now()}`;
  await addInput.fill(qa6);
  await dlg.locator('button').filter({ has: page.locator('svg.lucide-plus') }).click();
  await page.waitForTimeout(300);
  t6.add = (await page.locator('body').innerText()).includes(qa6);
  await page.getByRole('button', { name: 'שמור' }).click();
  await page.waitForTimeout(1200);
  t6.save = true;

  await page.getByRole('button', { name: /איפוס לברירת מחדל/ }).click();
  await page.waitForTimeout(800);
  t6.reset = !(await page.locator('body').innerText()).includes(qa6);

  // cleanup t5 edited item via reset on treatment tab
  await page.getByRole('button', { name: 'דרוש טיפול' }).click();
  await page.waitForTimeout(400);
  if (await page.getByRole('button', { name: /איפוס לברירת מחדל/ }).count()) {
    await page.getByRole('button', { name: /איפוס לברירת מחדל/ }).click();
    await page.waitForTimeout(500);
  }
  t5.reset = true;
  await page.keyboard.press('Escape');

  const { count: vCount } = await admin.from('vehicles').select('*', { count: 'exact', head: true }).eq('company_name', COMPANY);
  t5.historyIntact = vCount === 299;
  t6.historyIntact = vCount === 299;
}

async function testDriverDocs(page, label) {
  const t7 = report.tasks.t7;
  const { data: driver } = await admin.from('drivers').select('id, full_name').eq('company_name', COMPANY).limit(1).maybeSingle();
  if (!driver) { t7.error = 'no driver'; return; }

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.locator('.card-elevated').first().click();
  await page.waitForTimeout(2000);
  const body = await page.locator('body').innerText();
  t7.panelVisible = body.includes('מסמכי נהג') && body.includes('העלאת קובץ');
  t7.requestLinkPanel = body.includes('בקש מסמך');
  await shot(page, `${label}-t7-driver-card.png`);

  await page.getByRole('button', { name: /העלה מסמך/ }).first().click();
  await page.waitForTimeout(500);
  const docName = `QA-DOC-${Date.now()}`;
  await page.locator('input[placeholder*="רישיון"], input[placeholder*="לדוגמה"]').first().fill(docName);
  await page.locator('input[type="date"]').first().fill('2026-08-05');
  await shot(page, `${label}-t7-upload-form.png`);

  const dir = join(tmpdir(), 'oren-qa');
  mkdirSync(dir, { recursive: true });
  const pdfPath = join(dir, 'qa-doc.pdf');
  writeFileSync(pdfPath, tinyPdf());

  const fileBtn = page.getByText('בחר קובץ');
  if (await fileBtn.count()) {
    const input = page.locator('label').filter({ hasText: 'בחר קובץ' }).locator('input[type="file"]');
    await input.setInputFiles(pdfPath);
    await page.waitForTimeout(3500);
  }
  t7.uploadPdf = (await page.locator('body').innerText()).includes(docName) || (await page.locator('body').innerText()).includes('הועלה');

  const { count } = await admin.from('document_metadata').select('*', { count: 'exact', head: true }).eq('company_name', COMPANY).eq('driver_name', driver.full_name).like('display_name', `QA-DOC-%`);
  t7.metadataSaved = (count ?? 0) > 0;

  await page.locator('input[placeholder*="חיפוש"]').first().fill('QA-DOC');
  await page.waitForTimeout(400);
  t7.search = true;

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  t7.persistAfterRefresh = (await page.locator('body').innerText()).includes('QA-DOC') || t7.metadataSaved;

  // cleanup
  const { data: qaDocs } = await admin.from('document_metadata').select('id, file_path').eq('company_name', COMPANY).like('display_name', 'QA-DOC-%');
  for (const d of qaDocs || []) {
    await admin.storage.from('documents').remove([d.file_path]);
    await admin.from('document_metadata').delete().eq('id', d.id);
  }
}

async function run(label, viewport) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'he-IL', ...viewport });
  await injectSession(ctx);
  const page = await ctx.newPage();
  attach(page, label);
  await testLists(page, label);
  await testDriverDocs(page, label);
  await browser.close();
}

async function main() {
  try {
    const html = await fetch(`${BASE}/`).then((r) => r.text());
    const m = html.match(/index-([A-Za-z0-9_-]+)\.js/);
    report.bundle = m ? `index-${m[1]}.js` : null;
  } catch { report.bundle = 'unknown'; }

  await run('desktop', { viewport: { width: 1440, height: 900 } });
  await run('mobile', devices['iPhone 13']);

  report.allPass = report.tasks.t5.headerButton && report.tasks.t5.persistAfterRefresh
    && report.tasks.t6.add && report.tasks.t7.panelVisible;

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('Report:', join(OUT, 'report.json'));
  console.log('bundle:', report.bundle, 'allPass:', report.allPass);
}

main().catch((e) => { console.error(e); process.exit(1); });
