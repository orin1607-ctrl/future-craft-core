/**
 * Staging-only Dry Run QA for claims mail follow-up.
 * No OAuth. No Gmail mailbox. No real send. Cleans DAL-QA-MAIL-001.
 * node scripts/claims-mail-dryrun-qa.mjs
 */
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-mail-dryrun-staging-2026-08-31');
const QA_ID = 'DAL-QA-MAIL-001';
mkdirSync(OUT, { recursive: true });

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-mail-qa');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${tmp}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120000,
  });
}
function extract(raw) {
  const parsed = JSON.parse(String(raw));
  return parsed.rows?.[0]?.json_build_object || parsed.rows?.[0] || parsed;
}
function sqlLit(v) {
  return `'${String(v ?? '').replace(/'/g, "''")}'`;
}

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: linked production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

const tests = [];
const rec = (id, ok, detail) => tests.push({ id, ok, detail });

const before = extract(dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'document_requests', (SELECT count(*) FROM public.document_requests),
  'profiles', (SELECT count(*) FROM public.profiles),
  'mode', (SELECT value FROM public.claims_config WHERE key='MAIL_DISPATCH_MODE')
);
`));
rec('mode-dry-run', before.mode === 'dry_run', `MAIL_DISPATCH_MODE=${before.mode}`);

const meta = extract(dbQuery(`
SELECT json_build_object(
  'admin', (SELECT ur.user_id::text FROM public.user_roles ur WHERE ur.role = 'super_admin' LIMIT 1),
  'sample_vehicle', (SELECT v.id::text FROM public.vehicles v
    WHERE coalesce(v.status,'') <> 'archived' AND v.license_plate IS NOT NULL
    ORDER BY v.license_plate LIMIT 1)
);
`));
const adminId = meta.admin;
if (!adminId) throw new Error('no super_admin for JWT simulation');

dbQuery(`
DELETE FROM public.claims_records WHERE id = '${QA_ID}';
INSERT INTO public.claims_records (
  id, vehicle_id, plate, client_name, status, company_name, row_data,
  created_by, created_by_name, updated_by_name, last_activity_at
) VALUES (
  '${QA_ID}',
  ${meta.sample_vehicle ? sqlLit(meta.sample_vehicle) + '::uuid' : 'NULL'},
  'QA-MAIL',
  'QA Mail Dry Run',
  'בטיפול',
  'QA',
  jsonb_build_object(
    'id','${QA_ID}','clientName','QA Mail Dry Run','plate','QA-MAIL',
    'claimNum','QA-MAIL-1','insEmail','insurer-qa@example.com','status','בטיפול'
  ),
  '${adminId}'::uuid,
  'QA Staging',
  'QA Staging',
  now()
);
INSERT INTO public.claims_documents (id, claim_id, storage_path, original_name, mime_type, byte_size, source)
VALUES ('DOC-QA-MAIL-1','${QA_ID}','qa/mail/surveyor.pdf','דוח שמאי QA.pdf','application/pdf',1234,'staff');
`);

function asAdminSelect(expr) {
  return dbQuery(`
SELECT ${expr}
WHERE set_config('request.jwt.claim.sub', ${sqlLit(adminId)}, true) IS NOT NULL
  AND set_config('request.jwt.claims', json_build_object('sub', ${sqlLit(adminId)}, 'role', 'authenticated')::text, true) IS NOT NULL;
`);
}
function tryAdminSelect(expr) {
  try {
    return { ok: true, data: extract(asAdminSelect(expr)) };
  } catch (e) {
    return { ok: false, error: `${e.message || e}\n${e.stderr?.toString?.() || ''}`.slice(0, 1500) };
  }
}

const onceUpsert = extract(asAdminSelect(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id','${QA_ID}',
    'mail_to','insurer-qa@example.com',
    'mail_subject','תביעה QA-MAIL-1 – בקשת עדכון סטטוס',
    'mail_body','שלום, Dry Run once',
    'mail_kind','email_once',
    'attach_mode','received',
    'next_run_at', (now() - interval '1 minute')::text
  )) AS json_build_object
`));
const onceId = onceUpsert?.id;
if (!onceId) throw new Error(`once upsert failed: ${JSON.stringify(onceUpsert)}`);
rec('once-upsert', Boolean(onceId), JSON.stringify(onceUpsert).slice(0, 400));

