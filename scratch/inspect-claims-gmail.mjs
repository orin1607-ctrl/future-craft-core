import fs from 'fs';
const content = fs.readFileSync('supabase/functions/claims-gmail/index.ts', 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);

console.log('--- Actions found ---');
lines.forEach((l, i) => {
  if (l.includes('action ===') || l.includes('action =') || l.includes('case ')) {
    console.log((i+1) + ': ' + l.trim());
  }
});
