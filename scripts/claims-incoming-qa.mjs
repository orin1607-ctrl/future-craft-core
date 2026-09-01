/**
 * Incoming Gmail QA — Staging only. No mailbox mutation. No real send.
 * node scripts/claims-incoming-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-incoming-gmail-2026-09-01');
mkdirSync(OUT, { recursive: true });

const tests = [];
const rec = (id, ok, detail) => {
  const row = { id, ok: Boolean(ok), verdict: ok ? 'PASS' : 'FAIL', detail: detail ?? null };
  tests.push(row);
  console.log(row.verdict, id, detail == null ? '' : JSON.stringify(detail).slice(0, 700));
};

const tmpWork = join(process.env.TEMP || tmpdir(), 'fcc-claims-incoming-qa');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${tmp}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180000,
  });
}
function extract(raw) {
  const parsed = JSON.parse(String(raw));
  return parsed.rows?.[0]?.json_build_object || parsed.rows?.[0] || parsed;
}

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

const keysJson = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keysJson.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keysJson.find((k) => k.name === 'service_role')?.api_key;
const anon = keysJson.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key
  || keysJson.find((k) => k.name === 'anon')?.api_key;
const adminDb = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonDb = createClient(STAGING_URL, anon, { auth: { autoRefreshToken: false, persistSession: false } });

async function sessionFor(email) {
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await anonDb.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verifyOtp ${email}`);
  return auth.session;
}
async function invoke(token, body) {
  const res = await fetch(`${STAGING_URL}/functions/v1/claims-gmail`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const bounds = extract(dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'claims', (SELECT count(*) FROM public.claims_records),
  'docs', (SELECT count(*) FROM public.claims_documents),
  'imports', (SELECT count(*) FROM public.claims_gmail_imports),
  'bucket_public', (SELECT public FROM storage.buckets WHERE id='claims-docs'),
  'pending', (SELECT to_regclass('public.claims_gmail_pending') IS NOT NULL)
);
`));
rec('staging-only', linked === STAGING_REF, linked);
rec('vehicles-437', Number(bounds.vehicles) === 437, bounds.vehicles);
rec('accidents-11', Number(bounds.accidents) === 11, bounds.accidents);
rec('storage-private', bounds.bucket_public === false, bounds.bucket_public);
rec('pending-table', bounds.pending === true, bounds.pending);

const adminEmail = extract(dbQuery(`
SELECT json_build_object(
  'email', (
    SELECT u.email FROM auth.users u
    JOIN public.user_roles ur ON ur.user_id=u.id
    WHERE ur.role='super_admin'
    ORDER BY CASE WHEN u.email = 'orin1607@gmail.com' THEN 0 ELSE 1 END
    LIMIT 1
  )
);
`)).email;
const token = (await sessionFor(adminEmail)).access_token;

const claims = [
  { id: 'DAL-2026-0018', claimNum: 'DAL-2026-0018', plate: '12345678', eventDate: '2026-08-01', threads: ['thread-18'] },
  { id: 'DAL-2026-0019', claimNum: 'DAL-2026-0019', plate: '87654321', eventDate: '2026-08-02', threads: ['thread-19'] },
];
const samePlate = [
  { id: 'DAL-2026-0018', claimNum: 'DAL-2026-0018', plate: '11122233', eventDate: '2026-03-10', threads: ['thread-18'] },
  { id: 'DAL-2026-0019', claimNum: 'DAL-2026-0019', plate: '11122233', eventDate: '2026-07-20', threads: ['thread-19'] },
];

async function dry(id, mail, claimSet, want) {
  const r = await invoke(token, { action: 'match_dry_run', mail, claims: claimSet });
  const got = r.json?.result || {};
  rec(id, r.json?.success === true && r.json?.realEmailSend !== true && got.decision === want.decision && (!want.claimId || got.claimId === want.claimId), {
    decision: got.decision,
    claimId: got.claimId,
    via: got.via,
    reason: got.reason,
  });
}

await dry('TEST-A', { subject: 'תביעה DAL-2026-0018', body: 'שלום' }, claims, { decision: 'auto', claimId: 'DAL-2026-0018' });
await dry('TEST-B', { threadId: 'thread-18', subject: 'Re: המשך', body: 'reply' }, claims, { decision: 'auto', claimId: 'DAL-2026-0018' });
await dry('TEST-C', { subject: 'רכב 11-122-233', body: 'תאריך אירוע 10.03.2026' }, samePlate, { decision: 'auto', claimId: 'DAL-2026-0018' });
await dry('TEST-D', { subject: 'רכב 11122233', body: 'אין מזהה נוסף' }, samePlate, { decision: 'needs_review' });
await dry('TEST-E', { subject: 'DAL-2026-0018 רכב 87-654-321', body: 'סתירה' }, claims, { decision: 'needs_review' });

const existing = extract(dbQuery(`
SELECT json_build_object(
  'message_id', (SELECT gmail_message_id FROM public.claims_gmail_imports WHERE gmail_message_id IS NOT NULL LIMIT 1),
  'claim_id', (SELECT claim_id FROM public.claims_gmail_imports WHERE gmail_message_id IS NOT NULL LIMIT 1),
  'gmail_docs', (SELECT count(*) FROM public.claims_documents WHERE source='gmail'),
  'gmail_on_0018', (SELECT count(*) FROM public.claims_documents WHERE claim_id='DAL-2026-0018' AND source='gmail')
);
`));
if (existing.message_id && existing.claim_id && existing.claim_id !== 'DAL-2026-0019') {
  const dup = await invoke(token, {
    action: 'import_message',
    claim_id: 'DAL-2026-0019',
    message_id: existing.message_id,
  });
  rec('TEST-F-no-duplicate', dup.json?.error === 'already_imported_other_claim' && dup.json?.realEmailSend !== true, {
    status: dup.status,
    error: dup.json?.error,
    existing: existing.claim_id,
  });
} else {
  rec('TEST-F-no-duplicate', false, { skip: 'no existing import to probe' });
}

rec('TEST-G-gmail-docs-exist', Number(existing.gmail_docs) > 0, existing.gmail_docs);
rec('TEST-G-storage-private', bounds.bucket_public === false, bounds.bucket_public);

const dryScan = await invoke(token, { action: 'scan_inbox', dry: true });
rec('scan-inbox-dry-no-send', dryScan.json?.success === true && dryScan.json?.dry === true && dryScan.json?.mailboxMutated !== true && dryScan.json?.realEmailSend !== true, {
  status: dryScan.status,
  error: dryScan.json?.error,
  scanned: dryScan.json?.scanned,
  auto: Array.isArray(dryScan.json?.auto) ? dryScan.json.auto.length : null,
  review: Array.isArray(dryScan.json?.needs_review) ? dryScan.json.needs_review.length : null,
  skippedImported: dryScan.json?.skippedImported,
});

const after = extract(dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'docs', (SELECT count(*) FROM public.claims_documents),
  'imports', (SELECT count(*) FROM public.claims_gmail_imports)
);
`));
rec('bounds-after-unchanged', Number(after.vehicles) === 437 && Number(after.accidents) === 11 && Number(after.docs) === Number(bounds.docs) && Number(after.imports) === Number(bounds.imports), after);

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  mailboxMutated: false,
  realEmailSend: false,
  tests,
  ok: tests.every((t) => t.ok),
};
writeFileSync(join(OUT, 'incoming-qa.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ok: report.ok, fail: tests.filter((t) => !t.ok).map((t) => t.id) }, null, 2));
if (!report.ok) process.exit(1);
