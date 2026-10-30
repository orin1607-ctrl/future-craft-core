import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';

const envFile = readFileSync('.env', 'utf8');
const anonKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  console.log('Authenticating worker on STAGING Supabase...');
  const { data: authData, error: authError } = await userDb.auth.signInWithPassword({
    email: WORKER_EMAIL,
    password: WORKER_PASSWORD
  });
  if (authError || !authData.session) {
    throw new Error('Worker auth failed: ' + authError?.message);
  }
  console.log('Worker authenticated successfully. User ID:', authData.session.user.id);

  // 1. Check claims_gmail_imports
  console.log('\n--- 1. Querying claims_gmail_imports ---');
  const { data: imports, error: impErr, count: impCount } = await userDb
    .from('claims_gmail_imports')
    .select('id, claim_id, gmail_message_id, from_addr, to_addr, subject, sent_at, attachment_count', { count: 'exact' })
    .order('sent_at', { ascending: false })
    .limit(10);
  console.log('Total imports count:', impCount, 'Error:', impErr?.message || 'none');
  if (imports && imports.length) {
    console.log('Sample recent imports:');
    imports.forEach(i => console.log(` [${i.sent_at}] ${i.from_addr} -> ${i.to_addr} | Subject: "${i.subject}" | Claim: ${i.claim_id}`));
  }

  // 2. Check claims_gmail_outbox
  console.log('\n--- 2. Querying claims_gmail_outbox ---');
  const { data: outbox, error: outErr, count: outCount } = await userDb
    .from('claims_gmail_outbox')
    .select('id, claim_id, gmail_message_id, to_addr, subject, sent_at, status', { count: 'exact' })
    .order('sent_at', { ascending: false })
    .limit(10);
  console.log('Total outbox count:', outCount, 'Error:', outErr?.message || 'none');
  if (outbox && outbox.length) {
    console.log('Sample recent outbox:');
    outbox.forEach(o => console.log(` [${o.sent_at}] To: ${o.to_addr} | Subject: "${o.subject}" | Status: ${o.status} | Claim: ${o.claim_id}`));
  }

  // 3. Check claims_gmail_pending
  console.log('\n--- 3. Querying claims_gmail_pending ---');
  const { data: pending, error: pendErr, count: pendCount } = await userDb
    .from('claims_gmail_pending')
    .select('id, gmail_message_id, from_addr, subject, snippet, sent_at, decision, reason, assigned_claim_id', { count: 'exact' })
    .order('sent_at', { ascending: false })
    .limit(10);
  console.log('Total pending count:', pendCount, 'Error:', pendErr?.message || 'none');
  if (pending && pending.length) {
    console.log('Sample recent pending:');
    pending.forEach(p => console.log(` [${p.sent_at}] From: ${p.from_addr} | Subject: "${p.subject}" | Assigned: ${p.assigned_claim_id} | Decision: ${p.decision}`));
  }

  // 4. Check sync state tables or metadata
  console.log('\n--- 4. Checking sync tables ---');
  const syncTableNames = [
    'claims_gmail_sync',
    'claims_gmail_sync_state',
    'claims_gmail_tokens',
    'gmail_sync_state',
    'claims_gmail_auth',
    'claims_gmail_config'
  ];
  for (const t of syncTableNames) {
    const { data, error } = await userDb.from(t).select('*').limit(3);
    if (!error) {
      console.log(`Table '${t}' exists! Found ${data?.length} rows:`, data);
    } else {
      console.log(`Table '${t}': ${error.code} - ${error.message}`);
    }
  }

  // 5. Check claims-gmail edge function status
  console.log('\n--- 5. Invoking claims-gmail edge function ---');
  try {
    const { data: fnData, error: fnErr } = await userDb.functions.invoke('claims-gmail', {
      body: { action: 'status' }
    });
    console.log('claims-gmail status response:', fnData, 'Error:', fnErr?.message || 'none');
  } catch(e) {
    console.log('claims-gmail invocation threw:', e.message);
  }

  // 6. Check Flora Cohen claim DAL-2026-0008
  console.log('\n--- 6. Checking Flora Cohen claim DAL-2026-0008 ---');
  const { data: claim, error: clErr } = await userDb
    .from('claims')
    .select('id, claim_number, client_name, customer_name, vehicle_plate, insurer_name, status')
    .or('id.eq.DAL-2026-0008,claim_number.eq.DAL-2026-0008')
    .maybeSingle();
  console.log('Claim DAL-2026-0008:', claim, 'Error:', clErr?.message || 'none');

  // Check emails specifically for this claim
  if (claim) {
    const { data: clImports } = await userDb.from('claims_gmail_imports').select('*').eq('claim_id', claim.id);
    const { data: clOutbox } = await userDb.from('claims_gmail_outbox').select('*').eq('claim_id', claim.id);
    console.log(`Emails for ${claim.id}: Imports=${clImports?.length || 0}, Outbox=${clOutbox?.length || 0}`);
  }
}

run().catch(e => {
  console.error('Script failed:', e);
  process.exit(1);
});
