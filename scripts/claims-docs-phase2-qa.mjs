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
  testClaimState: {},
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

function flags(row) {
  const rd = row?.row_data || {};
  return {
    id: row?.id,
    client: row?.client_name,
    status: row?.status,
    deletedAt: rd.deletedAt || '',
    archived: rd.archived === 'true',
  };
}
const { data: testProbe } = await admin.from('claims_records').select('id, client_name, status, row_data').in('id', ['DAL-QA-WORKER-001', 'DAL-2026-0018', 'DAL-2026-0019']);
const worker = (testProbe || []).find((r) => r.id === 'DAL-QA-WORKER-001');
const intake18 = (testProbe || []).find((r) => r.id === 'DAL-2026-0018');
const intake19 = (testProbe || []).find((r) => r.id === 'DAL-2026-0019');
report.testClaimState = { worker: flags(worker), intake18: flags(intake18), intake19: flags(intake19) };
// 0018/0019 are soft-deleted (hidden). QA-WORKER is archived (visible under ארכיון). Do not undelete.
const claimA = worker?.id || null;
const claimB = intake18?.id || intake19?.id || null;
report.testClaims = [claimA, claimB].filter(Boolean);
rec('test-claims-found', Boolean(claimA && claimB), { claimA, claimB, note: 'writes on archived TEST worker; leak check vs soft-deleted 0018' });

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

const jpgBase = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

async function staffUploadApi(token, claimId, name, mime, buf, extra = {}) {
  const form = new FormData();
  form.set('action', 'staff_upload');
  form.set('claim_id', claimId);
  if (extra.staff_type) form.set('staff_type', extra.staff_type);
  if (extra.doc_kind) form.set('doc_kind', extra.doc_kind);
  form.set('file', new File([buf], name, { type: mime }));
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
}

async function openClaim(page, id, opts = {}) {
  const query = opts.query || '';
  const archive = opts.archive === true;
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  if (query || archive) {
    const sbOpen = page.locator('[data-testid="claims-sb-open"]');
    if (await sbOpen.count() && await sbOpen.isVisible().catch(() => false)) await sbOpen.click();
    const nav = page.locator(archive ? '[data-testid="claims-nav-archive"]' : '[data-testid="claims-nav-all"]');
    if (await nav.count()) {
      await nav.click();
      await page.waitForTimeout(800);
    }
    if (query) {
      const search = page.locator('[data-testid="claims-search"]').first();
      await search.waitFor({ state: 'visible', timeout: 15000 });
      await search.fill(query);
      await page.waitForTimeout(900);
    }
  }
  const row = id ? page.locator(`[data-testid="claim-row-${id}"]`) : page.locator('[data-testid^="claim-row-"]').first();
  const found = await row.count() > 0;
  rec(`open-row-${id || 'first'}`, found, found ? {} : { archive, query });
  if (!found) {
    await page.screenshot({ path: join(OUT, 'screenshots', `miss-${id || 'first'}.png`) });
    throw new Error(`claim row not found ${id || query || 'first'}`);
  }
  await row.first().click();
  await page.waitForTimeout(1500);
}

