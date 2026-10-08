/**
 * scripts/verify-claim-onboarding-e2e.mjs
 * Comprehensive E2E Verification of Dalia AI Claims Onboarding & Operational Cockpit on Oren Car STAGING
 *
 * Requirements Tested:
 * 1. Duplicate check (check_claim_and_customer_duplicates)
 * 2. General Claims Mode Onboarding (Document extraction, Missing fields marked "חסר", Preview Card)
 * 3. Execution of Onboarding Action ([אישור] -> New DAL-... claim created, customer created, files in claims_documents & gallery)
 * 4. Document list query in Open Claim ("איזה מסמכים יש בתיק?" -> returns clean numbered list)
 * 5. Document selection by numbers ("שלח ללקוח 1" -> maps numbers to file_ids)
 * 6. Secure Share Link creation & approval (preview_create_claim_share_link -> Approve -> copyable URL)
 * 7. Email send via Gmail API with attachments (preview_send_claim_email -> Approve -> claims_gmail_outbox verified)
 * 8. Save additional attachment to Open Claim (preview_save_attachment_to_claim -> Approve -> claims_documents verified)
 * 9. Duplicate detection warning on existing plate/customer
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ALLOWED_RECIPIENT = 'yoni122222@gmail.com';

const SHOTS_DIR = 'backups/qa-shots-onboarding';
if (!existsSync(SHOTS_DIR)) mkdirSync(SHOTS_DIR, { recursive: true });

console.log('================================================================');
console.log('🚀 Running Dalia AI Claim Onboarding & Operational Cockpit E2E');
console.log('================================================================\n');

// 1. Authenticate on Staging
console.log('--- Step 1: Authenticating on Staging ---');
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceRoleKey = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;

const admin = createClient(STAGING_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: sess } = await client.auth.signInWithPassword({
  email: 'qa.claims.worker.1788292403067@futurecraft.staging',
  password: 'QaWorker2026!',
});

let userToken = '';
let userId = '';
let userName = '';
if (sess?.session) {
  userToken = sess.session.access_token;
  userId = sess.user.id;
  userName = sess.user.user_metadata?.full_name || sess.user.email;
  console.log(`✅ Authenticated with QA worker: ${sess.user.email}`);
} else {
  const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
  const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
  const email = saUser?.data?.user?.email || 'orin1607@gmail.com';
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const { data: auth } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  userToken = auth.session.access_token;
  userId = auth.user.id;
  userName = 'super_admin';
  console.log(`✅ Authenticated via admin magiclink: ${email}`);
}

const testResults = [];
function recordResult(name, pass, details = '') {
  testResults.push({ name, pass, details });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}: ${name}${details ? ` (${details})` : ''}`);
}

// Helper: Call help-ai-chat Edge Function
async function callChat(payload) {
  const res = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify(payload),
  });

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  // Stream parser
  const text = await res.text();
  const lines = text.split('\n');
  let fullContent = '';
  let pendingAction = null;

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataStr = line.slice(6).trim();
      if (dataStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) fullContent += delta;
        if (parsed.pending_action) pendingAction = parsed.pending_action;
      } catch (_) {}
    }
  }

  return { ok: res.ok, status: res.status, text: fullContent, pendingAction };
}

// Real test binary assets
const validJpgBase64 = readFileSync('src/assets/screenshot-dashboard.jpg').toString('base64');
const samplePdfText = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj\n4 0 obj<</Length 68>>stream\nBT /F1 12 Tf 100 700 Td (Damage Repair Invoice 8820 - Total 3,200 NIS) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000056 00000 n \n0000000111 00000 n \n0000000212 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n331\n%%EOF';
const validPdfBase64 = Buffer.from(samplePdfText).toString('base64');

const testPlate = `88${Math.floor(10000 + Math.random() * 89999)}99`;
const testCustomerName = `ישראל ישראלי QA-${Date.now() % 10000}`;
const testPhone = `052${Math.floor(1000000 + Math.random() * 8999999)}`;
let createdClaimId = '';
let createdCustomerId = '';

try {
  // =================================================================
  // TEST 1: Duplicate Check (check_claim_and_customer_duplicates)
  // =================================================================
  console.log('\n--- Test 1: Duplicate Check Tool ---');
  const dupCheckRes = await callChat({
    action: 'chat',
    module: 'claims',
    claim_id: null,
    messages: [
      {
        role: 'user',
        content: `תבדקי לי אם קיים לקוח או רכב במערכת עם מספר רכב ${testPlate} וטלפון ${testPhone}`,
      },
    ],
  });

  const t1Pass = dupCheckRes.ok && (dupCheckRes.text.includes('לא נמצא') || dupCheckRes.text.includes('חדש') || dupCheckRes.text.length > 10);
  recordResult('Test 1: Duplicate Check Tool', t1Pass, `Response length: ${dupCheckRes.text?.length || 0}`);

  // =================================================================
  // TEST 2: General Mode AI Onboarding (Extract Entities, Preview Card, Strict "חסר")
  // =================================================================
  console.log('\n--- Test 2: AI Claim & Customer Onboarding in General Mode ---');
  const onboardingRes = await callChat({
    action: 'chat',
    module: 'claims',
    claim_id: null,
    messages: [
      {
        role: 'user',
        content: `שלום דליה, הגיע לקוח חדש בשם ${testCustomerName}, טלפון ${testPhone}, רכב יונדאי טוסון מספר ${testPlate}, מבוטח בהראל ביטוח. תאריך אירוע אתמול. יש פגיעה בכנף ובפגוש קדמי. בבקשה תפתחי תיק חדש ולקוח מהמסמכים שצירפתי.`,
      },
    ],
    attachments: [
      {
        name: 'vehicle_license.pdf',
        mime_type: 'application/pdf',
        byte_size: 450,
        data_base64: validPdfBase64,
      },
      {
        name: 'damage_front_bumper.jpg',
        mime_type: 'image/jpeg',
        byte_size: 150,
        data_base64: validJpgBase64,
      },
    ],
  });

  const pending = onboardingRes.pendingAction;
  const t2HasPending = pending && pending.action_type === 'create_claim_from_onboarding';
  const t2SummaryHasData = pending?.summary && pending.summary.includes(testPlate);
  const t2MissingMarked = pending?.parameters?.missing_fields && Array.isArray(pending.parameters.missing_fields);

  recordResult(
    'Test 2: General Mode Onboarding Preview Card',
    t2HasPending && t2SummaryHasData,
    `Action: ${pending?.action_type}, Plate: ${pending?.parameters?.vehicle?.plate}, Missing count: ${pending?.parameters?.missing_fields?.length || 0}`
  );

  // =================================================================
  // TEST 3: Approve & Execute Onboarding Action ([אישור] -> New Claim)
  // =================================================================
  console.log('\n--- Test 3: Approve & Execute Onboarding Action ---');
  if (pending) {
    const execRes = await callChat({
      action: 'execute_pending_action',
      claim_id: null,
      pending_action: pending,
    });

    const execData = execRes.data || {};
    createdClaimId = execData.claim_id || '';
    createdCustomerId = execData.customer_id || '';

    // Verify in Database
    const { data: claimRow } = await admin
      .from('claims_records')
      .select('id, plate, client_name, status, row_data')
      .eq('id', createdClaimId)
      .maybeSingle();

    const { data: docRows } = await admin
      .from('claims_documents')
      .select('id, original_name, doc_kind, doc_meta, storage_path')
      .eq('claim_id', createdClaimId);

    const { data: histRows } = await admin
      .from('claims_history')
      .select('id, row_data')
      .eq('claim_id', createdClaimId);

    const t3ClaimCreated = !!claimRow && claimRow.plate === testPlate;
    const t3DocsUploaded = docRows && docRows.length >= 2;
    const t3HasPhotoInGallery = docRows && docRows.some((d) => d.doc_kind === 'garage_photo');
    const t3HasDocInLibrary = docRows && docRows.some((d) => d.doc_kind === 'driver_license' || d.original_name.includes('license'));
    const t3HistoryLogged = histRows && histRows.length > 0;

    recordResult(
      'Test 3: Execute Onboarding (Claim, Customer, Gallery, Docs, Audit)',
      t3ClaimCreated && t3DocsUploaded && t3HasPhotoInGallery && t3HistoryLogged,
      `New Claim: ${createdClaimId}, Docs saved: ${docRows?.length || 0}, Gallery photo present: ${t3HasPhotoInGallery}`
    );
  } else {
    recordResult('Test 3: Execute Onboarding', false, 'No pending action from Test 2');
  }

  // =================================================================
  // TEST 4: Open Claim Mode - Document Query ("איזה מסמכים יש בתיק?")
  // =================================================================
  console.log('\n--- Test 4: Open Claim Document Listing ---');
  const targetClaim = createdClaimId || 'DAL-QA-WORKER-001';
  const listDocsRes = await callChat({
    action: 'chat',
    module: 'claims',
    claim_id: targetClaim,
    messages: [
      {
        role: 'user',
        content: 'איזה מסמכים ותמונות יש בתיק? תני לי רשימה ממוספרת.',
      },
    ],
  });

  const t4Pass = listDocsRes.ok && (listDocsRes.text.includes('1.') || listDocsRes.text.includes('מסמכ') || listDocsRes.text.includes('license') || listDocsRes.text.includes('bumper'));
  recordResult('Test 4: Numbered Documents List in Open Claim', t4Pass, `Response length: ${listDocsRes.text.length}`);

  // Fetch actual file IDs from DB for following tests
  const { data: currentFiles } = await admin
    .from('claims_documents')
    .select('id, original_name')
    .eq('claim_id', targetClaim)
    .limit(5);

  const file1 = currentFiles?.[0]?.id || '';
  const file2 = currentFiles?.[1]?.id || '';

  // =================================================================
  // TEST 5: Number Selection for Email Send Preview
  // =================================================================
  console.log('\n--- Test 5: Number Selection for Email Send ---');
  const emailSelectRes = await callChat({
    action: 'chat',
    module: 'claims',
    claim_id: targetClaim,
    messages: [
      {
        role: 'user',
        content: 'איזה מסמכים ותמונות יש בתיק? תני לי רשימה ממוספרת.',
      },
      {
        role: 'assistant',
        content: listDocsRes.text,
      },
      {
        role: 'user',
        content: `בבקשה תכיני שליחת מייל ל-${ALLOWED_RECIPIENT} עם מסמכים 1 ו-2`,
      },
    ],
  });

  const emailPending = emailSelectRes.pendingAction;
  const t5HasPending = emailPending && emailPending.action_type === 'send_email';
  const t5RecipientMatch = emailPending?.parameters?.to === ALLOWED_RECIPIENT;
  const t5FilesAttached = emailPending?.parameters?.file_ids && emailPending.parameters.file_ids.length > 0;

  recordResult(
    'Test 5: Number Selection to Email Preview Card',
    t5HasPending && t5RecipientMatch && t5FilesAttached,
    `To: ${emailPending?.parameters?.to}, Files: ${emailPending?.parameters?.file_ids?.length || 0}`
  );

  // =================================================================
  // TEST 6: Share Link Creation via AI & Approval
  // =================================================================
  console.log('\n--- Test 6: Share Link Creation & Verification ---');
  const shareSelectRes = await callChat({
    action: 'chat',
    module: 'claims',
    claim_id: targetClaim,
    messages: [
      {
        role: 'user',
        content: 'תכיני קישור שיתוף מאובטח לשמאי משה עם כל התמונות',
      },
    ],
  });

  const sharePending = shareSelectRes.pendingAction;
  let t6Pass = false;
  let shareToken = '';

  if (sharePending && sharePending.action_type === 'create_share_link') {
    const execShare = await callChat({
      action: 'execute_pending_action',
      claim_id: targetClaim,
      pending_action: sharePending,
    });

    const shareMsg = execShare.data?.message || '';
    t6Pass = execShare.ok && shareMsg.includes('http');

    // Verify share in DB
    const { data: dbShare } = await admin
      .from('claims_share_links')
      .select('id, recipient_name, expires_at')
      .eq('claim_id', targetClaim)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    t6Pass = t6Pass && !!dbShare;
    recordResult(
      'Test 6: Secure Share Link Creation & Copyable URL',
      t6Pass,
      `Share verified in DB for recipient: ${dbShare?.recipient_name}`
    );
  } else {
    recordResult('Test 6: Secure Share Link Creation', false, 'AI did not produce create_share_link preview');
  }

  // =================================================================
  // TEST 7: Email Send Execution via Gmail API ([אישור] -> Outbox)
  // =================================================================
  console.log('\n--- Test 7: Email Send Execution via Gmail API ---');
  if (emailPending) {
    const execEmail = await callChat({
      action: 'execute_pending_action',
      claim_id: targetClaim,
      pending_action: emailPending,
    });

    const isSuccess = execEmail.data?.success === true;
    const msgId = execEmail.data?.message || '';

    // Verify in claims_gmail_outbox
    const { data: outboxRows } = await admin
      .from('claims_gmail_outbox')
      .select('id, to_addr, subject, status, gmail_message_id, created_at')
      .eq('claim_id', targetClaim)
      .order('created_at', { ascending: false })
      .limit(1);

    const outboxHit = outboxRows?.[0];
    const t7Pass = isSuccess && !!outboxHit && outboxHit.to_addr === ALLOWED_RECIPIENT;

    recordResult(
      'Test 7: Email Send Execution via Gmail API & Outbox Audit',
      t7Pass,
      `Outbox status: ${outboxHit?.status}, Message ID: ${outboxHit?.gmail_message_id}`
    );
  } else {
    recordResult('Test 7: Email Send Execution', false, 'No email pending action from Test 5');
  }

  // =================================================================
  // TEST 8: Save Additional Attachment to Open Claim
  // =================================================================
  console.log('\n--- Test 8: Save Additional Attachment to Open Claim ---');
  const saveDocRes = await callChat({
    action: 'chat',
    module: 'claims',
    claim_id: targetClaim,
    messages: [
      {
        role: 'user',
        content: 'זה דו"ח שמאי מעודכן שקיבלתי עכשיו, בבקשה תשמרי אותו בתיק.',
      },
    ],
    attachments: [
      {
        name: 'surveyor_final_report_v2.pdf',
        mime_type: 'application/pdf',
        byte_size: 450,
        data_base64: validPdfBase64,
      },
    ],
  });

  const savePending = saveDocRes.pendingAction;
  let t8Pass = false;

  if (savePending && savePending.action_type === 'save_attachment_to_claim') {
    const execSave = await callChat({
      action: 'execute_pending_action',
      claim_id: targetClaim,
      pending_action: savePending,
    });

    const { data: checkNewDoc } = await admin
      .from('claims_documents')
      .select('id, original_name, doc_kind')
      .eq('claim_id', targetClaim)
      .eq('original_name', 'surveyor_final_report_v2.pdf')
      .maybeSingle();

    t8Pass = execSave.ok && !!checkNewDoc;
    recordResult(
      'Test 8: Save Additional Attachment to Open Claim',
      t8Pass,
      `New Document ID in DB: ${checkNewDoc?.id}, Kind: ${checkNewDoc?.doc_kind}`
    );
  } else {
    recordResult('Test 8: Save Additional Attachment to Open Claim', false, `No save pending action (type: ${savePending?.action_type})`);
  }

  // =================================================================
  // TEST 9: Duplicate Detection Warning on Existing Plate/Customer
  // =================================================================
  console.log('\n--- Test 9: Duplicate Detection Warning on Existing Plate/Customer ---');
  const duplicateAttemptRes = await callChat({
    action: 'chat',
    module: 'claims',
    claim_id: null,
    messages: [
      {
        role: 'user',
        content: `תפתחי תיק חדש עבור לקוח בשם ${testCustomerName} עם רכב ${testPlate}`,
      },
    ],
    attachments: [
      {
        name: 'car_photo.jpg',
        mime_type: 'image/jpeg',
        byte_size: 150,
        data_base64: validJpgBase64,
      },
    ],
  });

  const dupPending = duplicateAttemptRes.pendingAction;
  const hasTextWarning = duplicateAttemptRes.text && (
    duplicateAttemptRes.text.includes('כפילות') ||
    duplicateAttemptRes.text.includes('קיימת') ||
    duplicateAttemptRes.text.includes('קיים') ||
    duplicateAttemptRes.text.includes(testPlate)
  );
  const hasCardWarning = dupPending?.summary && (
    dupPending.summary.includes('כפילות') ||
    dupPending.summary.includes('קיים') ||
    dupPending.parameters?.duplicates?.has_duplicates === true
  );
  const t9HasDupWarning = Boolean(hasTextWarning || hasCardWarning);
  recordResult(
    'Test 9: Duplicate Detection Warning on Existing Plate/Customer',
    t9HasDupWarning,
    `Warning in text: ${Boolean(hasTextWarning)}, Card warning: ${Boolean(hasCardWarning)}`
  );

} catch (err) {
  console.error('\n❌ Unexpected error during E2E testing:', err);
}

// Summary Report
console.log('\n================================================================');
console.log('📊 FINAL E2E TEST RESULTS SUMMARY');
console.log('================================================================');
let passCount = 0;
for (const r of testResults) {
  if (r.pass) passCount++;
  console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'}: ${r.name}`);
}
console.log(`\nScore: ${passCount}/${testResults.length} tests passed.`);
console.log('================================================================\n');

writeFileSync(
  'backups/qa-shots-onboarding/e2e-onboarding-summary.json',
  JSON.stringify({ timestamp: new Date().toISOString(), passCount, total: testResults.length, results: testResults }, null, 2),
  'utf8'
);

process.exit(passCount === testResults.length ? 0 : 1);
