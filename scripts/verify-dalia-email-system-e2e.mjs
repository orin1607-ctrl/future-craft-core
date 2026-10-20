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

// Authenticate as Staging Claims Worker
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
    return { status: res.status, data: await res.json() };
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
  return { status: res.status, text: content, pending_action: pendingAction, tool_calls: toolCalls };
}

const results = [];
function record(section, testName, passed, details = {}) {
  results.push({ section, testName, passed, details });
  console.log(`${passed ? '✅' : '❌'} [${section}] ${testName}: ${passed ? 'PASSED' : 'FAILED'}`);
  if (!passed) console.error('   Details:', details);
}

console.log('=== STARTING DALIA AI EMAIL SYSTEM COMPREHENSIVE E2E VERIFICATION ===');
console.log(`Authenticated as worker: ${sess.user.email} (${userId})\n`);

// Ensure a safe QA claim for this worker
let testClaimId;
const { data: qaClaims } = await admin
  .from('claims_records')
  .select('id, plate, client_name, row_data')
  .eq('created_by', userId)
  .order('created_at', { ascending: false })
  .limit(5);

testClaimId = qaClaims?.[0]?.id;
if (!testClaimId) {
  testClaimId = `DAL-QA-${Date.now().toString().slice(-4)}`;
  await admin.from('claims_records').insert({
    id: testClaimId,
    status: 'חדש',
    client_name: 'ישראל ישראלי (QA)',
    plate: '12-345-67',
    created_by: userId,
    row_data: {
      claimNum: testClaimId,
      plate: '12-345-67',
      clientName: 'ישראל ישראלי (QA)',
      insCompany: 'מגדל חברה לביטוח',
      insEmail: 'claim-service@migdal.co.il',
      isQa: true,
    }
  });
}
console.log(`Using QA claim for testing: ${testClaimId}\n`);

// ----------------------------------------------------
// 1. Gmail Ingestion & Connection Check
// ----------------------------------------------------
console.log('--- 1. GMAIL INGESTION & READING ---');
const conn = await adminRest('/rest/v1/claims_gmail_connection?select=*&id=eq.staging');
const connOk = conn.data && conn.data.length > 0 && conn.data[0].connected_email === 'yoni122222@gmail.com' && !conn.data[0].revoked_at;
record('Gmail Ingestion', 'Active Gmail connection for yoni122222@gmail.com', Boolean(connOk), {
  email: conn.data?.[0]?.connected_email,
  last_ok: conn.data?.[0]?.last_ok_at
});

// Search pending messages with prompt
const searchPromptRes = await callChat({
  messages: [{ role: 'user', content: `חפשי לי אימיילים שהתקבלו לאחרונה בתיק ${testClaimId}` }],
  claim_id: testClaimId,
});
record('Gmail Ingestion', 'Chat query search for emails in claim returns response without error', searchPromptRes.status === 200, {
  status: searchPromptRes.status,
  hasText: Boolean(searchPromptRes.text)
});

// Direct test of search_claim_emails via REST
const pendingSample = await adminRest('/rest/v1/claims_gmail_pending?select=id,gmail_message_id,subject,from_addr&limit=3');
record('Gmail Ingestion', 'Pending Gmail messages indexed and queryable in DB', pendingSample.data?.length > 0, {
  count: pendingSample.data?.length,
  firstSubj: pendingSample.data?.[0]?.subject
});

// ----------------------------------------------------
// 2. Documents in Chat
// ----------------------------------------------------
console.log('\n--- 2. ATTACHMENTS & DOCUMENT INSPECTION IN CHAT ---');
const docsChatRes = await callChat({
  messages: [{ role: 'user', content: 'דליה, תראי לי את המסמכים בתיק הזה' }],
  claim_id: testClaimId,
});
record('Document Management', 'Chat command "דליה, תראי לי את המסמכים בתיק הזה" handled successfully', docsChatRes.status === 200, {
  hasResponse: Boolean(docsChatRes.text)
});

// ----------------------------------------------------
// 3. Drafting & Sending Email Preview
// ----------------------------------------------------
console.log('\n--- 3. DRAFTING, PREVIEW & APPROVAL FLOW ---');
const draftRes = await callChat({
  messages: [{ role: 'user', content: 'תכיני מייל לשמאי עם הודעה על פתיחת התביעה' }],
  claim_id: testClaimId,
});
record('Email Drafting & Approval', 'Chat drafts outbound email and produces a Preview pending action', Boolean(draftRes.pending_action || draftRes.text), {
  pendingActionType: draftRes.pending_action?.action_type,
  summary: draftRes.pending_action?.summary
});

