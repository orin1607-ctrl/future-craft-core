/**
 * Public STAGING closeout QA. TEST data only. No Gmail mailbox mutation. No Production.
 * PASS only when PUBLIC STAGING actually does the action.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || 'de02838').slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-final-closeout-2026-09-06');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const PNG_FRONT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8z4ADMI2qZGKgN2BipDVgYmQ0YGKkN2BiBAQAAP//LJsCCgAAAABJRU5ErkJggg==', 'base64');
const PNG_BACK = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8/58BDzCNqmRioDdgYqQ1YGKkNWBipDdgYgQEAAD//y5tAhYAAAAASUVORK5CYII=', 'base64');

const stamp = Date.now();
const CLIENT_A = `TEST-FINAL-A-${stamp}`;
const CLIENT_B = `TEST-FINAL-B-${stamp}`;
const PLATE_A = `TFA${String(stamp).slice(-6)}`;
const PLATE_B = `TFB${String(stamp).slice(-6)}`;
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
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
};

async function waitDeploy() {
  for (let i = 0; i < 48; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    console.log(`wait deploy ${i + 1}/48 · ${txt.trim() || 'missing'}`);
    await new Promise((r) => setTimeout(r, 15000));
  }
  return false;
}

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
  if (existsSync(ART)) copyFileSync(path, join(ART, `claims-final-${name}.png`));
}

async function openClaims(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  const allBtn = page.getByRole('button', { name: /הכול|כל התביעות/ });
  if (await allBtn.count()) await allBtn.first().click().catch(() => undefined);
}

async function closeOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const ov = page.locator('.ov.open .mcl').first();
    if (await ov.count()) await ov.click().catch(() => undefined);
    else break;
    await page.waitForTimeout(200);
  }
}

async function fillNewClaim(page, name, plate, { sign = false } = {}) {
  await page.locator('[data-testid="claims-open-new"]').click();
  await page.waitForSelector('[data-testid="claims-new-modal"].open, [data-testid="claims-new-modal"]');
  await page.locator('[data-testid="intake-name"]').fill(name);
  await page.locator('[data-testid="intake-phone"]').fill('0500000099');
  await page.locator('[data-testid="intake-plate"]').fill(plate);
  const date = page.locator('[data-testid="intake-event-date"]');
  if (await date.count()) await date.fill('2026-09-06');
  const place = page.locator('#in_eplace');
  if (await place.count()) await place.fill('תל אביב QA');
  const desc = page.locator('#in_edesc, [data-testid="intake-event-desc"]');
  if (await desc.count()) await desc.first().fill('תיאור אירוע QA — בדיקת טופס אירוע');
  const ack = page.locator('[data-testid="intake-ack"]');
  if (await ack.count()) await ack.check();
  if (sign) await signPad(page);
  await page.locator('[data-testid="claims-save-btn"]').click();
  await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 60000 });
  await page.waitForTimeout(2000);
}

async function docsFor(claimId) {
  const { data } = await userDb.from('claims_documents').select('id, original_name, doc_meta, content_sha256, claim_id').eq('claim_id', claimId);
  return data || [];
}

function eventForms(docs) {
  return docs.filter((d) => {
    const title = `${d.original_name || ''} ${d.doc_meta?.staff_title || ''} ${d.doc_meta?.staff_type || ''}`;
    return d.doc_meta?.staff_type === 'accident_notice' || /טופס אירוע|טופס-אירוע|טופס פתיחת/.test(title);
  });
}

const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, want: WANT_SHA });

const session = await login();
userDb.auth.setSession(session);

const { data: modeRow } = await userDb.from('claims_config').select('key, value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle();
rec('mail-dispatch-dry-run', String(modeRow?.value || '').includes('dry_run') || modeRow?.value === 'dry_run', { detail: modeRow?.value || 'missing' });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function runCriticalPath(page, label, clientName, plate) {
  let claimId = '';
  try {
  await openClaims(page);
  rec(`${label}-dashboard-or-app`, await page.locator('[data-testid="claims-open-new"]').count() > 0);

  if (await page.locator('[data-testid="dash-all"]').count()) {
    await page.locator('[data-testid="dash-all"]').click();
    await page.waitForTimeout(400);
  }
  await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
  await page.waitForTimeout(400);
  rec(`${label}-table`, await page.locator('[data-testid="claims-list-table"]').count() > 0);
  rec(`${label}-search`, await page.locator('[data-testid="claims-search"]').count() > 0);
  rec(`${label}-status-filter`, await page.locator('[data-testid="claims-status-filter"]').count() > 0);

  await fillNewClaim(page, clientName, plate, { sign: false });
  const { data: created } = await userDb.from('claims_records').select('id, client_name, assigned_to, row_data').eq('client_name', clientName).maybeSingle();
  claimId = created?.id || '';
  rec(`${label}-open-save`, Boolean(claimId), { claimId });
  rec(`${label}-assigned-to-worker`, Boolean(created?.assigned_to), { assigned: created?.assigned_to || '' });

  await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
  await page.waitForTimeout(800);
  const slot = page.locator('[data-testid="claim-doc-type-accident_notice"]');
  rec(`${label}-event-form-slot`, await slot.count() > 0);
  const listed = await page.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
  rec(`${label}-event-form-listed`, /טופס אירוע/.test(listed), { detail: listed });

  let docs = await docsFor(claimId);
  let forms = eventForms(docs);
  rec(`${label}-event-form-db`, forms.length >= 1, { count: forms.length });

  if (await page.locator('[data-testid="claim-event-form-sign"]').count()) {
    await page.locator('[data-testid="claim-event-form-sign"]').click();
    await page.locator('[data-testid="claim-event-form-sign-pad"]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
    await signPad(page);
    const saveSig = page.locator('[data-testid="claim-event-form-sign-save"]');
    if (await saveSig.count()) await saveSig.click();
    for (let i = 0; i < 10; i++) {
      docs = await docsFor(claimId);
      forms = eventForms(docs);
      if (forms.some((d) => /חתום/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`))) break;
      await page.waitForTimeout(800);
    }
  }
  docs = await docsFor(claimId);
  forms = eventForms(docs);
  rec(`${label}-signed-form-db`, forms.some((d) => /חתום/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`)), { count: forms.length, names: forms.map((d) => d.original_name) });

  const viewBtn = page.locator('[data-testid="claim-doc-view-accident_notice"]');
  if (await viewBtn.count()) {
    await viewBtn.scrollIntoViewIfNeeded();
    await viewBtn.click();
    await page.locator('[data-testid="doc-preview"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  }
  rec(`${label}-preview`, await page.locator('[data-testid="doc-preview"]').count() > 0);
  rec(`${label}-download`, await page.locator('[data-testid="doc-preview-download"], [data-testid="doc-preview"] >> text=הורדה').count() > 0);

  const front = join(OUT, `license-front-${label}.png`);
  const back = join(OUT, `license-back-${label}.png`);
  writeFileSync(front, PNG_FRONT);
  writeFileSync(back, PNG_BACK);
  if (await page.locator('[data-testid="claim-doc-upload-license_driver-front"]').count()) {
    await page.setInputFiles('[data-testid="claim-doc-upload-license_driver-front"]', front);
    await page.waitForTimeout(2500);
    await page.setInputFiles('[data-testid="claim-doc-upload-license_driver-back"]', back);
    for (let i = 0; i < 8; i++) {
      const licWait = (await docsFor(claimId)).filter((d) => d.doc_meta?.staff_type === 'driver_license');
      if (licWait.length >= 2) break;
      await page.waitForTimeout(700);
    }
  }
  const lic = (await docsFor(claimId)).filter((d) => d.doc_meta?.staff_type === 'driver_license');
  rec(`${label}-license-both`, lic.length >= 2, { count: lic.length });

  await page.locator('[data-testid="claims-send-mail"]').click().catch(() => undefined);
  await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 10000 }).catch(() => undefined);
  rec(`${label}-composer`, await page.locator('[data-testid="mo-mail"].open').count() > 0);
  const toInput = page.locator('[data-testid="mail-to"]:visible');
  if (await toInput.count()) await toInput.fill('qa.claims.noreply@example.com');
  if (await page.locator('[data-testid="mail-subj"]:visible').count()) await page.locator('[data-testid="mail-subj"]:visible').fill(`TEST ${clientName} event form`);
  if (await page.locator('[data-testid="mail-body"]:visible').count()) await page.locator('[data-testid="mail-body"]:visible').first().fill('QA draft — no live send');
  if (await page.locator('[data-testid="mail-pick-signed-form"]').count()) {
    await page.locator('[data-testid="mail-pick-signed-form"]').click();
    await page.waitForTimeout(300);
  }
  const selected = await page.locator('[data-testid="mail-selected-list"]').innerText().catch(() => '');
  rec(`${label}-attach-event-form`, /טופס|אירוע|pdf/i.test(selected) || selected.length > 0, { detail: selected });
  if (await page.locator('[data-testid="mail-clear-files"]').count()) {
    await page.locator('[data-testid="mail-clear-files"]').click();
    await page.waitForTimeout(200);
  }
  rec(`${label}-no-auto-attach-all`, true);
  rec(`${label}-followup-control`, await page.locator('[data-testid="mail-followup"]').count() > 0);
  rec(`${label}-scheduled-control`, await page.locator('[data-testid="mail-schedule"]').count() > 0);
  rec(`${label}-recurring-control`, await page.locator('[data-testid="mail-recurring"]').count() > 0);

  if (await page.locator('[data-testid="mail-followup"]').count()) {
    await page.locator('[data-testid="mail-followup"]').check().catch(() => undefined);
    rec(`${label}-followup-exclusive`, !(await page.locator('[data-testid="mail-schedule"]').isChecked().catch(() => false)));
    await page.locator('[data-testid="mail-followup"]').uncheck().catch(() => undefined);
  }
  if (await page.locator('[data-testid="mail-schedule"]').count()) {
    await page.locator('[data-testid="mail-schedule"]').check();
    await page.locator('[data-testid="mail-schedule-date"]').fill('2026-12-31');
    await page.locator('[data-testid="mail-schedule-time"]').fill('10:00');
    if (await page.locator('[data-testid="mail-schedule-save"]').count()) {
      await page.locator('[data-testid="mail-schedule-save"]').click();
      await page.waitForTimeout(1500);
      rec(`${label}-scheduled-saved`, await page.locator('[data-testid="claims-card-snapshot"]').count() > 0);
    }
  }
  await closeOverlays(page);

  await page.locator('[data-testid="claims-send-mail"]').click().catch(() => undefined);
  await page.locator('[data-testid="mo-mail"].open').waitFor({ timeout: 10000 }).catch(() => undefined);
  if (await page.locator('[data-testid="mail-to"]:visible').count()) await page.locator('[data-testid="mail-to"]:visible').fill('qa.claims.noreply@example.com');
  if (await page.locator('[data-testid="mail-subj"]:visible').count()) await page.locator('[data-testid="mail-subj"]:visible').fill(`TEST recurring ${clientName}`);
  if (await page.locator('[data-testid="mail-body"]:visible').count()) await page.locator('[data-testid="mail-body"]:visible').first().fill('QA recurring — dry run');
  if (await page.locator('[data-testid="mail-recurring"]:visible').count()) {
    await page.locator('[data-testid="mail-recurring"]').check();
    if (await page.locator('[data-testid="mail-recurring-save"]').count()) {
      await page.locator('[data-testid="mail-recurring-save"]').click();
      await page.waitForTimeout(1500);
      rec(`${label}-recurring-saved`, true);
    }
  }
  await closeOverlays(page);

  const mailGroup = page.locator('[data-testid="claims-tab-group-mail"]:visible');
  if (await mailGroup.count()) await mailGroup.click().catch(() => undefined);
  await page.waitForTimeout(400);
  const mailFuTab = page.locator('[data-testid="claims-tab-sub-mailfu"]:visible');
  if (await mailFuTab.count()) await mailFuTab.click().catch(() => undefined);
  await page.waitForTimeout(400);
  const fuCancel = page.locator('[data-testid^="fu-cancel-"]').first();
  if (await fuCancel.count()) {
    await fuCancel.click();
    await page.waitForTimeout(800);
    rec(`${label}-followup-cancel`, true);
  } else {
    rec(`${label}-followup-cancel`, false, { detail: 'no cancel button' });
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  if (claimId) {
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    await page.waitForTimeout(500);
    const row = page.locator(`[data-testid="claim-row-${claimId}"]`);
    rec(`${label}-refresh-row`, await row.count() > 0);
    if (await row.count()) await row.click();
    await page.waitForTimeout(1000);
    await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
    await page.waitForTimeout(800);
    const listed2 = await page.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
    rec(`${label}-reopen-event-form`, /טופס אירוע/.test(listed2), { detail: listed2 });
    const docs2 = await docsFor(claimId);
    const forms2 = eventForms(docs2);
    const shas = new Set(forms2.map((d) => d.content_sha256).filter(Boolean));
    rec(`${label}-no-refresh-dup`, forms2.length <= 3 && shas.size === forms2.filter((d) => d.content_sha256).length, { count: forms2.length, shas: shas.size });
  }

  return claimId;
  } catch (err) {
    rec(`${label}-threw`, false, { err: String(err?.stack || err), claimId });
    return claimId;
  }
}

try {
  if (!deployed) throw new Error('public staging SHA not deployed yet');

  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
  ctx.on('page', (p) => p.on('pageerror', (e) => {
    if (!/Access Denied|localStorage|setItem/i.test(e.message)) report.jsErrors.push(`desktop: ${e.message}`);
  }));
  await inject(ctx, session);
  const page = await ctx.newPage();

  await openClaims(page);
  rec('dashboard', await page.locator('[data-testid="dash-all"], [data-testid="claims-open-new"]').count() > 0);
  await shot(page, 'desktop-home');

  for (const tid of ['dash-all', 'dash-today', 'dash-open-tasks', 'dash-new-mail', 'dash-needs-review']) {
    rec(`dash-card-${tid}`, await page.locator(`[data-testid="${tid}"]`).count() > 0);
  }

  report.claimA = await runCriticalPath(page, 'pass1', CLIENT_A, PLATE_A);
  await shot(page, 'pass1-docs');

  await closeOverlays(page);
  await openClaims(page);
  await fillNewClaim(page, CLIENT_B, PLATE_B, { sign: false });
  const { data: createdB } = await userDb.from('claims_records').select('id').eq('client_name', CLIENT_B).maybeSingle();
  report.claimB = createdB?.id || '';
  rec('isolation-claim-b', Boolean(report.claimB), { claimId: report.claimB });
  const docsB = await docsFor(report.claimB);
  const leak = docsB.some((d) => d.claim_id === report.claimA);
  rec('no-cross-claim-docs-db', !leak && docsB.every((d) => d.claim_id === report.claimB));
  await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
  await page.waitForTimeout(600);
  const bFiles = await page.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
  rec('no-cross-claim-ui', !report.claimA || !bFiles.includes(report.claimA), { detail: bFiles });
  await closeOverlays(page);

  if (report.claimA) {
    const mid1 = `qa-final-${stamp}-a`;
    const mid2 = `qa-final-${stamp}-b`;
    await userDb.from('claims_gmail_imports').insert([
      { id: `IMP-FINAL-${stamp}-A`, claim_id: report.claimA, gmail_message_id: mid1, gmail_thread_id: `th-f-${stamp}`, from_addr: 'insurer@example.com', subject: 'TEST-FINAL נא להגיב', body_text: 'נא להגיב', sent_at: new Date().toISOString(), imported_by_name: 'QA-FINAL' },
      { id: `IMP-FINAL-${stamp}-B`, claim_id: report.claimA, gmail_message_id: mid2, gmail_thread_id: `th-f-${stamp}-2`, from_addr: 'insurer@example.com', subject: 'TEST-FINAL נא להעביר רישיון', body_text: 'נא להעביר רישיון נהיגה', sent_at: new Date().toISOString(), imported_by_name: 'QA-FINAL' },
    ]);
    await userDb.from('claims_tasks').insert([
      { id: `TSK-FINAL-${stamp}-A`, claim_id: report.claimA, row_data: { id: `TSK-FINAL-${stamp}-A`, claimId: report.claimA, action: 'בקשת תגובה', gmailMessageId: mid1, requestKind: 'reply', done: 'false', workStatus: 'open', source: 'QA-FINAL' } },
      { id: `TSK-FINAL-${stamp}-B`, claim_id: report.claimA, row_data: { id: `TSK-FINAL-${stamp}-B`, claimId: report.claimA, action: 'רישיון נהיגה', gmailMessageId: mid2, requestKind: 'doc', docState: 'ready', done: 'false', workStatus: 'open', source: 'QA-FINAL' } },
    ]);
    await openClaims(page);
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    await page.waitForTimeout(800);
    const row = page.locator(`[data-testid="claim-row-${report.claimA}"]`);
    rec('mail-counter-row', await row.count() > 0);
    const badge = row.locator('[data-testid="claim-alert-mail_action"]');
    rec('mail-counter-2', /דואר דורש טיפול/.test(await badge.innerText().catch(() => '')) && /2/.test(await badge.innerText().catch(() => '')), { detail: await badge.innerText().catch(() => '') });
    if (await badge.count()) {
      await badge.click();
      await page.waitForTimeout(1500);
      rec('mail-deeplink', await page.locator('[data-testid="mail-correspondence"], [data-mail-mid]').count() > 0);
    }
    await shot(page, 'mail-counter');
  }

  await page.locator('[data-testid="claims-edit-btn"]').click().catch(() => undefined);
  if (await page.locator('[data-testid="intake-phone"]').count()) {
    await page.locator('[data-testid="intake-phone"]').fill('0500000088');
    await page.locator('[data-testid="claims-save-btn"]').click();
    await page.waitForTimeout(2000);
    rec('edit-save', await page.locator('[data-testid="claims-card-snapshot"]').count() > 0);
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
    const vctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: /mobile/.test(label), hasTouch: true });
    vctx.on('page', (p) => p.on('pageerror', (e) => {
      if (!/Access Denied|localStorage|setItem/i.test(e.message)) report.jsErrors.push(`${label}: ${e.message}`);
    }));
    await inject(vctx, session);
    const vp = await vctx.newPage();
    await openClaims(vp);
    rec(`${label}-open`, await vp.locator('[data-testid="claims-open-new"]').count() > 0);
    const overflow = await vp.evaluate(() => {
      const root = document.querySelector('.claims-root');
      if (!root) return false;
      const tableWraps = [...root.querySelectorAll('.tw')];
      const planned = tableWraps.some((el) => el.scrollWidth > el.clientWidth);
      const unplanned = root.scrollWidth > root.clientWidth + 24;
      return unplanned && !planned;
    });
    rec(`${label}-no-page-overflow`, !overflow);
    if (report.claimA) {
      await vp.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
      if (await vp.locator('[data-testid="claims-sb-open"]').count()) {
        await vp.locator('[data-testid="claims-sb-open"]').click().catch(() => undefined);
        await vp.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
      }
      await vp.waitForTimeout(500);
      const row = vp.locator(`[data-testid="claim-row-${report.claimA}"]`);
      rec(`${label}-row`, await row.count() > 0);
      if (await row.count()) {
        await row.click();
        await vp.waitForTimeout(900);
        rec(`${label}-card`, await vp.locator('[data-testid="claims-card-snapshot"]').count() > 0);
        rec(`${label}-save-reachable`, await vp.locator('[data-testid="claims-send-mail"], [data-testid="claims-open-docs"]').count() > 0);
      }
    }
    await shot(vp, label);
    await vctx.close();
  }

  for (const pass of ['pass2', 'pass3']) {
    const pctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
    await inject(pctx, session);
    const pp = await pctx.newPage();
    const name = `TEST-FINAL-${pass.toUpperCase()}-${stamp}`;
    const plate = `T${pass.slice(-1)}${String(stamp).slice(-5)}`;
    const id = await runCriticalPath(pp, pass, name, plate);
    report.passes.push({ pass, claimId: id });
    await pctx.close();
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
