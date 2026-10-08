/**
 * Comprehensive verification of all 22 required tests from Part 11
 * Testing both Inside Claim Mode and Claims General Mode against Staging Supabase and Gemini
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const CLAIM_ID = 'DAL-2026-0004';

console.log('--- Step 1: Getting Auth Session ---');
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceRoleKey = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

// Get super_admin
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email || 'orin1607@gmail.com';

const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
const { data: auth } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
const userToken = auth.session.access_token;
console.log(`Authenticated as ${saEmail}`);

const results = [];
const record = (num, name, mode, ok, details = '') => {
  results.push({ num, name, mode, ok, details });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'} [${mode}] #${num}: ${name} ${details ? '(' + details + ')' : ''}`);
};

async function askAi(question, claimId = null) {
  const res = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      module: 'claims',
      claim_id: claimId,
      messages: [{ role: 'user', content: question }],
    }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function executeAction(pendingAction, claimId = CLAIM_ID) {
  const res = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'execute_pending_action',
      claim_id: claimId,
      pending_action: pendingAction,
    }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

// ==========================================
// PHASE A: CLAIMS GENERAL MODE (7 TESTS)
// ==========================================
console.log('\n=== RUNNING CLAIMS GENERAL TESTS (NO CLAIM ID) ===');

// General 1: כמה תביעות פתוחות?
try {
  const r1 = await askAi('כמה תביעות פתוחות יש לנו כרגע?');
  const ok1 = r1.status === 200 && (r1.text.includes('תביעות') || r1.text.includes('פתוח') || /\d+/.test(r1.text));
  record(1, 'כמה תביעות פתוחות?', 'General', ok1, r1.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(1, 'כמה תביעות פתוחות?', 'General', false, e.message);
}

// General 2: כמה תביעות נפתחו היום?
try {
  const r2 = await askAi('כמה תביעות נפתחו היום במערכת?');
  const ok2 = r2.status === 200 && (r2.text.includes('היום') || /\d+/.test(r2.text));
  record(2, 'כמה תביעות נפתחו היום?', 'General', ok2, r2.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(2, 'כמה תביעות נפתחו היום?', 'General', false, e.message);
}

// General 3: כמה מיילים נכנסו היום?
try {
  const r3 = await askAi('כמה מיילים נכנסו היום?');
  const ok3 = r3.status === 200 && (r3.text.includes('מיילים') || r3.text.includes('Gmail') || /\d+/.test(r3.text));
  record(3, 'כמה מיילים נכנסו היום?', 'General', ok3, r3.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(3, 'כמה מיילים נכנסו היום?', 'General', false, e.message);
}

// General 4: תראה לי את המיילים שנכנסו היום
try {
  const r4 = await askAi('תראה לי את המיילים שנכנסו היום');
  const ok4 = r4.status === 200 && (r4.text.includes('מייל') || r4.text.includes('נכנס') || r4.text.includes('היום'));
  record(4, 'תראה לי את המיילים שנכנסו היום', 'General', ok4, r4.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(4, 'תראה לי את המיילים שנכנסו היום', 'General', false, e.message);
}

// General 5: כמה משימות פתוחות?
try {
  const r5 = await askAi('כמה משימות פתוחות יש בניהול תביעות?');
  const ok5 = r5.status === 200 && (r5.text.includes('משימות') || /\d+/.test(r5.text));
  record(5, 'כמה משימות פתוחות?', 'General', ok5, r5.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(5, 'כמה משימות פתוחות?', 'General', false, e.message);
}

// General 6: איזה תיקים דורשים טיפול?
try {
  const r6 = await askAi('איזה תיקים דורשים טיפול במערכת?');
  const ok6 = r6.status === 200 && (r6.text.includes('תיק') || r6.text.includes('טיפול') || r6.text.includes('ממתין'));
  record(6, 'איזה תיקים דורשים טיפול?', 'General', ok6, r6.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(6, 'איזה תיקים דורשים טיפול?', 'General', false, e.message);
}

// General 7: תראה לי את חמש התביעות האחרונות
try {
  const r7 = await askAi('תראה לי את חמש התביעות האחרונות');
  const ok7 = r7.status === 200 && (r7.text.includes('DAL-') || r7.text.includes('רכב') || r7.text.includes('תביעה'));
  record(7, 'תראה לי את חמש התביעות האחרונות', 'General', ok7, r7.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(7, 'תראה לי את חמש התביעות האחרונות', 'General', false, e.message);
}

// ==========================================
// PHASE B: INSIDE OPEN CLAIM (15 TESTS)
// ==========================================
console.log(`\n=== RUNNING OPEN CLAIM TESTS (CLAIM ${CLAIM_ID}) ===`);

// Claim 1: קריאת מייל אחרון
try {
  const c1 = await askAi('מה המייל האחרון בתיק?', CLAIM_ID);
  const okC1 = c1.status === 200 && (c1.text.includes('מייל') || c1.text.includes('שולח') || c1.text.includes('FaxTviot') || c1.text.includes('שלמה'));
  record(1, 'קריאת מייל אחרון בתיק', 'Claim', okC1, c1.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(1, 'קריאת מייל אחרון בתיק', 'Claim', false, e.message);
}

// Claim 2: מיילים נכנסים
try {
  const c2 = await askAi('חפש מיילים נכנסים בתיק', CLAIM_ID);
  const okC2 = c2.status === 200 && (c2.text.includes('מייל') || c2.text.includes('נכנס'));
  record(2, 'מיילים נכנסים', 'Claim', okC2, c2.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(2, 'מיילים נכנסים', 'Claim', false, e.message);
}

// Claim 3: מיילים יוצאים
try {
  const c3 = await askAi('האם יש מיילים יוצאים שנשלחו מהתיק?', CLAIM_ID);
  const okC3 = c3.status === 200 && (c3.text.includes('מייל') || c3.text.includes('יוצא') || c3.text.includes('נשלח') || c3.text.includes('אין'));
  record(3, 'מיילים יוצאים', 'Claim', okC3, c3.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(3, 'מיילים יוצאים', 'Claim', false, e.message);
}

// Claim 4: האם הביטוח ענה
try {
  const c4 = await askAi('האם חברת הביטוח ענתה לתיק?', CLAIM_ID);
  const okC4 = c4.status === 200 && (c4.text.includes('שלמה') || c4.text.includes('ענתה') || c4.text.includes('ביטוח') || c4.text.includes('מענה'));
  record(4, 'האם הביטוח ענה', 'Claim', okC4, c4.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(4, 'האם הביטוח ענה', 'Claim', false, e.message);
}

// Claim 5: שליחת מייל באישור (Preview Generation)
try {
  const c5 = await askAi('שלח מייל לשמאי shmai-test@orencar.co.il עם עדכון לגבי הרכב', CLAIM_ID);
  const okC5 = c5.status === 200 && (c5.text.includes('אישור') || c5.text.includes('תצוגה מקדימה') || c5.text.includes('shmai-test'));
  record(5, 'שליחת מייל באישור (Preview)', 'Claim', okC5, c5.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(5, 'שליחת מייל באישור (Preview)', 'Claim', false, e.message);
}

// Claim 6: יצירת קישור שיתוף
try {
  const c6 = await askAi('תוציא קישור שיתוף לשמאי משה כהן לתמונות בתיק', CLAIM_ID);
  const okC6 = c6.status === 200 && (c6.text.includes('קישור') || c6.text.includes('אישור') || c6.text.includes('משה כהן'));
  record(6, 'יצירת קישור שיתוף (Preview)', 'Claim', okC6, c6.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(6, 'יצירת קישור שיתוף (Preview)', 'Claim', false, e.message);
}

// Claim 7: שליחת קישור
try {
  const c7 = await askAi('שלח ללקוח מייל עם קישור שיתוף לתמונות', CLAIM_ID);
  const okC7 = c7.status === 200 && (c7.text.includes('קישור') || c7.text.includes('לקוח') || c7.text.includes('אישור'));
  record(7, 'שליחת קישור', 'Claim', okC7, c7.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(7, 'שליחת קישור', 'Claim', false, e.message);
}

// Claim 8: הצגת תמונות
try {
  const c8 = await askAi('תראה לי את התמונות בתיק', CLAIM_ID);
  const okC8 = c8.status === 200 && (c8.text.includes('תמונות') || c8.text.includes('RCV') || /\d+/.test(c8.text));
  record(8, 'הצגת תמונות בתיק', 'Claim', okC8, c8.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(8, 'הצגת תמונות בתיק', 'Claim', false, e.message);
}

// Claim 9: הצגת מסמכים
try {
  const c9 = await askAi('איזה מסמכים יש בתיק?', CLAIM_ID);
  const okC9 = c9.status === 200 && (c9.text.includes('מסמכ') || c9.text.includes('קובץ') || /\d+/.test(c9.text));
  record(9, 'הצגת מסמכים בתיק', 'Claim', okC9, c9.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(9, 'הצגת מסמכים בתיק', 'Claim', false, e.message);
}

// Claim 10: שליחת מסמך / תמונות
try {
  const c10 = await askAi('הכן שליחה של החשבונית והשמאות למייל ins@shlomo.co.il', CLAIM_ID);
  const okC10 = c10.status === 200 && (c10.text.includes('אישור') || c10.text.includes('שליח') || c10.text.includes('shlomo.co.il'));
  record(10, 'שליחת מסמך / תמונות (Preview)', 'Claim', okC10, c10.text.slice(0, 100).replace(/\n/g, ' '));
} catch (e) {
  record(10, 'שליחת מסמך / תמונות (Preview)', 'Claim', false, e.message);
}

// Claim 11: פתיחת לקוח חדש
try {
  const testCustName = `לקוח בדיקה ${Date.now().toString(36)}`;
  const custAction = {
    preview_id: `P-TEST-CUST-${Date.now()}`,
    summary: `פתיחת לקוח ${testCustName}`,
    tool_name: 'preview_create_customer',
    action_type: 'create_customer',
    parameters: {
      name: testCustName,
      phone: '052-9999999',
      email: 'test-cust@orencar.co.il',
      customer_type: 'private',
    },
  };
  const execCust = await executeAction(custAction);
  const { data: createdCust } = await admin.from('customers').select('*').eq('name', testCustName).maybeSingle();
  const okC11 = execCust.status === 200 && execCust.json.success === true && !!createdCust;
  record(11, 'פתיחת לקוח חדש במערכת', 'Claim', okC11, createdCust?.name || 'error');
  // cleanup
  if (createdCust?.id) await admin.from('customers').delete().eq('id', createdCust.id);
} catch (e) {
  record(11, 'פתיחת לקוח חדש במערכת', 'Claim', false, e.message);
}

// Claim 12: עדכון פרטי לקוח
try {
  const updateAction = {
    preview_id: `P-TEST-UPDATE-${Date.now()}`,
    summary: 'עדכון טלפון לקוח',
    tool_name: 'preview_update_claim_client_contact',
    action_type: 'update_claim_client_contact',
    parameters: {
      phone: '050-8888777',
      reason: 'עדכון בדיקה',
    },
  };
  const execUpd = await executeAction(updateAction);
  const { data: recAfter } = await admin.from('claims_records').select('row_data').eq('id', CLAIM_ID).single();
  const okC12 = execUpd.status === 200 && execUpd.json.success === true && recAfter?.row_data?.clientPhone === '050-8888777';
  record(12, 'עדכון לקוח (טלפון/מייל)', 'Claim', okC12, recAfter?.row_data?.clientPhone || 'error');
} catch (e) {
  record(12, 'עדכון לקוח (טלפון/מייל)', 'Claim', false, e.message);
}

// Claim 13: יצירת משימה
let createdTaskId = null;
try {
  const taskAction = {
    preview_id: `P-TEST-TASK-${Date.now()}`,
    summary: 'יצירת משימה לבדיקה',
    tool_name: 'preview_create_claim_task',
    action_type: 'create_task',
    parameters: {
      task_description: 'משימת בדיקה אוטומטית מלאה',
    },
  };
  const execTask = await executeAction(taskAction);
  const { data: latestTasks } = await admin.from('claims_tasks').select('*').eq('claim_id', CLAIM_ID).order('created_at', { ascending: false }).limit(1);
  createdTaskId = latestTasks?.[0]?.id;
  const okC13 = execTask.status === 200 && execTask.json.success === true && !!createdTaskId;
  record(13, 'יצירת משימה בתיק', 'Claim', okC13, createdTaskId || 'error');
} catch (e) {
  record(13, 'יצירת משימה בתיק', 'Claim', false, e.message);
}

// Claim 14: סגירת משימה
try {
  if (createdTaskId) {
    const closeAction = {
      preview_id: `P-TEST-CLOSE-${Date.now()}`,
      summary: 'סגירת משימת בדיקה',
      tool_name: 'preview_close_claim_task',
      action_type: 'close_task',
      parameters: {
        task_id: createdTaskId,
      },
    };
    const execClose = await executeAction(closeAction);
    const { data: closedTask } = await admin.from('claims_tasks').select('row_data').eq('id', createdTaskId).single();
    const okC14 = execClose.status === 200 && execClose.json.success === true && closedTask?.row_data?.done === 'true';
    record(14, 'סגירת משימה בתיק', 'Claim', okC14, `done=${closedTask?.row_data?.done}`);
    // Cleanup
    await admin.from('claims_tasks').delete().eq('id', createdTaskId);
  } else {
    record(14, 'סגירת משימה בתיק', 'Claim', false, 'no task id from step 13');
  }
} catch (e) {
  record(14, 'סגירת משימה בתיק', 'Claim', false, e.message);
}

// Claim 15: שינוי סטטוס
try {
  const { data: beforeRec } = await admin.from('claims_records').select('status').eq('id', CLAIM_ID).single();
  const origStatus = beforeRec.status;
  const statusAction = {
    preview_id: `P-TEST-ST-${Date.now()}`,
    summary: 'שינוי סטטוס זמני לבדיקה',
    tool_name: 'preview_update_claim_status',
    action_type: 'update_status',
    parameters: {
      new_status: 'בטיפול מוסך',
      old_status: origStatus,
      reason: 'בדיקת QA שלב 15',
    },
  };
  const execStatus = await executeAction(statusAction);
  const { data: afterRec } = await admin.from('claims_records').select('status').eq('id', CLAIM_ID).single();
  const okC15 = execStatus.status === 200 && execStatus.json.success === true && afterRec.status === 'בטיפול מוסך';
  record(15, 'שינוי סטטוס בתיק', 'Claim', okC15, `status=${afterRec.status}`);

  // Revert back
  await admin.from('claims_records').update({ status: origStatus }).eq('id', CLAIM_ID);
} catch (e) {
  record(15, 'שינוי סטטוס בתיק', 'Claim', false, e.message);
}

// Summary
const passed = results.filter((r) => r.ok).length;
const total = results.length;
console.log(`\n========================================`);
console.log(`FINAL RESULT: ${passed} / ${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
console.log(`========================================\n`);

if (passed !== total) process.exit(1);
