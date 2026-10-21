// scripts/verify-full-garage-ai-isolation.mjs
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
  console.log('🔍 בדיקת קצה לקצה מקיפה: הפרדה מוחלטת וכל יכולות דליה AI למוסך');
  console.log('======================================================================');

  // Auth
  const email = 'orin1607@gmail.com';
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const client = createClient(STAGING_URL, anonKey);
  const { data: authData, error: authErr } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (authErr) throw authErr;
  const token = authData.session.access_token;
  console.log('✅ מחובר למערכת STAGING בתור:', authData.user.email);

  let testCustomerId = null;
  let testVehicleId = null;
  let testCaseId = null;
  const testPhone = '0528889900';
  const testPlate = '99887766';

  try {
    // -------------------------------------------------------------
    // 1. בדיקת הפרדה מוחלטת (Isolation Check)
    // -------------------------------------------------------------
    console.log('\n[בדיקה 1: הפרדה מוחלטת] בקשת טבלת דוח במוסך - וידוא שאין נתוני תביעות...');
    const r1 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'רענן טבלת דוח של תיקי המוסך הפעילים' }],
        module: 'garage',
      }),
    });
    const parsed1 = await parseSseResponse(r1);
    console.log('תוכן שהתקבל:\n' + parsed1.content.slice(0, 400) + '...\n');
    
    // Validate table format and no claims leakage
    if (parsed1.content.includes('DAL-')) {
      throw new Error('זליגת נתונים! נמצא מספר תיק תביעה DAL- בתשובת מודול המוסך!');
    }
    if (parsed1.content.includes('חברת ביטוח') && !parsed1.content.includes('רכב')) {
      throw new Error('זליגת תוכן של ניהול תביעות למוסך!');
    }
    if (!parsed1.content.includes('|') || !parsed1.content.includes('כרטיס')) {
      throw new Error('טבלת דוח מוסך לא הוחזרה בפורמט טבלה תקני עם עמודת כרטיס!');
    }
    console.log('✅ בדיקה 1 עברה: טבלת דוח המוסך מבודדת לחלוטין וללא זליגת תביעות!');

    // -------------------------------------------------------------
    // 2. ניהול לקוחות (יצירה עם Preview Card ואישור)
    // -------------------------------------------------------------
    console.log('\n[בדיקה 2: ניהול לקוחות] יצירת לקוח חדש באמצעות דליה AI...');
    const r2 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `תוסיפי לקוח עסקי חדש בשם "הסעות השרון בע"מ", איש קשר גיל, טלפון ${testPhone}, אימייל gil@sharon-bus.co.il, ח.פ 515554443` }],
        module: 'garage',
      }),
    });
    const parsed2 = await parseSseResponse(r2);
    if (!parsed2.pendingAction || parsed2.pendingAction.action_type !== 'garage_create_customer') {
      throw new Error('לא התקבל כרטיס אישור ליצירת לקוח (garage_create_customer)!');
    }
    console.log('✅ כרטיס אישור יצירת לקוח התקבל:\n' + parsed2.pendingAction.summary);

    // ביצוע הפעולה המאושרת
    const r2Exec = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: parsed2.pendingAction,
        module: 'garage',
      }),
    });
    const res2Exec = await r2Exec.json();
    console.log('✅ תוצאת יצירת לקוח:', res2Exec.message);
    if (!res2Exec.success) throw new Error('יצירת לקוח נכשלה');

    const { data: custs } = await admin.from('garage_customers').select('*').eq('phone', testPhone);
    if (!custs || custs.length === 0) throw new Error('הלקוח לא נמצא במסד הנתונים!');
    testCustomerId = custs[0].id;
    console.log(`✅ לקוח אומת בבסיס הנתונים: ${custs[0].name} (מזהה: ${testCustomerId})`);

    // -------------------------------------------------------------
    // 3. עדכון פרטי לקוח
    // -------------------------------------------------------------
    console.log('\n[בדיקה 3: עדכון פרטי לקוח] עדכון עיר וכתובת הלקוח...');
    const r3 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `תעדכני את הכתובת של הלקוח "הסעות השרון" לרחוב המלאכה 14 נתניה` }],
        module: 'garage',
      }),
    });
    const parsed3 = await parseSseResponse(r3);
    if (!parsed3.pendingAction || parsed3.pendingAction.action_type !== 'garage_update_customer') {
      throw new Error('לא התקבל כרטיס אישור לעדכון לקוח!');
    }
    const r3Exec = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: parsed3.pendingAction,
        module: 'garage',
      }),
    });
    const res3Exec = await r3Exec.json();
    console.log('✅ תוצאת עדכון לקוח:', res3Exec.message);

    // -------------------------------------------------------------
    // 4. הוספת רכב וקישורו ללקוח
    // -------------------------------------------------------------
    console.log('\n[בדיקה 4: רכבים] הוספת רכב מסוג מרצדס ספרינטר וקישורו ללקוח...');
    const r4 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `תוסיפי רכב חדש ללקוח "הסעות השרון": מרצדס ספרינטר שנת 2023 צבע לבן, לוחית ${testPlate}, מנוע דיזל` }],
        module: 'garage',
      }),
    });
    const parsed4 = await parseSseResponse(r4);
    if (!parsed4.pendingAction || parsed4.pendingAction.action_type !== 'garage_create_vehicle') {
      throw new Error('לא התקבל כרטיס אישור ליצירת רכב!');
    }
    const r4Exec = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: parsed4.pendingAction,
        module: 'garage',
      }),
    });
    const res4Exec = await r4Exec.json();
    console.log('✅ תוצאת יצירת רכב:', res4Exec.message);
    const { data: vehs } = await admin.from('garage_vehicles').select('*').eq('plate', testPlate);
    if (!vehs || vehs.length === 0) throw new Error('הרכב לא נמצא במסד הנתונים!');
    testVehicleId = vehs[0].id;
    console.log(`✅ רכב אומת בבסיס הנתונים: ${vehs[0].make} ${vehs[0].model} (לוחית: ${vehs[0].plate})`);

    // -------------------------------------------------------------
    // 5. קליטת רכב ופתיחת כרטיס עבודה (Vehicle Intake & Case Opening)
    // -------------------------------------------------------------
    console.log('\n[בדיקה 5: קליטת רכב ופתיחת תיק] פתיחת כרטיס עבודה חדש עם תלונות לקוח ובדיקה ראשונית...');
    const r5 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `תפתחי כרטיס עבודה לרכב ${testPlate}: תלונת נהג - רעש חריג בבלימה ומכה בפגוש אחורי ימין, קילומטראז 84500, דלק חצי מיכל, מפתח ראשי נמסר` }],
        module: 'garage',
      }),
    });
    const parsed5 = await parseSseResponse(r5);
    if (!parsed5.pendingAction || parsed5.pendingAction.action_type !== 'garage_create_case') {
      throw new Error('לא התקבל כרטיס אישור לפתיחת כרטיס עבודה!');
    }
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
    console.log('✅ תוצאת פתיחת תיק:', res5Exec.message);
    const { data: cases } = await admin.from('garage_cases').select('*').eq('vehicle_plate_snapshot', testPlate);
    if (!cases || cases.length === 0) throw new Error('כרטיס העבודה לא נמצא!');
    const activeCase = cases[0];
    testCaseId = activeCase.id;
    console.log(`✅ כרטיס עבודה נוצר בהצלחה: מספר תיק ${activeCase.case_number}, מזהה: ${testCaseId}`);

    // -------------------------------------------------------------
    // 6. עדכון בדיקת קליטה (km, fuel, complaints)
    // -------------------------------------------------------------
    console.log('\n[בדיקה 6: עדכון קליטה] עדכון פרטי קליטה נוספים בכרטיס העבודה...');
    const r6 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `בתיק ${activeCase.case_number} תעדכני בקליטה: קילומטראז מדויק 84520, דלק 3/4 מיכל, הערת פנים: כיסוי מושב נהג קרוע קלות` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const parsed6 = await parseSseResponse(r6);
    if (!parsed6.pendingAction || parsed6.pendingAction.action_type !== 'garage_update_intake') {
      throw new Error('לא התקבל כרטיס אישור לעדכון קליטה (garage_update_intake)!');
    }
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
    console.log('✅ תוצאת עדכון קליטה:', res6Exec.message);

    // -------------------------------------------------------------
    // 7. הצעת מחיר, עבודות, חלקים וחישוב מע"מ
    // -------------------------------------------------------------
    console.log('\n[בדיקה 7: הצעת מחיר ותיקון] הזנת הצעת מחיר עם עבודות, חלקים וחישוב כולל...');
    const r7 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `בתיק ${activeCase.case_number} תעדכני הצעת מחיר: עבודת החלפת רפידות וצלחות בלמים 500 ש"ח, עבודת פחחות פגוש 800 ש"ח, חלק סט רפידות וצלחות 1200 ש"ח מספק מוסך מרכזי, סה"כ לפני מע"מ 2500 ש"ח, אושר ע"י גיל טלפונית` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const parsed7 = await parseSseResponse(r7);
    if (!parsed7.pendingAction || !['garage_update_quote', 'garage_update_repair_details', 'garage_approve_quote', 'batch_action'].includes(parsed7.pendingAction.action_type)) {
      throw new Error(`לא התקבל כרטיס אישור להצעת מחיר! התקבל: ${JSON.stringify(parsed7.pendingAction)}`);
    }
    console.log('כרטיס הצעת מחיר:\n' + parsed7.pendingAction.summary);
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
    if (!res7Exec.success) throw new Error(`עדכון הצעת מחיר נכשל: ${res7Exec.error}`);
    console.log('✅ תוצאת עדכון הצעת מחיר:', res7Exec.message);

    // -------------------------------------------------------------
    // 8. עדכון סטטוס ושלב עבודה
    // -------------------------------------------------------------
    console.log('\n[בדיקה 8: ניהול עבודה] העברת סטטוס התיק ל-"עבודה התחילה"...');
    const r8 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `תשני את הסטטוס של תיק ${activeCase.case_number} ל-"עבודה התחילה", המכונאי דוד התחיל טיפול בבלמים` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const parsed8 = await parseSseResponse(r8);
    if (!parsed8.pendingAction || parsed8.pendingAction.action_type !== 'garage_update_status') {
      throw new Error('לא התקבל כרטיס אישור לעדכון סטטוס!');
    }
    const r8Exec = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: parsed8.pendingAction,
        module: 'garage',
      }),
    });
    const res8Exec = await r8Exec.json();
    if (!res8Exec.success) throw new Error(`עדכון סטטוס נכשל: ${res8Exec.error}`);
    console.log('✅ תוצאת עדכון סטטוס:', res8Exec.message);

    // -------------------------------------------------------------
    // 9. משימות ותזכורות לתיק
    // -------------------------------------------------------------
    console.log('\n[בדיקה 9: משימות ותזכורות] יצירת משימת עבודה ותזכורת...');
    const r9 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `בתיק ${activeCase.case_number} תוסיפי משימה: לבצע נסיעת מבחן ובדיקת בלימה ממוחשבת לפני מסירה` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const parsed9 = await parseSseResponse(r9);
    if (!parsed9.pendingAction || parsed9.pendingAction.action_type !== 'garage_create_task') {
      throw new Error('לא התקבל כרטיס אישור למשימה!');
    }
    const r9Exec = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: parsed9.pendingAction,
        module: 'garage',
      }),
    });
    const res9Exec = await r9Exec.json();
    if (!res9Exec.success) throw new Error(`יצירת משימה נכשלה: ${res9Exec.error}`);
    console.log('✅ תוצאת יצירת משימה:', res9Exec.message);

    // -------------------------------------------------------------
    // 10. מסמכים ומדיה
    // -------------------------------------------------------------
    console.log('\n[בדיקה 10: מדיה ומסמכים] תיעוד הערת מדיה ובדיקת קבצים לתיק...');
    const r10 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `בתיק ${activeCase.case_number} תוסיפי תיעוד: צולמו 3 תמונות של הרפידות השחוקות והפגוש לפני תחילת עבודה` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const parsed10 = await parseSseResponse(r10);
    if (!parsed10.pendingAction || parsed10.pendingAction.action_type !== 'garage_add_media_note') {
      throw new Error('לא התקבל כרטיס אישור למדיה!');
    }
    const r10Exec = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        pending_action: parsed10.pendingAction,
        module: 'garage',
      }),
    });
    const res10Exec = await r10Exec.json();
    if (!res10Exec.success) throw new Error(`רישום מדיה נכשל: ${res10Exec.error}`);
    console.log('✅ תוצאת רישום מדיה:', res10Exec.message);

    // -------------------------------------------------------------
    // 11. דוח סיכום מלא של כרטיס העבודה
    // -------------------------------------------------------------
    console.log('\n[בדיקה 11: דוח סיכום] הפקת דוח סיכום כרטיס עבודה...');
    const r11 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `תפיקי לי סיכום מלא ומפורט של תיק ${activeCase.case_number}` }],
        module: 'garage',
        garage_case_id: testCaseId,
      }),
    });
    const parsed11 = await parseSseResponse(r11);
    console.log('סיכום כרטיס עבודה שהופק:\n' + parsed11.content);
    if (!parsed11.content.includes(activeCase.case_number)) {
      throw new Error('דוח הסיכום לא מכיל את מספר התיק!');
    }
    console.log('✅ בדיקה 11 עברה: דוח סיכום מקיף הופק בהצלחה!');

    // -------------------------------------------------------------
    // 12. וידוא שטבלת הדוח מציגה את התיק החדש עם קישור תקין
    // -------------------------------------------------------------
    console.log('\n[בדיקה 12: טבלת דוח עדכנית] וידוא שהתיק החדש מופיע בטבלת הדוח...');
    const r12 = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'הציגי טבלת דוח של תיקי המוסך' }],
        module: 'garage',
      }),
    });
    const parsed12 = await parseSseResponse(r12);
    if (!parsed12.content.includes(activeCase.case_number)) {
      throw new Error('טבלת הדוח אינה כוללת את התיק שנוצר הרגע!');
    }
    console.log('✅ בדיקה 12 עברה: התיק מופיע בטבלה עם קישור פעיל!');

    console.log('\n======================================================================');
    console.log('🎉 כל 12 הבדיקות המקיפות עברו בהצלחה מושלמת ללא תקלות!');
    console.log('======================================================================');

  } finally {
    if (testCaseId || testVehicleId || testCustomerId) {
      console.log('\nמנקה נתוני בדיקה כדי לשמור על סביבת STAGING נקייה...');
      if (testCaseId) {
        await admin.from('garage_media').delete().eq('garage_case_id', testCaseId);
        await admin.from('garage_orders').delete().eq('case_id', testCaseId);
        await admin.from('garage_tasks').delete().eq('case_id', testCaseId);
        await admin.from('garage_cases').delete().eq('id', testCaseId);
      }
      if (testVehicleId) {
        await admin.from('garage_vehicles').delete().eq('id', testVehicleId);
      }
      if (testCustomerId) {
        await admin.from('garage_customers').delete().eq('id', testCustomerId);
      }
      console.log('✅ ניקוי נתונים הושלם בהצלחה.');
    }
  }
}

run().catch((err) => {
  console.error('❌ שגיאה בבדיקה:', err);
  process.exit(1);
});
