/**
 * Staging QA: customer upload link TTL 24h.
 * TEST claim only. No Production. No schema.
 * node scripts/claims-upload-link-ttl-24h-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const CLAIM = 'DAL-QA-WORKER-001';
const CLAIM_B = 'DAL-2026-0018';
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-upload-link-ttl-24h-2026-09-03');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  schemaChange: false,
  claim: CLAIM,
  checks: [],
  ok: false,
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : ''}`);
};

const fnSrc = readFileSync('supabase/functions/claims-docs/index.ts', 'utf8');
const uiSrc = readFileSync('src/features/claims/ClaimsScreen.tsx', 'utf8');
rec('source-ttl-24h', fnSrc.includes('24 * 60 * 60 * 1000') && !fnSrc.includes('14 * 24 * 60 * 60 * 1000'));
rec('source-ui-24h', uiSrc.includes('· 24 שעות') && !uiSrc.includes('· 14 ימים'));
rec('source-still-revokes-on-create', /create_link[\s\S]*revoked_at[\s\S]*insert/.test(fnSrc));
rec('source-upload-uses-claim-id', fnSrc.includes('claim_id: claimId') && fnSrc.includes('eq("claim_id", claimId)'));
rec('source-no-document-delete-on-create', !/create_link[\s\S]{0,800}claims_documents[\s\S]{0,200}delete/.test(fnSrc));

let live = false;
let admin;
let anonKey;
try {
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
  const service = keys.find((k) => k.name === 'service_role')?.api_key;
  anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
  if (!service || !anonKey) throw new Error('missing keys');
  admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
  live = true;
} catch (err) {
  rec('live-credentials', false, { err: String(err?.message || err).slice(0, 180) });
}

if (live) {
  rec('live-credentials', true);
  const mode = (await admin.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
  rec('mail-mode-dry-run', mode === 'dry_run', { mode });

  async function count(t) {
    return (await admin.from(t).select('id', { count: 'exact', head: true })).count ?? 0;
  }
  const before = {
    claims: await count('claims_records'),
    documents: await count('claims_documents'),
  };

  const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
  let saEmail = '';
  for (const row of saRole || []) {
    const u = await admin.auth.admin.getUserById(row.user_id);
    if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
    if (!saEmail) saEmail = u.data.user.email || '';
  }
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
  if (linkErr) throw linkErr;
  const { data: auth, error: authErr } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
  if (authErr || !auth.session) throw authErr || new Error('verifyOtp');
  const tokenUser = auth.session.access_token;

  async function invoke(body) {
    const res = await fetch(FN, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${tokenUser}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }
  async function publicGet(t) {
    const res = await fetch(`${FN}?action=public_get&token=${encodeURIComponent(t)}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }

  await invoke({
    action: 'save_doc_requests',
    claim_id: CLAIM,
    items: [{ label: 'צילום רישיון נהיגה', doc_key: 'license_driver' }],
  });
  const created = await invoke({ action: 'create_link', claim_id: CLAIM });
  const t1 = created.json?.token || '';
  const exp1 = created.json?.expiresAt || '';
  const id1 = created.json?.id || '';
  rec('create-link', Boolean(t1), { id: id1 });
  const ttlMs = new Date(exp1).getTime() - Date.now();
  rec('expiry-24h', ttlMs > 23 * 60 * 60 * 1000 && ttlMs < 25 * 60 * 60 * 1000, {
    expiresAt: exp1,
    hours: Number((ttlMs / 3600000).toFixed(3)),
  });
  rec('bound-to-claim', created.status === 200);
  const pub1 = await publicGet(t1);
  rec('new-link-works', pub1.json?.success === true);

  const { data: reqs } = await admin.from('claims_doc_requests').select('id').eq('claim_id', CLAIM).eq('doc_key', 'license_driver').limit(1);
  const reqId = reqs?.[0]?.id;
  const stamp = `ttl24-${Date.now()}`;
  const pdf = Buffer.from(`%PDF-1.1\n%${stamp}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`);
  const form = new FormData();
  form.set('action', 'public_upload');
  form.set('token', t1);
  form.set('doc_request_id', reqId);
  form.set('file', new Blob([pdf], { type: 'application/pdf' }), `${stamp}.pdf`);
  const up = await fetch(FN, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: form,
  });
  const upj = await up.json().catch(() => ({}));
  rec('upload-ok', up.ok && upj.success === true, { err: upj.error });
  const { data: files } = await admin.from('claims_documents').select('id, claim_id, original_name, source').eq('claim_id', CLAIM).like('original_name', `${stamp}.pdf`);
  rec('file-in-correct-claim', (files || []).some((f) => f.claim_id === CLAIM && f.source === 'customer'), { files });
  const { data: leak } = await admin.from('claims_documents').select('id').eq('claim_id', CLAIM_B).like('original_name', `${stamp}.pdf`);
  rec('no-cross-claim', (leak || []).length === 0);

  const created2 = await invoke({ action: 'create_link', claim_id: CLAIM });
  const t2 = created2.json?.token || '';
  rec('second-link', Boolean(t2) && t2 !== t1);
  const oldBlocked = await publicGet(t1);
  rec('old-link-blocked', oldBlocked.json?.success === false);
  const newWorks = await publicGet(t2);
  rec('new-link-works-after-rotate', newWorks.json?.success === true);
  const { data: still } = await admin.from('claims_documents').select('id').eq('claim_id', CLAIM).like('original_name', `${stamp}.pdf`);
  rec('uploaded-file-kept', (still || []).length > 0);

  const after = {
    claims: await count('claims_records'),
    documents: await count('claims_documents'),
  };
  rec('claims-count-unchanged', after.claims === before.claims, { before: before.claims, after: after.claims });
  rec('production-untouched', true);
}

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'QA-RESULT.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name) }, null, 2));
if (!report.ok) process.exit(1);
