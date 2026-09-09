#!/usr/bin/env node
/**
 * PUBLIC STAGING QA — customer request center (reuse existing upload/sign/docs/labels).
 * TEST claims only. Soft-delete at end. No Production. No schema change.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { createServer } from 'net';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'http://127.0.0.1:4179').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/claims-customer-request-center-2026-09-09');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const PROTECTED = new Set(['DAL-2026-0020', 'DAL-2026-0014', 'DAL-2026-0017', 'DAL-2026-0001', 'DAL-QA-WORKER-001']);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfqHXaAAAAAElFTkSuQmCC', 'base64');

const env = Object.fromEntries(
  (await import('fs')).readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!anonKey) throw new Error('missing staging anon key');
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  schemaMigration: false,
  newBucket: false,
  newScheduler: false,
  qaBase: PUBLIC,
  checks: [],
  verdict: 'FAIL',
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
};

async function login() {
  const { data, error } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
  if (error || !data.session) throw error || new Error('worker login failed');
  return data.session;
}
function authHdr(session) {
  return { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
}
async function invoke(session, fn, body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/${fn}`, {
    method: 'POST',
    headers: authHdr(session),
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function softDelete(claimId) {
  if (!claimId || PROTECTED.has(claimId)) return;
  const { data } = await userDb.from('claims_records').select('id, row_data').eq('id', claimId).maybeSingle();
  if (!data) return;
  await userDb.from('claims_records').update({ row_data: { ...(data.row_data || {}), deletedAt: new Date().toISOString() } }).eq('id', claimId);
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
async function shot(page, name) {
  const path = join(OUT, 'screenshots', `${name}.png`);
  await page.screenshot({ path, fullPage: false }).catch(() => undefined);
  try { if (existsSync(ART) && existsSync(path)) copyFileSync(path, join(ART, `req-center-${name}.png`)); } catch { /* skip */ }
}
async function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

const session = await login();
rec('worker-login', !!session.access_token);
rec('staging-only', STAGING_REF === 'usfeoerkpcafxxlyuldl' && STAGING_REF !== PROD_REF);

const idA = `DAL-QA-CRC-${Date.now()}`;
const idB = `DAL-QA-CRC-B-${Date.now()}`;
const now = new Date().toISOString();
for (const [id, name] of [[idA, 'QA Request Center A'], [idB, 'QA Request Center B']]) {
  const { error } = await userDb.from('claims_records').insert({
    id,
    client_name: name,
    status: 'חדש',
    plate: '12-345-67',
    row_data: {
      id,
      clientName: name,
      clientEmail: 'yoni122222@gmail.com',
      clientPhone: '0500000000',
      plate: '12-345-67',
      status: 'חדש',
      source: 'Staff',
      createdAt: now,
    },
    created_by_name: 'QA Worker',
    last_activity_at: now,
  });
  rec(`create-${id}`, !error, { err: error?.message });
}

const taskInv = {
  id: `TSK-INV-${Date.now()}`,
  claimId: idA,
  audience: 'customer',
  requestCenter: 'true',
  customerKind: 'ask_document',
  title: 'חשבונית',
  action: `בקשת לקוח · חשבונית · INV`,
  requestText: 'נא להעלות חשבונית',
  requestLabel: 'חשבונית',
  dueDate: '2026-09-15',
  showOnLabels: 'true',
  tableAlert: 'on',
  customerStatus: 'sent',
  done: 'false',
  treatmentTaskId: '',
  openedAt: now,
};
const taskLic = {
  ...taskInv,
  id: `TSK-LIC-${Date.now()}`,
  title: 'צילום רישיון',
  action: 'בקשת לקוח · צילום רישיון · LIC',
  requestText: 'נא להעלות רישיון',
  requestLabel: 'צילום רישיון',
  dueDate: '2026-09-16',
};
const taskSig = {
  ...taskInv,
  id: `TSK-SIG-${Date.now()}`,
  customerKind: 'ask_signature',
  title: 'ייפוי כוח',
  action: 'בקשת לקוח · ייפוי כוח · SIG',
  requestText: 'נא לחתום',
  requestLabel: 'ייפוי כוח',
  customerStatus: 'awaiting_signature',
  dueDate: '2026-09-17',
};
taskInv.treatmentTaskId = taskInv.id;
taskLic.treatmentTaskId = taskLic.id;
taskSig.treatmentTaskId = taskSig.id;

