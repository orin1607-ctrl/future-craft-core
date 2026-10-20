import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const STAGING = 'usfeoerkpcafxxlyuldl';
const URL = `https://${STAGING}.supabase.co`;

const rawKeys = execSync(`npx supabase projects api-keys --project-ref ${STAGING} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(rawKeys);
const service = keys.find(k => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keys.find(k => k.name === 'service_role')?.api_key;
const anon = keys.find(k => k.name === 'anon' && k.type === 'legacy')?.api_key
  || keys.find(k => k.name === 'anon')?.api_key;

const admin = createClient(URL, service, { auth: { persistSession: false } });
const client = createClient(URL, anon, { auth: { persistSession: false } });

// Authenticate as worker
const { data: sess, error: authErr } = await client.auth.signInWithPassword({
  email: 'qa.claims.worker.1788292403067@futurecraft.staging',
  password: 'QaWorker2026!',
});
if (authErr) {
  console.error('Auth failed for test worker:', authErr.message);
  process.exit(1);
}
const userToken = sess.session.access_token;
const userId = sess.user.id;
console.log('Worker authenticated:', sess.user.email);

// Use DAL-2026-0003 which has 185 documents in DB to strictly prove zero auto-attach
const testClaimId = 'DAL-2026-0003';
const allowedTestEmail = 'yoni122222@gmail.com';

const testResults = [];
function record(category, testName, passed, details = {}) {
  testResults.push({ category, testName, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${category}] ${testName}: ${passed ? 'PASSED' : 'FAILED'}`);
  if (!passed) console.log('   Details:', details);
}

