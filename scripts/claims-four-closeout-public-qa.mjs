/**
 * Public STAGING QA for the four Claims closeout tasks.
 * TEST data only. No Gmail mailbox mutation. No Production.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const WANT_SHA = (process.env.CLAIMS_QA_SHA || execSync('git rev-parse --short origin/feat/incident-alerts-staging', { encoding: 'utf8' }).trim()).slice(0, 7);
const OUT = join(process.cwd(), 'docs/audit-reports/claims-four-closeout-2026-09-06');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const PNG_FRONT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8z4ADMI2qZGKgN2BipDVgYmQ0YGKkN2BiBAQAAP//LJsCCgAAAABJRU5ErkJggg==', 'base64');
const PNG_BACK = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAIUlEQVR4nGP8/58BDzCNqmRioDdgYqQ1YGKkNWBipDdgYgQEAAD//y5tAhYAAAAASUVORK5CYII=', 'base64');

const stamp = Date.now();
const CLIENT = `TEST-CLOSEOUT-${stamp}`;
const PLATE = `CLS${String(stamp).slice(-6)}`;
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  gmailMailboxMutated: false,
  qaBase: PUBLIC,
  wantSha: WANT_SHA,
  deployTxt: '',
  claimId: '',
  checks: [],
  jsErrors: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 240)}` : ''}`);
};

async function waitDeploy() {
  for (let i = 0; i < 40; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
    report.deployTxt = txt.trim();
    if (txt.includes(WANT_SHA)) return true;
    console.log(`wait deploy ${i + 1}/40 · ${txt.trim() || 'missing'}`);
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
  const canvas = page.locator('[data-testid="intake-signature"]');
  await canvas.waitFor({ timeout: 15000 });
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no signature canvas');
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 90);
  await page.mouse.move(box.x + 140, box.y + 50);
  await page.mouse.up();
}

async function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  if (existsSync(ART)) copyFileSync(path, join(ART, `claims-closeout-${name}.png`));
}

const deployed = await waitDeploy();
rec('public-pages-sha', deployed, { deployTxt: report.deployTxt, want: WANT_SHA });
if (!deployed) {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  process.exit(1);
}

const session = await login();
userDb.auth.setSession(session);

const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function runViewport(label, viewport) {
  const ctx = await browser.newContext({ locale: 'he-IL', viewport });
  ctx.on('page', (p) => p.on('pageerror', (e) => report.jsErrors.push(`${label}: ${e.message}`)));
  await inject(ctx, session);
  const page = await ctx.newPage();
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
  const allBtn = page.getByRole('button', { name: /הכול|כל התביעות/ });
  if (await allBtn.count()) await allBtn.first().click().catch(() => undefined);

  if (label === 'desktop') {
    await page.locator('[data-testid="claims-open-new"]').click();
    await page.waitForSelector('[data-testid="claims-new-modal"]');
    await page.locator('[data-testid="intake-name"]').fill(CLIENT);
    await page.locator('[data-testid="intake-phone"]').fill('0500000099');
    await page.locator('[data-testid="intake-plate"]').fill(PLATE);
    await page.locator('[data-testid="intake-event-date"]').fill('2026-09-06');
    await page.locator('#in_eplace').fill('תל אביב QA');
    await page.locator('[data-testid="intake-ack"]').check();
    await signPad(page);
    await shot(page, 't1-form-signed');
    await page.getByRole('button', { name: /שמור/ }).click();
    await page.waitForSelector('[data-testid="claims-card-snapshot"]', { timeout: 60000 });
    await page.waitForTimeout(2500);
    const pdfRow = page.locator('[data-testid="claim-doc-type-accident_notice"]');
    const pdfVisible = await pdfRow.count();
    rec('t1-signed-pdf-slot', pdfVisible > 0);
    const pdfFiles = await page.locator('[data-testid="claim-doc-files-accident_notice"]').innerText().catch(() => '');
    rec('t1-signed-pdf-listed', /טופס פתיחת תביעה חתום|טופס-פתיחת-תביעה-חתום/.test(pdfFiles), { detail: pdfFiles });
    await shot(page, 't1-docs-pdf');

    const { data: created } = await userDb.from('claims_records').select('id, client_name, row_data').eq('client_name', CLIENT).maybeSingle();
    report.claimId = created?.id || '';
    rec('t1-single-claim', Boolean(report.claimId), { claimId: report.claimId });

    const front = join(OUT, 'license-front.png');
    const back = join(OUT, 'license-back.png');
    writeFileSync(front, PNG_FRONT);
    writeFileSync(back, PNG_BACK);
    await page.setInputFiles('[data-testid="claim-doc-upload-license_driver-front"]', front);
    await page.waitForTimeout(2000);
    await page.setInputFiles('[data-testid="claim-doc-upload-license_driver-back"]', back);
    await page.waitForTimeout(2500);
    const licText = await page.locator('[data-testid="claim-doc-files-license_driver"]').innerText().catch(() => '');
    rec('t4-front', /קדמי/.test(licText), { detail: licText });
    rec('t4-back', /אחורי/.test(licText), { detail: licText });
    rec('t4-both', /קדמי/.test(licText) && /אחורי/.test(licText));
    await shot(page, 't4-license-both');

    const { data: docs1 } = await userDb.from('claims_documents').select('id, original_name, doc_meta, content_sha256').eq('claim_id', report.claimId);
    const pdfs = (docs1 || []).filter((d) => /טופס פתיחת תביעה חתום|טופס-פתיחת/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`));
    rec('t1-pdf-one-row', pdfs.length === 1, { count: pdfs.length });
    const licenses = (docs1 || []).filter((d) => d.doc_meta?.staff_type === 'driver_license');
    rec('t4-two-license-rows', licenses.length === 2, { count: licenses.length });

    if (report.claimId) {
      const mid1 = `qa-closeout-${stamp}-a`;
      const mid2 = `qa-closeout-${stamp}-b`;
      const imp1 = `IMP-QA-${stamp}-A`;
      const imp2 = `IMP-QA-${stamp}-B`;
      const tsk1 = `TSK-QA-${stamp}-A`;
      const tsk2 = `TSK-QA-${stamp}-B`;
      await userDb.from('claims_gmail_imports').insert([
        { id: imp1, claim_id: report.claimId, gmail_message_id: mid1, gmail_thread_id: `th-${stamp}`, from_addr: 'insurer@example.com', subject: 'TEST-CLOSEOUT נא להגיב', body_text: 'נא להגיב למייל זה', sent_at: new Date().toISOString(), imported_by_name: 'QA-CLOSEOUT' },
        { id: imp2, claim_id: report.claimId, gmail_message_id: mid2, gmail_thread_id: `th-${stamp}-2`, from_addr: 'insurer@example.com', subject: 'TEST-CLOSEOUT נא להעביר רישיון נהיגה', body_text: 'נא להעביר רישיון נהיגה', sent_at: new Date().toISOString(), imported_by_name: 'QA-CLOSEOUT' },
      ]);
      await userDb.from('claims_tasks').insert([
        { id: tsk1, claim_id: report.claimId, row_data: { id: tsk1, claimId: report.claimId, action: 'בקשת תגובה', gmailMessageId: mid1, requestKind: 'reply', done: 'false', workStatus: 'open', source: 'QA-CLOSEOUT' } },
        { id: tsk2, claim_id: report.claimId, row_data: { id: tsk2, claimId: report.claimId, action: 'רישיון נהיגה', gmailMessageId: mid2, requestKind: 'doc', docState: 'ready', done: 'false', workStatus: 'open', source: 'QA-CLOSEOUT' } },
      ]);
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="claims-open-new"]', { timeout: 90000 });
    if (await allBtn.count()) await allBtn.first().click().catch(() => undefined);
    await page.locator('input[placeholder*="חיפוש"], .fi').first().fill(CLIENT).catch(() => undefined);
    const search = page.locator('input[placeholder="🔎 חיפוש גלובלי..."]');
    if (await search.count()) {
      await search.fill(CLIENT);
      await page.waitForTimeout(800);
    }
    await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2000);
    if (await page.getByRole('button', { name: /הכול/ }).count()) await page.getByRole('button', { name: /הכול/ }).first().click().catch(() => undefined);
    const row = page.locator(`[data-testid="claim-row-${report.claimId}"]`);
    if (await row.count() === 0) {
      await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
      await page.waitForTimeout(800);
    }
    rec('t3-row-visible', await row.count() > 0);
    const badge2 = row.locator('[data-testid="claim-alert-mail_action"]');
    rec('t3-counter-2', await badge2.innerText().catch(() => '') === 'דואר דורש טיפול (2)', { detail: await badge2.innerText().catch(() => '') });
    await shot(page, 't3-counter-2');
    if (await badge2.count()) {
      await badge2.click();
      await page.waitForTimeout(1500);
      rec('t3-deeplink-gin', await page.locator('[data-testid="mail-correspondence"]').count() > 0);
      rec('t3-mail-a', await page.locator('[data-testid="mail-need-IMP-QA-' + stamp + '-A"], [data-mail-mid="qa-closeout-' + stamp + '-a"]').count() > 0);
    }

    await page.locator('[data-testid="claims-tab-group-work"]').click();
    await page.locator('[data-testid="claims-tab-sub-tasks"]').click();
    await page.waitForTimeout(600);
    const sel1 = page.locator(`[data-testid="task-status-TSK-QA-${stamp}-A"]`);
    if (await sel1.count()) {
      await sel1.selectOption('done');
      await page.waitForTimeout(1200);
    }
    await page.locator('.mcl').first().click().catch(() => undefined);
    await page.waitForTimeout(800);
    await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(1800);
    if (await page.getByRole('button', { name: /הכול/ }).count()) await page.getByRole('button', { name: /הכול/ }).first().click().catch(() => undefined);
    const badge1 = page.locator(`[data-testid="claim-row-${report.claimId}"] [data-testid="claim-alert-mail_action"]`);
    rec('t3-counter-1', await badge1.innerText().catch(() => '') === 'דואר דורש טיפול (1)', { detail: await badge1.innerText().catch(() => '') });
    await shot(page, 't3-counter-1');

    if (await badge1.count()) await badge1.click();
    await page.waitForTimeout(800);
    await page.locator('[data-testid="claims-tab-group-work"]').click();
    await page.locator('[data-testid="claims-tab-sub-tasks"]').click();
    const sel2 = page.locator(`[data-testid="task-status-TSK-QA-${stamp}-B"]`);
    if (await sel2.count()) {
      await sel2.selectOption('done');
      await page.waitForTimeout(1200);
    }
    await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(1800);
    if (await page.getByRole('button', { name: /הכול/ }).count()) await page.getByRole('button', { name: /הכול/ }).first().click().catch(() => undefined);
    const badge0 = page.locator(`[data-testid="claim-row-${report.claimId}"] [data-testid="claim-alert-mail_action"]`);
    rec('t3-counter-0', await badge0.count() === 0, { detail: await badge0.innerText().catch(() => '') });
    await shot(page, 't3-counter-0');

    await page.locator(`[data-testid="claim-row-${report.claimId}"]`).click().catch(() => undefined);
    await page.waitForTimeout(1200);
    await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
    await page.waitForTimeout(800);
    const { data: docs2 } = await userDb.from('claims_documents').select('id, original_name, doc_meta').eq('claim_id', report.claimId);
    const pdfs2 = (docs2 || []).filter((d) => /טופס פתיחת תביעה חתום|טופס-פתיחת/.test(`${d.original_name}${d.doc_meta?.staff_title || ''}`));
    const lic2 = (docs2 || []).filter((d) => d.doc_meta?.staff_type === 'driver_license');
    rec('t1-refresh-no-dup-pdf', pdfs2.length === 1, { count: pdfs2.length });
    rec('t4-refresh-both', lic2.length === 2, { count: lic2.length });
    rec(`${label}-no-js-error`, report.jsErrors.filter((x) => x.startsWith(label)).length === 0, { errors: report.jsErrors });
  } else {
    rec('mobile-claims-open', await page.locator('[data-testid="claims-open-new"]').count() > 0);
    if (report.claimId) {
      if (await page.getByRole('button', { name: /הכול/ }).count()) await page.getByRole('button', { name: /הכול/ }).first().click().catch(() => undefined);
      const row = page.locator(`[data-testid="claim-row-${report.claimId}"]`);
      rec('mobile-row', await row.count() > 0);
      if (await row.count()) {
        await row.click();
        await page.waitForTimeout(1000);
        rec('mobile-card', await page.locator('[data-testid="claims-card-snapshot"]').count() > 0);
        await page.locator('[data-testid="claims-open-docs"]').click().catch(() => undefined);
        await page.waitForTimeout(800);
        rec('mobile-license-ui', await page.locator('[data-testid="claim-doc-upload-license_driver-front"]').count() > 0);
        await shot(page, 'mobile-docs');
      }
    }
  }
  await ctx.close();
}

try {
  await runViewport('desktop', { width: 1440, height: 900 });
  await runViewport('mobile', { width: 390, height: 844 });
} catch (e) {
  rec('qa-threw', false, { err: String(e?.stack || e) });
}

await browser.close();
const failed = report.checks.filter((c) => !c.ok);
report.failed = failed.map((c) => c.name);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ failed: report.failed, claimId: report.claimId, deployTxt: report.deployTxt }, null, 2));
process.exit(failed.length ? 1 : 0);
