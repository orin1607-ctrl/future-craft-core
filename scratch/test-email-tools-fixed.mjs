import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';

const envFile = readFileSync('.env', 'utf8');
const anonKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });

  console.log('====================================================');
  console.log('=== VERIFYING FIXED EMAIL RETRIEVAL LOGIC IN SQL ===');
  console.log('====================================================');

  // 1. Mailbox-wide latest inbound
  console.log('\n[1] Mailbox-wide latest inbound email:');
  const { data: q1 } = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, from_addr, to_addr, subject, sent_at')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log('Found:', q1 ? `[${q1.sent_at}] ${q1.from_addr} | Subject: "${q1.subject}" | Claim: ${q1.claim_id}` : 'none');

  // 2. Specific claim DAL-2026-0008 latest inbound
  console.log('\n[2] Flora Cohen DAL-2026-0008 latest inbound email:');
  const { data: q2 } = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, from_addr, to_addr, subject, sent_at')
    .eq('claim_id', 'DAL-2026-0008')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log('Found:', q2 ? `[${q2.sent_at}] ${q2.from_addr} | Subject: "${q2.subject}"` : 'none');

  // 3. Specific insurer filter (e.g. Phoenix)
  console.log('\n[3] Latest inbound email for insurer "פניקס / fnx":');
  const { data: q3 } = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, from_addr, subject, sent_at')
    .or('from_addr.ilike.%fnx%,from_addr.ilike.%פניקס%,subject.ilike.%פניקס%')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log('Found:', q3 ? `[${q3.sent_at}] ${q3.from_addr} | Subject: "${q3.subject}" | Claim: ${q3.claim_id}` : 'none');

  // 4. SQL-pushed search for "פלורה"
  console.log('\n[4] Search for "פלורה" with SQL-level pushdown:');
  const { data: q4 } = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, from_addr, subject, sent_at')
    .or('subject.ilike.%פלורה%,body_text.ilike.%פלורה%,from_addr.ilike.%פלורה%')
    .order('sent_at', { ascending: false })
    .limit(10);
  console.log(`Found: ${q4?.length} emails!`);
  q4?.slice(0, 3).forEach(m => console.log(` - [${m.sent_at}] ${m.subject} (Claim: ${m.claim_id})`));

  // 5. Check pending email matching
  console.log('\n[5] Pending emails in queue:');
  const { count: pendCount } = await userDb.from('claims_gmail_pending').select('*', { count: 'exact', head: true });
  console.log('Total pending emails:', pendCount);
}

run();