async function callChat(payload) {
  const res = await fetch(`${URL}/functions/v1/help-ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
      apikey: anon,
    },
    body: JSON.stringify(payload),
  });

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const json = await res.json().catch(() => null);
    return { status: res.status, data: json, pending_action: json?.pending_action };
  }
  const text = await res.text();
  let content = '';
  let pendingAction = null;
  let toolCalls = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const raw = line.slice(6).trim();
    if (raw === '[DONE]') continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.choices?.[0]?.delta?.content) content += parsed.choices[0].delta.content;
      if (parsed.pending_action) pendingAction = parsed.pending_action;
      if (parsed.tool_calls) toolCalls.push(...parsed.tool_calls);
    } catch (_) {}
  }
  return { status: res.status, text: content, pending_action: pendingAction, tool_calls: toolCalls, data: { success: true } };
}

async function adminRest(path, options = {}) {
  const res = await fetch(`${URL}${path}`, {
    ...options,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

console.log(`\n=== RUNNING VERIFICATION FOR NO-AUTO-ATTACH FLOWS ON ${testClaimId} (Contains 185 documents) ===\n`);

// ---------------------------------------------------------------------
// TEST 1: Regular email status check request ("שלחי לחברת הביטוח אימייל לבדיקת סטטוס התביעה")
// ---------------------------------------------------------------------
console.log('Test 1: Regular email status check...');
const prompt1 = await callChat({
  messages: [{
    role: 'user',
    content: `שלחי לחברת הביטוח אימייל לבדיקת סטטוס התביעה בתיק ${testClaimId}. הנמען הוא ${allowedTestEmail}.`
  }],
  claim_id: testClaimId,
});

const p1 = prompt1.pending_action;
const p1Files = p1?.parameters?.file_ids || [];
const p1Summary = String(p1?.summary || '');
const p1HasZeroFiles = p1Files.length === 0;

record('1. Regular Status Email', 'Drafts status email without any files (file_ids: 0 out of 185 in claim)', p1HasZeroFiles, {
  fileIds: p1Files,
  summary: p1Summary,
  actionType: p1?.action_type
});

record('1. Regular Status Email', 'Summary displays "קבצים מצורפים: 0 – ללא קבצים"', p1Summary.includes('קבצים מצורפים: 0 – ללא קבצים'), {
  summary: p1Summary
});

// ---------------------------------------------------------------------
// TEST 2: One-time scheduled status email for 2 days later ("תזמני לי אימייל לבדיקת סטטוס התביעה לעוד יומיים")
// ---------------------------------------------------------------------
console.log('\nTest 2: One-time scheduled status email for 2 days later...');
const prompt2 = await callChat({
  messages: [{
    role: 'user',
    content: `תזמני לי אימייל לבדיקת סטטוס התביעה בתיק ${testClaimId} לעוד יומיים בשעה 10:00. הנמען הוא ${allowedTestEmail}.`
  }],
  claim_id: testClaimId,
});

const p2 = prompt2.pending_action;
const p2Files = p2?.parameters?.file_ids || [];
const p2Summary = String(p2?.summary || '');
const p2IsScheduled = p2?.action_type === 'schedule_email';
const p2HasZeroFiles = p2Files.length === 0;

record('2. Scheduled Status Email', 'Prepares scheduled email without files (file_ids: 0)', p2IsScheduled && p2HasZeroFiles, {
  actionType: p2?.action_type,
  fileIds: p2Files,
  sendAt: p2?.parameters?.send_at
});

record('2. Scheduled Status Email', 'Scheduled summary displays "קבצים מצורפים: 0 – ללא קבצים"', p2Summary.includes('קבצים מצורפים: 0 – ללא קבצים'), {
  summary: p2Summary
});

// ---------------------------------------------------------------------
// TEST 3: 48h recurring follow-up ("שלחי מעקב אוטומטי כל יומיים עד שנקבל תשובה")
// ---------------------------------------------------------------------
console.log('\nTest 3: 48h recurring follow-up...');
const prompt3 = await callChat({
  messages: [{
    role: 'user',
    content: `שלחי מעקב אוטומטי כל יומיים עד שנקבל תשובה לגבי תיק ${testClaimId}. הנמען הוא ${allowedTestEmail}.`
  }],
  claim_id: testClaimId,
});

let p3 = prompt3.pending_action;
if (p3?.parameters?.actions?.length) {
  const recFound = p3.parameters.actions.find(a => a.parameters?.is_recurring);
  if (recFound) p3 = recFound;
}

const p3Files = p3?.parameters?.file_ids || [];
const p3Summary = String(p3?.summary || '');
const p3IsRecurring = p3?.action_type === 'schedule_email' && p3?.parameters?.is_recurring === true;
const p3HasZeroFiles = p3Files.length === 0;

record('3. 48h Recurring Follow-up', 'Prepares 48h recurring preview card with zero files', p3IsRecurring && p3HasZeroFiles, {
  isRecurring: p3?.parameters?.is_recurring,
  repeatDays: p3?.parameters?.repeat_every_days,
  fileIds: p3Files
});

record('3. 48h Recurring Follow-up', 'Recurring summary explicitly displays "קבצים מצורפים: 0 – ללא קבצים"', p3Summary.includes('קבצים מצורפים: 0 – ללא קבצים'), {
  summary: p3Summary
});

// ---------------------------------------------------------------------
// TEST 4: Single Series Approval & Server DB Persistence (zero files in reminder & jobs)
// ---------------------------------------------------------------------
console.log('\nTest 4: Approval of recurring series and DB verification...');
const cardToApprove = p3 || {
  preview_id: `P-RECUR-${Date.now()}`,
  summary: `מעקב חוזר כל 2 ימים (48 שעות) — עד לקבלת מענה מחברת הביטוח או עד לעצירה ידנית אל: ${allowedTestEmail} — נושא: "מעקב תביעה ${testClaimId}" · קבצים מצורפים: 0 – ללא קבצים`,
  tool_name: 'preview_send_claim_email',
  action_type: 'schedule_email',
  parameters: {
    claim_id: testClaimId,
    to: allowedTestEmail,
    subject: `מעקב תביעה ${testClaimId} - תזכורת כל יומיים`,
    body: 'שלום רב,\nבהמשך לתביעה, נבקש עדכון בהקדם.\nבברכה,\nדליה ניהול תביעות',
    file_ids: [],
    attachment_titles: [],
    is_recurring: true,
    repeat_every_days: 2,
    stop_on_reply: true,
    max_iterations: 10,
    send_at: new Date().toISOString(),
    send_at_label: 'שליחה ראשונה מיידית ומעקב חוזר כל יומיים (48 שעות)',
  }
};

const approveRes = await callChat({
  action: 'execute_pending_action',
  claim_id: testClaimId,
  pending_action: cardToApprove,
});

record('4. Series Approval', 'Manager one-time approval executes cleanly', approveRes.status === 200, {
  status: approveRes.status
});

// Check claims_reminders entry
const remDb = await adminRest(`/rest/v1/claims_reminders?claim_id=eq.${testClaimId}&action=eq.send_email&status=eq.scheduled&order=created_at.desc&limit=1`);
const savedReminder = remDb.data?.[0];
const isRemZeroFiles = savedReminder &&
  savedReminder.attach_mode === 'none' &&
  (!savedReminder.row_data?.file_ids || savedReminder.row_data?.file_ids === '') &&
  (!savedReminder.row_data?.attachment_titles || savedReminder.row_data?.attachment_titles.length === 0);

record('4. Server DB Persistence', 'claims_reminders saved with attach_mode="none" and 0 files', Boolean(isRemZeroFiles), {
  reminderId: savedReminder?.id,
  attachMode: savedReminder?.attach_mode,
  fileIds: savedReminder?.row_data?.file_ids,
  titles: savedReminder?.row_data?.attachment_titles
});

// Check queued initial job in claims_mail_jobs
const jobDb = await adminRest(`/rest/v1/claims_mail_jobs?reminder_id=eq.${savedReminder?.id}&status=eq.pending`);
const queuedJob = jobDb.data?.[0];
record('4. Server DB Persistence', 'Initial job queued in claims_mail_jobs', Boolean(queuedJob?.id), {
  jobId: queuedJob?.id
});

// ---------------------------------------------------------------------
// TEST 5: Server Dispatch Advance & Next Iteration also has Zero Files
// ---------------------------------------------------------------------
console.log('\nTest 5: Testing server execution & subsequent iteration zero-file guarantee...');
if (queuedJob?.id) {
  const triggerPlannedAt = new Date(Date.now() - 10000).toISOString();
  await adminRest(`/rest/v1/claims_mail_jobs?id=eq.${queuedJob.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ planned_at: triggerPlannedAt })
  });

  const dispRes = await fetch(`${URL}/functions/v1/claims-gmail`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${service}`,
      apikey: service,
    },
    body: JSON.stringify({
      action: 'dispatch_due_scheduled',
      scheduler: true,
      dry: true
    })
  });
  const dispData = await dispRes.json().catch(() => null);

  record('5. Server Recurring Cadence', 'Server dispatch processes job and advances cadence', Boolean(dispData?.processed >= 1), {
    processed: dispData?.processed,
    dryRun: dispData?.dryRun
  });

  // Verify next iteration job in DB
  const nextJobDb = await adminRest(`/rest/v1/claims_mail_jobs?reminder_id=eq.${savedReminder.id}&status=eq.pending`);
  const nextJob = nextJobDb.data?.[0];
  const advRem = await adminRest(`/rest/v1/claims_reminders?id=eq.${savedReminder.id}`);
  const advData = advRem.data?.[0];

  const nextHasZeroFiles = advData?.attach_mode === 'none' && (!advData?.row_data?.file_ids || advData?.row_data?.file_ids === '');
  record('5. Server Recurring Cadence', 'Subsequent iteration retains 0 attachments guarantee in DB', Boolean(nextJob && nextHasZeroFiles), {
    nextJobId: nextJob?.id,
    attachMode: advData?.attach_mode,
    fileIds: advData?.row_data?.file_ids
  });
}

// Clean up test reminder
if (savedReminder?.id) {
  await adminRest(`/rest/v1/claims_reminders?id=eq.${savedReminder.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled' })
  });
  await adminRest(`/rest/v1/claims_mail_jobs?reminder_id=eq.${savedReminder.id}&status=eq.pending`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled', fail_reason: 'qa_cleanup' })
  });
}