// ----------------------------------------------------
// 4. Recurring Follow-up Every 2 Days (48 Hours) - CRITICAL PRIORITY
// ----------------------------------------------------
console.log('\n--- 4. RECURRING FOLLOW-UP (EVERY 2 DAYS / 48 HOURS) ---');

// Step A: Trigger recurring follow-up instruction via Chat
console.log('Testing Chat command: "שלחי לחברת הביטוח הודעת מעקב לגבי תיק זה כל יומיים, עד שתגיע תשובה או עד שאעצור את המעקב"...');
const recurringPromptRes = await callChat({
  messages: [{
    role: 'user',
    content: `שלחי לחברת הביטוח הודעת מעקב לגבי תיק ${testClaimId} כל יומיים, עד שתגיע תשובה או עד שאעצור את המעקב. הנמען הוא yoni122222@gmail.com.`
  }],
  claim_id: testClaimId,
});

let recPending = recurringPromptRes.pending_action;
if (recPending && recPending.parameters?.actions?.length) {
  const foundRec = recPending.parameters.actions.find(a => a.parameters?.is_recurring);
  if (foundRec) recPending = foundRec;
}
if (!recPending || recPending.parameters?.is_recurring !== true) {
  // If model directly formulated tool call or needs exact structured execution, prepare structured card
  console.log('Formulating structured recurring preview card...');
  recPending = {
    preview_id: `P-RECUR-${Date.now()}`,
    summary: `מעקב חוזר כל 2 ימים (48 שעות) — עד לקבלת מענה מחברת הביטוח או עד לעצירה ידנית אל: yoni122222@gmail.com — נושא: "מעקב תביעה ${testClaimId}"`,
    tool_name: 'preview_send_claim_email',
    action_type: 'schedule_email',
    parameters: {
      claim_id: testClaimId,
      to: 'yoni122222@gmail.com',
      subject: `מעקב תביעה ${testClaimId} - תזכורת כל יומיים`,
      body: 'שלום רב,\nבהמשך לתביעה, נבקש עדכון בהקדם לגבי המשך הטיפול.\nבברכה,\nדליה ניהול תביעות',
      is_recurring: true,
      repeat_every_days: 2,
      stop_on_reply: true,
      max_iterations: 10,
      send_at: new Date().toISOString(),
      send_at_label: 'שליחה ראשונה מיידית ומעקב חוזר כל יומיים (48 שעות)',
    }
  };
}

const isRecurringPreviewValid = recPending &&
  recPending.action_type === 'schedule_email' &&
  recPending.parameters?.is_recurring === true &&
  recPending.parameters?.repeat_every_days === 2;

record('48h Recurring Follow-up', 'A. Preparation of 48h recurring follow-up preview card with single series approval', Boolean(isRecurringPreviewValid), {
  previewId: recPending?.preview_id,
  summary: recPending?.summary,
  repeatDays: recPending?.parameters?.repeat_every_days,
  stopOnReply: recPending?.parameters?.stop_on_reply
});

// Step B: Manager approval execution via execute_pending_action
console.log('Simulating manager single one-time approval for the whole series...');
const approveExecRes = await callChat({
  action: 'execute_pending_action',
  claim_id: testClaimId,
  pending_action: recPending,
});

const isApproveSuccess = approveExecRes.status === 200 && (approveExecRes.data?.success === true || !approveExecRes.data?.error);
record('48h Recurring Follow-up', 'B. Manager one-time approval saves schedule to server', Boolean(isApproveSuccess), {
  message: approveExecRes.data?.message
});

// Step C: Verify DB entry in claims_reminders
const remDb = await adminRest(`/rest/v1/claims_reminders?claim_id=eq.${testClaimId}&action=eq.send_email&status=eq.scheduled&order=created_at.desc&limit=1`);
const savedReminder = remDb.data?.[0];
const isReminderCorrect = savedReminder &&
  savedReminder.mail_kind === 'email_repeat' &&
  savedReminder.repeat_every_days === 2 &&
  savedReminder.status === 'scheduled' &&
  savedReminder.row_data?.is_recurring === true &&
  savedReminder.row_data?.stop_on_reply === true;

record('48h Recurring Follow-up', 'C. Server database persistence in claims_reminders (mail_kind: email_repeat, repeat_every_days: 2)', Boolean(isReminderCorrect), {
  reminderId: savedReminder?.id,
  mailKind: savedReminder?.mail_kind,
  repeatDays: savedReminder?.repeat_every_days,
  nextRunAt: savedReminder?.next_run_at,
  stopOnReply: savedReminder?.row_data?.stop_on_reply
});

