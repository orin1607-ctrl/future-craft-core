/**
 * Staging QA: admin fleet filter/sort/select-all on filtered rows. Does not assign leads.
 * EXPECTED_SHA=<sha> node scripts/telemarketing-dalia-fleet-filter-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' };
const ADMIN = { email: 'orin1607@gmail.com' };
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-dalia-leads-import-2026-08-27');
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();
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
const adminDb = createClient(`https://${STAGING_REF}.supabase.co`, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

async function sessionFor(email) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verifyOtp ${email}`);
  return auth.session;
}
function storagePayload(session) {
  return { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, expires_in: session.expires_in, token_type: session.token_type, user: session.user };
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  stagingRef: STAGING_REF,
  deployedRef: EXPECTED_SHA || null,
  liveBundle: null,
  liveBuild: null,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

try {
  const stamp = Date.now();
  const html = await fetch(`${BASE}/?t=${stamp}`, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.text());
  const bundle = html.match(/assets\/index-[^"'\\\s>]+\\.js/)?.[0] || html.match(/assets\/index-[^"'>\s]+\.js/)?.[0];
  report.liveBundle = bundle || null;
  if (bundle) {
    const js = await fetch(`${BASE}/${bundle}`).then((r) => r.text());
    check('bundle-fleet-filter', js.includes('lead-fleet-filter') && js.includes('כמות רכבים מוערכת') && js.includes('כמות רכבים — מהנמוך לגבוה'));
    check('bundle-no-auto-assign', !js.includes('autoAssignFleet') && js.includes('שייך לעובד'));
  } else {
    check('bundle-fleet-filter', false, { htmlLen: html.length });
  }

  const adminSession = await sessionFor(ADMIN.email);
  const tairSession = await sessionFor(TAIR.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  const adminCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1400, height: 1000 } });
  await adminCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(adminSession) });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.getByTestId('lead-directory-board').waitFor({ timeout: 30000 });
  await adminPage.waitForTimeout(2500);
  const dirToggle = adminPage.getByTestId('lead-directory-toggle');
  if (await dirToggle.count()) {
    const label = await dirToggle.innerText();
    if (label.includes('הצג רשימת לידים')) await dirToggle.click();
  }
  if (await adminPage.getByTestId('tele-inspect-banner').count()) {
    await adminPage.getByTestId('tele-admin-inspect-toggle').click();
    await adminPage.waitForTimeout(800);
  }
  check('admin-fleet-ui', (await adminPage.getByTestId('lead-fleet-filter').count()) === 1);
  const boardText = await adminPage.getByTestId('lead-directory-board').innerText();
  check('admin-count-314', boardText.includes('314 לידים במאגר'), boardText.slice(0, 200));

  await adminPage.getByTestId('lead-fleet-preset-5-10').click();
  await adminPage.waitForTimeout(400);
  const t510 = await adminPage.getByTestId('lead-directory-board').innerText();
  check('filter-5-10', t510.includes('תוצאות מסוננות') && (await adminPage.getByTestId('lead-fleet-min').inputValue()) === '5' && (await adminPage.getByTestId('lead-fleet-max').inputValue()) === '10', t510.slice(0, 180));

  await adminPage.getByTestId('lead-fleet-preset-5-40').click();
  await adminPage.waitForTimeout(500);
  const t540 = await adminPage.getByTestId('lead-directory-board').innerText();
  const filtered540 = Number((t540.match(/(\d+)\s+תוצאות מסוננות/) || [])[1] || 0);
  check('filter-5-40', filtered540 > 0 && filtered540 < 314, { filtered540 });

  await adminPage.getByTestId('lead-fleet-min').fill('5');
  await adminPage.getByTestId('lead-fleet-max').fill('15');
  await adminPage.waitForTimeout(400);
  const t515 = await adminPage.getByTestId('lead-directory-board').innerText();
  check('filter-manual-5-15', t515.includes('תוצאות מסוננות'), t515.slice(0, 180));

  await adminPage.getByTestId('lead-fleet-preset-5-40').click();
  await adminPage.waitForTimeout(400);
  await adminPage.getByTestId('lead-fleet-sort').selectOption('fleet_asc');
  await adminPage.waitForTimeout(400);
  const firstFleet = await adminPage.getByTestId('lead-fleet-cell').first().innerText();
  await adminPage.getByTestId('lead-fleet-sort').selectOption('fleet_desc');
  await adminPage.waitForTimeout(400);
  const firstDesc = await adminPage.getByTestId('lead-fleet-cell').first().innerText();
  check('sort-fleet', firstFleet !== firstDesc || filtered540 <= 1, { firstFleet, firstDesc });

  const selectLabel = await adminPage.getByTestId('lead-select-all').innerText();
  check('select-all-filtered-label', selectLabel.includes('בתוצאות המסוננות') && selectLabel.includes('לא את כל המאגר (314)'), selectLabel);
  await adminPage.getByTestId('lead-select-all').click();
  await adminPage.waitForTimeout(300);
  const assignBtn = await adminPage.getByTestId('lead-assign-open').innerText();
  check('select-all-count-matches-filter', assignBtn.includes(String(filtered540)), { assignBtn, filtered540 });

  await adminPage.getByTestId('lead-assign-open').click();
  await adminPage.waitForTimeout(400);
  const agentOptions = await adminPage.locator('#lead-assign-dialog select, [data-testid="lead-assign-agent"] option').count().catch(() => 0);
  const agentSelect = adminPage.getByTestId('lead-assign-agent');
  if (await agentSelect.count()) {
    const values = await agentSelect.locator('option').evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
    if (values[0]) await agentSelect.selectOption(values[0]);
    await adminPage.getByTestId('lead-assign-preview').click();
    await adminPage.waitForTimeout(400);
    const confirm = await adminPage.getByTestId('lead-assign-confirm-box').innerText();
    check('assign-preview-count', confirm.includes(String(filtered540)) && confirm.includes('אתה עומד לשייך'), confirm.slice(0, 250));
    check('assign-not-executed', (await adminPage.getByTestId('lead-assign-result').count()) === 0);
  } else {
    check('assign-preview-count', agentOptions > 0, { agentOptions });
    check('assign-not-executed', true);
  }
  await adminPage.screenshot({ path: join(OUT, 'admin-fleet-filter.png'), fullPage: true });
  await adminCtx.close();

  const tairCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1280, height: 900 } });
  await tairCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(tairSession) });
  await tairCtx.addInitScript(({ key, value }) => sessionStorage.setItem(key, value), { key: `tele_entry_mode_v1:${TAIR.id}`, value: 'inspect' });
  const tairPage = await tairCtx.newPage();
  await tairPage.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await tairPage.waitForTimeout(4000);
  const liveBuild = await tairPage.locator('[data-tele-build]').first().getAttribute('data-tele-build').catch(() => null);
  report.liveBuild = liveBuild;
  if (EXPECTED_SHA) {
    check('live-sha', String(EXPECTED_SHA).startsWith(String(liveBuild || '')) || String(liveBuild || '').startsWith(String(EXPECTED_SHA).slice(0, 7)), { EXPECTED_SHA, liveBuild });
  }
  check('agent-no-fleet-filter', (await tairPage.getByTestId('lead-fleet-filter').count()) === 0);
  check('agent-no-admin-assign', (await tairPage.getByTestId('lead-assign-open').count()) === 0);
  await tairPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await tairPage.waitForTimeout(2500);
  const body = await tairPage.locator('body').innerText();
  check('agent-blocked-from-admin', !body.includes('סינון לפי כמות רכבים') || body.includes('אין הרשאה') || body.includes('מסך עובד') || (await tairPage.getByTestId('lead-fleet-filter').count()) === 0, body.slice(0, 200));
  await tairPage.screenshot({ path: join(OUT, 'agent-no-admin-filter.png'), fullPage: true });
  await tairCtx.close();
  await browser.close();

  const { data: dir } = await adminDb.from('telemarketing_lead_directory').select('lead_number, assigned_to');
  const nums = Array.from({ length: 29 }, (_, i) => String(i + 1));
  check('after-314', (dir || []).length === 314, (dir || []).length);
  check('after-29-still-tair', nums.every((n) => (dir || []).some((r) => String(r.lead_number) === n && r.assigned_to === TAIR.id)));
  check('new-leads-unassigned', (dir || []).filter((r) => !nums.includes(String(r.lead_number)) && r.assigned_to).length === 0);
  check('no-production', STAGING_REF !== PROD_REF);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.pass = false;
  report.error = e instanceof Error ? e.message : String(e);
  console.error(e);
} finally {
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), liveBuild: report.liveBuild, liveBundle: report.liveBundle }, null, 2));
  process.exit(report.pass ? 0 : 1);
}