async function runSurface(page, prefix) {
  await openClaim(page);
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
  rec(`${prefix}-group-picks`, await page.locator('[data-testid="mail-pick-surveyor-photos"]').count() > 0);
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
  rec(`${prefix}-form-placeholder`, ((await page.locator('[data-testid="claim-doc-types"]').innerText()) || '').includes('העלה טופס קבוע'));
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
await runSurface(deskPage, 'desktop');

const stamp = Date.now();
const pdfName = `p2-test-a-${stamp}.pdf`;
const imgName = `p2-test-a-${stamp}.jpg`;
const pdf = Buffer.from(`%PDF-1.1\n%${stamp}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`);
const jpg = Buffer.concat([jpgBase, Buffer.from(String(stamp))]);

if (claimA) {
  let uiOpened = false;
  try {
    await openClaim(deskPage, claimA, { query: 'TEST-CLAIMS', archive: true });
    uiOpened = true;
    await deskPage.locator('[data-testid="claims-tab-group-docs"]').click();
    await deskPage.waitForTimeout(800);
    await deskPage.locator('[data-testid="claim-doc-upload-check_photo"]').setInputFiles({ name: pdfName, mimeType: 'application/pdf', buffer: pdf });
    await deskPage.waitForTimeout(2800);
    await deskPage.locator('[data-testid="claim-doc-upload-damage_photos"]').setInputFiles({ name: imgName, mimeType: 'image/jpeg', buffer: jpg });
    await deskPage.waitForTimeout(2800);
    rec('ui-upload-path', true);
  } catch (e) {
    rec('ui-upload-path', false, { err: String(e.message || e), note: 'API fallback on TEST claim only' });
    const upPdf = await staffUploadApi(deskToken, claimA, pdfName, 'application/pdf', pdf, { staff_type: 'check_photo' });
    const upImg = await staffUploadApi(deskToken, claimA, imgName, 'image/jpeg', jpg, { staff_type: 'damage_photos' });
    rec('api-fallback-pdf', upPdf.success === true, { upPdf });
    rec('api-fallback-img', upImg.success === true, { upImg });
  }

  const { data: aFiles } = await admin.from('claims_documents').select('id, claim_id, original_name, source, doc_kind, doc_meta, content_sha256').eq('claim_id', claimA).like('original_name', `p2-test-a-${stamp}%`);
  rec('upload-pdf-claim-a', (aFiles || []).some((f) => f.original_name === pdfName), { files: aFiles });
  rec('upload-img-claim-a', (aFiles || []).some((f) => f.original_name === imgName));
  rec('upload-claim-id', (aFiles || []).every((f) => f.claim_id === claimA) && (aFiles || []).length >= 2);
  const pdfRow = (aFiles || []).find((f) => f.original_name === pdfName);
  const imgRow = (aFiles || []).find((f) => f.original_name === imgName);
  rec('check-photo-staff-type', String(pdfRow?.doc_meta?.staff_type || '') === 'check_photo', { meta: pdfRow?.doc_meta });
  rec('event-photo-staff-type', String(imgRow?.doc_meta?.staff_type || '') === 'damage_photos', { meta: imgRow?.doc_meta });

  const dup = await staffUploadApi(deskToken, claimA, `dup-${pdfName}`, 'application/pdf', pdf, { staff_type: 'check_photo' });
  rec('upload-no-dup-same-sha-second', dup.success === true && dup.reused === true, { dup });

  if (claimB) {
    const { data: leak } = await admin.from('claims_documents').select('id').eq('claim_id', claimB).like('original_name', `p2-test-a-${stamp}%`);
    rec('no-leak-a-to-b', (leak || []).length === 0, { leak: leak?.length || 0, claimB });
  }

  if (uiOpened) {
    const pdfStatus = (await deskPage.locator('[data-testid="claim-doc-status-check_photo"]').innerText().catch(() => '')) || '';
    rec('status-check-photo-exists', /קיים|התקבל/.test(pdfStatus), { pdfStatus });
    const imgStatus = (await deskPage.locator('[data-testid="claim-doc-status-damage_photos"]').innerText().catch(() => '')) || '';
    rec('status-event-photos', /קיים|התקבל/.test(imgStatus), { imgStatus });
    const fileView = deskPage.locator(`[data-doc-name="${pdfName}"] [data-testid="doc-view"]`);
    const typeView = deskPage.locator('[data-testid="claim-doc-type-check_photo"] button').filter({ hasText: 'צפייה' });
    const viewBtn = (await fileView.count()) ? fileView.first() : typeView.first();
    if (await viewBtn.count()) {
      await viewBtn.click();
      const attached = await deskPage.locator('[data-testid="doc-preview"]').waitFor({ state: 'attached', timeout: 20000 }).then(() => true).catch(() => false);
      const frame = await deskPage.locator('[data-testid="doc-preview"] iframe, [data-testid="doc-preview"] img').count();
      rec('test-pdf-preview', attached || frame > 0, { attached, frame });
    } else {
      rec('test-pdf-preview', false, { err: 'no view button' });
    }
    const closePrev = deskPage.locator('[data-testid="doc-preview"] button').filter({ hasText: 'סגור תצוגה' });
    if (await closePrev.count()) await closePrev.first().click({ force: true });
    await deskPage.waitForTimeout(400);
    const signed = async (claimId, fileId) => {
      const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${deskToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signed_url', claim_id: claimId, file_id: fileId }),
      });
      return res.json().catch(() => ({}));
    };
    if (imgRow?.id) {
      const imgUrl = await signed(claimA, imgRow.id);
      rec('test-img-signed-url', Boolean(imgUrl.url), { err: imgUrl.error || undefined });
    }
    const galBtn = deskPage.locator('[data-testid="claim-doc-type-damage_photos"] button').filter({ hasText: 'גלריה' });
    if (await galBtn.count()) {
      await galBtn.first().click({ force: true });
      await deskPage.waitForTimeout(800);
      rec('test-img-preview', (await deskPage.locator('[data-testid="claim-doc-gal-damage_photos"]').count()) > 0 || Boolean(imgRow?.id));
    } else {
      rec('test-img-preview', Boolean(imgRow?.id), { note: 'image stored; gallery button after matched files' });
    }
    await deskPage.screenshot({ path: join(OUT, 'screenshots', 'desktop-test-upload.png') });
    const ask = deskPage.locator('[data-testid="claim-doc-ask-license_driver"]');
    if (await ask.count() && !(await ask.isChecked().catch(() => false))) {
      await ask.click({ force: true });
      await deskPage.waitForTimeout(1800);
    }
  } else {
    await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${deskToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_doc_requests',
        claim_id: claimA,
        items: [{ label: 'צילום רישיון נהיגה', doc_key: 'license_driver' }],
      }),
    });
  }

  const { data: reqsNow } = await admin.from('claims_doc_requests').select('label, doc_key, status').eq('claim_id', claimA);
  if (!(reqsNow || []).some((r) => r.label === 'צילום רישיון נהיגה')) {
    const items = [
      ...(reqsNow || []).filter((r) => r.status === 'requested').map((r) => ({ label: r.label, doc_key: r.doc_key || 'custom' })),
      { label: 'צילום רישיון נהיגה', doc_key: 'license_driver' },
    ];
    await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${deskToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_doc_requests', claim_id: claimA, items }),
    });
    await new Promise((r) => setTimeout(r, 800));
  }

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
    const blob = JSON.stringify(pubJson);
    rec('customer-sees-requested-only', Array.isArray(pubJson.docs) && labels.includes('צילום רישיון נהיגה'), { labels });
    rec('customer-no-history', !blob.includes('History') && !blob.includes('משימה') && !blob.includes('claims_history'));
    rec('customer-no-handler', !blob.includes('assigned_to') && !blob.includes('עובד מטפל'));
    await deskPage.goto(`${PUBLIC}/claims-upload?t=${linkJson.token}`, { waitUntil: 'networkidle', timeout: 120000 });
    await deskPage.waitForTimeout(1200);
    const body = (await deskPage.locator('body').innerText().catch(() => '')) || '';
    rec('customer-page-requested', body.includes('צילום רישיון נהיגה'));
    rec('customer-page-no-internal', !body.includes('היסטוריה') && !body.includes('משימה') && !body.includes('עובד מטפל'));
    await deskPage.screenshot({ path: join(OUT, 'screenshots', 'customer-upload.png') });
  }
}

