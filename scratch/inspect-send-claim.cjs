const fs = require('fs');
const text = fs.readFileSync('supabase/functions/claims-gmail/index.ts', 'utf8');

const idx = text.indexOf('action === "send_claim"');
console.log(text.substring(idx + 3500, idx + 7000));
