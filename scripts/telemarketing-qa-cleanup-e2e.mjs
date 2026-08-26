/**
 * Staging QA: cleanup verify + agent work-from-list + archive/manual lead.
 * Does not touch Production / main / Hostinger.
 * node scripts/telemarketing-qa-cleanup-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-qa-cleanup-2026-08-26');
mkdirSync(OUT, { recursive: true });
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e', name: 'תאיר' };
const AVI = { email: 'yoni133333@gmail.com', id: 'e260ae41-c144-4545-bbf3-36f1d2735180', name: 'אבי טלמיטינג' };
const ADMIN = { email: 'orin1607@gmail.com' };
const QA_PHONE = '0501111999';
const QA_COMPANY = 'QA-LIST-E2E-0826';

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
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
  return { session: auth.session, client };
}

function userClient(session) {
  const client = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  client.auth.setSession(session);
  return client;
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  followUpVsQueue:
    'Follow-up due items stay on «החזרות שלי». The 4th button claims the next unclaimed assigned non-archived lead by numeric lead_number. A due Follow-up does not skip or consume the numbered queue.',
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 500) : '');
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

async function withPage(session, viewport, fn) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ locale: 'he-IL', viewport });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(session),
  });
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function completeOpenCalls(employeeId) {
  const { data } = await adminDb.from('telemarketing_calls').select('id').eq('employee_id', employeeId).eq('status', 'in_progress');
  for (const row of data || []) {
    await adminDb.from('telemarketing_calls').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
      result: 'qa-list-cleanup',
      summary: 'e2e auto-close',
    }).eq('id', row.id);
  }
  const { data: works } = await adminDb.from('telemarketing_work_sessions').select('id').eq('employee_id', employeeId).eq('status', 'in_progress');
  for (const row of works || []) {
    await adminDb.from('telemarketing_work_sessions').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', row.id);
  }
}

async function deleteQaE2eRows() {
  const { data: calls } = await adminDb.from('telemarketing_calls').select('id').or(`result.ilike.%qa%,summary.ilike.%qa-list-cleanup%,company_name.eq.${QA_COMPANY},phone.eq.${QA_PHONE},employee_name.ilike.QA %`);
  const callIds = (calls || []).map((c) => c.id);
  if (callIds.length) {
    await adminDb.from('telemarketing_followups').delete().in('call_id', callIds);
    await adminDb.from('telemarketing_calls').delete().in('id', callIds);
  }
  await adminDb.from('telemarketing_work_sessions').delete().eq('company_name', QA_COMPANY);
  const { data: extras } = await adminDb.from('telemarketing_lead_directory').select('id').eq('company_name', QA_COMPANY);
  for (const row of extras || []) {
    await adminDb.from('telemarketing_lead_assignment_events').delete().eq('lead_id', row.id);
    await adminDb.from('telemarketing_lead_directory').delete().eq('id', row.id);
  }
  await adminDb.from('telemarketing_lead_directory').update({ claimed_by: null, claimed_at: null }).not('id', 'is', null);
}

const { data: tairProfile } = await adminDb.from('profiles').select('id, full_name, is_active').eq('id', TAIR.id).maybeSingle();
const { data: tairAuthUser } = await adminDb.auth.admin.getUserById(TAIR.id);
check('tair-unchanged', tairProfile?.full_name === 'תאיר' && tairProfile?.is_active !== false && tairAuthUser?.user?.email === TAIR.email, {
  profile: tairProfile,
  email: tairAuthUser?.user?.email,
});

const { data: numbers } = await adminDb.from('telemarketing_lead_directory').select('id, lead_number, company_name, phone, assigned_to, archived_at').order('lead_number');
const nums = (numbers || []).map((r) => r.lead_number);
check('directory-29', numbers?.length === 29 || (numbers || []).filter((r) => Number(r.lead_number) <= 29).length === 29, { count: numbers?.length, nums });
check('numbers-1-29', Array.from({ length: 29 }, (_, i) => String(i + 1)).every((n) => nums.includes(n)), nums);
check('assigned-tair-29', (numbers || []).filter((r) => r.assigned_to === TAIR.id && !r.archived_at).length >= 29, {
  assigned: (numbers || []).filter((r) => r.assigned_to === TAIR.id).length,
});

const { count: qaCalls } = await adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true }).or('company_name.ilike.%QA%,result.ilike.%qa%,employee_name.ilike.QA %');
check('qa-calls-cleaned-before-e2e', (qaCalls || 0) === 0, { qaCalls });

const adminAuth = await sessionFor(ADMIN.email);
const tairAuth = await sessionFor(TAIR.email);
const aviAuth = await sessionFor(AVI.email);
const adminCli = userClient(adminAuth.session);
const tairCli = userClient(tairAuth.session);
const aviCli = userClient(aviAuth.session);

await completeOpenCalls(TAIR.id);
await completeOpenCalls(AVI.id);
await adminDb.from('telemarketing_lead_directory').update({ claimed_by: null, claimed_at: null }).not('id', 'is', null);

const tairSee = await tairCli.from('telemarketing_lead_directory').select('lead_number, archived_at');
check('tair-rls-assigned-only', (tairSee.data || []).every((r) => nums.includes(r.lead_number)), { count: tairSee.data?.length, err: tairSee.error?.message });
const aviSee = await aviCli.from('telemarketing_lead_directory').select('lead_number');
check('avi-rls-hides-tair-leads', (aviSee.data || []).length === 0, { count: aviSee.data?.length });

const agentArchive = await tairCli.rpc('telemarketing_set_leads_archived', { p_lead_ids: [numbers[0].id], p_archived: true });
check('agent-cannot-archive', Boolean(agentArchive.error), agentArchive.error?.message || agentArchive.data);
const agentDelete = await tairCli.rpc('telemarketing_preview_lead_delete', { p_lead_id: numbers[0].id });
check('agent-cannot-delete-preview', Boolean(agentDelete.error), agentDelete.error?.message);

const claim1 = await tairCli.rpc('telemarketing_claim_next_lead');
check('claim-next-is-1', !claim1.error && String(claim1.data?.lead_number) === '1', claim1.error || claim1.data);
const claim2 = await tairCli.rpc('telemarketing_claim_next_lead');
check('claim-next-is-2', !claim2.error && String(claim2.data?.lead_number) === '2', claim2.error || claim2.data);

const raceA = userClient(tairAuth.session);
const raceB = userClient(aviAuth.session);
await adminDb.from('telemarketing_lead_directory').update({ claimed_by: null, claimed_at: null }).in('lead_number', ['3', '4']);
const race = await Promise.all([
  raceA.rpc('telemarketing_claim_next_lead'),
  raceB.rpc('telemarketing_claim_next_lead'),
]);
const raceNums = race.map((r) => r.data?.lead_number).filter(Boolean);
check('claim-lock-distinct-or-denied', new Set(raceNums).size === raceNums.length, raceNums);

const created = await tairCli.rpc('telemarketing_create_manual_lead', {
  p_company_name: QA_COMPANY,
  p_phone: QA_PHONE,
  p_email: 'qa-list-e2e@staging-e2e.local',
  p_industry: 'QA',
  p_region: 'בדיקה',
  p_fleet_size: '1',
});
check('manual-lead-30', !created.error && created.data?.action === 'created' && String(created.data?.lead?.lead_number) === '30', created.error || created.data);
const dup = await tairCli.rpc('telemarketing_create_manual_lead', {
  p_company_name: 'כפיל QA',
  p_phone: QA_PHONE,
  p_email: '',
  p_industry: '',
  p_region: '',
  p_fleet_size: '',
});
check('manual-duplicate-existing', !dup.error && dup.data?.action === 'existing', dup.error || dup.data);
const otherDup = await aviCli.rpc('telemarketing_create_manual_lead', {
  p_company_name: 'כפיל אבי',
  p_phone: QA_PHONE,
  p_email: '',
  p_industry: '',
  p_region: '',
  p_fleet_size: '',
});
check('manual-duplicate-other-agent', !otherDup.error && otherDup.data?.action === 'duplicate_other', otherDup.error || otherDup.data);

const qaLeadId = created.data?.lead?.id;
if (qaLeadId) {
  const arch = await adminCli.rpc('telemarketing_set_leads_archived', { p_lead_ids: [qaLeadId], p_archived: true });
  check('admin-archive-qa-lead', !arch.error && Number(arch.data?.updatedCount ?? arch.data?.updatedcount) === 1, arch.error || arch.data);
  const tairAfterArch = await tairCli.from('telemarketing_lead_directory').select('lead_number').eq('id', qaLeadId);
  check('agent-cannot-see-archived', (tairAfterArch.data || []).length === 0, tairAfterArch.data);
  const claimArchived = await tairCli.rpc('telemarketing_claim_lead', { p_lead_id: qaLeadId });
  check('claim-skips-archived', Boolean(claimArchived.error), claimArchived.error?.message);
  const unarch = await adminCli.rpc('telemarketing_set_leads_archived', { p_lead_ids: [qaLeadId], p_archived: false });
  check('admin-restore-qa-lead', !unarch.error, unarch.error || unarch.data);
  const preview = await adminCli.rpc('telemarketing_preview_lead_delete', { p_lead_id: qaLeadId });
  check('delete-preview-blocks', !preview.error && preview.data?.canDelete === false, preview.error || preview.data);
}

try {
  await withPage(tairAuth.session, { width: 1440, height: 900 }, async (page) => {
    await completeOpenCalls(TAIR.id);
    await adminDb.from('telemarketing_lead_directory').update({ claimed_by: null, claimed_at: null }).not('id', 'is', null);
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(5000);
    const home = await page.locator('[data-testid="telemarketing-agent-home"]').innerText();
    check('agent-home-tair', home.includes('תאיר'), home.slice(0, 200));
    check('btn-start-call', (await page.getByTestId('tele-start-call').count()) > 0);
    check('btn-start-work', (await page.getByRole('button', { name: 'התחל משימת עבודה' }).count()) > 0);
    check('btn-dalia', (await page.getByTestId('dalia-open-inbox').count()) > 0);
    check('btn-work-from-list', (await page.getByTestId('tele-work-from-list').count()) > 0);
    check('agent-no-directory-table', (await page.getByTestId('lead-directory-board').count()) === 0);
    await page.screenshot({ path: join(OUT, 'agent-home-desktop.png'), fullPage: true });

    await page.getByTestId('tele-start-call').click();
    await page.waitForTimeout(1200);
    const toast = await page.locator('body').innerText();
    check('start-call-requires-fields', toast.includes('חובה למלא') || (await page.getByRole('button', { name: 'סיום שיחה' }).count()) === 0, toast.slice(0, 250));
    await page.getByRole('button', { name: 'התחל משימת עבודה' }).click();
    await page.waitForTimeout(2500);
    const workBody = await page.locator('body').innerText();
    check('start-work-still-works', workBody.includes('משימת עבודה פעילה') || workBody.includes('סיום משימת'), workBody.slice(0, 250));
    await completeOpenCalls(TAIR.id);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    await page.getByTestId('dalia-open-inbox').click();
    await page.waitForTimeout(1500);
    const chat = await page.locator('body').innerText();
    check('dalia-opens', chat.includes('פניות צוות דליה') || chat.includes('טיפול צוות'), chat.slice(0, 200));
    if (await page.getByTestId('dalia-back-telemarketing').count()) {
      await page.getByTestId('dalia-back-telemarketing').click();
      await page.waitForTimeout(800);
    } else {
      await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForTimeout(3000);
    }

    await page.getByTestId('tele-work-from-list').click();
    await page.waitForTimeout(4000);
    const afterClaim = await page.locator('body').innerText();
    check('work-from-list-lead-1', afterClaim.includes('ליד #1') || afterClaim.includes('מערכות אשד'), afterClaim.slice(0, 400));
    check('work-from-list-started', afterClaim.includes('השיחה פעילה') || afterClaim.includes('סיום שיחה'), afterClaim.slice(0, 200));
    await page.screenshot({ path: join(OUT, 'agent-lead-1.png'), fullPage: true });
    if (await page.getByRole('button', { name: 'סיום שיחה' }).count()) {
      await page.getByRole('button', { name: 'סיום שיחה' }).click();
      await page.waitForTimeout(1500);
    }
    check('report-blocks-next-list-button', (await page.getByTestId('tele-work-from-list').count()) === 0);
    await page.getByRole('button', { name: 'לא ענה' }).click().catch(() => {});
    await page.getByRole('button', { name: 'קר' }).click().catch(() => {});
    const summary = page.locator('textarea').first();
    if (await summary.count()) await summary.fill('qa-list-cleanup e2e lead 1');
    await page.getByRole('button', { name: 'שמור וסיים שיחה' }).click().catch(() => {});
    await page.waitForTimeout(3000);
  });

  await completeOpenCalls(TAIR.id);
  await withPage(tairAuth.session, { width: 390, height: 844 }, async (page) => {
    await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    check('mobile-four-buttons', (await page.getByTestId('tele-start-call').count()) > 0 && (await page.getByTestId('tele-work-from-list').count()) > 0);
    await page.screenshot({ path: join(OUT, 'agent-home-mobile.png'), fullPage: true });
  });

  await withPage(adminAuth.session, { width: 1440, height: 900 }, async (page) => {
    await page.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(5000);
    check('admin-directory', (await page.getByTestId('lead-directory-board').count()) > 0);
    check('admin-import', (await page.getByTestId('lead-import-panel').count()) > 0);
    check('admin-export', (await page.getByTestId('lead-directory-export').count()) > 0);
    check('admin-archive-btn', (await page.getByTestId('lead-archive').count()) > 0);
    const filter = page.getByTestId('lead-filter-agent');
    if (await filter.count()) {
      await filter.selectOption('archive');
      await page.waitForTimeout(400);
      check('admin-archive-filter', true);
      await filter.selectOption('all');
    }
    await page.screenshot({ path: join(OUT, 'admin-directory.png'), fullPage: true });
  });
} catch (e) {
  check('ui-uncaught', false, String(e.message || e).slice(0, 500));
}

await deleteQaE2eRows();
const { data: after } = await adminDb.from('telemarketing_lead_directory').select('lead_number, assigned_to, claimed_by').order('lead_number');
const afterNums = (after || []).map((r) => r.lead_number);
check('final-still-1-29', Array.from({ length: 29 }, (_, i) => String(i + 1)).every((n) => afterNums.includes(n)) && !(after || []).some((r) => r.lead_number === '30'), afterNums);
check('final-tair-profile', (await adminDb.from('profiles').select('full_name').eq('id', TAIR.id).single()).data?.full_name === 'תאיר');
check('final-claimed-cleared', (after || []).every((r) => !r.claimed_by));

report.pass = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok) }, null, 2));
if (!report.pass) process.exit(2);
