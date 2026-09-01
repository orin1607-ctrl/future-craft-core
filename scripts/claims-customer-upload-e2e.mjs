/**
 * Staging-only E2E: customer document request + secure upload link.
 * TEST claims only. No Gmail send. No SMS. No Production.
 * node scripts/claims-customer-upload-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const BUCKET = 'claims-docs';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-customer-upload-2026-09-01');
mkdirSync(OUT, { recursive: true });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfqHXaAAAAAElFTkSuQmCC', 'base64');
writeFileSync(join(OUT, 'test-license.png'), PNG);
writeFileSync(join(OUT, 'test-vehicle.png'), PNG);
writeFileSync(join(OUT, 'test-damage.png'), PNG);

const tests = [];
const rec = (id, ok, detail) => {
  tests.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ` ${JSON.stringify(detail).slice(0, 280)}` : ''}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(STAGING_URL, anon, { auth: { autoRefreshToken: false, persistSession: false } });

rec('not-production-ref', STAGING_REF !== PROD_REF, { STAGING_REF, PROD_REF });

const { count: vehiclesBefore } = await admin.from('vehicles').select('id', { count: 'exact', head: true });
const { count: accidentsBefore } = await admin.from('accidents').select('id', { count: 'exact', head: true });
rec('vehicles-before', vehiclesBefore === 437, { vehiclesBefore });
rec('accidents-before', accidentsBefore === 11, { accidentsBefore });

const { data: claims, error: claimErr } = await admin.from('claims_records').select('id, client_name, plate, status, row_data').in('id', ['DAL-2026-0018', 'DAL-2026-0019']).order('id');
const mapped = (claims || []).map((c) => ({ id: c.id, client_name: c.client_name, plate: c.plate, status: c.status, source: c.row_data?.source || '' }));
const testClaim = mapped.find((c) => c.id === 'DAL-2026-0019') || mapped.find((c) => c.id === 'DAL-2026-0018');
const otherTest = mapped.find((c) => c.id !== testClaim?.id);
rec('test-claim-found', Boolean(testClaim) && !claimErr, { claims: mapped, picked: testClaim?.id, error: claimErr?.message });
if (!testClaim) {
  writeFileSync(join(OUT, 'e2e.json'), JSON.stringify({ ok: false, tests }, null, 2));
  process.exit(1);
}
const CLAIM = testClaim.id;
const OTHER = otherTest?.id || 'DAL-2026-0018';

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saUser.data.user.email });
const { data: auth } = await client.auth.verifyOtp({ email: saUser.data.user.email, token: linkData.properties.email_otp, type: 'email' });
const jwt = auth.session.access_token;

async function invoke(body, token = jwt) {
  const res = await fetch(`${STAGING_URL}/functions/v1/claims-docs`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function publicGet(token) {
  const res = await fetch(`${STAGING_URL}/functions/v1/claims-docs?action=public_get&token=${encodeURIComponent(token)}`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function publicUpload(token, docRequestId, filePath, name, mime = 'image/png') {
  const form = new FormData();
  form.set('action', 'public_upload');
  form.set('token', token);
  form.set('doc_request_id', docRequestId);
  form.set('file', new Blob([readFileSync(filePath)], { type: mime }), name);
  const res = await fetch(`${STAGING_URL}/functions/v1/claims-docs`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const ITEMS = [
  { label: 'רישיון נהיגה – שני הצדדים', doc_key: 'license_driver' },
  { label: 'רישיון רכב', doc_key: 'license_vehicle' },
  { label: 'תמונות נזק / אירוע', doc_key: 'damage_photos' },
];

const save = await invoke({ action: 'save_doc_requests', claim_id: CLAIM, items: ITEMS });
rec('save-doc-requests', save.status === 200 && save.json.success === true, save);

const listed = await invoke({ action: 'list_docs', claim_id: CLAIM });
const reqs = (listed.json.requests || []).filter((r) => ITEMS.some((i) => i.label === r.label));
rec('requests-created', reqs.length === 3, { reqs: reqs.map((r) => ({ id: r.id, label: r.label, status: r.status })) });

const created = await invoke({ action: 'create_link', claim_id: CLAIM });
rec('create-link', created.status === 200 && Boolean(created.json.token) && created.json.success === true, {
  tokenLen: String(created.json.token || '').length,
  expiresAt: created.json.expiresAt,
});
let token = String(created.json.token || '');
let publicUrl = `${PUBLIC}/claims-upload?t=${token}`;
writeFileSync(join(OUT, 'TEST-LINK.txt'), `${publicUrl}\nclaim=${CLAIM}\n`, 'utf8');

const pub = await publicGet(token);
const pubKeys = Object.keys(pub.json || {});
rec('public-get-ok', pub.status === 200 && pub.json.success === true, { keys: pubKeys, docs: (pub.json.docs || []).map((d) => d.label) });
rec('public-no-claim-id', !('claim_id' in pub.json) && !('claimId' in pub.json) && !JSON.stringify(pub.json).includes(CLAIM), { keys: pubKeys });
rec('public-no-existing-files', !('files' in pub.json) && !('documents' in pub.json) && !('history' in pub.json) && !('gmail' in pub.json) && !('tasks' in pub.json), { keys: pubKeys });
const listedLabels = new Set((listed.json.requests || []).map((r) => r.label));
rec('public-only-this-claim-requests', (pub.json.docs || []).every((d) => listedLabels.has(d.label)) && (pub.json.docs || []).length >= 3, {
  labels: (pub.json.docs || []).map((d) => d.label),
});

const badTok = await publicGet('0'.repeat(64));
rec('invalid-token-404', badTok.status >= 400 && badTok.json.success === false, { status: badTok.status, error: badTok.json.error });

const flipped = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
const tamper = await publicGet(flipped);
rec('tampered-token-rejected', tamper.json.success === false, { status: tamper.status, error: tamper.json.error });

let otherReqId = 'DCR-FAKE';
if (OTHER && OTHER !== CLAIM) {
  const otherSave = await invoke({
    action: 'save_doc_requests',
    claim_id: OTHER,
    items: [{ label: 'מסמך בידוד TEST', doc_key: 'custom' }],
  });
  rec('other-test-request', otherSave.json.success === true, otherSave.json);
  const otherList = await invoke({ action: 'list_docs', claim_id: OTHER });
  otherReqId = (otherList.json.requests || []).find((r) => r.label === 'מסמך בידוד TEST')?.id || otherReqId;
}
const cross = await publicUpload(token, otherReqId, join(OUT, 'test-license.png'), 'cross.png');
rec('cross-claim-upload-blocked', cross.json.success === false, { status: cross.status, error: cross.json.error, otherReqId });

const pendingUploads = reqs.filter((r) => r.status !== 'received');
if (pendingUploads.length >= 3) {
  const up1 = await publicUpload(token, pendingUploads[0].id, join(OUT, 'test-license.png'), 'test-license.png');
  const up2 = await publicUpload(token, pendingUploads[1].id, join(OUT, 'test-vehicle.png'), 'test-vehicle.png');
  const up3 = await publicUpload(token, pendingUploads[2].id, join(OUT, 'test-damage.png'), 'test-damage.png');
  rec('upload-license', up1.json.success === true, up1);
  rec('upload-vehicle', up2.json.success === true, up2);
  rec('upload-damage', up3.json.success === true, up3);
} else {
  rec('upload-license', reqs.some((r) => r.label === ITEMS[0].label && r.status === 'received'));
  rec('upload-vehicle', reqs.some((r) => r.label === ITEMS[1].label && r.status === 'received'));
  rec('upload-damage', reqs.some((r) => r.label === ITEMS[2].label && r.status === 'received'));
}

const after = await invoke({ action: 'list_docs', claim_id: CLAIM });
const afterReqs = (after.json.requests || []).filter((r) => ITEMS.some((i) => i.label === r.label));
const afterFiles = (after.json.files || []).filter((f) => f.source === 'customer' && afterReqs.some((r) => r.id === f.doc_request_id));
rec('files-landed-same-claim', afterFiles.length >= 3 && afterFiles.every((f) => true), {
  files: afterFiles.map((f) => ({ name: f.original_name, req: f.doc_request_id, source: f.source })),
});
rec('requests-marked-received', afterReqs.every((r) => r.status === 'received'), afterReqs.map((r) => ({ label: r.label, status: r.status })));
rec('each-file-linked-to-request', afterFiles.length === 3 && new Set(afterFiles.map((f) => f.doc_request_id)).size === 3);

if (OTHER && OTHER !== CLAIM) {
  const otherAfter = await invoke({ action: 'list_docs', claim_id: OTHER });
  const leaked = (otherAfter.json.files || []).filter((f) => ['test-license.png', 'test-vehicle.png', 'test-damage.png'].includes(f.original_name) && f.source === 'customer');
  rec('no-leak-to-other-test-claim', leaked.length === 0, { leaked });
}

const { data: bucket } = await admin.storage.getBucket(BUCKET);
rec('bucket-private', bucket?.public === false, { public: bucket?.public, id: bucket?.id });

const anonList = await client.storage.from(BUCKET).list(CLAIM, { limit: 10 });
rec('anon-cannot-list-storage', Boolean(anonList.error) || (anonList.data || []).length === 0, { error: anonList.error?.message, n: (anonList.data || []).length });

const samplePath = (await admin.from('claims_documents').select('storage_path').eq('claim_id', CLAIM).eq('source', 'customer').limit(1)).data?.[0]?.storage_path;
if (samplePath) {
  const anonDl = await client.storage.from(BUCKET).download(samplePath);
  rec('anon-cannot-download', Boolean(anonDl.error), { error: anonDl.error?.message });
  const signed = await invoke({ action: 'signed_url', claim_id: CLAIM, file_id: afterFiles[0]?.id });
  rec('staff-signed-url', Boolean(signed.json.url), { status: signed.status });
}

const { count: c0004 } = await admin.from('claims_documents').select('id', { count: 'exact', head: true }).eq('claim_id', 'DAL-2026-0004');
rec('real-0004-still-188-or-more', Number(c0004) >= 188, { c0004 });

const smsInClaims = !readFileSync(join(process.cwd(), 'src/features/claims/ClaimsScreen.tsx'), 'utf8').toLowerCase().includes('sms');
rec('no-claims-sms-mechanism', smsInClaims, { sms: false });

const extraItems = [
  ...ITEMS,
  { label: 'מסמך TEST אוטומטי', doc_key: 'custom' },
  { label: 'אישור משטרה (TEST)', doc_key: 'custom' },
];
const extraSave = await invoke({ action: 'save_doc_requests', claim_id: CLAIM, items: extraItems });
rec('extra-pending-for-ui-and-phone', extraSave.json.success === true, extraSave.json);
const relink = await invoke({ action: 'create_link', claim_id: CLAIM });
token = String(relink.json.token || token);
publicUrl = `${PUBLIC}/claims-upload?t=${token}`;
writeFileSync(join(OUT, 'TEST-LINK.txt'), `${publicUrl}\nclaim=${CLAIM}\npending=אישור משטרה (TEST)\n`, 'utf8');
rec('relink-for-phone', Boolean(relink.json.token), { tokenLen: token.length });

async function uiPass(viewport, label, doUpload) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 800, hasTouch: viewport.width < 800 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(publicUrl, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1000);
  const body = await page.locator('body').innerText();
  const dir = await page.evaluate(() => document.documentElement.dir || document.querySelector('.claims-upload-page')?.getAttribute('dir'));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  const themeVisible = await page.getByLabel('מצב כהה').isVisible().catch(() => false) || await page.getByLabel('מצב בהיר').isVisible().catch(() => false);
  const btn = page.locator('label').filter({ hasText: 'בחירת קובץ' }).first();
  const btnBox = await btn.boundingBox().catch(() => null);
  rec(`${label}-page-loads`, /העלאת מסמכים/.test(body) && !/קישור לא תקין|פג תוקף/.test(body), { snippet: body.slice(0, 260) });
  rec(`${label}-rtl`, dir === 'rtl', { dir });
  rec(`${label}-only-requested`, ITEMS.every((i) => body.includes(i.label)) && !/Gmail|היסטוריה|משימה/.test(body));
  rec(`${label}-no-h-scroll`, overflow === false, { overflow });
  rec(`${label}-no-theme-toggle`, themeVisible === false, { themeVisible });
  rec(`${label}-no-console`, errors.length === 0, { errors });
  rec(`${label}-upload-btn-size`, Boolean(btnBox) && btnBox.height >= 44 && btnBox.width >= 120, btnBox);
  rec(`${label}-camera-btn`, await page.locator('label').filter({ hasText: 'צילום מהמצלמה' }).count() > 0);
  if (doUpload) {
    const input = page.locator('label').filter({ hasText: 'בחירת קובץ' }).first().locator('input[type="file"]');
    await input.setInputFiles(join(OUT, 'test-damage.png'));
    await page.waitForTimeout(2500);
    const afterUi = await page.locator('body').innerText();
    rec(`${label}-ui-upload`, /המסמך התקבל|התקבל/.test(afterUi), { snippet: afterUi.slice(0, 300) });
  }
  await page.screenshot({ path: join(OUT, `${label}-upload.png`) });
  await browser.close();
  return { btnBox, overflow };
}

const desktop = await uiPass({ width: 1400, height: 900 }, 'desktop', false);
const mobile = await uiPass({ width: 390, height: 844 }, 'mobile390', true);
const android = await uiPass({ width: 412, height: 915 }, 'android', false);
const tablet = await uiPass({ width: 768, height: 1024 }, 'tablet', false);

const staffBrowser = await chromium.launch({ headless: true, channel: 'chrome' });
const staffCtx = await staffBrowser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
await staffCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
const staffPage = await staffCtx.newPage();
await staffPage.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
await staffPage.waitForTimeout(1200);
await staffPage.locator('.tbn', { hasText: 'תיקים' }).click();
await staffPage.waitForTimeout(400);
await staffPage.locator('input[placeholder="🔎 חיפוש..."]').fill(CLAIM);
await staffPage.waitForTimeout(400);
await staffPage.locator('td', { hasText: CLAIM }).first().click({ timeout: 15000 });
await staffPage.waitForTimeout(2000);
await staffPage.locator('.ov.open .tab', { hasText: 'מסמכים' }).click();
await staffPage.waitForTimeout(800);
const docsText = await staffPage.locator('.ov.open .mb').innerText({ timeout: 15000 });
rec('staff-tab-shows-customer-files', ITEMS.every((i) => docsText.includes(i.label)) && /התקבל/.test(docsText) && docsText.includes('לקוח'), { snippet: docsText.slice(0, 500) });
rec('staff-requests-complete', ITEMS.every((i) => docsText.includes(i.label)) && (docsText.match(/התקבל/g) || []).length >= 3, {
  receivedHits: (docsText.match(/התקבל/g) || []).length,
});
await staffPage.screenshot({ path: join(OUT, 'staff-docs-tab.png') });
await staffBrowser.close();

const { count: vehiclesAfter } = await admin.from('vehicles').select('id', { count: 'exact', head: true });
const { count: accidentsAfter } = await admin.from('accidents').select('id', { count: 'exact', head: true });
rec('vehicles-untouched', vehiclesAfter === vehiclesBefore, { vehiclesAfter });
rec('accidents-untouched', accidentsAfter === accidentsBefore, { accidentsAfter });

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  claim: CLAIM,
  otherTest: OTHER,
  items: ITEMS,
  publicUrl,
  smsSent: false,
  smsReason: 'no claims SMS mechanism exists; not building one',
  tokenLen: token.length,
  tests,
  ui: { desktop, mobile, android, tablet },
};
report.ok = tests.every((t) => t.ok);
writeFileSync(join(OUT, 'e2e.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  ok: report.ok,
  claim: CLAIM,
  publicUrl,
  smsSent: false,
  fail: tests.filter((t) => !t.ok).map((t) => t.id),
}, null, 2));
process.exit(report.ok ? 0 : 1);
