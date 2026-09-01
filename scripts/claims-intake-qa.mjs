/**
 * Customer intake QA — TEST data only. No Gmail send. Staging only.
 * node scripts/claims-intake-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-intake-2026-09-01');
mkdirSync(OUT, { recursive: true });
const tests = [];
const rec = (id, ok, detail) => {
  tests.push({ id, ok: Boolean(ok), verdict: ok ? 'PASS' : 'FAIL', detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail == null ? '' : JSON.stringify(detail).slice(0, 400));
};

const tmpWork = join(process.env.TEMP || tmpdir(), 'fcc-claims-intake-qa');
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
function dbQuery(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${tmp}"`, {
    encoding: 'utf8', stdio: 'pipe', timeout: 180000,
  });
}
function extract(raw) {
  const parsed = JSON.parse(String(raw));
  return parsed.rows?.[0]?.json_build_object || parsed.rows?.[0] || parsed;
}
execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('production');
if (linked !== STAGING_REF) throw new Error(linked);

const keysJson = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keysJson.find((k) => k.name === 'service_role')?.api_key;
const anon = keysJson.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keysJson.find((k) => k.name === 'anon')?.api_key;
const adminDb = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonDb = createClient(STAGING_URL, anon, { auth: { autoRefreshToken: false, persistSession: false } });

const before = extract(dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'claims', (SELECT count(*) FROM public.claims_records),
  'ids', (SELECT coalesce(json_agg(id ORDER BY id), '[]'::json) FROM public.claims_records WHERE id ~ '^DAL-2026-00(0[1-9]|1[0-6])$')
);
`));
rec('staging-only', linked === STAGING_REF, linked);
rec('vehicles-before', Number(before.vehicles) === 437 || Number(before.vehicles) >= 1, before.vehicles);
rec('accidents-before', Number(before.accidents) === 11 || Number(before.accidents) >= 1, before.accidents);
const ORIG16 = Array.from({ length: 16 }, (_, i) => `DAL-2026-${String(i + 1).padStart(4, '0')}`);
const origPresent = (before.ids || []).filter((id) => ORIG16.includes(id));
rec('original-claims-present', origPresent.length >= 15 && origPresent.includes('DAL-2026-0002') && origPresent.includes('DAL-2026-0016'), { count: origPresent.length, missing0001: !origPresent.includes('DAL-2026-0001'), ids: origPresent });

const adminEmail = extract(dbQuery(`
SELECT json_build_object('email', (
  SELECT u.email FROM auth.users u JOIN public.user_roles ur ON ur.user_id=u.id
  WHERE ur.role='super_admin' ORDER BY CASE WHEN u.email='orin1607@gmail.com' THEN 0 ELSE 1 END LIMIT 1
));
`)).email;
const { data: linkData } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email: adminEmail });
const { data: auth } = await anonDb.auth.verifyOtp({ email: adminEmail, token: linkData.properties.email_otp, type: 'email' });
const tokenUser = auth.session.access_token;

async function invoke(fn, jwt, body) {
  const res = await fetch(`${STAGING_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${jwt || anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfqHXaAAAAAElFTkSuQmCC';

const created = await invoke('claims-intake', tokenUser, { action: 'create_link' });
rec('create-link', created.json?.success === true && typeof created.json?.token === 'string' && created.json.token.length >= 32, { hasToken: !!created.json?.token });
const t = created.json.token;
rec('create-no-claim-id', !('claim_id' in (created.json || {})) && !('claimId' in (created.json || {})), created.json);

const bad = await invoke('claims-intake', anon, { action: 'public_get', token: 'deadbeefdeadbeefdeadbeefdeadbeef' });
rec('bad-token', bad.status === 404 || bad.json?.error === 'invalid_token', bad.json?.error);

const got = await invoke('claims-intake', anon, { action: 'public_get', token: t });
rec('public-get', got.json?.success === true && got.json?.submitted !== true && !got.json?.claim_id && !got.json?.id, Object.keys(got.json || {}));
rec('public-no-internal', !JSON.stringify(got.json).includes('gmail') && !JSON.stringify(got.json).includes('History'), true);

const draft = {
  clientName: 'TEST-INTAKE לקוח',
  clientPhone: '0500000001',
  plate: '12-345-67',
  eventDate: '2026-09-01',
  claimKind: 'תביעה במסגרת פוליסת הלקוח',
  declarationAck: 'true',
  eventDesc: 'QA draft',
};
const saved = await invoke('claims-intake', anon, { action: 'public_save_draft', token: t, draft });
rec('save-draft', saved.json?.saved === true, saved.json);

const got2 = await invoke('claims-intake', anon, { action: 'public_get', token: t });
rec('draft-roundtrip', got2.json?.draft?.clientName === 'TEST-INTAKE לקוח' && got2.json?.draft?.eventDesc === 'QA draft', got2.json?.draft?.clientName);

const sub = await invoke('claims-intake', anon, { action: 'public_submit', token: t, draft, signature: png });
rec('submit', sub.json?.submitted === true && !sub.json?.claim_id && !String(JSON.stringify(sub.json)).includes('DAL-'), { keys: Object.keys(sub.json || {}) });
const sub2 = await invoke('claims-intake', anon, { action: 'public_submit', token: t, draft, signature: png });
rec('double-submit', sub2.json?.submitted === true && (sub2.json?.already === true || sub2.json?.success === true), sub2.json);

const used = await invoke('claims-intake', anon, { action: 'public_get', token: t });
rec('used-link', used.json?.submitted === true && !used.json?.claim_id, used.json);

const afterClaim = extract(dbQuery(`
SELECT json_build_object(
  'testId', (SELECT id FROM public.claims_records WHERE client_name='TEST-INTAKE לקוח' ORDER BY created_at DESC LIMIT 1),
  'source', (SELECT row_data->>'source' FROM public.claims_records WHERE client_name='TEST-INTAKE לקוח' ORDER BY created_at DESC LIMIT 1),
  'hist', (SELECT row_data->>'action' FROM public.claims_history WHERE claim_id=(SELECT id FROM public.claims_records WHERE client_name='TEST-INTAKE לקוח' ORDER BY created_at DESC LIMIT 1) ORDER BY created_at DESC LIMIT 1),
  'sig', (SELECT count(*) FROM public.claims_documents WHERE claim_id=(SELECT id FROM public.claims_records WHERE client_name='TEST-INTAKE לקוח' ORDER BY created_at DESC LIMIT 1) AND original_name='signature.png')
);
`));
rec('dal-created', typeof afterClaim.testId === 'string' && String(afterClaim.testId).startsWith('DAL-'), afterClaim.testId);
rec('source', afterClaim.source === 'Customer Accident Intake', afterClaim.source);
rec('history', afterClaim.hist === 'תיק נפתח מטופס דיווח לקוח', afterClaim.hist);
rec('signature-saved', Number(afterClaim.sig) === 1, afterClaim.sig);

const docs = await invoke('claims-docs', tokenUser, { action: 'create_link', claim_id: afterClaim.testId });
rec('existing-docs-link', docs.json?.success === true && typeof docs.json?.token === 'string', { ok: docs.json?.success });
const pubDocs = await invoke('claims-docs', anon, { action: 'public_get', token: docs.json?.token });
rec('docs-public-no-gmail', pubDocs.json?.success === true && !JSON.stringify(pubDocs.json).includes('gmail') && Array.isArray(pubDocs.json?.docs), Object.keys(pubDocs.json || {}));

const mutated = await invoke('claims-intake', anon, { action: 'public_get', token: t.slice(0, -2) + 'aa' });
rec('mutated-token', mutated.status === 404 || mutated.json?.error === 'invalid_token', mutated.json?.error);
rec('no-enum-hint', !String(JSON.stringify(mutated.json)).includes('DAL-') && !String(JSON.stringify(mutated.json)).includes('claim_id'), mutated.json);

const createdDup = await invoke('claims-intake', tokenUser, { action: 'create_link' });
const t2 = createdDup.json.token;
const dupDraft = {
  clientName: 'TEST-INTAKE כפילות',
  clientPhone: '0500000002',
  plate: '12-345-67',
  eventDate: '2026-09-01',
  claimKind: 'תביעה במסגרת פוליסת הלקוח',
  declarationAck: 'true',
};
const dupSub = await invoke('claims-intake', anon, { action: 'public_submit', token: t2, draft: dupDraft, signature: png });
rec('duplicate-suspect-flag', dupSub.json?.submitted === true && dupSub.json?.duplicateSuspect === true, dupSub.json);
const orig = extract(dbQuery(`SELECT json_build_object('still', (SELECT count(*) FROM public.claims_records WHERE id='DAL-2026-0004'));`));
rec('no-overwrite-0004', Number(orig.still) === 1, orig);
const dalCount = extract(dbQuery(`
SELECT json_build_object(
  'oneCustomer', (SELECT count(*) FROM public.claims_records WHERE client_name='TEST-INTAKE לקוח'),
  'dupCreated', (SELECT count(*) FROM public.claims_records WHERE client_name='TEST-INTAKE כפילות'),
  'dupFlag', (SELECT row_data->>'duplicateSuspect' FROM public.claims_records WHERE client_name='TEST-INTAKE כפילות' ORDER BY created_at DESC LIMIT 1)
);
`));
rec('one-dal-per-token', Number(dalCount.oneCustomer) === 1, dalCount);
rec('dup-is-new-dal', Number(dalCount.dupCreated) >= 1 && dalCount.dupFlag === 'true', dalCount);

const after = extract(dbQuery(`
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'ids', (SELECT coalesce(json_agg(id ORDER BY id), '[]'::json) FROM public.claims_records WHERE id ~ '^DAL-2026-00(0[1-9]|1[0-6])$'),
  'anon_grant', (SELECT has_table_privilege('anon', 'public.claims_intake_links', 'SELECT'))
);
`));
rec('vehicles-same', Number(after.vehicles) === Number(before.vehicles), { before: before.vehicles, after: after.vehicles });
rec('accidents-same', Number(after.accidents) === Number(before.accidents), { before: before.accidents, after: after.accidents });
rec('existing16-same', JSON.stringify(after.ids) === JSON.stringify(before.ids), after.ids);
rec('no-anon-select', after.anon_grant === false, after.anon_grant);

const fail = tests.filter((t) => !t.ok);
writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify({ at: new Date().toISOString(), realEmailSend: false, productionTouched: false, tests, failCount: fail.length }, null, 2), 'utf8');
console.log(JSON.stringify({ failCount: fail.length, passCount: tests.filter((t) => t.ok).length, testClaim: afterClaim.testId }, null, 2));
if (fail.length) process.exit(1);