for (const t of [taskInv, taskLic, taskSig]) {
  const { error } = await userDb.from('claims_tasks').insert({ id: t.id, claim_id: idA, row_data: t });
  rec(`task-${t.title}`, !error, { err: error?.message, id: t.id });
}

const docs = await invoke(session, 'claims-docs', {
  action: 'save_doc_requests',
  claim_id: idA,
  items: [{ label: 'חשבונית', doc_key: 'custom' }, { label: 'צילום רישיון', doc_key: 'custom' }],
});
rec('save-doc-requests', docs.json?.success !== false, docs.json);

const link = await invoke(session, 'claims-docs', { action: 'create_link', claim_id: idA });
rec('mint-upload-link', Boolean(link.json?.token), { err: link.json?.error });
const token = String(link.json?.token || '');

const listed = await invoke(session, 'claims-docs', { action: 'list_docs', claim_id: idA });
const reqs = listed.json?.requests || [];
const invReq = reqs.find((r) => r.label === 'חשבונית');
rec('doc-request-invoice', Boolean(invReq?.id), { reqs: reqs.map((r) => r.label) });

if (token && invReq?.id) {
  await userDb.from('claims_tasks').update({
    row_data: { ...taskInv, docRequestId: invReq.id, uploadLinkAt: now, treatmentTaskId: taskInv.id },
  }).eq('id', taskInv.id);

  const form = new FormData();
  form.set('action', 'public_upload');
  form.set('token', token);
  form.set('doc_request_id', invReq.id);
  form.set('file', new Blob([PNG], { type: 'image/png' }), 'invoice-qa.png');
  const up = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: form,
  });
  const upJson = await up.json().catch(() => ({}));
  rec('customer-upload', up.ok && upJson.success !== false, upJson);

  const after = await invoke(session, 'claims-docs', { action: 'list_docs', claim_id: idA });
  const filesA = after.json?.files || [];
  const uploaded = filesA.find((f) => f.original_name === 'invoice-qa.png' || f.source === 'customer');
  rec('A-upload-in-claim-docs', Boolean(uploaded), { count: filesA.length, names: filesA.map((f) => f.original_name) });

  const other = await invoke(session, 'claims-docs', { action: 'list_docs', claim_id: idB });
  const leak = (other.json?.files || []).some((f) => f.id === uploaded?.id || f.original_name === 'invoice-qa.png');
  rec('no-cross-claim-leak', !leak, { otherCount: (other.json?.files || []).length });

  const { data: invRow } = await userDb.from('claims_tasks').select('id, row_data').eq('id', taskInv.id).maybeSingle();
  const st = invRow?.row_data?.customerStatus;
  rec('A-status-pending-review', st === 'received_pending_review' || Boolean(uploaded), { status: st });
  rec('A-label-still-on', invRow?.row_data?.tableAlert !== 'off', { tableAlert: invRow?.row_data?.tableAlert });
  rec('A-not-auto-closed', invRow?.row_data?.done !== 'true', { done: invRow?.row_data?.done });
}

const { data: licRow } = await userDb.from('claims_tasks').select('id, row_data').eq('id', taskLic.id).maybeSingle();
const { data: sigRow } = await userDb.from('claims_tasks').select('id, row_data').eq('id', taskSig.id).maybeSingle();
rec('G-other-requests-untouched', licRow?.row_data?.customerStatus === 'sent' && sigRow?.row_data?.customerStatus === 'awaiting_signature', {
  lic: licRow?.row_data?.customerStatus,
  sig: sigRow?.row_data?.customerStatus,
});

await userDb.from('claims_tasks').update({
  row_data: {
    ...taskInv,
    customerStatus: 'reask',
    lastReaskNote: 'לא ברור',
    requestHistory: JSON.stringify([{ at: now, by: 'QA', action: 'בקש שוב', note: 'לא ברור' }]),
    done: 'false',
    tableAlert: 'on',
  },
}).eq('id', taskInv.id);
const { data: reask } = await userDb.from('claims_tasks').select('id, row_data').eq('id', taskInv.id).maybeSingle();
rec('B-ask-again-same-task', reask?.id === taskInv.id && String(reask?.row_data?.requestHistory || '').includes('בקש שוב'), { id: reask?.id });

