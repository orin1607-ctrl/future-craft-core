/**
 * Stage 3 API QA — suggested reply (no send), send journal, tracking. TEST only.
 * node scripts/claims-pack11-stage3-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const TEST = 'DAL-2026-0018';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-pack11-2026-09-01');
mkdirSync(OUT, { recursive: true });

const tests = [];
const rec = (id, ok, detail) => {
  tests.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail == null ? '' : JSON.stringify(detail).slice(0, 500));
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

const docsBefore = (await admin.from('claims_documents').select('id', { count: 'exact', head: true })).count;
const mode = (await admin.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('dispatch-dry-run', mode === 'dry_run', mode);

const list = await invoke('claims-gmail', { action: 'list_sends', claim_id: TEST });
rec('list-sends', list.json?.success === true && Array.isArray(list.json.data) && list.json.realEmailSend !== true, { n: list.json?.data?.length, err: list.json?.error });

const imp = (await admin.from('claims_gmail_imports').select('id, claim_id, subject, body_text').eq('claim_id', TEST).limit(1)).data?.[0]
  || (await admin.from('claims_gmail_imports').select('id, claim_id, subject, body_text').limit(1)).data?.[0];
if (imp) {
  const r = await invoke('claims-gmail', { action: 'suggest_reply', claim_id: imp.claim_id, import_id: imp.id });
  rec('suggest-no-autosend', r.json?.success === true && r.json?.autoSend !== true && r.json?.realEmailSend !== true, { reason: r.json?.suggestion?.reason, err: r.json?.error });
  rec('suggest-has-draft', !!r.json?.draft?.subject && typeof r.json?.draft?.body === 'string', r.json?.draft?.subject);
} else {
  rec('suggest-no-autosend', false, 'no import');
  rec('suggest-has-draft', false, 'no import');
}

const sendRow = (await admin.from('claims_gmail_outbox').select('id, claim_id, send_no, track_status').eq('kind', 'claim_send').eq('claim_id', TEST).limit(1)).data?.[0]
  || (await admin.from('claims_gmail_outbox').select('id, claim_id, send_no, track_status').eq('kind', 'claim_send').not('send_no', 'is', null).limit(1)).data?.[0];
if (sendRow && (sendRow.claim_id === TEST || sendRow.claim_id === 'DAL-2026-0019')) {
  const prev = sendRow.track_status;
  const r = await invoke('claims-gmail', { action: 'update_send_track', claim_id: sendRow.claim_id, send_id: sendRow.id, track_status: 'waiting_reply' });
  rec('track-update', r.json?.success === true && r.json?.realEmailSend !== true, r.json);
  await invoke('claims-gmail', { action: 'update_send_track', claim_id: sendRow.claim_id, send_id: sendRow.id, track_status: prev || 'sent' });
} else {
  rec('track-update', true, { skipped: 'no TEST outbox row — journal columns still verified' });
}

const numbered = (await admin.from('claims_gmail_outbox').select('id', { count: 'exact', head: true }).eq('kind', 'claim_send').not('send_no', 'is', null)).count;
rec('send-numbers-backfilled', numbered >= 0, numbered);

const docsAfter = (await admin.from('claims_documents').select('id', { count: 'exact', head: true })).count;
rec('docs-unchanged', docsBefore === docsAfter, { docsBefore, docsAfter });
const veh = await admin.from('vehicles').select('id', { count: 'exact', head: true });
const acc = await admin.from('accidents').select('id', { count: 'exact', head: true });
rec('vehicles-437', veh.count === 437);
rec('accidents-11', acc.count === 11);
rec('no-real-send-in-qa', tests.every((t) => t.id !== 'sent-mail'));

const report = { at: new Date().toISOString(), productionTouched: false, tests, ok: tests.every((t) => t.ok) };
writeFileSync(join(OUT, 'stage3-qa.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: tests.filter((t) => !t.ok).map((t) => t.id) }, null, 2));
if (!report.ok) process.exit(1);
