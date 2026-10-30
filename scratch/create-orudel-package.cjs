const fs = require('fs');

async function main() {
  const env = fs.readFileSync('C:/Users/אליאב/Projects/oren-car-carpart-staging/.env', 'utf8');
  const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const anonKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

  // Auth worker
  const authRes = await fetch(url + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'qa.claims.worker.1788292403067@futurecraft.staging', password: 'QaWorker2026!' })
  });
  const { access_token: token } = await authRes.json();

  const claimId = 'DAL-2026-0008';

  // The 19 verified files mapped across the 9 categories
  const fileIds = [
    'CDM-1793299653068-QN069P', // 01 דוח תדריך משפטי מקיף
    'CDM-1793299656325-CZKOGY', // 02 אינדקס מסמכים ונספחים
    'CDM-1793299660094-LA0DJ8', // 03 טבלת השוואת שומות
    'CDM-1793299662711-8VG6XB', // 04 דוח כספי תשלומים וקיזוזים
    'CDM-1793299665369-X3I8CO', // 05 רשימת נושאים לבדיקת עו"ד
    'CDM-1793299667987-L8YLBO', // שומת שמאי התובע ליונל ויינהאוז
    'CDM-1788206467599-6ACQ95', // שומת שמאי נגדי אלי אהרונסון
    'CDM-1788206556054-B2IDNC', // חשבון שכ"ט שמאי 1263
    'CDM-1788206557371-E58AWM', // חשבונית מוסך יוני מרכז הפגושים 2503
    'CDM-1788206465383-S1XMLH', // הודעת תשלום וסילוק WeSure
    'CDM-1788206562210-PL43LZ', // מכתב דרישת מסמכים והתכתבות WeSure
    'CDM-1788206564836-AI0H4U', // טופס הודעה על תאונת רכב חתום
    'CDM-1793299681359-NVZR9X', // כתבי הסכמה למסירת מידע ורישיון
    'CDM-1788206651894-L4G99D', // תמונת נזק מוקד אחורי (1)
    'CDM-1788206652487-X2X4W0', // תמונת נזק מוקד אחורי (2)
    'CDM-1788206585806-WXRK8A', // צילום רכב במוסך - תא מטען ושלדה (1)
    'CDM-1788206585046-C77EXC', // צילום רכב במוסך - תא מטען ושלדה (2)
    'CDM-1788206584286-SDTIWO', // צילום רכב במוסך - כנף ודופן
    'CDM-1788206586696-9F3LQE'  // צילום רכב במוסך - פירוק ומדידות
  ];

  const shareRes = await fetch(url + '/functions/v1/claims-docs', {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'create_share',
      claim_id: claimId,
      recipient_name: 'אורודל',
      recipient_kind: 'lawyer',
      recipient_kind_note: 'חבילת מסמכים משפטית מלאה לתביעה DAL-2026-0008 (פלורה כהן / אלימלך דוד)',
      recipient_email: 'urodel@example.com', // staging test placeholder or leave to be confirmed
      file_ids: fileIds,
      ttl_hours: 168 // 7 days
    })
  });

  const result = await shareRes.json();
  console.log('Created Share for Orudel result:', result);

  if (result.success && result.token) {
    const publicUrl = `https://oren-car-carpart-staging.vercel.app/claims-share/?t=${result.token}`;
    console.log('Public URL for Orudel:', publicUrl);
  }
}

main().catch(console.error);
