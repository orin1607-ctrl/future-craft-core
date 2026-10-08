import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
const sb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey);

const { data: sess, error: loginErr } = await sb.auth.signInWithPassword({
  email: 'qa.claims.worker.1788292403067@futurecraft.staging',
  password: 'QaWorker2026!'
});

if (loginErr || !sess?.session) {
  console.error('Login failed:', loginErr);
  process.exit(1);
}

const token = sess.session.access_token;

// 1. Check outbox records
const { data: outbox } = await sb.from('claims_gmail_outbox')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(5);

console.log('--- Outbox Records ---');
for (const row of outbox || []) {
  console.log({
    id: row.id,
    to: row.to_addr,
    subject: row.subject,
    status: row.status,
    gmail_message_id: row.gmail_message_id,
    sent_at: row.sent_at
  });
}

// 2. Query Gmail API via claims-gmail list_messages to check inbox / mailbox
const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    action: 'list_messages',
    claim_id: 'DAL-QA-WORKER-001',
    q: 'yoni122222'
  })
});

console.log('\n--- Gmail Mailbox Query ---');
console.log('HTTP Status:', res.status);
const listData = await res.json();
console.log('Messages Found:', listData.messages?.length);
for (const m of listData.messages || []) {
  console.log({
    id: m.id,
    from: m.from,
    subject: m.subject,
    date: m.date,
    snippet: m.snippet
  });
}
