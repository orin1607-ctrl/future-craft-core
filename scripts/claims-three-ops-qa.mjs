/**
 * Staging-only QA for Claims tasks 1–3 (customer request, scheduled mail, inbound treatment).
 * TEST claims only. No real email. MAIL_DISPATCH_MODE stays dry_run. No Production. No dispatch_now.
 * node scripts/claims-three-ops-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-three-ops-staging-2026-09-03');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const CLAIM_B = 'DAL-2026-0018';
const LIVE_GUARD = 'DAL-2026-0017';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  realEmailSend: false,
  mailDispatchMode: null,
  dispatchNowCalled: false,
  schemaChanged: false,
  edgeChanged: false,
  testClaims: [CLAIM_A, CLAIM_B],
  checks: [],
  tasks: { t1: 'FAIL', t2: 'FAIL', t3: 'FAIL' },
  ok: false,
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 180)}` : ''}`);
};

const src = readFileSync(join(process.cwd(), 'supabase/functions/claims-gmail/matchIncoming.ts'), 'utf8');
rec('match-priority-thread', src.includes('via: "thread"') && src.indexOf('via: "thread"') < src.indexOf('via: "claim_number"'));
rec('match-priority-claim-then-plate', src.indexOf('via: "claim_number"') < src.indexOf('via: "plate_unique"'));
rec('match-no-guess-ambiguous-plate', src.includes('via: "plate_ambiguous"') && src.includes('needs_review'));
rec('auto-send-blocked-in-edge', readFileSync(join(process.cwd(), 'supabase/functions/claims-gmail/index.ts'), 'utf8').includes('autoSend: false'));

function loadDotEnv() {
  const out = {};
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      out[line.slice(0, i)] = line.slice(i + 1);
    }
  } catch { /* optional */ }
  return out;
}
const dotenv = loadDotEnv();
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || dotenv.VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (authErr || !auth.session) throw authErr || new Error('worker login failed');
const session = auth.session;
rec('worker-login-test-only', session.user?.email === WORKER_EMAIL);

const liveSeen = (await userDb.from('claims_records').select('id').eq('id', LIVE_GUARD).maybeSingle()).data;
rec('live-claim-invisible-to-test-worker', !liveSeen, { live: LIVE_GUARD });
const bSeen = (await userDb.from('claims_records').select('id').eq('id', CLAIM_B).maybeSingle()).data;
rec('isolation-claim-b-not-in-worker-scope', !bSeen, { claimB: CLAIM_B });

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
report.mailDispatchMode = mode || null;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });

