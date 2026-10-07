/**
 * Automated end-to-end verification of Claims AI operations on Staging.
 * Tests all 10 scenarios:
 * 1. Claim Context Identification
 * 2. Email Queries (Latest Email, Insurance Reply, Inbox Search)
 * 3. Document and Photo Discovery
 * 4. Share Link Creation Preview
 * 5. Share Link Execution on User Approval
 * 6. Status Update Preview and Approval Execution
 * 7. Task Creation Preview and Approval Execution
 * 8. Email Send Preview and User Cancellation
 * 9. Comprehensive Audit Trail Verification in claims_ai_audit_log
 * 10. Existing claims-gmail Regression Verification
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const CHAT_URL = `${STAGING_URL}/functions/v1/help-ai-chat`;
const GMAIL_URL = `${STAGING_URL}/functions/v1/claims-gmail`;
const CLAIM_ID = 'DAL-2026-0004';

const results = [];
function record(testName, passed, detail = '') {
  results.push({ testName, passed, detail });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${testName}] ${detail}`);
}

async function main() {
  console.log('--- Starting Claims AI Operations Test on Staging ---');

  // 1. Fetch keys and create admin client
  const keys = JSON.parse(
    execSync(`npx supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' })
  );
  const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key;
  const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;

  if (!serviceKey || !anonKey) {
    throw new Error('Could not retrieve API keys');
  }

  const admin = createClient(STAGING_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2. Setup test user with claims permissions
  const runId = Date.now();
  const testEmail = `claims-ai-test-${runId}@staging-e2e.local`;
  const testPassword = `Pass!${runId}`;

  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (createErr || !createData.user) {
    throw new Error(`Failed to create test user: ${createErr?.message}`);
  }
  const uid = createData.user.id;

  await admin.from('profiles').upsert({
    id: uid,
    full_name: 'בודק תפעול דליה',
    company_name: 'דליה',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', uid);
  await admin.from('user_roles').insert({ user_id: uid, role: 'super_admin' });
  await admin.from('claims_access').upsert({ user_id: uid, granted_by: uid });

  // 3. Sign in as test user to get JWT
  const anonClient = createClient(STAGING_URL, anonKey);
  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (signInErr || !signInData.session) {
    throw new Error(`Failed to sign in test user: ${signInErr?.message}`);
  }
  const jwt = signInData.session.access_token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`,
  };

  // Helper to parse SSE stream from help-ai-chat
  async function sendAiChat(messages) {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        messages,
        module: 'claims',
        claim_id: CLAIM_ID,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, status: res.status, error: err };
    }

    const text = await res.text();
    let reply = '';
    let pendingAction = null;

    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) reply += delta;
          if (parsed.pending_action) pendingAction = parsed.pending_action;
        } catch {
          // ignore parse errors on partial chunks
        }
      }
    }

    return { ok: true, status: res.status, reply, pendingAction };
  }

  // --- Test 1: Identify Open Claim ---
  console.log('\nTesting Scenario 1: Identify Open Claim...');
  const res1 = await sendAiChat([{ role: 'user', content: 'על איזה תיק אני עובד עכשיו?' }]);
  const hasClaimInfo = res1.reply.includes('18391803') || res1.reply.includes('תומר כהן') || res1.reply.includes('DAL-2026-0004');
  record('Identify Open Claim', res1.ok && hasClaimInfo, `Reply: ${res1.reply.slice(0, 100)}...`);

  // --- Test 2: Latest Email Query ---
  console.log('\nTesting Scenario 2: Latest Email Query...');
  const res2 = await sendAiChat([{ role: 'user', content: 'מה המייל האחרון שהתקבל בתיק?' }]);
  const hasEmailInfo = res2.reply.includes('FaxTviot') || res2.reply.includes('shlomo') || res2.reply.includes('דרישה') || res2.reply.includes('מסמכים');
  record('Latest Email Query', res2.ok && hasEmailInfo, `Reply: ${res2.reply.slice(0, 100)}...`);

  // --- Test 3: Check Insurance Reply ---
  console.log('\nTesting Scenario 3: Check Insurance Reply...');
  const res3 = await sendAiChat([{ role: 'user', content: 'האם חברת הביטוח ענתה לתיק ומתי?' }]);
  const hasInsInfo = res3.reply.includes('שלמה') || res3.reply.includes('FaxTviot') || res3.reply.includes('2026');
  record('Insurance Reply Query', res3.ok && hasInsInfo, `Reply: ${res3.reply.slice(0, 100)}...`);

  // --- Test 4: List Documents and Photos ---
  console.log('\nTesting Scenario 4: List Photos in Claim...');
  const res4 = await sendAiChat([{ role: 'user', content: 'תראה לי את התמונות בתיק' }]);
  const hasPhotoInfo = res4.reply.includes('תמונ') || res4.reply.includes('image') || res4.reply.includes('png');
  record('List Claim Photos', res4.ok && hasPhotoInfo, `Reply: ${res4.reply.slice(0, 100)}...`);

  // --- Test 5: Share Link Creation Preview ---
  console.log('\nTesting Scenario 5: Share Link Creation Preview...');
  const res5 = await sendAiChat([
    { role: 'user', content: 'צור קישור מאובטח לשליחת תמונות לשמאי משה אברהם' },
  ]);
  const hasSharePreview = res5.ok && !!res5.pendingAction && res5.pendingAction.action_type === 'create_share_link';
  record(
    'Share Link Preview Generation',
    hasSharePreview,
    `Preview Summary: ${res5.pendingAction?.summary || 'none'}`
  );

  // --- Test 6: Share Link Approval & Execution ---
  console.log('\nTesting Scenario 6: Execute Share Link on Approval...');
  let shareCreated = false;
  if (res5.pendingAction) {
    const execRes = await fetch(CHAT_URL, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'execute_pending_action',
        claim_id: CLAIM_ID,
        pending_action: res5.pendingAction,
      }),
    });
    const execJson = await execRes.json();
    shareCreated = execRes.ok && execJson.success === true;
    record('Share Link Execution', shareCreated, `Response: ${execJson.message || JSON.stringify(execJson)}`);
  } else {
    record('Share Link Execution', false, 'Skipped due to missing preview');
  }

  // --- Test 7: Status Update Preview & Execution ---
  console.log('\nTesting Scenario 7: Status Update Preview & Approval...');
  const res7 = await sendAiChat([
    { role: 'user', content: 'שנה סטטוס ל-בטיפול מוסך' },
  ]);
  const hasStatusPreview = res7.ok && !!res7.pendingAction && res7.pendingAction.action_type === 'update_status';
  record('Status Update Preview', hasStatusPreview, `Summary: ${res7.pendingAction?.summary || 'none'}`);

  if (res7.pendingAction) {
    const execStatus = await fetch(CHAT_URL, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'execute_pending_action',
        claim_id: CLAIM_ID,
        pending_action: res7.pendingAction,
      }),
    });
    const statusJson = await execStatus.json();
    const statusOk = execStatus.ok && statusJson.success === true;
    record('Status Update Execution', statusOk, `Response: ${statusJson.message}`);

    // Verify claim in DB was actually updated
    const { data: updatedClaim } = await admin.from('claims_records').select('status').eq('id', CLAIM_ID).single();
    const verifiedStatus = updatedClaim?.status === 'בטיפול מוסך';
    record('DB Status Verification', verifiedStatus, `Current DB Status: ${updatedClaim?.status}`);

    // Revert status back to original to keep test claim clean
    await admin.from('claims_records').update({ status: 'ממתין למסמכים' }).eq('id', CLAIM_ID);
  } else {
    record('Status Update Execution', false, 'Skipped');
  }

  // --- Test 8: Task Creation Preview & Execution ---
  console.log('\nTesting Scenario 8: Task Creation Preview & Approval...');
  const res8 = await sendAiChat([
    { role: 'user', content: 'צור משימה: לבדוק דוח שמאי סופי' },
  ]);
  const hasTaskPreview = res8.ok && !!res8.pendingAction && res8.pendingAction.action_type === 'create_task';
  record('Task Creation Preview', hasTaskPreview, `Summary: ${res8.pendingAction?.summary || 'none'}`);

  let createdTaskId = null;
  if (res8.pendingAction) {
    const execTask = await fetch(CHAT_URL, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'execute_pending_action',
        claim_id: CLAIM_ID,
        pending_action: res8.pendingAction,
      }),
    });
    const taskJson = await execTask.json();
    const taskOk = execTask.ok && taskJson.success === true;
    createdTaskId = taskJson.data?.taskId;
    record('Task Creation Execution', taskOk, `Response: ${taskJson.message}, taskId: ${createdTaskId}`);

    // Verify in claims_tasks table
    if (createdTaskId) {
      const { data: taskRow } = await admin.from('claims_tasks').select('*').eq('id', createdTaskId).maybeSingle();
      record('DB Task Verification', !!taskRow, `Found task in claims_tasks: ${taskRow?.id}`);
      // Clean up test task
      await admin.from('claims_tasks').delete().eq('id', createdTaskId);
    }
  }

  // --- Test 9: Email Send Preview & Cancellation ---
  console.log('\nTesting Scenario 9: Email Send Preview & Cancellation...');
  const res9 = await sendAiChat([
    { role: 'user', content: 'שלח לשמאי משה כהן מייל עם התמונות לכתובת shlomo@shlomo.co.il' },
  ]);
  const hasEmailPreview = res9.ok && !!res9.pendingAction && res9.pendingAction.action_type === 'send_email';
  record('Email Send Preview', hasEmailPreview, `Summary: ${res9.pendingAction?.summary || 'none'}`);

  if (res9.pendingAction) {
    // User cancels the email send
    const cancelRes = await fetch(CHAT_URL, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'cancel_pending_action',
        claim_id: CLAIM_ID,
        pending_action: res9.pendingAction,
      }),
    });
    const cancelJson = await cancelRes.json();
    record('Email Send Cancellation', cancelRes.ok && cancelJson.success === true, `Response: ${cancelJson.message}`);
  }

  // --- Test 10: Audit Log Verification ---
  console.log('\nTesting Scenario 10: Audit Trail Verification in claims_ai_audit_log...');
  const { data: auditRows } = await admin
    .from('claims_ai_audit_log')
    .select('tool_name, action_type, status, execution_action, created_at')
    .eq('claim_id', CLAIM_ID)
    .order('created_at', { ascending: false })
    .limit(10);

  const hasAuditRows = (auditRows || []).length > 0;
  const hasExecuted = (auditRows || []).some((r) => r.status === 'executed');
  const hasCancelled = (auditRows || []).some((r) => r.status === 'cancelled');
  record(
    'Claims AI Audit Log Integrity',
    hasAuditRows && hasExecuted && hasCancelled,
    `Logged ${auditRows?.length} events. Executed: ${hasExecuted}, Cancelled: ${hasCancelled}`
  );

  // --- Test 11: Regression Check on existing claims-gmail ---
  console.log('\nTesting Scenario 11: claims-gmail Regression Check...');
  const gmailStatusRes = await fetch(GMAIL_URL, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ action: 'status' }),
  });
  const gmailStatus = await gmailStatusRes.json();
  const gmailImportsRes = await fetch(GMAIL_URL, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ action: 'list_imports', claim_id: CLAIM_ID }),
  });
  const gmailImports = await gmailImportsRes.json();
  const importsList = gmailImports.data || gmailImports.imports || [];
  const gmailOk = gmailStatus.connected === true && Array.isArray(importsList) && importsList.length > 0;
  record(
    'claims-gmail Baseline Intact',
    gmailOk,
    `Connected: ${gmailStatus.connected}, Imports Count: ${importsList.length}`
  );

  // Summary
  console.log('\n========================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`);
  console.log(`OVERALL STATUS: ${allPassed ? 'SUCCESS ✅' : 'FAILED ❌'}`);
  console.log('========================================');

  // Clean up test user
  await admin.auth.admin.deleteUser(uid);
  console.log('Cleaned up test user.');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
