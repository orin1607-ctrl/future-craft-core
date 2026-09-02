/**
 * Restore Point BEFORE Claims work-center pack. Staging only.
 * node scripts/claims-work-center-restore-before.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-work-center-2026-09-02');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
if (!service) throw new Error('no staging service key');
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

async function count(table) {
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true });
  return count ?? 0;
}

const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const gitShort = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

const { data: modeRow } = await admin.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle();
const { data: claims } = await admin.from('claims_records')
  .select('id, plate, client_name, status, company_name, assigned_to, assigned_to_name, gmail_message_id, gmail_thread_id, created_at, created_by_name, row_data')
  .order('id');
const rows = claims || [];
const sources = {};
const docsOrder = {};
for (const c of rows) {
  const rd = c.row_data && typeof c.row_data === 'object' ? c.row_data : {};
  const src = String(rd.source || '(empty)');
  sources[src] = (sources[src] || 0) + 1;
  const ord = String(rd.docsOrderStatus || '(unset)');
  docsOrder[ord] = (docsOrder[ord] || 0) + 1;
}

const { data: docs } = await admin.from('claims_documents').select('id, claim_id, source, doc_kind, original_name').limit(5000);
const docByClaim = {};
const kindCounts = {};
const docSources = {};
for (const d of (docs || [])) {
  docByClaim[d.claim_id] = (docByClaim[d.claim_id] || 0) + 1;
  const k = d.doc_kind || 'null';
  kindCounts[k] = (kindCounts[k] || 0) + 1;
  const s = d.source || '(empty)';
  docSources[s] = (docSources[s] || 0) + 1;
}

const { data: jobs } = await admin.from('claims_mail_jobs').select('id, reminder_id, claim_id, planned_at, status').limit(200);
const { data: followRems } = await admin.from('claims_reminders').select('id, claim_id, action, status, next_run_at').eq('action', 'send_email').limit(200);
const { data: noteRems } = await admin.from('claims_reminders').select('id, claim_id, action, status').eq('action', 'note').limit(200);
const { data: outbox } = await admin.from('claims_gmail_outbox')
  .select('id, claim_id, status, followup_approved, followup_days, track_due, track_status, sent_at')
  .order('sent_at', { ascending: false })
  .limit(40);

const { data: bucket } = await admin.storage.getBucket('claims-docs');

const snapshot = rows.map((c) => {
  const rd = c.row_data && typeof c.row_data === 'object' ? c.row_data : {};
  return {
    id: c.id,
    client: c.client_name || rd.clientName || '',
    status: c.status,
    plate: c.plate || rd.plate || '',
    insCompany: rd.insCompany || '',
    claimNum: rd.claimNum || '',
    source: rd.source || '',
    docsOrderStatus: rd.docsOrderStatus || '',
    assigned: c.assigned_to_name || '',
    assigned_to: c.assigned_to || '',
    nextDate: rd.nextDate || '',
    lastTreatmentAt: rd.lastTreatmentAt || '',
    archived: rd.archived || '',
    deletedAt: rd.deletedAt || '',
    gmail_message_id: c.gmail_message_id || '',
    created_at: c.created_at,
    created_by_name: c.created_by_name || '',
    docs: docByClaim[c.id] || 0,
  };
});

const rp = {
  at: new Date().toISOString(),
  purpose: 'restore-before-claims-work-center',
  stagingRef: STAGING_REF,
  productionRefUntouched: PROD_REF,
  productionTouched: false,
  hostingerTouched: false,
  liveMailEnabled: false,
  schedulerLiveEnabled: false,
  MAIL_DISPATCH_MODE: modeRow?.value || null,
  gitHead,
  gitShort,
  gitBranch,
  bucketPublic: bucket?.public === true,
  counts: {
    claims: rows.length,
    documents: await count('claims_documents'),
    tasks: await count('claims_tasks'),
    reminders: await count('claims_reminders'),
    history: await count('claims_history'),
    mailJobs: await count('claims_mail_jobs'),
    gmailImports: await count('claims_gmail_imports'),
    gmailOutbox: await count('claims_gmail_outbox'),
    gmailPending: await count('claims_gmail_pending'),
    notifications: await count('claims_notifications'),
  },
  sources,
  docsOrder,
  kindCounts,
  docSources,
  mailJobsSample: jobs || [],
  followupReminders: followRems || [],
  noteRemindersCount: (noteRems || []).length,
  recentOutboxFollowup: outbox || [],
  mutated: false,
};
writeFileSync(join(OUT, 'RESTORE-POINT-BEFORE.json'), JSON.stringify(rp, null, 2), 'utf8');
writeFileSync(join(OUT, 'CLAIMS-SNAPSHOT-BEFORE.json'), JSON.stringify(snapshot, null, 2), 'utf8');
console.log(JSON.stringify({
  restore: join(OUT, 'RESTORE-POINT-BEFORE.json'),
  gitShort,
  branch: gitBranch,
  mode: rp.MAIL_DISPATCH_MODE,
  counts: rp.counts,
  sources,
  docsOrder,
  kindCounts,
  followups: (followRems || []).length,
  jobs: (jobs || []).length,
  outboxWithFollowup: (outbox || []).filter((o) => o.followup_approved).length,
}, null, 2));
