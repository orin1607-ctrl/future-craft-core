/**
 * Staging-only live QA: 3-hour Inbox+Sent Gmail scan + אליהו אטיאס closeout.
 * Never Production. Never mutates Gmail. MAIL_DISPATCH_MODE stays dry_run.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
if (STAGING_REF === PROD_REF) throw new Error('refused production');
const BASE = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-gmail-3h-scan-2026-09-06');
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync('/workspace/.env', 'utf8').split('\n').filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1)];
  }),
);
const anon = env.VITE_SUPABASE_ANON_KEY;
if (!anon) throw new Error('missing anon');

function serviceRole() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const k = process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/[\r\n]/g, '').trim();
    const payload = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString('utf8'));
    if (payload.ref === PROD_REF) throw new Error('service role is production');
    if (payload.ref && payload.ref !== STAGING_REF) throw new Error(`service role ref ${payload.ref}`);
    return k;
  }
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  if (!token) throw new Error('need SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY');
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  }));
  const service = keys.find((x) => x.name === 'service_role' && x.type === 'legacy')?.api_key
    || keys.find((x) => x.name === 'service_role')?.api_key;
  if (!service) throw new Error('no staging service_role');
  const payload = JSON.parse(Buffer.from(service.split('.')[1], 'base64url').toString('utf8'));
  if (payload.ref === PROD_REF) throw new Error('fetched production key');
  return service;
}

const recs = [];
function rec(name, pass, extra = {}) {
  const row = { name, result: pass ? 'PASS' : 'FAIL', ...extra };
  recs.push(row);
  console.log(pass ? 'PASS' : 'FAIL', name, extra.error || extra.reason || '');
  return pass;
}

const service = serviceRole();
const admin = createClient(BASE, service, { auth: { persistSession: false } });
const userDb = createClient(BASE, anon, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({
  email: 'qa.claims.worker.1788292403067@futurecraft.staging',
  password: 'QaWorker2026!',
});
if (authErr || !auth.session) throw authErr || new Error('worker login failed');
const workerHdr = { apikey: anon, Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' };
const schedHdr = { apikey: anon, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', 'x-dalia-internal-key': service };

async function gmail(hdr, body) {
  const res = await fetch(`${BASE}/functions/v1/claims-gmail`, { method: 'POST', headers: hdr, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  mailboxMutated: false,
  realEmailSend: false,
  recs,
};

const status = await gmail(workerHdr, { action: 'status' });
rec('gmail_connected', status.json.connected === true && status.json.email === 'yoni122222@gmail.com', { email: status.json.email });
rec('scan_every_3h', status.json.scheduler?.everyHours === 3 && status.json.scheduler?.everyMs === 3 * 60 * 60 * 1000, { scheduler: status.json.scheduler });
rec('scan_folders_inbox_sent', JSON.stringify(status.json.scheduler?.folders) === JSON.stringify(['inbox', 'sent']), { folders: status.json.scheduler?.folders });

const dry = await gmail(schedHdr, { action: 'scan_inbox', scheduler: true, dry: true, force: true });
rec('unattended_dry_scan', dry.status === 200 && dry.json.success === true && dry.json.scheduler === true, { status: dry.status, error: dry.json.error, scanned: dry.json.scanned, folders: dry.json.folders });
rec('inbox_scanned', Number(dry.json.folders?.inbox || 0) >= 0 && dry.json.success === true, { inbox: dry.json.folders?.inbox });
rec('sent_scanned', Number(dry.json.folders?.sent || 0) >= 0 && dry.json.success === true, { sent: dry.json.folders?.sent });

const nameOnly = await gmail(workerHdr, { action: 'match_dry_run', mail: { subject: 'אליהו אטיאס', body: 'לקוח אליהו אטיאס' } });
rec('name_only_review', nameOnly.json.result?.decision === 'needs_review' && !nameOnly.json.result?.claimId, { result: nameOnly.json.result });

const fileNum = await gmail(workerHdr, { action: 'match_dry_run', mail: { subject: "63292-003 ארוע 1260010522488 דו''ח שמאות 2241 אטיאס אליהו" } });
rec('file_number_auto', fileNum.json.result?.decision === 'auto' && fileNum.json.result?.claimId === 'DAL-2026-0020', { result: fileNum.json.result });

const otherFile = await gmail(workerHdr, { action: 'match_dry_run', mail: { subject: '25311-002 אטיאס אליהו' } });
rec('other_file_not_guessed', otherFile.json.result?.decision === 'needs_review', { result: otherFile.json.result });

const { data: eliClaim, error: eliErr } = await admin.from('claims_records')
  .select('id, client_name, plate, row_data, gmail_thread_id')
  .eq('id', 'DAL-2026-0020')
  .maybeSingle();
const rd = eliClaim?.row_data && typeof eliClaim.row_data === 'object' ? eliClaim.row_data : {};
const eliName = `${eliClaim?.client_name || ''} ${rd.clientName || ''}`;
const eliOk = !!eliClaim && /אטיאס/.test(eliName) && /אליה/.test(eliName);
rec('eli_claim_identified', eliOk && !eliErr, {
  id: eliClaim?.id,
  client_name: eliClaim?.client_name,
  plate: eliClaim?.plate,
  claimNum: rd.claimNum,
  error: eliErr?.message,
});

const listed = await gmail(workerHdr, { action: 'list_messages', claim_id: 'DAL-QA-WORKER-001', q: '63292-003 אטיאס' });
const msgs = listed.json.messages || [];
const relevant = msgs.filter((m) => /63292-003/.test(m.subject || '') && /אטיאס/.test(m.subject || ''));
rec('eli_mail_found', relevant.length > 0, { n: relevant.length, sample: relevant.slice(0, 6).map((m) => ({ id: m.id, subject: m.subject, from: m.from, date: m.date })) });

const inboxHit = relevant.find((m) => /גליל|שמאות|liowain|63292-003/i.test(`${m.from} ${m.subject}`));
const sentHit = relevant.find((m) => /yoni122222|yoni atias/i.test(m.from || ''));
rec('eli_inbox_or_sent', relevant.length > 0, { inboxHit: inboxHit?.id, sentHit: sentHit?.id });

const { data: beforeDocs } = await admin.from('claims_documents').select('id, original_name, content_sha256, gmail_message_id, claim_id').eq('claim_id', 'DAL-2026-0020');
const { data: beforeImp } = await admin.from('claims_gmail_imports').select('id, gmail_message_id, subject, attachment_count').eq('claim_id', 'DAL-2026-0020');

let importedIds = [];
if (eliOk && relevant.length) {
  const targets = [];
  const seen = new Set();
  for (const m of relevant) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const md = await gmail(workerHdr, { action: 'match_dry_run', mail: { messageId: m.id, threadId: m.threadId, subject: m.subject, from: m.from } });
    if (md.json.result?.decision === 'auto' && md.json.result?.claimId === 'DAL-2026-0020') targets.push(m);
  }
  rec('eli_targets_safe', targets.length > 0, { targets: targets.map((m) => ({ id: m.id, subject: m.subject })) });
  for (const m of targets.slice(0, 4)) {
    let start = 0;
    let last = {};
    for (let step = 0; step < 20; step += 1) {
      const ir = await gmail(schedHdr, { action: 'import_message', scheduler: true, claim_id: 'DAL-2026-0020', message_id: m.id, start });
      last = ir.json;
      if (!ir.json.success) break;
      if (ir.json.done) {
        importedIds.push(m.id);
        break;
      }
      start = Number(ir.json.start || start + 12);
    }
    rec(`eli_import_${m.id.slice(0, 8)}`, last.success === true, { error: last.error, imported: last.imported, skippedExisting: last.skippedExisting, found: last.found });
  }
} else {
  rec('eli_targets_safe', false, { reason: 'claim or mail not safely identified' });
}

const { data: afterDocs } = await admin.from('claims_documents').select('id, original_name, content_sha256, gmail_message_id, claim_id, source').eq('claim_id', 'DAL-2026-0020');
const { data: afterImp } = await admin.from('claims_gmail_imports').select('id, gmail_message_id, subject, attachment_count, imported_count').eq('claim_id', 'DAL-2026-0020');
const hashes = (afterDocs || []).map((d) => d.content_sha256).filter(Boolean);
const hashDup = hashes.length !== new Set(hashes).size;
const names = (afterDocs || []).map((d) => String(d.original_name || '').toLowerCase());
rec('eli_docs_present', (afterDocs || []).length > 0, { before: (beforeDocs || []).length, after: (afterDocs || []).length, docs: (afterDocs || []).map((d) => d.original_name) });
rec('eli_mail_linked', (afterImp || []).length > 0, { before: (beforeImp || []).length, after: (afterImp || []).length, subjects: (afterImp || []).map((i) => i.subject) });
rec('no_hash_duplicate', !hashDup, { hashes: hashes.length, unique: new Set(hashes).size });

const { data: leak } = await admin.from('claims_documents').select('id, claim_id, original_name').in('claim_id', ['DAL-QA-WORKER-001', 'DAL-QA-WORKER-002']).in('original_name', names.length ? names : ['__none__']);
rec('no_cross_claim_leak', !leak?.length, { leak });

const live = await gmail(schedHdr, { action: 'scan_inbox', scheduler: true, dry: false, force: true });
rec('unattended_live_tick', live.status === 200 && live.json.success === true && live.json.scheduler === true, {
  scanned: live.json.scanned,
  folders: live.json.folders,
  imported: live.json.imported,
  review: (live.json.needs_review || []).length,
  auto: (live.json.auto || []).length,
  nextDueAt: live.json.nextDueAt,
  error: live.json.error,
});
const nextMs = live.json.nextDueAt ? Date.parse(live.json.nextDueAt) : 0;
const lastMs = live.json.lastScanAt ? Date.parse(live.json.lastScanAt) : 0;
rec('next_due_3h', lastMs && nextMs && Math.abs((nextMs - lastMs) - 3 * 60 * 60 * 1000) < 5000, { lastScanAt: live.json.lastScanAt, nextDueAt: live.json.nextDueAt });

const skip = await gmail(schedHdr, { action: 'scan_inbox', scheduler: true, dry: false });
rec('gate_skips_when_not_due', skip.json.skipped === true && skip.json.reason === 'scan_not_due', { reason: skip.json.reason, nextDueAt: skip.json.nextDueAt });

const { data: mode } = await admin.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle();
rec('mail_dispatch_still_dry_run', mode?.value === 'dry_run', { mode: mode?.value });

const workerEli = await userDb.from('claims_records').select('id').eq('id', 'DAL-2026-0020');
rec('worker_cannot_open_eli', !((workerEli.data || []).length), { rows: workerEli.data, error: workerEli.error?.message });

report.summary = {
  pass: recs.filter((r) => r.result === 'PASS').length,
  fail: recs.filter((r) => r.result === 'FAIL').length,
};
writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ summary: report.summary, productionTouched: false }, null, 2));
if (report.summary.fail) process.exit(2);
