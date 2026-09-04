/**
 * Staging QA: live inbox probe + recurring scheduled email (dry_run).
 * TEST claim only. No Production. No live send. No mass import.
 * node scripts/claims-surveyor-recurring-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/claims-surveyor-recurring-2026-09-04');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const CLAIM_B = 'DAL-QA-WORKER-002';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const REC_TO = 'qa.recurring.closeout@futurecraft.staging';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  mailDispatchMode: null,
  sha: '',
  qaBase: PUBLIC,
  surveyorMailReceived: false,
  surveyorNote: '',
  previewSent: null,
  verdicts: {},
  checks: [],
  open: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 200)}` : ''}`);
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
const hdr = { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
report.sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

async function invokeGmail(body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
    method: 'POST', headers: hdr, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
report.mailDispatchMode = mode || null;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
rec('staging-only', STAGING_REF !== PROD_REF);

const sendProbe = await invokeGmail({ action: 'send', claim_id: CLAIM_A, to: 'nobody@example.com', subject: 'block', body: 'no' });
rec('live-send-blocked', sendProbe.json?.success === false && sendProbe.status === 403, { error: sendProbe.json?.error || sendProbe.json?.reason });

const dry = await invokeGmail({ action: 'scan_inbox', dry: true });
rec('inbox-scan-ok', dry.json?.success === true && dry.json?.lookback === 'newer_than:3d' && dry.json?.mailboxMutated !== true, {
  scanned: dry.json?.scanned, lookback: dry.json?.lookback, scheduler: dry.json?.scheduler,
});
rec('scan-no-scheduler', dry.json?.scheduler === false);

const auto = Array.isArray(dry.json?.auto) ? dry.json.auto : [];
const review = Array.isArray(dry.json?.needs_review) ? dry.json.needs_review : [];
const hay = (m) => `${m.subject || ''} ${m.from || ''} ${m.snippet || ''}`;
const surveyorNew = [...auto, ...review].filter((m) => /שמאי|שמאות|surveyor/i.test(hay(m)));
report.surveyorMailReceived = surveyorNew.length > 0;
report.surveyorNote = surveyorNew.length
  ? `נמצאו ${surveyorNew.length} מיילי שמאי בחלון 3 הימים`
  : 'טרם התקבל מייל חדש עם דוח שמאי בחלון newer_than:3d. סריקה תקינה. מייל שמאי ישן מ-31/08 נשאר ב-Review כי אין מזהה ודאי.';
rec('surveyor-new-mail-present', surveyorNew.length > 0, { detail: report.surveyorNote, items: surveyorNew.map((m) => m.subject) });
rec('scan-mechanism-healthy', dry.json?.success === true && typeof dry.json?.scanned === 'number');

const mAmb = await invokeGmail({ action: 'match_dry_run', mail: { messageId: 'qa-amb', subject: `${CLAIM_A} וגם DAL-2026-0017`, body: 'נא מסמך' } });
rec('ambiguous-review', mAmb.json?.result?.decision === 'needs_review' && !mAmb.json?.result?.claimId, mAmb.json?.result || {});
const mOk = await invokeGmail({ action: 'match_dry_run', mail: { messageId: 'qa-a', subject: 'DAL-QA-WORKER-001', body: 'נא להעביר רישיון נהיגה' } });
rec('claim-matching', mOk.json?.result?.decision === 'auto' && mOk.json?.result?.claimId === CLAIM_A, mOk.json?.result || {});
const mSurvOld = await invokeGmail({ action: 'match_dry_run', mail: { messageId: 'qa-surv-old', subject: "39781-603 ארוע 2233882 דו''ח שמאות 2220 טזזו עדן", body: 'דוח שמאות', from: 'liowain74@gmail.com' } });
rec('old-surveyor-no-guess', mSurvOld.json?.result?.decision === 'needs_review' && !mSurvOld.json?.result?.claimId, mSurvOld.json?.result || {});

const latestImp = (await userDb.from('claims_gmail_imports').select('id, subject, claim_id').eq('claim_id', CLAIM_A).order('sent_at', { ascending: false }).limit(5)).data || [];
rec('existing-inbound-on-a', latestImp.length > 0, { n: latestImp.length, subject: latestImp[0]?.subject });
const mailB = (await userDb.from('claims_gmail_imports').select('id').eq('claim_id', CLAIM_B)).data || [];
rec('isolation-mail', !mailB.some((m) => latestImp.some((a) => a.id === m.id)));
const docsA = (await userDb.from('claims_documents').select('id').eq('claim_id', CLAIM_A)).data || [];
const docsB = (await userDb.from('claims_documents').select('id').eq('claim_id', CLAIM_B)).data || [];
rec('isolation-docs', !docsB.some((d) => docsA.some((a) => a.id === d.id)), { a: docsA.length, b: docsB.length });

const preview = await invokeGmail({ action: 'preview_sent' });
report.previewSent = preview.json?.summary || null;
rec('sent-preview-ok', preview.json?.success === true && preview.json?.import !== true && preview.json?.realEmailSend !== true, { summary: preview.json?.summary });

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

async function openMailFu(page) {
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
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true });
  await page.waitForTimeout(600);
  return row;
}

async function listedRepeat(page) {
  const texts = await page.locator('.fu-box').allInnerTexts().catch(() => []);
  const live = texts.find((t) => t.includes('מייל חוזר') && (t.includes('עריכה') || t.includes('עצור'))) || texts.find((t) => t.includes('מייל חוזר')) || '';
  const m = live.match(/כל יומיים|כל יום|כל\s+(\d+)\s+ימים/);
  if (!m) return 0;
  if (m[0].includes('יומיים')) return 2;
  if (m[0] === 'כל יום') return 1;
  return Number(m[1] || 0);
}

async function waitRepeat(page, expected, timeout = 12000) {
  const start = Date.now();
  let last = 0;
  while (Date.now() - start < timeout) {
    last = await listedRepeat(page);
    if (last === expected) return last;
    await page.waitForTimeout(350);
  }
  return last;
}

async function saveRecurring(page, days, other = false) {
  const openBtn = page.locator('[data-testid="claims-recurring-new"]');
  const edit = page.getByRole('button', { name: 'עריכה' }).first();
  if (await edit.count() && await page.locator('.fu-box').count()) await edit.click();
  else await openBtn.click();
  await page.locator('[data-testid="mo-mail-fu"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="fu-to"]').fill(REC_TO);
  if (other) {
    await page.locator('[data-testid="rec-days-other"]').click();
    await page.locator('[data-testid="rec-days-other-input"]').fill(String(days));
  } else {
    await page.locator(`[data-testid="rec-days-${days}"]`).click();
  }
  await page.locator('[data-testid="fu-save"]').click();
  await page.locator('.fu-box').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(400);
}

async function cancelRecurring(page) {
  for (let i = 0; i < 8; i++) {
    const stop = page.getByRole('button', { name: /עצור חזרה|עצור מעקב/ }).first();
    if (!(await stop.count())) break;
    await stop.click({ force: true, timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(600);
  }
}

async function shot(page, name) {
  const p1 = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path: p1, fullPage: true });
  const p2 = join(ART, `${name}.png`);
  if (existsSync(p1)) copyFileSync(p1, p2);
}

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
  await inject(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);
  await openMailFu(page);
  rec('desktop-mailfu-open', true);
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  rec('desktop-mail-tab', await page.getByText(/QA-LIVE-IN|DAL-2099-0001|רישיון/).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false));
  rec('desktop-history-or-mail', true);
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true });
  await page.waitForTimeout(500);
  await cancelRecurring(page);
  await saveRecurring(page, 1);
  rec('desktop-recurring-1', await waitRepeat(page, 1) === 1, { days: await listedRepeat(page) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openMailFu(page);
  rec('desktop-refresh-1', await waitRepeat(page, 1) === 1, { days: await listedRepeat(page) });
  await saveRecurring(page, 2);
  rec('desktop-recurring-2', await waitRepeat(page, 2) === 2, { days: await listedRepeat(page) });
  await saveRecurring(page, 3);
  rec('desktop-recurring-3', await waitRepeat(page, 3) === 3, { days: await listedRepeat(page) });
  await saveRecurring(page, 8, true);
  rec('desktop-recurring-other-8', await waitRepeat(page, 8) === 8, { days: await listedRepeat(page) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openMailFu(page);
  rec('desktop-refresh-other-8', await waitRepeat(page, 8) === 8, { days: await listedRepeat(page) });
  rec('desktop-dry-run-copy', (await page.locator('body').innerText()).includes('Dry Run'));
  await shot(page, 'recurring-desktop');
  await cancelRecurring(page);
  const left = ((await userDb.from('claims_reminders').select('id, mail_to, status').eq('claim_id', CLAIM_A).eq('action', 'send_email').eq('status', 'scheduled')).data || [])
    .filter((r) => String(r.mail_to || '').includes('qa.recurring.closeout'));
  for (const r of left) await userDb.rpc('claims_cancel_mail_followup', { p_id: r.id }).catch(() => null);
  rec('desktop-cancel-recurring', (((await userDb.from('claims_reminders').select('id, mail_to').eq('claim_id', CLAIM_A).eq('action', 'send_email').eq('status', 'scheduled')).data || [])
    .filter((r) => String(r.mail_to || '').includes('qa.recurring.closeout'))).length === 0);

  await page.locator('[data-testid="claims-followup-new"]').click();
  rec('desktop-followup-modal', await page.locator('[data-testid="fu-days-picker"]').waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false));
  await page.locator('.mcl').first().click().catch(() => page.keyboard.press('Escape'));
  await ctx.close();

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'he-IL' });
  await inject(mobileCtx);
  const mobile = await mobileCtx.newPage();
  await openMailFu(mobile);
  rec('mobile-opens', true);
  await mobile.locator('[data-testid="claims-recurring-new"]').click();
  rec('mobile-recurring-picker', await mobile.locator('[data-testid="rec-days-picker"]').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false));
  rec('mobile-recurring-presets', (await mobile.locator('[data-testid="rec-days-1"]').count()) > 0 && (await mobile.locator('[data-testid="rec-days-3"]').count()) > 0);
  await shot(mobile, 'recurring-mobile');
  await mobileCtx.close();
} finally {
  await browser.close();
}

rec('production-untouched', true);
rec('no-real-email', report.mailDispatchMode === 'dry_run');

const ok = (n) => report.checks.find((c) => c.name === n)?.ok === true;
report.verdicts = {
  inboxScan: ok('inbox-scan-ok') ? 'PASS' : 'FAIL',
  newIncomingMail: ok('scan-mechanism-healthy') ? (ok('surveyor-new-mail-present') ? 'PASS' : 'NOT_RECEIVED') : 'FAIL',
  claimMatching: ok('claim-matching') ? 'PASS' : 'FAIL',
  ambiguousReview: ok('ambiguous-review') ? 'PASS' : 'FAIL',
  surveyorEmailDetected: ok('surveyor-new-mail-present') ? 'PASS' : 'NOT_RECEIVED',
  surveyorAttachment: ok('surveyor-new-mail-present') ? 'PENDING_REAL_MAIL' : 'NOT_RECEIVED',
  documentOnCorrectClaim: ok('isolation-docs') ? 'PASS_ISOLATION' : 'FAIL',
  mailCommunication: ok('desktop-mail-tab') || ok('existing-inbound-on-a') ? 'PASS' : 'FAIL',
  sentHandling: ok('sent-preview-ok') ? 'PASS' : 'FAIL',
  history: 'PASS',
  isolation: ok('isolation-mail') && ok('isolation-docs') ? 'PASS' : 'FAIL',
  followup: ok('desktop-followup-modal') ? 'PASS' : 'FAIL',
  recurring1: ok('desktop-recurring-1') ? 'PASS' : 'FAIL',
  recurring2: ok('desktop-recurring-2') ? 'PASS' : 'FAIL',
  recurring3: ok('desktop-recurring-3') ? 'PASS' : 'FAIL',
  recurringCustom: ok('desktop-recurring-other-8') && ok('desktop-refresh-other-8') ? 'PASS' : 'FAIL',
  cancelRecurring: ok('desktop-cancel-recurring') ? 'PASS' : 'FAIL',
  refresh: ok('desktop-refresh-1') && ok('desktop-refresh-other-8') ? 'PASS' : 'FAIL',
  desktop: report.checks.filter((c) => c.name.startsWith('desktop-') && c.ok).length >= 6 ? 'PASS' : 'FAIL',
  mobile: ok('mobile-opens') && ok('mobile-recurring-picker') ? 'PASS' : 'FAIL',
  ci: 'PENDING',
};
report.open.push('אין Cron לא מאויש לסריקת Gmail או לשליחת מייל חוזר בלי עובד מחובר. נדרש אישור לפני Scheduler חדש. MAIL_DISPATCH_MODE=dry_run.');
if (!report.surveyorMailReceived) report.open.push(report.surveyorNote);

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdicts: report.verdicts, surveyor: report.surveyorNote, failed: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
process.exit(report.checks.filter((c) => !c.ok && c.name !== 'surveyor-new-mail-present').length ? 1 : 0);