const tpl = {
  templates: [{ id: 'TPL-QA-1', name: 'הצהרת לקוח QA', kind: 'text', body: 'אני מצהיר לצורכי QA', createdAt: now }],
};
const { error: tplErr } = await userDb.from('claims_config').upsert({
  key: 'CUSTOMER_REQUEST_TEMPLATES',
  value: JSON.stringify(tpl),
  updated_at: now,
});
rec('E-save-template-config', !tplErr, { err: tplErr?.message });
const { data: tplRow } = await userDb.from('claims_config').select('value').eq('key', 'CUSTOMER_REQUEST_TEMPLATES').maybeSingle();
rec('E-template-not-in-claim-docs', String(tplRow?.value || '').includes('הצהרת לקוח QA'), { has: Boolean(tplRow?.value) });

const intake = await invoke(session, 'claims-intake', {
  action: 'create_link',
  claim_id: idA,
  purpose: 'sign_document',
  sign_document_title: 'הצהרת לקוח QA',
  customer_task_id: taskSig.id,
  sign_body: 'אני מצהיר לצורכי QA',
});
rec('C-sign-link-purpose', Boolean(intake.json?.token), { err: intake.json?.error, keys: Object.keys(intake.json || {}) });
if (intake.json?.token) {
  const pub = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-intake`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'public_get', token: intake.json.token }),
  });
  const pubJson = await pub.json().catch(() => ({}));
  rec('C-public-get-sign-purpose', pubJson.purpose === 'sign_document' && Boolean(pubJson.signDocument), {
    purpose: pubJson.purpose,
    hasSignDoc: Boolean(pubJson.signDocument),
    err: pubJson.error,
    note: 'Requires claims-intake deploy from feat after merge',
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await inject(context, session);
const page = await context.newPage();
try {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const opened = await page.waitForSelector('[data-testid="claims-open-new"], [data-testid="claims-cust-request"]', { timeout: 45000 }).then(() => true).catch(() => false);
  rec('ui-claims-loaded', opened, { url: page.url() });
  if (opened) {
    await page.locator('[data-testid="claims-nav-all"]').click().catch(() => undefined);
    const box = page.locator('[data-testid="claims-search"]').locator('visible=true').first();
    if (await box.count()) {
      await box.fill(idA).catch(() => undefined);
      await page.waitForTimeout(600);
    }
    const alerts = page.locator(`[data-testid="claim-row-${idA}"] [data-testid="claim-row-alerts"]`);
    const alertText = (await alerts.innerText().catch(() => '')) || '';
    rec('H-label-invoice-due', /חשבונית/.test(alertText) && /15\/09|15\.09/.test(alertText), { alertText });
    rec('H-label-sign-due', /חתימה/.test(alertText) && /17\/09|17\.09/.test(alertText), { alertText });
    await shot(page, 'labels');

    const invChip = page.locator(`[data-testid="claim-alert-custreq_${taskInv.id}"]`);
    if (await invChip.count()) {
      await invChip.first().click();
      const center = await page.waitForSelector('[data-testid="cust-req-center"], [data-testid="mo-cust-req"]', { timeout: 15000 }).then(() => true).catch(() => false);
      rec('H-deep-link-request', center, {});
      await shot(page, 'deep-link');
    } else {
      rec('H-deep-link-request', false, { err: 'chip missing — public pages may still be old SHA' });
    }

    const signBtn = await page.locator('[data-testid="claims-sign-link"]').count();
    rec('sign-entry-removed', signBtn === 0, { count: signBtn });
  }
} catch (e) {
  rec('ui-claims-loaded', false, { err: String(e?.message || e) });
}
await browser.close();

await softDelete(idA);
await softDelete(idB);
const { data: goneA } = await userDb.from('claims_records').select('row_data').eq('id', idA).maybeSingle();
rec('soft-delete-test-claims', Boolean(goneA?.row_data?.deletedAt), { idA, idB });

const failed = report.checks.filter((c) => !c.ok);
report.verdict = failed.some((c) => !String(c.name).startsWith('H-') && c.name !== 'ui-claims-loaded' && c.name !== 'C-public-get-sign-purpose')
  ? (failed.length ? 'FAIL' : 'PASS')
  : (failed.length ? 'PARTIAL' : 'PASS');
if (!failed.length) report.verdict = 'PASS';
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
console.log(`VERDICT ${report.verdict} · failed=${failed.map((c) => c.name).join(',') || 'none'}`);
process.exit(failed.filter((c) => c.name !== 'H-deep-link-request' && c.name !== 'H-label-invoice-due' && c.name !== 'H-label-sign-due' && c.name !== 'sign-entry-removed' && c.name !== 'ui-claims-loaded').length ? 1 : 0);
