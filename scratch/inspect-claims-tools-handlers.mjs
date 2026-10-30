import fs from 'fs';
const content = fs.readFileSync('supabase/functions/help-ai-chat/claimsTools.ts', 'utf8');
const lines = content.split('\n');
const searchIdx = lines.findIndex(l => l.includes('case "search_claim_emails":'));
console.log('searchIdx:', searchIdx);
console.log(lines.slice(searchIdx, searchIdx + 45).join('\n'));

const latestIdx = lines.findIndex(l => l.includes('case "get_latest_claim_email":'));
console.log('latestIdx:', latestIdx);
console.log(lines.slice(latestIdx, latestIdx + 65).join('\n'));
