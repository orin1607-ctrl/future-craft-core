import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import crypto from 'crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceRoleKey = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  console.log('=== E2E LIVE STAGING VERIFICATION: AUTHENTIC POA & TEMPLATE GALLERY ===\n');

  // Test 1: Verify authentic POA in storage
  console.log('Test 1: Verifying authentic POA in storage...');
  const { data: poaBytes, error: dlErr } = await admin.storage.from('claims-docs').download('templates/power_of_attorney/dani-poa-nov23.pdf');
  if (dlErr || !poaBytes) throw new Error(`Failed to download authentic POA from storage: ${dlErr?.message}`);
  const buf = Buffer.from(await poaBytes.arrayBuffer());
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  console.log(`[PASS] Authentic POA downloaded: ${buf.length} bytes, SHA256: ${sha}`);
  if (buf.length !== 125867) throw new Error(`POA byte length mismatch! Expected 125867, got ${buf.length}`);
  if (sha !== 'dfd7e6a9e0f3db7dc2ec31770e5875554e2894fca115e46e9c748ba172db43c2') throw new Error(`POA SHA256 mismatch!`);

  // Test 2: Verify claims_templates DB entry
  console.log('\nTest 2: Verifying claims_templates DB entry for authentic POA...');
  const { data: tpls, error: tErr } = await admin.from('claims_templates').select('*').eq('form_key', 'power_of_attorney');
  if (tErr || !tpls || tpls.length === 0) throw new Error(`claims_templates POA entry not found: ${tErr?.message}`);
  console.log('[PASS] claims_templates entry found:', {
    id: tpls[0].id,
    name: tpls[0].name,
    storage_path: tpls[0].storage_path,
    byte_size: tpls[0].byte_size,
    is_permanent: tpls[0].is_permanent,
  });

  // Test 3: Test claims-docs list_templates API
  console.log('\nTest 3: Testing claims-docs list_templates endpoint...');
  const listRes = await fetch(`${STAGING_URL}/functions/v1/claims-docs?action=list_templates`, {
    headers: { apikey: anonKey },
  });
  const listJson = await listRes.json();
  if (!listRes.ok || !listJson.success || !Array.isArray(listJson.templates)) {
    throw new Error(`list_templates failed: ${JSON.stringify(listJson)}`);
  }
  const hasPoa = listJson.templates.some((t) => t.name === 'ייפוי כוח' || t.form_key === 'power_of_attorney');
  console.log(`[PASS] list_templates returned ${listJson.templates.length} templates, hasPoa: ${hasPoa}`);
  if (!hasPoa) throw new Error('list_templates did not return authentic POA');

  // Test 4: Create a new test claim and prepare onboarding package with ייפוי כוח
  console.log('\nTest 4: Creating test claim and testing prepare package with authentic POA...');
  const testClaimId = `DAL-E2E-${Date.now().toString().slice(-6)}`;
  const { error: insErr } = await admin.from('claims_records').insert({
    id: testClaimId,
    client_name: 'ישראל ישראלי (בדיקת ייפוי כוח מקורי)',
    plate: '88-999-00',
    status: 'חדש',
    row_data: { id: testClaimId, clientName: 'ישראל ישראלי', plate: '88-999-00' },
  });
  if (insErr) throw new Error(`claims_records insert failed: ${insErr.message}`);

  // Create doc request for ייפוי כוח
  const dcrId = `DCR-${Date.now()}`;
  const { error: dcrErr } = await admin.from('claims_doc_requests').insert({
    id: dcrId,
    claim_id: testClaimId,
    label: 'ייפוי כוח',
    doc_key: 'power_of_attorney',
    status: 'requested',
  });
  if (dcrErr) console.error('claims_doc_requests insert error:', dcrErr);

  // Create upload link
  const linkId = `LNK-${Date.now()}`;
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { error: linkErr } = await admin.from('claims_upload_links').insert({
    id: linkId,
    claim_id: testClaimId,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });
  if (linkErr) console.error('claims_upload_links insert error:', linkErr);
  const { data: checkLink } = await admin.from('claims_upload_links').select('*').eq('id', linkId);
  console.log('Inserted link row in DB:', checkLink);

  // Call claims-docs public_get to see what customer receives
  console.log('\nTest 5: Calling public_get for customer documents screen...');
  const getRes = await fetch(`${STAGING_URL}/functions/v1/claims-docs?action=public_get&token=${token}`);
  const getJson = await getRes.json();
  if (!getRes.ok || !getJson.success) throw new Error(`public_get failed: ${JSON.stringify(getJson)}`);
  console.log('public_get returned docs:', getJson.docs);

  const poaDoc = getJson.docs.find((d) => d.id === dcrId);
  console.log('[PASS] public_get doc found:', {
    id: poaDoc.id,
    label: poaDoc.label,
    isForm: poaDoc.isForm,
    formDownload: poaDoc.formDownload,
    formFileName: poaDoc.formFileName,
    hasDownloadUrl: Boolean(poaDoc.formDownloadUrl),
  });

  if (!poaDoc.formDownloadUrl) throw new Error('poaDoc.formDownloadUrl is missing!');

  // Test 6: Download the file from formDownloadUrl and verify it is Dani's authentic POA
  console.log('\nTest 6: Downloading file from customer formDownloadUrl...');
  const fileRes = await fetch(poaDoc.formDownloadUrl);
  if (!fileRes.ok) throw new Error(`Failed to fetch formDownloadUrl: HTTP ${fileRes.status}`);
  const downloadedBytes = Buffer.from(await fileRes.arrayBuffer());
  const downloadedSha = crypto.createHash('sha256').update(downloadedBytes).digest('hex');
  console.log(`[PASS] Customer downloaded file size: ${downloadedBytes.length} bytes (Expected: 125867)`);
  console.log(`[PASS] Customer downloaded file SHA256: ${downloadedSha}`);
  if (downloadedBytes.length !== 125867) {
    throw new Error(`Customer received ALTERNATIVE/DUMMY form instead of authentic POA! Size was ${downloadedBytes.length}`);
  }
  if (downloadedSha !== 'dfd7e6a9e0f3db7dc2ec31770e5875554e2894fca115e46e9c748ba172db43c2') {
    throw new Error('Downloaded file hash does not match authentic POA!');
  }

  // Test 7: Customer uploads signed POA
  console.log('\nTest 7: Customer uploads filled & signed POA...');
  const signedFakeBytes = Buffer.from('%PDF-1.4 Fake Customer Signed POA Content ' + Date.now());
  const formData = new FormData();
  formData.set('token', token);
  formData.set('doc_request_id', dcrId);
  const blob = new Blob([signedFakeBytes], { type: 'application/pdf' });
  formData.set('file', blob, 'poa-signed-by-israel.pdf');

  const upRes = await fetch(`${STAGING_URL}/functions/v1/claims-docs?action=public_upload`, {
    method: 'POST',
    body: formData,
  });
  const upJson = await upRes.json();
  if (!upRes.ok || !upJson.success) throw new Error(`Customer upload failed: ${JSON.stringify(upJson)}`);
  console.log('[PASS] Customer upload successful:', upJson);

  // Verify that signed document is saved in claims_documents for this claim with source='customer'
  const { data: savedSigned } = await admin
    .from('claims_documents')
    .select('*')
    .eq('claim_id', testClaimId)
    .eq('source', 'customer');

  console.log('[PASS] Customer signed document saved in case:', savedSigned?.map((s) => ({
    id: s.id,
    original_name: s.original_name,
    source: s.source,
    doc_meta: s.doc_meta,
  })));

  if (!savedSigned || savedSigned.length === 0) throw new Error('Signed document was not found in claims_documents!');

  // Verify strict separation: Clean template in claims_templates has NOT been modified
  const { data: cleanTpl } = await admin.from('claims_templates').select('*').eq('id', 'TPL-GLOBAL-POA-NOV23').single();
  if (cleanTpl.byte_size !== 125867) throw new Error('Clean template was corrupted!');
  console.log('[PASS] Strict separation verified: Clean template intact with size', cleanTpl.byte_size);

  // Clean up test claim
  console.log('\nCleaning up test claim...');
  await admin.from('claims_records').delete().eq('id', testClaimId);
  console.log('[PASS] Test claim cleaned up.');

  console.log('\n=== ALL E2E VERIFICATIONS PASSED SUCCESSFULLY! ===');
}

run().catch((err) => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
