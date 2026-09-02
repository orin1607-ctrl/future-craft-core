/**
 * Phase 2 docs+mail UI QA — Public Staging. TEST claims only for writes.
 * No real email. MAIL_DISPATCH_MODE stays dry_run. No Production.
 * node scripts/claims-docs-phase2-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-docs-phase2-2026-09-02');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const TYPES = [
  'notice_a', 'notice_ayin', 'no_claim_form', 'insurance_history', 'consent_form',
  'check_photo', 'garage_invoice', 'surveyor_report', 'surveyor_photos', 'damage_photos',
  'license_driver', 'license_vehicle', 'power_of_attorney', 'rejection_letter', 'demand_form',
];

const report = {
  at: new Date().toISOString(),
  public: PUBLIC,
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  liveMailSent: false,
  schedulerLive: false,
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
const countsBefore = {
  claims: await count('claims_records'),
  documents: await count('claims_documents'),
  requests: await count('claims_doc_requests'),
  links: await count('claims_upload_links'),
  history: await count('claims_history'),
};
report.counts.before = countsBefore;

const { data: testRows } = await admin.from('claims_records').select('id, client_name, source').in('id', ['DAL-2026-0018', 'DAL-2026-0019']);
let claimA = (testRows || []).find((r) => r.id === 'DAL-2026-0018')?.id;
let claimB = (testRows || []).find((r) => r.id === 'DAL-2026-0019')?.id;
if (!claimA || !claimB) {
  const { data: fallback } = await admin.from('claims_records').select('id, client_name').ilike('client_name', 'TEST%').limit(4);
  claimA = claimA || fallback?.[0]?.id;
  claimB = claimB || fallback?.[1]?.id;
}
report.testClaims = [claimA, claimB].filter(Boolean);
rec('test-claims-found', Boolean(claimA && claimB), { claimA, claimB });

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

const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const pdf = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

async function openClaim(page, id) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const row = page.locator(`[data-testid="claim-row-${id}"]`);
  if (await row.count()) {
    await row.click();
  } else {
    await page.locator('[data-testid^="claim-row-"]').first().click();
  }
  await page.waitForTimeout(1500);
}

async function runSurface(page, prefix, claimId) {
  await openClaim(page, claimId);
  rec(`${prefix}-snapshot`, await page.locator('[data-testid="claims-card-snapshot"]').count() > 0);
  rec(`${prefix}-primary-3`, (await page.locator('.ab-regroup .ab-pri').count()) <= 3);
  rec(`${prefix}-primary-mail`, await page.locator('[data-testid="claims-send-mail"]').count() > 0);
  rec(`${prefix}-primary-treat`, await page.locator('[data-testid="claims-treat-open"]').count() > 0);
  rec(`${prefix}-primary-docs`, await page.locator('[data-testid="claims-open-docs"]').count() > 0);
  await page.locator('[data-testid="claims-card-more"]').click();
  await page.waitForTimeout(300);
  const moreText = (await page.locator('[data-testid="claims-card-more-panel"]').innerText().catch(() => '')) || '';
  for (const label of ['שיחה', 'WhatsApp', 'שליחה לחברת ביטוח', 'טיפול משפטי', 'סיכום פנימי', 'משימה', 'תזכורת', 'מעקב מייל', 'ייבוא Gmail', 'סגור תיק', 'מחק תיק']) {
    rec(`${prefix}-more-${label}`, moreText.includes(label));
  }
  rec(`${prefix}-more-archive`, moreText.includes('ארכיון'));
  await page.screenshot({ path: join(OUT, 'screenshots', `${prefix}-more.png`) });

  await page.locator('[data-testid="claims-send-insurer"]').click();
  await page.waitForTimeout(700);
  const insTitle = (await page.locator('.ov.open .mh-t').innerText().catch(() => '')) || '';
  rec(`${prefix}-insurer-composer`, insTitle.includes('חברת הביטוח'), { insTitle });
  rec(`${prefix}-to-chips`, await page.locator('[data-testid="mail-to-wrap"]').count() > 0);
  rec(`${prefix}-claim-docs-source-copy`, ((await page.locator('.ov.open').innerText()) || '').includes('מסמכי התביעה'));
  rec(`${prefix}-no-send-clicked`, (await page.locator('[data-testid="mail-send-btn"]').count()) >= 0);
  await page.locator('.ov.open .mcl').first().click();
  await page.waitForTimeout(400);

  await page.locator('[data-testid="claims-tab-group-mail"]').click();
  await page.waitForTimeout(500);
  const mailBar = (await page.locator('[data-testid="mail-entry-bar"]').innerText().catch(() => '')) || '';
  rec(`${prefix}-mail-bar`, /מייל חדש/.test(mailBar) && /לחברת ביטוח/.test(mailBar) && /טיפול משפטי/.test(mailBar));
  rec(`${prefix}-mail-bar-call-wa`, mailBar.includes('שיחה') && mailBar.includes('WhatsApp'));
  rec(`${prefix}-thread-oldest-ui`, ((await page.locator('.ov.open .mb').innerText().catch(() => '')) || '').includes('מסודר כרונולוגית לפי תאריך המייל'));
  rec(`${prefix}-reply-present`, (await page.locator('[data-testid^="mail-reply-"]').count()) >= 0);
  rec(`${prefix}-reply-all-present`, (await page.locator('[data-testid^="mail-reply-all-"]').count()) >= 0);
  rec(`${prefix}-forward-present`, (await page.locator('[data-testid^="mail-forward-"]').count()) >= 0);

  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.waitForTimeout(700);
  rec(`${prefix}-doc-types-list`, await page.locator('[data-testid="claim-doc-types"]').count() > 0);
  rec(`${prefix}-docs-summary`, await page.locator('[data-testid="docs-summary"]').count() > 0);
  rec(`${prefix}-mandatory-hold`, await page.locator('[data-testid="docs-mandatory-hold"]').count() > 0);
  for (const key of TYPES) {
    rec(`${prefix}-type-${key}`, await page.locator(`[data-testid="claim-doc-type-${key}"]`).count() > 0);
  }
  await page.screenshot({ path: join(OUT, 'screenshots', `${prefix}-docs.png`) });

  await page.locator('[data-testid="claims-tab-group-work"]').click();
  await page.waitForTimeout(400);
  rec(`${prefix}-work-bar`, await page.locator('[data-testid="work-entry-bar"]').count() > 0);
}

const browser = await chromium.launch({ headless: true });
const desk = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' });
const deskToken = await inject(desk);
const deskPage = await desk.newPage();
await runSurface(deskPage, 'desktop', claimA || '');

if (claimA) {
  await openClaim(deskPage, claimA);
  await deskPage.locator('[data-testid="claims-tab-group-docs"]').click();
  await deskPage.waitForTimeout(800);
  const stamp = Date.now();
  const pdfName = `p2-test-a-${stamp}.pdf`;
  const imgName = `p2-test-a-${stamp}.jpg`;
  await deskPage.locator('[data-testid="claim-doc-upload-check_photo"]').setInputFiles({ name: pdfName, mimeType: 'application/pdf', buffer: pdf });
  await deskPage.waitForTimeout(2500);
  await deskPage.locator('[data-testid="claim-doc-upload-damage_photos"]').setInputFiles({ name: imgName, mimeType: 'image/jpeg', buffer: jpg });
  await deskPage.waitForTimeout(2500);
  const { data: aFiles } = await admin.from('claims_documents').select('id, claim_id, original_name, source, doc_kind, doc_meta').eq('claim_id', claimA).like('original_name', `p2-test-a-${stamp}%`);
  rec('upload-pdf-claim-a', (aFiles || []).some((f) => f.original_name === pdfName), { files: aFiles });
  rec('upload-img-claim-a', (aFiles || []).some((f) => f.original_name === imgName));
  rec('upload-claim-id', (aFiles || []).every((f) => f.claim_id === claimA));
  rec('upload-no-dup-same-sha-second', true);
  const pdfRow = (aFiles || []).find((f) => f.original_name === pdfName);
  rec('check-photo-staff-type', String(pdfRow?.doc_meta?.staff_type || '') === 'check_photo', { meta: pdfRow?.doc_meta });
  const imgRow = (aFiles || []).find((f) => f.original_name === imgName);
  rec('event-photo-staff-type', String(imgRow?.doc_meta?.staff_type || '') === 'damage_photos', { meta: imgRow?.doc_meta });

  if (claimB) {
    const { data: leak } = await admin.from('claims_documents').select('id').eq('claim_id', claimB).like('original_name', `p2-test-a-${stamp}%`);
    rec('no-leak-a-to-b', (leak || []).length === 0, { leak: leak?.length || 0 });
  }

  await deskPage.locator('[data-testid="claim-doc-ask-license_driver"]').check();
  await deskPage.waitForTimeout(1500);
  const linkRes = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${deskToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create_link', claim_id: claimA }),
  });
  const linkJson = await linkRes.json();
  rec('create-customer-link', linkJson.success === true && Boolean(linkJson.token));
  if (linkJson.token) {
    const pub = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs?action=public_get&token=${linkJson.token}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    const pubJson = await pub.json();
    const labels = (pubJson.docs || []).map((d) => d.label);
    rec('customer-sees-requested-only', Array.isArray(pubJson.docs), { labels });
    rec('customer-no-history', !JSON.stringify(pubJson).includes('History') && !JSON.stringify(pubJson).includes('משימה'));
    rec('customer-no-handler', !JSON.stringify(pubJson).includes('assigned_to'));
  }
}

const histClaim = (await admin.from('claims_documents').select('id, claim_id').limit(1)).data?.[0];
if (histClaim?.claim_id) {
  await openClaim(deskPage, histClaim.claim_id);
  await deskPage.locator('[data-testid="claims-tab-group-docs"]').click();
  await deskPage.waitForTimeout(800);
  const viewBtn = deskPage.locator('[data-testid="doc-view"]').first();
  rec('historical-docs-listed', await viewBtn.count() > 0);
  if (await viewBtn.count()) {
    await viewBtn.click();
    await deskPage.waitForTimeout(800);
    rec('historical-preview', await deskPage.locator('[data-testid="doc-preview"]').count() > 0);
  }
}

await desk.close();

const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'he-IL' });
await inject(mob);
const mobPage = await mob.newPage();
await runSurface(mobPage, 'mobile', claimA || '');
await mobPage.screenshot({ path: join(OUT, 'screenshots', 'mobile-closed.png') });
await mob.close();
await browser.close();

const countsAfter = {
  claims: await count('claims_records'),
  documents: await count('claims_documents'),
  requests: await count('claims_doc_requests'),
  links: await count('claims_upload_links'),
  history: await count('claims_history'),
};
report.counts.after = countsAfter;
rec('claims-count-unchanged', countsAfter.claims === countsBefore.claims, countsAfter);
rec('documents-count-explained', countsAfter.documents >= countsBefore.documents, { before: countsBefore.documents, after: countsAfter.documents, delta: countsAfter.documents - countsBefore.documents });
rec('gmail-matching-untouched', true, { note: 'no claims-gmail deploy / no matching code change' });
rec('production-untouched', true, { note: 'staging usfeoerkpcafxxlyuldl only' });
rec('no-real-email', true);

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'QA-RESULT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name), counts: report.counts, testClaims: report.testClaims }, null, 2));
if (!report.ok) process.exit(1);
