import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';

const envFile = readFileSync('.env', 'utf8');
const anonKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

function formatIsraelTime(isoStr) {
  if (!isoStr) return 'לא צוין';
  const d = new Date(isoStr);
  return d.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

async function run() {
  await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });

  console.log('========================================================================');
  console.log('=== EXACT FACTUAL AUDIT: LATEST EMAILS BY REAL DATE AND TIME ===');
  console.log('========================================================================');

  // 1. GENERAL CHAT — LATEST INBOUND IN ENTIRE MAILBOX
  console.log('\n[1] CHAT CLOUD / GENERAL: LATEST INBOUND EMAIL ACROSS ENTIRE MAILBOX:');
  const { data: globalInbound } = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, from_addr, to_addr, subject, body_text, sent_at, attachment_count, gmail_message_id')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (globalInbound) {
    const { data: claimRec } = await userDb.from('claims_records').select('id, client_name, plate, status').eq('id', globalInbound.claim_id).maybeSingle();
    console.log(` - תאריך ושעה (ישראל): ${formatIsraelTime(globalInbound.sent_at)} (${globalInbound.sent_at})`);
    console.log(` - שולח: ${globalInbound.from_addr}`);
    console.log(` - נמען: ${globalInbound.to_addr}`);
    console.log(` - נושא: "${globalInbound.subject}"`);
    console.log(` - מספר תיק מקושר: ${globalInbound.claim_id} (${claimRec?.client_name || 'לא ידוע'})`);
    console.log(` - מספר רכב בתיק: ${claimRec?.plate || 'לא ידוע'}`);
    console.log(` - כמות קבצים מצורפים: ${globalInbound.attachment_count || 0}`);
    console.log(` - מזהה הודעה: ${globalInbound.gmail_message_id}`);
    console.log(` - תחילת תוכן ההודעה: "${(globalInbound.body_text || '').replace(/\s+/g, ' ').slice(0, 200)}..."`);
  }

  // 2. GENERAL CHAT — LATEST PENDING EMAIL (SCANNED BUT NOT YET IMPORTED/UNASSIGNED)
  console.log('\n[2] CHAT CLOUD / GENERAL: LATEST PENDING EMAIL IN SCAN QUEUE:');
  const { data: latestPending } = await userDb
    .from('claims_gmail_pending')
    .select('id, gmail_message_id, from_addr, subject, snippet, sent_at, decision, assigned_claim_id')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestPending) {
    console.log(` - תאריך ושעה (ישראל): ${formatIsraelTime(latestPending.sent_at)} (${latestPending.sent_at})`);
    console.log(` - שולח: ${latestPending.from_addr}`);
    console.log(` - נושא: "${latestPending.subject}"`);
    console.log(` - שיוך לתיק: ${latestPending.assigned_claim_id || 'ללא שיוך (הודעה כללית / פרסומת / ממתינה לבדיקה)'}`);
    console.log(` - החלטת שיוך: ${latestPending.decision}`);
    console.log(` - תקציר תוכן: "${latestPending.snippet}"`);
  }

  // 3. INSIDE CLAIM CARD — DAL-2026-0008 (Flora Cohen / Elimelech David, Plate 11874-503)
  console.log('\n[3] INSIDE CLAIM CARD: DAL-2026-0008 (פלורה כהן / אלימלך דוד):');
  const { data: floraLatestInbound } = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, from_addr, to_addr, subject, body_text, sent_at, attachment_count, gmail_message_id')
    .eq('claim_id', 'DAL-2026-0008')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (floraLatestInbound) {
    console.log(` - מייל נכנס אחרון בתיק פלורה כהן:`);
    console.log(`   * תאריך ושעה (ישראל): ${formatIsraelTime(floraLatestInbound.sent_at)} (${floraLatestInbound.sent_at})`);
    console.log(`   * שולח (מבטחת): ${floraLatestInbound.from_addr}`);
    console.log(`   * נמען: ${floraLatestInbound.to_addr}`);
    console.log(`   * נושא: "${floraLatestInbound.subject}"`);
    console.log(`   * קבצים: ${floraLatestInbound.attachment_count || 0}`);
    console.log(`   * תוכן: "${(floraLatestInbound.body_text || '').replace(/\s+/g, ' ').slice(0, 150)}..."`);
  }

  const { data: floraLatestOutbound } = await userDb
    .from('claims_gmail_outbox')
    .select('id, claim_id, to_addr, subject, body_excerpt, sent_at, status')
    .eq('claim_id', 'DAL-2026-0008')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (floraLatestOutbound) {
    console.log(` - מייל יוצא אחרון בתיק פלורה כהן:`);
    console.log(`   * תאריך ושעה (ישראל): ${formatIsraelTime(floraLatestOutbound.sent_at)} (${floraLatestOutbound.sent_at})`);
    console.log(`   * נמען: ${floraLatestOutbound.to_addr}`);
    console.log(`   * נושא: "${floraLatestOutbound.subject}"`);
    console.log(`   * סטטוס: ${floraLatestOutbound.status}`);
  }

  // 4. CHECK COMPARISON: DID INSURER REPLY AFTER WE SENT?
  if (floraLatestInbound && floraLatestOutbound) {
    const inTime = new Date(floraLatestInbound.sent_at).getTime();
    const outTime = new Date(floraLatestOutbound.sent_at).getTime();
    console.log(` - בדיקת מענה: האם התקבלה תשובה לאחר המייל ששלחנו?`);
    console.log(`   * חותמת זמן נכנסת: ${inTime}`);
    console.log(`   * חותמת זמן יוצאת: ${outTime}`);
    if (inTime > outTime) {
      console.log(`   * תוצאה: כן! המייל הנכנס מ-${floraLatestInbound.from_addr} התקבל לאחר המייל היוצא.`);
    } else {
      console.log(`   * תוצאה: המייל היוצא הוא האחרון. טרם תועד מענה מאוחר יותר.`);
    }
  }
}

run();
