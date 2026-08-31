/**
 * Staging QA: assign hang fix. Assigns 1 then 3 new leads to Tair, then unassigns.
 * Does not mass-assign. Does not import. Does not delete.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-assign-hang-2026-08-31');
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' };
const ADMIN = { email: 'orin1607@gmail.com' };
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}
const keys = loadKeys();
const adminDb = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

async function sessionFor(email) {
  const client = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verifyOtp ${email}`);
  return auth.session;
}
function storagePayload(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
}
async function counts() {
  const dir = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await adminDb.from('telemarketing_lead_directory').select('id, assigned_to, lead_wave').range(from, from + 999);
    if (error) throw error;
    dir.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const { count: followups } = await adminDb.from('telemarketing_followups').select('id', { count: 'exact', head: true });
  const { count: completed } = await adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true }).eq('status', 'completed');
  const hist = await adminDb.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR.id);
  return {
    directory: dir.length,
    old: dir.filter((r) => r.lead_wave === 'old').length,
    neu: dir.filter((r) => r.lead_wave === 'new').length,
    tair: dir.filter((r) => r.assigned_to === TAIR.id).length,
    followups,
    completed,
    histSeconds: (hist.data || []).reduce((s, r) => s + Number(r.duration_seconds || 0), 0),
  };
}

const report = { at: new Date().toISOString(), pass: false, checks: [], productionTouched: false, stagingRef: STAGING_REF };
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 350) : '');
}

try {
  const stamp = Date.now();
  const html = await fetch(`${BASE}/?t=${stamp}`, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.text());
  const bundle = html.match(/assets\/index-[^"'\\\s>]+\.js/)?.[0];
  report.liveBundle = bundle || null;
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${stamp}`).then((r) => r.text()).catch(() => '');
  report.deployed_ref = deployTxt.trim();
  check('deploy-staging', /feat\/incident-alerts-staging/.test(deployTxt), deployTxt.trim());
  if (EXPECTED_SHA) check('deploy-expected-sha', deployTxt.includes(EXPECTED_SHA.slice(0, 7)), deployTxt.trim());
  if (bundle) {
    const js = await fetch(`${BASE}/${bundle}`).then((r) => r.text());
    check('bundle-chunk-hint', js.includes('במנות קטנות') || js.includes('lead-assign-error'));
  }

  const before = await counts();
  check('before-old', before.old === 314, before);
  check('before-new', before.neu === 2030, before);
  check('before-tair-zero', before.tair === 0, before.tair);
  check('before-hist', before.histSeconds === 5400, before.histSeconds);

  const adminSession = await sessionFor(ADMIN.email);
  const tairSession = await sessionFor(TAIR.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(adminSession),
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => /2344/.test(document.querySelector('[data-testid="lead-directory-count"]')?.textContent || ''), null, { timeout: 30000 });
  if (await page.getByTestId('lead-directory-toggle').count()) {
    const expanded = await page.getByTestId('lead-directory-toggle').getAttribute('aria-expanded');
    if (expanded !== 'true') await page.getByTestId('lead-directory-toggle').click();
  }
  await page.getByTestId('lead-wave-new').click();
  await page.waitForTimeout(600);
  await page.getByTestId('lead-row-checkbox-315').click();
  await page.getByTestId('lead-assign-open').click();
  await page.getByTestId('lead-assign-agent').selectOption(TAIR.id);
  await page.getByTestId('lead-assign-preview').click();
  check('preview-one', (await page.getByTestId('lead-assign-confirm-box').innerText()).includes('1 לידים'), await page.getByTestId('lead-assign-confirm-box').innerText());
  await page.getByTestId('lead-assign-confirm').click();
  await page.getByTestId('lead-assign-result').waitFor({ timeout: 30000 });
  const oneText = await page.getByTestId('lead-assign-result').innerText();
  check('one-success-ui', oneText.includes('השיוך הושלם') && oneText.includes('שויכו: 1'), oneText);
  const afterOne = await adminDb.from('telemarketing_lead_directory').select('assigned_to').eq('lead_number', '315').maybeSingle();
  check('one-assigned-db', afterOne.data?.assigned_to === TAIR.id, afterOne.data);
  await page.screenshot({ path: join(OUT, 'assign-one.png') });

  const sessionClient = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  await sessionClient.auth.setSession(adminSession);
  const { data: lead315 } = await adminDb.from('telemarketing_lead_directory').select('id').eq('lead_number', '315').single();
  const { error: u1 } = await sessionClient.rpc('telemarketing_unassign_leads', { p_lead_ids: [lead315.id] });
  check('restore-one', !u1, u1?.message || null);

  await page.getByTestId('lead-assign-result').locator('button', { hasText: 'סגור' }).click();
  await page.getByTestId('lead-clear-selection').click().catch(() => {});
  await page.getByTestId('lead-row-checkbox-316').click();
  await page.getByTestId('lead-row-checkbox-317').click();
  await page.getByTestId('lead-row-checkbox-318').click();
  await page.getByTestId('lead-assign-open').click();
  await page.getByTestId('lead-assign-agent').selectOption(TAIR.id);
  await page.getByTestId('lead-assign-preview').click();
  check('preview-three', (await page.getByTestId('lead-assign-confirm-box').innerText()).includes('3 לידים'));
  await page.getByTestId('lead-assign-confirm').click();
  await page.getByTestId('lead-assign-result').waitFor({ timeout: 30000 });
  check('three-success-ui', (await page.getByTestId('lead-assign-result').innerText()).includes('שויכו: 3'));
  const three = await adminDb.from('telemarketing_lead_directory').select('lead_number, assigned_to').in('lead_number', ['316', '317', '318']);
  check('three-assigned-db', (three.data || []).every((r) => r.assigned_to === TAIR.id), three.data);
  const threeIds = (await adminDb.from('telemarketing_lead_directory').select('id').in('lead_number', ['316', '317', '318'])).data.map((r) => r.id);
  const { error: u3 } = await sessionClient.rpc('telemarketing_unassign_leads', { p_lead_ids: threeIds });
  check('restore-three', !u3, u3?.message || null);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /2344/.test(document.querySelector('[data-testid="lead-directory-count"]')?.textContent || ''), null, { timeout: 30000 });
  await page.getByTestId('lead-wave-old').click();
  await page.waitForTimeout(400);
  check('old-still-314', (await page.getByTestId('lead-directory-count').innerText()).includes('314'));
  await page.getByTestId('lead-wave-new').click();
  await page.waitForTimeout(400);
  check('new-still-2030', (await page.getByTestId('lead-directory-count').innerText()).includes('2030'));
  check('admin-no-console-error', consoleErrors.filter((t) => !t.includes('favicon')).length === 0, consoleErrors.slice(0, 5));

  const tairCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 900 } });
  await tairCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(tairSession) });
  await tairCtx.addInitScript(({ key, value }) => sessionStorage.setItem(key, value), { key: `tele_entry_mode_v1:${TAIR.id}`, value: 'work' });
  const tairPage = await tairCtx.newPage();
  tairPage.setDefaultTimeout(60000);
  await tairPage.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await tairPage.waitForTimeout(4000);
  if (await tairPage.getByTestId('tele-entry-purpose').count()) {
    await tairPage.getByTestId('tele-entry-work').click();
    await tairPage.waitForTimeout(2000);
  }
  check('tair-home', (await tairPage.getByTestId('telemarketing-agent-home').count()) > 0);
  check('tair-followup-board', (await tairPage.getByTestId('tele-continue-treatment').count()) > 0);
  check('tair-yellow-default', ((await tairPage.getByTestId('tele-lead-filter-yellow').getAttribute('class')) || '').includes('bg-primary'));
  await tairPage.screenshot({ path: join(OUT, 'tair-home.png') });

  const after = await counts();
  check('after-directory', after.directory === before.directory);
  check('after-old', after.old === 314);
  check('after-new', after.neu === 2030);
  check('after-tair-restored', after.tair === 0, after.tair);
  check('after-followups', after.followups === before.followups);
  check('after-calls', after.completed === before.completed);
  check('after-hist', after.histSeconds === 5400);
  await browser.close();
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check('e2e-exception', false, e instanceof Error ? e.message : String(e));
  report.pass = false;
}
writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), deployed_ref: report.deployed_ref, liveBundle: report.liveBundle }, null, 2));
if (!report.pass) process.exit(1);