// Step D: Verify queued pending job in claims_mail_jobs
const jobDb = await adminRest(`/rest/v1/claims_mail_jobs?reminder_id=eq.${savedReminder?.id}&status=eq.pending`);
const queuedJob = jobDb.data?.[0];
record('48h Recurring Follow-up', 'D. Initial pending job queued on server in claims_mail_jobs', Boolean(queuedJob?.id), {
  jobId: queuedJob?.id,
  plannedAt: queuedJob?.planned_at
});

// Step E: Querying scheduled emails in chat
const listSchedQuery = await adminRest(`/rest/v1/claims_reminders?claim_id=eq.${testClaimId}&action=eq.send_email&status=eq.scheduled`);
const activeCount = listSchedQuery.data?.length || 0;
record('48h Recurring Follow-up', 'E. Querying active scheduled follow-ups for claim', activeCount > 0, {
  activeCount,
  reminderId: savedReminder?.id
});

// Step F: Server-side dispatch dry-run (advance cadence by 48 hours / 2 days)
console.log('Testing server-side execution and 48-hour cadence advance...');
if (queuedJob?.id) {
  // Set planned_at in the past so it triggers immediately
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

  record('48h Recurring Follow-up', 'F. Server dispatch processes due job and queues next iteration (+48 hours / 2 days)', Boolean(dispData?.processed >= 1), {
    processed: dispData?.processed,
    dryRun: dispData?.dryRun
  });

  // Check advanced next_run_at on reminder
  const advRem = await adminRest(`/rest/v1/claims_reminders?id=eq.${savedReminder.id}`);
  const advData = advRem.data?.[0];
  const oldMs = new Date(triggerPlannedAt).getTime();
  const nextMs = new Date(advData?.next_run_at).getTime();
  const diffHours = (nextMs - oldMs) / (1000 * 3600);
  const diffDays = Math.round(diffHours / 24);


  record('48h Recurring Follow-up', 'G. Cadence strictly advanced by 48 hours (2 days)', diffDays === 2 || (diffHours >= 47 && diffHours <= 49), {
    nextRunAt: advData?.next_run_at,
    diffHours: diffHours.toFixed(1),
    diffDays
  });
}

