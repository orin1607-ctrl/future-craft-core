import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const anonKey = keys.find((k) => k.name === 'anon')?.api_key;

const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { persistSession: false } });

async function main() {
  const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({
    email: 'qa.claims.worker.1788292403067@futurecraft.staging',
    password: 'QaWorker2026!',
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }

  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${auth.session.access_token}`,
    },
    body: JSON.stringify({ action: 'status', probe: false }),
  });

  const json = await res.json();
  console.log('STATUS_RESPONSE:', JSON.stringify(json, null, 2));
}

main().catch(console.error);
