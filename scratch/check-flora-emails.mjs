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

  const { data: record } = await userDb
    .from('claims_records')
    .select('id, claim_number, client_name, customer_name, vehicle_plate, insurer_name, status, email, phone, last_activity_at')
    .eq('id', 'DAL-2026-0008')
    .maybeSingle();

  console.log('Record DAL-2026-0008:', record);

  // Check all emails in claims_gmail_imports matching DAL-2026-0008 or vehicle 11874-503 or 11874503
  const { data: impMatch } = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, from_addr, to_addr, subject, sent_at')
    .or('claim_id.eq.DAL-2026-0008,subject.ilike.%11874503%,subject.ilike.%11-874-503%,subject.ilike.%11874-503%,subject.ilike.%פלורה%,subject.ilike.%אלימלך%');
  console.log('Matching imports for DAL-2026-0008 / 11874-503:', impMatch);

  // Check pending matching 11874503 or DAL-2026-0008
  const { data: pendMatch } = await userDb
    .from('claims_gmail_pending')
    .select('id, from_addr, subject, sent_at, decision, assigned_claim_id')
    .or('assigned_claim_id.eq.DAL-2026-0008,subject.ilike.%11874503%,subject.ilike.%11874-503%,subject.ilike.%פלורה%');
  console.log('Matching pending for DAL-2026-0008 / 11874-503:', pendMatch);
}

run();
