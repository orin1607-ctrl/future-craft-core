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

  const res = await fetch(`${url}/rest/v1/claims_share_links?limit=2`, { headers });
  const rows = await res.json();
  console.log('Sample claims_share_links rows:', rows);
}
run();
