const fs = require('fs');

async function run() {
  const env = fs.readFileSync('C:/Users/אליאב/Projects/oren-car-carpart-staging/.env', 'utf8');
  const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const anonKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
  const authRes = await fetch(url + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'qa.claims.worker.1788292403067@futurecraft.staging', password: 'QaWorker2026!' })
  });
  const { access_token: token } = await authRes.json();
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };

  const res = await fetch(`${url}/rest/v1/claims_documents?claim_id=eq.DAL-2026-0008&select=id,original_name,mime_type,byte_size,doc_kind,doc_meta`, { headers });
  const docs = await res.json();
  console.log(`Found ${docs.length} docs for DAL-2026-0008:`);
  docs.forEach(d => {
    console.log(`- ${d.id} | ${d.original_name} | ${d.mime_type} | ${d.byte_size} bytes | kind: ${d.doc_kind} | meta: ${JSON.stringify(d.doc_meta)}`);
  });
}
run();
