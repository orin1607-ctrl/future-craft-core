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

  function classifyDoc(f) {
    const name = String(f.original_name || '').toLowerCase();
    const kind = String(f.doc_kind || '');
    const meta = (f.doc_meta && typeof f.doc_meta === 'object') ? f.doc_meta : {};
    const st = String(meta.staff_type || '');
    const isImg = /^image\//i.test(f.mime_type || '') || /\.(jpe?g|png|gif|webp)$/i.test(name);

    // 8. Legal reports
    if (name.includes('תדריך') || name.includes('אינדקס') || name.includes('טבלת_השוואת') || name.includes('דוח_כספי') || name.includes('רשימת_מסמכים_חסרים') || name.startsWith('01_') || name.startsWith('02_') || name.startsWith('03_') || name.startsWith('04_') || name.startsWith('05_')) {
      return 'legal_reports';
    }

    // 3. Counter surveyor
    if (name.includes('נגדית') || name.includes('אהרונסון') || meta.is_counter === true) {
      return 'counter_surveyor';
    }

    // 2. Our surveyor
    if (name.includes('ויינהאוז') || name.includes('שומת_שמאי') || name.includes('גליל גולן') || (kind === 'surveyor_report' && !name.includes('נגדית') && !name.includes('אהרונסון'))) {
      return 'our_surveyor';
    }

    // 4. Invoices
    if (st === 'garage_invoice' || st === 'fee_invoice' || name.includes('חשבון') || name.includes('חשבונית') || name.includes('קבלה') || name.includes('2503') || name.includes('1263')) {
      return 'invoices';
    }

    // 5. Payment notices
    if (st === 'payment_notice' || name.includes('תשלום') || name.includes('סילוק') || name.includes('הודעת תשלום') || name.includes('שיק') || st === 'check_photo') {
      return 'payments';
    }

    // 1. Claim details & accident forms
    if (st === 'accident_notice' || st === 'claim_form' || st === 'consent_form' || st === 'driver_license' || st === 'vehicle_license' || st === 'power_of_attorney' || name.includes('טופס הודעה') || name.includes('כתבי הסכמה') || name.includes('רישיון')) {
      return 'claim_details';
    }

    // 6. Correspondence & insurer letters
    if (st === 'rejection_letter' || st === 'demand_form' || st === 'policy' || name.includes('מכתב') || name.includes('דרישת מסמכים') || name.includes('התכתבות') || name.includes('wesure')) {
      return 'letters';
    }

    // 7. Damage photos
    if (isImg) {
      return 'damage_photos';
    }

    // 9. Other
    return 'other_docs';
  }

  const counts = {};
  docs.forEach(d => {
    const cat = classifyDoc(d);
    counts[cat] = (counts[cat] || 0) + 1;
  });

  console.log('Category distribution for DAL-2026-0008:', counts);
}
run();