const onceDispatch = extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
rec('once-dispatch', onceDispatch?.success === true && onceDispatch?.realEmailSend === false && (onceDispatch?.processed || 0) >= 1,
  JSON.stringify(onceDispatch).slice(0, 500));
rec('once-no-real-mail', onceDispatch?.realEmailSend === false && onceDispatch?.gmailTouched === false, JSON.stringify(onceDispatch));

const onceAfter = extract(dbQuery(`
SELECT json_build_object(
  'reminder_status', (SELECT status FROM public.claims_reminders WHERE id = ${sqlLit(onceId)}),
  'job', (SELECT json_build_object('status', status, 'preview', preview, 'fail_reason', fail_reason)
          FROM public.claims_mail_jobs WHERE reminder_id = ${sqlLit(onceId)} ORDER BY planned_at DESC LIMIT 1),
  'pending_next', (SELECT count(*) FROM public.claims_mail_jobs WHERE reminder_id = ${sqlLit(onceId)} AND status='pending'),
  'comm', (SELECT count(*) FROM public.claims_comm_log WHERE claim_id='${QA_ID}' AND row_data->>'dispatch'='dry_run'),
  'hist', (SELECT count(*) FROM public.claims_history WHERE claim_id='${QA_ID}' AND row_data->>'action' LIKE 'Dry Run%')
);
`));
const prev = onceAfter.job?.preview || {};
rec('once-completed', onceAfter.reminder_status === 'completed' && onceAfter.job?.status === 'dry_run_sent', JSON.stringify(onceAfter.job?.status));
rec('once-no-next-job', Number(onceAfter.pending_next) === 0, `pending=${onceAfter.pending_next}`);
rec('preview-to', prev.to === 'insurer-qa@example.com', `to=${prev.to}`);
rec('preview-subject', String(prev.subject || '').includes('QA-MAIL-1'), `subject=${prev.subject}`);
rec('preview-body', String(prev.body || '').includes('Dry Run once'), `body=${String(prev.body || '').slice(0, 80)}`);
rec('preview-attachments', Array.isArray(prev.attachments) && prev.attachments.some((a) => String(a.name || '').includes('שמאי')), JSON.stringify(prev.attachments));
rec('preview-kind-once', prev.kind === 'email_once', `kind=${prev.kind}`);
rec('preview-real-false', prev.realEmailSend === false, `realEmailSend=${prev.realEmailSend}`);
rec('history-and-comm', Number(onceAfter.comm) >= 1 && Number(onceAfter.hist) >= 1, JSON.stringify({ comm: onceAfter.comm, hist: onceAfter.hist }));

const repeatUpsert = extract(asAdminSelect(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id','${QA_ID}',
    'mail_to','repeat-qa@example.com',
    'mail_subject','מעקב חוזר QA',
    'mail_body','שלום, Dry Run repeat',
    'mail_kind','email_repeat',
    'repeat_every_days', 7,
    'attach_mode','none',
    'next_run_at', (now() - interval '1 minute')::text
  )) AS json_build_object
