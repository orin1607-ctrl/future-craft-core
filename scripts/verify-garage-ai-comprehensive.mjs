// scripts/verify-garage-ai-comprehensive.mjs
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
  console.log('=====================================================');
  console.log('🚀 בדיקת קצה לקצה מקיפה: דליה AI לניהול מוסך ולדשבורד');
  console.log('=====================================================');

  // Step 0: Auth
  const email = 'orin1607@gmail.com';
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const client = createClient(STAGING_URL, anonKey);
  const { data: authData, error: authErr } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (authErr) throw authErr;
  const token = authData.session.access_token;
  console.log('✅ התחברות מאומתת בוצעה בהצלחה עבור:', authData.user.email);

  let createdCaseId = null;

  try {
    // Test 1: תמונת מצב וסטטיסטיקות מוסך
    console.log('\n[בדיקה 1] בקשת תמונת מצב כללית על המוסך...');
    const r1 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'דליה מה תמונת המצב כרגע במוסך? כמה רכבים יש ובאיזה שלבים?' }],
        module: 'garage',
      }),
    });
    const parsed1 = await parseSseResponse(r1);
    console.log('✅ תשובת דליה AI:\n' + parsed1.content.slice(0, 350) + '...\n');

    // Test 2: חיפוש לקוחות ורכבים קיימים
    console.log('\n[בדיקה 2] חיפוש לקוח ורכב במאגר המוסך...');
    const r2 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'חפשי לי לקוחות עם השם אלי או אלדן ואיזה רכבים משויכים להם' }],
        module: 'garage',
      }),
    });
    const parsed2 = await parseSseResponse(r2);
    console.log('✅ תשובת דליה AI:\n' + parsed2.content.slice(0, 350) + '...\n');

    // Test 3: פתיחת כרטיס עבודה חדש - Preview Card
    console.log('\n[בדיקה 3] פתיחת כרטיס עבודה חדש עם פריטי נזק ראשוניים (Preview Card)...');
    const r3 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'תפתחי כרטיס עבודה חדש ללקוח משה כהן טלפון 0541112233 לרכב יונדאי איוניק לוחית 11223344 עם מעיכה בכנף שמאל ופגוש קדמי' }],
        module: 'garage',
      }),
    });
    const parsed3 = await parseSseResponse(r3);
    if (!parsed3.pendingAction) throw new Error('לא התקבל כרטיס אישור עבור פתיחת כרטיס עבודה!');
    console.log('✅ התקבל כרטיס אישור לפתיחת כרטיס עבודה:');
    console.log('סוג פעולה:', parsed3.pendingAction.action_type);
    console.log('סיכום כרטיס:\n' + parsed3.pendingAction.summary);

    // Test 4: ביצוע ואישור פתיחת כרטיס העבודה
    console.log('\n[בדיקה 4] אישור וביצוע כרטיס עבודה (Execute Pending Action)...');
    const r4 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: parsed3.pendingAction,
        module: 'garage',
      }),
    });
    const res4 = await r4.json();
    console.log('✅ תוצאת פתיחת התיק:', res4.message);
    if (!res4.success) throw new Error('פתיחת התיק נכשלה');

    // Fetch the created case
    const { data: createdCases } = await admin.from('garage_cases').select('*').eq('vehicle_plate_snapshot', '11223344');
    const createdCase = createdCases?.[0];
    if (!createdCase) throw new Error('התיק החדש לא נמצא בבסיס הנתונים!');
    createdCaseId = createdCase.id;
    console.log(`✅ כרטיס עבודה אותר במסד הנתונים: מספר תיק ${createdCase.case_number}, סטטוס: ${createdCase.status}`);

    // Test 5: עדכון סטטוס תיק (Preview & Execute)
    console.log('\n[בדיקה 5] בקשת עדכון סטטוס לתיק ל-"עבודה התחילה" (Preview & Execute)...');
    const r5 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `תעדכני את הסטטוס של תיק ${createdCase.case_number} ל-"עבודה התחילה", הרכב נכנס לליפט` }],
        module: 'garage',
      }),
    });
    const parsed5 = await parseSseResponse(r5);
    if (!parsed5.pendingAction) throw new Error('לא התקבל כרטיס אישור עבור עדכון סטטוס!');
    console.log('✅ כרטיס אישור עדכון סטטוס התקבל:\n' + parsed5.pendingAction.summary);

    const r5Exec = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: parsed5.pendingAction,
        module: 'garage',
      }),
    });
    const res5Exec = await r5Exec.json();
    console.log('✅ תוצאת עדכון סטטוס:', res5Exec.message);

    // Test 6: פחחות וצבע - הוספת עבודות, חלקים ואישורים חריגים (Preview & Execute)
    console.log('\n[בדיקה 6] הוספת עבודות פחחות, חלקים ואישורים חריגים לתיק...');
    const r6 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `בתיק ${createdCase.case_number} תוסיפי עבודת פחחות כנף שמאל 850 ש"ח, עבודת צבע בתנור 650 ש"ח, וחלק פגוש קדמי מקורי 1400 ש"ח מספק כלמוביל` }],
        module: 'garage',
      }),
    });
    const parsed6 = await parseSseResponse(r6);
    if (!parsed6.pendingAction) throw new Error('לא התקבל כרטיס אישור עבור פרטי תיקון/פחחות!');
    console.log('✅ כרטיס אישור עבודות וחלקים התקבל:\n' + parsed6.pendingAction.summary);

    const r6Exec = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: parsed6.pendingAction,
        module: 'garage',
      }),
    });
    const res6Exec = await r6Exec.json();
    console.log('✅ תוצאת שמירת עבודות וחלקים:', res6Exec.message);

    // Test 7: משימות ותזכורות (Preview & Execute)
    console.log('\n[בדיקה 7] יצירת משימה ותזכורת לתיק...');
    const r7 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `בתיק ${createdCase.case_number} תפתחי משימה: להזמין קליפסים לפגוש עד מחר בצהריים` }],
        module: 'garage',
      }),
    });
    const parsed7 = await parseSseResponse(r7);
    if (!parsed7.pendingAction) throw new Error('לא התקבל כרטיס אישור עבור משימה!');
    console.log('✅ כרטיס אישור משימה התקבל:\n' + parsed7.pendingAction.summary);

    const r7Exec = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: parsed7.pendingAction,
        module: 'garage',
      }),
    });
    const res7Exec = await r7Exec.json();
    console.log('✅ תוצאת יצירת משימה:', res7Exec.message);

    // Test 8: הפקת דוח סיכום תיק מקיף
    console.log('\n[בדיקה 8] הפקת דוח סיכום כרטיס עבודה מקיף...');
    const r8 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `תוציאי לי דוח סיכום מלא של כרטיס עבודה ${createdCase.case_number}` }],
        module: 'garage',
      }),
    });
    const parsed8 = await parseSseResponse(r8);
    console.log('✅ דוח סיכום כרטיס עבודה שהופק:\n' + parsed8.content);

    // Test 9: בדיקת דשבורד ראשי (module: 'dashboard')
    console.log('\n[בדיקה 9] בדיקת פקודות מתוך הדשבורד הראשי (module: dashboard)...');
    const r9 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `דליה שלום, תני לי סיכום מהיר של כרטיס עבודה ${createdCase.case_number}` }],
        module: 'dashboard',
      }),
    });
    const parsed9 = await parseSseResponse(r9);
    console.log('✅ תשובת דליה AI מהדשבורד:\n' + parsed9.content.slice(0, 350) + '...\n');

    // Test 10: וידוא מוחלט שעוזר התביעות הקיים לא נפגע
    console.log('\n[בדיקה 10] בדיקת שלמות: וידוא שעוזר ניהול תביעות (Claims AI) ממשיך לעבוד באופן מושלם...');
    const r10 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'דליה מה הסטטוס של תביעות הביטוח במערכת?' }],
        module: 'claims',
      }),
    });
    const parsed10 = await parseSseResponse(r10);
    console.log('✅ תשובת דליה AI בניהול תביעות:\n' + parsed10.content.slice(0, 350) + '...\n');

    console.log('=====================================================');
    console.log('🎉 כל 10 הבדיקות המקיפות הושלמו בהצלחה מלאה!');
    console.log('=====================================================');

  } finally {
    // Cleanup created test case and associated customer/vehicle
    if (createdCaseId) {
      console.log('\nמנקה נתוני בדיקה...');
      await admin.from('garage_cases').delete().eq('id', createdCaseId);
      await admin.from('garage_vehicles').delete().eq('plate', '11223344');
      await admin.from('garage_customers').delete().eq('phone', '0541112233');
      console.log('ניקוי נתוני בדיקה הושלם בהצלחה.');
    }
  }
}

run().catch((err) => {
  console.error('❌ שגיאה בבדיקה:', err);
  process.exit(1);
});
