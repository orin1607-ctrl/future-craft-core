// scripts/verify-garage-ai-expansion-e2e.mjs
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find(k => k.name === 'service_role' && k.type === 'legacy').api_key;
const anonKey = keys.find(k => k.name === 'anon' && k.type === 'legacy').api_key;

const admin = createClient(STAGING_URL, serviceKey);

async function parseSseResponse(res) {
  const text = await res.text();
  const lines = text.split('\n');
  let content = '';
  let pendingAction = null;
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const json = JSON.parse(line.slice(6));
        if (json.choices?.[0]?.delta?.content) {
          content += json.choices[0].delta.content;
        }
        if (json.pendingAction || json.pending_action) {
          pendingAction = json.pendingAction || json.pending_action;
        }
      } catch (e) {}
    }
  }
  return { content, pendingAction, raw: text };
}

async function run() {
  console.log('======================================================================');
  console.log('🚀 בדיקת קצה-לקצה מקיפה של הרחבות דליה AI למוסך בסביבת STAGING');
  console.log('======================================================================');

  // Auth
  const email = 'orin1607@gmail.com';
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const client = createClient(STAGING_URL, anonKey);
  const { data: authData, error: authErr } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (authErr) throw authErr;
  const token = authData.session.access_token;
  console.log('✅ מחובר בהצלחה ל-STAGING בתור:', authData.user.email);

  async function executeAction(pendingAction, garageCaseId = null) {
    const res = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: pendingAction,
        module: 'garage',
        garage_case_id: garageCaseId,
      }),
    });
    return await res.json();
  }

  const testPlate = '77112233';
  const testOrderNumber = `ORD-QA-${Date.now().toString().slice(-5)}`;
  let testCustomerId = null;
  let testVehicleId = null;
  let testCaseId = null;
  let testOrderId = null;

  try {
    // -------------------------------------------------------------
    // בדיקה 1: קליטת רכב ולקוח מרישיון רכב (Onboard from Vehicle License)
    // -------------------------------------------------------------
    console.log('\n[בדיקה 1] קליטת רכב ולקוח מרישיון רכב...');
    const r1 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `קלוט רכב מרישיון רכב: לוחית ${testPlate}, טויוטה קורולה שנת 2022 צבע כסוף, בעל הרכב: ישראל ישראלי ת.ז 012345678, בתוקף עד 01/2027. תלונה: רעידות בבלימה` }],
        module: 'garage',
      }),
    });
    const s1 = await parseSseResponse(r1);
    console.log('תשובת העוזר:', s1.content.slice(0, 150) + '...');
    if (!s1.pendingAction || s1.pendingAction.action_type !== 'garage_onboard_from_license') {
      throw new Error(`צפוי כרטיס אישור garage_onboard_from_license אך התקבל: ${JSON.stringify(s1.pendingAction)}`);
    }
    console.log('✅ כרטיס אישור קליטה נוצר בהצלחה:', s1.pendingAction.summary);

    // ביצוע ואישור הפעולה
    console.log('מאשר ומבצע את קליטת הרישיון...');
    const res1Exec = await executeAction(s1.pendingAction);
    console.log('תשובת ביצוע:', res1Exec.message);
    if (!res1Exec.success) throw new Error(`ביצוע קליטה נכשל: ${res1Exec.error}`);

    // אימות במסד הנתונים
    const { data: vRow } = await admin.from('garage_vehicles').select('*').eq('plate', testPlate).single();
    if (!vRow) throw new Error('הרכב לא נוצר בטבלת garage_vehicles');
    testVehicleId = vRow.id;
    testCustomerId = vRow.customer_id;
    console.log('✅ רכב נוצר ב-garage_vehicles:', vRow.plate, vRow.make, vRow.model);

    const { data: cRow } = await admin.from('garage_customers').select('*').eq('id', testCustomerId).single();
    if (!cRow) throw new Error('הלקוח לא נוצר בטבלת garage_customers');
    console.log('✅ לקוח נוצר ב-garage_customers:', cRow.name, cRow.business_id);

    const { data: caseRows } = await admin.from('garage_cases').select('*').eq('vehicle_plate_snapshot', testPlate).order('created_at', { ascending: false });
    if (!caseRows || caseRows.length === 0) throw new Error('תיק המוסך לא נוצר ב-garage_cases');
    testCaseId = caseRows[0].id;
    console.log('✅ כרטיס עבודה נפתח ב-garage_cases:', caseRows[0].case_number, 'סטטוס:', caseRows[0].status);

    // -------------------------------------------------------------
    // בדיקה 2: קליטת הזמנת עבודה של לקוח (Customer Work Order Ingestion)
    // -------------------------------------------------------------
    console.log('\n[בדיקה 2] קליטת הזמנת עבודה של לקוח לטבלת garage_orders ולתיק...');
    const r2 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `קלוט הזמנת לקוח מס' ${testOrderNumber} עבור רכב ${testPlate}: סכום מאושר 1,800 ש"ח, איש קשר דניאל, נהג יוסי, תיאור: טיפול 30,000 והחלפת רפידות בלם` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const s2 = await parseSseResponse(r2);
    if (!s2.pendingAction || s2.pendingAction.action_type !== 'garage_create_customer_order') {
      throw new Error(`צפוי כרטיס אישור garage_create_customer_order אך התקבל: ${JSON.stringify(s2.pendingAction)}`);
    }
    console.log('✅ כרטיס אישור הזמנה נוצר בהצלחה:', s2.pendingAction.summary);

    // ביצוע ואישור הזמנת עבודה
    const res2Exec = await executeAction(s2.pendingAction, testCaseId);
    console.log('תשובת ביצוע הזמנה:', res2Exec.message);
    if (!res2Exec.success) throw new Error(`ביצוע הזמנה נכשל: ${res2Exec.error}`);

    // אימות בטבלת garage_orders
    const { data: oRow } = await admin.from('garage_orders').select('*').eq('order_number', testOrderNumber).single();
    if (!oRow) throw new Error('ההזמנה לא נמצאה בטבלת garage_orders');
    testOrderId = oRow.id;
    console.log('✅ הזמנה נשמרה ב-garage_orders:', oRow.order_number, 'סכום:', oRow.approved_amount, 'סטטוס:', oRow.status);

    // -------------------------------------------------------------
    // בדיקה 3: הצעת מחיר רב-שורתית רציפה + חישוב מע"מ 17%
    // -------------------------------------------------------------
    console.log('\n[בדיקה 3] עריכת הצעת מחיר רב-שורתית ברצף (פחחות, צבע, מכונאות וחלקים)...');
    const r3 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `עדכן הצעת מחיר לתיק ${testCaseId}: עבודת פחחות כנף 500 ש"ח, צבע כנף 500 ש"ח, עבודה מכנית החלפת בלמים 300 ש"ח, סט רפידות בלם מקוריות 400 ש"ח` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const s3 = await parseSseResponse(r3);
    if (!s3.pendingAction || s3.pendingAction.action_type !== 'garage_update_repair_details') {
      throw new Error(`צפוי כרטיס אישור garage_update_repair_details אך התקבל: ${JSON.stringify(s3.pendingAction)}`);
    }
    console.log('✅ כרטיס אישור הצעת מחיר נוצר בהצלחה:', s3.pendingAction.summary);

    // ביצוע ואישור
    const res3Exec = await executeAction(s3.pendingAction, testCaseId);
    if (!res3Exec.success) throw new Error(`עדכון הצעת מחיר נכשל: ${res3Exec.error}`);
    console.log('✅ הצעת מחיר עודכנה בתיק');

    // -------------------------------------------------------------
    // בדיקה 4: שליחת הצעת מחיר ללקוח (Send Quote Preview)
    // -------------------------------------------------------------
    console.log('\n[בדיקה 4] שליחת הצעת מחיר ללקוח בערוץ WhatsApp עם מע"מ 17%...');
    const r4 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `שלחי את הצעת המחיר ללקוח בווטסאפ לתיק ${testCaseId}` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const s4 = await parseSseResponse(r4);
    if (!s4.pendingAction || s4.pendingAction.action_type !== 'garage_send_quote') {
      throw new Error(`צפוי כרטיס אישור garage_send_quote אך התקבל: ${JSON.stringify(s4.pendingAction)}`);
    }
    console.log('✅ כרטיס אישור שליחה נוצר:', s4.pendingAction.summary);
    // אימות חישוב מע"מ 17%: סכום 1,700 ₪, מע"מ 289 ₪, סה"כ 1,989 ₪
    const pVat = s4.pendingAction.parameters.vat;
    const pTotal = s4.pendingAction.parameters.grand_total;
    console.log(`סכום ביניים: ₪${s4.pendingAction.parameters.subtotal}, מע"מ (17%): ₪${pVat}, סה"כ: ₪${pTotal}`);
    if (pVat !== 289 || pTotal !== 1989) {
      throw new Error(`חישוב מע"מ 17% שגוי: צפוי מע"מ 289 וסה"כ 1989, התקבל מע"מ ${pVat} וסה"כ ${pTotal}`);
    }
    console.log('✅ חישוב מע"מ 17% אומת בהצלחה בדיוק מרבי');

    // ביצוע שליחה
    const res4Exec = await executeAction(s4.pendingAction, testCaseId);
    if (!res4Exec.success) throw new Error(`שליחת הצעה נכשלה: ${res4Exec.error}`);
    console.log('✅ הצעת מחיר נשלחה והסטטוס עודכן ל-הצעה נשלחה');

    // -------------------------------------------------------------
    // בדיקה 5: אישור לקוח להצעה ועדכון סטטוס ל-'אושר לביצוע'
    // -------------------------------------------------------------
    console.log('\n[בדיקה 5] רישום אישור לקוח להצעת מחיר...');
    const r5 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `רשמי שהלקוח ישראל ישראלי אישר את הצעת המחיר לתיק ${testCaseId}` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const s5 = await parseSseResponse(r5);
    if (!s5.pendingAction || s5.pendingAction.action_type !== 'garage_approve_quote') {
      throw new Error(`צפוי כרטיס אישור garage_approve_quote אך התקבל: ${JSON.stringify(s5.pendingAction)}`);
    }
    console.log('✅ כרטיס רישום אישור לקוח נוצר:', s5.pendingAction.summary);

    // ביצוע אישור לקוח
    const res5Exec = await executeAction(s5.pendingAction, testCaseId);
    if (!res5Exec.success) throw new Error(`אישור לקוח נכשל: ${res5Exec.error}`);

    // בדיקת עדכון הסטטוס ב-garage_cases וב-garage_orders
    const { data: updatedCase } = await admin.from('garage_cases').select('status, case_data').eq('id', testCaseId).single();
    if (updatedCase.status !== 'אושר לביצוע') {
      throw new Error(`סטטוס תיק צפוי להיות 'אושר לביצוע' אך נמצא: ${updatedCase.status}`);
    }
    console.log('✅ סטטוס כרטיס העבודה עודכן ל:', updatedCase.status);

    const { data: updatedOrder } = await admin.from('garage_orders').select('status').eq('id', testOrderId).single();
    if (updatedOrder?.status !== 'approved') {
      throw new Error(`סטטוס הזמנה צפוי להיות 'approved' אך נמצא: ${updatedOrder?.status}`);
    }
    console.log('✅ סטטוס הזמנת העבודה עודכן ל:', updatedOrder?.status);

    // -------------------------------------------------------------
    // בדיקה 6: יצירת משימה בטבלת garage_tasks
    // -------------------------------------------------------------
    console.log('\n[בדיקה 6] יצירת משימה ושמירתה בטבלת garage_tasks ובתיק...');
    const r6 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `צרי משימה: להזמין סט רפידות בלם מקוריות למחר בבוקר` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const s6 = await parseSseResponse(r6);
    if (!s6.pendingAction || s6.pendingAction.action_type !== 'garage_create_task') {
      throw new Error(`צפוי כרטיס אישור garage_create_task אך התקבל: ${JSON.stringify(s6.pendingAction)}`);
    }

    // ביצוע משימה
    const res6Exec = await executeAction(s6.pendingAction, testCaseId);
    if (!res6Exec.success) throw new Error(`יצירת משימה נכשלה: ${res6Exec.error}`);

    const { data: taskRow } = await admin.from('garage_tasks').select('*').eq('case_id', testCaseId).limit(1);
    if (!taskRow || taskRow.length === 0) {
      throw new Error('המשימה לא נמצאה בטבלת garage_tasks');
    }
    console.log('✅ משימה נוצרה בטבלת garage_tasks:', taskRow[0].title);

    console.log('\n======================================================================');
    console.log('🎉 כל 6 בדיקות ה-E2E של הרחבות דליה AI למוסך עברו בהצלחה מלאה ב-STAGING!');
    console.log('======================================================================');

  } finally {
    // Cleanup test records
    console.log('\n🧹 מנקה רשומות בדיקה שנוצרו ב-STAGING...');
    if (testOrderId) await admin.from('garage_orders').delete().eq('id', testOrderId);
    if (testCaseId) {
      await admin.from('garage_tasks').delete().eq('case_id', testCaseId);
      await admin.from('garage_cases').delete().eq('id', testCaseId);
    }
    if (testVehicleId) await admin.from('garage_vehicles').delete().eq('id', testVehicleId);
    if (testCustomerId) await admin.from('garage_customers').delete().eq('id', testCustomerId);
    console.log('✅ ניקוי הושלם. סביבת STAGING נקייה.');
  }
}

run().catch((err) => {
  console.error('❌ שגיאה בבדיקת E2E:', err);
  process.exit(1);
});