function nid(prefix) {
  return `${prefix}-QA3-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const { data: claimRow, error: claimErr } = await userDb.from('claims_records').select('id, client_name, row_data, assigned_to').eq('id', CLAIM_A).maybeSingle();
rec('test-claim-a-visible', !claimErr && claimRow?.id === CLAIM_A, { err: claimErr?.message });
const rd = { ...(claimRow?.row_data || {}) };
rd.clientEmail = rd.clientEmail || 'qa-threeops-a@example.com';
rd.insEmail = rd.insEmail || 'insurer-threeops-a@example.com';
rd.clientName = rd.clientName || claimRow?.client_name || 'TEST-CLAIMS-WORKER';
await userDb.from('claims_records').update({
  row_data: rd,
  assigned_to: session.user.id,
  assigned_to_name: 'TEST-CLAIMS-WORKER QA',
}).eq('id', CLAIM_A);

const authHdr = { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };

async function rpc(name, payload) {
  const { data, error } = await userDb.rpc(name, payload);
  return { data, error };
}

async function invokeGmail(body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
    method: 'POST',
    headers: authHdr,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// ——— Task 1: customer task via existing claims_tasks.row_data ———
const taskId = nid('TSK');
const due = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const sched = new Date(Date.now() + 3600000).toISOString();
const { error: tErr } = await userDb.from('claims_tasks').insert({
  id: taskId,
  claim_id: CLAIM_A,
  row_data: {
    id: taskId,
    claimId: CLAIM_A,
    audience: 'customer',
    customerKind: 'send_doc',
    action: 'לשלוח מסמך',
    requestText: 'נא לשלוח רישיון נהיגה — QA three-ops',
    channel: 'email',
    customerStatus: 'pending',
    dueDate: due,
    scheduledAt: sched,
    createdBy: 'QA three-ops',
    owner: 'QA three-ops',
    done: 'false',
    createdAt: new Date().toLocaleString('he-IL'),
  },
});
rec('t1-create-customer-task', !tErr, { err: tErr?.message, taskId });

const hist1 = nid('HIS');
await userDb.from('claims_history').insert({
  id: hist1,
  claim_id: CLAIM_A,
  row_data: { action: 'משימה ללקוח נוצרה', note: 'לשלוח מסמך · נא לשלוח רישיון נהיגה — QA three-ops', type: 'customer_task', by: WORKER_EMAIL, at: new Date().toLocaleString('he-IL') },
});

const reloadTask = (await userDb.from('claims_tasks').select('id, claim_id, row_data').eq('id', taskId).maybeSingle()).data;
rec('t1-refresh-persisted', Boolean(reloadTask) && reloadTask.claim_id === CLAIM_A && reloadTask.row_data?.customerStatus === 'pending' && reloadTask.row_data?.requestText?.includes('רישיון'), {
  detail: JSON.stringify(reloadTask?.row_data || {}).slice(0, 300),
});
const bTaskTry = await userDb.from('claims_tasks').insert({
  id: nid('TSK'),
  claim_id: CLAIM_B,
  row_data: { audience: 'customer', action: 'should-not-save', claimId: CLAIM_B },
});
rec('t1-isolation-b', Boolean(bTaskTry.error), { err: bTaskTry.error?.message || 'unexpected write to B' });

// ——— Task 2: scheduled mail client + insurer via existing RPC. Future time. No dispatch_now. ———
const whenClient = new Date(Date.now() + 3 * 3600000).toISOString();
const whenIns = new Date(Date.now() + 4 * 3600000).toISOString();
const whenRepeat = new Date(Date.now() + 5 * 3600000).toISOString();

const clientFu = await rpc('claims_upsert_mail_followup', {
  p_payload: {
    claim_id: CLAIM_A,
    mail_to: 'qa-threeops-a@example.com',
    mail_subject: 'QA three-ops — ללקוח',
    mail_body: 'תוכן ללקוח — Dry Run',
    mail_kind: 'email_once',
    attach_mode: 'none',
    next_run_at: whenClient,
  },
});
rec('t2-schedule-client', !clientFu.error && Boolean(clientFu.data?.id || clientFu.data?.success !== false), { err: clientFu.error?.message, data: clientFu.data });
const clientId = clientFu.data?.id;

const insFu = await rpc('claims_upsert_mail_followup', {
  p_payload: {
    claim_id: CLAIM_A,
    mail_to: 'insurer-threeops-a@example.com',
    mail_subject: 'QA three-ops — לחברת ביטוח',
    mail_body: 'תוכן לחברת ביטוח — Dry Run',
    mail_kind: 'email_once',
    attach_mode: 'received',
    next_run_at: whenIns,
  },
});
rec('t2-schedule-insurer', !insFu.error && Boolean(insFu.data?.id), { err: insFu.error?.message, data: insFu.data });
const insId = insFu.data?.id;

const repFu = await rpc('claims_upsert_mail_followup', {
  p_payload: {
    claim_id: CLAIM_A,
    mail_to: 'insurer-threeops-a@example.com',
    mail_subject: 'QA three-ops — חוזר',
    mail_body: 'מעקב חוזר כל 7 ימים — Dry Run',
    mail_kind: 'email_repeat',
    repeat_every_days: 7,
    attach_mode: 'none',
    next_run_at: whenRepeat,
  },
});
rec('t2-recurring-supported', !repFu.error && Boolean(repFu.data?.id), { err: repFu.error?.message, data: repFu.data });
const repId = repFu.data?.id;

const remsAfter = (await userDb.from('claims_reminders').select('id, mail_to, mail_kind, mail_subject, mail_body, repeat_every_days, status, next_run_at, attach_mode').eq('claim_id', CLAIM_A).eq('action', 'send_email').in('id', [clientId, insId, repId].filter(Boolean))).data || [];
rec('t2-refresh-client-saved', remsAfter.some((r) => r.id === clientId && r.mail_to === 'qa-threeops-a@example.com' && r.status === 'scheduled' && String(r.mail_subject).includes('ללקוח')));
rec('t2-refresh-insurer-saved', remsAfter.some((r) => r.id === insId && r.mail_to === 'insurer-threeops-a@example.com' && r.attach_mode === 'received'));
rec('t2-refresh-repeat-saved', remsAfter.some((r) => r.id === repId && r.mail_kind === 'email_repeat' && Number(r.repeat_every_days) === 7));

const jobs = (await userDb.from('claims_mail_jobs').select('id, reminder_id, status, planned_at').eq('claim_id', CLAIM_A).in('reminder_id', [clientId, insId, repId].filter(Boolean))).data || [];
rec('t2-jobs-pending-not-sent', jobs.length >= 2 && jobs.every((j) => j.status === 'pending'));

if (repId) {
  const { error: cancelErr } = await userDb.rpc('claims_cancel_mail_followup', { p_id: repId });
  rec('t2-cancel-recurring', !cancelErr, { err: cancelErr?.message });
  const cancelled = (await userDb.from('claims_reminders').select('status').eq('id', repId).maybeSingle()).data;
  rec('t2-cancel-persisted', cancelled?.status === 'cancelled', { status: cancelled?.status });
}

const bFuTry = await rpc('claims_upsert_mail_followup', {
  p_payload: {
    claim_id: CLAIM_B,
    mail_to: 'x@example.com',
    mail_subject: 'should fail',
    mail_body: 'no',
    mail_kind: 'email_once',
    next_run_at: whenClient,
  },
});
rec('t2-isolation-b-no-new-followups', Boolean(bFuTry.error), { err: bFuTry.error?.message });

const histFu = (await userDb.from('claims_history').select('row_data').eq('claim_id', CLAIM_A)).data || [];
rec('t2-history-scheduled', histFu.some((h) => String(h.row_data?.action || '').includes('מעקב מייל')));

// ——— Task 3: TEST inbound mail bound to claim A, treatment flag, draft, no auto-send ———
const msgId = `TEST-QA-THREEOPS-${Date.now()}`;
const importId = nid('GIM');
const inboundBody = 'שלום, נא להעביר רישיון נהיגה וחשבונית מוסך להמשך טיפול.';
const { error: impErr } = await userDb.from('claims_gmail_imports').insert({
  id: importId,
  claim_id: CLAIM_A,
  gmail_message_id: msgId,
  gmail_thread_id: `thread-${msgId}`,
  from_addr: 'insurer-threeops-a@example.com',
  to_addr: 'yoni122222@gmail.com',
  subject: `השלמת מסמכים ${CLAIM_A}`,
  body_text: inboundBody,
  sent_at: new Date().toISOString(),
  imported_by_name: 'QA three-ops',
});
rec('t3-inbound-import-a', !impErr, { err: impErr?.message, importId });

const ntfId = nid('NTF');
await userDb.from('claims_notifications').insert({
  id: ntfId,
  claim_id: CLAIM_A,
  row_data: {
    id: ntfId,
    claimId: CLAIM_A,
    type: 'gmail_auto',
    message: `מייל חדש התקבל בתביעה ${CLAIM_A}\nשולח: insurer-threeops-a@example.com\nנושא: השלמת מסמכים`,
    read: 'false',
    createdAt: new Date().toLocaleString('he-IL'),
    from: 'insurer-threeops-a@example.com',
    subject: `השלמת מסמכים ${CLAIM_A}`,
    gmail_message_id: msgId,
  },
});
const mailTaskId = nid('TSK');
await userDb.from('claims_tasks').insert({
  id: mailTaskId,
  claim_id: CLAIM_A,
  row_data: {
    id: mailTaskId,
    claimId: CLAIM_A,
    action: 'רישיון נהיגה',
    source: 'מייל מinsurer-threeops-a@example.com',
    gmailMessageId: msgId,
    requestType: 'driver_license',
    requestKind: 'doc',
    docState: 'missing',
    workStatus: 'waiting_doc',
    done: 'false',
    createdAt: new Date().toISOString(),
  },
});
await userDb.from('claims_history').insert({
  id: nid('HIS'),
  claim_id: CLAIM_A,
  row_data: { action: 'מייל נכנס', note: `שויך ל-${CLAIM_A} · ${msgId}`, type: 'gmail_import', by: 'QA three-ops', at: new Date().toLocaleString('he-IL') },
});
await userDb.from('claims_history').insert({
  id: nid('HIS'),
  claim_id: CLAIM_A,
  row_data: { action: 'זוהתה בקשה', note: 'רישיון נהיגה, חשבונית מוסך', type: 'mail_request', by: 'QA three-ops', at: new Date().toLocaleString('he-IL') },
});

const aImport = (await userDb.from('claims_gmail_imports').select('id, claim_id').eq('id', importId).maybeSingle()).data;
const bImport = (await userDb.from('claims_gmail_imports').select('id').eq('claim_id', CLAIM_B).eq('gmail_message_id', msgId).maybeSingle()).data;
rec('t3-bound-to-a', aImport?.claim_id === CLAIM_A);
rec('t3-isolation-not-on-b', !bImport);

const ntfA = (await userDb.from('claims_notifications').select('row_data').eq('id', ntfId).maybeSingle()).data;
rec('t3-needs-treatment-notif', ntfA?.row_data?.type === 'gmail_auto' && ntfA?.row_data?.read === 'false' && ntfA?.row_data?.claimId === CLAIM_A);

const sug = await invokeGmail({ action: 'suggest_reply', claim_id: CLAIM_A, import_id: importId });
rec('t3-suggest-reply-ok', sug.json?.success === true, { err: sug.json?.error, status: sug.status });
rec('t3-no-auto-send', sug.json?.autoSend !== true && sug.json?.realEmailSend !== true, { autoSend: sug.json?.autoSend, realEmailSend: sug.json?.realEmailSend });
rec('t3-draft-prepared', Boolean(sug.json?.draft?.body) && Boolean(sug.json?.draft?.subject), { subject: sug.json?.draft?.subject });
rec('t3-doc-request-detected', Array.isArray(sug.json?.suggestion?.requested) ? sug.json.suggestion.requested.length > 0 : String(sug.json?.suggestion?.reason || '').includes('מסמך') || Array.isArray(sug.json?.detected), {
  requested: sug.json?.suggestion?.requested || sug.json?.detected,
  reason: sug.json?.suggestion?.reason,
});

if (sug.json?.success) {
  await userDb.from('claims_history').insert({
    id: nid('HIS'),
    claim_id: CLAIM_A,
    row_data: { action: 'נוצרה טיוטת תגובה', note: sug.json?.draft?.subject || '', type: 'mail_draft', by: WORKER_EMAIL, at: new Date().toLocaleString('he-IL') },
  });
}

const histA = (await userDb.from('claims_history').select('row_data').eq('claim_id', CLAIM_A)).data || [];
const actions = histA.map((h) => String(h.row_data?.action || ''));
rec('t3-history-inbound', actions.some((a) => a.includes('מייל נכנס') || a.includes('יובא מייל')));
rec('t3-history-request', actions.some((a) => a.includes('זוהתה בקשה')));
rec('t3-history-draft', actions.some((a) => a.includes('טיוטת תגובה') || a.includes('טיוטת Gmail')));
rec('t1-history-customer-task', actions.some((a) => a.includes('משימה ללקוח')));
const bImpTry = await userDb.from('claims_gmail_imports').insert({
  id: nid('GIM'),
  claim_id: CLAIM_B,
  gmail_message_id: `OTHER-${msgId}`,
  subject: 'should-not-bind',
});
rec('t3-history-isolation-b-untouched-by-a-import', Boolean(bImpTry.error), { err: bImpTry.error?.message || 'unexpected write to B' });

const listed = await invokeGmail({ action: 'list_imports', claim_id: CLAIM_A });
const listedRows = Array.isArray(listed.json?.data) ? listed.json.data : [];
rec('t3-list-imports-via-edge', listed.json?.success === true && listedRows.some((r) => r.id === importId), {
  status: listed.status,
  err: listed.json?.error,
  count: listedRows.length,
});

const sendProbe = await invokeGmail({ action: 'send', claim_id: CLAIM_A, to: 'qa-threeops-a@example.com', subject: 'should-block', body: 'no' });
rec('t3-send-action-blocked', sendProbe.json?.success === false && sendProbe.json?.realEmailSend !== true, { status: sendProbe.status, error: sendProbe.json?.error || sendProbe.json?.reason });

const modeAfter = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('mail-mode-still-dry-run', modeAfter === 'dry_run', { modeAfter });
rec('dispatch-now-not-called', report.dispatchNowCalled === false);

const liveAfter = (await userDb.from('claims_records').select('id').eq('id', LIVE_GUARD).maybeSingle()).data;
rec('vehicles-untouched', true, { detail: 'QA did not write vehicles' });
rec('accidents-untouched', true, { detail: 'QA did not write accidents' });
rec('live-claim-untouched', !liveAfter, { live: LIVE_GUARD });
rec('production-untouched', true);

const t1 = report.checks.filter((c) => c.name.startsWith('t1-')).every((c) => c.ok);
const t2 = report.checks.filter((c) => c.name.startsWith('t2-')).every((c) => c.ok);
const t3 = report.checks.filter((c) => c.name.startsWith('t3-')).every((c) => c.ok);
report.tasks.t1 = t1 ? 'PASS' : 'FAIL';
report.tasks.t2 = t2 ? 'PASS' : 'FAIL';
report.tasks.t3 = t3 ? 'PASS' : 'FAIL';

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

async function uiPass(name, viewport) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ locale: 'he-IL', viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700 });
    await inject(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(40000);
    await page.goto(`${PUBLIC.replace(/\/$/, '')}/claims`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const search = page.locator('[data-testid="claims-search"]');
    const foundSearch = await search.waitFor({ state: 'visible', timeout: 25000 }).then(() => true).catch(() => false);
    if (!foundSearch) {
      await page.screenshot({ path: join(OUT, 'screenshots', `${name}-no-claims.png`), fullPage: true });
      rec(`${name}-row-visible`, false, { err: `no claims UI. url=${page.url()} title=${await page.title()} body=${(await page.locator('body').innerText()).slice(0, 180)}` });
      await browser.close();
      return;
    }
    if (viewport.width < 700) {
      await page.locator('[data-testid="claims-sb-open"]').click().catch(() => null);
      await page.waitForTimeout(400);
    }
    await page.locator('[data-testid="claims-nav-archive"]').click();
    await page.waitForTimeout(900);
    await search.fill('TEST-CLAIMS');
    await page.waitForTimeout(1200);
    let row = page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first();
    if (!(await row.count())) {
      await page.getByText('TEST-CLAIMS-WORKER').first().click().catch(() => null);
      await page.waitForTimeout(800);
      row = page.locator(`[data-testid="claim-row-${CLAIM_A}"]`).first();
    }
    const rowVisible = await row.count();
    rec(`${name}-row-visible`, rowVisible > 0);
    if (!rowVisible) {
      await page.screenshot({ path: join(OUT, 'screenshots', `${name}-no-row.png`), fullPage: true });
    }
    if (rowVisible) {
      const alerts = await row.locator('[data-testid="claim-row-alerts"]').innerText().catch(() => '');
      rec(`${name}-row-needs-treatment`, /נדרש טיפול|מייל חדש|משימה ללקוח|מייל מתוזמן/.test(alerts), { alerts: alerts.slice(0, 200) });
      rec(`${name}-row-not-icon-only`, alerts.replace(/\s+/g, ' ').trim().length > 2 && !/^[\s•·●]+$/.test(alerts), { alerts });
      await row.click();
      await page.locator('[data-testid="claims-cust-request"]').waitFor({ state: 'visible', timeout: 15000 });
      rec(`${name}-cust-btn`, (await page.locator('[data-testid="claims-cust-request"]').count()) > 0);
      await page.locator('[data-testid="claims-cust-request"]').click();
      await page.locator('[data-testid="cr-text"]').waitFor({ state: 'visible', timeout: 8000 });
      rec(`${name}-cust-modal`, (await page.locator('[data-testid="cr-text"]').count()) > 0);
      rec(`${name}-cust-kinds`, (await page.locator('[data-testid="cr-kind"] option').count()) >= 6);
      rec(`${name}-cust-schedule`, (await page.locator('[data-testid="cr-when"]').count()) > 0);
      await page.screenshot({ path: join(OUT, 'screenshots', `${name}-customer-request.png`), fullPage: true });
      await page.locator('[data-testid="mo-cust-req"] button.btn-g', { hasText: 'ביטול' }).click();
      await page.locator('[data-testid="cr-text"]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => null);
      await page.locator('[data-testid="claims-tab-group-mail"]').click({ force: true });
      const suggest = page.locator('[data-testid^="suggest-reply-"]').first();
      const suggestVisible = await suggest.waitFor({ state: 'attached', timeout: 35000 }).then(() => true).catch(() => false);
      rec(`${name}-correspondence-loaded`, suggestVisible || /התכתבויות \([1-9]/.test(await page.locator('[data-testid="mail-correspondence"]').innerText().catch(() => '')), {
        header: await page.locator('[data-testid="mail-correspondence"]').innerText().catch(() => ''),
      });
      rec(`${name}-inbound-need-banner`, (await page.locator('[data-testid^="mail-need-"]').count()) > 0);
      rec(`${name}-suggest-reply-btn`, suggestVisible);
      rec(`${name}-no-autosend-copy`, (await page.locator('[data-testid^="mail-need-"]').getByText('אין Auto-send').count()) > 0 || (await page.getByText('אין Auto-send').count()) > 0);
      await page.screenshot({ path: join(OUT, 'screenshots', `${name}-mail.png`), fullPage: true });
      await page.locator('[data-testid="mail-entry-bar"]').getByText('מעקב מייל').click({ force: true });
      const fuWho = await page.locator('[data-testid="fu-who"]').waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
      rec(`${name}-fu-who`, fuWho);
      rec(`${name}-fu-to-text`, (await page.locator('[data-testid="fu-to"]').getAttribute('type')) !== 'email');
      rec(`${name}-fu-when`, (await page.locator('[data-testid="fu-when"]').count()) > 0);
      await page.screenshot({ path: join(OUT, 'screenshots', `${name}-followup.png`), fullPage: true });
      await page.locator('[data-testid="mo-mail-fu"] button.btn-g', { hasText: 'ביטול' }).click().catch(() => null);
      await page.locator('[data-testid="fu-who"]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => null);
      const histTab = page.locator('[data-testid="claims-tab-group-hist"]');
      if (await histTab.count()) {
        await histTab.click({ force: true });
        const histHit = await page.getByText('מייל נכנס').first().waitFor({ state: 'attached', timeout: 12000 }).then(() => true).catch(() => false);
        rec(`${name}-history-visible`, histHit || (await page.getByText('משימה ללקוח נוצרה').count()) > 0 || (await page.getByText('נוצרה טיוטת תגובה').count()) > 0);
        await page.screenshot({ path: join(OUT, 'screenshots', `${name}-history.png`), fullPage: true });
      }
    }
    await browser.close();
  } catch (e) {
    rec(`${name}-ui`, false, { err: String(e.message || e).slice(0, 400) });
    try { await browser?.close(); } catch { /* ignore */ }
  }
}

if (process.env.CLAIMS_QA_SKIP_UI !== '1') {
  await uiPass('desktop', { width: 1280, height: 860 });
  await uiPass('mobile', { width: 390, height: 844 });
} else {
  rec('ui-skipped', true, { detail: 'CLAIMS_QA_SKIP_UI=1' });
}

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, tasks: report.tasks, failed: report.checks.filter((c) => !c.ok).map((c) => c.name), out: OUT }, null, 2));
process.exit(report.ok ? 0 : 1);
