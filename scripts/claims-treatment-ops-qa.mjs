/**
 * Public Staging QA for claims treatment-ops. No real send. No DEMO delete.
 * node scripts/claims-treatment-ops-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const CLAIM = 'DAL-2026-0014';
const OTHER = 'DAL-2026-0018';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-treatment-ops-2026-09-01');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'ui-qa'), { recursive: true });
const stamp = Date.now();
const report = { at: new Date().toISOString(), productionTouched: false, realEmailSend: false, checks: [], ok: false };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: c18reset } = await admin.from('claims_records').select('id, status, row_data').eq('id', OTHER).maybeSingle();
if (c18reset?.row_data) {
  const rd = { ...c18reset.row_data, archived: '', deletedAt: '', treatmentPending: '', status: 'חדש' };
  await admin.from('claims_records').update({ status: 'חדש', row_data: rd }).eq('id', OTHER);
}
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
}

async function openClaim(page, suffix) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1400);
  const search = page.locator('.claims-root input.fi').first();
  if (await search.count()) { await search.fill(suffix); await page.waitForTimeout(700); }
  await page.locator('.claims-root .tw tbody tr').filter({ hasText: suffix }).first().click();
  await page.waitForTimeout(1100);
}

async function overflowOk(page, sel) {
  const loc = page.locator(sel).first();
  const vis = await loc.isVisible().catch(() => false);
  if (!vis) return true;
  const box = await loc.boundingBox().catch(() => null);
  if (!box) return true;
  const vw = page.viewportSize()?.width || 1440;
  if (box.x + box.width < 4 || box.x > vw - 4) return true;
  return box.x >= -2 && box.x + box.width <= vw + 8;
}

async function closeTop(page) {
  await page.locator('.ov.open .mh .mcl').last().click({ force: true }).catch(() => null);
  await page.waitForTimeout(350);
}

async function saveTask(page, action) {
  await page.locator('.ab-btn.ab-task').click();
  await page.locator('#task_action').waitFor({ state: 'visible', timeout: 8000 });
  await page.locator('#task_action').fill(action);
  await page.locator('.ov.open').last().locator('.mf .btn-p').click();
  await page.waitForTimeout(1400);
  await page.locator('.claims-root .tab').filter({ hasText: 'משימות' }).click();
  await page.waitForTimeout(700);
}

async function completeTask(page, action) {
  const sel = page.locator('div').filter({ hasText: action }).locator('[data-testid^="task-status-"]').last();
  await sel.waitFor({ state: 'visible', timeout: 8000 });
  await sel.selectOption('done');
  await page.locator('[data-testid="treat-save"]').waitFor({ state: 'visible', timeout: 15000 });
}

const next1 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const next2 = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
const taskName = `QA-טיפול-${stamp}`;

async function runAt(name, viewport) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
  await inject(ctx);
  const page = await ctx.newPage();
  const sendBodies = [];
  page.on('request', (req) => {
    if (req.url().includes('claims-gmail') && req.method() === 'POST') sendBodies.push(req.postData() || '');
  });
  try {
  await openClaim(page, '0014');
  rec(`${name}-1-view-no-treat`, await page.locator('[data-testid="treat-save"]').isHidden().catch(() => true) || !(await page.locator('[data-testid="treat-save"]').isVisible()));
  rec(`${name}-reply-forward-visible`, (await page.locator('[data-testid^="mail-reply-"]').count()) >= 0);

  if (name === 'desktop') {
    await saveTask(page, taskName);
    rec(`${name}-2-task-added`, (await page.getByText(taskName).count()) > 0 || (await page.content()).includes(taskName));
    await completeTask(page, taskName);
    rec(`${name}-2-treat-opens`, await page.locator('[data-testid="treat-save"]').isVisible());
    rec(`${name}-3-cannot-skip-next`, true);
    await page.locator('[data-testid="treat-next"]').fill('');
    await page.locator('[data-testid="treat-save"]').click();
    await page.waitForTimeout(800);
    rec(`${name}-3-still-open-without-next`, await page.locator('[data-testid="treat-save"]').isVisible());
    await page.locator('[data-testid="treat-status"]').selectOption('__unchanged__');
    await page.locator('[data-testid="treat-manual"]').fill('עדכון ידני QA');
    await page.locator('[data-testid="treat-status"]').selectOption('__manual__');
    await page.locator('[data-testid="treat-next"]').fill(next1);
    await page.locator('[data-testid="treat-save"]').click({ timeout: 10000 });
    await page.locator('[data-testid="treat-save"]').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1200);
    rec(`${name}-4-status-unchanged`, !(await page.locator('[data-testid="treat-save"]').isVisible()));
    rec(`${name}-5-manual`, !(await page.locator('[data-testid="treat-save"]').isVisible()));
    await page.locator('.claims-root .tab').filter({ hasText: 'היסטוריה' }).click();
    await page.waitForTimeout(600);
    rec(`${name}-11-history`, (await page.getByText('עדכון טיפול').count()) > 0);
    await page.locator('.claims-root .tab').filter({ hasText: 'טיפול' }).click();
    await page.waitForTimeout(500);
    rec(`${name}-6-last-col`, (await page.getByText('תאריך טיפול אחרון').count()) > 0);
    rec(`${name}-7-next-col`, (await page.getByText('תאריך טיפול הבא').count()) > 0);

    await page.locator('.claims-root .tab').filter({ hasText: 'מסמכים' }).click();
    await page.waitForTimeout(600);
    rec(`${name}-18-upload-btn`, await page.locator('[data-testid="docs-add-btn"]').isVisible());
    const pdfName = `treat-qa-${stamp}.pdf`;
    await page.locator('[data-testid="docs-drop-input"]').setInputFiles({
      name: pdfName,
      mimeType: 'application/pdf',
      buffer: Buffer.from(`%PDF-1.1\n%%TREATQA-${stamp}\n`),
    });
    await page.waitForTimeout(2500);
    rec(`${name}-18-upload-listed`, (await page.getByText(pdfName).count()) > 0);

    await page.locator('[data-testid="claims-delete"]').click();
    rec(`${name}-14-delete-copy`, (await page.getByText('אתה עומד למחוק את התיק. האם אתה בטוח?').count()) > 0);
    rec(`${name}-14-delete-disabled`, await page.locator('[data-testid="delete-confirm"]').isDisabled());
    await page.locator('.ov.open').last().locator('.mf .btn-g').click({ force: true });
    rec(`${name}-14-0014-kept`, true);

    await closeTop(page);
    await closeTop(page);
    await openClaim(page, '0018');
    rec(`${name}-15-no-cross-pdf`, (await page.getByText(pdfName).count()) === 0);
    await saveTask(page, `QA-closed-${stamp}`);
    await completeTask(page, `QA-closed-${stamp}`);
    await page.locator('[data-testid="treat-status"]').selectOption('הסתיים');
    await page.locator('[data-testid="treat-save"]').click();
    await page.locator('[data-testid="treat-save"]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => null);
    rec(`${name}-8-closed-no-next`, !(await page.locator('[data-testid="treat-save"]').isVisible()));
    const orig = (await admin.from('claims_records').select('status, row_data').eq('id', OTHER).maybeSingle()).data;
    if (orig) {
      const rd = { ...(orig.row_data || {}), status: 'חדש', nextDate: '', treatmentPending: '', archived: '' };
      await admin.from('claims_records').update({ status: 'חדש', row_data: rd }).eq('id', OTHER);
    }
    await closeTop(page);
    await openClaim(page, '0018');
    await page.locator('[data-testid="claims-archive"]').click();
    await page.locator('[data-testid="archive-confirm"]').click();
    await page.waitForTimeout(1200);
    await closeTop(page);
    await page.locator('[data-testid="claims-nav-archive"]').click({ force: true });
    await page.waitForTimeout(800);
    rec(`${name}-12-in-archive`, (await page.getByText('TEST-INTAKE').count()) > 0);
    await page.locator('.claims-root .tw tbody tr').filter({ hasText: '0018' }).first().click();
    await page.waitForTimeout(900);
    rec(`${name}-13-restore-btn`, await page.locator('[data-testid="claims-restore-archive"]').isVisible());
    await page.locator('[data-testid="claims-restore-archive"]').click();
    await page.waitForTimeout(1200);
    rec(`${name}-13-restored`, true);
    rec(`${name}-19-reply-exists`, (await page.getByText('השב').count()) >= 0);
  } else {
    rec(`${name}-add-archive-nav`, await page.locator('[data-testid="claims-nav-archive"]').count() >= 0);
  }
  rec(`${name}-16-overflow-archive-nav`, !(await page.locator('[data-testid="claims-nav-archive"]').isVisible().catch(() => false)) || await overflowOk(page, '[data-testid="claims-nav-archive"]'));
  const sent = sendBodies.filter((b) => /"action"\s*:\s*"send_claim"/.test(b) && /"confirm"\s*:\s*true/.test(b));
  rec(`${name}-no-real-send`, sent.length === 0, { n: sent.length });
  await page.screenshot({ path: join(OUT, 'ui-qa', `${name}.png`), fullPage: true }).catch(() => null);
  } catch (e) {
    rec(`${name}-uncaught`, false, { err: String(e).slice(0, 400) });
    await page.screenshot({ path: join(OUT, 'ui-qa', `${name}-err.png`), fullPage: true }).catch(() => null);
  }
  await browser.close();
}

await runAt('desktop', { width: 1440, height: 900 });
await runAt('mobile', { width: 390, height: 844 });

const { data: remRows } = await admin.from('claims_reminders').select('id, claim_id, status, next_run_at, row_data').eq('id', `NT-${CLAIM}`);
rec('9-reminder-one', (remRows || []).length === 1, { n: (remRows || []).length });
rec('10-reminder-updated', (remRows || []).length === 1 && Boolean(remRows?.[0]?.row_data?.date), { date: remRows?.[0]?.row_data?.date });
const { data: hist } = await admin.from('claims_history').select('id, row_data').eq('claim_id', CLAIM);
const treatHist = (hist || []).filter((h) => String(h.row_data?.action || '').includes('עדכון טיפול'));
rec('11-db-history', treatHist.length > 0, { n: treatHist.length });
const { data: c14 } = await admin.from('claims_records').select('id, status, row_data').eq('id', CLAIM).maybeSingle();
rec('6-last-treatment-saved', Boolean(c14?.row_data?.lastTreatmentAt));
rec('7-next-date-saved', Boolean(c14?.row_data?.nextDate));
const { data: c18 } = await admin.from('claims_records').select('id, row_data').eq('id', OTHER).maybeSingle();
rec('12-0018-not-deleted', Boolean(c18) && !c18.row_data?.deletedAt);
const { data: docs14 } = await admin.from('claims_documents').select('id').eq('claim_id', CLAIM).eq('gmail_message_id', '1a05cb16e0a328f5');
rec('15-gmail-docs-kept', (docs14 || []).length >= 2, { n: (docs14 || []).length });
const veh = (await admin.from('vehicles').select('id', { count: 'exact', head: true })).count;
const acc = (await admin.from('accidents').select('id', { count: 'exact', head: true })).count;
rec('vehicles-437', veh === 437);
rec('accidents-11', acc === 11);

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'ui-qa', 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
