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
const claimId = 'DAL-QA-WORKER-001';

async function ask(prompt, inClaim = true) {
  const body = {
    messages: [{ role: 'user', content: prompt }]
  };
  if (inClaim) {
    body.claim_id = claimId;
    body.module = 'claims';
  } else {
    body.module = 'claims';
  }

  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/help-ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const raw = await res.text();
  let text = '';
  let pendingAction = null;

  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      const dataStr = line.slice(6).trim();
      if (dataStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.choices?.[0]?.delta?.content) {
          text += parsed.choices[0].delta.content;
        }
        if (parsed.pending_action) {
          pendingAction = parsed.pending_action;
        }
      } catch {}
    }
  }

  return { status: res.status, text: text.trim(), pendingAction };
}

const tests = [
  { name: 'Open Claim: תראה לי את המסמכים והתמונות בתיק', prompt: 'תראה לי את המסמכים והתמונות בתיק', inClaim: true },
  { name: 'Open Claim: מי טיפל בתיק ומה היסטוריית הפעולות?', prompt: 'מי טיפל בתיק הזה ומה בוצע בו לאחרונה?', inClaim: true },
  { name: 'Open Claim: מה חסר בתיק?', prompt: 'מה חסר בתיק הזה לפי הדרישות?', inClaim: true },
  { name: 'Open Claim: מה הפעולה הבאה בתיק?', prompt: 'מה הפעולה הבאה שצריך לבצע בתיק?', inClaim: true },
  { name: 'Open Claim: תכין משימה לבדוק שמאות', prompt: 'תכין משימה בתיק: לבדוק שמאות מול השמאי', inClaim: true },
  { name: 'General Claims: כמה משימות פתוחות יש בכל המערכת?', prompt: 'כמה משימות פתוחות יש בסך הכל בכלל התיקים במערכת?', inClaim: false },
  { name: 'General Claims: סכם לי את הפעילות של היום', prompt: 'סכם לי את כל הפעילות שהתרחשה היום בניהול תביעות', inClaim: false },
];

console.log('--- Starting Comprehensive Claims AI Suite ---');

for (const t of tests) {
  process.stdout.write(`Testing: ${t.name}... `);
  const start = Date.now();
  const res = await ask(t.prompt, t.inClaim);
  const dur = ((Date.now() - start) / 1000).toFixed(1);
  if (res.status === 200 && res.text) {
    console.log(`✅ OK (${dur}s)`);
    console.log(`   Snippet: ${res.text.slice(0, 120).replace(/\n/g, ' ')}...`);
    if (res.pendingAction) {
      console.log(`   Preview Card Generated: ${res.pendingAction.summary} [${res.pendingAction.action_type}]`);
    }
  } else {
    console.log(`❌ FAIL (status ${res.status}):`, res.text || 'No text');
  }
  console.log('');
}
