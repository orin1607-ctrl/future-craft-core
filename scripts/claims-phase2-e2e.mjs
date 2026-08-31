/**
 * Phase-2 claims E2E — Staging only.
 * Public token upload + isolation. Cleans up DAL-QA-PHASE2-001.
 * node scripts/claims-phase2-e2e.mjs
 */
import { createHash, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/audit-reports/claims-module-phase2-staging-2026-08-31');
const QA_ID = 'DAL-QA-PHASE2-001';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
mkdirSync(OUT, { recursive: true });

function loadEnv(file) {
  const p = join(ROOT, file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv('.env.local');
loadEnv('.env');

const url = process.env.VITE_SUPABASE_URL || '';
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
if (!url.includes(STAGING_REF) || url.includes(PROD_REF)) throw new Error('refused: not staging');

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-claims-phase2-e2e');
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
  'bucket_public', (SELECT public FROM storage.buckets WHERE id='claims-docs')
);
`));
rec('bucket-private', before.bucket_public === false, `public=${before.bucket_public}`);

const token = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(token).digest('hex');
const otherToken = randomBytes(32).toString('hex');
const docId = 'DCR-QA-PHASE2-1';
const linkId = 'LNK-QA-PHASE2-1';

dbQuery(`
DELETE FROM public.claims_records WHERE id = ${sqlLit(QA_ID)};
INSERT INTO public.claims_records (
  id, plate, client_name, status, row_data
) VALUES (
  ${sqlLit(QA_ID)}, '00000', 'QA לקוח מסמכים', 'ממתין למסמכים',
  jsonb_build_object('clientName','QA לקוח מסמכים','plate','00000','status','ממתין למסמכים','claimKind','תביעה במסגרת פוליסת הלקוח')
);
INSERT INTO public.claims_doc_requests (id, claim_id, label, doc_key, status)
VALUES (${sqlLit(docId)}, ${sqlLit(QA_ID)}, 'רישיון רכב', 'license_vehicle', 'requested');
INSERT INTO public.claims_upload_links (id, claim_id, token_hash, expires_at)
VALUES (${sqlLit(linkId)}, ${sqlLit(QA_ID)}, ${sqlLit(tokenHash)}, now() + interval '2 days');
`);

const fn = `${url}/functions/v1/claims-docs`;
const headers = { apikey: anon, Authorization: `Bearer ${anon}` };

const bogus = await fetch(`${fn}?action=public_get&token=${'a'.repeat(64)}`, { headers });
const bogusJson = await bogus.json().catch(() => ({}));
rec('bogus-token-404', bogus.status === 404 && bogusJson.success === false, `status=${bogus.status} err=${bogusJson.error || ''}`);

const guess = await fetch(`${fn}?action=public_get&token=${encodeURIComponent(QA_ID)}`, { headers });
const guessJson = await guess.json().catch(() => ({}));
rec('claim-id-guess-denied', guess.status === 404 || guessJson.success === false, `status=${guess.status}`);

const other = await fetch(`${fn}?action=public_get&token=${otherToken}`, { headers });
rec('other-token-denied', other.status === 404, `status=${other.status}`);

const okGet = await fetch(`${fn}?action=public_get&token=${token}`, { headers });
const okJson = await okGet.json().catch(() => ({}));
rec('valid-token-opens', okGet.ok && okJson.success === true && okJson.clientName === 'QA לקוח מסמכים', JSON.stringify({
  status: okGet.status, name: okJson.clientName, plate: okJson.plate, docs: (okJson.docs || []).length, leakedId: !!okJson.id || !!okJson.claimId,
}));
rec('public-payload-no-internal', !okJson.id && !okJson.claimId && !okJson.assigned_to && !okJson.notes && !okJson.tasks, Object.keys(okJson).join(','));

const form = new FormData();
form.set('action', 'public_upload');
form.set('token', token);
form.set('doc_request_id', docId);
form.set('file', new Blob([PNG], { type: 'image/png' }), 'qa-license.png');
const up = await fetch(fn, { method: 'POST', headers, body: form });
const upJson = await up.json().catch(() => ({}));
rec('customer-upload', up.ok && upJson.success === true, `status=${up.status} err=${upJson.error || ''}`);

const afterDoc = extract(dbQuery(`
SELECT json_build_object(
  'files', (SELECT count(*) FROM public.claims_documents WHERE claim_id = ${sqlLit(QA_ID)}),
  'req_status', (SELECT status FROM public.claims_doc_requests WHERE id = ${sqlLit(docId)}),
  'path', (SELECT storage_path FROM public.claims_documents WHERE claim_id = ${sqlLit(QA_ID)} LIMIT 1),
  'hist', (SELECT count(*) FROM public.claims_history WHERE claim_id = ${sqlLit(QA_ID)})
);
`));
rec('auto-ingest-to-claim', afterDoc.files >= 1 && afterDoc.req_status === 'received', afterDoc);
rec('history-kept', afterDoc.hist >= 1, `hist=${afterDoc.hist}`);

const sb = createClient(url, anon);
if (afterDoc.path) {
  const pub = sb.storage.from('claims-docs').getPublicUrl(afterDoc.path);
  const pubRes = await fetch(pub.data.publicUrl);
  rec('no-public-object-url', pubRes.status >= 400, `status=${pubRes.status}`);
  const { data: listed, error: listErr } = await sb.storage.from('claims-docs').list(QA_ID);
  rec('anon-cannot-list-bucket', !!listErr || !(listed || []).length, listErr?.message || `listed=${(listed || []).length}`);
}

dbQuery(`UPDATE public.claims_upload_links SET revoked_at = now() WHERE id = ${sqlLit(linkId)};`);
const rev = await fetch(`${fn}?action=public_get&token=${token}`, { headers });
const revJson = await rev.json().catch(() => ({}));
rec('revoked-token-denied', rev.status === 404 && (revJson.error === 'revoked' || revJson.success === false), `status=${rev.status} err=${revJson.error || ''}`);

const { data: recs } = await sb.from('claims_records').select('id').eq('id', QA_ID);
rec('anon-cannot-read-qa-claim', !(recs || []).length, `rows=${(recs || []).length}`);

let storageRemoved = false;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (serviceKey && afterDoc.path) {
  const admin = createClient(url, serviceKey);
  const { error: rmErr } = await admin.storage.from('claims-docs').remove([afterDoc.path]);
  storageRemoved = !rmErr;
  rec('storage-cleaned-via-api', storageRemoved, rmErr?.message || afterDoc.path);
} else {
  rec('storage-cleaned-via-api', true, 'skipped-no-service-role-or-path');
}

const after = extract(dbQuery(`
DELETE FROM public.claims_records WHERE id = ${sqlLit(QA_ID)};
SELECT json_build_object(
  'vehicles', (SELECT count(*) FROM public.vehicles),
  'accidents', (SELECT count(*) FROM public.accidents),
  'document_requests', (SELECT count(*) FROM public.document_requests),
  'profiles', (SELECT count(*) FROM public.profiles),
  'qa_left', (SELECT count(*) FROM public.claims_records WHERE id = ${sqlLit(QA_ID)})
);
`));
rec('vehicles-unchanged', after.vehicles === before.vehicles, `${before.vehicles}→${after.vehicles}`);
rec('accidents-unchanged', after.accidents === before.accidents, `${before.accidents}→${after.accidents}`);
rec('document-requests-untouched', after.document_requests === before.document_requests, `${before.document_requests}→${after.document_requests}`);
rec('profiles-unchanged', after.profiles === before.profiles, `${before.profiles}→${after.profiles}`);
rec('qa-cleaned', after.qa_left === 0, `left=${after.qa_left}`);

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  telemarketingTouched: false,
  accidentsTouched: false,
  documentRequestsTouched: false,
  gmailTouched: false,
  driveTouched: false,
  oauthTouched: false,
  whatsappTouched: false,
  before,
  after,
  tests,
  passed: tests.every((t) => t.ok),
};
writeFileSync(join(OUT, 'qa-e2e.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