// ---------------------------------------------------------------------
// TEST 6: Explicit Request to Attach a File Continues to Work!
// ---------------------------------------------------------------------
console.log('\nTest 6: Explicit request to attach a document ("שלחי מייל וצרפי את ייפוי הכוח")...');
const docList = await adminRest(`/rest/v1/claims_documents?claim_id=eq.${testClaimId}&limit=1`);
const sampleDoc = docList.data?.[0];
console.log('Sample claim document for explicit attach test:', sampleDoc?.id, sampleDoc?.original_name);

const prompt6 = await callChat({
  messages: [{
    role: 'user',
    content: `שלחי לחברת הביטוח אימייל בתיק ${testClaimId} עם הקובץ "${sampleDoc?.original_name || 'ייפוי כוח'}" לנמען ${allowedTestEmail}.`
  }],
  claim_id: testClaimId,
});

const p6 = prompt6.pending_action;
const p6Files = p6?.parameters?.file_ids || [];
const p6Summary = String(p6?.summary || '');
console.log('Explicit attach card summary:', p6Summary);
console.log('Explicit attach file_ids:', p6Files);

const explicitWorked = p6Files.length > 0 || (sampleDoc?.id && p6Summary.includes(sampleDoc.original_name));
record('6. Explicit File Attachment', 'Explicit request to attach document continues to work and displays file name in card', Boolean(explicitWorked), {
  fileIdsCount: p6Files.length,
  summary: p6Summary,
  hasFiles: p6Files.length > 0
});

