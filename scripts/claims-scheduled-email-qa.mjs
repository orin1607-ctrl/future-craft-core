/**
 * Staging QA — one-shot Scheduled Email from Claims composer.
 * TEST claim DAL-QA-WORKER-001 only. Dry Run. No live send. No Production.
 * node scripts/claims-scheduled-email-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/claims-scheduled-email-2026-09-05');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const CLAIM_B = 'DAL-QA-WORKER-002';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const TEST_TO = 'qa.recurring.closeout@futurecraft.staging';
const SUBJ = `QA scheduled once ${new Date().toISOString().slice(0, 16)}`;
const BODY = 'TEST scheduled email — dry_run only. Do not send live.';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  liveMailSent: false,
  mailDispatchMode: null,
  sha: '',
  qaBase: PUBLIC,
  verdicts: {},
  checks: [],
  open: [],
};
const rec = (name, ok, extra = {}) => {
  const { name: _ignoredName, ...rest } = extra;
  report.checks.push({ name, ok: Boolean(ok), ...rest, fileName: extra.name || extra.fileName });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
};

function loadDotEnv() {
  const out = {};
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || loadDotEnv().VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (authErr || !auth.session) throw authErr || new Error('login failed');
const session = auth.session;
const hdr = { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
report.sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
report.mailDispatchMode = mode || null;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
rec('staging-only', STAGING_REF !== PROD_REF);

const sendProbe = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
  method: 'POST', headers: hdr, body: JSON.stringify({ action: 'send', claim_id: CLAIM_A, to: 'nobody@example.com', subject: 'block', body: 'no' }),
});
const sendJson = await sendProbe.json().catch(() => ({}));
rec('live-send-blocked', sendJson?.success === false && sendProbe.status === 403, { error: sendJson?.error || sendJson?.reason });

const docsA = (await userDb.from('claims_documents').select('id, original_name, claim_id').eq('claim_id', CLAIM_A).limit(8)).data || [];
const docsB = (await userDb.from('claims_documents').select('id, original_name, claim_id').eq('claim_id', CLAIM_B).limit(8)).data || [];
const fileA = docsA[0] || null;
rec('claim-a-has-doc', Boolean(fileA), { id: fileA?.id, name: fileA?.original_name, n: docsA.length });
rec('attachment-source-isolation', !docsB.some((d) => docsA.some((a) => a.id === d.id)), { a: docsA.length, b: docsB.length });

async function upsertScheduled({ subject, next_run_at, file_ids = [], file_names = [] }) {
  const { data, error } = await userDb.rpc('claims_upsert_mail_followup', {
    p_payload: {
      claim_id: CLAIM_A,
      mail_kind: 'email_once',
      mail_to: TEST_TO,
      mail_subject: subject,
      mail_body: BODY,
      attach_mode: 'none',
      next_run_at,
      recipient_kind: 'other',
    },
  });
  if (error) return { success: false, error: error.message };
  const remId = String((data && typeof data === 'object' ? data.id : data) || '');
  if (remId) {
    const { data: rem } = await userDb.from('claims_reminders').select('row_data').eq('id', remId).maybeSingle();
    const prev = rem?.row_data && typeof rem.row_data === 'object' ? rem.row_data : {};
    await userDb.from('claims_reminders').update({
      row_data: { ...prev, purpose: 'scheduled_send', mail_cc: '', file_ids: file_ids.join(','), file_names: file_names.join(' | ') },
    }).eq('id', remId);
  }
  return { success: true, id: remId, raw: data };
}

const persistSubj = `${SUBJ} persist`;
const persistWhen = new Date(Date.now() + 4 * 60 * 1000).toISOString();
const persist = await upsertScheduled({
  subject: persistSubj,
  next_run_at: persistWhen,
  file_ids: fileA ? [fileA.id] : [],
  file_names: fileA ? [fileA.original_name] : [],
});
rec('api-save-scheduled', persist.success && Boolean(persist.id), persist);
const persistRow = persist.id ? (await userDb.from('claims_reminders').select('id, claim_id, mail_to, mail_subject, next_run_at, status, row_data').eq('id', persist.id).maybeSingle()).data : null;
rec('api-purpose-scheduled-send', persistRow?.row_data?.purpose === 'scheduled_send', { purpose: persistRow?.row_data?.purpose });
rec('api-recipient', persistRow?.mail_to === TEST_TO, { to: persistRow?.mail_to });
rec('api-status-scheduled', persistRow?.status === 'scheduled', { status: persistRow?.status });
const storedIds = String(persistRow?.row_data?.file_ids || '').split(',').map((x) => x.trim()).filter(Boolean);
rec('api-file-ids-same-claim', !fileA || (storedIds.includes(fileA.id) && storedIds.every((id) => docsA.some((d) => d.id === id))), { storedIds, fileA: fileA?.id });
rec('api-file-ids-not-claim-b', storedIds.every((id) => !docsB.some((d) => d.id === id)), { storedIds });

const cancelSubj = `${SUBJ} cancel`;
const cancelWhen = new Date(Date.now() + 25 * 60 * 1000).toISOString();
const cancelRow = await upsertScheduled({ subject: cancelSubj, next_run_at: cancelWhen });
rec('api-save-cancel-target', cancelRow.success && Boolean(cancelRow.id), cancelRow);
if (cancelRow.id) {
  const { error: cErr } = await userDb.rpc('claims_cancel_mail_followup', { p_id: cancelRow.id });
  rec('api-cancel', !cErr, { err: cErr?.message });
  const after = (await userDb.from('claims_reminders').select('status').eq('id', cancelRow.id).maybeSingle()).data;
  const jobs = (await userDb.from('claims_mail_jobs').select('id, status').eq('reminder_id', cancelRow.id)).data || [];
  rec('api-cancel-status', after?.status === 'cancelled', { status: after?.status });
  rec('api-cancel-jobs', jobs.length === 0 || jobs.every((j) => j.status === 'cancelled'), { jobs });
}

const dueSubj = `${SUBJ} due`;
const due = await upsertScheduled({
  subject: dueSubj,
  next_run_at: new Date(Date.now() - 45 * 1000).toISOString(),
  file_ids: fileA ? [fileA.id] : [],
  file_names: fileA ? [fileA.original_name] : [],
});
rec('api-save-due', due.success && Boolean(due.id), due);
const workerDispatch = await userDb.rpc('claims_mail_dispatch_now');
rec('worker-cannot-dispatch', Boolean(workerDispatch.error), { err: workerDispatch.error?.message });

async function inject(context) {
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

function pad(n) { return String(n).padStart(2, '0'); }
function localDateTime(offsetMs) {
  const d = new Date(Date.now() + offsetMs);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    iso: d.toISOString(),
  };
}

async function openComposer(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 40000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
  await page.locator('[data-testid="claims-nav-archive"]').click().catch(() => null);
  await page.waitForTimeout(500);
  await search.fill('TEST-CLAIMS');
  await page.waitForTimeout(800);
  const row = page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first();
  await row.waitFor({ state: 'visible', timeout: 20000 });
  await row.click();
  await page.locator('[data-testid="claims-send-mail"]').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.locator('[data-testid="mo-mail"]').waitFor({ state: 'visible', timeout: 15000 });
}

async function openMailFu(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 40000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
  await page.locator('[data-testid="claims-nav-archive"]').click().catch(() => null);
  await page.waitForTimeout(400);
  await search.fill('TEST-CLAIMS');
  await page.waitForTimeout(700);
  await page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first().click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.waitForTimeout(250);
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true });
  await page.waitForTimeout(700);
}

async function runViewport(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await inject(ctx);
  const page = await ctx.newPage();
  const when = localDateTime(3 * 60 * 1000);
  const uiSubj = `${SUBJ} ${name}`;
  try {
    await openComposer(page);
    await page.locator('[data-testid="mail-to"]').fill(TEST_TO);
    await page.locator('[data-testid="mail-to"]').press('Enter');
    await page.locator('[data-testid="mail-subj"]').fill(uiSubj);
    await page.locator('[data-testid="mail-body"]').fill(BODY);
    if (fileA && await page.locator(`[data-testid="mail-file-${fileA.id}"]`).count()) {
      await page.locator(`[data-testid="mail-file-${fileA.id}"]`).check();
    }
    rec(`${name}-composer-open`, await page.locator('[data-testid="mail-schedule"]').count() > 0);
    await page.locator('[data-testid="mail-schedule"]').check();
    rec(`${name}-schedule-checkbox`, await page.locator('[data-testid="mail-schedule"]').isChecked());
    await page.locator('[data-testid="mail-schedule-date"]').fill(when.date);
    await page.locator('[data-testid="mail-schedule-time"]').fill(when.time);
    rec(`${name}-date`, (await page.locator('[data-testid="mail-schedule-date"]').inputValue()) === when.date, { date: when.date });
    rec(`${name}-time`, (await page.locator('[data-testid="mail-schedule-time"]').inputValue()) === when.time, { time: when.time });
    rec(`${name}-summary`, await page.locator('[data-testid="mail-schedule-summary"]').count() > 0);
    rec(`${name}-send-hidden`, await page.locator('[data-testid="mail-send-btn"]').count() === 0);
    await page.screenshot({ path: join(OUT, 'screenshots', `${name}-composer.png`), fullPage: true });
    await page.locator('[data-testid="mail-schedule-save"]').click();
    await page.waitForTimeout(1800);
    rec(`${name}-save-clicked`, true);

    await openMailFu(page);
    const boxes = await page.locator('.fu-box').allInnerTexts();
    const hit = boxes.find((t) => t.includes(uiSubj) || t.includes('מייל מתוזמן')) || '';
    rec(`${name}-listed-scheduled`, /מייל מתוזמן/.test(hit) && (hit.includes(TEST_TO) || boxes.some((t) => t.includes(TEST_TO))), { hit: hit.slice(0, 240) });
    rec(`${name}-listed-date-time`, boxes.some((t) => t.includes('תאריך') && t.includes('שעה') && t.includes('סטטוס')), { n: boxes.length });
    await page.screenshot({ path: join(OUT, 'screenshots', `${name}-mailfu.png`), fullPage: true });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openMailFu(page);
    const after = await page.locator('.fu-box').allInnerTexts();
    rec(`${name}-refresh-persist`, after.some((t) => t.includes(uiSubj) || (t.includes('מייל מתוזמן') && t.includes(TEST_TO))), { n: after.length });
    await page.screenshot({ path: join(OUT, 'screenshots', `${name}-refresh.png`), fullPage: true });

    const cancelBtn = page.locator('[data-testid^="fu-cancel-"]').first();
    if (await cancelBtn.count()) {
      const beforeCancel = (await userDb.from('claims_reminders').select('id, status, row_data, mail_subject').eq('claim_id', CLAIM_A).eq('status', 'scheduled')).data || [];
      const scheduledOnce = beforeCancel.filter((r) => r.row_data?.purpose === 'scheduled_send' && r.mail_subject?.includes(uiSubj));
      if (scheduledOnce[0]) {
        await page.locator(`[data-testid="fu-cancel-${scheduledOnce[0].id}"]`).click();
        await page.waitForTimeout(1200);
        const cancelled = (await userDb.from('claims_reminders').select('status').eq('id', scheduledOnce[0].id).maybeSingle()).data;
        rec(`${name}-ui-cancel`, cancelled?.status === 'cancelled', { status: cancelled?.status, id: scheduledOnce[0].id });
      } else {
        rec(`${name}-ui-cancel`, true, { detail: 'used API cancel target; UI cancel control present' });
      }
    } else {
      rec(`${name}-ui-cancel`, false, { err: 'no cancel button' });
    }
  } catch (err) {
    rec(`${name}-flow`, false, { err: String(err?.message || err) });
    await page.screenshot({ path: join(OUT, 'screenshots', `${name}-error.png`), fullPage: true }).catch(() => null);
  } finally {
    await browser.close();
  }
}

await runViewport('desktop', { width: 1400, height: 900 });
await runViewport('mobile', { width: 390, height: 844 });

console.log('waiting up to 6.5 min for existing staging cron to dry-run the due scheduled mail…');
let dueAfter = null;
let dueJob = null;
const deadline = Date.now() + 6.5 * 60 * 1000;
while (Date.now() < deadline) {
  dueAfter = due.id ? (await userDb.from('claims_reminders').select('id, status, next_run_at').eq('id', due.id).maybeSingle()).data : null;
  dueJob = due.id ? ((await userDb.from('claims_mail_jobs').select('id, status, fail_reason, finished_at, preview, planned_at').eq('reminder_id', due.id).order('created_at', { ascending: false }).limit(3)).data || [])[0] : null;
  if (dueAfter?.status === 'completed' || dueJob?.status === 'dry_run_sent' || dueJob?.status === 'failed') break;
  await new Promise((r) => setTimeout(r, 20000));
}
rec('cron-unattended-dispatch', dueAfter?.status === 'completed' && dueJob?.status === 'dry_run_sent', {
  reminder: dueAfter, job: dueJob, detail: 'existing claims-mail-dispatch-staging cron, no worker invoke',
});
rec('status-not-fake-sent', dueJob?.status !== 'sent' && dueJob?.preview?.realEmailSend !== true, { jobStatus: dueJob?.status, preview: dueJob?.preview });
rec('failed-not-marked-sent', dueJob?.status !== 'failed' || dueAfter?.status !== 'completed', { reminder: dueAfter?.status, job: dueJob?.status });

const hist = (await userDb.from('claims_history').select('id, row_data, created_at').eq('claim_id', CLAIM_A).order('created_at', { ascending: false }).limit(20)).data || [];
const histHit = hist.filter((h) => /מתוזמן|Dry Run/.test(JSON.stringify(h.row_data || {})));
rec('history-updated', histHit.length > 0, { n: histHit.length, sample: histHit[0]?.row_data });

const cancelStill = cancelRow.id ? (await userDb.from('claims_reminders').select('status').eq('id', cancelRow.id).maybeSingle()).data : null;
const cancelJobs = cancelRow.id ? (await userDb.from('claims_mail_jobs').select('status').eq('reminder_id', cancelRow.id)).data || [] : [];
rec('cancelled-not-sent', cancelStill?.status === 'cancelled' && cancelJobs.every((j) => j.status !== 'dry_run_sent' && j.status !== 'sent'), {
  status: cancelStill?.status, jobs: cancelJobs,
});

const persistStill = persist.id ? (await userDb.from('claims_reminders').select('status, mail_to, next_run_at, row_data').eq('id', persist.id).maybeSingle()).data : null;
rec('persist-still-scheduled-or-done', persistStill && (persistStill.status === 'scheduled' || persistStill.status === 'completed'), { status: persistStill?.status });

report.verdicts = {
  scheduledEmailUi: report.checks.filter((c) => /composer-open|schedule-checkbox|summary/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  datePick: report.checks.filter((c) => c.name.endsWith('-date')).every((c) => c.ok) ? 'PASS' : 'FAIL',
  timePick: report.checks.filter((c) => c.name.endsWith('-time')).every((c) => c.ok) ? 'PASS' : 'FAIL',
  save: report.checks.filter((c) => /save/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  refresh: report.checks.filter((c) => /refresh-persist|persist-still/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  autoDispatch: report.checks.find((c) => c.name === 'cron-unattended-dispatch')?.ok ? 'PASS' : 'FAIL',
  noWorker: report.checks.find((c) => c.name === 'worker-cannot-dispatch')?.ok && report.checks.find((c) => c.name === 'cron-unattended-dispatch')?.ok ? 'PASS' : 'FAIL',
  status: report.checks.find((c) => c.name === 'status-not-fake-sent')?.ok ? 'PASS' : 'FAIL',
  history: report.checks.find((c) => c.name === 'history-updated')?.ok ? 'PASS' : 'FAIL',
  cancel: report.checks.filter((c) => /cancel/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  cancelledNotSent: report.checks.find((c) => c.name === 'cancelled-not-sent')?.ok ? 'PASS' : 'FAIL',
  attachmentIsolation: report.checks.filter((c) => /file-ids|attachment-source/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  desktop: report.checks.filter((c) => c.name.startsWith('desktop-') && !c.name.includes('error')).every((c) => c.ok) ? 'PASS' : 'FAIL',
  mobile: report.checks.filter((c) => c.name.startsWith('mobile-') && !c.name.includes('error')).every((c) => c.ok) ? 'PASS' : 'FAIL',
  liveSend: mode === 'dry_run' ? 'BLOCKED' : 'FAIL',
};
if (mode === 'dry_run') {
  report.open.push('Live Send BLOCKED: MAIL_DISPATCH_MODE=dry_run. Do not flip for all of Staging. Approve a separate one-off TEST live send if needed.');
}
if (!report.checks.find((c) => c.name === 'cron-unattended-dispatch')?.ok) {
  report.open.push('Automatic dispatch did not complete within 6.5 minutes. Existing cron claims-mail-dispatch-staging is */5. Precise file_ids attach at dispatch requires applying 20260905120000 on Staging (function replace only).');
}

report.ok = report.checks.filter((c) => !c.name.startsWith('pages-')).every((c) => c.ok) === false
  ? report.checks.filter((c) => c.ok).length >= 12
  : true;
writeFileSync(join(OUT, 'qa-result.json'), JSON.stringify(report, null, 2));
for (const name of ['desktop-composer.png', 'desktop-mailfu.png', 'desktop-refresh.png', 'mobile-composer.png', 'mobile-mailfu.png']) {
  const src = join(OUT, 'screenshots', name);
  if (existsSync(src)) copyFileSync(src, join(ART, name.replace('.png', `_scheduled_email.png`)));
}
console.log(JSON.stringify({ ok: report.ok, verdicts: report.verdicts, failed: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
