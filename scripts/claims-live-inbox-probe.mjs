/**
 * Staging-only live Gmail probe. No Production. No send. scan_inbox dry first.
 * node scripts/claims-live-inbox-probe.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
if (STAGING_REF === PROD_REF) throw new Error('refused production');
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-live-inbox-probe-2026-09-04');
mkdirSync(OUT, { recursive: true });

function loadDotEnv() {
  const out = {};
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || loadDotEnv().VITE_SUPABASE_ANON_KEY;
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (authErr || !auth.session) throw authErr || new Error('login failed');
const hdr = { apikey: anonKey, Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' };

async function invokeGmail(body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
    method: 'POST', headers: hdr, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const claims = (await userDb.from('claims_records').select('id, client_name, plate, status, created_at, last_activity_at, row_data').order('created_at', { ascending: false }).limit(20)).data || [];
const recent = claims.map((c) => ({
  id: c.id,
  client: c.client_name,
  plate: c.plate,
  status: c.status,
  created: c.created_at,
  claimNum: c.row_data?.claimNum || c.id,
  source: c.row_data?.source || '',
}));

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
const status = await invokeGmail({ action: 'status' });
const dry = await invokeGmail({ action: 'scan_inbox', dry: true });
const pending = await invokeGmail({ action: 'list_pending' });
const pendingRows = Array.isArray(pending.json?.data) ? pending.json.data : [];

const imports = (await userDb.from('claims_gmail_imports').select('id, claim_id, subject, from_addr, sent_at, attachment_count, created_at').order('sent_at', { ascending: false }).limit(25)).data || [];
const docs = (await userDb.from('claims_documents').select('id, claim_id, original_name, doc_kind, source, created_at, gmail_message_id').order('created_at', { ascending: false }).limit(40)).data || [];

const surveyorHay = (s) => /שמאי|שמאות|surveyor|survey/i.test(String(s || ''));
const dryAuto = Array.isArray(dry.json?.auto) ? dry.json.auto : [];
const dryReview = Array.isArray(dry.json?.needs_review) ? dry.json.needs_review : [];
const surveyorInbox = [...dryAuto, ...dryReview].filter((m) => surveyorHay(`${m.subject || ''} ${m.from || ''} ${m.snippet || ''}`));
const surveyorImports = imports.filter((m) => surveyorHay(`${m.subject || ''} ${m.from_addr || ''}`));
const surveyorDocs = docs.filter((d) => surveyorHay(`${d.original_name || ''} ${d.doc_kind || ''}`) || d.doc_kind === 'surveyor_report' || d.doc_kind === 'surveyor_photo');

const out = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  mailDispatchMode: mode,
  gmail: { connected: status.json?.connected, email: status.json?.email || status.json?.connected_email, sendEnabled: status.json?.sendEnabled },
  scanDry: {
    success: dry.json?.success === true,
    lookback: dry.json?.lookback,
    scheduler: dry.json?.scheduler,
    scanned: dry.json?.scanned,
    skippedImported: dry.json?.skippedImported,
    skippedPending: dry.json?.skippedPending,
    mailboxMutated: dry.json?.mailboxMutated,
    realEmailSend: dry.json?.realEmailSend,
    auto: dryAuto.map((m) => ({ subject: m.subject, from: m.from, claim_id: m.claim_id, via: m.via, decision: m.decision, sent_at: m.sent_at })),
    review: dryReview.map((m) => ({ subject: m.subject, from: m.from, reason: m.reason, candidates: m.candidates, sent_at: m.sent_at })),
  },
  pendingUnimported: pendingRows.filter((p) => !p.imported_at).map((p) => ({
    subject: p.subject, from: p.from_addr, decision: p.decision, claim: p.assigned_claim_id, reason: p.reason, sent_at: p.sent_at,
  })),
  recentClaims: recent,
  recentImports: imports.slice(0, 12),
  surveyorInbox,
  surveyorImports,
  surveyorDocs: surveyorDocs.slice(0, 20),
};
writeFileSync(join(OUT, 'probe.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  scan: out.scanDry,
  surveyorInbox: surveyorInbox.length,
  surveyorImports: surveyorImports.map((x) => ({ id: x.id, claim: x.claim_id, subject: x.subject, sent: x.sent_at })),
  newestClaims: recent.slice(0, 8),
  pending: out.pendingUnimported.slice(0, 10),
}, null, 2));
