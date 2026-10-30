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

  const res = await fetch(`${url}/rest/v1/claims_documents?claim_id=eq.DAL-2026-0008&select=id,original_name,mime_type,doc_meta`, { headers });
  const docs = await res.json();

  const others = docs.filter(d => {
    const name = String(d.original_name || '').toLowerCase();
    const isImg = /^image\//i.test(d.mime_type || '') || /\.(jpe?g|png|gif|webp)$/i.test(name);
    return !isImg && !name.includes('תדריך') && !name.includes('אינדקס') && !name.includes('טבלת_השוואת') && !name.includes('דוח_כספי') && !name.includes('רשימת_מסמכים_חסרים') && !name.includes('נגדית') && !name.includes('אהרונסון') && !name.includes('ויינהאוז') && !name.includes('שומת_שמאי') && !name.includes('תשלום') && !name.includes('טופס') && !name.includes('כתבי הסכמה');
  });

  console.log('Other docs details:', others.map(o => ({ id: o.id, name: o.original_name, meta: o.doc_meta })));
}
run();
