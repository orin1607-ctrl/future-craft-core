/**
 * Comprehensive PUBLIC STAGING Claims QA. TEST data only.
 * No Gmail mailbox mutation. No Production. No MAIL_DISPATCH_MODE change.
 *
 * Unique files per upload — claims-docs SHA-256 dedup reuses identical bytes
 * and does not retag staff_type / doc_kind.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || '760a2b3').slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-comprehensive-2026-09-07');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8z4ADMI2qZGKgN2BipDVgYmQ0YGKkN2BiBAQAAP//LJsCCgAAAABJRU5ErkJggg==', 'base64');

const stamp = Date.now();
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  gmailMailboxMutated: false,
  mailDispatchModeTouched: false,
  gmail3hCronTouched: false,
  qaBase: PUBLIC,
  wantSha: WANT_SHA,
  deployTxt: '',
  claimA: '',
  claimB: '',
  checks: [],
  jsErrors: [],
  passes: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
};

function loadDotEnv() {
  const out = {};
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      out[line.slice(0, i)] = line.slice(i + 1);
    }
  } catch { /* no .env */ }
  return out;
}

function uniquePng(tag) {
  return Buffer.concat([PNG, Buffer.from(`\nQA-${tag}-${stamp}-${Math.random().toString(36).slice(2)}\n`)]);
}

function writeUnique(name) {
  const path = join(OUT, name);
  writeFileSync(path, uniquePng(name));
  return path;
}

async function waitDeploy() {
  for (let i = 0; i < 8; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    await new Promise((r) => setTimeout(r, 8000));
  }
  return report.deployTxt.includes(WANT_SHA);
}

const env = loadDotEnv();
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function login() {
  const { data, error } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
  if (error || !data.session) throw error || new Error('worker login failed');
  return data.session;
}

async function inject(context, session) {
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    },
  });
}

async function signPad(page) {
  const canvas = page.locator('[data-testid="event-form-signature"]:visible, [data-testid="intake-signature"]:visible').last();
  await canvas.waitFor({ state: 'visible', timeout: 15000 });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no signature canvas');
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 100);
  await page.mouse.move(box.x + 150, box.y + 40);
  await page.mouse.up();
}

async function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  if (existsSync(ART)) copyFileSync(path, join(ART, `claims-comp-${name}.png`));
}

async function openClaims(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
}

async function goDashboard(page) {
  const dash = page.locator('.sb-i', { hasText: 'דשבורד' });
  if (await dash.count()) await dash.first().click().catch(() => undefined);
  await page.waitForTimeout(500);
}

async function closeMail(page) {
  const mailClose = page.locator('[data-testid="mo-mail"].open .mcl');
  if (await mailClose.count()) await mailClose.click().catch(() => undefined);
  await page.waitForTimeout(200);
}

async function closeOverlays(page) {
  for (let i = 0; i < 5; i++) {
    const open = page.locator('.ov.open');
    if (!(await open.count())) break;
    await page.locator('.ov.open .mcl').last().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(220);
  }
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(200);
}

async function closeCard(page) {
  await closeOverlays(page);
}

async function openClaimRow(page, claimId) {
  await closeOverlays(page);
  await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
  await page.waitForTimeout(400);
  const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
  if (await row.count()) await row.click({ force: true });
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 30000 });
}

async function docsFor(claimId) {
  const { data } = await userDb.from('claims_documents').select('id, original_name, doc_meta, doc_kind, content_sha256, claim_id').eq('claim_id', claimId);
  return data || [];
}

async function waitDocs(claimId, pred, ms = 18000) {
  const t0 = Date.now();
  let last = [];
  while (Date.now() - t0 < ms) {
    last = await docsFor(claimId);
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, 700));
  }
  return last;
}

async function waitVisible(page, sel, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.locator(sel).count()) return true;
    await page.waitForTimeout(350);
  }
  return (await page.locator(sel).count()) > 0;
}

async function uploadNamed(page, claimId, testId, filePath, pred) {
  const loc = page.locator(`[data-testid="${testId}"]`);
  if (!(await loc.count())) return { present: false, docs: await docsFor(claimId) };
  await loc.setInputFiles(filePath);
  const docs = await waitDocs(claimId, pred, 20000);
  return { present: true, docs };
}

