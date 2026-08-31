/**
 * Staging QA: admin work-priority remaining/treated counters. Read-only.
 * Does not add/remove priority, assign, claim, or login as Tair.
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
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const ADMIN = 'orin1607@gmail.com';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-work-priority-2026-08-31');
const EXPECTED = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
      || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key
      || keys.find((k) => k.name === 'anon')?.api_key,
  };
}
function leadKey(phone, company) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (digits) return `p:${digits}`;
  const name = String(company || '').trim().toLowerCase();
  return name ? `c:${name}` : '';
}
async function allDir(db) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('telemarketing_lead_directory')
      .select('id, lead_number, phone, company_name, assigned_to, claimed_by, lead_wave, work_priority_at, archived_at')
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const keys = loadKeys();
const adminDb = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });
const report = { at: new Date().toISOString(), pass: false, checks: [], productionTouched: false, mutated: false, expected: EXPECTED };
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 500) : '');
}

try {
  const stamp = Date.now();
  const html = await fetch(`${BASE}/?t=${stamp}`, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.text());
  const bundle = html.match(/assets\/index-[^"'\\\s>]+\.js/)?.[0];
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${stamp}`).then((r) => r.text());
  report.deployed_ref = deployTxt.trim();
  report.liveBundle = bundle || null;
  check('deploy-sha', deployTxt.includes(EXPECTED), deployTxt.trim());
  const js = bundle ? await fetch(`${BASE}/${bundle}`).then((r) => r.text()) : '';
  check('bundle-remaining', js.includes('נשארו לעבודה'));
  check('bundle-treated', js.includes('כבר טופלו'));
  check('bundle-exhausted', js.includes('נגמרו הלידים בעדיפות'));
  check('bundle-now-status', js.includes('מצב עכשיו'));

  const dir = await allDir(adminDb);
  const { data: calls } = await adminDb.from('telemarketing_calls').select('phone, company_name');
  const { data: states } = await adminDb.from('telemarketing_lead_states').select('lead_key');
  const { count: followups } = await adminDb.from('telemarketing_followups').select('id', { count: 'exact', head: true });
  const { count: completed } = await adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true }).eq('status', 'completed');
  const { data: openCalls } = await adminDb.from('telemarketing_calls').select('id').eq('employee_id', TAIR).eq('status', 'in_progress');
  const { data: openWork } = await adminDb.from('telemarketing_work_sessions').select('id').eq('employee_id', TAIR).eq('status', 'in_progress');
  const hist = await adminDb.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR);
  const activity = new Set();
  for (const row of calls || []) {
    const key = leadKey(row.phone, row.company_name);
    if (key && key !== 'p:' && key !== 'c:') activity.add(key);
  }
  for (const row of states || []) {
    const key = String(row.lead_key || '');
    if (key && key !== 'p:' && key !== 'c:') activity.add(key);
  }
  const priority = dir.filter((r) => r.work_priority_at && !r.archived_at);
  const remaining = priority.filter((r) => !activity.has(leadKey(r.phone, r.company_name))).length;
  const treated = priority.length - remaining;
  const expected = { total: priority.length, remaining, treated, exhausted: priority.length > 0 && remaining === 0 };
  report.expectedCounts = expected;
  const before = {
    directory: dir.length,
    tairNew: dir.filter((r) => r.assigned_to === TAIR && r.lead_wave === 'new').length,
    tairOld: dir.filter((r) => r.assigned_to === TAIR && r.lead_wave === 'old').length,
    tairClaims: dir.filter((r) => r.claimed_by === TAIR).length,
    priority: priority.length,
    followups,
    completed,
    openCalls: (openCalls || []).length,
    openWork: (openWork || []).length,
    histSeconds: (hist.data || []).reduce((s, r) => s + Number(r.duration_seconds || 0), 0),
  };
  report.before = before;
  check('before-tair-new', before.tairNew === 2030, before);
  check('before-no-open-call', before.openCalls === 0);
  check('before-no-open-work', before.openWork === 0);
  check('before-hist', before.histSeconds === 5400, before.histSeconds);
  check('math-remaining-plus-treated', remaining + treated === priority.length, expected);

  const anon = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email: ADMIN });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await anon.auth.verifyOtp({
    email: ADMIN,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error('admin session');

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 1100 } });
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
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
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByTestId('tele-agent-now-status').waitFor({ timeout: 40000 });
  const tairCard = await page.getByTestId(`tele-agent-now-${TAIR}`).innerText();
  check('tair-idle', tairCard.includes('🟢 פנויה'), tairCard);
  await page.getByTestId('lead-directory-toggle').click();
  await page.getByTestId('lead-directory-list').waitFor({ timeout: 20000 });
  await page.getByTestId('lead-directory-count').filter({ hasText: '2344' }).waitFor({ timeout: 40000 });
  await page.getByTestId('lead-work-priority-count').filter({ hasText: `סה״כ לידים בעדיפות: ${expected.total}` }).waitFor({ timeout: 20000 });
  const countText = await page.getByTestId('lead-work-priority-count').innerText();
  check('ui-total', countText.includes(`⭐ סה״כ לידים בעדיפות: ${expected.total}`), { countText, expected });
  check('ui-remaining', countText.includes(`📞 נשארו לעבודה: ${expected.remaining}`), countText);
  check('ui-treated', countText.includes(`✅ כבר טופלו: ${expected.treated}`), countText);
  const exhaustedCount = await page.getByTestId('lead-work-priority-exhausted').count();
  const panelExhausted = await page.getByTestId('lead-work-priority-exhausted-panel').count();
  if (expected.exhausted) {
    check('ui-exhausted', exhaustedCount === 1 && panelExhausted === 1 && countText.includes('נגמרו הלידים בעדיפות'), { exhaustedCount, panelExhausted, countText });
  } else {
    check('ui-not-exhausted', exhaustedCount === 0 && panelExhausted === 0, { exhaustedCount, panelExhausted, remaining: expected.remaining });
  }
  await page.screenshot({ path: join(OUT, 'admin-work-priority-status.png'), fullPage: false });
  await browser.close();

  const afterDir = await allDir(adminDb);
  const after = {
    tairNew: afterDir.filter((r) => r.assigned_to === TAIR && r.lead_wave === 'new').length,
    tairOld: afterDir.filter((r) => r.assigned_to === TAIR && r.lead_wave === 'old').length,
    tairClaims: afterDir.filter((r) => r.claimed_by === TAIR).length,
    priority: afterDir.filter((r) => r.work_priority_at && !r.archived_at).length,
  };
  const { count: followupsAfter } = await adminDb.from('telemarketing_followups').select('id', { count: 'exact', head: true });
  const { count: completedAfter } = await adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true }).eq('status', 'completed');
  const histAfter = await adminDb.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR);
  report.after = after;
  check('after-tair-new', after.tairNew === before.tairNew, after);
  check('after-tair-old-unchanged', after.tairOld === before.tairOld, { before: before.tairOld, after: after.tairOld });
  check('after-priority-unchanged', after.priority === before.priority, after.priority);
  check('after-claims-unchanged', after.tairClaims === before.tairClaims);
  check('after-followups', followupsAfter === followups);
  check('after-calls', completedAfter === completed);
  check('after-hist', (histAfter.data || []).reduce((s, r) => s + Number(r.duration_seconds || 0), 0) === 5400);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check('e2e-exception', false, e instanceof Error ? e.message : String(e));
  report.pass = false;
}
writeFileSync(join(OUT, 'qa-status.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  pass: report.pass,
  failed: report.checks.filter((c) => !c.ok),
  deployed_ref: report.deployed_ref,
  liveBundle: report.liveBundle,
  expectedCounts: report.expectedCounts,
  tairOld: report.before?.tairOld,
}, null, 2));
if (!report.pass) process.exit(1);