`));
const repeatId = repeatUpsert?.id;
const repeatDispatch = extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
const repeatAfter = extract(dbQuery(`
SELECT json_build_object(
  'reminder_status', (SELECT status FROM public.claims_reminders WHERE id = ${sqlLit(repeatId)}),
  'next_run', (SELECT next_run_at FROM public.claims_reminders WHERE id = ${sqlLit(repeatId)}),
  'pending', (SELECT count(*) FROM public.claims_mail_jobs WHERE reminder_id = ${sqlLit(repeatId)} AND status='pending'),
  'sent', (SELECT count(*) FROM public.claims_mail_jobs WHERE reminder_id = ${sqlLit(repeatId)} AND status='dry_run_sent'),
  'kind', (SELECT mail_kind FROM public.claims_reminders WHERE id = ${sqlLit(repeatId)})
);
`));
rec('repeat-dispatch', repeatDispatch?.realEmailSend === false && (repeatDispatch?.processed || 0) >= 1, JSON.stringify(repeatDispatch).slice(0, 300));
rec('repeat-still-scheduled', repeatAfter.reminder_status === 'scheduled' && repeatAfter.kind === 'email_repeat', JSON.stringify(repeatAfter));
rec('repeat-next-pending', Number(repeatAfter.pending) === 1 && Number(repeatAfter.sent) >= 1, JSON.stringify(repeatAfter));

const cancelUpsert = extract(asAdminSelect(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id','${QA_ID}',
    'mail_to','cancel-qa@example.com',
    'mail_subject','לביטול',
    'mail_body','לא אמור להישלח',
    'mail_kind','email_once',
    'attach_mode','none',
    'next_run_at', (now() + interval '2 days')::text
  )) AS json_build_object
`));
const cancelId = cancelUpsert?.id;
asAdminSelect(`public.claims_cancel_mail_followup(${sqlLit(cancelId)}) AS cancelled`);
const cancelAfter = extract(dbQuery(`
SELECT json_build_object(
  'rem', (SELECT status FROM public.claims_reminders WHERE id = ${sqlLit(cancelId)}),
  'jobs', (SELECT json_agg(status) FROM public.claims_mail_jobs WHERE reminder_id = ${sqlLit(cancelId)}),
  'hist', (SELECT count(*) FROM public.claims_history WHERE claim_id='${QA_ID}' AND row_data->>'action'='מעקב מייל בוטל')
);
`));
rec('cancel-status', cancelAfter.rem === 'cancelled', JSON.stringify(cancelAfter));
rec('cancel-jobs', Array.isArray(cancelAfter.jobs) && cancelAfter.jobs.every((s) => s === 'cancelled'), JSON.stringify(cancelAfter.jobs));
rec('cancel-history-kept', Number(cancelAfter.hist) >= 1, `hist=${cancelAfter.hist}`);
const cancelDispatch = extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
rec('cancel-not-sent', cancelDispatch?.realEmailSend === false, JSON.stringify(cancelDispatch));

const dup = extract(dbQuery(`
INSERT INTO public.claims_mail_jobs (id, reminder_id, claim_id, planned_at, status)
SELECT 'MJB-DUP-QA', reminder_id, '${QA_ID}', planned_at, 'pending'
FROM public.claims_mail_jobs WHERE reminder_id = ${sqlLit(onceId)} LIMIT 1
ON CONFLICT (reminder_id, planned_at) DO NOTHING;
SELECT json_build_object('inserted', (SELECT count(*) FROM public.claims_mail_jobs WHERE id='MJB-DUP-QA'));
`));
rec('duplicate-blocked', Number(dup.inserted) === 0, JSON.stringify(dup));

const badToTry = tryAdminSelect(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id','${QA_ID}',
    'mail_to','not-an-email',
    'mail_subject','bad',
    'mail_body','bad',
    'mail_kind','email_once',
    'next_run_at', now()::text
  )) AS json_build_object
`);
rec('invalid-to-rejected', !badToTry.ok && /invalid_to/.test(badToTry.error || ''), String(badToTry.error || JSON.stringify(badToTry.data)).slice(0, 300));

dbQuery(`UPDATE public.claims_records SET status='הסתיים' WHERE id='${QA_ID}';`);
const closedTry = tryAdminSelect(`
  public.claims_upsert_mail_followup(jsonb_build_object(
    'claim_id','${QA_ID}',
    'mail_to','closed-qa@example.com',
    'mail_subject','closed',
    'mail_body','closed',
    'mail_kind','email_once',
    'next_run_at', now()::text
  )) AS json_build_object
