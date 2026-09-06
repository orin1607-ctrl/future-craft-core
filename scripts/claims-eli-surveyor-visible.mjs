/**
 * Staging-only: classify the existing אליהו surveyor PDF if needed, then
 * prove it is visible and openable on PUBLIC STAGING מסמכים → דוח שמאי.
 * Never inserts a new document. Never Production.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const CLAIM_ID = 'DAL-2026-0020';
const REPORT_TOKEN = '0010002508';
const REPORT_NAME = '0010002508.pdf';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';

function isTargetName(name) {
  return /0010002508/i.test(String(name || ''));
}
const OUT = join(process.cwd(), 'docs/audit-reports/claims-eli-surveyor-visible-2026-09-06');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
if (existsSync(ART)) mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  claimId: CLAIM_ID,
  productionTouched: false,
  mailboxMutated: false,
  realEmailSend: false,
  insertedDocument: false,
  classifiedExisting: false,
  filesBefore: [],
  filesAfter: [],
  checks: [],
  ok: false,
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 180)}` : ''}`);
};

function jwtPayload(tok) {
  return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8'));
}

function serviceRole() {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SERVICE_ROLE_KEY;
  if (fromEnv) {
    const k = fromEnv.replace(/[\r\n]/g, '').trim();
    const payload = jwtPayload(k);
    if (payload.ref === PROD_REF) throw new Error('service role is production');
    if (payload.ref && payload.ref !== STAGING_REF) throw new Error(`service role ref ${payload.ref}`);
    return k;
  }
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  if (!token) throw new Error('need SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY');
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  }));
  const service = keys.find((x) => x.name === 'service_role' && x.type === 'legacy')?.api_key
    || keys.find((x) => x.name === 'service_role')?.api_key;
  if (!service) throw new Error('no staging service_role');
  if (jwtPayload(service).ref === PROD_REF) throw new Error('fetched production key');
  return service;
}

function anonKey() {
  const fromEnv = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (fromEnv) {
    const payload = jwtPayload(fromEnv);
    if (payload.ref === STAGING_REF && payload.role === 'anon') return fromEnv;
  }
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  }));
  return keys.find((x) => x.name === 'anon' && x.type === 'legacy')?.api_key
    || keys.find((x) => x.name === 'anon')?.api_key;
}

const service = serviceRole();
const anon = anonKey();
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { persistSession: false } });

const { data: claim } = await admin.from('claims_records').select('id, client_name, plate, row_data').eq('id', CLAIM_ID).maybeSingle();
const rd = claim?.row_data && typeof claim.row_data === 'object' ? claim.row_data : {};
rec('correct_claim', !!claim && /אטיאס/.test(`${claim.client_name || ''} ${rd.clientName || ''}`), {
  id: claim?.id, client_name: claim?.client_name, plate: claim?.plate, claimNum: rd.claimNum,
});

const { data: beforeFiles } = await admin.from('claims_documents')
  .select('id, claim_id, original_name, doc_kind, mime_type, source, content_sha256, gmail_message_id, byte_size')
  .eq('claim_id', CLAIM_ID);
report.filesBefore = beforeFiles || [];
const target = (beforeFiles || []).find((f) => isTargetName(f.original_name));
rec('pdf_exists', !!target, {
  storedName: target?.original_name || null,
  names: (beforeFiles || []).map((f) => `${f.original_name}:${f.doc_kind}:${f.source}`),
});

if (target && target.doc_kind !== 'surveyor_report') {
  const meta = { staff_type: 'surveyor_report', staff_title: target.original_name };
  const { error: upErr } = await admin.from('claims_documents')
    .update({ doc_kind: 'surveyor_report', doc_meta: meta })
    .eq('id', target.id)
    .eq('claim_id', CLAIM_ID);
  rec('classified_existing_only', !upErr, { id: target.id, from: target.doc_kind, err: upErr?.message });
  report.classifiedExisting = !upErr;
} else {
  rec('classified_existing_only', !!target, {
    detail: target ? `already ${target.doc_kind}` : 'missing file',
  });
}

const { data: afterFiles } = await admin.from('claims_documents')
  .select('id, claim_id, original_name, doc_kind, content_sha256')
  .eq('claim_id', CLAIM_ID);
report.filesAfter = afterFiles || [];
const afterTarget = (afterFiles || []).find((f) => isTargetName(f.original_name));
rec('classified_as_surveyor', afterTarget?.doc_kind === 'surveyor_report', { kind: afterTarget?.doc_kind });
const hashes = (afterFiles || []).map((f) => f.content_sha256).filter(Boolean);
rec('no_duplicate', hashes.length === new Set(hashes).size && (beforeFiles || []).length === (afterFiles || []).length, {
  before: (beforeFiles || []).length, after: (afterFiles || []).length,
});
const leak = (await admin.from('claims_documents').select('id, claim_id, original_name')
  .in('claim_id', ['DAL-QA-WORKER-001', 'DAL-QA-WORKER-002'])
  .eq('original_name', target?.original_name || REPORT_NAME)).data;
rec('no_cross_claim_leak', !(leak || []).length, { leak });

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
  if (!saEmail) saEmail = u?.data?.user?.email || '';
}
if (!saEmail) throw new Error('no existing super_admin');

async function inject(context) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anon, { auth: { persistSession: false } });
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

function saveShot(page, name) {
  const dest = join(OUT, `${name}.png`);
  return page.screenshot({ path: dest, fullPage: true }).then(() => {
    if (existsSync(ART)) copyFileSync(dest, join(ART, `${name}.png`));
  }).catch(() => null);
}

async function openEli(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const search = page.locator('[data-testid="claims-search"]');
  if (await search.count()) {
    await search.fill('אליהו אטיאס');
    await page.waitForTimeout(1000);
  }
  const row = page.locator(`[data-testid="claim-row-${CLAIM_ID}"]`);
  rec('claim_row_visible', await row.count() > 0);
  if (await row.count()) await row.click();
  await page.locator('[data-testid="claims-card-snapshot"]').waitFor({ timeout: 15000 });
}

async function inspectSurveyor(page, prefix) {
  await page.locator('[data-testid="claims-tab-group-mail"]').click();
  await page.locator('[data-testid="claims-tab-sub-gin"]').click().catch(() => null);
  await page.getByText('63292-003').first().waitFor({ timeout: 15000 });
  rec(`${prefix}_mail_visible`, (await page.getByText('63292-003').count()) > 0);
  await saveShot(page, `${prefix}_mail`);

  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.locator('[data-testid="claims-tab-sub-docs"]').click().catch(() => null);
  const onAll = page.locator(`[data-doc-name*="${REPORT_TOKEN}"]`).first();
  const allVisible = await onAll.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  rec(`${prefix}_filename_on_all_docs`, allVisible);
  rec(`${prefix}_docs_surveyor_block`, (await page.locator('[data-testid="docs-surveyor-present"]').count()) > 0);
  await saveShot(page, `${prefix}_all_docs`);

  await page.locator('[data-testid="claims-tab-sub-surveyor"]').click();
  const row = page.locator(`[data-testid="surveyor-report-file"][data-doc-name*="${REPORT_TOKEN}"]`).first();
  const visible = await row.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  rec(`${prefix}_surveyor_filename`, visible);
  rec(`${prefix}_empty_hidden`, (await page.getByText('אין דוח שמאי מסומן בתיק').count()) === 0);
  const rowText = visible ? ((await row.innerText().catch(() => '')) || '') : '';
  rec(`${prefix}_surveyor_classified_label`, visible && /דוח שמאי/.test(rowText), { rowText: rowText.slice(0, 180) });
  await saveShot(page, `${prefix}_surveyor`);

  if (visible) {
    const openBtn = row.getByRole('button', { name: 'פתח בתיק' });
    if (await openBtn.count()) await openBtn.click();
    else await row.locator('[data-testid="surveyor-report-open"]').click();
    const preview = await page.locator('[data-testid="doc-preview"]').waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    rec(`${prefix}_can_open`, preview);
    const previewName = (await page.locator('[data-testid="doc-preview-name"]').innerText().catch(() => '')) || '';
    rec(`${prefix}_preview_name`, isTargetName(previewName), { previewName });
    await saveShot(page, `${prefix}_preview`);
  } else {
    rec(`${prefix}_can_open`, false, { err: 'file not visible on דוח שמאי' });
    rec(`${prefix}_preview_name`, false);
  }
}

async function waitForPagesSha() {
  const short = String(process.env.GITHUB_SHA || '').slice(0, 7);
  if (!short) return false;
  for (let i = 0; i < 18; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt`).then((r) => r.text()).catch(() => '');
    if (txt.includes(short)) {
      console.log(`PASS pages_sha_live · ${txt.trim()}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  console.log(`WARN pages_sha_live · PUBLIC still not ${short}; UI checks decide`);
  return false;
}
await waitForPagesSha();

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await inject(ctx);
const page = await ctx.newPage();
try {
  await openEli(page);
  await inspectSurveyor(page, 'open');
  await page.locator('.ov.open .mh button.mcl').click({ timeout: 5000 }).catch(() => null);
  await page.locator('.ov.open').click({ position: { x: 8, y: 8 }, timeout: 3000 }).catch(() => null);
  await page.waitForTimeout(600);
  rec('card_closed', (await page.locator('.ov.open').count()) === 0);
  await page.reload({ waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1600);
  await openEli(page);
  await inspectSurveyor(page, 'reopen');
} catch (e) {
  rec('ui_run', false, { err: String(e.message || e).slice(0, 240) });
  await saveShot(page, 'ui_error');
}
await browser.close();

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: report.ok,
  classifiedExisting: report.classifiedExisting,
  insertedDocument: false,
  fail: report.checks.filter((c) => !c.ok).map((c) => c.name),
  productionTouched: false,
}, null, 2));
if (!report.ok) process.exit(1);
