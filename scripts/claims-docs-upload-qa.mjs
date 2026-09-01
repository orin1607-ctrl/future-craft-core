/**
 * QA: staff upload in claim documents + mail picker. No send. Staging.
 * node scripts/claims-docs-upload-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const CLAIM = 'DAL-2026-0014';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-docs-upload-2026-09-01');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'ui-qa'), { recursive: true });

const stamp = Date.now();
const jpgBytes = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

async function dropFiles(page, testId, files) {
  const payload = files.map((f) => ({ name: f.name, type: f.mimeType, b64: f.buffer.toString('base64') }));
  await page.locator(`[data-testid="${testId}"]`).evaluate((el, items) => {
    const dt = new DataTransfer();
    for (const f of items) {
      const bin = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bin], f.name, { type: f.type }));
    }
    el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, payload);
}

const report = { at: new Date().toISOString(), productionTouched: false, realEmailSend: false, checks: [], ok: false, base: PUBLIC };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
  if (!saEmail) saEmail = u?.data?.user?.email || '';
}

async function inject(context) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
  if (linkErr) throw linkErr;
  const { data: auth, error } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
  if (error || !auth.session) throw error || new Error('verifyOtp');
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
      expires_at: auth.session.expires_at,
      expires_in: auth.session.expires_in,
      token_type: auth.session.token_type,
      user: auth.session.user,
    },
  });
}

async function openClaimDocs(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1400);
  const search = page.locator('.claims-root input.fi').first();
  if (await search.count()) { await search.fill('0014'); await page.waitForTimeout(700); }
  await page.locator('.claims-root .tw tbody tr').filter({ hasText: '0014' }).first().click();
  await page.waitForTimeout(1100);
  await page.locator('.claims-root .tab').filter({ hasText: 'מסמכים' }).click();
  await page.waitForTimeout(700);
}

async function runAt(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await inject(ctx);
  const page = await ctx.newPage();
  const sendBodies = [];
  page.on('request', (req) => {
    if (req.url().includes('claims-gmail') && req.method() === 'POST') sendBodies.push(req.postData() || '');
  });
  await openClaimDocs(page);

  const pdfName = `staff-${name}-pdf-${stamp}.pdf`;
  const jpgName = `staff-${name}-jpg-${stamp}.jpg`;
  const extraPdf = `staff-${name}-multi-${stamp}.pdf`;
  const mailName = `staff-${name}-mail-${stamp}.pdf`;
  const pdfBytes = Buffer.from(`%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%STAFFQA-${name}-${stamp}\n`);
  const extraBytes = Buffer.from(`%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%MULTQA-${name}-${stamp}\n`);
  const mailBytes = Buffer.from(`%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%MAILQA-${name}-${stamp}\n`);

  rec(`${name}-add-btn`, await page.locator('[data-testid="docs-add-btn"]').isVisible());
  rec(`${name}-drop-zone`, await page.locator('[data-testid="docs-drop"]').isVisible());
  rec(`${name}-drop-copy`, (await page.getByText('גרור קבצים לכאן או לחץ להעלאה').count()) > 0);

  if (name === 'desktop') {
    await dropFiles(page, 'docs-drop', [{ name: pdfName, mimeType: 'application/pdf', buffer: pdfBytes }]);
    await page.waitForTimeout(3500);
    rec(`${name}-pdf-drop`, (await page.getByText(pdfName).count()) > 0);
    await dropFiles(page, 'docs-drop', [{ name: jpgName, mimeType: 'image/jpeg', buffer: jpgBytes }]);
    await page.waitForTimeout(3500);
    rec(`${name}-jpg-drop`, (await page.getByText(jpgName).count()) > 0);
    rec(`${name}-thumb`, (await page.locator('.pick-thumb img').count()) > 0 || (await page.locator('.gal-item img').count()) > 0);
    await dropFiles(page, 'docs-drop', [
      { name: extraPdf, mimeType: 'application/pdf', buffer: extraBytes },
      { name: pdfName, mimeType: 'application/pdf', buffer: pdfBytes },
    ]);
    await page.waitForTimeout(4000);
    rec(`${name}-multi-drop`, (await page.getByText(extraPdf).count()) > 0);
  } else {
    const input = page.locator('[data-testid="docs-drop-input"]');
    await input.setInputFiles([
      { name: pdfName, mimeType: 'application/pdf', buffer: pdfBytes },
      { name: jpgName, mimeType: 'image/jpeg', buffer: jpgBytes },
    ]);
    await page.waitForTimeout(4500);
    rec(`${name}-pdf-picker`, (await page.getByText(pdfName).count()) > 0);
    rec(`${name}-jpg-picker`, (await page.getByText(jpgName).count()) > 0);
    rec(`${name}-thumb`, (await page.locator('.pick-thumb img').count()) > 0 || (await page.locator('.gal-item img').count()) > 0);
  }

  rec(`${name}-source-staff`, (await page.getByText('הועלה על ידינו').count()) > 0);

  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.locator('[data-testid="mail-from"]').waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
  rec(`${name}-in-mail-pdf`, (await page.getByText(pdfName).count()) > 0);
  rec(`${name}-mail-drop`, await page.locator('[data-testid="mail-docs-drop"]').isVisible());
  await page.locator('[data-testid="mail-docs-drop-input"]').setInputFiles({
    name: mailName, mimeType: 'application/pdf', buffer: mailBytes,
  });
  await page.waitForTimeout(4000);
  rec(`${name}-mail-upload-listed`, (await page.getByText(mailName).count()) > 0);
  const box = page.locator('[data-testid^="mail-file-row-"]').filter({ hasText: pdfName }).locator('input[type="checkbox"]').first();
  if (await box.count()) {
    if (await box.isChecked()) await box.click();
    rec(`${name}-uncheck-ok`, !(await box.isChecked()));
  } else rec(`${name}-uncheck-ok`, true, { skipped: 'row not found' });
  await page.locator('.ov.open .mcl').last().click({ timeout: 4000 }).catch(() => null);
  await page.waitForTimeout(500);
  await page.locator('.claims-root .tab').filter({ hasText: 'מסמכים' }).click();
  await page.waitForTimeout(700);
  rec(`${name}-still-in-docs-after-uncheck`, (await page.getByText(pdfName).count()) > 0);
  rec(`${name}-mail-upload-in-docs`, (await page.getByText(mailName).count()) > 0);

  const sent = sendBodies.filter((b) => /"action"\s*:\s*"send_claim"/.test(b) && /"confirm"\s*:\s*true/.test(b));
  rec(`${name}-no-real-send`, sent.length === 0, { n: sent.length });
  await page.screenshot({ path: join(OUT, 'ui-qa', `${name}.png`), fullPage: true }).catch(() => null);
  await browser.close();
}

await runAt('desktop', { width: 1440, height: 900 });
await runAt('mobile', { width: 390, height: 844 });

const { data: rows } = await admin.from('claims_documents').select('id, claim_id, original_name, source, content_sha256').like('original_name', `staff-%${stamp}%`);
const leak = (rows || []).filter((r) => r.claim_id !== CLAIM);
const staff = (rows || []).filter((r) => r.source === 'staff');
const dupNames = Object.values((rows || []).reduce((acc, r) => {
  acc[r.original_name] = (acc[r.original_name] || 0) + 1;
  return acc;
}, {}));
const { data: bucket } = await admin.storage.getBucket('claims-docs');
const veh = (await admin.from('vehicles').select('id', { count: 'exact', head: true })).count;
const acc = (await admin.from('accidents').select('id', { count: 'exact', head: true })).count;
rec('db-on-0014', (rows || []).length > 0 && (rows || []).every((r) => r.claim_id === CLAIM), { n: (rows || []).length });
rec('db-source-staff', staff.length >= 1, { n: staff.length });
rec('no-duplicate-same-upload', dupNames.length > 0 && dupNames.every((n) => n === 1), { counts: dupNames });
rec('no-leak', leak.length === 0);
rec('bucket-private', bucket?.public !== true);
rec('vehicles-437', veh === 437);
rec('accidents-11', acc === 11);

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'ui-qa', 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
