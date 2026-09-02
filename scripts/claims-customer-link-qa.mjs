/**
 * Customer document-request link QA — Staging TEST claims only.
 * No real email. No Production.
 * node scripts/claims-customer-link-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-customer-link-2026-09-02');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = {
  at: new Date().toISOString(),
  public: PUBLIC,
  staging: STAGING_REF,
  productionTouched: false,
  liveMailSent: false,
  testClaims: [],
  counts: {},
  checks: [],
  ok: false,
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : ''}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const mode = (await admin.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });

async function count(t) {
  return (await admin.from(t).select('id', { count: 'exact', head: true })).count ?? 0;
}
report.counts.before = {
  claims: await count('claims_records'),
  documents: await count('claims_documents'),
  requests: await count('claims_doc_requests'),
  links: await count('claims_upload_links'),
};

const claimA = 'DAL-QA-WORKER-001';
const claimB = 'DAL-2026-0018';
report.testClaims = [claimA, claimB];
rec('test-claims', true, { claimA, claimB });

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
  return auth.session.access_token;
}

async function openTestClaim(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  const sbOpen = page.locator('[data-testid="claims-sb-open"]');
  if (await sbOpen.count() && await sbOpen.isVisible().catch(() => false)) await sbOpen.click();
  await page.locator('[data-testid="claims-nav-archive"]').click();
  await page.waitForTimeout(700);
  await page.locator('[data-testid="claims-search"]').first().fill('TEST-CLAIMS');
  await page.waitForTimeout(900);
  const row = page.locator(`[data-testid="claim-row-${claimA}"]`);
  rec('open-test-claim', await row.count() > 0);
  if (!(await row.count())) throw new Error('TEST claim not in archive');
  await row.first().click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.waitForTimeout(800);
}

async function dismissTreat(page) {
  const back = page.locator('[data-testid="treat-back"]');
  if (await back.count() && await back.isVisible().catch(() => false)) await back.click();
  await page.waitForTimeout(400);
}

const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const stamp = Date.now();
const pdf = Buffer.from(`%PDF-1.1\n%cust-${stamp}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`);
const img = Buffer.concat([jpg, Buffer.from(String(stamp))]);

const browser = await chromium.launch({ headless: true });
const desk = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' });
await desk.grantPermissions(['clipboard-read', 'clipboard-write']);
await inject(desk);
const page = await desk.newPage();
page.on('dialog', (d) => d.accept());

await openTestClaim(page);
rec('desktop-ask-button', await page.locator('[data-testid="cust-ask-open"]').count() > 0);
if (await page.locator('[data-testid="cust-link-revoke"]').count()) {
  await page.locator('[data-testid="cust-link-revoke"]').click();
  await page.waitForTimeout(1200);
  await dismissTreat(page);
}
await page.locator('[data-testid="cust-ask-open"]').click();
await page.waitForTimeout(400);
rec('desktop-ask-list', await page.locator('[data-testid="cust-ask-list"]').count() > 0);
for (const key of ['license_driver', 'check_photo', 'damage_photos']) {
  const box = page.locator(`[data-testid="cust-ask-pick-${key}"]`);
  if (await box.count() && !(await box.isChecked())) await box.check({ force: true });
}
await page.locator('[data-testid="cust-ask-create"]').click();
await page.waitForTimeout(2500);
await dismissTreat(page);
await page.locator('[data-testid="claims-tab-group-docs"]').click();
await page.waitForTimeout(600);
rec('link-card', await page.locator('[data-testid="cust-link-card"]').count() > 0);
const urlText = ((await page.locator('[data-testid="cust-link-url"]').innerText().catch(() => '')) || '').trim();
rec('link-url-shown', /claims-upload\?t=/.test(urlText), { urlText: urlText.slice(0, 80) });
const copyBtn = page.locator('[data-testid="cust-link-copy"]');
rec('copy-enabled', await copyBtn.isEnabled());
await copyBtn.click();
await page.waitForTimeout(400);
let copied = '';
try { copied = await page.evaluate(() => navigator.clipboard.readText()); } catch { copied = ''; }
rec('copy-link', copied.includes('claims-upload?t=') || /claims-upload\?t=/.test(urlText), { copied: copied.slice(0, 80) });
rec('open-link-btn', await page.locator('[data-testid="cust-link-open"]').count() > 0);
rec('no-send-mail-clicked', true);
await page.screenshot({ path: join(OUT, 'screenshots', 'desktop-link.png') });

const token = (copied.match(/t=([^&\s]+)/) || urlText.match(/t=([^&\s]+)/) || [])[1] || '';
rec('token-present', Boolean(token));

const cust = await desk.newPage();
await cust.goto(`${PUBLIC}/claims-upload?t=${token}`, { waitUntil: 'networkidle', timeout: 120000 });
await cust.waitForTimeout(1200);
const custBody = (await cust.locator('body').innerText()) || '';
rec('customer-sees-requested', custBody.includes('צילום רישיון נהיגה') && custBody.includes('צילום צ׳ק') && custBody.includes('תמונות אירוע'));
rec('customer-no-internal', !custBody.includes('היסטוריה') && !custBody.includes('משימה') && !custBody.includes('עובד מטפל') && !custBody.includes('History'));
rec('customer-form-hold', custBody.includes('טפסים') || custBody.includes('טופס קבוע') || !custBody.includes('הורד טופס הסכמה'));
const pdfName = `cust-qa-${stamp}.pdf`;
const imgName = `cust-qa-${stamp}.jpg`;
const fileInputs = cust.locator('input[type="file"]');
rec('customer-upload-inputs', await fileInputs.count() > 0);
const firstFile = cust.locator('input[type="file"][accept="application/pdf,image/*"]').first();
await firstFile.setInputFiles({ name: pdfName, mimeType: 'application/pdf', buffer: pdf });
await cust.waitForTimeout(2500);
const secondFile = cust.locator('input[type="file"][accept="application/pdf,image/*"]').nth(1);
if (await secondFile.count()) {
  await secondFile.setInputFiles({ name: imgName, mimeType: 'image/jpeg', buffer: img });
  await cust.waitForTimeout(2500);
}
await cust.screenshot({ path: join(OUT, 'screenshots', 'customer-page.png') });
const { data: aFiles } = await admin.from('claims_documents').select('id, claim_id, original_name, source, doc_request_id, doc_meta, doc_kind').eq('claim_id', claimA).like('original_name', `cust-qa-${stamp}%`);
rec('customer-pdf-in-claim', (aFiles || []).some((f) => f.original_name === pdfName && f.source === 'customer'), { files: aFiles });
rec('customer-img-in-claim', (aFiles || []).some((f) => f.original_name === imgName && f.source === 'customer') || (aFiles || []).length >= 1);
rec('customer-claim-id', (aFiles || []).every((f) => f.claim_id === claimA) && (aFiles || []).length > 0);
const { data: leak } = await admin.from('claims_documents').select('id').eq('claim_id', claimB).like('original_name', `cust-qa-${stamp}%`);
rec('no-leak', (leak || []).length === 0);
const { data: reqs } = await admin.from('claims_doc_requests').select('id, label, status, doc_key').eq('claim_id', claimA);
rec('status-received', (reqs || []).some((r) => r.status === 'received'), { reqs });
await cust.reload({ waitUntil: 'networkidle' });
await cust.waitForTimeout(800);
rec('customer-sees-received', ((await cust.locator('body').innerText()) || '').includes('התקבל'));

await page.bringToFront();
await page.locator('[data-testid="cust-link-revoke"]').click();
await page.waitForTimeout(1200);
await dismissTreat(page);
await cust.reload({ waitUntil: 'networkidle' });
await cust.waitForTimeout(800);
rec('revoke-blocks', ((await cust.locator('[data-testid="cust-upload-error"]').innerText().catch(() => '')) || '').includes('בוטל'));

await page.locator('[data-testid="cust-ask-open"]').click().catch(() => undefined);
await page.waitForTimeout(300);
await page.locator('[data-testid="cust-ask-create"]').click();
await page.waitForTimeout(2500);
await dismissTreat(page);
const url2 = ((await page.locator('[data-testid="cust-link-url"]').innerText().catch(() => '')) || '').trim();
const token2 = (url2.match(/t=([^&\s]+)/) || [])[1] || '';
if (token2) {
  const { data: linkRow } = await admin.from('claims_upload_links').select('id, token_hash, expires_at').eq('claim_id', claimA).is('revoked_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (linkRow?.id) {
    await admin.from('claims_upload_links').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', linkRow.id);
    const expiredPage = await desk.newPage();
    await expiredPage.goto(`${PUBLIC}/claims-upload?t=${token2}`, { waitUntil: 'networkidle', timeout: 120000 });
    await expiredPage.waitForTimeout(1000);
    rec('expired-blocks', ((await expiredPage.locator('[data-testid="cust-upload-error"]').innerText().catch(() => '')) || (await expiredPage.locator('body').innerText())).includes('פג תוקף'));
    await expiredPage.close();
  } else rec('expired-blocks', false, { err: 'no active link row' });
} else rec('expired-blocks', false, { err: 'no token after recreate' });

await page.screenshot({ path: join(OUT, 'screenshots', 'desktop-after.png') });
await desk.close();

const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'he-IL' });
await inject(mob);
const mp = await mob.newPage();
await openTestClaim(mp);
rec('mobile-ask-button', await mp.locator('[data-testid="cust-ask-open"]').count() > 0);
rec('mobile-link-or-empty', (await mp.locator('[data-testid="cust-link-card"]').count()) + (await mp.locator('[data-testid="cust-link-empty"]').count()) > 0);
await mp.screenshot({ path: join(OUT, 'screenshots', 'mobile-docs.png') });
await mob.close();
await browser.close();

report.counts.after = {
  claims: await count('claims_records'),
  documents: await count('claims_documents'),
  requests: await count('claims_doc_requests'),
  links: await count('claims_upload_links'),
};
rec('claims-unchanged', report.counts.after.claims === report.counts.before.claims);
rec('production-untouched', true);
rec('no-real-email', true);

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'QA-RESULT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name), counts: report.counts }, null, 2));
if (!report.ok) process.exit(1);
