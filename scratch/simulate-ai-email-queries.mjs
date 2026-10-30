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

  console.log('================================================================');
  console.log('=== SIMULATING CURRENT get_latest_claim_email TOOL EXECUTION ===');
  console.log('================================================================');

  // Scenario 1: claimId = null (User in general chat asks "מה האימייל האחרון שהתקבל?")
  console.log('\n--- Scenario 1: claimId = null (General Chat) ---');
  let query1 = userDb
    .from('claims_gmail_imports')
    .select('id, gmail_message_id, from_addr, to_addr, subject, sent_at')
    .eq('claim_id', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const res1 = await query1;
  console.log('Result with current code (claim_id = null):', res1.data);
  console.log('=> CURRENT CODE FAILS TO RETURN LATEST MAILBOX EMAIL! Returns null.');

  // What SHOULD happen for mailbox-wide latest email:
  console.log('\n--- Scenario 1 (FIXED): Mailbox-wide query when claimId is null ---');
  const fixedMailboxQuery = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, from_addr, to_addr, subject, sent_at')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log('Real latest inbound email in whole mailbox:');
  console.log(fixedMailboxQuery.data);

  // Scenario 2: Inside Flora Cohen claim DAL-2026-0008
  console.log('\n--- Scenario 2: claimId = "DAL-2026-0008" ---');
  const res2 = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, from_addr, to_addr, subject, sent_at')
    .eq('claim_id', 'DAL-2026-0008')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log('Latest email in DAL-2026-0008:', res2.data);

  // Scenario 3: User asks for "הפניקס" (search_claim_emails with query="הפניקס")
  console.log('\n--- Scenario 3: search_claim_emails for insurer "הפניקס" ---');
  // Current logic: limit 15 first
  const { data: current15 } = await userDb
    .from('claims_gmail_imports')
    .select('id, from_addr, subject, sent_at')
    .order('sent_at', { ascending: false })
    .limit(15);
  const currentFiltered = (current15 || []).filter(m => (m.from_addr + ' ' + m.subject).includes('פניקס') || (m.from_addr + ' ' + m.subject).includes('fnx'));
  console.log(`Current logic (limit 15 first) found: ${currentFiltered.length} Phoenix emails.`);

  // Corrected logic: SQL-level search
  const { data: sqlFiltered } = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, from_addr, subject, sent_at')
    .or('from_addr.ilike.%fnx%,from_addr.ilike.%פניקס%,subject.ilike.%פניקס%,subject.ilike.%fnx%')
    .order('sent_at', { ascending: false })
    .limit(5);
  console.log(`Corrected SQL logic found: ${sqlFiltered?.length} Phoenix emails. Latest:`, sqlFiltered?.[0]);
}

run();
