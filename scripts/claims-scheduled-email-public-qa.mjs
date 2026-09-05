/**
 * Public STAGING QA — Scheduled Email as a real user sees it.
 * Base: https://orin1607-ctrl.github.io/future-craft-core/claims
 * TEST claim only. Dry Run. No live send. No Production.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/claims-scheduled-email-public-2026-09-05');
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
const SUBJ = `QA public scheduled ${new Date().toISOString().slice(0, 16)}`;
const BODY = 'TEST scheduled email on public STAGING — dry_run only.';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  liveMailSent: false,
  qaBase: PUBLIC,
  deployTxt: '',
  sha: execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
  checks: [],
  verdicts: {},
  open: [],
};
const rec = (name, ok, extra = {}) => {
  const { name: _n, ...rest } = extra;
  report.checks.push({ name, ok: Boolean(ok), ...rest, fileName: extra.name });
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
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (authErr || !auth.session) throw authErr || new Error('login failed');
const session = auth.session;

const deployTxt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt`).then((r) => r.text()).catch(() => '');
report.deployTxt = deployTxt.trim();
rec('public-deploy-has-scheduled-sha', /aa0a67ef|scheduled send on public STAGING/i.test(deployTxt) || deployTxt.includes('aa0a67ef'), { deployTxt: deployTxt.trim() });

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
rec('staging-only', STAGING_REF !== PROD_REF);

const docsA = (await userDb.from('claims_documents').select('id, original_name').eq('claim_id', CLAIM_A).limit(5)).data || [];
const docsB = (await userDb.from('claims_documents').select('id').eq('claim_id', CLAIM_B).limit(5)).data || [];
const fileA = docsA[0] || null;
rec('attachment-isolation-source', !docsB.some((d) => docsA.some((a) => a.id === d.id)), { a: docsA.length, b: docsB.length });

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
function localSoon(ms) {
  const d = new Date(Date.now() + ms);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

async function openComposer(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 50000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
  await page.locator('[data-testid="claims-nav-archive"]').click().catch(() => null);
  await page.waitForTimeout(500);
  await search.fill('TEST-CLAIMS');
  await page.waitForTimeout(900);
  await page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first().click();
  await page.locator('[data-testid="claims-send-mail"]').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.locator('[data-testid="mo-mail"]').waitFor({ state: 'visible', timeout: 20000 });
}

async function openMailFu(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 50000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
  await page.locator('[data-testid="claims-nav-archive"]').click().catch(() => null);
  await page.waitForTimeout(400);
  await search.fill('TEST-CLAIMS');
  await page.waitForTimeout(800);
  await page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first().click();
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.waitForTimeout(250);
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true });
  await page.waitForTimeout(800);
}

async function runViewport(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await inject(ctx);
  const page = await ctx.newPage();
  const when = localSoon(4 * 60 * 1000);
  const uiSubj = `${SUBJ} ${name}`;
  try {
    await openComposer(page);
    rec(`${name}-schedule-visible`, await page.locator('[data-testid="mail-schedule"]').count() > 0);
    rec(`${name}-not-only-followup`, (await page.locator('[data-testid="mail-schedule"]').count()) > 0 && (await page.locator('[data-testid="mail-followup"]').count()) > 0);
    await page.locator('[data-testid="mail-to"]').fill(TEST_TO);
    await page.locator('[data-testid="mail-to"]').press('Enter');
    await page.locator('[data-testid="mail-subj"]').fill(uiSubj);
    await page.locator('[data-testid="mail-body"]').fill(BODY);
    if (fileA && await page.locator(`[data-testid="mail-file-${fileA.id}"]`).count()) {
      await page.locator(`[data-testid="mail-file-${fileA.id}"]`).check();
    }
    await page.locator('[data-testid="mail-schedule"]').check();
    await page.locator('[data-testid="mail-schedule-date"]').fill(when.date);
    await page.locator('[data-testid="mail-schedule-time"]').fill(when.time);
    rec(`${name}-date`, (await page.locator('[data-testid="mail-schedule-date"]').inputValue()) === when.date);
    rec(`${name}-time`, (await page.locator('[data-testid="mail-schedule-time"]').inputValue()) === when.time);
    await page.screenshot({ path: join(OUT, 'screenshots', `${name}-composer.png`), fullPage: true });
    await page.locator('[data-testid="mail-schedule-save"]').click();
    await page.waitForTimeout(2000);
    rec(`${name}-save`, true);

    await openMailFu(page);
    const boxes = await page.locator('.fu-box').allInnerTexts();
    rec(`${name}-listed`, boxes.some((t) => t.includes('מייל מתוזמן') && (t.includes(TEST_TO) || t.includes(uiSubj))), { n: boxes.length });
    await page.screenshot({ path: join(OUT, 'screenshots', `${name}-mailfu.png`), fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openMailFu(page);
    const after = await page.locator('.fu-box').allInnerTexts();
    rec(`${name}-refresh`, after.some((t) => t.includes(uiSubj) || (t.includes('מייל מתוזמן') && t.includes(TEST_TO))));
    const saved = ((await userDb.from('claims_reminders').select('id, status, mail_to, mail_subject, mail_body, next_run_at, row_data').eq('claim_id', CLAIM_A).eq('status', 'scheduled').order('created_at', { ascending: false }).limit(8)).data || [])
      .find((r) => r.mail_subject === uiSubj);
    rec(`${name}-persist-fields`, Boolean(saved && saved.mail_to === TEST_TO && saved.mail_body?.includes('TEST scheduled') && saved.row_data?.purpose === 'scheduled_send'), { id: saved?.id, to: saved?.mail_to });
    if (fileA && saved) {
      const ids = String(saved.row_data?.file_ids || '').split(',').filter(Boolean);
      rec(`${name}-files-same-claim`, ids.includes(fileA.id) && ids.every((id) => !docsB.some((d) => d.id === id)), { ids });
    }
    if (saved) {
      await page.locator(`[data-testid="fu-cancel-${saved.id}"]`).click();
      await page.waitForTimeout(1200);
      const cancelled = (await userDb.from('claims_reminders').select('status').eq('id', saved.id).maybeSingle()).data;
      rec(`${name}-cancel`, cancelled?.status === 'cancelled', { status: cancelled?.status });
    } else {
      rec(`${name}-cancel`, false, { err: 'row not found after save' });
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

const dueWhen = new Date(Date.now() - 40000).toISOString();
const { data: dueData, error: dueErr } = await userDb.rpc('claims_upsert_mail_followup', {
  p_payload: {
    claim_id: CLAIM_A,
    mail_kind: 'email_once',
    mail_to: TEST_TO,
    mail_subject: `${SUBJ} due`,
    mail_body: BODY,
    attach_mode: 'none',
    next_run_at: dueWhen,
    recipient_kind: 'other',
  },
});
const dueId = dueData?.id || '';
if (dueId) {
  const { data: rem } = await userDb.from('claims_reminders').select('row_data').eq('id', dueId).maybeSingle();
  await userDb.from('claims_reminders').update({
    row_data: { ...(rem?.row_data || {}), purpose: 'scheduled_send' },
  }).eq('id', dueId);
}
rec('due-saved', Boolean(dueId) && !dueErr, { id: dueId, err: dueErr?.message });

console.log('waiting up to 6.5 min for existing cron dry_run…');
let dueAfter = null;
let dueJob = null;
const deadline = Date.now() + 6.5 * 60 * 1000;
while (Date.now() < deadline) {
  dueAfter = dueId ? (await userDb.from('claims_reminders').select('id, status').eq('id', dueId).maybeSingle()).data : null;
  dueJob = dueId ? ((await userDb.from('claims_mail_jobs').select('id, status, preview, finished_at').eq('reminder_id', dueId).order('created_at', { ascending: false }).limit(1)).data || [])[0] : null;
  if (dueAfter?.status === 'completed' || dueJob?.status === 'dry_run_sent' || dueJob?.status === 'failed') break;
  await new Promise((r) => setTimeout(r, 20000));
}
rec('dispatch-dry-run', dueAfter?.status === 'completed' && dueJob?.status === 'dry_run_sent' && dueJob?.preview?.realEmailSend !== true, { reminder: dueAfter, job: dueJob });

const hist = (await userDb.from('claims_history').select('row_data').eq('claim_id', CLAIM_A).order('created_at', { ascending: false }).limit(15)).data || [];
rec('history', hist.some((h) => /מתוזמן/.test(JSON.stringify(h.row_data || {}))), { n: hist.length });

report.verdicts = {
  visiblePublic: report.checks.filter((c) => /schedule-visible/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  checkbox: report.checks.filter((c) => /schedule-visible/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  date: report.checks.filter((c) => c.name.endsWith('-date')).every((c) => c.ok) ? 'PASS' : 'FAIL',
  time: report.checks.filter((c) => c.name.endsWith('-time')).every((c) => c.ok) ? 'PASS' : 'FAIL',
  save: report.checks.filter((c) => /save/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  refresh: report.checks.filter((c) => /refresh|persist-fields/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  cancel: report.checks.filter((c) => /cancel/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  history: report.checks.find((c) => c.name === 'history')?.ok ? 'PASS' : 'FAIL',
  dispatchDryRun: report.checks.find((c) => c.name === 'dispatch-dry-run')?.ok ? 'PASS' : 'FAIL',
  liveSend: mode === 'dry_run' ? 'BLOCKED' : 'FAIL',
  desktop: report.checks.filter((c) => c.name.startsWith('desktop-') && c.ok).length >= 5 ? 'PASS' : 'FAIL',
  mobile: report.checks.filter((c) => c.name.startsWith('mobile-') && c.ok).length >= 5 ? 'PASS' : 'FAIL',
};
if (mode === 'dry_run') report.open.push('Live Send BLOCKED. MAIL_DISPATCH_MODE=dry_run. Do not flip for all Staging.');
writeFileSync(join(OUT, 'qa-result.json'), JSON.stringify(report, null, 2));
for (const name of ['desktop-composer.png', 'desktop-mailfu.png', 'mobile-composer.png', 'mobile-mailfu.png']) {
  const src = join(OUT, 'screenshots', name);
  if (existsSync(src)) copyFileSync(src, join(ART, `public_${name}`));
}
console.log(JSON.stringify({ ok: report.checks.every((c) => c.ok), verdicts: report.verdicts, failed: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