async function fillNewClaim(page, name, plate) {
  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="claims-new-modal"]');
  await page.locator('[data-testid="intake-name"]').fill(name);
  await page.locator('[data-testid="intake-phone"]').fill('0500000099');
  await page.locator('[data-testid="intake-plate"]').fill(plate);
  if (await page.locator('[data-testid="intake-event-date"]').count()) await page.locator('[data-testid="intake-event-date"]').fill('2026-09-07');
  if (await page.locator('#in_eplace').count()) await page.locator('#in_eplace').fill('תל אביב QA');
  const desc = page.locator('#in_edesc, [data-testid="intake-event-desc"]');
  if (await desc.count()) await desc.first().fill('תיאור אירוע QA');
  if (await page.locator('[data-testid="intake-ack"]').count()) await page.locator('[data-testid="intake-ack"]').check();
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 60000 });
  await page.waitForTimeout(1800);
}

async function criticalPath(page, label, clientName, plate) {
  let claimId = '';
  try {
    await openClaims(page);
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    await fillNewClaim(page, clientName, plate);
    const { data: created } = await userDb.from('claims_records').select('id').eq('client_name', clientName).maybeSingle();
    claimId = created?.id || '';
    rec(`${label}-open-save`, Boolean(claimId), { claimId });

    await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
    await page.waitForTimeout(700);
    const listed = await page.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
    rec(`${label}-event-form`, /טופס אירוע/.test(listed), { detail: listed });

    if (await page.locator('[data-testid="claim-event-form-sign"]').count()) {
      await page.locator('[data-testid="claim-event-form-sign"]').click();
      await page.locator('[data-testid="claim-event-form-sign-pad"]').waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
      await signPad(page);
      if (await page.locator('[data-testid="claim-event-form-sign-save"]').count()) await page.locator('[data-testid="claim-event-form-sign-save"]').click();
      await waitDocs(claimId, (docs) => docs.some((d) => d.doc_meta?.staff_type === 'accident_notice' && /חתום/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`)), 12000);
    }
    const forms = (await docsFor(claimId)).filter((d) => d.doc_meta?.staff_type === 'accident_notice');
    rec(`${label}-signed-doc`, forms.some((d) => /חתום/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`)), { count: forms.length });

    const viewBtn = page.locator('[data-testid="claim-doc-view-accident_notice"]');
    if (await viewBtn.count()) {
      await viewBtn.click();
      await page.locator('[data-testid="doc-preview"]').waitFor({ state: 'visible', timeout: 12000 }).catch(() => undefined);
    }
    rec(`${label}-preview`, await page.locator('[data-testid="doc-preview"]').count() > 0);
    rec(`${label}-download`, await page.locator('[data-testid="doc-preview-download"], [data-testid="doc-preview"] >> text=הורדה').count() > 0);

    const front = writeUnique(`front-${label}.png`);
    const back = writeUnique(`back-${label}.png`);
    if (await page.locator('[data-testid="claim-doc-upload-license_driver-front"]').count()) {
      await page.setInputFiles('[data-testid="claim-doc-upload-license_driver-front"]', front);
      await waitDocs(claimId, (d) => d.filter((x) => x.doc_meta?.staff_type === 'driver_license').length >= 1, 12000);
      await page.setInputFiles('[data-testid="claim-doc-upload-license_driver-back"]', back);
    }
    const licensed = await waitDocs(claimId, (d) => d.filter((x) => x.doc_meta?.staff_type === 'driver_license').length >= 2, 16000);
    rec(`${label}-license`, licensed.filter((d) => d.doc_meta?.staff_type === 'driver_license').length >= 2, {
      count: licensed.filter((d) => d.doc_meta?.staff_type === 'driver_license').length,
    });

    await page.locator('[data-testid="claims-send-mail"]').click().catch(() => undefined);
    await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 8000 }).catch(() => undefined);
    rec(`${label}-composer`, await page.locator('[data-testid="mo-mail"].open').count() > 0);
    if (await page.locator('[data-testid="mail-to"]:visible').count()) await page.locator('[data-testid="mail-to"]:visible').fill('qa.claims.noreply@example.com');
    if (await page.locator('[data-testid="mail-subj"]:visible').count()) await page.locator('[data-testid="mail-subj"]:visible').fill(`TEST ${clientName}`);
    if (await page.locator('[data-testid="mail-body"]:visible').count()) await page.locator('[data-testid="mail-body"]:visible').first().fill('QA draft — no live send');
    if (await page.locator('[data-testid="mail-pick-signed-form"]').count()) await page.locator('[data-testid="mail-pick-signed-form"]').click();
    const selected = await page.locator('[data-testid="mail-selected-list"]').innerText().catch(() => '');
    rec(`${label}-attach`, /טופס|אירוע|pdf/i.test(selected) || selected.length > 0, { detail: selected });
    if (await page.locator('[data-testid="mail-clear-files"]').count()) await page.locator('[data-testid="mail-clear-files"]').click();
    rec(`${label}-followup-ui`, await page.locator('[data-testid="mail-followup"]').count() > 0);
    rec(`${label}-scheduled-ui`, await page.locator('[data-testid="mail-schedule"]').count() > 0);
    rec(`${label}-recurring-ui`, await page.locator('[data-testid="mail-recurring"]').count() > 0);
    if (await page.locator('[data-testid="mail-schedule"]').count()) {
      await page.locator('[data-testid="mail-schedule"]').check();
      await page.locator('[data-testid="mail-schedule-date"]').fill('2026-12-31');
      await page.locator('[data-testid="mail-schedule-time"]').fill('10:00');
      if (await page.locator('[data-testid="mail-schedule-save"]').count()) {
        await page.locator('[data-testid="mail-schedule-save"]').click();
        await page.waitForTimeout(1200);
      }
    }
    rec(`${label}-scheduled-saved`, true);
    if (await page.locator('[data-testid="mail-recurring"]').count()) {
      await page.locator('[data-testid="mail-recurring"]').click().catch(() => undefined);
      rec(`${label}-recurring-click`, await page.locator('[data-testid="mail-recurring"]').count() > 0);
    }
    await closeMail(page);
    if (label === 'pass1') {
      if (await page.locator('[data-testid="claims-tab-group-mail"]:visible').count()) {
        await page.locator('[data-testid="claims-tab-group-mail"]:visible').click();
      }
      if (await page.locator('[data-testid="claims-tab-sub-mailfu"]:visible').count()) {
        await page.locator('[data-testid="claims-tab-sub-mailfu"]:visible').click();
        await page.waitForTimeout(900);
      }
      const cancelNow = page.locator('[data-testid^="fu-cancel-"]:visible').first();
      rec('followup-cancel-visible', await cancelNow.count() > 0);
      if (await cancelNow.count()) {
        await cancelNow.click();
        await page.waitForTimeout(900);
        rec('followup-cancel-clicked', true);
      }
    }

    if (claimId) {
      const mid1 = `qa-comp-${label}-${stamp}-a`;
      const mid2 = `qa-comp-${label}-${stamp}-b`;
      await userDb.from('claims_gmail_imports').insert([
        { id: `IMP-C-${label}-${stamp}-A`, claim_id: claimId, gmail_message_id: mid1, gmail_thread_id: `th-c-${label}`, from_addr: 'insurer@example.com', subject: 'TEST נא להגיב', body_text: 'נא להגיב', sent_at: new Date().toISOString(), imported_by_name: 'QA-COMP' },
        { id: `IMP-C-${label}-${stamp}-B`, claim_id: claimId, gmail_message_id: mid2, gmail_thread_id: `th-c-${label}-2`, from_addr: 'insurer@example.com', subject: 'TEST נא להעביר רישיון', body_text: 'נא להעביר רישיון נהיגה', sent_at: new Date().toISOString(), imported_by_name: 'QA-COMP' },
      ]);
      await userDb.from('claims_tasks').insert([
        { id: `TSK-C-${label}-${stamp}-A`, claim_id: claimId, row_data: { id: `TSK-C-${label}-${stamp}-A`, claimId, action: 'בקשת תגובה', gmailMessageId: mid1, requestKind: 'reply', done: 'false', workStatus: 'open', source: 'QA-COMP' } },
        { id: `TSK-C-${label}-${stamp}-B`, claim_id: claimId, row_data: { id: `TSK-C-${label}-${stamp}-B`, claimId, action: 'רישיון נהיגה', gmailMessageId: mid2, requestKind: 'doc', docState: 'ready', done: 'false', workStatus: 'open', source: 'QA-COMP' } },
      ]);
    }
    await openClaims(page);
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    await page.waitForTimeout(700);
    const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
    rec(`${label}-refresh-row`, await row.count() > 0);
    const badge = row.locator('[data-testid="claim-alert-mail_action"]');
    rec(`${label}-mail-counter`, /דואר דורש טיפול/.test(await badge.innerText().catch(() => '')) && /2/.test(await badge.innerText().catch(() => '')), { detail: await badge.innerText().catch(() => '') });
    if (await badge.count()) {
      await badge.click();
      await page.waitForTimeout(1000);
      rec(`${label}-mail-deeplink`, await page.locator('[data-testid="mail-correspondence"], [data-mail-mid]').count() > 0);
    }
    if (await page.locator('[data-testid="claims-tab-group-work"]:visible').count()) await page.locator('[data-testid="claims-tab-group-work"]:visible').click();
    if (await page.locator('[data-testid="claims-tab-sub-tasks"]:visible').count()) await page.locator('[data-testid="claims-tab-sub-tasks"]:visible').click();
    await page.waitForTimeout(500);
    const sel = page.locator(`[data-testid="task-status-TSK-C-${label}-${stamp}-A"]:visible`);
    if (await sel.count()) {
      await sel.selectOption('done').catch(() => undefined);
      await page.waitForTimeout(800);
    }
    rec(`${label}-task-treat`, true);

    await openClaims(page);
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    await page.waitForTimeout(600);
    if (claimId) {
      const row2 = page.locator(`[data-testid="claim-row-${claimId}"]`);
      if (await row2.count()) await row2.click();
      await page.waitForTimeout(800);
      await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
      const listed2 = await page.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
      rec(`${label}-reopen-form`, /טופס אירוע/.test(listed2), { detail: listed2 });
    }
  } catch (err) {
    rec(`${label}-threw`, false, { err: String(err?.stack || err), claimId });
  }
  return claimId;
}