// ---------------------------------------------------------------------
// TEST 7: Actual Live Send Verification (Check Gmail Outbox & Payload)
// ---------------------------------------------------------------------
console.log('\nTest 7: Live Send Test to allowlisted test email and inspecting outbox record...');
const liveSendRes = await fetch(`${URL}/functions/v1/claims-gmail`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${userToken}`,
    apikey: anon,
  },
  body: JSON.stringify({
    action: 'send_claim',
    claim_id: testClaimId,
    to: allowedTestEmail,
    subject: `QA Verify No Attachments - ${Date.now()}`,
    body: 'הודעת בדיקה לבדיקת סטטוס ללא קבצים מצורפים.',
    file_ids: [], // explicitly empty
    confirm: true,
    idempotency_key: `NOATT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  })
});
const liveSendData = await liveSendRes.json().catch(() => null);

// Inspect claims_gmail_outbox
const outboxDb = await adminRest(`/rest/v1/claims_gmail_outbox?claim_id=eq.${testClaimId}&order=created_at.desc&limit=1`);
const latestOutbox = outboxDb.data?.[0];
const outboxHasZeroFiles = latestOutbox &&
  (!latestOutbox.file_ids || latestOutbox.file_ids.length === 0) &&
  (!latestOutbox.file_names || latestOutbox.file_names.length === 0);

record('7. Live Send Verification', 'Email sent to test account with strictly 0 attachments in outbox & payload', Boolean(liveSendData?.success && outboxHasZeroFiles), {
  sendSuccess: liveSendData?.success,
  realEmailSend: liveSendData?.realEmailSend,
  outboxFileIds: latestOutbox?.file_ids,
  outboxFileNames: latestOutbox?.file_names,
  gmailMessageId: latestOutbox?.gmail_message_id
});

// ---------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------
console.log('\n=== FINAL SUMMARY ===');
const passedCount = testResults.filter(t => t.passed).length;
const totalCount = testResults.length;
console.log(`Passed: ${passedCount}/${totalCount}`);

if (passedCount === totalCount) {
  console.log('\n🎉 ALL 11 VERIFICATION CHECKS FOR NO-AUTO-ATTACH PASSED 100%!');
  process.exit(0);
} else {
  console.log('\n⚠️ Some verification checks failed.');
  process.exit(1);
}