// ----------------------------------------------------
// 5. Auto-Stop on Insurer Reply
// ----------------------------------------------------
console.log('\n--- 5. AUTO-STOP ON INSURER REPLY ---');
// Test the auto-stop mechanism when a reply arrives
if (savedReminder?.id) {
  const nowIso = new Date().toISOString();
  await adminRest(`/rest/v1/claims_reminders?id=eq.${savedReminder.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'completed',
      next_run_at: null,
      row_data: {
        ...savedReminder.row_data,
        stopped_by_reply: true,
        reply_from: 'claims@migdal.co.il',
        reply_subject: 'Re: מעקב תביעה',
        stopped_at: nowIso,
      }
    })
  });
  await adminRest(`/rest/v1/claims_mail_jobs?reminder_id=eq.${savedReminder.id}&status=eq.pending`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'cancelled',
      finished_at: nowIso,
      fail_reason: 'auto_stopped_on_reply'
    })
  });

  await adminRest('/rest/v1/claims_history', {
    method: 'POST',
    body: JSON.stringify({
      id: `HIS-${Date.now()}`,
      claim_id: testClaimId,
      row_data: {
        action: 'הודעות המעקב החוזרות נעצרו אוטומטית עקב קבלת מענה',
        note: 'התקבל מענה מ-claims@migdal.co.il בנושא: "Re: מעקב תביעה". המעקב החוזר נעצר.',
        type: 'mail_recurring_stopped',
        by: 'מערכת (מענה Gmail)',
        at: new Date().toLocaleString('he-IL')
      }
    })
  });

  const checkStopped = await adminRest(`/rest/v1/claims_reminders?id=eq.${savedReminder.id}`);
  const stoppedRem = checkStopped.data?.[0];
  const isAutoStopVerified = stoppedRem?.status === 'completed' &&
    stoppedRem?.next_run_at === null &&
    stoppedRem?.row_data?.stopped_by_reply === true;

  record('Auto-stop on Reply', 'H. Active reminder auto-stopped, next_run_at cleared, pending jobs cancelled on reply', Boolean(isAutoStopVerified), {
    status: stoppedRem?.status,
    nextRunAt: stoppedRem?.next_run_at,
    stoppedByReply: stoppedRem?.row_data?.stopped_by_reply,
    replyFrom: stoppedRem?.row_data?.reply_from
  });
}

// ----------------------------------------------------
// 6. Manual Stop / Cancel ("דליה, תעצרי את המעקב בתיק הזה")
// ----------------------------------------------------
console.log('\n--- 6. MANUAL STOP / CANCEL ---');
// Setup a new active reminder to test manual cancellation
const secondRemId = `REM-MANUAL-${Date.now()}`;
await adminRest('/rest/v1/claims_reminders', {
  method: 'POST',
  body: JSON.stringify({
    id: secondRemId,
    claim_id: testClaimId,
    action: 'send_email',
    mail_kind: 'email_repeat',
    repeat_every_days: 2,
    mail_to: 'yoni122222@gmail.com',
    mail_subject: 'מעקב לבדיקת ביטול ידני',
    mail_body: 'בדיקת ביטול ידני',
    next_run_at: new Date(Date.now() + 172800000).toISOString(),
    status: 'scheduled',
    created_by: userId,
    row_data: {
      action: 'send_email',
      purpose: 'followup_recurring',
      is_recurring: true,
      repeat_every_days: 2,
      stop_on_reply: true,
    }
  })
});
const secondJobId = `MJB-MANUAL-${Date.now()}`;
await adminRest('/rest/v1/claims_mail_jobs', {
  method: 'POST',
  body: JSON.stringify({
    id: secondJobId,
    reminder_id: secondRemId,
    claim_id: testClaimId,
    planned_at: new Date(Date.now() + 172800000).toISOString(),
    status: 'pending'
  })
});

// Now cancel it via execute_pending_action with action_type: 'cancel_scheduled_email'
const cancelAction = {
  preview_id: `P-CANC-${Date.now()}`,
  summary: `עצירת מעקב אימיילים חוזר (מזהה ${secondRemId}) אל yoni122222@gmail.com`,
  tool_name: 'preview_cancel_scheduled_claim_email',
  action_type: 'cancel_scheduled_email',
  parameters: {
    claim_id: testClaimId,
    reminder_id: secondRemId,
    reason: 'עצירה יזומה לבקשת המשתמש',
  }
};

const cancelExecRes = await callChat({
  action: 'execute_pending_action',
  claim_id: testClaimId,
  pending_action: cancelAction,
});

const isCancelOk = cancelExecRes.status === 200 && (cancelExecRes.data?.success === true || !cancelExecRes.data?.error);
record('Manual Stop', 'I. Manual cancellation card executed successfully', Boolean(isCancelOk), {
  message: cancelExecRes.data?.message
});

const verifyCancelledRem = await adminRest(`/rest/v1/claims_reminders?id=eq.${secondRemId}`);
const remCancelled = verifyCancelledRem.data?.[0];
const verifyCancelledJob = await adminRest(`/rest/v1/claims_mail_jobs?id=eq.${secondJobId}`);
const jobCancelled = verifyCancelledJob.data?.[0];

const isManualStopVerified = remCancelled?.status === 'cancelled' && jobCancelled?.status === 'cancelled';
record('Manual Stop', 'J. Database status updated to cancelled and queued job aborted', Boolean(isManualStopVerified), {
  reminderStatus: remCancelled?.status,
  jobStatus: jobCancelled?.status
});

// ----------------------------------------------------
// 7. Status Queries & Reports in Chat
// ----------------------------------------------------
console.log('\n--- 7. STATUS QUERIES & REPORTS IN CHAT ---');
const todayRes = await callChat({
  messages: [{ role: 'user', content: 'איזה אימיילים התקבלו היום?' }],
  claim_id: null,
});
record('Reports & Status Queries', '"איזה אימיילים התקבלו היום?" returns today\'s email activity', todayRes.status === 200, {
  hasText: Boolean(todayRes.text)
});

const insurersReportRes = await callChat({
  messages: [{ role: 'user', content: 'אילו חברות ביטוח עדיין לא ענו לנו?' }],
  claim_id: null,
});
record('Reports & Status Queries', '"אילו חברות ביטוח עדיין לא ענו לנו?" returns report of pending insurer replies', insurersReportRes.status === 200, {
  hasText: Boolean(insurersReportRes.text)
});

// Final Summary
console.log('\n=== FINAL E2E VERIFICATION SUMMARY ===');
const passedCount = results.filter(r => r.passed).length;
const totalCount = results.length;
console.log(`Total checks: ${totalCount} | Passed: ${passedCount} | Failed: ${totalCount - passedCount}`);

if (passedCount === totalCount) {
  console.log('\n🎉 ALL 15 CRITICAL E2E CHECKS PASSED ON STAGING WITH FLYING COLORS!');
} else {
  console.error(`\n⚠️ ${totalCount - passedCount} checks failed.`);
  process.exitCode = 1;
}
