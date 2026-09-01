/**
 * Read-only Staging audit: claims documents vs restore point.
 * Paginates DB (Supabase default 1000). Does not mutate.
 * node scripts/claims-docs-full-audit.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BUCKET = 'claims-docs';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-docs-display-audit-2026-09-01');
mkdirSync(OUT, { recursive: true });
const before = JSON.parse(readFileSync(join(process.cwd(), 'docs/audit-reports/claims-fill-certain-missing-2026-09-01/RESTORE-POINT.json'), 'utf8'));
const REAL = Object.keys(before.byClaim);

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

async function pageAll(table, cols) {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await admin.from(table).select(cols).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return rows;
}

const docs = await pageAll(
  'claims_documents',
  'id, claim_id, original_name, mime_type, source, doc_kind, storage_path, gmail_message_id, gmail_thread_id, content_sha256',
);
const imps = await pageAll(
  'claims_gmail_imports',
  'id, claim_id, gmail_message_id, gmail_thread_id',
);
const { count: vehicles } = await admin.from('vehicles').select('id', { count: 'exact', head: true });
const { count: accidents } = await admin.from('accidents').select('id', { count: 'exact', head: true });
const { count: totalDocsHead } = await admin.from('claims_documents').select('id', { count: 'exact', head: true });
const { count: totalImpHead } = await admin.from('claims_gmail_imports').select('id', { count: 'exact', head: true });

const by = {};
for (const id of REAL) by[id] = { docs: [], imps: [] };
for (const r of docs) {
  if (!by[r.claim_id]) by[r.claim_id] = { docs: [], imps: [] };
  by[r.claim_id].docs.push(r);
}
for (const r of imps) {
  if (!by[r.claim_id]) by[r.claim_id] = { docs: [], imps: [] };
  by[r.claim_id].imps.push(r);
}

function kindsOf(rows) {
  return rows.reduce((a, r) => {
    const k = r.doc_kind || '(null)';
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {});
}
function isImg(r) {
  return String(r.mime_type || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|tiff?)$/i.test(String(r.original_name || ''));
}

const table = REAL.map((id) => {
  const rows = by[id]?.docs || [];
  const kinds = kindsOf(rows);
  return {
    id,
    beforeDocs: before.byClaim[id].docs,
    nowDocs: rows.length,
    deltaDocs: rows.length - before.byClaim[id].docs,
    beforeImp: before.byClaim[id].imports,
    nowImp: (by[id]?.imps || []).length,
    deltaImp: (by[id]?.imps || []).length - before.byClaim[id].imports,
    images: rows.filter(isImg).length,
    surveyor_report: kinds.surveyor_report || 0,
    surveyor_photo: kinds.surveyor_photo || 0,
    surveyor_attachment: kinds.surveyor_attachment || 0,
    general: kinds.general || 0,
    garage_invoice: kinds.garage_invoice || 0,
    kinds,
    src: rows.reduce((a, r) => { a[r.source || '(null)'] = (a[r.source || '(null)'] || 0) + 1; return a; }, {}),
    noPath: rows.filter((r) => !r.storage_path).length,
  };
});

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saUser.data.user.email });
const { data: auth } = await client.auth.verifyOtp({ email: saUser.data.user.email, token: linkData.properties.email_otp, type: 'email' });

async function listDocs(id) {
  const res = await fetch(`${STAGING_URL}/functions/v1/claims-docs`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list_docs', claim_id: id }),
  });
  const json = await res.json().catch(() => ({}));
  const files = Array.isArray(json.files) ? json.files : [];
  return {
    status: res.status,
    success: json.success,
    error: json.error || null,
    files: files.length,
    requests: Array.isArray(json.requests) ? json.requests.length : null,
    kinds: kindsOf(files),
    images: files.filter(isImg).length,
    matchDb: files.length === (by[id]?.docs || []).length,
  };
}

const api = {};
for (const id of REAL) api[id] = await listDocs(id);

async function signedAndStorage(id) {
  const rows = by[id]?.docs || [];
  if (!rows.length) return { id, empty: true };
  const sample = [
    rows.find((r) => r.doc_kind === 'surveyor_report'),
    rows.find((r) => r.doc_kind === 'surveyor_photo' || isImg(r)),
    rows.find((r) => r.doc_kind === 'general' && !isImg(r)) || rows.find((r) => r.doc_kind === 'general'),
  ].filter(Boolean);
  const uniq = [...new Map(sample.map((r) => [r.id, r])).values()].slice(0, 3);
  const checks = [];
  for (const f of uniq) {
    const listed = await admin.storage.from(BUCKET).list(f.storage_path.split('/').slice(0, -1).join('/'), { search: f.storage_path.split('/').pop() });
    const name = f.storage_path.split('/').pop();
    const exists = (listed.data || []).some((x) => x.name === name);
    const dl = await admin.storage.from(BUCKET).download(f.storage_path);
    const signRes = await fetch(`${STAGING_URL}/functions/v1/claims-docs`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signed_url', claim_id: id, file_id: f.id }),
    });
    const signJson = await signRes.json().catch(() => ({}));
    let http = null;
    if (signJson.url) {
      const head = await fetch(signJson.url, { method: 'GET' });
      http = { status: head.status, type: head.headers.get('content-type'), bytes: Number(head.headers.get('content-length') || 0) };
    }
    checks.push({
      file_id: f.id,
      name: f.original_name,
      kind: f.doc_kind,
      storageListed: exists,
      storageDownload: !dl.error,
      downloadErr: dl.error?.message || null,
      signedStatus: signRes.status,
      signedOk: Boolean(signJson.url) && signJson.success !== false,
      fetch: http,
    });
  }
  return { id, checks };
}

const storage = {};
for (const id of ['DAL-2026-0004', 'DAL-2026-0005', 'DAL-2026-0008', 'DAL-2026-0009', 'DAL-2026-0016', 'DAL-2026-0017']) {
  storage[id] = await signedAndStorage(id);
}

const msgMap = new Map();
for (const r of docs) {
  if (!r.gmail_message_id) continue;
  const arr = msgMap.get(r.gmail_message_id) || [];
  arr.push(r.claim_id);
  msgMap.set(r.gmail_message_id, arr);
}
const crossClaim = [...msgMap.entries()]
  .map(([mid, ids]) => ({ mid, claims: [...new Set(ids)] }))
  .filter((x) => x.claims.length > 1);

const extra = Object.keys(by)
  .filter((id) => !REAL.includes(id))
  .map((id) => ({ id, docs: by[id].docs.length, imps: by[id].imps.length, kinds: kindsOf(by[id].docs) }));

const hashDup = new Map();
for (const r of docs) {
  if (!r.content_sha256) continue;
  const k = `${r.claim_id}:${r.content_sha256}`;
  hashDup.set(k, (hashDup.get(k) || 0) + 1);
}
const intraClaimHashDups = [...hashDup.entries()].filter(([, n]) => n > 1).length;

const out = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  mutated: false,
  vehicles,
  accidents,
  totalDocsHead,
  totalDocsPaged: docs.length,
  totalImpHead,
  totalImpPaged: imps.length,
  beforeDocs: before.docs,
  beforeImp: before.imports,
  table,
  api,
  storage,
  extra,
  drops: table.filter((t) => t.deltaDocs < 0),
  apiMismatch: REAL.filter((id) => api[id].matchDb === false),
  crossClaimGmail: crossClaim.slice(0, 20),
  crossClaimCount: crossClaim.length,
  intraClaimHashDups,
  pagedEqualsHead: docs.length === totalDocsHead && imps.length === totalImpHead,
};
writeFileSync(join(OUT, 'full-audit.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({
  vehicles,
  accidents,
  totalDocsHead,
  totalDocsPaged: docs.length,
  beforeDocs: before.docs,
  drops: out.drops,
  apiMismatch: out.apiMismatch,
  crossClaimCount: out.crossClaimCount,
  intraClaimHashDups,
  table: table.map((t) => ({
    id: t.id,
    before: t.beforeDocs,
    now: t.nowDocs,
    d: t.deltaDocs,
    imp: `${t.beforeImp}->${t.nowImp}`,
    photo: t.surveyor_photo,
    report: t.surveyor_report,
    att: t.surveyor_attachment,
    general: t.general,
    img: t.images,
    api: api[t.id]?.files,
  })),
  extra,
  storageOk: Object.fromEntries(Object.entries(storage).map(([id, s]) => [id, (s.checks || []).every((c) => c.storageDownload && c.signedOk && c.fetch?.status === 200)])),
}, null, 2));