`);
rec('closed-upsert-rejected', !closedTry.ok && /closed_claim/.test(closedTry.error || ''), String(closedTry.error || JSON.stringify(closedTry.data)).slice(0, 300));

dbQuery(`
INSERT INTO public.claims_reminders (
  id, claim_id, action, mail_kind, mail_to, mail_subject, mail_body, attach_mode, next_run_at, status, created_by, row_data
) VALUES (
  'REM-QA-CLOSED-DISP','${QA_ID}','send_email','email_once','closed-disp@example.com','closed disp','x','none', now() - interval '1 minute','scheduled','${adminId}'::uuid,
  jsonb_build_object('owner','QA')
);
INSERT INTO public.claims_mail_jobs (id, reminder_id, claim_id, planned_at, status)
VALUES ('MJB-QA-CLOSED','REM-QA-CLOSED-DISP','${QA_ID}', now() - interval '1 minute','pending');
`);
const closedDisp = extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
const closedJob = extract(dbQuery(`
SELECT json_build_object(
  'status', (SELECT status FROM public.claims_mail_jobs WHERE id='MJB-QA-CLOSED'),
  'reason', (SELECT fail_reason FROM public.claims_mail_jobs WHERE id='MJB-QA-CLOSED')
);
`));
rec('closed-dispatch-failed', closedJob.status === 'failed' && closedJob.reason === 'closed_claim' && closedDisp?.realEmailSend === false, JSON.stringify(closedJob));

dbQuery(`UPDATE public.claims_records SET status='בטיפול' WHERE id='${QA_ID}';`);
dbQuery(`
INSERT INTO public.claims_reminders (
  id, claim_id, action, mail_kind, mail_to, mail_subject, mail_body, attach_mode, next_run_at, status, created_by, row_data
) VALUES (
  'REM-QA-BADTO-DISP','${QA_ID}','send_email','email_once','not-valid','bad','x','none', now() - interval '1 minute','scheduled','${adminId}'::uuid,
  jsonb_build_object('owner','QA')
);
INSERT INTO public.claims_mail_jobs (id, reminder_id, claim_id, planned_at, status)
VALUES ('MJB-QA-BADTO','REM-QA-BADTO-DISP','${QA_ID}', now() - interval '1 minute','pending');
`);
extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
const badJob = extract(dbQuery(`
SELECT json_build_object(
  'status', (SELECT status FROM public.claims_mail_jobs WHERE id='MJB-QA-BADTO'),
  'reason', (SELECT fail_reason FROM public.claims_mail_jobs WHERE id='MJB-QA-BADTO')
);
`));
rec('invalid-to-dispatch-failed', badJob.status === 'failed' && badJob.reason === 'invalid_to', JSON.stringify(badJob));

dbQuery(`UPDATE public.claims_config SET value='live' WHERE key='MAIL_DISPATCH_MODE';`);
const liveBlock = extract(dbQuery(`SELECT public.claims_mail_dispatch_now() AS json_build_object;`));
rec('live-blocked', liveBlock?.blocked === true && liveBlock?.realEmailSend === false, JSON.stringify(liveBlock));
dbQuery(`UPDATE public.claims_config SET value='dry_run' WHERE key='MAIL_DISPATCH_MODE';`);

const after = extract(dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'document_requests', (SELECT count(*) FROM public.document_requests),
  'profiles', (SELECT count(*) FROM public.profiles),
  'mode', (SELECT value FROM public.claims_config WHERE key='MAIL_DISPATCH_MODE')
);
`));
rec('baseline-vehicles', after.vehicles === before.vehicles, `${before.vehicles}→${after.vehicles}`);
rec('baseline-accidents', after.accidents === before.accidents, `${before.accidents}→${after.accidents}`);
rec('baseline-document-requests', after.document_requests === before.document_requests, `${before.document_requests}→${after.document_requests}`);
rec('mode-restored-dry-run', after.mode === 'dry_run', after.mode);

dbQuery(`DELETE FROM public.claims_records WHERE id = '${QA_ID}';`);
const cleaned = extract(dbQuery(`SELECT json_build_object('left', (SELECT count(*) FROM public.claims_records WHERE id='${QA_ID}'));`));
rec('qa-claim-cleaned', Number(cleaned.left) === 0, JSON.stringify(cleaned));

const summary = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  telemarketingTouched: false,
  accidentsTouched: false,
  oauthStarted: false,
  realEmailSend: false,
  gmailMailboxTouched: false,
  pass: tests.every((t) => t.ok),
  tests,
  preview: {
    to: prev.to || null,
    subject: prev.subject || null,
    body: prev.body || null,
    attachments: prev.attachments || null,
    kind: prev.kind || null,
    plannedAt: prev.plannedAt || null,
    definedBy: prev.definedBy || null,
    realEmailSend: prev.realEmailSend === false ? false : prev.realEmailSend,
  },
};
writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
if (!summary.pass) process.exit(1);