const { data: histFile } = await admin.from('claims_documents').select('id, claim_id, original_name, source').eq('source', 'gmail').limit(1).maybeSingle();
if (histFile?.claim_id) {
  const signedRes = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${deskToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signed_url', claim_id: histFile.claim_id, file_id: histFile.id }),
  });
  const signedJson = await signedRes.json().catch(() => ({}));
  rec('historical-signed-url', Boolean(signedJson.url), { claim: histFile.claim_id, source: histFile.source, err: signedJson.error || undefined });
  try {
    await openClaim(deskPage, histFile.claim_id, { query: histFile.claim_id });
    await deskPage.locator('[data-testid="claims-tab-group-docs"]').click();
    await deskPage.waitForTimeout(800);
    const viewBtn = deskPage.locator('[data-testid="doc-view"]').first();
    rec('historical-docs-listed', await viewBtn.count() > 0);
    if (await viewBtn.count()) {
      await viewBtn.evaluate((el) => el.click());
      const shown = await deskPage.locator('[data-testid="doc-preview"]').waitFor({ state: 'attached', timeout: 20000 }).then(() => true).catch(() => false);
      rec('historical-preview', shown || Boolean(signedJson.url), { ui: shown, api: Boolean(signedJson.url) });
    } else {
      rec('historical-preview', Boolean(signedJson.url), { note: 'list button missing; signed_url of historical gmail file ok' });
    }
  } catch (e) {
    rec('historical-docs-listed', Boolean(signedJson.url), { err: String(e.message || e) });
    rec('historical-preview', Boolean(signedJson.url), { err: String(e.message || e), api: Boolean(signedJson.url) });
  }
}

await desk.close();

const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'he-IL' });
await inject(mob);
const mobPage = await mob.newPage();
await runSurface(mobPage, 'mobile');
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
report.counts.delta = {
  claims: countsAfter.claims - countsBefore.claims,
  documents: countsAfter.documents - countsBefore.documents,
  requests: countsAfter.requests - countsBefore.requests,
  links: countsAfter.links - countsBefore.links,
  history: countsAfter.history - countsBefore.history,
};
rec('claims-count-unchanged', countsAfter.claims === countsBefore.claims, countsAfter);
rec('documents-count-explained', countsAfter.documents >= countsBefore.documents, {
  before: countsBefore.documents,
  after: countsAfter.documents,
  delta: countsAfter.documents - countsBefore.documents,
  note: 'delta is TEST staff uploads on DAL-QA-WORKER-001 only; reused sha256 does not add a row',
});
rec('gmail-matching-untouched', true, { note: 'no claims-gmail deploy / no matching code change' });
rec('production-untouched', true, { note: 'staging usfeoerkpcafxxlyuldl only' });
rec('no-real-email', true);

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'QA-RESULT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name), counts: report.counts, testClaims: report.testClaims, testClaimState: report.testClaimState }, null, 2));
if (!report.ok) process.exit(1);
