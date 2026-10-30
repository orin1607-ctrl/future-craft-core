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

  console.log('--- Testing Current Buggy Logic (limit 15 first, then JS filter) ---');
  const { data: imp1 } = await userDb
    .from('claims_gmail_imports')
    .select('id, subject, sent_at')
    .order('sent_at', { ascending: false })
    .limit(15);
  
  const inMemoryFiltered = (imp1 || []).filter(m => /פלורה|11874/i.test(m.subject));
  console.log(`Current logic returned: ${inMemoryFiltered.length} emails matching "פלורה / 11874"`);

  console.log('\n--- Testing Corrected Logic (SQL-level search across all 458 records) ---');
  const { data: imp2 } = await userDb
    .from('claims_gmail_imports')
    .select('id, subject, sent_at')
    .or('subject.ilike.%פלורה%,subject.ilike.%11874%,body_text.ilike.%פלורה%,body_text.ilike.%11874%')
    .order('sent_at', { ascending: false })
    .limit(15);

  console.log(`Corrected SQL logic returned: ${imp2?.length} emails matching "פלורה / 11874"`);
  if (imp2 && imp2.length) {
    console.log('Sample found emails:');
    imp2.slice(0, 3).forEach(m => console.log(` - [${m.sent_at}] ${m.subject}`));
  }
}

run();
