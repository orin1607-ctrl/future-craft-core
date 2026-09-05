/**
 * Public STAGING QA — Recurring Email click/duplicate fix.
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
const OUT = join(process.cwd(), 'docs/audit-reports/claims-recurring-click-public-2026-09-05');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const TEST_TO = 'qa.recurring.closeout@futurecraft.staging';
const SUBJ = `QA click recurring ${new Date().toISOString().slice(0, 16)}`;
const BODY = 'TEST recurring click/duplicate fix on public STAGING — dry_run only.';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  liveMailSent: false,
  qaBase: PUBLIC,
  deployTxt: '',
  sha: execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
  checks: [],
  jsErrors: [],
  verdicts: {},
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
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
rec('public-pages', Boolean(deployTxt), { deployTxt: deployTxt.trim() });
rec('staging-only', STAGING_REF !== PROD_REF);

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

async function openClaim(page) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ state: 'visible', timeout: 50000 });
  if (await page.locator('[data-testid="claims-sb-open"]').count()) await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
  await page.locator('[data-testid="claims-nav-archive"]').click().catch(() => null);
  await page.waitForTimeout(400);
  await search.fill('TEST-CLAIMS');
  await page.waitForTimeout(800);
  await page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first().click();
  await page.locator('[data-testid="claims-send-mail"]').waitFor({ state: 'visible', timeout: 20000 });
}

async function openComposer(page) {
  await openClaim(page);
  await page.locator('[data-testid="claims-send-mail"]').click();
  await page.locator('[data-testid="mo-mail"]').waitFor({ state: 'visible', timeout: 20000 });
}

async function openMailFu(page) {
  await openClaim(page);
  await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
  await page.waitForTimeout(200);
  await page.locator('[data-testid="claims-tab-sub-mailfu"]').click({ force: true });
  await page.locator('[data-testid="mailfu-ready"]').waitFor({ state: 'visible', timeout: 25000 });
}

async function fillTo(page, subject) {
  await page.locator('[data-testid="mail-to"]').fill(TEST_TO);
  await page.locator('[data-testid="mail-to"]').press('Enter');
  await page.locator('[data-testid="mail-subj"]').fill(subject);
  await page.locator('[data-testid="mail-body"]').fill(BODY);
}

async function scheduledRepeat() {
  const rows = (await userDb.from('claims_reminders')
    .select('id, status, mail_kind, mail_to, mail_subject, repeat_every_days')
    .eq('claim_id', CLAIM_A)
    .eq('mail_kind', 'email_repeat')
    .eq('mail_to', TEST_TO)
    .eq('status', 'scheduled')
    .order('created_at', { ascending: false })
    .limit(8)).data || [];
  return { n: rows.length, row: rows[0] || null };
}

async function countHistory(actionRe) {
  const hist = (await userDb.from('claims_history').select('row_data').eq('claim_id', CLAIM_A).order('created_at', { ascending: false }).limit(30)).data || [];
  return hist.filter((h) => actionRe.test(JSON.stringify(h.row_data || {}))).length;
}

async function runViewport(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await inject(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (err) => report.jsErrors.push(`${name}:${err.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') report.jsErrors.push(`${name}:console:${msg.text()}`); });
  try {
    await openComposer(page);
    const recCount = await page.locator('[data-testid="mail-recurring"]').count();
    const recBlocks = await page.locator('[data-testid="mail-recurring-block"]').count();
    const extraBtn = await page.locator('[data-testid="claims-recurring-new"]').count();
    const pickerBefore = await page.locator('[data-testid="mail-recurring-days-picker"]').count();
    const followPickerBefore = await page.locator('[data-testid="mail-followup-days-picker"]').count();
    rec(`${name}-one-checkbox`, recCount === 1, { recCount });
    rec(`${name}-one-block`, recBlocks === 1, { recBlocks });
    rec(`${name}-no-second-create-btn`, extraBtn === 0);
    rec(`${name}-picker-hidden-until-click`, pickerBefore === 0 && followPickerBefore === 0, { pickerBefore, followPickerBefore });

    const disabledBefore = await page.locator('[data-testid="mail-recurring"]').isDisabled();
    rec(`${name}-checkbox-enabled`, !disabledBefore);

    await page.locator('[data-testid="mail-recurring"]').check({ force: false });
    await page.waitForTimeout(200);
    const checked = await page.locator('[data-testid="mail-recurring"]').isChecked();
    rec(`${name}-click-responds`, checked);
    const pickerAfter = await page.locator('[data-testid="mail-recurring-days-picker"]');
    await pickerAfter.waitFor({ state: 'visible', timeout: 5000 });
    rec(`${name}-options-open`, await pickerAfter.isVisible());
    rec(`${name}-days-enabled`, !(await page.locator('[data-testid="mail-recurring-days-1"]').isDisabled()));

    await fillTo(page, `${SUBJ} ${name} d1`);
    await page.locator('[data-testid="mail-recurring-days-1"]').click();
    await page.screenshot({ path: join(OUT, 'screenshots', `${name}-one-option.png`), fullPage: true });
    await page.locator('[data-testid="mail-recurring-save"]').click();
    await page.waitForTimeout(1800);
    let saved = await scheduledRepeat();
    rec(`${name}-every-1-save`, saved.n === 1 && Number(saved.row?.repeat_every_days) === 1, { n: saved.n, days: saved.row?.repeat_every_days, id: saved.row?.id });

    await openComposer(page);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => null);
    await openMailFu(page);
    const listed1 = (await page.locator('.fu-box').allInnerTexts()).some((t) => t.includes('מייל חוזר') && t.includes('כל יום'));
    rec(`${name}-refresh-1`, listed1 && Number((await scheduledRepeat()).row?.repeat_every_days) === 1);

    await openComposer(page);
    await fillTo(page, `${SUBJ} ${name} d2`);
    if (!(await page.locator('[data-testid="mail-recurring"]').isChecked())) await page.locator('[data-testid="mail-recurring"]').check();
    await page.locator('[data-testid="mail-recurring-days-2"]').click();
    await page.locator('[data-testid="mail-recurring-save"]').click();
    await page.waitForTimeout(1800);
    saved = await scheduledRepeat();
    rec(`${name}-edit-2`, saved.n === 1 && Number(saved.row?.repeat_every_days) === 2, { n: saved.n, days: saved.row?.repeat_every_days });

    await openMailFu(page);
    rec(`${name}-refresh-2`, Number((await scheduledRepeat()).row?.repeat_every_days) === 2);

    const id = saved.row?.id;
    if (id && await page.locator(`[data-testid="fu-cancel-${id}"]`).count()) {
      await page.locator(`[data-testid="fu-cancel-${id}"]`).click();
      await page.waitForTimeout(1500);
    } else {
      rec(`${name}-cancel`, false, { err: 'cancel button missing', id });
    }
    const afterCancel = (await userDb.from('claims_reminders').select('status').eq('id', id || 'x').maybeSingle()).data;
    rec(`${name}-cancel`, afterCancel?.status === 'cancelled', { status: afterCancel?.status, id });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openMailFu(page);
    const stillScheduled = await scheduledRepeat();
    rec(`${name}-cancel-refresh`, stillScheduled.n === 0, { n: stillScheduled.n });

    await openComposer(page);
    await fillTo(page, `${SUBJ} ${name} d3`);
    await page.locator('[data-testid="mail-recurring"]').check();
    await page.locator('[data-testid="mail-recurring-days-3"]').click();
    await page.locator('[data-testid="mail-recurring-save"]').click();
    await page.waitForTimeout(1600);
    saved = await scheduledRepeat();
    rec(`${name}-every-3`, saved.n === 1 && Number(saved.row?.repeat_every_days) === 3, { days: saved.row?.repeat_every_days, n: saved.n });

    await openComposer(page);
    await fillTo(page, `${SUBJ} ${name} custom`);
    await page.locator('[data-testid="mail-recurring"]').check();
    await page.locator('[data-testid="mail-recurring-days-other"]').click();
    await page.locator('[data-testid="mail-recurring-days-other-input"]').fill('8');
    await page.locator('[data-testid="mail-recurring-save"]').click();
    await page.waitForTimeout(1600);
    saved = await scheduledRepeat();
    rec(`${name}-custom`, saved.n === 1 && Number(saved.row?.repeat_every_days) === 8, { days: saved.row?.repeat_every_days, n: saved.n });
    await page.screenshot({ path: join(OUT, 'screenshots', `${name}-mailfu-custom.png`), fullPage: true });

    if (saved.row?.id) {
      await openMailFu(page);
      if (await page.locator(`[data-testid="fu-cancel-${saved.row.id}"]`).count()) {
        await page.locator(`[data-testid="fu-cancel-${saved.row.id}"]`).click();
        await page.waitForTimeout(1000);
      }
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

const histDefined = await countHistory(/הוגדר מייל חוזר|עודכן מייל חוזר/);
rec('history-present', histDefined > 0, { histDefined });
rec('no-js-errors', report.jsErrors.length === 0, { errors: report.jsErrors.slice(0, 8) });

report.verdicts = {
  oneUi: report.checks.filter((c) => /one-checkbox|one-block|no-second-create-btn/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  click: report.checks.filter((c) => /click-responds|options-open|days-enabled/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  every1: report.checks.filter((c) => /every-1-save/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  every2: report.checks.filter((c) => /edit-2/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  every3: report.checks.filter((c) => /every-3/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  custom: report.checks.filter((c) => /custom/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  refresh: report.checks.filter((c) => /refresh-/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  cancel: report.checks.filter((c) => /cancel/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  noDupJobs: report.checks.filter((c) => /every-1-save|edit-2|every-3|custom/.test(c.name)).every((c) => c.ok) ? 'PASS' : 'FAIL',
  history: report.checks.find((c) => c.name === 'history-present')?.ok ? 'PASS' : 'FAIL',
  desktop: report.checks.filter((c) => c.name.startsWith('desktop-') && !c.ok).length === 0 ? 'PASS' : 'FAIL',
  mobile: report.checks.filter((c) => c.name.startsWith('mobile-') && !c.ok).length === 0 ? 'PASS' : 'FAIL',
};
writeFileSync(join(OUT, 'qa-result.json'), JSON.stringify(report, null, 2));
for (const name of ['desktop-one-option.png', 'desktop-mailfu-custom.png', 'mobile-one-option.png']) {
  const src = join(OUT, 'screenshots', name);
  if (existsSync(src)) copyFileSync(src, join(ART, `public_recurring_fix_${name}`));
}
console.log(JSON.stringify({ ok: report.checks.every((c) => c.ok), verdicts: report.verdicts, failed: report.checks.filter((c) => !c.ok).map((c) => c.name), jsErrors: report.jsErrors }, null, 2));