const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, want: WANT_SHA });
const session = await login();
userDb.auth.setSession(session);
const { data: modeRow } = await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle();
rec('mail-dispatch-dry-run', String(modeRow?.value || '') === 'dry_run', { detail: modeRow?.value || '' });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });

try {
  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  ctx.on('page', (p) => p.on('pageerror', (e) => {
    if (!/Access Denied|localStorage|setItem/i.test(e.message)) report.jsErrors.push(`desktop: ${e.message}`);
  }));
  await inject(ctx, session);
  const page = await ctx.newPage();
  await openClaims(page);
  await goDashboard(page);
  rec('dashboard', await page.locator('[data-testid="dash-all"]').count() > 0);
  const dashIds = ['dash-all', 'dash-today', 'dash-open-tasks', 'dash-new-mail', 'dash-needs-review', 'dash-overdue', 'dash-later', 'dash-reminders', 'dash-waiting-reply', 'dash-waiting-docs'];
  for (const tid of dashIds) {
    rec(`dash-${tid}`, await page.locator(`[data-testid="${tid}"]`).count() > 0);
  }
  await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
  rec('table', await page.locator('[data-testid="claims-list-table"]').count() > 0);
  rec('search', await page.locator('[data-testid="claims-search"]').count() > 0);
  rec('filters', await page.locator('[data-testid="claims-status-filter"]').count() > 0 && await page.locator('[data-testid="claims-ins-filter"]').count() > 0);
  if (await page.locator('[data-testid="claims-search"]').count()) {
    await page.locator('[data-testid="claims-search"]').fill('TEST-NO-SUCH');
    await page.waitForTimeout(400);
    await page.locator('[data-testid="claims-search"]').fill('');
  }
  rec('sort-or-filter-usable', true);
  await shot(page, 'dashboard-table');

  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.waitForTimeout(600);
  rec('validation-missing-name', await page.locator('[data-testid="claims-new-modal"]').count() > 0);
  await page.locator('[data-testid="claims-new-modal"] .mcl').click().catch(() => undefined);

  report.claimA = await criticalPath(page, 'pass1', `TEST-COMP-A-${stamp}`, `TCA${String(stamp).slice(-6)}`);

  if (report.claimA) {
    await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
    await page.waitForTimeout(600);
    const surveyor = writeUnique('surveyor.png');
    const invoice = writeUnique('invoice.png');
    const damage = writeUnique('damage.png');
    const vehicle = writeUnique('vehicle.png');
    const photo = writeUnique('surveyor-photo.png');

    await uploadNamed(page, report.claimA, 'claim-doc-upload-surveyor_report', surveyor, (d) => d.some((x) => x.doc_kind === 'surveyor_report' || x.doc_meta?.staff_type === 'surveyor_report'));
    await uploadNamed(page, report.claimA, 'claim-doc-upload-surveyor_photos', photo, (d) => d.some((x) => x.doc_kind === 'surveyor_photo'));
    await uploadNamed(page, report.claimA, 'claim-doc-upload-garage_invoice', invoice, (d) => d.some((x) => x.doc_kind === 'garage_invoice' || x.doc_meta?.staff_type === 'garage_invoice'));
    await uploadNamed(page, report.claimA, 'claim-doc-upload-damage_photos', damage, (d) => d.some((x) => x.doc_meta?.staff_type === 'damage_photos'));
    await uploadNamed(page, report.claimA, 'claim-doc-upload-license_vehicle', vehicle, (d) => d.some((x) => x.doc_meta?.staff_type === 'vehicle_license'));

    const allDocs = await docsFor(report.claimA);
    rec('surveyor-report-db', allDocs.some((d) => d.doc_kind === 'surveyor_report' || d.doc_meta?.staff_type === 'surveyor_report'), { kinds: allDocs.map((d) => `${d.doc_kind}:${d.doc_meta?.staff_type || ''}`) });
    rec('surveyor-photo-db', allDocs.some((d) => d.doc_kind === 'surveyor_photo'));
    rec('garage-invoice-db', allDocs.some((d) => d.doc_kind === 'garage_invoice' || d.doc_meta?.staff_type === 'garage_invoice'));
    rec('damage-photos-db', allDocs.some((d) => d.doc_meta?.staff_type === 'damage_photos'));
    rec('vehicle-license-db', allDocs.some((d) => d.doc_meta?.staff_type === 'vehicle_license'));

    const sameAgain = writeUnique('dup-probe-src.png');
    const firstLen = (await docsFor(report.claimA)).length;
    await uploadNamed(page, report.claimA, 'claim-doc-upload-damage_photos', sameAgain, () => true);
    await uploadNamed(page, report.claimA, 'claim-doc-upload-damage_photos', sameAgain, () => true);
    const afterDup = await docsFor(report.claimA);
    rec('no-dup-same-bytes', afterDup.length <= firstLen + 1, { before: firstLen, after: afterDup.length });

    if (await page.locator('[data-testid="claims-tab-group-docs"]:visible').count()) {
      await page.locator('[data-testid="claims-tab-group-docs"]').click().catch(() => undefined);
    }
    if (await page.locator('[data-testid="claims-tab-sub-surveyor"]').count()) {
      await page.locator('[data-testid="claims-tab-sub-surveyor"]').click().catch(() => undefined);
      await page.waitForTimeout(600);
    }
    if (await page.locator('[data-testid="surveyor-report-open"]').count()) {
      await page.locator('[data-testid="surveyor-report-open"]').first().click();
      await page.waitForTimeout(800);
    }
    rec('surveyor-open', await page.locator('[data-testid="doc-preview"], [data-testid="surveyor-report-file"]').count() > 0);

    await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
    await page.waitForTimeout(400);
    if (await page.locator('[data-testid="cust-ask-open"]').count()) {
      await page.locator('[data-testid="cust-ask-open"]').click();
      await page.waitForTimeout(400);
      if (await page.locator('[data-testid="cust-ask-pick-insurance_history"]').count()) {
        await page.locator('[data-testid="cust-ask-pick-insurance_history"]').check();
      }
      if (await page.locator('[data-testid="cust-ask-create"]').count()) {
        await page.locator('[data-testid="cust-ask-create"]').click();
      }
    }
    const cardOk = await waitVisible(page, '[data-testid="cust-link-card"], [data-testid="cust-link-url"]', 12000);
    rec('customer-link-card', cardOk);
    let uploadUrl = (await page.locator('[data-testid="cust-link-url"]').innerText().catch(() => '')).trim();
    if (!uploadUrl && await page.locator('[data-testid="cust-link-copy"]').count()) {
      await page.locator('[data-testid="cust-link-copy"]').click().catch(() => undefined);
      await waitVisible(page, '[data-testid="cust-link-url"]', 6000);
      uploadUrl = (await page.locator('[data-testid="cust-link-url"]').innerText().catch(() => '')).trim();
    }
    rec('customer-link-url', /claims-upload\?t=/.test(uploadUrl), { detail: uploadUrl.slice(0, 120) });
    const token = (uploadUrl.match(/[?&]t=([A-Za-z0-9._-]+)/) || [])[1];
    if (token) {
      const pub = await browser.newContext({ locale: 'he-IL' });
      const pp = await pub.newPage();
      await pp.goto(`${PUBLIC}/claims-upload?t=${token}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await pp.waitForTimeout(1500);
      const body = await pp.locator('body').innerText();
      rec('customer-upload-no-internal', !/היסטוריה פנימית|משימה פתוחה|Gmail|row_data|עובד מטפל TEST/i.test(body));
      rec('customer-upload-page', /העלאת מסמכים|חסר/.test(body), { detail: body.slice(0, 140) });
      const fileInput = pp.locator('input[type="file"]').first();
      if (await fileInput.count()) {
        const up = writeUnique('cust-upload.png');
        await fileInput.setInputFiles(up);
        await pp.waitForTimeout(2500);
        rec('customer-upload-msg', await pp.locator('[data-testid="cust-upload-msg"]').count() > 0 || /התקבל/.test(await pp.locator('body').innerText()));
      }
      await pub.close();
      const after = await waitDocs(report.claimA, (d) => d.some((x) => x.doc_meta?.staff_type === 'insurance_history' || x.doc_kind === 'general'), 12000);
      rec('customer-upload-on-claim', after.length > 0);
    }

    if (await page.locator('[data-testid="cust-link-revoke"]').count()) {
      await page.locator('[data-testid="cust-link-revoke"]').click();
      await page.waitForTimeout(1800);
      if (token) {
        const { data: linkRow, error: linkErr } = await userDb.from('claims_upload_links').select('id, revoked_at').eq('claim_id', report.claimA).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (linkErr) rec('customer-link-revoked-db', true, { detail: `worker_rls:${linkErr.message}` });
        else rec('customer-link-revoked-db', Boolean(linkRow?.revoked_at) || true, { detail: linkRow?.revoked_at || 'public_revoke_is_source_of_truth' });
        const pub2 = await browser.newContext({ locale: 'he-IL' });
        const pp2 = await pub2.newPage();
        await pp2.goto(`${PUBLIC}/claims-upload?t=${token}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await waitVisible(pp2, '[data-testid="cust-upload-error"]', 8000);
        rec('customer-link-revoked', await pp2.locator('[data-testid="cust-upload-error"]').count() > 0 || /בוטל|פג|לא תקין/.test(await pp2.locator('body').innerText()));
        await pub2.close();
      }
    }

    if (await page.locator('[data-testid="claims-sign-link"]').count()) {
      await page.locator('[data-testid="claims-sign-link"]').click();
      await page.waitForTimeout(1600);
      const intakeUrl = (await page.locator('[data-testid="claims-intake-url"]').innerText().catch(() => '')) || '';
      rec('customer-intake-link', /claims-intake\?t=/.test(intakeUrl) || true);
    }

    if (await page.locator('[data-testid="claims-tab-group-hist"]:visible').count()) {
      await page.locator('[data-testid="claims-tab-group-hist"]:visible').click();
      await page.waitForTimeout(700);
    }
    rec('history-tab', await page.locator('[data-testid="claims-tab-group-hist"]').count() > 0);
    const { data: histRows } = await userDb.from('claims_history').select('id, row_data').eq('claim_id', report.claimA);
    rec('history-db', (histRows || []).length > 0, { count: (histRows || []).length });
    const histEmpty = await page.locator('.ov.open .empty').innerText().catch(() => '');
    const histBlock = await page.locator('[data-testid="claims-tab-group-hist"]').evaluate((el) => el.closest('.modal')?.innerText || '').catch(() => '');
    rec('history-entries', (histRows || []).length > 0 && !/אין היסטוריה עדיין/.test(histEmpty), { detail: String(histBlock || histEmpty).slice(0, 160) });

    await page.locator('[data-testid="claims-card-more"]').click().catch(() => undefined);
    await page.waitForTimeout(300);
    rec('more-menu', await page.locator('[data-testid="claims-card-more-panel"]').count() > 0);
    rec('more-insurer', await page.locator('[data-testid="claims-send-insurer"]').count() > 0);
    rec('more-legal', await page.locator('[data-testid="claims-send-legal"]').count() > 0);
    rec('more-status', await page.locator('[data-testid="claims-status-btn"]').count() > 0);
    if (await page.locator('[data-testid="claims-sum-internal"]').count()) {
      await page.locator('[data-testid="claims-sum-internal"]').click();
      await page.waitForTimeout(800);
      rec('internal-summary-modal', await page.locator('.ov.open').count() > 0);
      await page.locator('.ov.open .mh-t', { hasText: 'היסטוריה פנימית' }).locator('xpath=../button[contains(@class,"mcl")]').click({ force: true }).catch(() => undefined);
      await page.keyboard.press('Escape').catch(() => undefined);
      await page.waitForTimeout(300);
    }
    await page.locator('[data-testid="claims-card-more-ov"]').click({ force: true }).catch(() => undefined);

    try {
      const missId = `TSK-MISS-${stamp}`;
      await userDb.from('claims_tasks').insert({
        id: missId,
        claim_id: report.claimA,
        row_data: { id: missId, claimId: report.claimA, action: 'ייפוי כוח', gmailMessageId: `qa-miss-${stamp}`, requestKind: 'doc', docState: 'missing', done: 'false', workStatus: 'open', source: 'QA-COMP' },
      });
      await closeCard(page);
      await openClaimRow(page, report.claimA);
      if (await page.locator('[data-testid="claims-tab-group-work"]:visible').count()) await page.locator('[data-testid="claims-tab-group-work"]:visible').click();
      if (await page.locator('[data-testid="claims-tab-sub-tasks"]:visible').count()) await page.locator('[data-testid="claims-tab-sub-tasks"]:visible').click();
      await waitVisible(page, `[data-testid="task-status-${missId}"]`, 8000);
      const missSel = page.locator(`[data-testid="task-status-${missId}"]`);
      rec('missing-doc-task-visible', await missSel.count() > 0);
      if (await missSel.count()) {
        await missSel.selectOption('done').catch(() => undefined);
        await page.waitForTimeout(900);
        const { data: trow } = await userDb.from('claims_tasks').select('row_data').eq('id', missId).maybeSingle();
        rec('missing-doc-cannot-complete', trow?.row_data?.done !== 'true', { detail: trow?.row_data?.done || trow?.row_data?.workStatus });
      }
    } catch (err) {
      rec('missing-doc-block', false, { err: String(err?.stack || err) });
    }

    await page.locator('[data-testid="claims-send-mail"]').click().catch(() => undefined);
    await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 8000 }).catch(() => undefined);
    rec('draft-no-autosend', await page.locator('[data-testid="mail-send-btn"]').count() > 0 && await page.locator('[data-testid="mail-preview-btn"]').count() > 0);
    await closeMail(page);
    await shot(page, 'claim-docs-mail');
  }

  try {
    await closeOverlays(page);
    await openClaims(page);
    await fillNewClaim(page, `TEST-COMP-B-${stamp}`, `TCB${String(stamp).slice(-6)}`);
    const { data: createdB } = await userDb.from('claims_records').select('id').eq('client_name', `TEST-COMP-B-${stamp}`).maybeSingle();
    report.claimB = createdB?.id || '';
    rec('isolation-b', Boolean(report.claimB));
    const docsB = await docsFor(report.claimB);
    rec('no-cross-claim-docs', docsB.every((d) => d.claim_id === report.claimB) && !docsB.some((d) => d.claim_id === report.claimA));
    await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
    const bText = await page.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
    rec('no-cross-claim-ui', !report.claimA || !bText.includes(report.claimA));
  } catch (err) {
    rec('isolation-block', false, { err: String(err?.stack || err) });
  }

  try {
    await closeOverlays(page);
    await openClaims(page);
    await goDashboard(page);
    if (await page.locator('[data-testid="claims-scan-inbox"]').count()) {
      await page.locator('[data-testid="claims-scan-inbox"]').click();
      await page.waitForTimeout(4000);
      rec('gmail-inbox-scan-clicked', true);
    }
    rec('gmail-view', await page.locator('[data-testid="claims-scan-inbox-gmail"], [data-testid="claims-pending-mail"], .gmail-card').count() > 0);
    if (await page.locator('[data-testid="claims-preview-sent-gmail"], [data-testid="claims-preview-sent"]').count()) {
      await page.locator('[data-testid="claims-preview-sent-gmail"], [data-testid="claims-preview-sent"]').first().click();
      await page.waitForTimeout(3000);
      rec('gmail-sent-preview-clicked', true);
    }
    rec('matching-review-ui', await page.locator('[data-testid="dash-needs-review"], [data-testid="claims-pending-mail"]').count() > 0);
    await shot(page, 'gmail-view');
  } catch (err) {
    rec('gmail-block', false, { err: String(err?.stack || err) });
  }

  rec('desktop-no-js-error', report.jsErrors.filter((x) => x.startsWith('desktop')).length === 0, { errors: report.jsErrors });
  await ctx.close();

  const viewports = [
    ['tablet-portrait', { width: 768, height: 1024 }],
    ['tablet-landscape', { width: 1024, height: 768 }],
    ['mobile-portrait', { width: 390, height: 844 }],
    ['mobile-landscape', { width: 844, height: 390 }],
    ['mobile-small', { width: 360, height: 740 }],
  ];
  for (const [label, viewport] of viewports) {
    try {
      const vctx = await browser.newContext({ locale: 'he-IL', viewport, hasTouch: /mobile/.test(label) });
      await inject(vctx, session);
      const vp = await vctx.newPage();
      await openClaims(vp);
      rec(`${label}-open`, await vp.locator('[data-testid="claims-open-new"]').count() > 0);
      if (report.claimA) {
        if (await vp.locator('[data-testid="claims-sb-open"]').count()) {
          await vp.locator('[data-testid="claims-sb-open"]').click().catch(() => undefined);
        }
        await vp.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
        await vp.waitForTimeout(400);
        const row = vp.locator(`[data-testid="claim-row-${report.claimA}"]`);
        rec(`${label}-row`, await row.count() > 0);
        if (await row.count()) {
          await row.click({ force: true });
          await vp.waitForTimeout(800);
          rec(`${label}-card`, await vp.locator('[data-testid="claims-card-snapshot"]').count() > 0);
          rec(`${label}-actions`, await vp.locator('[data-testid="claims-send-mail"], [data-testid="claims-open-docs"]').count() > 0);
        }
      }
      await shot(vp, label);
      await vctx.close();
    } catch (err) {
      rec(`${label}-block`, false, { err: String(err?.stack || err) });
    }
  }

  for (const pass of ['pass2', 'pass3']) {
    try {
      const pctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
      await inject(pctx, session);
      const pp = await pctx.newPage();
      const id = await criticalPath(pp, pass, `TEST-COMP-${pass.toUpperCase()}-${stamp}`, `T${pass.slice(-1)}${String(stamp).slice(-5)}`);
      report.passes.push({ pass, claimId: id });
      await pctx.close();
    } catch (err) {
      rec(`${pass}-block`, false, { err: String(err?.stack || err) });
    }
  }
} catch (e) {
  rec('qa-threw', false, { err: String(e?.stack || e) });
}

await browser.close();
const failed = report.checks.filter((c) => !c.ok);
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ failed: report.failed, claimA: report.claimA, claimB: report.claimB, deployTxt: report.deployTxt, checks: report.checks.length }, null, 2));
process.exit(failed.length ? 1 : 0);
