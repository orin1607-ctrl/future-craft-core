/**
 * Stage 2 API QA — staff title/type/note/important/status. TEST claim only. No send.
 * node scripts/claims-pack11-stage2-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const CLAIM = 'DAL-2026-0018';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-pack11-2026-09-01');
mkdirSync(OUT, { recursive: true });

const tests = [];
const rec = (id, ok, detail) => {
  tests.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail == null ? '' : JSON.stringify(detail).slice(0, 400));
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonDb = createClient(STAGING_URL, anon, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(5);
let email = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { email = u.data.user.email; break; }
  if (!email) email = u?.data?.user?.email || '';
}
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const { data: auth } = await anonDb.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
const token = auth.session.access_token;

async function invoke(fn, body) {
  const res = await fetch(`${STAGING_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const beforeDocs = await admin.from('claims_documents').select('id', { count: 'exact', head: true });
const file = (await admin.from('claims_documents').select('id, original_name, doc_kind, doc_meta, storage_path').eq('claim_id', CLAIM).limit(1)).data?.[0];
rec('has-test-file', !!file, file?.original_name);
if (file) {
  const r = await invoke('claims-docs', {
    action: 'update_doc_meta',
    claim_id: CLAIM,
    file_id: file.id,
    staff_title: 'טופס אי-הגשת תביעה TEST',
    staff_type: 'no_claim_form',
    staff_note: 'הערה פנימית TEST — לא לשלוח',
    important: true,
    doc_status: 'ok',
  });
  rec('update-meta', r.json?.success === true && r.json?.copied !== true, r.json);
  const after = (await admin.from('claims_documents').select('original_name, doc_kind, doc_meta, storage_path').eq('id', file.id).maybeSingle()).data;
  rec('no-file-copy', after?.storage_path === file.storage_path && after?.original_name === file.original_name && after?.doc_kind === file.doc_kind, after?.doc_kind);
  rec('title-saved', after?.doc_meta?.staff_title === 'טופס אי-הגשת תביעה TEST', after?.doc_meta);
  rec('type-saved', after?.doc_meta?.staff_type === 'no_claim_form');
  rec('note-saved', after?.doc_meta?.staff_note?.includes('פנימית'));
  rec('important-saved', after?.doc_meta?.important === 'true');
  rec('status-saved', after?.doc_meta?.doc_status === 'ok');
}

const imp = (await admin.from('claims_gmail_imports').select('id, claim_id').eq('claim_id', CLAIM).limit(1)).data?.[0]
  || (await admin.from('claims_gmail_imports').select('id, claim_id').eq('claim_id', 'DAL-2026-0019').limit(1)).data?.[0];
if (imp) {
  const r = await invoke('claims-gmail', { action: 'update_import_note', claim_id: imp.claim_id, import_id: imp.id, staff_note: 'נשלח למנורה TEST — פנימי' });
  rec('mail-note', r.json?.success === true && r.json?.realEmailSend !== true, r.json);
} else {
  rec('mail-note', true, { skipped: 'no import on TEST claims' });
}

const afterDocs = await admin.from('claims_documents').select('id', { count: 'exact', head: true });
rec('docs-count-unchanged', beforeDocs.count === afterDocs.count, { before: beforeDocs.count, after: afterDocs.count });
const veh = await admin.from('vehicles').select('id', { count: 'exact', head: true });
const acc = await admin.from('accidents').select('id', { count: 'exact', head: true });
rec('vehicles-437', veh.count === 437);
rec('accidents-11', acc.count === 11);

const report = { at: new Date().toISOString(), productionTouched: false, tests, ok: tests.every((t) => t.ok) };
writeFileSync(join(OUT, 'stage2-qa.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: tests.filter((t) => !t.ok).map((t) => t.id) }, null, 2));
if (!report.ok) process.exit(1);
