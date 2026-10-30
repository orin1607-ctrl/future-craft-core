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

  const { data, error } = await userDb
    .from('claims_records')
    .select('*')
    .limit(3);

  if (error) {
    console.error('claims_records error:', error);
  } else if (data && data.length) {
    console.log('Columns in claims_records:', Object.keys(data[0]));
    console.log('Sample record 0:', { id: data[0].id, claim_id: data[0].claim_id, claim_number: data[0].claim_number });
  } else {
    console.log('claims_records is empty');
  }

  // Search for 0008
  const { data: recs } = await userDb
    .from('claims_records')
    .select('*')
    .or('id.ilike.%0008%,claim_number.ilike.%0008%,customer_name.ilike.%פלורה%');
  console.log('Search for 0008/Flora in claims_records:', recs);
}

run();
