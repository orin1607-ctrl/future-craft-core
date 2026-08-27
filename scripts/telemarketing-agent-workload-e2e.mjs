/**
 * Staging QA: admin per-agent lead workload. Restores any test assignment.
 * EXPECTED_SHA=<sha> node scripts/telemarketing-agent-workload-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e', name: 'תאיר' };
const AVI = { email: 'yoni133333@gmail.com', id: 'e260ae41-c144-4545-bbf3-36f1d2735180', name: 'אבי טלמיטינג' };
const ADMIN = { email: 'orin1607@gmail.com' };
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-agent-workload-2026-08-28');
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();
const NUMS = Array.from({ length: 29 }, (_, i) => String(i + 1));
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
function leadKey(phone, company) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (digits) return `p:${digits}`;
  return `c:${String(company || '').trim().toLowerCase()}`;
}
function usable(key) { return Boolean(key) && key !== 'c:' && key !== 'p:'; }

async function snapshot() {
  const { data: dir } = await adminDb.from('telemarketing_lead_directory').select('id, lead_number, company_name, phone, assigned_to, assigned_name, archived_at');
  const { data: states } = await adminDb.from('telemarketing_lead_states').select('lead_key, lead_color, phone, company_name');
  const { data: fus } = await adminDb.from('telemarketing_followups').select('phone, company_name, status, owner_employee_id, due_date, call_id');
  const { data: calls } = await adminDb.from('telemarketing_calls').select('phone, company_name, employee_id');
  const { data: hist } = await adminDb.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR.id).eq('work_date', '2026-08-26');
  const activity = new Set();
  const open = new Set();
  for (const c of calls || []) { const k = leadKey(c.phone, c.company_name); if (usable(k)) activity.add(k); }
  for (const s of states || []) {
    if (usable(s.lead_key)) activity.add(s.lead_key);
    if (s.lead_color === 'yellow' && usable(s.lead_key)) open.add(s.lead_key);
  }
  for (const f of fus || []) {
    if (f.status === 'open') {
      const k = leadKey(f.phone, f.company_name);
      if (usable(k)) open.add(k);
    }
  }
  function counts(agentId) {
    const assigned = (dir || []).filter((r) => !r.archived_at && r.assigned_to === agentId);
    let withActivity = 0;
    let openFollowup = 0;
    for (const r of assigned) {
      const k = leadKey(r.phone, r.company_name);
      if (usable(k) && activity.has(k)) withActivity += 1;
      if (usable(k) && open.has(k)) openFollowup += 1;
    }
    return {
      assigned: assigned.length,
      withActivity,
      withoutActivity: assigned.length - withActivity,
      openFollowup,
    };
  }
  return {
    dirCount: (dir || []).length,
    keep29: NUMS.every((n) => (dir || []).some((r) => String(r.lead_number) === n && r.assigned_to === TAIR.id)),
    unassigned: (dir || []).filter((r) => !r.assigned_to && !r.archived_at).length,
    tair: counts(TAIR.id),
    avi: counts(AVI.id),
    histSum: (hist || []).reduce((s, r) => s + Number(r.duration_seconds || 0), 0),
    sundayFu: (fus || []).filter((f) => f.owner_employee_id === TAIR.id && f.due_date === '2026-08-30' && !f.call_id && f.status === 'open').length,
    tairCalls: (calls || []).filter((c) => c.employee_id === TAIR.id).length,
    states: (states || []).length,
  };
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
  before: null,
  after: null,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
}

let assignedTestLeadId = null;
try {
  report.before = await snapshot();
  check('before-314', report.before.dirCount === 314, report.before.dirCount);
  check('before-keep29', report.before.keep29);
  check('before-hist-5400', report.before.histSum === 5400, report.before.histSum);
  check('before-sunday-6', report.before.sundayFu === 6, report.before.sundayFu);
  check('no-double-count-tair', report.before.tair.withActivity + report.before.tair.withoutActivity === report.before.tair.assigned, report.before.tair);

  const stamp = Date.now();
  const html = await fetch(`${BASE}/?t=${stamp}`, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.text());
  const bundle = html.match(/assets\/index-[^"'>\s]+\.js/)?.[0] || null;
  report.liveBundle = bundle;
  if (bundle) {
    const js = await fetch(`${BASE}/${bundle}`).then((r) => r.text());
    check('bundle-workload', js.includes('lead-agent-workload') && js.includes('מצב לידים לפי עובד'));
  } else check('bundle-workload', false);

  const adminSession = await sessionFor(ADMIN.email);
  const tairSession = await sessionFor(TAIR.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const adminCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1400, height: 1100 } });
  await adminCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(adminSession) });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.getByTestId(`lead-agent-workload-${TAIR.id}`).waitFor({ timeout: 30000 });
  await adminPage.getByTestId(`lead-agent-workload-${TAIR.id}`).filter({ hasText: `בוצעה פעילות: ${report.before.tair.withActivity}` }).waitFor({ timeout: 20000 });
  if (await adminPage.getByTestId('tele-inspect-banner').count()) {
    await adminPage.getByTestId('tele-admin-inspect-toggle').click();
    await adminPage.waitForTimeout(600);
  }
  const tairCard = adminPage.getByTestId(`lead-agent-workload-${TAIR.id}`);
  const aviCard = adminPage.getByTestId(`lead-agent-workload-${AVI.id}`);
  const unCard = adminPage.getByTestId('lead-agent-workload-unassigned');
  const tairText = await tairCard.innerText();
  const aviCount = await aviCard.count();
  const unText = await unCard.innerText();
  check('admin-tair-assigned', tairText.includes(`סה״כ משויכים: ${report.before.tair.assigned}`), tairText);
  check('admin-tair-activity', tairText.includes(`בוצעה פעילות: ${report.before.tair.withActivity}`));
  check('admin-tair-idle', tairText.includes(`טרם בוצעה פעילות: ${report.before.tair.withoutActivity}`));
  check('admin-tair-open', tairText.includes(`פתוחים להמשך טיפול: ${report.before.tair.openFollowup}`));
  check('admin-zero-agent-row', aviCount === 0 || (await aviCard.innerText()).includes('סה״כ משויכים: 0'), { aviCount, onlyTairIsAgent: aviCount === 0 });
  check('admin-unassigned', unText.includes(`סה״כ משויכים: ${report.before.unassigned}`), unText);

  await tairCard.click();
  await adminPage.waitForTimeout(400);
  const afterClick = await adminPage.getByTestId('lead-directory-board').innerText();
  check('click-filters-tair', afterClick.includes('תוצאות מסוננות') && (await adminPage.getByTestId('lead-filter-agent').inputValue()) === TAIR.id);
  await adminPage.getByTestId('lead-fleet-preset-11-20').click();
  await adminPage.waitForTimeout(400);
  const combo = await adminPage.getByTestId('lead-directory-board').innerText();
  const comboCount = Number((combo.match(/(\d+)\s+תוצאות מסוננות/) || [])[1] || 0);
  check('filter-agent-plus-fleet', comboCount >= 0 && comboCount <= report.before.tair.assigned && combo.includes('תוצאות מסוננות'), { comboCount });

  const { data: idleRows } = await adminDb.from('telemarketing_lead_directory').select('id, lead_number, assigned_to').is('assigned_to', null);
  const testLead = (idleRows || []).find((r) => !NUMS.includes(String(r.lead_number)));
  check('has-unassigned-for-assign-qa', Boolean(testLead), testLead);
  if (testLead) {
    assignedTestLeadId = testLead.id;
    const adminCli = createClient(`https://${STAGING_REF}.supabase.co`, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
    await adminCli.auth.setSession(adminSession);
    const assigned = await adminCli.rpc('telemarketing_assign_leads', { p_lead_ids: [testLead.id], p_agent_id: TAIR.id });
    check('rpc-assign-one', !assigned.error && Number(assigned.data?.assignedCount ?? assigned.data?.assignedcount ?? 0) === 1, assigned.error || assigned.data);
    await adminPage.reload({ waitUntil: 'domcontentloaded' });
    await adminPage.getByTestId(`lead-agent-workload-${TAIR.id}`).waitFor({ timeout: 30000 });
    await adminPage.waitForTimeout(1500);
    const tairAfterAssign = await adminPage.getByTestId(`lead-agent-workload-${TAIR.id}`).innerText();
    check('assign-updates-summary', tairAfterAssign.includes(`סה״כ משויכים: ${report.before.tair.assigned + 1}`), tairAfterAssign);
    await adminDb.from('telemarketing_lead_directory').update({ assigned_to: null, assigned_name: null, assigned_at: null }).eq('id', testLead.id);
    await adminDb.from('telemarketing_lead_assignment_events').delete().eq('lead_id', testLead.id).eq('new_agent_id', TAIR.id);
    assignedTestLeadId = null;
  }

  await adminPage.screenshot({ path: join(OUT, 'admin-workload.png'), fullPage: true });
  await adminCtx.close();

  const tairCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1280, height: 900 } });
  await tairCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `sb-${STAGING_REF}-auth-token`, value: storagePayload(tairSession) });
  await tairCtx.addInitScript(({ key, value }) => sessionStorage.setItem(key, value), { key: `tele_entry_mode_v1:${TAIR.id}`, value: 'inspect' });
  const tairPage = await tairCtx.newPage();
  await tairPage.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await tairPage.waitForTimeout(3500);
  report.liveBuild = await tairPage.locator('[data-tele-build]').first().getAttribute('data-tele-build').catch(() => null);
  if (EXPECTED_SHA) {
    check('live-sha', String(EXPECTED_SHA).startsWith(String(report.liveBuild || '')) || String(report.liveBuild || '').startsWith(String(EXPECTED_SHA).slice(0, 7)), { EXPECTED_SHA, liveBuild: report.liveBuild });
  }
  check('agent-no-workload', (await tairPage.getByTestId('lead-agent-workload').count()) === 0);
  await tairCtx.close();
  await browser.close();

  report.after = await snapshot();
  check('after-314', report.after.dirCount === 314);
  check('after-keep29', report.after.keep29);
  check('after-hist-5400', report.after.histSum === 5400);
  check('after-sunday-6', report.after.sundayFu === 6);
  check('after-tair-same', JSON.stringify(report.after.tair) === JSON.stringify(report.before.tair), { before: report.before.tair, after: report.after.tair });
  check('after-avi-same', JSON.stringify(report.after.avi) === JSON.stringify(report.before.avi), { before: report.before.avi, after: report.after.avi });
  check('no-production', STAGING_REF !== PROD_REF);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.pass = false;
  report.error = e instanceof Error ? e.message : String(e);
  console.error(e);
  if (assignedTestLeadId) {
    await adminDb.from('telemarketing_lead_directory').update({ assigned_to: null, assigned_name: null, assigned_at: null }).eq('id', assignedTestLeadId);
    await adminDb.from('telemarketing_lead_assignment_events').delete().eq('lead_id', assignedTestLeadId).eq('new_agent_id', TAIR.id);
  }
} finally {
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), liveBuild: report.liveBuild, liveBundle: report.liveBundle, tair: report.before?.tair, avi: report.before?.avi }, null, 2));
  process.exit(report.pass ? 0 : 1);
}
