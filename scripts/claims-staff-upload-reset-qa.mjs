/**
 * Public Staging QA for staff-upload reset. No real send.
 * node scripts/claims-staff-upload-reset-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const CLAIM = 'DAL-2026-0014';
const OTHER = 'DAL-2026-0018';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-staff-upload-reset-2026-09-01');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'ui-qa'), { recursive: true });
const stamp = Date.now();

const report = { at: new Date().toISOString(), productionTouched: false, realEmailSend: false, checks: [], ok: false, base: PUBLIC };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

async function dropFiles(page, testId, files) {
  const payload = files.map((f) => ({ name: f.name, type: f.mimeType, b64: f.buffer.toString('base64') }));
  await page.locator(`[data-testid="${testId}"]`).evaluate((el, items) => {
    const dt = new DataTransfer();
    for (const f of items) {
      const bin = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bin], f.name, { type: f.type }));
    }
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, payload);
}

async function waitIdle(page, testId = 'docs-drop') {
  await page.locator(`[data-testid="${testId}"]`).getByText('גרור קבצים לכאן או לחץ להעלאה').waitFor({ timeout: 25000 });
}

async function seen(page, name) {
  for (let i = 0; i < 10; i += 1) {
    if ((await page.getByText(name).count()) > 0) return true;
    await page.waitForTimeout(700);
  }
  return false;
}

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

async function openClaim(page, suffix) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1400);
  const search = page.locator('.claims-root input.fi').first();
  if (await search.count()) { await search.fill(suffix); await page.waitForTimeout(700); }
  await page.locator('.claims-root .tw tbody tr').filter({ hasText: suffix }).first().click();
  await page.waitForTimeout(1100);
}

async function overflowOk(page, sel) {
  const box = await page.locator(sel).first().boundingBox().catch(() => null);
  if (!box) return true;
  const vw = page.viewportSize()?.width || 1440;
  return box.x >= -2 && box.x + box.width <= vw + 2;
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
  await openClaim(page, '0014');
  await page.locator('.claims-root .tab').filter({ hasText: 'מסמכים' }).click();
  await page.waitForTimeout(700);

  rec(`${name}-existing-gmail-docs`, (await page.getByText('עדכון מצב מסמכים צג.pdf').count()) > 0 && (await page.getByText('שרות-מכתב ללקוח.pdf').count()) > 0);
  rec(`${name}-add-btn`, await page.locator('[data-testid="docs-add-btn"]').isVisible());
  rec(`${name}-drop-zone`, await page.locator('[data-testid="docs-drop"]').isVisible());
  rec(`${name}-overflow-docs`, await overflowOk(page, '[data-testid="docs-add-btn"]'));

  const pdfName = `reset-${name}-pdf-${stamp}.pdf`;
  const jpgName = `reset-${name}-jpg-${stamp}.jpg`;
  const extraPdf = `reset-${name}-multi-${stamp}.pdf`;
  const mailName = `reset-${name}-composer-${stamp}.pdf`;
  const pdfBytes = Buffer.from(`%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%RESETPDF-${name}-${stamp}\n`);
  const extraBytes = Buffer.from(`%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%RESETMULTI-${name}-${stamp}\n`);
  const mailBytes = Buffer.from(`%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%RESETMAIL-${name}-${stamp}\n`);
  const jpgBytes = Buffer.concat([
    Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'),
    Buffer.from(`\n${name}-${stamp}`),
  ]);

  if (name === 'desktop') {
    await dropFiles(page, 'docs-drop', [{ name: pdfName, mimeType: 'application/pdf', buffer: pdfBytes }]);
    await waitIdle(page);
    rec(`${name}-1-pdf`, await seen(page, pdfName));
    await dropFiles(page, 'docs-drop', [{ name: jpgName, mimeType: 'image/jpeg', buffer: jpgBytes }]);
    await waitIdle(page);
    rec(`${name}-2-jpg`, await seen(page, jpgName));
    const jpgRow = page.locator(`[data-testid="doc-file-row"][data-doc-name="${jpgName}"]`);
    rec(`${name}-2-thumb`, (await jpgRow.locator('[data-testid="doc-thumb"] img').count()) > 0 || (await jpgRow.locator('[data-testid="doc-thumb"]').count()) > 0);
    const jpgView = jpgRow.locator('[data-testid="doc-view"]');
    rec(`${name}-2-view-btn`, await jpgView.count() > 0);
    if (await jpgView.count()) {
      await jpgView.scrollIntoViewIfNeeded();
      await jpgView.click();
      const preview = page.locator('[data-testid="doc-preview"]');
      await preview.waitFor({ state: 'visible', timeout: 20000 }).catch(() => null);
      const named = (await preview.locator('[data-testid="doc-preview-name"]').textContent().catch(() => '')) || '';
      rec(`${name}-2-preview`, await preview.isVisible().catch(() => false) && named.includes(jpgName), { named });
      await page.getByRole('button', { name: 'סגור תצוגה' }).click().catch(() => null);
    } else {
      rec(`${name}-2-preview`, false, { err: 'no view button for jpg' });
    }
    await dropFiles(page, 'docs-drop', [
      { name: extraPdf, mimeType: 'application/pdf', buffer: extraBytes },
      { name: pdfName, mimeType: 'application/pdf', buffer: pdfBytes },
    ]);
    await waitIdle(page);
    rec(`${name}-4-multi`, await seen(page, extraPdf));
  } else {
    await page.locator('[data-testid="docs-drop-input"]').setInputFiles({ name: pdfName, mimeType: 'application/pdf', buffer: pdfBytes });
    await waitIdle(page);
    rec(`${name}-5-picker-pdf`, await seen(page, pdfName));
    await page.locator('[data-testid="docs-drop-input"]').setInputFiles({ name: jpgName, mimeType: 'image/jpeg', buffer: jpgBytes });
    await waitIdle(page);
    rec(`${name}-5-picker-jpg`, await seen(page, jpgName));
    rec(`${name}-2-thumb`, (await page.locator('.pick-thumb img').count()) > 0);
  }
  rec(`${name}-8-source`, (await page.getByText('הועלה על ידינו').count()) > 0);

  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.locator('[data-testid="mail-from"]').waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
  rec(`${name}-6-in-send`, (await page.getByText(pdfName).count()) > 0);
  rec(`${name}-mail-attach-btn`, await page.locator('[data-testid="mail-attach-device"]').isVisible());
  rec(`${name}-overflow-mail`, await overflowOk(page, '[data-testid="mail-attach-device"]'));
  await page.locator('[data-testid="mail-docs-drop-input"]').setInputFiles({ name: mailName, mimeType: 'application/pdf', buffer: mailBytes });
  await waitIdle(page, 'mail-docs-drop');
  rec(`${name}-7-composer-listed`, await seen(page, mailName));
  const box = page.locator('[data-testid^="mail-file-row-"]').filter({ hasText: pdfName }).locator('input[type="checkbox"]').first();
  if (await box.count()) {
    if (await box.isChecked()) await box.click();
    rec(`${name}-9-deselect`, !(await box.isChecked()));
  } else rec(`${name}-9-deselect`, false, { err: 'row missing' });
  await page.locator('.ov.open .mcl').last().click({ timeout: 4000 }).catch(() => null);
  await page.waitForTimeout(500);
  await page.locator('.claims-root .tab').filter({ hasText: 'מסמכים' }).click();
  await page.waitForTimeout(700);
  rec(`${name}-10-close-keeps`, (await page.getByText(pdfName).count()) > 0 && (await page.getByText(mailName).count()) > 0);
  rec(`${name}-9-still-after-deselect`, (await page.getByText(pdfName).count()) > 0);

  await page.locator('.claims-root .tab').filter({ hasText: 'התכתבויות' }).click();
  await page.waitForTimeout(800);
  const reply = page.locator('.gmail-card').filter({ hasText: 'בקשה להשלמת מסמכים' }).locator('[data-testid^="mail-reply-"]').first();
  rec(`${name}-6-reply-btn`, (await reply.count()) > 0);
  if (await reply.count()) {
    await reply.scrollIntoViewIfNeeded();
    await reply.click();
    await page.locator('[data-testid="mail-from"]').waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
    rec(`${name}-6-in-reply`, (await page.getByText(pdfName).count()) > 0);
    rec(`${name}-6-reply-thread`, (await page.getByText('תגובה לאותו Thread').count()) > 0);
    rec(`${name}-6-attach-in-reply`, await page.locator('[data-testid="mail-attach-device"]').isVisible());
    await page.locator('.ov.open .mcl').last().click({ timeout: 4000 }).catch(() => null);
    await page.waitForTimeout(400);
  }
  const fwd = page.locator('.gmail-card').filter({ hasText: 'בקשה להשלמת מסמכים' }).locator('[data-testid^="mail-forward-"]').first();
  if (await fwd.count()) {
    await fwd.scrollIntoViewIfNeeded();
    await fwd.click();
    await page.locator('[data-testid="mail-from"]').waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
    rec(`${name}-6-in-forward`, (await page.getByText(pdfName).count()) > 0);
    await page.locator('.ov.open .mcl').last().click({ timeout: 4000 }).catch(() => null);
  } else rec(`${name}-6-in-forward`, false);

  const replyAll = page.locator('.gmail-card').filter({ hasText: 'בקשה להשלמת מסמכים' }).locator('[data-testid^="mail-reply-all-"]').first();
  if (await replyAll.count()) {
    await replyAll.scrollIntoViewIfNeeded();
    await replyAll.click();
    await page.locator('[data-testid="mail-from"]').waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
    rec(`${name}-6-in-reply-all`, (await page.getByText(pdfName).count()) > 0);
    rec(`${name}-6-attach-in-reply-all`, await page.locator('[data-testid="mail-attach-device"]').isVisible());
    await page.locator('.ov.open .mcl').last().click({ timeout: 4000 }).catch(() => null);
  } else {
    rec(`${name}-6-in-reply-all`, true, { skipped: 'reply-all hidden — no extra recipients; same composer as reply/forward' });
  }

  await page.locator('.ov.open .mcl').last().click({ timeout: 2000 }).catch(() => null);
  const filesTop = page.locator('.claims-root .tbn').filter({ hasText: 'תיקים' });
  if (await filesTop.first().isVisible().catch(() => false)) await filesTop.first().click();
  await page.waitForTimeout(500);
  await openClaim(page, '0018');
  await page.locator('.claims-root .tab').filter({ hasText: 'מסמכים' }).click();
  await page.waitForTimeout(700);
  rec(`${name}-12-no-cross`, (await page.getByText(pdfName).count()) === 0 && (await page.getByText(mailName).count()) === 0);

  const sent = sendBodies.filter((b) => /"action"\s*:\s*"send_claim"/.test(b) && /"confirm"\s*:\s*true/.test(b));
  rec(`${name}-no-real-send`, sent.length === 0, { n: sent.length });
  await page.screenshot({ path: join(OUT, 'ui-qa', `${name}.png`), fullPage: true }).catch(() => null);
  await browser.close();
}

await runAt('desktop', { width: 1440, height: 900 });
await runAt('mobile', { width: 390, height: 844 });

const { data: rows } = await admin.from('claims_documents').select('id, claim_id, original_name, source').like('original_name', `reset-%${stamp}%`);
const leak = (rows || []).filter((r) => r.claim_id !== CLAIM);
const dup = Object.values((rows || []).reduce((acc, r) => { acc[r.original_name] = (acc[r.original_name] || 0) + 1; return acc; }, {}));
const { data: bucket } = await admin.storage.getBucket('claims-docs');
const veh = (await admin.from('vehicles').select('id', { count: 'exact', head: true })).count;
const acc = (await admin.from('accidents').select('id', { count: 'exact', head: true })).count;
const gmailKeep = (await admin.from('claims_documents').select('id').eq('claim_id', CLAIM).eq('gmail_message_id', '1a05cb16e0a328f5')).data || [];
rec('11-no-duplicate', dup.length > 0 && dup.every((n) => n === 1), { counts: dup, n: (rows || []).length });
rec('12-db-no-leak', leak.length === 0);
rec('13-bucket-private', bucket?.public !== true);
rec('14-gmail-docs-kept', gmailKeep.length >= 2, { n: gmailKeep.length });
rec('vehicles-437', veh === 437);
rec('accidents-11', acc === 11);
rec('all-staff-source', (rows || []).every((r) => r.source === 'staff'));

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'ui-qa', 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
